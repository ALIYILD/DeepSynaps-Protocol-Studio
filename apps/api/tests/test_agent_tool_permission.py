"""Comprehensive tests for the Agent Tool Permission Service.

Covers:
* Tool permission checks across all risk tiers (read_only, low_risk,
  medium_risk, high_risk, forbidden).
* Role-based access: guest, patient, technician, clinician, admin.
* Tool classification and max-tier calculation.
* Audit logging of tool calls.
* Forbidden tools are blocked before audit.
* Clinical safety assertions (evidence grades, deny-by-default).
"""
from __future__ import annotations

import pytest

from app.auth import AuthenticatedActor, ROLE_ORDER
from app.services.agent_tool_permission import (
    TOOL_CLASSIFICATION,
    check_tool_permission,
    get_tool_approval_required,
    classify_tools,
    get_tools_for_tier,
    get_max_tier_for_tools,
    audit_tool_call,
    get_tool_audit_log,
    clear_tool_audit_log,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def _clear_audit_log() -> None:
    """Reset the in-memory tool call audit log before every test."""
    clear_tool_audit_log()


@pytest.fixture
def guest_actor() -> AuthenticatedActor:
    return AuthenticatedActor(
        actor_id="actor-guest",
        display_name="Guest User",
        role="guest",  # type: ignore[arg-type]
        clinic_id="clinic-demo",
    )


@pytest.fixture
def patient_actor() -> AuthenticatedActor:
    return AuthenticatedActor(
        actor_id="actor-patient",
        display_name="Patient User",
        role="patient",  # type: ignore[arg-type]
        clinic_id="clinic-demo",
    )


@pytest.fixture
def technician_actor() -> AuthenticatedActor:
    return AuthenticatedActor(
        actor_id="actor-technician",
        display_name="Lab Technician",
        role="technician",  # type: ignore[arg-type]
        clinic_id="clinic-demo",
    )


@pytest.fixture
def clinician_actor() -> AuthenticatedActor:
    return AuthenticatedActor(
        actor_id="actor-clinician",
        display_name="Dr. Verified Clinician",
        role="clinician",  # type: ignore[arg-type]
        clinic_id="clinic-demo",
    )


@pytest.fixture
def admin_actor() -> AuthenticatedActor:
    return AuthenticatedActor(
        actor_id="actor-admin",
        display_name="Admin User",
        role="admin",  # type: ignore[arg-type]
        clinic_id="clinic-demo",
    )


# ---------------------------------------------------------------------------
# check_tool_permission — read_only tier (auto-approved)
# ---------------------------------------------------------------------------


def test_check_tool_permission_read_only_auto(clinician_actor: AuthenticatedActor) -> None:
    """read.schedule is read-only — auto-approved for clinician."""
    assert check_tool_permission("clinic.reception", "read.schedule", clinician_actor.role) is True


# ---------------------------------------------------------------------------
# check_tool_permission — low_risk tier (auto-approved)
# ---------------------------------------------------------------------------


def test_check_tool_permission_low_risk_auto(clinician_actor: AuthenticatedActor) -> None:
    """draft.message is low-risk — auto-approved for clinician."""
    assert check_tool_permission("clinic.reception", "draft.message", clinician_actor.role) is True


# ---------------------------------------------------------------------------
# check_tool_permission — medium_risk tier (pre_approve)
# ---------------------------------------------------------------------------


def test_check_tool_permission_medium_risk_pre_approve(clinician_actor: AuthenticatedActor) -> None:
    """write.appointment is medium-risk — allowed but needs approval."""
    assert check_tool_permission("clinic.reception", "write.appointment", clinician_actor.role) is True


# ---------------------------------------------------------------------------
# check_tool_permission — high_risk tier (pre_approve)
# ---------------------------------------------------------------------------


def test_check_tool_permission_high_risk_pre_approve(clinician_actor: AuthenticatedActor) -> None:
    """write.patient_message is high-risk — allowed but needs approval."""
    assert check_tool_permission("clinic.dr_ai", "write.patient_message", clinician_actor.role) is True


# ---------------------------------------------------------------------------
# check_tool_permission — forbidden tier (never)
# ---------------------------------------------------------------------------


def test_check_tool_permission_forbidden_never(clinician_actor: AuthenticatedActor) -> None:
    """diagnose is forbidden — NEVER approved, even for clinicians."""
    assert check_tool_permission("clinic.dr_ai", "diagnose", clinician_actor.role) is False

    # Also denied for admin
    from app.auth import AuthenticatedActor as AA
    admin = AA(
        actor_id="actor-admin",
        display_name="Admin",
        role="admin",  # type: ignore[arg-type]
        clinic_id="clinic-demo",
    )
    assert check_tool_permission("clinic.dr_ai", "diagnose", admin.role) is False


# ---------------------------------------------------------------------------
# check_tool_permission — guest denied all
# ---------------------------------------------------------------------------


def test_check_tool_permission_guest_denied_all(guest_actor: AuthenticatedActor) -> None:
    """Guest actors cannot use any tools (even read_only)."""
    assert check_tool_permission("clinic.reception", "read.schedule", guest_actor.role) is False
    assert check_tool_permission("clinic.reception", "read.clinic_faq", guest_actor.role) is False
    assert check_tool_permission("clinic.reception", "draft.message", guest_actor.role) is False
    assert check_tool_permission("clinic.reception", "write.appointment", guest_actor.role) is False
    assert check_tool_permission("clinic.dr_ai", "write.patient_message", guest_actor.role) is False
    assert check_tool_permission("clinic.dr_ai", "diagnose", guest_actor.role) is False


# ---------------------------------------------------------------------------
# check_tool_permission — patient limited
# ---------------------------------------------------------------------------


def test_check_tool_permission_patient_limited(patient_actor: AuthenticatedActor) -> None:
    """Patient role is below technician — cannot use any tools (even read_only).

    Patient actors (role rank 1) are below the minimum required rank for
    read_only tools (technician, rank 2).  This is intentional — patients
    interact with agents only through clinician-mediated channels.
    """
    # Read-only: denied (patient rank 1 < technician rank 2)
    assert check_tool_permission("clinic.reception", "read.schedule", patient_actor.role) is False
    assert check_tool_permission("clinic.reception", "read.clinic_faq", patient_actor.role) is False

    # Low-risk: denied
    assert check_tool_permission("clinic.reception", "draft.message", patient_actor.role) is False

    # Medium-risk: denied (patient rank < clinician rank)
    assert check_tool_permission("clinic.reception", "write.appointment", patient_actor.role) is False

    # High-risk: denied
    assert check_tool_permission("clinic.dr_ai", "write.patient_message", patient_actor.role) is False

    # Forbidden: always denied
    assert check_tool_permission("clinic.dr_ai", "diagnose", patient_actor.role) is False


# ---------------------------------------------------------------------------
# check_tool_permission — clinician full access
# ---------------------------------------------------------------------------


def test_check_tool_permission_clinician_full(clinician_actor: AuthenticatedActor) -> None:
    """Clinician can use all non-forbidden tools across all tiers."""
    # Read-only
    assert check_tool_permission("clinic.reception", "read.schedule", clinician_actor.role) is True
    assert check_tool_permission("clinic.reception", "read.patient_summary", clinician_actor.role) is True
    assert check_tool_permission("clinic.dr_ai", "read.evidence", clinician_actor.role) is True

    # Low-risk
    assert check_tool_permission("clinic.reception", "draft.message", clinician_actor.role) is True
    assert check_tool_permission("clinic.dr_ai", "draft.report_section", clinician_actor.role) is True

    # Medium-risk
    assert check_tool_permission("clinic.reception", "write.appointment", clinician_actor.role) is True
    assert check_tool_permission("clinic.reception", "write.reminder", clinician_actor.role) is True

    # High-risk
    assert check_tool_permission("clinic.dr_ai", "write.patient_message", clinician_actor.role) is True
    assert check_tool_permission("clinic.dr_ai", "write.clinical_report", clinician_actor.role) is True
    assert check_tool_permission("clinic.dr_ai", "read.full_chart", clinician_actor.role) is True
    assert check_tool_permission("clinic.dr_ai", "trigger.ai_analysis", clinician_actor.role) is True

    # Forbidden: still denied
    assert check_tool_permission("clinic.dr_ai", "diagnose", clinician_actor.role) is False
    assert check_tool_permission("clinic.dr_ai", "prescribe", clinician_actor.role) is False
    assert check_tool_permission("clinic.dr_ai", "triage_emergency", clinician_actor.role) is False
    assert check_tool_permission("clinic.dr_ai", "change_treatment", clinician_actor.role) is False


# ---------------------------------------------------------------------------
# classify_tools
# ---------------------------------------------------------------------------


def test_classify_tools_mixed() -> None:
    """classify_tools correctly buckets a mixed list of tools."""
    tool_ids = [
        "read.schedule",
        "read.patient_summary",
        "draft.message",
        "write.appointment",
        "write.patient_message",
        "diagnose",
        "unknown_tool_xyz",
    ]
    result = classify_tools(tool_ids)
    assert result["read_only"] == ["read.schedule", "read.patient_summary"]
    assert result["low_risk"] == ["draft.message"]
    assert result["medium_risk"] == ["write.appointment"]
    assert result["high_risk"] == ["write.patient_message"]
    assert result["forbidden"] == ["diagnose"]
    assert result["unknown"] == ["unknown_tool_xyz"]


# ---------------------------------------------------------------------------
# get_max_tier_for_tools
# ---------------------------------------------------------------------------


def test_get_max_tier_read_only() -> None:
    """Max tier for read-only tools is read_only."""
    assert get_max_tier_for_tools(["read.schedule", "read.clinic_faq"]) == "read_only"


def test_get_max_tier_forbidden() -> None:
    """If any tool is forbidden, max tier is forbidden."""
    assert get_max_tier_for_tools(["read.schedule", "draft.message", "diagnose"]) == "forbidden"


# ---------------------------------------------------------------------------
# audit_tool_call
# ---------------------------------------------------------------------------


def test_audit_tool_call() -> None:
    """audit_tool_call records the event and it appears in the log."""
    clear_tool_audit_log()

    audit_tool_call(
        agent_id="clinic.reception",
        tool_id="read.schedule",
        user_id="user-1",
        user_role="clinician",
        result={"ok": True, "count": 5},
    )

    log = get_tool_audit_log(agent_id="clinic.reception", limit=10)
    assert len(log) == 1
    entry = log[0]
    assert entry["agent_id"] == "clinic.reception"
    assert entry["tool_id"] == "read.schedule"
    assert entry["user_id"] == "user-1"
    assert entry["user_role"] == "clinician"
    assert entry["result"]["ok"] is True
    assert "timestamp" in entry


def test_audit_tool_call_forbidden_blocked() -> None:
    """Forbidden tool calls are blocked before audit — no log entry."""
    clear_tool_audit_log()

    # Simulate the pattern: check permission FIRST, only audit if granted
    tool_id = "diagnose"
    agent_id = "clinic.dr_ai"
    user_role = "clinician"

    permission = check_tool_permission(agent_id, tool_id, user_role)
    assert permission is False

    # The forbidden call was blocked — no audit entry should exist
    # because the caller should not call audit_tool_call when denied.
    log = get_tool_audit_log(agent_id=agent_id, tool_id=tool_id)
    assert len(log) == 0


# ---------------------------------------------------------------------------
# get_tool_approval_required
# ---------------------------------------------------------------------------


def test_get_tool_approval_required_known_tool() -> None:
    """Metadata returned for known tools includes tier, approval, evidence."""
    meta = get_tool_approval_required("read.schedule")
    assert meta["tool_id"] == "read.schedule"
    assert meta["tier"] == "read_only"
    assert meta["approval"] == "auto"
    assert meta["requires_human_approval"] is False
    assert meta["evidence_grade"] == "A"


def test_get_tool_approval_required_unknown_tool() -> None:
    """Unknown tools get a safe deny-by-default response."""
    meta = get_tool_approval_required("unknown.mystery_tool")
    assert meta["tier"] == "unknown"
    assert meta["approval"] == "never"
    assert meta["requires_human_approval"] is True
    assert meta["evidence_grade"] == "D"


# ---------------------------------------------------------------------------
# get_tools_for_tier
# ---------------------------------------------------------------------------


def test_get_tools_for_tier_structure() -> None:
    """get_tools_for_tier returns correctly structured metadata."""
    read_only_tools = get_tools_for_tier("read_only")
    assert len(read_only_tools) >= 4  # schedule, clinic_faq, patient_summary, evidence
    for tool in read_only_tools:
        assert "tool_id" in tool
        assert "approval" in tool
        assert "evidence_grade" in tool
        assert "description" in tool

    forbidden_tools = get_tools_for_tier("forbidden")
    assert len(forbidden_tools) == 4  # diagnose, prescribe, triage_emergency, change_treatment
    for tool in forbidden_tools:
        assert "NEVER PERMITTED" in tool["description"]


# ---------------------------------------------------------------------------
# Unknown tool — deny by default
# ---------------------------------------------------------------------------


def test_check_tool_permission_unknown_tool_denied(clinician_actor: AuthenticatedActor) -> None:
    """Unregistered tools are denied by default for all roles."""
    assert check_tool_permission("clinic.reception", "unknown.mystery_tool", clinician_actor.role) is False
    assert check_tool_permission("clinic.reception", "unknown.mystery_tool", "admin") is False


# ---------------------------------------------------------------------------
# TOOL_CLASSIFICATION export
# ---------------------------------------------------------------------------


def test_tool_classification_export() -> None:
    """TOOL_CLASSIFICATION contains every registered tool with tier + approval."""
    assert "read.schedule" in TOOL_CLASSIFICATION
    assert TOOL_CLASSIFICATION["read.schedule"]["tier"] == "read_only"
    assert TOOL_CLASSIFICATION["diagnose"]["tier"] == "forbidden"
    assert TOOL_CLASSIFICATION["diagnose"]["approval"] == "never"
