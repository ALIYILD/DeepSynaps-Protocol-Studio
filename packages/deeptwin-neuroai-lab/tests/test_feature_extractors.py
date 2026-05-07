from datetime import UTC, datetime

from deeptwin_neuroai_lab.feature_extractors import extract_features
from deeptwin_neuroai_lab.schemas import (
    EventType,
    InterventionPayload,
    InterventionType,
    Modality,
    PatientDataEvent,
)


def test_feature_extraction_research_only():
    ev = PatientDataEvent(
        event_id="1",
        modality=Modality.eeg,
        timestamp=datetime.now(tz=UTC),
        event_type=EventType.recording,
        payload={"band_power": {"alpha": 1.0}},
        research_only=True,
    )
    r = extract_features(ev)
    assert r.research_only is True


def test_assessment_delta():
    ev = PatientDataEvent(
        event_id="2",
        modality=Modality.assessment,
        timestamp=datetime.now(tz=UTC),
        event_type=EventType.assessment,
        payload={"score": 10, "baseline_score": 12, "scale_name": "X"},
        research_only=True,
    )
    r = extract_features(ev)
    assert r.features.get("delta_vs_baseline") == -2


def test_intervention_stub():
    ev = PatientDataEvent(
        event_id="3",
        modality=Modality.intervention,
        timestamp=datetime.now(tz=UTC),
        event_type=EventType.intervention_session,
        intervention=InterventionPayload(
            intervention_type=InterventionType.tDCS,
            target="DLPFC",
            duration_minutes=20,
            clinician_approved=True,
        ),
        research_only=True,
    )
    r = extract_features(ev)
    assert "no_automatic_parameter_change" in r.safety_flags
