"""Rotation Policy Advisor service (CSAHP4, 2026-05-02).

Read-only advisor surface that consumes the leading-indicator signals
already exposed by CSAHP3
(:mod:`app.services.auth_drift_resolution_pairing`).

For each probe channel (slack / sendgrid / twilio / pagerduty / email)
we compute three derived metrics over the last ``window_days`` days:

* ``re_flag_rate_pct`` — re-flagged-within-30d / confirmed (same calc
  as CSAHP3's per-channel ``re_flag_rate_pct``)
* ``manual_rotation_share_pct`` — rotations with
  ``rotation_method=manual`` / total rotations on the channel
* ``auth_error_class_share_pct`` — drifts with ``error_class=auth`` /
  total drifts on the channel

Three heuristic rules generate advice cards:

* **REFLAG_HIGH** — ``re_flag_rate_pct > 30`` AND ``confirmed_count >= 3``.
  Severity ``high``. Sample-size guard prevents triggering on 1-2
  confirmations where a single re-flag would push the rate above the
  threshold.
* **MANUAL_REFLAG** — ``manual_rotation_share_pct >= 70`` AND
  ``re_flag_rate_pct > 15``. Severity ``medium``. Catches the case
  where manual rotations are correlated with re-flags even when the
  re-flag rate alone is below the high-severity threshold.
* **AUTH_DOMINANT** — ``auth_error_class_share_pct >= 60`` AND
  ``total_drifts >= 5``. Severity ``medium``. Catches credential
  storage / refresh policy regressions where most drifts are
  auth-class.

A single channel can produce 0–3 cards (one per matched rule). Cards
are sorted severity-desc (high before medium) then channel-name asc
so the UI renders the most actionable signal first.

Pure functions; no DB writes; no schema change. Mirrors the DCRO5 /
CSAHP3 pattern (#406, #424).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.services.auth_drift_resolution_pairing import (
    DEFAULT_WINDOW_DAYS,
    MAX_WINDOW_DAYS,
    MIN_WINDOW_DAYS,
    pair_drifts_with_resolutions,
)


# Probe channels evaluated by the advisor. Mirrors CSAHP3's
# PROBE_CHANNELS but adds ``email`` because the spec calls it out
# explicitly. Channels with zero data on the clinic still get
# evaluated (and produce zero cards) so the response shape is stable
# regardless of which channels the clinic has wired up.
ADVISOR_CHANNELS: tuple[str, ...] = (
    "slack",
    "twilio",
    "sendgrid",
    "pagerduty",
    "email",
)


# Heuristic thresholds — pinned constants so the tests and the UI
# disclaimer can reference the same numbers. CSAHP6 (#PR-CSAHP6) layered
# a per-clinic override table on top via :func:`_load_thresholds`; these
# constants remain the fallback when no override row exists for the
# clinic.
REFLAG_HIGH_PCT_THRESHOLD = 30.0
REFLAG_HIGH_MIN_CONFIRMED = 3
MANUAL_SHARE_PCT_THRESHOLD = 70.0
MANUAL_REFLAG_PCT_THRESHOLD = 15.0
AUTH_DOMINANT_PCT_THRESHOLD = 60.0
AUTH_DOMINANT_MIN_DRIFTS = 5


# Canonical advice codes the CSAHP6 console exposes for adoption. Any
# new code must be added here AND wired into ``_load_thresholds`` /
# ``DEFAULT_THRESHOLDS`` below.
ROTATION_ADVICE_CODES: tuple[str, ...] = (
    "REFLAG_HIGH",
    "MANUAL_REFLAG",
    "AUTH_DOMINANT",
)


# Default threshold map keyed by ``advice_code`` → ``threshold_key`` →
# numeric default. The CSAHP6 router serialises this to the console
# UI as the read-only "current value" baseline when no override row
# exists for the clinic. Float for both percent and count thresholds
# so the persistence column type matches.
DEFAULT_THRESHOLDS: dict[str, dict[str, float]] = {
    "REFLAG_HIGH": {
        "re_flag_rate_pct_min": REFLAG_HIGH_PCT_THRESHOLD,
        "confirmed_count_min": float(REFLAG_HIGH_MIN_CONFIRMED),
    },
    "MANUAL_REFLAG": {
        "manual_share_pct_min": MANUAL_SHARE_PCT_THRESHOLD,
        "re_flag_rate_pct_min": MANUAL_REFLAG_PCT_THRESHOLD,
    },
    "AUTH_DOMINANT": {
        "auth_share_pct_min": AUTH_DOMINANT_PCT_THRESHOLD,
        "total_drifts_min": float(AUTH_DOMINANT_MIN_DRIFTS),
    },
}


# Severity ordering — used for sort-key construction. Higher integer =
# higher priority (sorted descending in the response).
_SEVERITY_RANK: dict[str, int] = {"high": 2, "medium": 1, "low": 0}


@dataclass
class RotationAdvice:
    """One advice card for a (channel, rule) pair.

    ``supporting_metrics`` always carries the three numeric inputs
    that drive the rules so the UI can render the badges without
    re-fetching the CSAHP3 summary.
    """

    channel: str
    severity: str
    advice_code: str
    title: str
    body: str
    supporting_metrics: dict[str, float | int] = field(default_factory=dict)
    generated_at: Optional[datetime] = None


# ── Helpers ─────────────────────────────────────────────────────────────────


def _round_pct(numerator: int, denominator: int) -> Optional[float]:
    """Return ``(numerator / denominator) * 100`` as 2dp, or ``None``
    when the denominator is zero (so the UI can render a dash instead
    of a misleading 0%)."""
    if denominator <= 0:
        return None
    return round((numerator / float(denominator)) * 100.0, 2)


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


def _channel_pretty(ch: str) -> str:
    """Capitalise channel name for card titles."""
    return ch[:1].upper() + ch[1:]


# ── Per-channel metrics ─────────────────────────────────────────────────────


@dataclass
class _ChannelStats:
    channel: str
    total_drifts: int = 0
    auth_class_drifts: int = 0
    rotated: int = 0
    manual_rotations: int = 0
    confirmed: int = 0
    re_flagged: int = 0


def _aggregate_channel_stats(records, channels: tuple[str, ...]) -> dict[str, _ChannelStats]:
    """Bucket ``DriftRecord`` instances by channel and compute per-rule
    inputs. Channels that produced no data get a zero row so the
    rule loop below evaluates every channel uniformly."""
    by_channel: dict[str, _ChannelStats] = {
        ch: _ChannelStats(channel=ch) for ch in channels
    }
    for rec in records:
        ch = (rec.channel or "").strip().lower()
        if not ch:
            continue
        slot = by_channel.get(ch)
        if slot is None:
            # Unknown channel — accept it so the advisor surface stays
            # honest if the worker ever covers a new channel.
            slot = _ChannelStats(channel=ch)
            by_channel[ch] = slot
        slot.total_drifts += 1
        err_class = (rec.error_class or "").strip().lower()
        if err_class == "auth":
            slot.auth_class_drifts += 1
        if rec.marked_at is not None:
            slot.rotated += 1
            method = (rec.rotation_method or "").strip().lower()
            if method == "manual":
                slot.manual_rotations += 1
        if rec.confirmed_at is not None:
            slot.confirmed += 1
        if rec.re_flagged_within_30d:
            slot.re_flagged += 1
    return by_channel


# ── Rule evaluation ─────────────────────────────────────────────────────────


def _resolve_thresholds(
    overrides: Optional[dict[str, dict[str, float]]],
) -> dict[str, dict[str, float]]:
    """Merge an override map onto :data:`DEFAULT_THRESHOLDS`.

    Missing advice codes / threshold keys fall back to the default —
    this keeps the heuristic stable when a clinic has only adopted a
    subset of the available knobs. The returned map is always
    fully-populated so callers can index without ``KeyError``.
    """
    merged: dict[str, dict[str, float]] = {
        code: dict(d) for code, d in DEFAULT_THRESHOLDS.items()
    }
    if not overrides:
        return merged
    for code, kv in overrides.items():
        if not isinstance(kv, dict):
            continue
        slot = merged.setdefault(code, {})
        for k, v in kv.items():
            try:
                slot[k] = float(v)
            except Exception:  # pragma: no cover - defensive
                continue
    return merged


def _load_thresholds(
    db: Session, clinic_id: str | int
) -> dict[str, dict[str, float]]:
    """Read :class:`RotationPolicyAdvisorThreshold` rows for the clinic
    and merge them onto :data:`DEFAULT_THRESHOLDS`.

    Returns a fully-populated map so callers can read every
    ``(advice_code, threshold_key)`` pair without ``KeyError``. Missing
    rows fall back to the hardcoded defaults.

    Defensive: if the table does not exist (pre-migration test envs)
    we return the defaults silently so the heuristic keeps working.
    """
    cid = str(clinic_id) if clinic_id is not None else ""
    if not cid:
        return _resolve_thresholds(None)
    try:
        from app.persistence.models import (  # noqa: PLC0415
            RotationPolicyAdvisorThreshold,
        )

        rows = (
            db.query(RotationPolicyAdvisorThreshold)
            .filter(RotationPolicyAdvisorThreshold.clinic_id == cid)
            .all()
        )
    except Exception:
        return _resolve_thresholds(None)
    overrides: dict[str, dict[str, float]] = {}
    for row in rows:
        try:
            code = str(row.advice_code)
            key = str(row.threshold_key)
            val = float(row.threshold_value)
        except Exception:
            continue
        overrides.setdefault(code, {})[key] = val
    return _resolve_thresholds(overrides)


def _eval_rules_for_channel(
    stats: _ChannelStats,
    *,
    generated_at: datetime,
    thresholds: dict[str, dict[str, float]],
) -> list[RotationAdvice]:
    """Evaluate the three heuristic rules against ``thresholds`` and
    return any matched cards. ``thresholds`` is the fully-resolved map
    returned by :func:`_resolve_thresholds`."""
    out: list[RotationAdvice] = []

    re_flag_pct = _round_pct(stats.re_flagged, stats.confirmed)
    manual_share_pct = _round_pct(stats.manual_rotations, stats.rotated)
    auth_share_pct = _round_pct(stats.auth_class_drifts, stats.total_drifts)

    metrics_base: dict[str, float | int] = {
        "re_flag_rate_pct": re_flag_pct if re_flag_pct is not None else 0.0,
        "confirmed_count": stats.confirmed,
        "manual_rotation_share_pct": (
            manual_share_pct if manual_share_pct is not None else 0.0
        ),
        "auth_error_class_share_pct": (
            auth_share_pct if auth_share_pct is not None else 0.0
        ),
        "total_drifts": stats.total_drifts,
        "rotations": stats.rotated,
    }

    pretty = _channel_pretty(stats.channel)

    reflag_high = thresholds.get("REFLAG_HIGH", {})
    manual_reflag = thresholds.get("MANUAL_REFLAG", {})
    auth_dominant = thresholds.get("AUTH_DOMINANT", {})

    reflag_high_pct = float(
        reflag_high.get("re_flag_rate_pct_min", REFLAG_HIGH_PCT_THRESHOLD)
    )
    reflag_high_min = int(
        float(
            reflag_high.get(
                "confirmed_count_min", float(REFLAG_HIGH_MIN_CONFIRMED)
            )
        )
    )
    manual_share_min = float(
        manual_reflag.get("manual_share_pct_min", MANUAL_SHARE_PCT_THRESHOLD)
    )
    manual_reflag_pct = float(
        manual_reflag.get("re_flag_rate_pct_min", MANUAL_REFLAG_PCT_THRESHOLD)
    )
    auth_share_min = float(
        auth_dominant.get("auth_share_pct_min", AUTH_DOMINANT_PCT_THRESHOLD)
    )
    auth_total_min = int(
        float(
            auth_dominant.get(
                "total_drifts_min", float(AUTH_DOMINANT_MIN_DRIFTS)
            )
        )
    )

    # Rule A — REFLAG_HIGH.
    if (
        re_flag_pct is not None
        and re_flag_pct > reflag_high_pct
        and stats.confirmed >= reflag_high_min
    ):
        out.append(
            RotationAdvice(
                channel=stats.channel,
                severity="high",
                advice_code="REFLAG_HIGH",
                title=f"High re-flag rate on {pretty}",
                body=(
                    "High re-flag rate detected; consider migrating from "
                    "manual rotation to automated_rotation, or auditing "
                    "credential storage policy."
                ),
                supporting_metrics=dict(metrics_base),
                generated_at=generated_at,
            )
        )

    # Rule B — MANUAL_REFLAG.
    if (
        manual_share_pct is not None
        and manual_share_pct >= manual_share_min
        and re_flag_pct is not None
        and re_flag_pct > manual_reflag_pct
    ):
        out.append(
            RotationAdvice(
                channel=stats.channel,
                severity="medium",
                advice_code="MANUAL_REFLAG",
                title=f"Manual rotation dominance on {pretty}",
                body=(
                    "Consider automated rotation; manual rotations are "
                    "correlated with re-flags on this channel."
                ),
                supporting_metrics=dict(metrics_base),
                generated_at=generated_at,
            )
        )

    # Rule C — AUTH_DOMINANT.
    if (
        auth_share_pct is not None
        and auth_share_pct >= auth_share_min
        and stats.total_drifts >= auth_total_min
    ):
        out.append(
            RotationAdvice(
                channel=stats.channel,
                severity="medium",
                advice_code="AUTH_DOMINANT",
                title=f"Auth-class drift dominance on {pretty}",
                body=(
                    "Most drifts on this channel are auth-class; "
                    "investigate token storage and refresh policy."
                ),
                supporting_metrics=dict(metrics_base),
                generated_at=generated_at,
            )
        )

    return out


# ── Public API ──────────────────────────────────────────────────────────────


def compute_rotation_advice(
    db: Session,
    clinic_id: str | int,
    window_days: int = DEFAULT_WINDOW_DAYS,
    *,
    override_thresholds: Optional[dict[str, dict[str, float]]] = None,
) -> list[RotationAdvice]:
    """Return advice cards for a clinic over the last ``window_days``.

    Pure read function — never writes to the database. Cross-clinic
    safety is delegated to :func:`pair_drifts_with_resolutions` which
    filters every audit row by the ``clinic_id={cid}`` substring
    needle (so a clinician in clinic A never sees data from clinic B).

    Threshold resolution (CSAHP6, 2026-05-02)
    -----------------------------------------
    When ``override_thresholds`` is ``None`` (the default, used by
    the live ``/advice`` endpoint and the snapshot worker), the
    function loads any per-clinic override rows from
    :class:`RotationPolicyAdvisorThreshold` and merges them onto
    :data:`DEFAULT_THRESHOLDS`. When ``override_thresholds`` is
    provided (used by the CSAHP6 what-if replay service), the
    provided map is used in place of the DB lookup so callers can
    test "what would have happened if the threshold was X" without
    persisting anything.
    """
    cid = str(clinic_id) if clinic_id is not None else ""
    if not cid:
        return []

    w = _normalize_window(window_days)
    generated_at = datetime.now(timezone.utc)

    if override_thresholds is None:
        thresholds = _load_thresholds(db, cid)
    else:
        thresholds = _resolve_thresholds(override_thresholds)

    records = pair_drifts_with_resolutions(db, clinic_id=cid, window_days=w)
    by_channel = _aggregate_channel_stats(records, ADVISOR_CHANNELS)

    cards: list[RotationAdvice] = []
    for ch in sorted(by_channel.keys()):
        cards.extend(
            _eval_rules_for_channel(
                by_channel[ch],
                generated_at=generated_at,
                thresholds=thresholds,
            )
        )

    cards.sort(
        key=lambda c: (
            -_SEVERITY_RANK.get(c.severity, 0),
            c.channel,
            c.advice_code,
        )
    )
    return cards
