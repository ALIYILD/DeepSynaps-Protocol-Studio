"""Integration tests for the per-clinician agent hire flow.

Endpoints under test:

* ``POST /api/v1/agents/{id}/hire``    — add to clinician roster (idempotent).
* ``DELETE /api/v1/agents/{id}/hire``  — soft-pause from roster (idempotent).
* ``GET /api/v1/agents/hired``         — return active roster only.
* ``GET /api/v1/agents``               — tiles carry ``hired`` / ``last_used_at``.

Design contract: the hire endpoints are decoupled from Stripe entitlement
(``agent_subscriptions``). A clinician can only hire agents the role/package
gates already let them see — the visibility check IS the entitlement check.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


# Pick a real clinic-side agent that the clinician demo token can see.
# ``clinic.reception`` has role_required="clinician" and no package gate.
AGENT_ID = "clinic.reception"
PATIENT_AGENT_ID = "patient.adherence"  # role_required="patient" — not visible to clinicians? actually patient agents are not visible to clinicians per audit


@pytest.fixture(autouse=True)
def _stub_llm(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "app.services.chat_service._llm_chat",
        lambda **kwargs: "test reply",
    )


def _list(client: TestClient, headers: dict[str, str]) -> list[dict]:
    resp = client.get("/api/v1/agents/", headers=headers)
    assert resp.status_code == 200
    return resp.json()["agents"]


def _hired(client: TestClient, headers: dict[str, str]) -> list[dict]:
    resp = client.get("/api/v1/agents/hired", headers=headers)
    assert resp.status_code == 200
    return resp.json()["agents"]


# ---------------------------------------------------------------------------
# Hire — happy path
# ---------------------------------------------------------------------------


def test_hire_marks_tile_as_hired_in_list(
    client: TestClient, auth_headers: dict[str, dict[str, str]]
) -> None:
    headers = auth_headers["clinician"]

    # Pre-state: agent visible but not hired.
    tiles = _list(client, headers)
    target = next(t for t in tiles if t["id"] == AGENT_ID)
    assert target["hired"] is False

    # Hire it.
    resp = client.post(f"/api/v1/agents/{AGENT_ID}/hire", headers=headers)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["agent_id"] == AGENT_ID
    assert body["hired"] is True
    assert body["created"] is True

    # Tile flag flips.
    tiles = _list(client, headers)
    target = next(t for t in tiles if t["id"] == AGENT_ID)
    assert target["hired"] is True


def test_hire_is_idempotent(
    client: TestClient, auth_headers: dict[str, dict[str, str]]
) -> None:
    headers = auth_headers["clinician"]

    first = client.post(f"/api/v1/agents/{AGENT_ID}/hire", headers=headers)
    assert first.status_code == 200
    second = client.post(f"/api/v1/agents/{AGENT_ID}/hire", headers=headers)
    assert second.status_code == 200
    # Second call MUST report the row as already-active, not freshly created.
    assert second.json()["created"] is False


def test_hired_endpoint_returns_only_hired_agents(
    client: TestClient, auth_headers: dict[str, dict[str, str]]
) -> None:
    headers = auth_headers["clinician"]

    # Empty roster initially.
    assert _hired(client, headers) == []

    # Hire one.
    client.post(f"/api/v1/agents/{AGENT_ID}/hire", headers=headers)
    hired = _hired(client, headers)
    assert [a["id"] for a in hired] == [AGENT_ID]
    assert hired[0]["hired"] is True


# ---------------------------------------------------------------------------
# Unhire
# ---------------------------------------------------------------------------


def test_unhire_drops_from_rail_but_keeps_in_full_list(
    client: TestClient, auth_headers: dict[str, dict[str, str]]
) -> None:
    headers = auth_headers["clinician"]
    client.post(f"/api/v1/agents/{AGENT_ID}/hire", headers=headers)
    assert [a["id"] for a in _hired(client, headers)] == [AGENT_ID]

    resp = client.delete(f"/api/v1/agents/{AGENT_ID}/hire", headers=headers)
    assert resp.status_code == 204

    # Roster empty.
    assert _hired(client, headers) == []
    # Full list still includes the agent (it's just not on the active roster).
    full = _list(client, headers)
    assert any(t["id"] == AGENT_ID for t in full)
    target = next(t for t in full if t["id"] == AGENT_ID)
    assert target["hired"] is False


def test_unhire_is_idempotent_when_no_row_exists(
    client: TestClient, auth_headers: dict[str, dict[str, str]]
) -> None:
    """DELETE on an un-hired agent returns 204 — does not 404. We don't want
    to leak which agents the clinician had previously hired."""
    headers = auth_headers["clinician"]
    resp = client.delete(f"/api/v1/agents/{AGENT_ID}/hire", headers=headers)
    assert resp.status_code == 204


def test_rehire_after_unhire_reactivates_paused_row(
    client: TestClient, auth_headers: dict[str, dict[str, str]]
) -> None:
    headers = auth_headers["clinician"]

    client.post(f"/api/v1/agents/{AGENT_ID}/hire", headers=headers)
    client.delete(f"/api/v1/agents/{AGENT_ID}/hire", headers=headers)

    resp = client.post(f"/api/v1/agents/{AGENT_ID}/hire", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    # The repository reactivates the paused row rather than minting a new one.
    # ``created`` is True here because the row was not in active state at the
    # moment of the call.
    assert body["created"] is True
    assert body["hired"] is True


# ---------------------------------------------------------------------------
# Auth / role gates
# ---------------------------------------------------------------------------


def test_hire_requires_clinician_role_rejects_guest(
    client: TestClient, auth_headers: dict[str, dict[str, str]]
) -> None:
    resp = client.post(
        f"/api/v1/agents/{AGENT_ID}/hire", headers=auth_headers["guest"]
    )
    assert resp.status_code == 403


def test_hire_requires_clinician_role_rejects_patient(
    client: TestClient, auth_headers: dict[str, dict[str, str]]
) -> None:
    resp = client.post(
        f"/api/v1/agents/{AGENT_ID}/hire", headers=auth_headers["patient"]
    )
    assert resp.status_code == 403


def test_hire_requires_auth(client: TestClient) -> None:
    resp = client.post(f"/api/v1/agents/{AGENT_ID}/hire")
    # No auth → anonymous guest → role gate → 403.
    assert resp.status_code == 403


def test_hire_unknown_agent_returns_404(
    client: TestClient, auth_headers: dict[str, dict[str, str]]
) -> None:
    resp = client.post(
        "/api/v1/agents/clinic.does-not-exist/hire",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Cross-actor isolation
# ---------------------------------------------------------------------------


def test_one_clinician_hire_does_not_leak_to_another_actor(
    client: TestClient, auth_headers: dict[str, dict[str, str]]
) -> None:
    """The hire roster is per-actor. A hire by the clinician demo token must
    not appear on the admin demo token's roster, even though admins can
    see the same agents."""
    client.post(
        f"/api/v1/agents/{AGENT_ID}/hire", headers=auth_headers["clinician"]
    )
    admin_roster = _hired(client, auth_headers["admin"])
    # admin starts empty (no hire by them).
    assert admin_roster == []
