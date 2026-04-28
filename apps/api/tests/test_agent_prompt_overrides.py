"""Tests for Phase 7 — per-clinic / global agent prompt overrides.

Covers:

* :func:`registry.resolve_system_prompt` resolution order:
  clinic-scoped > global > registry default.
* Disabled rows are skipped — the resolver falls back to the next
  layer, never returns a soft-deleted row's text.
* Admin endpoints:
  - ``GET  /api/v1/agents/admin/prompt-overrides`` (admin only)
  - ``POST /api/v1/agents/admin/prompt-overrides`` increments ``version``
    on each save and is gated to admins.
  - ``DELETE /api/v1/agents/admin/prompt-overrides/{id}`` is a soft delete.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.persistence.models import AgentPromptOverride
from app.services.agents.registry import (
    AGENT_REGISTRY,
    resolve_system_prompt,
)


@pytest.fixture
def db_session():
    s = SessionLocal()
    try:
        yield s
    finally:
        s.close()


def _add_override(
    db,
    *,
    agent_id: str,
    clinic_id: str | None,
    system_prompt: str,
    enabled: bool = True,
    version: int = 1,
    created_by: str | None = None,
) -> AgentPromptOverride:
    row = AgentPromptOverride(
        agent_id=agent_id,
        clinic_id=clinic_id,
        system_prompt=system_prompt,
        version=version,
        enabled=enabled,
        created_by=created_by,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


# ---------------------------------------------------------------------------
# resolve_system_prompt — direct unit tests
# ---------------------------------------------------------------------------


def test_resolve_returns_registry_default_when_no_override(db_session) -> None:
    agent = AGENT_REGISTRY["clinic.reception"]
    out = resolve_system_prompt(agent, "clinic-demo-default", db_session)
    assert out == agent.system_prompt


def test_resolve_returns_global_override_when_no_clinic_row(db_session) -> None:
    _add_override(
        db_session,
        agent_id="clinic.reception",
        clinic_id=None,
        system_prompt="GLOBAL OVERRIDE — you are now extra polite.",
    )
    agent = AGENT_REGISTRY["clinic.reception"]
    out = resolve_system_prompt(agent, "clinic-demo-default", db_session)
    assert out == "GLOBAL OVERRIDE — you are now extra polite."


def test_resolve_clinic_specific_wins_over_global(db_session) -> None:
    _add_override(
        db_session,
        agent_id="clinic.reception",
        clinic_id=None,
        system_prompt="GLOBAL OVERRIDE",
    )
    _add_override(
        db_session,
        agent_id="clinic.reception",
        clinic_id="clinic-demo-default",
        system_prompt="CLINIC OVERRIDE",
    )
    agent = AGENT_REGISTRY["clinic.reception"]
    out = resolve_system_prompt(agent, "clinic-demo-default", db_session)
    assert out == "CLINIC OVERRIDE"


def test_resolve_disabled_clinic_override_falls_back_to_global(db_session) -> None:
    _add_override(
        db_session,
        agent_id="clinic.reception",
        clinic_id=None,
        system_prompt="GLOBAL OVERRIDE",
    )
    _add_override(
        db_session,
        agent_id="clinic.reception",
        clinic_id="clinic-demo-default",
        system_prompt="DISABLED CLINIC OVERRIDE",
        enabled=False,
    )
    agent = AGENT_REGISTRY["clinic.reception"]
    out = resolve_system_prompt(agent, "clinic-demo-default", db_session)
    assert out == "GLOBAL OVERRIDE"


def test_resolve_all_disabled_falls_back_to_registry_default(db_session) -> None:
    _add_override(
        db_session,
        agent_id="clinic.reception",
        clinic_id=None,
        system_prompt="GLOBAL OVERRIDE",
        enabled=False,
    )
    _add_override(
        db_session,
        agent_id="clinic.reception",
        clinic_id="clinic-demo-default",
        system_prompt="CLINIC OVERRIDE",
        enabled=False,
    )
    agent = AGENT_REGISTRY["clinic.reception"]
    out = resolve_system_prompt(agent, "clinic-demo-default", db_session)
    assert out == agent.system_prompt


def test_resolve_picks_highest_version_when_multiple_active_rows(db_session) -> None:
    """Multiple enabled rows for the same scope should pick the highest version."""
    _add_override(
        db_session,
        agent_id="clinic.reception",
        clinic_id="clinic-demo-default",
        system_prompt="V1",
        version=1,
    )
    _add_override(
        db_session,
        agent_id="clinic.reception",
        clinic_id="clinic-demo-default",
        system_prompt="V2 (newer)",
        version=2,
    )
    agent = AGENT_REGISTRY["clinic.reception"]
    out = resolve_system_prompt(agent, "clinic-demo-default", db_session)
    assert out == "V2 (newer)"


def test_resolve_with_db_none_returns_registry_default() -> None:
    agent = AGENT_REGISTRY["clinic.reception"]
    out = resolve_system_prompt(agent, "clinic-demo-default", None)
    assert out == agent.system_prompt


# ---------------------------------------------------------------------------
# Admin endpoints — POST + GET + DELETE
# ---------------------------------------------------------------------------


def test_post_override_creates_row_and_assigns_version_one(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
    db_session,
) -> None:
    resp = client.post(
        "/api/v1/agents/admin/prompt-overrides",
        headers=auth_headers["admin"],
        json={
            "agent_id": "clinic.reception",
            "clinic_id": "clinic-demo-default",
            "system_prompt": "Be terse and use bullet points.",
            "enabled": True,
        },
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["agent_id"] == "clinic.reception"
    assert body["clinic_id"] == "clinic-demo-default"
    assert body["enabled"] is True
    assert body["version"] == 1
    assert body["created_by"] == "actor-admin-demo"

    # Persisted.
    rows = db_session.query(AgentPromptOverride).all()
    assert len(rows) == 1
    assert rows[0].system_prompt == "Be terse and use bullet points."


def test_post_override_bumps_version_on_subsequent_save(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
    db_session,
) -> None:
    payload = {
        "agent_id": "clinic.reception",
        "clinic_id": "clinic-demo-default",
        "system_prompt": "v1 prompt",
    }
    first = client.post(
        "/api/v1/agents/admin/prompt-overrides",
        headers=auth_headers["admin"],
        json=payload,
    )
    assert first.status_code == 200
    assert first.json()["version"] == 1

    payload["system_prompt"] = "v2 prompt"
    second = client.post(
        "/api/v1/agents/admin/prompt-overrides",
        headers=auth_headers["admin"],
        json=payload,
    )
    assert second.status_code == 200
    assert second.json()["version"] == 2


def test_post_override_clinician_gets_403(
    client: TestClient, auth_headers: dict[str, dict[str, str]]
) -> None:
    resp = client.post(
        "/api/v1/agents/admin/prompt-overrides",
        headers=auth_headers["clinician"],
        json={
            "agent_id": "clinic.reception",
            "clinic_id": "clinic-demo-default",
            "system_prompt": "should be rejected",
        },
    )
    assert resp.status_code == 403, resp.text


def test_post_override_unknown_agent_returns_404(
    client: TestClient, auth_headers: dict[str, dict[str, str]]
) -> None:
    resp = client.post(
        "/api/v1/agents/admin/prompt-overrides",
        headers=auth_headers["admin"],
        json={
            "agent_id": "clinic.does_not_exist",
            "clinic_id": None,
            "system_prompt": "x",
        },
    )
    assert resp.status_code == 404


def test_get_override_admin_only(
    client: TestClient, auth_headers: dict[str, dict[str, str]], db_session
) -> None:
    _add_override(
        db_session,
        agent_id="clinic.reception",
        clinic_id="clinic-demo-default",
        system_prompt="visible to admin",
    )

    # Admin sees the row.
    resp = client.get(
        "/api/v1/agents/admin/prompt-overrides",
        headers=auth_headers["admin"],
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert len(body["overrides"]) == 1
    assert body["overrides"][0]["system_prompt"] == "visible to admin"

    # Clinician → 403.
    deny = client.get(
        "/api/v1/agents/admin/prompt-overrides",
        headers=auth_headers["clinician"],
    )
    assert deny.status_code == 403


def test_get_override_filter_by_agent_and_clinic(
    client: TestClient, auth_headers: dict[str, dict[str, str]], db_session
) -> None:
    _add_override(
        db_session,
        agent_id="clinic.reception",
        clinic_id="clinic-demo-default",
        system_prompt="reception/demo",
    )
    _add_override(
        db_session,
        agent_id="clinic.reporting",
        clinic_id="clinic-demo-default",
        system_prompt="reporting/demo",
    )
    _add_override(
        db_session,
        agent_id="clinic.reception",
        clinic_id=None,
        system_prompt="reception/global",
    )

    resp = client.get(
        "/api/v1/agents/admin/prompt-overrides?agent_id=clinic.reception",
        headers=auth_headers["admin"],
    )
    assert resp.status_code == 200
    ids = {row["system_prompt"] for row in resp.json()["overrides"]}
    assert ids == {"reception/demo", "reception/global"}

    # __global__ sentinel returns only the clinic_id IS NULL row.
    resp_global = client.get(
        "/api/v1/agents/admin/prompt-overrides?clinic_id=__global__",
        headers=auth_headers["admin"],
    )
    assert resp_global.status_code == 200
    ids_global = {
        row["system_prompt"] for row in resp_global.json()["overrides"]
    }
    assert ids_global == {"reception/global"}


def test_delete_override_soft_deletes(
    client: TestClient, auth_headers: dict[str, dict[str, str]], db_session
) -> None:
    row = _add_override(
        db_session,
        agent_id="clinic.reception",
        clinic_id="clinic-demo-default",
        system_prompt="will be soft-deleted",
    )
    assert row.enabled is True

    resp = client.delete(
        f"/api/v1/agents/admin/prompt-overrides/{row.id}",
        headers=auth_headers["admin"],
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["enabled"] is False

    # Row still exists, just disabled.
    db_session.expire_all()
    persisted = (
        db_session.query(AgentPromptOverride)
        .filter(AgentPromptOverride.id == row.id)
        .first()
    )
    assert persisted is not None
    assert persisted.enabled is False
    assert persisted.system_prompt == "will be soft-deleted"


def test_delete_override_clinician_gets_403(
    client: TestClient, auth_headers: dict[str, dict[str, str]], db_session
) -> None:
    row = _add_override(
        db_session,
        agent_id="clinic.reception",
        clinic_id="clinic-demo-default",
        system_prompt="protected",
    )
    resp = client.delete(
        f"/api/v1/agents/admin/prompt-overrides/{row.id}",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 403


def test_delete_override_unknown_id_returns_404(
    client: TestClient, auth_headers: dict[str, dict[str, str]]
) -> None:
    resp = client.delete(
        "/api/v1/agents/admin/prompt-overrides/does-not-exist",
        headers=auth_headers["admin"],
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# End-to-end: a created override flows through the runner
# ---------------------------------------------------------------------------


def test_runner_uses_override_at_run_time(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
    monkeypatch: pytest.MonkeyPatch,
    db_session,
) -> None:
    """Capture the system prompt seen by ``_llm_chat`` and verify the
    runner picked up the clinic-scoped override.
    """
    captured: dict[str, object] = {}

    def _capture(**kwargs):
        captured.update(kwargs)
        return "ok"

    monkeypatch.setattr("app.services.chat_service._llm_chat", _capture)

    _add_override(
        db_session,
        agent_id="clinic.reception",
        clinic_id="clinic-demo-default",
        system_prompt="OVERRIDDEN PROMPT — be brief.",
    )

    resp = client.post(
        "/api/v1/agents/clinic.reception/run",
        headers=auth_headers["clinician"],
        json={"message": "hi"},
    )
    assert resp.status_code == 200, resp.text

    system_seen = captured.get("system", "")
    assert isinstance(system_seen, str)
    assert "OVERRIDDEN PROMPT" in system_seen
