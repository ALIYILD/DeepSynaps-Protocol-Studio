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
# disclaimer can reference the same numbers.
REFLAG_HIGH_PCT_THRESHOLD = 30.0
REFLAG_HIGH_MIN_CONFIRMED = 3
MANUAL_SHARE_PCT_THRESHOLD = 70.0
MANUAL_REFLAG_PCT_THRESHOLD = 15.0
AUTH_DOMINANT_PCT_THRESHOLD = 60.0
AUTH_DOMINANT_MIN_DRIFTS = 5


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


def _eval_rules_for_channel(
    stats: _ChannelStats, *, generated_at: datetime
) -> list[RotationAdvice]:
    """Evaluate the three heuristic rules and return any matched cards."""
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

    # Rule A — REFLAG_HIGH.
    if (
        re_flag_pct is not None
        and re_flag_pct > REFLAG_HIGH_PCT_THRESHOLD
        and stats.confirmed >= REFLAG_HIGH_MIN_CONFIRMED
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
        and manual_share_pct >= MANUAL_SHARE_PCT_THRESHOLD
        and re_flag_pct is not None
        and re_flag_pct > MANUAL_REFLAG_PCT_THRESHOLD
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
        and auth_share_pct >= AUTH_DOMINANT_PCT_THRESHOLD
        and stats.total_drifts >= AUTH_DOMINANT_MIN_DRIFTS
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
) -> list[RotationAdvice]:
    """Return advice cards for a clinic over the last ``window_days``.

    Pure read function — never writes to the database. Cross-clinic
    safety is delegated to :func:`pair_drifts_with_resolutions` which
    filters every audit row by the ``clinic_id={cid}`` substring
    needle (so a clinician in clinic A never sees data from clinic B).
    """
    cid = str(clinic_id) if clinic_id is not None else ""
    if not cid:
        return []

    w = _normalize_window(window_days)
    generated_at = datetime.now(timezone.utc)

    records = pair_drifts_with_resolutions(db, clinic_id=cid, window_days=w)
    by_channel = _aggregate_channel_stats(records, ADVISOR_CHANNELS)

    cards: list[RotationAdvice] = []
    for ch in sorted(by_channel.keys()):
        cards.extend(
            _eval_rules_for_channel(
                by_channel[ch], generated_at=generated_at
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
