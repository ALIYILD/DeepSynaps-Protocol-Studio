from datetime import UTC, datetime

import pytest

from deeptwin_neuroai_lab.event_timeline import EventTimeline
from deeptwin_neuroai_lab.schemas import EventType, Modality, PatientDataEvent


def _ev(eid: str, ts: datetime, modality: Modality) -> PatientDataEvent:
    return PatientDataEvent(
        event_id=eid,
        patient_id="p1",
        event_type=EventType.observation,
        modality=modality,
        timestamp=ts,
        source="test",
        payload={},
        research_only=True,
    )


def test_timeline_sort_chronologically():
    t = EventTimeline(
        [
            _ev("b", datetime(2024, 2, 1, tzinfo=UTC), Modality.eeg),
            _ev("a", datetime(2024, 1, 1, tzinfo=UTC), Modality.mri),
        ]
    )
    ordered = t.sort_chronologically()
    assert [e.event_id for e in ordered] == ["a", "b"]


def test_filter_modality_and_date_range():
    t = EventTimeline(
        [
            _ev("1", datetime(2024, 1, 5, tzinfo=UTC), Modality.qeeg),
            _ev("2", datetime(2024, 3, 1, tzinfo=UTC), Modality.qeeg),
            _ev("3", datetime(2024, 2, 1, tzinfo=UTC), Modality.mri),
        ]
    )
    assert len(t.filter_by_modality(Modality.qeeg)) == 2
    r = t.filter_by_date_range(
        start=datetime(2024, 2, 1, tzinfo=UTC),
        end=datetime(2024, 2, 28, tzinfo=UTC),
    )
    assert {e.event_id for e in r} == {"3"}


def test_group_by_modality():
    t = EventTimeline([_ev("1", datetime(2024, 1, 1, tzinfo=UTC), Modality.eeg)])
    g = t.group_by_modality()
    assert Modality.eeg in g


def test_detect_missing_modalities():
    t = EventTimeline([_ev("1", datetime(2024, 1, 1, tzinfo=UTC), Modality.eeg)])
    missing = t.detect_missing_modalities(desired=[Modality.eeg, Modality.mri])
    assert missing == [Modality.mri]


def test_summary_contains_association_language_not_causal():
    t = EventTimeline([_ev("1", datetime(2024, 1, 1, tzinfo=UTC), Modality.intervention)])
    s = t.create_patient_timeline_summary("p1")
    blob = str(s)
    assert "association" in blob.lower() or "temporal" in blob.lower()
    assert "caused" not in blob.lower()


def test_remove_event():
    tl = EventTimeline([_ev("x", datetime(2024, 1, 1, tzinfo=UTC), Modality.other)])
    assert tl.remove_event("x") is True
    assert tl.list_events() == []
