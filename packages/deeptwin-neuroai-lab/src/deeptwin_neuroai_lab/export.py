"""JSON-serializable exports for lab previews."""

from __future__ import annotations

import json
from typing import Any

from deeptwin_neuroai_lab.event_timeline import EventTimeline
from deeptwin_neuroai_lab.feature_extractors import extract_features
from deeptwin_neuroai_lab.schemas import PatientDataEvent


def export_timeline_json(timeline: EventTimeline, patient_id: str | None = None) -> str:
    summary = timeline.create_patient_timeline_summary(patient_id)
    return json.dumps(summary, indent=2)


def export_features_bundle(events: list[PatientDataEvent]) -> dict[str, Any]:
    out: dict[str, Any] = {"events": [], "research_only": True}
    for e in events:
        fx = extract_features(e)
        out["events"].append(
            {
                "event_id": e.event_id,
                "modality": e.modality.value,
                "features": fx.model_dump(mode="json"),
            }
        )
    return out
