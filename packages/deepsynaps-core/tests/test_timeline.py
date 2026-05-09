"""Tests for deepsynaps_core.timeline.

Locks the contract for PatientEvent + every from_* convenience constructor.
The timeline is the append-only event log every subsystem reads from and
writes to, so the constructor surface is load-bearing for downstream code.
"""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from deepsynaps_core.timeline import (
    EventKind,
    PatientEvent,
    from_agent_action,
    from_crisis_alert,
    from_mri_report,
    from_prom,
    from_qeeg_report,
    from_wearable_day,
)


class TestPatientEvent:
    def test_minimal_construction(self) -> None:
        ev = PatientEvent(
            patient_id="p-1",
            kind=EventKind.system_note,
            source="other",
        )
        assert ev.patient_id == "p-1"
        assert ev.kind is EventKind.system_note
        assert isinstance(ev.event_id, UUID)
        assert ev.t_utc.tzinfo is timezone.utc
        assert ev.contains_phi is True
        assert ev.visibility == "clinician"
        assert ev.created_by_kind == "system"

    def test_event_kinds_are_strings(self) -> None:
        # EventKind is str-Enum so payloads serialize cleanly.
        assert EventKind.qeeg_analysis.value == "qeeg_analysis"
        assert EventKind.crisis_alert.value == "crisis_alert"

    def test_idempotency_key_optional(self) -> None:
        ev = PatientEvent(patient_id="p-1", kind=EventKind.ingest, source="other")
        assert ev.idempotency_key is None


class TestFromMriReport:
    def test_kind_and_source_set(self) -> None:
        ev = from_mri_report("p-1", {"analysis_id": "MRI-1", "pipeline_version": "v3"})
        assert ev.kind is EventKind.mri_analysis
        assert ev.source == "mri_analyzer"
        assert ev.source_version == "v3"

    def test_idempotency_key_derives_from_analysis_id(self) -> None:
        ev = from_mri_report("p-1", {"analysis_id": "MRI-99"})
        assert ev.idempotency_key == "mri::MRI-99"

    def test_payload_passthrough(self) -> None:
        report = {"analysis_id": "MRI-1", "extras": {"k": "v"}}
        ev = from_mri_report("p-1", report)
        assert ev.payload == report


class TestFromQeegReport:
    def test_kind_and_source_set(self) -> None:
        ev = from_qeeg_report("p-1", {"analysis_id": "Q-1", "pipeline_version": "qv2"})
        assert ev.kind is EventKind.qeeg_analysis
        assert ev.source == "qeeg_analyzer"
        assert ev.source_version == "qv2"

    def test_idempotency_key_derives_from_analysis_id(self) -> None:
        ev = from_qeeg_report("p-1", {"analysis_id": "Q-77"})
        assert ev.idempotency_key == "qeeg::Q-77"


class TestFromWearableDay:
    def test_kind_source_idempotency(self) -> None:
        ev = from_wearable_day(
            "p-1",
            "wearable_oura",
            "2026-05-08",
            {"hrv_ms": 42, "sleep_score": 80},
        )
        assert ev.kind is EventKind.wearable_day
        assert ev.source == "wearable_oura"
        assert ev.idempotency_key == "wearable_oura::2026-05-08"

    def test_payload_includes_date_and_summary(self) -> None:
        ev = from_wearable_day("p-1", "wearable_apple", "2026-05-08", {"hr_avg": 60})
        assert ev.payload["date"] == "2026-05-08"
        assert ev.payload["hr_avg"] == 60


class TestFromProm:
    def test_kind_and_source(self) -> None:
        ev = from_prom("p-1", "PHQ-9", 12.0, {"q1": 2, "q2": 3})
        assert ev.kind is EventKind.prom_score
        assert ev.source == "prom_app"

    def test_payload_shape(self) -> None:
        ev = from_prom("p-1", "GAD-7", 8.0, {"q1": 1})
        assert ev.payload["instrument"] == "GAD-7"
        assert ev.payload["total"] == 8.0
        assert ev.payload["answers"] == {"q1": 1}


class TestFromCrisisAlert:
    def test_kind_source_visibility(self) -> None:
        ev = from_crisis_alert(
            "p-1",
            risk=0.92,
            tier="red",
            drivers=[{"feature": "phq9_q9", "value": 3}],
        )
        assert ev.kind is EventKind.crisis_alert
        assert ev.source == "risk_engine"
        assert ev.visibility == "clinician"

    def test_payload_carries_risk_and_drivers(self) -> None:
        ev = from_crisis_alert("p-1", 0.5, "yellow", [])
        assert ev.payload["risk"] == 0.5
        assert ev.payload["tier"] == "yellow"
        assert ev.payload["drivers"] == []


class TestFromAgentAction:
    def test_draft_kind(self) -> None:
        ev = from_agent_action(
            "p-1", "agent-7", "summarize_intake", draft=True, content={"text": "..."},
        )
        assert ev.kind is EventKind.agent_draft
        assert ev.source == "openclaw_agent"
        assert ev.created_by == "agent-7"
        assert ev.created_by_kind == "agent"

    def test_committed_kind(self) -> None:
        ev = from_agent_action(
            "p-1", "agent-7", "summarize_intake", draft=False, content={"text": "..."},
        )
        assert ev.kind is EventKind.agent_action

    def test_default_sources_empty_list(self) -> None:
        ev = from_agent_action(
            "p-1", "agent-7", "x", draft=True, content={},
        )
        assert ev.payload["sources"] == []

    def test_explicit_sources_passthrough(self) -> None:
        ev = from_agent_action(
            "p-1", "agent-7", "x", draft=True, content={}, sources=["pmid:1", "pmid:2"],
        )
        assert ev.payload["sources"] == ["pmid:1", "pmid:2"]
