"""Synthetic demo events for offline lab previews — not real patients."""

from __future__ import annotations

from datetime import UTC, datetime

from deeptwin_neuroai_lab.schemas import (
    EventType,
    InterventionPayload,
    InterventionType,
    Modality,
    OutcomeScorePayload,
    PatientDataEvent,
    ScoreDirection,
)


def load_demo_events() -> list[PatientDataEvent]:
    """Clearly synthetic timeline for tests and UI scaffolding."""

    t0 = datetime(2024, 1, 10, 9, 0, tzinfo=UTC)
    return [
        PatientDataEvent(
            event_id="demo-baseline-assessment",
            patient_id="demo-patient-synthetic",
            event_type=EventType.assessment,
            modality=Modality.assessment,
            timestamp=t0,
            source="demo_dataset",
            payload={"scale_name": "PHQ-9", "score": 12.0, "baseline_score": 12.0},
            research_only=True,
            clinician_verified=False,
        ),
        PatientDataEvent(
            event_id="demo-qeeg",
            patient_id="demo-patient-synthetic",
            event_type=EventType.recording,
            modality=Modality.qeeg,
            timestamp=t0.replace(day=12),
            source="demo_dataset",
            payload={"band_power": {"alpha": 0.4, "theta": 0.3}},
            research_only=True,
        ),
        PatientDataEvent(
            event_id="demo-intervention-1",
            patient_id="demo-patient-synthetic",
            event_type=EventType.intervention_session,
            modality=Modality.intervention,
            timestamp=t0.replace(day=20),
            source="demo_dataset",
            payload={"session_number": 1},
            intervention=InterventionPayload(
                intervention_type=InterventionType.tDCS,
                target="M1_contra",
                duration_minutes=20.0,
                session_number=1,
                clinician_approved=True,
            ),
            research_only=True,
        ),
        PatientDataEvent(
            event_id="demo-outcome",
            patient_id="demo-patient-synthetic",
            event_type=EventType.outcome,
            modality=Modality.outcome_score,
            timestamp=t0.replace(day=55),
            source="demo_dataset",
            payload={},
            outcome=OutcomeScorePayload(
                scale_name="PHQ-9",
                score=9.0,
                score_direction=ScoreDirection.higher_is_worse,
            ),
            research_only=True,
        ),
    ]
