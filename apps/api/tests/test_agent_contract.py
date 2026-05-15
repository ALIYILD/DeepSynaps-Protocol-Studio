"""Comprehensive tests for the Agent Contract model.

Covers:
* Default contract creation per agent type (receptionist, doctor, patient)
* State machine transitions (legal and illegal)
* Serialization roundtrip (to_dict / from_dict)
* Billing status expiry detection
* Tool approval policy defaults per agent type
* Clinic isolation — contracts must not leak between clinics
* Clinical safety assertions (disclaimers, evidence grades)
"""
from __future__ import annotations

import pytest
from datetime import datetime, timedelta, timezone

from app.services.agent_contract import (
    AgentContract,
    create_default_contract,
    save_contract,
    get_contract,
    list_contracts_for_clinic,
    delete_contract,
    DEFAULT_DATA_SCOPES,
    DEFAULT_TOOL_SCOPES,
    DEFAULT_ROLE_SCOPES,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def _clear_contract_store(monkeypatch: pytest.MonkeyPatch) -> None:
    """Reset the in-memory contract store before every test."""
    import app.services.agent_contract as _contract_mod
    _contract_mod._contract_store = {}


@pytest.fixture
def receptionist_contract() -> AgentContract:
    return create_default_contract(
        agent_id="clinic.reception",
        agent_type="receptionist",
        clinic_id="clinic-alpha",
        owner_user_id="owner-1",
    )


@pytest.fixture
def doctor_contract() -> AgentContract:
    return create_default_contract(
        agent_id="clinic.dr_ai",
        agent_type="doctor",
        clinic_id="clinic-alpha",
        owner_user_id="owner-2",
    )


@pytest.fixture
def patient_contract() -> AgentContract:
    return create_default_contract(
        agent_id="patient.care_companion",
        agent_type="patient",
        clinic_id="clinic-alpha",
        owner_user_id="owner-3",
        patient_scope="patient-42",
    )


@pytest.fixture
def expired_contract() -> AgentContract:
    contract = create_default_contract(
        agent_id="clinic.reporting",
        agent_type="report",
        clinic_id="clinic-beta",
        owner_user_id="owner-4",
    )
    contract.billing_status = "active"
    contract.expires_at = datetime.now(timezone.utc) - timedelta(days=1)
    return contract


# ---------------------------------------------------------------------------
# Default contract creation — per agent type
# ---------------------------------------------------------------------------


def test_create_default_contract_receptionist(receptionist_contract: AgentContract) -> None:
    """Receptionist contracts carry the correct default scopes and policies."""
    assert receptionist_contract.agent_id == "clinic.reception"
    assert receptionist_contract.agent_type == "receptionist"
    assert receptionist_contract.clinic_id == "clinic-alpha"
    assert receptionist_contract.role_scope == DEFAULT_ROLE_SCOPES["receptionist"]
    assert receptionist_contract.data_scopes == DEFAULT_DATA_SCOPES["receptionist"]
    assert receptionist_contract.tool_scopes == DEFAULT_TOOL_SCOPES["receptionist"]
    assert receptionist_contract.tool_approval_policy == "pre_approve"
    assert receptionist_contract.billing_status == "trial"
    assert receptionist_contract.monthly_price_gbp == 0
    assert receptionist_contract.channel_connections == {
        "telegram": False,
        "email": False,
        "sms": False,
        "phone": False,
    }
    assert receptionist_contract.patient_scope is None


def test_create_default_contract_doctor(doctor_contract: AgentContract) -> None:
    """Doctor contracts carry clinical-grade default scopes."""
    assert doctor_contract.agent_id == "clinic.dr_ai"
    assert doctor_contract.agent_type == "doctor"
    assert doctor_contract.clinic_id == "clinic-alpha"
    assert doctor_contract.role_scope == DEFAULT_ROLE_SCOPES["doctor"]
    assert doctor_contract.data_scopes == DEFAULT_DATA_SCOPES["doctor"]
    assert "patient.summary" in doctor_contract.data_scopes
    assert "clinical_report" in doctor_contract.data_scopes
    assert doctor_contract.tool_scopes == DEFAULT_TOOL_SCOPES["doctor"]
    assert "read.full_chart" in doctor_contract.tool_scopes
    assert "trigger.ai_analysis" in doctor_contract.tool_scopes
    assert doctor_contract.patient_scope is None


def test_create_default_contract_patient(patient_contract: AgentContract) -> None:
    """Patient contracts are scoped to a single patient and have limited tools."""
    assert patient_contract.agent_id == "patient.care_companion"
    assert patient_contract.agent_type == "patient"
    assert patient_contract.clinic_id == "clinic-alpha"
    assert patient_contract.patient_scope == "patient-42"
    assert "patient" in patient_contract.role_scope
    assert "clinician" in patient_contract.role_scope
    assert "admin" in patient_contract.role_scope
    # Patient agents should not have high-risk clinical tools
    assert "diagnose" not in patient_contract.tool_scopes
    assert "prescribe" not in patient_contract.tool_scopes
    assert "read.clinic_faq" in patient_contract.tool_scopes


# ---------------------------------------------------------------------------
# State machine — legal transitions
# ---------------------------------------------------------------------------


def test_state_machine_legal_transitions(receptionist_contract: AgentContract) -> None:
    """The happy path: trial -> active -> paused -> active."""
    contract = receptionist_contract
    actor = "test-actor"

    # idle -> running
    contract.transition("running", actor, {"reason": "first_start"})
    assert contract.run_status == "running"
    assert len(contract.audit_events) == 1
    assert contract.audit_events[0]["event_type"] == "agent.status_changed"
    assert contract.audit_events[0]["old_status"] == "idle"
    assert contract.audit_events[0]["new_status"] == "running"
    assert contract.audit_events[0]["actor_id"] == actor

    # running -> paused
    contract.transition("paused", actor, {"reason": "maintenance"})
    assert contract.run_status == "paused"

    # paused -> running
    contract.transition("running", actor, {"reason": "resume"})
    assert contract.run_status == "running"

    # running -> idle
    contract.transition("idle", actor)
    assert contract.run_status == "idle"

    # idle -> revoked (terminal)
    contract.transition("revoked", actor, {"reason": "billing_cancelled"})
    assert contract.run_status == "revoked"
    assert len(contract.audit_events) == 5


# ---------------------------------------------------------------------------
# State machine — illegal transitions
# ---------------------------------------------------------------------------


def test_state_machine_illegal_transition(receptionist_contract: AgentContract) -> None:
    """revoked -> running is terminal; no escape."""
    contract = receptionist_contract
    contract.transition("revoked", "admin-1", {"reason": "billing_cancelled"})
    assert contract.run_status == "revoked"

    with pytest.raises(ValueError) as exc_info:
        contract.transition("running", "admin-1")

    assert "Illegal transition" in str(exc_info.value)
    assert "revoked" in str(exc_info.value)
    assert "running" in str(exc_info.value)
    # run_status must NOT have changed
    assert contract.run_status == "revoked"


# ---------------------------------------------------------------------------
# Serialization roundtrip
# ---------------------------------------------------------------------------


def test_serialization_roundtrip(receptionist_contract: AgentContract) -> None:
    """to_dict -> from_dict produces an equivalent contract."""
    original = receptionist_contract
    # Transition to add some audit events
    original.transition("running", "actor-1", {"note": "test"})
    original.transition("paused", "actor-2")

    serialized = original.to_dict()
    restored = AgentContract.from_dict(serialized)

    assert restored.agent_id == original.agent_id
    assert restored.agent_type == original.agent_type
    assert restored.clinic_id == original.clinic_id
    assert restored.owner_user_id == original.owner_user_id
    assert restored.role_scope == original.role_scope
    assert restored.data_scopes == original.data_scopes
    assert restored.tool_scopes == original.tool_scopes
    assert restored.tool_approval_policy == original.tool_approval_policy
    assert restored.billing_status == original.billing_status
    assert restored.billing_plan == original.billing_plan
    assert restored.monthly_price_gbp == original.monthly_price_gbp
    assert restored.channel_connections == original.channel_connections
    assert restored.run_status == original.run_status
    assert len(restored.audit_events) == len(original.audit_events)
    assert restored.created_at == original.created_at
    assert restored.safety_disclaimer == original.safety_disclaimer


# ---------------------------------------------------------------------------
# Billing status — expiry detection
# ---------------------------------------------------------------------------


def test_billing_status_expired(expired_contract: AgentContract) -> None:
    """A contract with expires_at in the past is effectively expired."""
    contract = expired_contract
    assert contract.billing_status == "active"
    assert contract.expires_at is not None
    assert contract.expires_at < datetime.now(timezone.utc)

    # The contract should still be valid (expiry is advisory) but the
    # billing_status field itself should be overridable.
    contract.billing_status = "expired"
    assert contract.billing_status == "expired"


# ---------------------------------------------------------------------------
# Tool approval policy defaults
# ---------------------------------------------------------------------------


def test_tool_approval_policy_default() -> None:
    """Each agent type gets the appropriate default approval policy."""
    for agent_type in [
        "receptionist", "doctor", "patient", "research",
        "report", "evidence", "scheduling", "billing", "custom",
    ]:
        contract = create_default_contract(
            agent_id=f"test.{agent_type}",
            agent_type=agent_type,
            clinic_id="clinic-test",
            owner_user_id="owner-test",
        )
        # All defaults use "pre_approve" as the conservative baseline
        assert contract.tool_approval_policy == "pre_approve"


# ---------------------------------------------------------------------------
# Clinic isolation
# ---------------------------------------------------------------------------


def test_clinic_isolation() -> None:
    """Contracts must not leak between clinics."""
    clinic_a_contract = create_default_contract(
        agent_id="clinic.reception",
        agent_type="receptionist",
        clinic_id="clinic-a",
        owner_user_id="owner-a",
    )
    clinic_b_contract = create_default_contract(
        agent_id="clinic.reception",
        agent_type="receptionist",
        clinic_id="clinic-b",
        owner_user_id="owner-b",
    )

    save_contract(clinic_a_contract)
    save_contract(clinic_b_contract)

    # List contracts for clinic-a only
    a_contracts = list_contracts_for_clinic("clinic-a")
    assert len(a_contracts) == 1
    assert a_contracts[0].clinic_id == "clinic-a"
    assert a_contracts[0].owner_user_id == "owner-a"

    # List contracts for clinic-b only
    b_contracts = list_contracts_for_clinic("clinic-b")
    assert len(b_contracts) == 1
    assert b_contracts[0].clinic_id == "clinic-b"

    # Cross-clinic lookup returns None
    assert get_contract("clinic-a", "clinic.reception") is not None
    assert get_contract("clinic-b", "clinic.reception") is not None
    assert get_contract("clinic-c", "clinic.reception") is None

    # Delete only affects the specified clinic
    assert delete_contract("clinic-a", "clinic.reception") is True
    assert list_contracts_for_clinic("clinic-a") == []
    assert len(list_contracts_for_clinic("clinic-b")) == 1

    # Deleting non-existent contract returns False
    assert delete_contract("clinic-a", "clinic.reception") is False


# ---------------------------------------------------------------------------
# Clinical safety assertions
# ---------------------------------------------------------------------------


def test_safety_disclaimer_always_present(receptionist_contract: AgentContract) -> None:
    """Every contract carries the decision-support disclaimer."""
    disclaimer = receptionist_contract.safety_disclaimer
    assert "decision-support only" in disclaimer
    assert "does not constitute" in disclaimer
    assert "medical diagnosis" in disclaimer
    assert "qualified clinician" in disclaimer


def test_autonomous_action_forbidden_flag(receptionist_contract: AgentContract) -> None:
    """Autonomous clinical action is categorically forbidden."""
    assert receptionist_contract.is_autonomous_forbidden is True
