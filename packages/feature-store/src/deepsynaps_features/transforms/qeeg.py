from __future__ import annotations

from typing import Any, Dict, Mapping

from .base import _iter_event_rows


def compute_online(event: Mapping[str, Any]) -> Dict[str, Any]:
    payload = dict(event.get("payload") or {})
    features = {
        "tenant_id": event.get("tenant_id"),
        "patient_id": event.get("patient_id"),
        "occurred_at": event.get("occurred_at"),
        "session_id": payload.get("session_id"),
        "recording_duration_s": payload.get("recording_duration_s"),
        "alpha_power": payload.get("alpha_power"),
        "beta_power": payload.get("beta_power"),
        "theta_power": payload.get("theta_power"),
        "delta_power": payload.get("delta_power"),
        "alpha_peak_hz": payload.get("alpha_peak_hz"),
        "band_power_ratio_ab": payload.get("band_power_ratio_ab"),
        "artifact_pct": payload.get("artifact_pct"),
    }
    return {k: v for k, v in features.items() if v is not None}


def compute_batch(events_df: Any) -> Any:
    rows = [compute_online(r) for r in _iter_event_rows(events_df)]
    try:
        import pandas as pd  # type: ignore

        return pd.DataFrame(rows)
    except Exception:
        return rows

