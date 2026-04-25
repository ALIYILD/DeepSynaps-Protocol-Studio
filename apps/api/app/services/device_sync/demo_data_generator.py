"""Deterministic demo data generator for device sync adapters.

Uses seeded random (hash of patient_id + date) so the same query
always returns identical data.  Each provider has a distinct
physiological profile so the dashboard looks realistic.
"""
from __future__ import annotations

import hashlib
import math
import random
from datetime import datetime, timedelta

from .base_adapter import DailySummaryPayload, ObservationPayload

# ── Provider metric profiles ─────────────────────────────────────────────────

_PROFILES: dict[str, dict] = {
    "apple_healthkit": {
        "rhr": (58, 72), "hrv": (40, 70), "sleep": (6.5, 8.2),
        "steps": (5000, 12000), "spo2": (95.5, 99.0),
        "skin_temp": (-0.3, 0.5), "readiness": (60, 95),
    },
    "google_health": {
        "rhr": (60, 78), "hrv": (35, 60), "sleep": (5.5, 7.8),
        "steps": (4000, 11000), "spo2": (95.0, 98.5),
        "skin_temp": (-0.2, 0.4), "readiness": None,
    },
    "fitbit": {
        "rhr": (60, 76), "hrv": (30, 55), "sleep": (5.8, 7.2),
        "steps": (6000, 11000), "spo2": (94.0, 99.0),
        "skin_temp": (-0.5, 0.6), "readiness": None,
    },
    "garmin_connect": {
        "rhr": (52, 68), "hrv": (45, 80), "sleep": (6.0, 7.8),
        "steps": (8000, 18000), "spo2": (95.0, 99.5),
        "skin_temp": None, "readiness": (55, 100),
    },
    "oura_ring": {
        "rhr": (54, 66), "hrv": (50, 85), "sleep": (7.0, 8.8),
        "steps": (3000, 9000), "spo2": (95.0, 99.0),
        "skin_temp": (-0.4, 0.8), "readiness": (65, 98),
    },
    "whoop": {
        "rhr": (50, 64), "hrv": (55, 95), "sleep": (6.5, 8.5),
        "steps": None, "spo2": (95.0, 99.0),
        "skin_temp": (-0.2, 0.3), "readiness": (30, 100),
    },
}


def _seed(patient_id: str, date_str: str, salt: str = "") -> random.Random:
    """Create a seeded Random from patient+date for reproducibility."""
    h = hashlib.sha256(f"{patient_id}:{date_str}:{salt}".encode()).hexdigest()
    return random.Random(int(h[:12], 16))


def _rand_in(rng: random.Random, lo: float, hi: float) -> float:
    return round(rng.uniform(lo, hi), 2)


def _trend_offset(day_index: int, total_days: int) -> float:
    """Slight upward trend over the period (0.0 to ~0.1)."""
    if total_days <= 1:
        return 0.0
    return 0.05 * math.sin(math.pi * day_index / total_days)


def _weekend_bonus(date_str: str) -> float:
    """Weekend sleep/step modifier."""
    try:
        dow = datetime.strptime(date_str, "%Y-%m-%d").weekday()
    except ValueError:
        return 0.0
    return 0.3 if dow >= 5 else 0.0


def generate_daily_summaries(
    provider_id: str,
    patient_id: str,
    date_from: str,
    date_to: str,
) -> list[DailySummaryPayload]:
    """Generate deterministic daily summaries for a date range."""
    profile = _PROFILES.get(provider_id, _PROFILES["fitbit"])
    results: list[DailySummaryPayload] = []
    d_from = datetime.strptime(date_from, "%Y-%m-%d")
    d_to = datetime.strptime(date_to, "%Y-%m-%d")
    total_days = max(1, (d_to - d_from).days + 1)

    for i in range(total_days):
        day = d_from + timedelta(days=i)
        ds = day.strftime("%Y-%m-%d")
        rng = _seed(patient_id, ds, provider_id)
        t = _trend_offset(i, total_days)
        wb = _weekend_bonus(ds)

        rhr = None
        if profile.get("rhr"):
            lo, hi = profile["rhr"]
            rhr = round(_rand_in(rng, lo, hi) - t * 5, 1)

        hrv = None
        if profile.get("hrv"):
            lo, hi = profile["hrv"]
            hrv = round(_rand_in(rng, lo, hi) + t * 8, 1)

        sleep_h = None
        if profile.get("sleep"):
            lo, hi = profile["sleep"]
            sleep_h = round(_rand_in(rng, lo, hi) + wb * 0.5 + t * 0.3, 2)

        steps = None
        if profile.get("steps"):
            lo, hi = profile["steps"]
            raw = _rand_in(rng, lo, hi) - wb * 1500
            steps = max(500, int(raw))

        spo2 = None
        if profile.get("spo2"):
            lo, hi = profile["spo2"]
            spo2 = round(_rand_in(rng, lo, hi), 1)

        skin_temp = None
        if profile.get("skin_temp"):
            lo, hi = profile["skin_temp"]
            skin_temp = round(_rand_in(rng, lo, hi), 2)

        readiness = None
        if profile.get("readiness"):
            lo, hi = profile["readiness"]
            readiness = round(_rand_in(rng, lo, hi) + t * 5, 1)

        results.append(DailySummaryPayload(
            date=ds,
            rhr_bpm=rhr,
            hrv_ms=hrv,
            sleep_duration_h=sleep_h,
            sleep_consistency_score=round(rng.uniform(60, 95), 1) if sleep_h else None,
            steps=steps,
            spo2_pct=spo2,
            skin_temp_delta=skin_temp,
            readiness_score=readiness,
            mood_score=round(rng.uniform(2.5, 4.8), 1),
            pain_score=round(rng.uniform(0.5, 3.0), 1),
            anxiety_score=round(rng.uniform(1.0, 5.0), 1),
        ))

    return results


def generate_observations(
    provider_id: str,
    patient_id: str,
    date_from: str,
    date_to: str,
    metric_type: str = "heart_rate",
) -> list[ObservationPayload]:
    """Generate hourly observations for a metric over a date range."""
    profile = _PROFILES.get(provider_id, _PROFILES["fitbit"])
    results: list[ObservationPayload] = []
    d_from = datetime.strptime(date_from, "%Y-%m-%d")
    d_to = datetime.strptime(date_to, "%Y-%m-%d")
    total_days = max(1, (d_to - d_from).days + 1)

    metric_map = {
        "heart_rate": ("rhr", "bpm"),
        "hrv": ("hrv", "ms"),
        "steps": ("steps", "count"),
        "spo2": ("spo2", "%"),
        "sleep": ("sleep", "hours"),
    }
    profile_key, unit = metric_map.get(metric_type, ("rhr", ""))
    bounds = profile.get(profile_key)
    if bounds is None:
        return results

    lo, hi = bounds
    for i in range(min(total_days, 90)):
        day = d_from + timedelta(days=i)
        for hour in range(0, 24, 2):
            ts = day.replace(hour=hour)
            rng = _seed(patient_id, ts.isoformat(), f"{provider_id}:{metric_type}")
            hr_bump = 15 if 8 <= hour <= 20 else 0
            if metric_type == "heart_rate":
                val = _rand_in(rng, lo, hi + hr_bump)
            else:
                val = _rand_in(rng, lo, hi)
            results.append(ObservationPayload(
                metric_type=metric_type,
                value=val,
                unit=unit,
                observed_at=ts.isoformat(),
                aggregation_window="2h",
                quality_flag="good",
            ))

    return results


def generate_sync_events(
    provider_id: str,
    patient_id: str,
    count: int = 15,
) -> list[dict]:
    """Generate mock sync history events."""
    events = []
    now = datetime.utcnow()
    rng = _seed(patient_id, provider_id, "sync_events")
    for i in range(count):
        ts = now - timedelta(hours=i * 8 + rng.randint(0, 3))
        status = rng.choices(
            ["sync_completed", "sync_completed", "sync_completed", "error"],
            weights=[7, 7, 7, 1],
        )[0]
        records = rng.randint(12, 96) if status == "sync_completed" else 0
        events.append({
            "event_type": status,
            "occurred_at": ts.isoformat(),
            "records_synced": records,
            "error_detail": "Timeout connecting to vendor API" if status == "error" else None,
            "source": "vendor_api",
        })
    return events
