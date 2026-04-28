"""Unit tests for the agent marketplace registry + visibility filter."""
from __future__ import annotations

import pytest

from app.auth import AuthenticatedActor
from app.services.agents.registry import (
    AGENT_REGISTRY,
    AgentDefinition,
    list_visible_agents,
)


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


def test_registry_has_three_entries() -> None:
    assert set(AGENT_REGISTRY.keys()) == {
        "clinic.reception",
        "clinic.reporting",
        "clinic.aliclaw_doctor_telegram",
    }


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
    assert AGENT_REGISTRY["clinic.aliclaw_doctor_telegram"].monthly_price_gbp == 79


def test_known_packages_match_spec() -> None:
    for agent_id in (
        "clinic.reception",
        "clinic.reporting",
        "clinic.aliclaw_doctor_telegram",
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
    # Reception + AliClaw require clinician role (which clinician satisfies);
    # reporting requires admin (which clinician does not satisfy).
    assert visible_ids == {"clinic.reception", "clinic.aliclaw_doctor_telegram"}


def test_admin_with_enterprise_sees_all_three() -> None:
    actor = _actor("admin", "enterprise")
    visible_ids = {a.id for a in list_visible_agents(actor)}
    assert visible_ids == {
        "clinic.reception",
        "clinic.reporting",
        "clinic.aliclaw_doctor_telegram",
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
