"""Auth Drift Resolution pairing service (CSAHP3, 2026-05-02).

Pure read-side analytics over the audit trail emitted by CSAHP1
(:mod:`app.workers.channel_auth_health_probe_worker` — #417) and CSAHP2
(:mod:`app.routers.channel_auth_drift_resolution_router` — #422).

For each ``channel_auth_health_probe.auth_drift_detected`` row in the
look-back window the service:

1. Finds the matching ``auth_drift_marked_rotated`` row for the same
   ``(clinic_id, channel)`` whose ``created_at`` is strictly greater than
   the drift's ``created_at`` AND with no other ``auth_drift_detected``
   row for that ``(clinic_id, channel)`` in between (the rotation pairs
   with the most recent UN-rotated drift, not an older one).
2. For each rotation, finds the matching
   ``auth_drift_resolved_confirmed`` row whose note carries
   ``mark_rotated_event_id={...}`` referencing the rotation event id.
3. For each confirmed rotation, looks for the NEXT
   ``auth_drift_detected`` row for the same ``(clinic_id, channel)``
   within 30 days of the confirmation. A re-flag inside that window
   indicates credential storage / policy regression — the leading
   indicator of CSAHP1's blast-radius.

Each ``DriftRecord`` flattens the chain so the router can compute
funnel counts, per-channel medians, and per-rotator medians without
re-walking the audit table.

Pure functions; no DB writes; no schema change. Mirrors the DCRO1
:mod:`resolution_outcome_pairing` pattern.
"""
from __future__ import annotations

import statistics
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.persistence.models import AuditEventRecord


# Canonical action strings — pinned so the worker, the CSAHP2 router,
# the audit-hub router, and this service all reference the same
# strings. The CSAHP1 worker surface is the audit ``target_type`` used
# by the worker for every emission tied to a (clinic, channel).
WORKER_SURFACE = "channel_auth_health_probe"
DRIFT_DETECTED_ACTION = f"{WORKER_SURFACE}.auth_drift_detected"
MARKED_ROTATED_ACTION = f"{WORKER_SURFACE}.auth_drift_marked_rotated"
RESOLVED_CONFIRMED_ACTION = f"{WORKER_SURFACE}.auth_drift_resolved_confirmed"


# Allowed rotation method codes — must mirror
# ``ALLOWED_ROTATION_METHODS`` in
# :mod:`app.routers.channel_auth_drift_resolution_router` so the hub
# never displays a method the CSAHP2 router would reject. Using a tuple
# (not a frozenset) so the canonical iteration order in distributions is
# stable.
ALLOWED_ROTATION_METHODS: tuple[str, ...] = (
    "manual",
    "automated_rotation",
    "key_revoked",
)


# Default look-back / pairing windows.
DEFAULT_WINDOW_DAYS = 90
RE_FLAG_WINDOW_DAYS = 30
MIN_WINDOW_DAYS = 1
MAX_WINDOW_DAYS = 365


@dataclass
class DriftRecord:
    """One drift → rotation → confirmation → re-flag chain.

    ``rotated_at`` / ``confirmed_at`` / ``re_flagged_within_30d`` may be
    ``None`` when the chain has not progressed past the corresponding
    funnel step. ``re_flag_days`` is set only when
    ``re_flagged_within_30d`` is true.
    """

    drift_audit_id: int
    drift_event_id: str
    channel: str
    error_class: str
    detected_at: datetime
    marked_event_id: Optional[str] = None
    marked_at: Optional[datetime] = None
    confirmed_event_id: Optional[str] = None
    confirmed_at: Optional[datetime] = None
    rotated_by_user_id: Optional[str] = None
    rotation_method: Optional[str] = None
    re_flagged_within_30d: bool = False
    re_flag_days: Optional[float] = None
    re_flag_event_id: Optional[str] = None


@dataclass
class RotatorMetric:
    """Per-rotator aggregate."""

    rotator_user_id: str
    rotations: int
    confirmed_rotations: int
    re_flagged_within_30d: int
    median_time_to_rotate_hours: Optional[float]
    last_rotation_at: Optional[datetime] = None


@dataclass
class ChannelMetric:
    """Per-channel aggregate."""

    channel: str
    drifts: int = 0
    rotated: int = 0
    confirmed: int = 0
    re_flagged_within_30d: int = 0
    time_to_rotate_hours: list[float] = field(default_factory=list)
    time_to_confirm_hours: list[float] = field(default_factory=list)


# ── Helpers ─────────────────────────────────────────────────────────────────


def _coerce_dt(iso: Optional[str]) -> Optional[datetime]:
    """SQLite roundtrips strip tzinfo; coerce to tz-aware UTC."""
    if not iso:
        return None
    try:
        dt = datetime.fromisoformat(iso)
    except Exception:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def _parse_token(note: str, key: str) -> Optional[str]:
    """Return the first ``key=value`` token from ``note``.

    Worker emissions use space-delimited ``key=value`` tokens with the
    trailing ``error_message`` field permitted to contain spaces. We
    only need leading tokens here, so a single-pass split is safe.
    Self-rows from CSAHP2 use ``;``-delimited tokens — handle both.
    """
    if not note:
        return None
    needle = f"{key}="
    for tok in note.split():
        if tok.startswith(needle):
            return tok.split("=", 1)[1].rstrip(";")
    for part in note.split(";"):
        p = part.strip()
        if p.startswith(needle):
            return p.split("=", 1)[1].strip()
    return None


def _normalize_window(window_days: int) -> int:
    if window_days is None:
        return DEFAULT_WINDOW_DAYS
    try:
        w = int(window_days)
    except Exception:
        return DEFAULT_WINDOW_DAYS
    if w < MIN_WINDOW_DAYS:
        return MIN_WINDOW_DAYS
    if w > MAX_WINDOW_DAYS:
        return MAX_WINDOW_DAYS
    return w


# ── Pairing core ────────────────────────────────────────────────────────────


def pair_drifts_with_resolutions(
    db: Session,
    clinic_id: str | int,
    window_days: int = DEFAULT_WINDOW_DAYS,
) -> list[DriftRecord]:
    """Return one ``DriftRecord`` per ``auth_drift_detected`` row.

    Cross-clinic safety: every audit row is filtered by the
    ``clinic_id={cid}`` substring needle in the row's ``note``. A
    clinician in clinic A never sees rows from clinic B even when both
    clinics happened to share a channel.
    """
    cid = str(clinic_id) if clinic_id is not None else ""
    if not cid:
        return []

    w = _normalize_window(window_days)
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=w)
    cid_needle = f"clinic_id={cid}"

    # Pull the three action streams in one go each — much cheaper than
    # per-row joins. We pull a slightly wider window for marks/confirms
    # so a drift detected at the cutoff edge can still pair with a
    # rotation/confirmation that landed slightly before the next tick.
    mark_lookback = now - timedelta(days=w + 31)
    drift_rows = (
        db.query(AuditEventRecord)
        .filter(
            AuditEventRecord.target_type == WORKER_SURFACE,
            AuditEventRecord.action == DRIFT_DETECTED_ACTION,
            AuditEventRecord.created_at >= cutoff.isoformat(),
        )
        .order_by(AuditEventRecord.created_at.asc())
        .all()
    )
    drift_rows = [r for r in drift_rows if cid_needle in (r.note or "")]
    if not drift_rows:
        return []

    mark_rows = (
        db.query(AuditEventRecord)
        .filter(
            AuditEventRecord.target_type == WORKER_SURFACE,
            AuditEventRecord.action == MARKED_ROTATED_ACTION,
            AuditEventRecord.created_at >= mark_lookback.isoformat(),
        )
        .order_by(AuditEventRecord.created_at.asc())
        .all()
    )
    mark_rows = [r for r in mark_rows if cid_needle in (r.note or "")]

    confirm_rows = (
        db.query(AuditEventRecord)
        .filter(
            AuditEventRecord.target_type == WORKER_SURFACE,
            AuditEventRecord.action == RESOLVED_CONFIRMED_ACTION,
            AuditEventRecord.created_at >= mark_lookback.isoformat(),
        )
        .order_by(AuditEventRecord.created_at.asc())
        .all()
    )
    confirm_rows = [r for r in confirm_rows if cid_needle in (r.note or "")]

    # Bucket marks + confirms by channel for quick lookup.
    marks_by_channel: dict[str, list[AuditEventRecord]] = {}
    for m in mark_rows:
        ch = (_parse_token(m.note or "", "channel") or "").strip().lower()
        if not ch:
            continue
        marks_by_channel.setdefault(ch, []).append(m)

    confirms_by_mark_event: dict[str, AuditEventRecord] = {}
    for c in confirm_rows:
        src = _parse_token(c.note or "", "mark_rotated_event_id")
        if src and src not in confirms_by_mark_event:
            confirms_by_mark_event[src] = c

    # Bucket drifts by channel ASCENDING so we can scan for "next drift"
    # for re-flag detection without re-sorting.
    drifts_by_channel: dict[str, list[AuditEventRecord]] = {}
    for d in drift_rows:
        ch = (_parse_token(d.note or "", "channel") or "").strip().lower()
        if not ch:
            continue
        drifts_by_channel.setdefault(ch, []).append(d)

    # Pair each drift with a rotation. The rotation pairs with the MOST
    # RECENT un-rotated drift before its timestamp — i.e. for each mark
    # we walk back to the latest drift on the same channel that is older
    # than the mark and has no closer drift in between.
    used_marks: set[str] = set()
    drift_to_mark: dict[str, AuditEventRecord] = {}
    for ch, ch_drifts in drifts_by_channel.items():
        ch_marks = marks_by_channel.get(ch, [])
        if not ch_marks:
            continue
        # Sort drifts ascending by created_at (already ascending from the
        # source query, but be defensive).
        ch_drifts_sorted = sorted(
            ch_drifts, key=lambda r: _coerce_dt(r.created_at) or now
        )
        ch_marks_sorted = sorted(
            ch_marks, key=lambda r: _coerce_dt(r.created_at) or now
        )
        # Walk marks ascending; for each mark, the paired drift is the
        # latest drift strictly older than the mark that has not already
        # been paired.
        for m in ch_marks_sorted:
            if m.event_id in used_marks:
                continue
            m_dt = _coerce_dt(m.created_at)
            if m_dt is None:
                continue
            paired: Optional[AuditEventRecord] = None
            for d in reversed(ch_drifts_sorted):
                d_dt = _coerce_dt(d.created_at)
                if d_dt is None:
                    continue
                if d_dt >= m_dt:
                    continue
                if d.event_id in drift_to_mark:
                    continue
                paired = d
                break
            if paired is not None:
                drift_to_mark[paired.event_id] = m
                used_marks.add(m.event_id)

    out: list[DriftRecord] = []
    for d in drift_rows:
        d_note = d.note or ""
        d_channel = (_parse_token(d_note, "channel") or "").strip().lower()
        d_err_class = _parse_token(d_note, "error_class") or ""
        d_dt = _coerce_dt(d.created_at)
        if d_dt is None or not d_channel:
            continue

        rec = DriftRecord(
            drift_audit_id=int(d.id or 0),
            drift_event_id=d.event_id,
            channel=d_channel,
            error_class=d_err_class,
            detected_at=d_dt,
        )

        m = drift_to_mark.get(d.event_id)
        if m is not None:
            m_dt = _coerce_dt(m.created_at)
            rec.marked_event_id = m.event_id
            rec.marked_at = m_dt
            rec.rotated_by_user_id = (
                _parse_token(m.note or "", "rotator_user_id")
                or m.actor_id
                or None
            )
            rec.rotation_method = (
                _parse_token(m.note or "", "rotation_method") or None
            )
            if rec.rotation_method:
                rec.rotation_method = rec.rotation_method.strip().lower()

            c = confirms_by_mark_event.get(m.event_id)
            if c is not None:
                c_dt = _coerce_dt(c.created_at)
                rec.confirmed_event_id = c.event_id
                rec.confirmed_at = c_dt

                # Re-flag detection — next drift for this channel after
                # the confirmation timestamp, within 30d.
                if c_dt is not None and d_channel in drifts_by_channel:
                    re_flag_cutoff = c_dt + timedelta(
                        days=RE_FLAG_WINDOW_DAYS
                    )
                    for nd in drifts_by_channel[d_channel]:
                        if nd.event_id == d.event_id:
                            continue
                        nd_dt = _coerce_dt(nd.created_at)
                        if nd_dt is None:
                            continue
                        if nd_dt <= c_dt:
                            continue
                        if nd_dt > re_flag_cutoff:
                            break
                        rec.re_flagged_within_30d = True
                        rec.re_flag_event_id = nd.event_id
                        rec.re_flag_days = round(
                            (nd_dt - c_dt).total_seconds() / 86400.0, 4
                        )
                        break

        out.append(rec)

    return out


# ── Aggregates ──────────────────────────────────────────────────────────────


def compute_channel_metrics(
    records: list[DriftRecord],
) -> dict[str, ChannelMetric]:
    """Group ``DriftRecord``s by channel and compute aggregates."""
    by_channel: dict[str, ChannelMetric] = {}
    for rec in records:
        ch = rec.channel
        slot = by_channel.get(ch)
        if slot is None:
            slot = ChannelMetric(channel=ch)
            by_channel[ch] = slot
        slot.drifts += 1
        if rec.marked_at is not None and rec.detected_at is not None:
            slot.rotated += 1
            ttr = (rec.marked_at - rec.detected_at).total_seconds() / 3600.0
            if ttr >= 0:
                slot.time_to_rotate_hours.append(ttr)
        if rec.confirmed_at is not None and rec.marked_at is not None:
            slot.confirmed += 1
            ttc = (
                rec.confirmed_at - rec.marked_at
            ).total_seconds() / 3600.0
            if ttc >= 0:
                slot.time_to_confirm_hours.append(ttc)
        if rec.re_flagged_within_30d:
            slot.re_flagged_within_30d += 1
    return by_channel


def compute_rotator_metrics(
    records: list[DriftRecord], *, min_rotations: int = 1
) -> list[RotatorMetric]:
    """Group ``DriftRecord``s by rotator and compute aggregates.

    Resolvers with fewer than ``min_rotations`` rotations are excluded.
    Only chains with a non-null ``marked_at`` count toward rotations.
    """
    by_rotator: dict[str, dict[str, object]] = {}
    for rec in records:
        if rec.marked_at is None or rec.detected_at is None:
            continue
        rid = (rec.rotated_by_user_id or "").strip()
        if not rid:
            continue
        slot = by_rotator.setdefault(
            rid,
            {
                "rotations": 0,
                "confirmed": 0,
                "re_flagged": 0,
                "ttr_hours": [],
                "last_at": None,
            },
        )
        slot["rotations"] = int(slot["rotations"]) + 1  # type: ignore[arg-type]
        ttr = (rec.marked_at - rec.detected_at).total_seconds() / 3600.0
        if ttr >= 0:
            slot["ttr_hours"].append(ttr)  # type: ignore[union-attr]
        if rec.confirmed_at is not None:
            slot["confirmed"] = int(slot["confirmed"]) + 1  # type: ignore[arg-type]
        if rec.re_flagged_within_30d:
            slot["re_flagged"] = int(slot["re_flagged"]) + 1  # type: ignore[arg-type]
        prev = slot["last_at"]
        if prev is None or rec.marked_at > prev:  # type: ignore[operator]
            slot["last_at"] = rec.marked_at

    out: list[RotatorMetric] = []
    for rid, slot in by_rotator.items():
        rotations = int(slot["rotations"])  # type: ignore[arg-type]
        if rotations < int(max(1, min_rotations)):
            continue
        ttr_list = list(slot["ttr_hours"])  # type: ignore[arg-type]
        median_h = (
            round(statistics.median(ttr_list), 2) if ttr_list else None
        )
        out.append(
            RotatorMetric(
                rotator_user_id=rid,
                rotations=rotations,
                confirmed_rotations=int(slot["confirmed"]),  # type: ignore[arg-type]
                re_flagged_within_30d=int(slot["re_flagged"]),  # type: ignore[arg-type]
                median_time_to_rotate_hours=median_h,
                last_rotation_at=slot["last_at"],  # type: ignore[arg-type]
            )
        )
    out.sort(key=lambda m: (-m.rotations, m.rotator_user_id))
    return out


def median_or_none(values: list[float]) -> Optional[float]:
    if not values:
        return None
    return round(statistics.median(values), 2)


def mean_or_none(values: list[float]) -> Optional[float]:
    if not values:
        return None
    return round(statistics.fmean(values), 2)


def rotation_method_distribution(
    records: list[DriftRecord],
) -> dict[str, int]:
    """Count rotation methods over rotated chains. Unknown / missing
    methods bucket to ``other`` (NOT in ALLOWED_ROTATION_METHODS to keep
    UI typing stable; the router omits ``other`` from the response if
    every rotation has a recognised method)."""
    out: dict[str, int] = {m: 0 for m in ALLOWED_ROTATION_METHODS}
    out["other"] = 0
    for rec in records:
        if rec.marked_at is None:
            continue
        m = (rec.rotation_method or "").strip().lower()
        if m in out:
            out[m] += 1
        else:
            out["other"] += 1
    return out


def build_weekly_trend_buckets(
    records: list[DriftRecord], *, window_days: int
) -> list[dict]:
    """Weekly buckets: ``detected``, ``rotated``, ``re_flagged`` per week.

    Buckets are oldest-first so the chart renders left-to-right by date.
    """
    bucket_days = 7
    n_buckets = max(
        1, min(13, (window_days + bucket_days - 1) // bucket_days)
    )
    now = datetime.now(timezone.utc)
    buckets: list[dict] = []
    for i in range(n_buckets):
        start = now - timedelta(days=(i + 1) * bucket_days)
        end = now - timedelta(days=i * bucket_days)
        detected = 0
        rotated = 0
        re_flagged = 0
        for rec in records:
            if rec.detected_at is not None and start < rec.detected_at <= end:
                detected += 1
            if rec.marked_at is not None and start < rec.marked_at <= end:
                rotated += 1
            if (
                rec.re_flagged_within_30d
                and rec.confirmed_at is not None
                and start < rec.confirmed_at <= end
            ):
                re_flagged += 1
        buckets.append(
            {
                "week_start": start.isoformat(),
                "week_end": end.isoformat(),
                "detected": detected,
                "rotated": rotated,
                "re_flagged": re_flagged,
            }
        )
    buckets.reverse()
    return buckets
