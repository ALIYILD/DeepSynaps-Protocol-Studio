from __future__ import annotations

from typing import Any, Dict, Mapping

from .base import _iter_event_rows


def compute_online(event: Mapping[str, Any]) -> Dict[str, Any]:
    payload = dict(event.get("payload") or {})
    features = {
        "tenant_id": event.get("tenant_id"),
        "patient_id": event.get("patient_id"),
        "occurred_at": event.get("occurred_at"),
        "protocol_id": payload.get("protocol_id"),
        "session_number": payload.get("session_number"),
        "session_duration_min": payload.get("session_duration_min"),
        "adherence_pct": payload.get("adherence_pct"),
        "side_effects_present": payload.get("side_effects_present"),
        "self_reported_relief": payload.get("self_reported_relief"),
        "notes_len": payload.get("notes_len"),
    }
    return {k: v for k, v in features.items() if v is not None}


def compute_batch(events_df: Any) -> Any:
    rows = [compute_online(r) for r in _iter_event_rows(events_df)]
    try:
        import pandas as pd  # type: ignore

        return pd.DataFrame(rows)
    except Exception:
        return rows

