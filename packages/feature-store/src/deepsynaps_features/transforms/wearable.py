from __future__ import annotations

from typing import Any, Dict, Mapping

from .base import _iter_event_rows


def compute_online(event: Mapping[str, Any]) -> Dict[str, Any]:
    payload = dict(event.get("payload") or {})
    features = {
        "tenant_id": event.get("tenant_id"),
        "patient_id": event.get("patient_id"),
        "occurred_at": event.get("occurred_at"),
        "device_id": payload.get("device_id"),
        "steps_24h": payload.get("steps_24h"),
        "sleep_minutes_24h": payload.get("sleep_minutes_24h"),
        "resting_hr_bpm": payload.get("resting_hr_bpm"),
        "hrv_rmssd_ms": payload.get("hrv_rmssd_ms"),
        "activity_minutes_24h": payload.get("activity_minutes_24h"),
        "calories_kcal_24h": payload.get("calories_kcal_24h"),
        "spo2_pct": payload.get("spo2_pct"),
    }
    return {k: v for k, v in features.items() if v is not None}


def compute_batch(events_df: Any) -> Any:
    rows = [compute_online(r) for r in _iter_event_rows(events_df)]
    try:
        import pandas as pd  # type: ignore

        return pd.DataFrame(rows)
    except Exception:
        return rows

