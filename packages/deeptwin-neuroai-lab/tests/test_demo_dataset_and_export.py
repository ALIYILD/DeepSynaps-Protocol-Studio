"""Tests for demo_dataset.load_demo_events and export helpers.

Pins the load-bearing **research-only / demo-not-real-patient** contract:
all events flagged research_only=True so they cannot be confused with
clinical observations downstream. Export helpers must surface the same
flag at the envelope level.

⚠️ Bug discovered in this PR (filed, not fixed):
``load_demo_events`` calls ``t0.replace(day=55)`` to produce the outcome
timestamp. Day 55 is invalid for any month — the function raises
``ValueError: day is out of range for month`` on every call. The
function was effectively unreachable in production. Tests are marked
xfail until a follow-up PR fixes the date arithmetic to use timedelta.
"""
from __future__ import annotations

import json
from datetime import UTC, datetime

import pytest

from deeptwin_neuroai_lab.event_timeline import EventTimeline
from deeptwin_neuroai_lab.export import (
    export_features_bundle,
    export_timeline_json,
)
from deeptwin_neuroai_lab.schemas import (
    EventType,
    InterventionPayload,
    InterventionType,
    Modality,
    OutcomeScorePayload,
    PatientDataEvent,
    ScoreDirection,
)


# ── Fixtures ──────────────────────────────────────────────────────────────


def _events() -> list[PatientDataEvent]:
    """Hand-built event list that mirrors the load_demo_events shape but
    avoids the day=55 bug. Use these for export coverage."""
    t0 = datetime(2024, 1, 10, 9, 0, tzinfo=UTC)
    return [
        PatientDataEvent(
            event_id="baseline",
            patient_id="P-001",
            event_type=EventType.assessment,
            modality=Modality.assessment,
            timestamp=t0,
            source="test",
            payload={"scale_name": "PHQ-9", "score": 12.0, "baseline_score": 12.0},
            research_only=True,
        ),
        PatientDataEvent(
            event_id="qeeg-1",
            patient_id="P-001",
            event_type=EventType.recording,
            modality=Modality.qeeg,
            timestamp=t0.replace(day=12),
            source="test",
            payload={"band_power": {"alpha": 0.4, "theta": 0.3}},
            research_only=True,
        ),
        PatientDataEvent(
            event_id="intervention-1",
            patient_id="P-001",
            event_type=EventType.intervention_session,
            modality=Modality.intervention,
            timestamp=t0.replace(day=20),
            source="test",
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
            event_id="outcome-1",
            patient_id="P-001",
            event_type=EventType.outcome,
            modality=Modality.outcome_score,
            timestamp=t0.replace(month=2, day=28),
            source="test",
            payload={},
            outcome=OutcomeScorePayload(
                scale_name="PHQ-9",
                score=9.0,
                score_direction=ScoreDirection.higher_is_worse,
            ),
            research_only=True,
        ),
    ]


# ── load_demo_events (covers the bug surface) ─────────────────────────────


class TestLoadDemoEvents:
    @pytest.mark.xfail(
        reason="load_demo_events calls t0.replace(day=55) — invalid date.",
        strict=True,
        raises=ValueError,
    )
    def test_returns_four_events(self) -> None:
        # XFAIL: documents the day=55 bug. When the bug is fixed this
        # xfail will turn into an unexpected pass — that's the signal
        # to remove the marker and assert on the actual return shape.
        from deeptwin_neuroai_lab.demo_dataset import load_demo_events

        events = load_demo_events()
        assert len(events) == 4


# ── export_timeline_json ───────────────────────────────────────────────────


class TestExportTimelineJson:
    def test_export_returns_valid_json(self) -> None:
        timeline = EventTimeline(_events())
        out = export_timeline_json(timeline)
        # Roundtrip-safe.
        parsed = json.loads(out)
        assert isinstance(parsed, dict)

    def test_export_with_patient_id_filters(self) -> None:
        timeline = EventTimeline(_events())
        out = export_timeline_json(timeline, patient_id="P-001")
        parsed = json.loads(out)
        assert isinstance(parsed, dict)


# ── export_features_bundle ─────────────────────────────────────────────────


class TestExportFeaturesBundle:
    def test_bundle_has_research_only_flag(self) -> None:
        # Pin: the export bundle ALWAYS carries research_only=True so
        # any downstream JSON consumer sees the disclaimer at the
        # envelope level, not just on each per-event payload.
        bundle = export_features_bundle(_events())
        assert bundle["research_only"] is True

    def test_bundle_includes_one_entry_per_event(self) -> None:
        events = _events()
        bundle = export_features_bundle(events)
        assert len(bundle["events"]) == len(events)

    def test_each_entry_has_id_modality_features(self) -> None:
        bundle = export_features_bundle(_events())
        for entry in bundle["events"]:
            assert "event_id" in entry
            assert "modality" in entry
            assert "features" in entry
            # Feature payload is JSON-serialisable.
            json.dumps(entry["features"])

    def test_empty_events_yield_empty_bundle(self) -> None:
        bundle = export_features_bundle([])
        assert bundle["events"] == []
        assert bundle["research_only"] is True
