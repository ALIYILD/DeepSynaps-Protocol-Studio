from __future__ import annotations

from typing import Any, Dict, Mapping

from .base import _iter_event_rows


def compute_online(event: Mapping[str, Any]) -> Dict[str, Any]:
    payload = dict(event.get("payload") or {})
    features = {
        "tenant_id": event.get("tenant_id"),
        "patient_id": event.get("patient_id"),
        "occurred_at": event.get("occurred_at"),
        "diagnosis_codes": payload.get("diagnosis_codes"),
        "medication_codes": payload.get("medication_codes"),
        "num_active_meds": payload.get("num_active_meds"),
        "bmi": payload.get("bmi"),
        "sbp_mmHg": payload.get("sbp_mmHg"),
        "dbp_mmHg": payload.get("dbp_mmHg"),
    }
    return {k: v for k, v in features.items() if v is not None}


def compute_batch(events_df: Any) -> Any:
    rows = [compute_online(r) for r in _iter_event_rows(events_df)]
    try:
        import pandas as pd  # type: ignore

        return pd.DataFrame(rows)
    except Exception:
        return rows

