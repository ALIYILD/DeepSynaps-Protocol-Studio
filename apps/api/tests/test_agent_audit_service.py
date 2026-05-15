"""Comprehensive tests for the Agent Audit Service.

Covers:
* Recording lifecycle events (viewed, rented, tool called, approved).
* Patient context access recording with safety flags.
* Clinic-scoped audit log queries.
* Agent and event-type filtered queries.
* Safety-flagged event retrieval (clinical review queue).
* Audit summary aggregation.
* Audit log retention / pruning.
* Global audit log (super-admin cross-clinic view).
* Clinical safety assertions (disclaimers, PHI access flags).
"""
from __future__ import annotations

import pytest
from datetime import datetime, timedelta, timezone

from app.services.agent_audit_service import (
    AgentAuditEvent,
    CANONICAL_EVENT_TYPES,
    record_event,
    record_agent_viewed,
    record_agent_rented,
    record_tool_called,
    record_tool_approved,
    record_patient_context_accessed,
    get_audit_log,
    get_global_audit_log,
    get_safety_flagged_events,
    get_audit_summary,
    clear_audit_store,
    prune_old_events,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def _clear_store() -> None:
    """Reset the in-memory audit store before every test."""
    clear_audit_store()


@pytest.fixture
def sample_agent_id() -> str:
    return "clinic.reception"


@pytest.fixture
def sample_clinic_id() -> str:
    return "clinic-demo"


@pytest.fixture
def sample_actor_id() -> str:
    return "actor-clinician-1"


@pytest.fixture
def sample_actor_role() -> str:
    return "clinician"


# ---------------------------------------------------------------------------
# record_agent_viewed
# ---------------------------------------------------------------------------


def test_record_agent_viewed(
    sample_agent_id: str,
    sample_clinic_id: str,
    sample_actor_id: str,
    sample_actor_role: str,
) -> None:
    """View event is recorded with correct fields."""
    record_agent_viewed(sample_agent_id, sample_clinic_id, sample_actor_id, sample_actor_role)

    log = get_audit_log(sample_clinic_id, sample_agent_id)
    assert len(log) == 1
    event = log[0]
    assert event["event_type"] == "agent.viewed"
    assert event["agent_id"] == sample_agent_id
    assert event["clinic_id"] == sample_clinic_id
    assert event["actor_id"] == sample_actor_id
    assert event["actor_role"] == sample_actor_role
    assert event["safety_flag"] is False
    assert "timestamp" in event


# ---------------------------------------------------------------------------
# record_agent_rented
# ---------------------------------------------------------------------------


def test_record_agent_rented(
    sample_agent_id: str,
    sample_clinic_id: str,
    sample_actor_id: str,
    sample_actor_role: str,
) -> None:
    """Rental event is recorded with billing plan details."""
    record_agent_rented(sample_agent_id, sample_clinic_id, sample_actor_id, sample_actor_role, "pro")

    log = get_audit_log(sample_clinic_id, sample_agent_id)
    assert len(log) == 1
    event = log[0]
    assert event["event_type"] == "agent.rented"
    assert event["details"]["billing_plan"] == "pro"
    assert event["safety_flag"] is False


# ---------------------------------------------------------------------------
# record_tool_called
# ---------------------------------------------------------------------------


def test_record_tool_called(
    sample_agent_id: str,
    sample_clinic_id: str,
    sample_actor_id: str,
    sample_actor_role: str,
) -> None:
    """Tool call event is recorded with evidence grade."""
    record_tool_called(
        sample_agent_id,
        sample_clinic_id,
        sample_actor_id,
        sample_actor_role,
        tool_id="read.schedule",
        patient_id="patient-99",
        evidence_grade="A",
    )

    log = get_audit_log(sample_clinic_id, sample_agent_id)
    assert len(log) == 1
    event = log[0]
    assert event["event_type"] == "tool.called"
    assert event["tool_id"] == "read.schedule"
    assert event["patient_id"] == "patient-99"
    assert event["evidence_grade"] == "A"
    # tool.called is in _CLINICAL_REVIEW_EVENTS -> safety_flag auto-set
    assert event["safety_flag"] is True


# ---------------------------------------------------------------------------
# record_tool_approved
# ---------------------------------------------------------------------------


def test_record_tool_approved(
    sample_agent_id: str,
    sample_clinic_id: str,
    sample_actor_id: str,
    sample_actor_role: str,
) -> None:
    """Approval event is recorded with safety flag."""
    record_tool_approved(
        sample_agent_id,
        sample_clinic_id,
        sample_actor_id,
        sample_actor_role,
        tool_id="write.appointment",
        patient_id="patient-42",
    )

    log = get_audit_log(sample_clinic_id, sample_agent_id)
    assert len(log) == 1
    event = log[0]
    assert event["event_type"] == "tool.approved"
    assert event["tool_id"] == "write.appointment"
    assert event["patient_id"] == "patient-42"
    assert event["safety_flag"] is True


# ---------------------------------------------------------------------------
# record_patient_context_accessed
# ---------------------------------------------------------------------------


def test_record_patient_context_accessed(
    sample_agent_id: str,
    sample_clinic_id: str,
    sample_actor_id: str,
    sample_actor_role: str,
) -> None:
    """PHI access is recorded with safety_flag=True and data types."""
    record_patient_context_accessed(
        sample_agent_id,
        sample_clinic_id,
        sample_actor_id,
        sample_actor_role,
        patient_id="patient-phi-1",
        data_types=["patient.summary", "medications.active", "assessments.recent"],
    )

    log = get_audit_log(sample_clinic_id, sample_agent_id)
    assert len(log) == 1
    event = log[0]
    assert event["event_type"] == "patient.context_accessed"
    assert event["patient_id"] == "patient-phi-1"
    assert event["details"]["data_types"] == [
        "patient.summary",
        "medications.active",
        "assessments.recent",
    ]
    # Critical: PHI access must always be safety-flagged
    assert event["safety_flag"] is True
    # Decision-support disclaimer must be present
    assert "decision-support only" in event["decision_support_disclaimer"]


# ---------------------------------------------------------------------------
# get_audit_log — clinic scoped
# ---------------------------------------------------------------------------


def test_get_audit_log_clinic_scoped() -> None:
    """Audit log queries are scoped to a single clinic."""
    # Clinic A events
    record_agent_viewed("clinic.reception", "clinic-a", "actor-1", "clinician")
    record_agent_viewed("clinic.dr_ai", "clinic-a", "actor-2", "admin")

    # Clinic B events
    record_agent_viewed("clinic.reception", "clinic-b", "actor-3", "clinician")
    record_agent_rented("clinic.nurse", "clinic-b", "actor-4", "admin", "enterprise")

    # Query clinic-a
    a_log = get_audit_log("clinic-a", "clinic.reception")
    assert len(a_log) == 1
    assert a_log[0]["clinic_id"] == "clinic-a"

    # Query clinic-b — should not leak clinic-a events
    b_log_all = []
    for agent_id in ["clinic.reception", "clinic.nurse"]:
        b_log_all.extend(get_audit_log("clinic-b", agent_id))
    assert len(b_log_all) == 2
    for event in b_log_all:
        assert event["clinic_id"] == "clinic-b"

    # Cross-clinic query on wrong agent returns empty
    assert get_audit_log("clinic-a", "clinic.reception") != []
    assert get_audit_log("clinic-b", "clinic.dr_ai") == []


# ---------------------------------------------------------------------------
# get_audit_log — agent filtered
# ---------------------------------------------------------------------------


def test_get_audit_log_agent_filtered() -> None:
    """Filtering by agent_id isolates events to a specific agent."""
    record_agent_viewed("clinic.reception", "clinic-demo", "actor-1", "clinician")
    record_agent_viewed("clinic.dr_ai", "clinic-demo", "actor-2", "clinician")
    record_tool_called("clinic.reception", "clinic-demo", "actor-1", "clinician",
                       tool_id="read.schedule")

    reception_log = get_audit_log("clinic-demo", "clinic.reception")
    assert len(reception_log) == 2
    for event in reception_log:
        assert event["agent_id"] == "clinic.reception"

    doctor_log = get_audit_log("clinic-demo", "clinic.dr_ai")
    assert len(doctor_log) == 1
    assert doctor_log[0]["agent_id"] == "clinic.dr_ai"


# ---------------------------------------------------------------------------
# get_audit_log — event type filtered
# ---------------------------------------------------------------------------


def test_get_audit_log_event_type_filtered() -> None:
    """Filtering by event_type returns only matching events."""
    record_agent_viewed("clinic.reception", "clinic-demo", "actor-1", "clinician")
    record_agent_rented("clinic.reception", "clinic-demo", "actor-2", "admin", "pro")
    record_tool_called("clinic.reception", "clinic-demo", "actor-1", "clinician",
                       tool_id="read.schedule")

    viewed_log = get_audit_log("clinic-demo", "clinic.reception", event_type="agent.viewed")
    assert len(viewed_log) == 1
    assert viewed_log[0]["event_type"] == "agent.viewed"

    rented_log = get_audit_log("clinic-demo", "clinic.reception", event_type="agent.rented")
    assert len(rented_log) == 1
    assert rented_log[0]["event_type"] == "agent.rented"

    tool_log = get_audit_log("clinic-demo", "clinic.reception", event_type="tool.called")
    assert len(tool_log) == 1
    assert tool_log[0]["event_type"] == "tool.called"

    # Non-existent event type returns empty
    empty_log = get_audit_log("clinic-demo", "clinic.reception", event_type="agent.revoked")
    assert len(empty_log) == 0


# ---------------------------------------------------------------------------
# get_safety_flagged_events — clinical review queue
# ---------------------------------------------------------------------------


def test_get_safety_flagged_events() -> None:
    """Safety-flagged events feed the clinical review queue."""
    # Non-safety events
    record_agent_viewed("clinic.reception", "clinic-demo", "actor-1", "clinician")
    record_agent_rented("clinic.dr_ai", "clinic-demo", "actor-2", "admin", "pro")

    # Safety-flagged events
    record_tool_called("clinic.reception", "clinic-demo", "actor-1", "clinician",
                       tool_id="write.appointment", patient_id="p-1")
    record_tool_approved("clinic.dr_ai", "clinic-demo", "actor-2", "clinician",
                         tool_id="write.clinical_report", patient_id="p-2")
    record_patient_context_accessed("clinic.reception", "clinic-demo", "actor-1", "clinician",
                                    patient_id="p-3", data_types=["patient.summary"])

    flagged = get_safety_flagged_events("clinic-demo", limit=50)
    assert len(flagged) == 3
    for event in flagged:
        assert event["safety_flag"] is True
        assert event["clinic_id"] == "clinic-demo"

    # Verify correct event types are flagged
    event_types = {e["event_type"] for e in flagged}
    assert "tool.called" in event_types
    assert "tool.approved" in event_types
    assert "patient.context_accessed" in event_types

    # Non-flagged events should not appear
    assert "agent.viewed" not in event_types
    assert "agent.rented" not in event_types


# ---------------------------------------------------------------------------
# get_audit_summary — aggregation
# ---------------------------------------------------------------------------


def test_get_audit_summary() -> None:
    """Summary aggregates total events, safety count, patient count, breakdown."""
    agent_id = "clinic.reception"
    clinic_id = "clinic-demo"

    # Seed 5 events: 2 non-safety, 3 safety
    record_agent_viewed(agent_id, clinic_id, "actor-1", "clinician")
    record_agent_rented(agent_id, clinic_id, "actor-2", "admin", "pro")
    record_tool_called(agent_id, clinic_id, "actor-1", "clinician",
                       tool_id="write.appointment", patient_id="p-1")
    record_tool_approved(agent_id, clinic_id, "actor-2", "clinician",
                         tool_id="write.appointment", patient_id="p-2")
    record_patient_context_accessed(agent_id, clinic_id, "actor-1", "clinician",
                                    patient_id="p-1", data_types=["summary"])

    summary = get_audit_summary(clinic_id, agent_id)
    assert summary["agent_id"] == agent_id
    assert summary["clinic_id"] == clinic_id
    assert summary["total_events"] == 5
    assert summary["safety_flagged_events"] == 3
    assert summary["unique_patients_accessed"] == 2  # p-1 and p-2
    assert "event_type_breakdown" in summary
    assert summary["event_type_breakdown"]["agent.viewed"] == 1
    assert summary["event_type_breakdown"]["agent.rented"] == 1
    assert summary["event_type_breakdown"]["tool.called"] == 1
    assert summary["event_type_breakdown"]["tool.approved"] == 1
    assert summary["event_type_breakdown"]["patient.context_accessed"] == 1
    assert summary["last_activity_at"] is not None


# ---------------------------------------------------------------------------
# prune_old_events — retention
# ---------------------------------------------------------------------------


def test_audit_log_retention() -> None:
    """Old events are purged by prune_old_events."""
    agent_id = "clinic.reception"
    clinic_id = "clinic-demo"

    # Create a fresh event
    record_agent_viewed(agent_id, clinic_id, "actor-1", "clinician")

    # Create an old event by manipulating timestamp directly
    old_event = AgentAuditEvent(
        event_type="agent.viewed",
        agent_id=agent_id,
        clinic_id=clinic_id,
        actor_id="actor-old",
        actor_role="clinician",
        timestamp=datetime.now(timezone.utc) - timedelta(days=30),
    )
    record_event(old_event)

    # Verify both events exist
    log_before = get_audit_log(clinic_id, agent_id, limit=100)
    assert len(log_before) == 2

    # Prune events older than 7 days.
    # Note: prune_old_events removes from BOTH the per-agent store AND
    # the global index, so removed may be 2 for a single old event.
    removed = prune_old_events(max_age_hours=168)
    assert removed >= 1

    # Only the fresh event remains in the per-agent store
    log_after = get_audit_log(clinic_id, agent_id, limit=100)
    assert len(log_after) == 1
    assert log_after[0]["actor_id"] == "actor-1"


# ---------------------------------------------------------------------------
# get_global_audit_log — super-admin cross-clinic view
# ---------------------------------------------------------------------------


def test_global_audit_log_super_admin() -> None:
    """Global audit log returns events across ALL clinics (super-admin only)."""
    # Clinic A
    record_agent_viewed("clinic.reception", "clinic-a", "actor-a1", "clinician")
    record_tool_called("clinic.dr_ai", "clinic-a", "actor-a2", "clinician",
                       tool_id="read.schedule")

    # Clinic B
    record_agent_rented("clinic.nurse", "clinic-b", "actor-b1", "admin", "enterprise")
    record_patient_context_accessed("clinic.reception", "clinic-b", "actor-b2", "clinician",
                                    patient_id="p-b", data_types=["summary"])

    # Global log should have all 4 events
    global_log = get_global_audit_log(limit=100)
    assert len(global_log) == 4

    clinic_ids = {e["clinic_id"] for e in global_log}
    assert clinic_ids == {"clinic-a", "clinic-b"}

    # Global log with event_type filter
    tool_events = get_global_audit_log(limit=100, event_type="tool.called")
    assert len(tool_events) == 1
    assert tool_events[0]["event_type"] == "tool.called"

    # Global log with safety_flag_only filter
    safety_events = get_global_audit_log(limit=100, safety_flag_only=True)
    assert len(safety_events) == 2  # tool.called + patient.context_accessed
    for event in safety_events:
        assert event["safety_flag"] is True


# ---------------------------------------------------------------------------
# AgentAuditEvent dataclass
# ---------------------------------------------------------------------------


def test_audit_event_to_dict() -> None:
    """AgentAuditEvent.to_dict produces a JSON-safe dict with all fields."""
    event = AgentAuditEvent(
        event_type="agent.viewed",
        agent_id="clinic.reception",
        clinic_id="clinic-demo",
        actor_id="actor-1",
        actor_role="clinician",
        patient_id="patient-1",
        tool_id="read.schedule",
        channel="telegram",
        details={"extra": "info"},
        safety_flag=True,
        evidence_grade="A",
    )
    d = event.to_dict()
    assert d["event_type"] == "agent.viewed"
    assert d["agent_id"] == "clinic.reception"
    assert d["clinic_id"] == "clinic-demo"
    assert d["actor_id"] == "actor-1"
    assert d["actor_role"] == "clinician"
    assert d["patient_id"] == "patient-1"
    assert d["tool_id"] == "read.schedule"
    assert d["channel"] == "telegram"
    assert d["details"] == {"extra": "info"}
    assert d["safety_flag"] is True
    assert d["evidence_grade"] == "A"
    assert "timestamp" in d
    assert "decision_support_disclaimer" in d


def test_non_canonical_event_type_warning(
    sample_agent_id: str,
    sample_clinic_id: str,
    sample_actor_id: str,
    sample_actor_role: str,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Recording a non-canonical event type logs a warning but still stores it."""
    custom_event = AgentAuditEvent(
        event_type="custom.unknown_event",
        agent_id=sample_agent_id,
        clinic_id=sample_clinic_id,
        actor_id=sample_actor_id,
        actor_role=sample_actor_role,
    )
    record_event(custom_event)

    # Should still be stored
    log = get_audit_log(sample_clinic_id, sample_agent_id)
    assert len(log) == 1
    assert log[0]["event_type"] == "custom.unknown_event"

    # Warning should be logged (check via caplog at WARNING level)
    import logging
    with caplog.at_level(logging.WARNING, logger="app.services.agent_audit_service"):
        custom_event2 = AgentAuditEvent(
            event_type="another.noncanonical",
            agent_id=sample_agent_id,
            clinic_id=sample_clinic_id,
            actor_id=sample_actor_id,
            actor_role=sample_actor_role,
        )
        record_event(custom_event2)


def test_safety_flag_auto_set_for_clinical_review_events() -> None:
    """Events in _CLINICAL_REVIEW_EVENTS automatically get safety_flag=True."""
    # tool.called
    record_tool_called("agent", "clinic", "actor", "clinician", tool_id="t")
    log = get_audit_log("clinic", "agent")
    assert log[0]["safety_flag"] is True

    clear_audit_store()

    # tool.approved
    record_tool_approved("agent", "clinic", "actor", "clinician", tool_id="t")
    log = get_audit_log("clinic", "agent")
    assert log[0]["safety_flag"] is True


def test_decision_support_disclaimer_present() -> None:
    """Every audit event carries the clinical safety disclaimer."""
    record_agent_viewed("clinic.reception", "clinic-demo", "actor-1", "clinician")
    log = get_audit_log("clinic-demo", "clinic.reception")
    assert len(log) == 1
    disclaimer = log[0]["decision_support_disclaimer"]
    assert "decision-support only" in disclaimer
    assert "does not constitute" in disclaimer
    assert "medical diagnosis" in disclaimer
