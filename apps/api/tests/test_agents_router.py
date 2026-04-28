"""Integration tests for the /api/v1/agents marketplace endpoints."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.services.agents.registry import AGENT_REGISTRY


# ---------------------------------------------------------------------------
# LLM mocking — the runner reaches into chat_service._llm_chat. Patching it
# at module scope keeps the test suite independent of any upstream LLM
# provider configuration.
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def _stub_llm(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "app.services.chat_service._llm_chat",
        lambda **kwargs: "test reply",
    )


# ---------------------------------------------------------------------------
# GET /api/v1/agents
# ---------------------------------------------------------------------------


def test_list_agents_unauthenticated_falls_back_to_anonymous_empty(
    client: TestClient,
) -> None:
    # ``get_authenticated_actor`` resolves a missing Authorization header to
    # an anonymous guest. The marketplace then returns an empty agent list
    # rather than 401, so the public landing-page tile can render an
    # empty-state without forcing a login round-trip.
    resp = client.get("/api/v1/agents/")
    assert resp.status_code == 200
    assert resp.json() == {"agents": []}


def test_list_agents_for_clinician(
    client: TestClient, auth_headers: dict[str, dict[str, str]]
) -> None:
    resp = client.get("/api/v1/agents/", headers=auth_headers["clinician"])
    assert resp.status_code == 200, resp.text
    body = resp.json()
    ids = {item["id"] for item in body["agents"]}
    # clinician role + clinician_pro package = reception + drclaw, no reporting
    assert ids == {"clinic.reception", "clinic.drclaw_telegram"}

    # Tile shape — system_prompt must NOT leak; the marketplace fields must.
    sample = body["agents"][0]
    assert "system_prompt" not in sample
    for required_field in (
        "id",
        "name",
        "tagline",
        "audience",
        "role_required",
        "package_required",
        "tool_allowlist",
        "monthly_price_gbp",
        "tags",
    ):
        assert required_field in sample, f"missing {required_field} in tile shape"


def test_list_agents_for_admin_sees_all_three(
    client: TestClient, auth_headers: dict[str, dict[str, str]]
) -> None:
    resp = client.get("/api/v1/agents/", headers=auth_headers["admin"])
    assert resp.status_code == 200
    ids = {item["id"] for item in resp.json()["agents"]}
    assert ids == {
        "clinic.reception",
        "clinic.reporting",
        "clinic.drclaw_telegram",
    }


def test_list_agents_for_guest_returns_empty_list(
    client: TestClient, auth_headers: dict[str, dict[str, str]]
) -> None:
    # guest is authenticated but holds no qualifying role/package — we render
    # an empty marketplace rather than 403 so the UI can show an empty state.
    resp = client.get("/api/v1/agents/", headers=auth_headers["guest"])
    assert resp.status_code == 200
    assert resp.json() == {"agents": []}


# ---------------------------------------------------------------------------
# POST /api/v1/agents/{agent_id}/run
# ---------------------------------------------------------------------------


def test_run_returns_expected_envelope_for_clinician(
    client: TestClient, auth_headers: dict[str, dict[str, str]]
) -> None:
    resp = client.post(
        "/api/v1/agents/clinic.reception/run",
        json={"message": "Book a session for tomorrow."},
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["agent_id"] == "clinic.reception"
    assert body["reply"] == "test reply"
    assert body["schema_id"] == "deepsynaps.agents.run/v1"
    assert body["safety_footer"] == "decision-support, not autonomous diagnosis"
    assert body.get("error") in (None,)


def test_run_admin_only_agent_rejects_clinician(
    client: TestClient, auth_headers: dict[str, dict[str, str]]
) -> None:
    # clinic.reporting requires admin — clinician must be denied.
    resp = client.post(
        "/api/v1/agents/clinic.reporting/run",
        json={"message": "Draft this week's digest."},
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 403, resp.text


def test_run_admin_only_agent_works_for_admin(
    client: TestClient, auth_headers: dict[str, dict[str, str]]
) -> None:
    resp = client.post(
        "/api/v1/agents/clinic.reporting/run",
        json={"message": "Draft this week's digest."},
        headers=auth_headers["admin"],
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["agent_id"] == "clinic.reporting"


def test_run_unknown_agent_returns_404(
    client: TestClient, auth_headers: dict[str, dict[str, str]]
) -> None:
    resp = client.post(
        "/api/v1/agents/clinic.does_not_exist/run",
        json={"message": "anything"},
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 404, resp.text


def test_run_with_empty_message_returns_422(
    client: TestClient, auth_headers: dict[str, dict[str, str]]
) -> None:
    resp = client.post(
        "/api/v1/agents/clinic.reception/run",
        json={"message": ""},
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 422, resp.text


def test_run_requires_auth(client: TestClient) -> None:
    resp = client.post(
        "/api/v1/agents/clinic.reception/run",
        json={"message": "hi"},
    )
    assert resp.status_code in (401, 403)


def test_run_with_context_passes_through(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The runner should embed a context block in the user message.

    Phase 2 (ToolBroker) now prepends a ``<context source="clinic_live">``
    block populated by the broker. Caller-supplied ``context`` is folded
    into the same block under a ``caller_context`` key so the model still
    sees it.
    """
    captured: dict[str, object] = {}

    def _capture(**kwargs):
        captured.update(kwargs)
        return "ok"

    monkeypatch.setattr("app.services.chat_service._llm_chat", _capture)

    resp = client.post(
        "/api/v1/agents/clinic.reception/run",
        json={
            "message": "Look up patient.",
            "context": {"patient_id": "pat-123"},
        },
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200
    user_content = captured["messages"][0]["content"]  # type: ignore[index]
    # Either the live-context tag OR the legacy bare tag must appear.
    assert "<context" in user_content
    assert "pat-123" in user_content
    assert "Look up patient." in user_content


# ---------------------------------------------------------------------------
# Runner-level test — verify the schema even when LLM is mocked.
# ---------------------------------------------------------------------------


def test_runner_returns_expected_schema_when_llm_mocked(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "app.services.chat_service._llm_chat", lambda **k: "test reply"
    )
    from app.services.agents import run_agent

    agent = AGENT_REGISTRY["clinic.reception"]
    result = run_agent(agent, message="hello")

    assert result["agent_id"] == "clinic.reception"
    assert result["reply"] == "test reply"
    assert result["schema_id"] == "deepsynaps.agents.run/v1"
    assert result["safety_footer"] == "decision-support, not autonomous diagnosis"
    assert "error" not in result


def test_runner_returns_safe_failure_envelope_on_llm_exception(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def _boom(**_kwargs):
        raise RuntimeError("upstream is sad")

    monkeypatch.setattr("app.services.chat_service._llm_chat", _boom)
    from app.services.agents import run_agent

    agent = AGENT_REGISTRY["clinic.reception"]
    result = run_agent(agent, message="hello")

    assert result["reply"] == ""
    assert result["error"] == "llm_call_failed"
    assert result["schema_id"] == "deepsynaps.agents.run/v1"
    assert result["safety_footer"] == "decision-support, not autonomous diagnosis"
