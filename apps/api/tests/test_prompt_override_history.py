"""Tests for Phase 11C — admin prompt-override version history endpoint.

Endpoint under test::

    GET /api/v1/agents/admin/prompt-overrides/{agent_id}/history?limit=20

The endpoint surfaces the chronological edit log of a single agent's
prompt overrides scoped to the calling actor's clinic. Soft-deleted
rows (``enabled=False``) remain visible with ``is_active=False`` so the
admin UI can render a complete timeline. The schema's soft-delete is
the boolean ``enabled`` flag — there is no ``deactivated_at`` column —
so the field is always ``None`` in the response (documented in the
endpoint docstring).
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.persistence.models import AgentPromptOverride, Clinic, User


_AGENT_ID = "clinic.reception"
_HISTORY_URL = f"/api/v1/agents/admin/prompt-overrides/{_AGENT_ID}/history"


@pytest.fixture
def db_session():
    s = SessionLocal()
    try:
        yield s
    finally:
        s.close()


# ---------------------------------------------------------------------------
# Auth + role gates
# ---------------------------------------------------------------------------


def test_clinician_gets_403(
    client: TestClient, auth_headers: dict[str, dict[str, str]]
) -> None:
    resp = client.get(_HISTORY_URL, headers=auth_headers["clinician"])
    assert resp.status_code == 403, resp.text


def test_admin_with_no_overrides_gets_empty_history(
    client: TestClient, auth_headers: dict[str, dict[str, str]]
) -> None:
    resp = client.get(_HISTORY_URL, headers=auth_headers["admin"])
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body == {"agent_id": _AGENT_ID, "history": []}


# ---------------------------------------------------------------------------
# Happy path — create, list, soft-delete
# ---------------------------------------------------------------------------


def _create_override(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
    *,
    system_prompt: str,
    agent_id: str = _AGENT_ID,
    clinic_id: str | None = "clinic-demo-default",
) -> dict:
    resp = client.post(
        "/api/v1/agents/admin/prompt-overrides",
        headers=auth_headers["admin"],
        json={
            "agent_id": agent_id,
            "clinic_id": clinic_id,
            "system_prompt": system_prompt,
        },
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_admin_after_three_creates_returns_three_rows_desc(
    client: TestClient, auth_headers: dict[str, dict[str, str]]
) -> None:
    _create_override(client, auth_headers, system_prompt="v1 prompt")
    _create_override(client, auth_headers, system_prompt="v2 prompt")
    _create_override(client, auth_headers, system_prompt="v3 prompt")

    resp = client.get(_HISTORY_URL, headers=auth_headers["admin"])
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["agent_id"] == _AGENT_ID
    history = body["history"]
    assert len(history) == 3

    # Newest-first by created_at — version is monotonically increasing
    # by the create endpoint, so checking version order is the cleanest
    # proxy for created_at order (avoids brittle timestamp parsing on
    # rows written within the same wall-clock millisecond).
    versions = [row["version"] for row in history]
    assert versions == sorted(versions, reverse=True), versions

    # The first row in the response is the most recent and should be active.
    assert history[0]["system_prompt"] == "v3 prompt"
    assert history[0]["is_active"] is True
    assert history[0]["deactivated_at"] is None
    # created_by_id should be the seeded admin actor from conftest.
    assert history[0]["created_by_id"] == "actor-admin-demo"


def test_deleted_override_appears_with_is_active_false(
    client: TestClient, auth_headers: dict[str, dict[str, str]]
) -> None:
    keep = _create_override(client, auth_headers, system_prompt="kept")
    drop = _create_override(client, auth_headers, system_prompt="will be dropped")

    delete_resp = client.delete(
        f"/api/v1/agents/admin/prompt-overrides/{drop['id']}",
        headers=auth_headers["admin"],
    )
    assert delete_resp.status_code == 200, delete_resp.text

    resp = client.get(_HISTORY_URL, headers=auth_headers["admin"])
    assert resp.status_code == 200, resp.text
    history = resp.json()["history"]
    assert len(history) == 2

    by_id = {row["id"]: row for row in history}
    assert by_id[drop["id"]]["is_active"] is False
    # No deactivated_at column on this table — see endpoint docstring; the
    # field is part of the contract but always None.
    assert by_id[drop["id"]]["deactivated_at"] is None
    assert by_id[keep["id"]]["is_active"] is True


# ---------------------------------------------------------------------------
# Cross-clinic isolation
# ---------------------------------------------------------------------------


def test_cross_clinic_isolation(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
    db_session,
) -> None:
    """Clinic A's history endpoint must NEVER return clinic B's rows.

    Seeds an override owned by clinic A (the calling admin's clinic) plus
    a parallel clinic B and asserts the response contains only clinic A's
    row. Tests both directions by also seeding the calling admin's row
    and confirming clinic B's row is absent regardless of count.
    """
    # Seed a second clinic + an override row owned by it.
    other_clinic = Clinic(id="clinic-other", name="Other Clinic")
    db_session.add(other_clinic)
    db_session.flush()

    other_admin = User(
        id="actor-admin-other",
        email="other_admin@example.com",
        display_name="Other Clinic Admin",
        hashed_password="x",
        role="admin",
        package_id="enterprise",
        clinic_id="clinic-other",
    )
    db_session.add(other_admin)

    db_session.add(
        AgentPromptOverride(
            agent_id=_AGENT_ID,
            clinic_id="clinic-other",
            system_prompt="other-clinic prompt — must not leak",
            version=1,
            enabled=True,
            created_by="actor-admin-other",
        )
    )
    db_session.add(
        AgentPromptOverride(
            agent_id=_AGENT_ID,
            clinic_id="clinic-demo-default",
            system_prompt="demo-clinic prompt",
            version=1,
            enabled=True,
            created_by="actor-admin-demo",
        )
    )
    db_session.commit()

    resp = client.get(_HISTORY_URL, headers=auth_headers["admin"])
    assert resp.status_code == 200, resp.text
    history = resp.json()["history"]
    prompts = [row["system_prompt"] for row in history]
    assert "demo-clinic prompt" in prompts
    assert "other-clinic prompt — must not leak" not in prompts
    assert len(history) == 1


# ---------------------------------------------------------------------------
# Validation: unknown agent + out-of-range limit
# ---------------------------------------------------------------------------


def test_unknown_agent_returns_404(
    client: TestClient, auth_headers: dict[str, dict[str, str]]
) -> None:
    resp = client.get(
        "/api/v1/agents/admin/prompt-overrides/clinic.does_not_exist/history",
        headers=auth_headers["admin"],
    )
    assert resp.status_code == 404, resp.text


def test_limit_above_max_returns_422(
    client: TestClient, auth_headers: dict[str, dict[str, str]]
) -> None:
    resp = client.get(
        f"{_HISTORY_URL}?limit=200",
        headers=auth_headers["admin"],
    )
    assert resp.status_code == 422, resp.text


def test_limit_below_min_returns_422(
    client: TestClient, auth_headers: dict[str, dict[str, str]]
) -> None:
    resp = client.get(
        f"{_HISTORY_URL}?limit=0",
        headers=auth_headers["admin"],
    )
    assert resp.status_code == 422, resp.text
