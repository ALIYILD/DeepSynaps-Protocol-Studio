from __future__ import annotations

from typing import Any, Dict, Mapping

from .base import _iter_event_rows


def compute_online(event: Mapping[str, Any]) -> Dict[str, Any]:
    payload = dict(event.get("payload") or {})
    features = {
        "tenant_id": event.get("tenant_id"),
        "patient_id": event.get("patient_id"),
        "occurred_at": event.get("occurred_at"),
        "utterance_id": payload.get("utterance_id"),
        "duration_s": payload.get("duration_s"),
        "sample_rate_hz": payload.get("sample_rate_hz"),
        "speech_rate_wpm": payload.get("speech_rate_wpm"),
        "pitch_mean_hz": payload.get("pitch_mean_hz"),
        "energy_mean": payload.get("energy_mean"),
    }
    return {k: v for k, v in features.items() if v is not None}


def compute_batch(events_df: Any) -> Any:
    rows = [compute_online(r) for r in _iter_event_rows(events_df)]
    try:
        import pandas as pd  # type: ignore

        return pd.DataFrame(rows)
    except Exception:
        return rows

