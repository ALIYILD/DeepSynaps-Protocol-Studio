from __future__ import annotations

from typing import Any, Dict, Mapping

from .base import _iter_event_rows


def compute_online(event: Mapping[str, Any]) -> Dict[str, Any]:
    payload = dict(event.get("payload") or {})
    features = {
        "tenant_id": event.get("tenant_id"),
        "patient_id": event.get("patient_id"),
        "occurred_at": event.get("occurred_at"),
        "clip_id": payload.get("clip_id"),
        "duration_s": payload.get("duration_s"),
        "fps": payload.get("fps"),
        "num_faces_detected": payload.get("num_faces_detected"),
        "affect_valence": payload.get("affect_valence"),
        "affect_arousal": payload.get("affect_arousal"),
    }
    return {k: v for k, v in features.items() if v is not None}


def compute_batch(events_df: Any) -> Any:
    rows = [compute_online(r) for r in _iter_event_rows(events_df)]
    try:
        import pandas as pd  # type: ignore

        return pd.DataFrame(rows)
    except Exception:
        return rows

