"""Deterministic wearable alert flag rules.

Rules are purely statistical/threshold-based — no ML, no diagnosis.
All flags include a human-readable detail string and must be reviewed
by a clinician before any clinical action is taken.
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from app.persistence.models import WearableDailySummary, WearableAlertFlag


# ── Thresholds ────────────────────────────────────────────────────────────────

_SLEEP_WORSENING_DELTA_H   = -1.5    # drop of ≥1.5h average sleep over 7d vs prior 7d
_SLEEP_WORSENING_MIN_H     = 5.0     # sustained <5h average is a flag
_RHR_RISING_DELTA_BPM      = 8.0     # rise of ≥8 bpm vs 7-day baseline
_RHR_HIGH_ABSOLUTE_BPM     = 100.0   # resting HR ≥100 regardless of trend
_HRV_DECLINING_DELTA_PCT   = -0.20   # ≥20% drop in HRV vs 7-day baseline
_HRV_LOW_ABSOLUTE_MS       = 20.0    # HRV below 20ms regardless of trend
_SYNC_GAP_HOURS            = 48      # no data for ≥48h
_MOOD_WORSENING_THRESHOLD  = 2.0     # mood score ≤2/5 for ≥3 of last 5 days
_ANXIETY_PAIN_THRESHOLD    = 7.0     # anxiety or pain score ≥7/10 sustained


def _avg(values: list[float]) -> Optional[float]:
    clean = [v for v in values if v is not None]
    return sum(clean) / len(clean) if clean else None


def run_flag_checks(
    patient_id: str,
    course_id: Optional[str],
    db: Session,
) -> list[WearableAlertFlag]:
    """Run all deterministic checks for a patient and persist any new flags.

    Returns list of newly created flags (duplicates suppressed by flag_type
    within the last 48h).
    """
    now = datetime.utcnow()
    cutoff_14d = now - timedelta(days=14)
    cutoff_7d  = now - timedelta(days=7)

    summaries_14d: list[WearableDailySummary] = (
        db.query(WearableDailySummary)
        .filter(
            WearableDailySummary.patient_id == patient_id,
            WearableDailySummary.date >= cutoff_14d.date().isoformat(),
        )
        .order_by(WearableDailySummary.date.asc())
        .all()
    )

    # Split 14d into prior-7 and recent-7
    prior7  = [s for s in summaries_14d if s.date < cutoff_7d.date().isoformat()]
    recent7 = [s for s in summaries_14d if s.date >= cutoff_7d.date().isoformat()]

    # Recent flags to avoid duplicate spam
    recent_flag_types: set[str] = {
        f.flag_type
        for f in db.query(WearableAlertFlag)
        .filter(
            WearableAlertFlag.patient_id == patient_id,
            WearableAlertFlag.triggered_at >= now - timedelta(hours=48),
            WearableAlertFlag.dismissed == False,
        )
        .all()
    }

    new_flags: list[WearableAlertFlag] = []

    def _emit(flag_type: str, severity: str, detail: str, snapshot: dict) -> None:
        if flag_type in recent_flag_types:
            return
        flag = WearableAlertFlag(
            id=str(uuid.uuid4()),
            patient_id=patient_id,
            course_id=course_id,
            flag_type=flag_type,
            severity=severity,
            detail=detail,
            metric_snapshot=json.dumps(snapshot),
            triggered_at=now,
            dismissed=False,
            auto_generated=True,
        )
        db.add(flag)
        new_flags.append(flag)

    # ── Rule 1: Sleep worsening ───────────────────────────────────────────────
    avg_sleep_prior  = _avg([s.sleep_duration_h for s in prior7])
    avg_sleep_recent = _avg([s.sleep_duration_h for s in recent7])
    if avg_sleep_recent is not None:
        if avg_sleep_prior is not None:
            delta = avg_sleep_recent - avg_sleep_prior
            if delta <= _SLEEP_WORSENING_DELTA_H:
                _emit(
                    'sleep_worsening', 'warning',
                    f"Average sleep dropped {abs(delta):.1f}h (from {avg_sleep_prior:.1f}h to {avg_sleep_recent:.1f}h) over the last 7 days.",
                    {'avg_sleep_prior_7d': avg_sleep_prior, 'avg_sleep_recent_7d': avg_sleep_recent, 'delta_h': delta},
                )
        if avg_sleep_recent < _SLEEP_WORSENING_MIN_H:
            _emit(
                'sleep_low', 'warning',
                f"Average sleep is {avg_sleep_recent:.1f}h over the last 7 days — below recommended minimum.",
                {'avg_sleep_recent_7d': avg_sleep_recent},
            )

    # ── Rule 2: Rising resting HR ─────────────────────────────────────────────
    avg_rhr_prior  = _avg([s.rhr_bpm for s in prior7])
    avg_rhr_recent = _avg([s.rhr_bpm for s in recent7])
    if avg_rhr_recent is not None:
        if avg_rhr_prior is not None:
            delta = avg_rhr_recent - avg_rhr_prior
            if delta >= _RHR_RISING_DELTA_BPM:
                _emit(
                    'rhr_rising', 'warning',
                    f"Resting HR has risen {delta:.0f} bpm on average ({avg_rhr_prior:.0f}→{avg_rhr_recent:.0f} bpm) over 7 days.",
                    {'avg_rhr_prior_7d': avg_rhr_prior, 'avg_rhr_recent_7d': avg_rhr_recent, 'delta_bpm': delta},
                )
        if avg_rhr_recent >= _RHR_HIGH_ABSOLUTE_BPM:
            _emit(
                'rhr_elevated', 'urgent',
                f"Average resting HR {avg_rhr_recent:.0f} bpm is above 100 bpm — clinician review recommended.",
                {'avg_rhr_recent_7d': avg_rhr_recent},
            )

    # ── Rule 3: Declining HRV ─────────────────────────────────────────────────
    avg_hrv_prior  = _avg([s.hrv_ms for s in prior7])
    avg_hrv_recent = _avg([s.hrv_ms for s in recent7])
    if avg_hrv_recent is not None and avg_hrv_prior is not None and avg_hrv_prior > 0:
        pct_change = (avg_hrv_recent - avg_hrv_prior) / avg_hrv_prior
        if pct_change <= _HRV_DECLINING_DELTA_PCT:
            _emit(
                'hrv_declining', 'warning',
                f"HRV declined {abs(pct_change) * 100:.0f}% ({avg_hrv_prior:.0f}ms → {avg_hrv_recent:.0f}ms). May indicate physiological stress.",
                {'avg_hrv_prior_7d': avg_hrv_prior, 'avg_hrv_recent_7d': avg_hrv_recent, 'pct_change': pct_change},
            )
    if avg_hrv_recent is not None and avg_hrv_recent < _HRV_LOW_ABSOLUTE_MS:
        _emit(
            'hrv_low', 'warning',
            f"HRV averaging {avg_hrv_recent:.0f}ms — below 20ms threshold indicating low recovery.",
            {'avg_hrv_recent_7d': avg_hrv_recent},
        )

    # ── Rule 4: Sync gap ──────────────────────────────────────────────────────
    if summaries_14d:
        latest_date_str = max(s.date for s in summaries_14d)
        # Compare date-to-date (whole days) to avoid naive datetime vs UTC offset errors.
        # Using (now.date() - latest_date).days preserves correct behaviour on all server TZs.
        from datetime import date as _date
        gap_days = (now.date() - _date.fromisoformat(latest_date_str)).days
        gap_hours = gap_days * 24
        if gap_hours >= _SYNC_GAP_HOURS:
            _emit(
                'sync_gap', 'info',
                f"No wearable data received for {gap_days} day(s). Patient may need assistance reconnecting.",
                {'last_sync_date': latest_date_str, 'gap_hours': gap_hours},
            )

    # ── Rule 5: Symptom worsening (patient self-report) ───────────────────────
    recent5 = recent7[-5:] if len(recent7) >= 5 else recent7
    low_mood_days = sum(1 for s in recent5 if s.mood_score is not None and s.mood_score <= _MOOD_WORSENING_THRESHOLD)
    if low_mood_days >= 3:
        avg_mood = _avg([s.mood_score for s in recent5 if s.mood_score is not None])
        _emit(
            'symptom_worsening', 'warning',
            f"Patient reported low mood (≤2/5) on {low_mood_days} of the last 5 days (avg: {avg_mood:.1f}/5). Consider clinical check-in.",
            {'low_mood_day_count': low_mood_days, 'avg_mood_score': avg_mood},
        )

    high_anxiety_days = sum(1 for s in recent5 if s.anxiety_score is not None and s.anxiety_score >= _ANXIETY_PAIN_THRESHOLD)
    if high_anxiety_days >= 2:
        avg_anx = _avg([s.anxiety_score for s in recent5 if s.anxiety_score is not None])
        _emit(
            'symptom_worsening', 'urgent',
            f"Patient reported high anxiety (≥7/10) on {high_anxiety_days} of the last 5 days (avg: {avg_anx:.1f}/10). Clinician review recommended.",
            {'high_anxiety_day_count': high_anxiety_days, 'avg_anxiety_score': avg_anx},
        )

    # ── Rule 6: Pre-session readiness concern ─────────────────────────────────
    if recent7:
        latest = recent7[-1]
        concerns = []
        if latest.hrv_ms is not None and latest.hrv_ms < _HRV_LOW_ABSOLUTE_MS:
            concerns.append(f"HRV {latest.hrv_ms:.0f}ms")
        if latest.sleep_duration_h is not None and latest.sleep_duration_h < 5.0:
            concerns.append(f"sleep {latest.sleep_duration_h:.1f}h")
        if latest.rhr_bpm is not None and avg_rhr_prior is not None and latest.rhr_bpm > avg_rhr_prior + 10:
            concerns.append(f"elevated HR {latest.rhr_bpm:.0f}bpm")
        if concerns:
            _emit(
                'presession_concern', 'warning',
                f"Latest data shows potential readiness concerns before next session: {', '.join(concerns)}. Not a contraindication — clinician judgment required.",
                {'date': latest.date, 'concerns': concerns},
            )

    if new_flags:
        db.commit()

    return new_flags


def compute_readiness_score(summaries: list) -> dict:
    """Compute a simple 0-100 readiness score from the latest daily summary.

    Returns {'score': int, 'factors': [{'label', 'impact', 'value'}], 'color': str}
    This is informational only — not a clinical measure.
    """
    if not summaries:
        return {'score': None, 'factors': [], 'color': 'var(--text-tertiary)', 'label': 'No data'}

    latest = summaries[-1] if isinstance(summaries[-1], dict) else summaries[-1]
    # Accept both ORM objects and dicts
    def _get(obj, key, default=None):
        if isinstance(obj, dict):
            return obj.get(key, default)
        return getattr(obj, key, default)

    score = 100
    factors = []

    hrv = _get(latest, 'hrv_ms')
    if hrv is not None:
        if hrv < 20:
            score -= 25
            factors.append({'label': 'Very low HRV', 'impact': -25, 'value': f'{hrv:.0f}ms'})
        elif hrv < 35:
            score -= 12
            factors.append({'label': 'Low HRV', 'impact': -12, 'value': f'{hrv:.0f}ms'})

    sleep = _get(latest, 'sleep_duration_h')
    if sleep is not None:
        if sleep < 5:
            score -= 20
            factors.append({'label': 'Poor sleep', 'impact': -20, 'value': f'{sleep:.1f}h'})
        elif sleep < 6.5:
            score -= 10
            factors.append({'label': 'Below-average sleep', 'impact': -10, 'value': f'{sleep:.1f}h'})

    rhr = _get(latest, 'rhr_bpm')
    if rhr is not None and rhr >= _RHR_HIGH_ABSOLUTE_BPM:
        score -= 15
        factors.append({'label': 'Elevated resting HR', 'impact': -15, 'value': f'{rhr:.0f}bpm'})

    mood = _get(latest, 'mood_score')
    if mood is not None and mood <= 2:
        score -= 10
        factors.append({'label': 'Low mood reported', 'impact': -10, 'value': f'{mood:.0f}/5'})

    score = max(0, score)
    if score >= 70:
        color = 'var(--green)'
        label = 'Good'
    elif score >= 40:
        color = 'var(--amber)'
        label = 'Fair'
    else:
        color = 'var(--red)'
        label = 'Low'

    return {'score': score, 'factors': factors, 'color': color, 'label': label}
