"""Unit tests for the agent marketplace registry + visibility filter."""
from __future__ import annotations

import pytest

from app.auth import AuthenticatedActor
from app.services.agents.registry import (
    AGENT_REGISTRY,
    AgentDefinition,
    list_visible_agents,
)
from app.services.agents.tools.registry import TOOL_REGISTRY


PATIENT_AGENT_IDS = {
    "patient.care_companion",
    "patient.adherence",
    "patient.education",
    "patient.crisis",
}

PATIENT_TOOL_IDS = {
    "assessments.recent_for_patient",
    "tasks.list_for_patient",
    "medications.active_for_patient",
    "treatment_courses.active_for_patient",
    "evidence.search",
    "patient.condition",
    "risk.escalation_path",
    "clinic.emergency_contact",
}


# ---------------------------------------------------------------------------
# Fixtures: synthetic actors. We don't use the conftest demo tokens here
# because we need to vary role + package_id independently of the database.
# ---------------------------------------------------------------------------


def _actor(role: str, package_id: str = "explorer") -> AuthenticatedActor:
    return AuthenticatedActor(
        actor_id=f"actor-{role}-{package_id}",
        display_name=f"Actor {role} {package_id}",
        role=role,  # type: ignore[arg-type]
        package_id=package_id,
    )


# ---------------------------------------------------------------------------
# Shape / invariants
# ---------------------------------------------------------------------------


def test_registry_has_seven_entries() -> None:
    # 3 clinic-side (v1) + 4 patient-side (v1.5, gated).
    assert set(AGENT_REGISTRY.keys()) == {
        "clinic.reception",
        "clinic.reporting",
        "clinic.drclaw_telegram",
    } | PATIENT_AGENT_IDS
    assert len(AGENT_REGISTRY) == 7


def test_every_entry_is_an_agent_definition() -> None:
    for agent in AGENT_REGISTRY.values():
        assert isinstance(agent, AgentDefinition)


def test_every_entry_has_required_fields_populated() -> None:
    for agent in AGENT_REGISTRY.values():
        assert agent.id
        assert agent.name
        assert agent.tagline
        assert agent.audience in {"clinic", "patient"}
        assert agent.role_required in {"clinician", "admin"}
        assert isinstance(agent.package_required, list)
        assert isinstance(agent.tool_allowlist, list)
        assert isinstance(agent.system_prompt, str)
        assert agent.system_prompt.strip(), f"empty system prompt on {agent.id}"
        assert isinstance(agent.monthly_price_gbp, int)
        assert agent.monthly_price_gbp >= 0


def test_tool_allowlist_is_non_empty_for_every_agent() -> None:
    for agent in AGENT_REGISTRY.values():
        assert len(agent.tool_allowlist) > 0, (
            f"agent {agent.id!r} must declare at least one allowlisted tool"
        )


def test_agent_definition_is_frozen() -> None:
    agent = AGENT_REGISTRY["clinic.reception"]
    with pytest.raises((TypeError, ValueError)):
        agent.name = "tampered"  # type: ignore[misc]


def test_known_prices_match_spec() -> None:
    assert AGENT_REGISTRY["clinic.reception"].monthly_price_gbp == 99
    assert AGENT_REGISTRY["clinic.reporting"].monthly_price_gbp == 49
    assert AGENT_REGISTRY["clinic.drclaw_telegram"].monthly_price_gbp == 79


def test_known_packages_match_spec() -> None:
    for agent_id in (
        "clinic.reception",
        "clinic.reporting",
        "clinic.drclaw_telegram",
    ):
        assert AGENT_REGISTRY[agent_id].package_required == [
            "clinician_pro",
            "enterprise",
        ]


# ---------------------------------------------------------------------------
# list_visible_agents — role + package filtering
# ---------------------------------------------------------------------------


def test_clinician_pro_clinician_sees_clinician_agents_only() -> None:
    actor = _actor("clinician", "clinician_pro")
    visible_ids = {a.id for a in list_visible_agents(actor)}
    # Reception + DrClaw require clinician role (which clinician satisfies);
    # reporting requires admin (which clinician does not satisfy).
    assert visible_ids == {"clinic.reception", "clinic.drclaw_telegram"}


def test_admin_with_enterprise_sees_all_three() -> None:
    actor = _actor("admin", "enterprise")
    visible_ids = {a.id for a in list_visible_agents(actor)}
    assert visible_ids == {
        "clinic.reception",
        "clinic.reporting",
        "clinic.drclaw_telegram",
    }


def test_clinician_with_explorer_package_sees_nothing() -> None:
    # Right role for two of the agents, wrong package — package gate trips.
    actor = _actor("clinician", "explorer")
    assert list_visible_agents(actor) == []


def test_guest_actor_sees_nothing() -> None:
    actor = _actor("guest", "enterprise")
    assert list_visible_agents(actor) == []


def test_patient_actor_sees_nothing() -> None:
    actor = _actor("patient", "enterprise")
    assert list_visible_agents(actor) == []


def test_admin_with_explorer_package_sees_nothing() -> None:
    # Admin trumps all roles, but the package gate still applies.
    actor = _actor("admin", "explorer")
    assert list_visible_agents(actor) == []


# ---------------------------------------------------------------------------
# Patient-side agents (v1.5) — gated behind ``pending_clinical_signoff``
# ---------------------------------------------------------------------------


def test_all_four_patient_agents_present() -> None:
    for agent_id in PATIENT_AGENT_IDS:
        assert agent_id in AGENT_REGISTRY, f"missing {agent_id!r}"


def test_patient_agents_have_patient_audience() -> None:
    for agent_id in PATIENT_AGENT_IDS:
        assert AGENT_REGISTRY[agent_id].audience == "patient"


def test_patient_agents_locked_behind_signoff_package() -> None:
    for agent_id in PATIENT_AGENT_IDS:
        assert AGENT_REGISTRY[agent_id].package_required == [
            "pending_clinical_signoff"
        ]


def test_patient_crisis_agent_is_free() -> None:
    # Free baseline — safety nets must never sit behind a paywall.
    assert AGENT_REGISTRY["patient.crisis"].monthly_price_gbp == 0


def test_patient_agent_prices_match_spec() -> None:
    assert AGENT_REGISTRY["patient.care_companion"].monthly_price_gbp == 19
    assert AGENT_REGISTRY["patient.adherence"].monthly_price_gbp == 12
    assert AGENT_REGISTRY["patient.education"].monthly_price_gbp == 9
    assert AGENT_REGISTRY["patient.crisis"].monthly_price_gbp == 0


def test_care_companion_prompt_carries_safety_phrases() -> None:
    prompt = AGENT_REGISTRY["patient.care_companion"].system_prompt.lower()
    assert "999" in prompt
    assert "911" in prompt
    assert "not a clinician" in prompt


def test_adherence_prompt_defers_dose_changes_to_clinician() -> None:
    prompt = AGENT_REGISTRY["patient.adherence"].system_prompt.lower()
    assert "let your clinician know" in prompt


def test_education_prompt_constrained_to_approved_evidence() -> None:
    prompt = AGENT_REGISTRY["patient.education"].system_prompt.lower()
    assert ("clinic-approved" in prompt) or ("ask your clinician" in prompt)


def test_crisis_prompt_carries_escalation_phrases() -> None:
    prompt = AGENT_REGISTRY["patient.crisis"].system_prompt
    assert "999" in prompt
    assert "911" in prompt
    # The hard-scripted role statement must be present verbatim — the test
    # is intentionally case-sensitive on "ONLY job" because that emphasis
    # is part of the safety contract baked into the prompt.
    assert "ONLY job is to detect" in prompt


# ---------------------------------------------------------------------------
# Patient-side tool placeholders — registered + always unavailable today.
# ---------------------------------------------------------------------------


def test_all_patient_tool_ids_registered() -> None:
    missing = PATIENT_TOOL_IDS - set(TOOL_REGISTRY.keys())
    assert not missing, f"unregistered patient tool ids: {sorted(missing)}"


def test_patient_tool_handlers_return_unavailable_envelope() -> None:
    # A throwaway actor + db is enough — the stub handlers don't touch
    # either input, they just return the canonical envelope.
    actor = _actor("clinician", "clinician_pro")
    db = object()  # sentinel; the stub never dereferences it
    for tool_id in PATIENT_TOOL_IDS:
        tool = TOOL_REGISTRY[tool_id]
        assert tool.handler is not None, f"{tool_id} should have a stub handler"
        result = tool.handler(actor, db)
        assert result.get("unavailable") is True, (
            f"{tool_id} must return an unavailable envelope until clinical "
            f"signoff; got {result!r}"
        )


def test_patient_tools_require_clinician_role() -> None:
    # The clinic operates these on the patient's behalf — the role gate
    # belongs to the clinician, not the patient.
    for tool_id in PATIENT_TOOL_IDS:
        assert TOOL_REGISTRY[tool_id].requires_role == "clinician"


# ---------------------------------------------------------------------------
# Visibility — patient agents must NOT leak via list_visible_agents for any
# of the standard clinic packages.
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("package_id", ["clinician_pro", "enterprise"])
def test_normal_packages_do_not_see_patient_agents(package_id: str) -> None:
    actor = _actor("admin", package_id)  # admin = highest role
    visible_ids = {a.id for a in list_visible_agents(actor)}
    assert visible_ids.isdisjoint(PATIENT_AGENT_IDS), (
        f"package {package_id!r} unexpectedly sees patient agents: "
        f"{visible_ids & PATIENT_AGENT_IDS}"
    )


def test_pending_signoff_package_unlocks_patient_agents() -> None:
    # Sanity: when (if ever) a clinic actor is granted the sentinel
    # package, the patient-side tiles do show up. This locks in the gate
    # behaviour rather than relying solely on the negative tests above.
    actor = _actor("clinician", "pending_clinical_signoff")
    visible_ids = {a.id for a in list_visible_agents(actor)}
    assert PATIENT_AGENT_IDS.issubset(visible_ids)
