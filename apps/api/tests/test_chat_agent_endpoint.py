"""Tests for /api/v1/chat/agent doctor practice agent endpoint."""

from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)

AUTH_HDR = {"Authorization": "Bearer clinician-demo-token"}


def test_chat_agent_returns_honest_not_configured_when_no_keys(monkeypatch) -> None:
    # Isolate from any real provider keys that may be present in the environment.
    # We monkeypatch get_settings inside chat_service so the endpoint sees empty keys.
    from app.services import chat_service as _chat_svc

    class _FakeSettings:
        glm_api_key: str = ""
        anthropic_api_key: str = ""
        openai_api_key: str = ""

    monkeypatch.setattr(_chat_svc, "get_settings", lambda: _FakeSettings())

    # In test env we do not expect real provider keys to be configured.
    r = client.post(
        "/api/v1/chat/agent",
        headers=AUTH_HDR,
        json={
            "messages": [{"role": "user", "content": "Summarize the review queue."}],
            "provider": "glm-free",
            "context": "[DEMO] dashboard snapshot",
        },
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert "reply" in data
    assert isinstance(data.get("cited_papers"), list)
    # Must be truthful: do not fabricate an answer when providers are missing.
    assert "not configured" in (data["reply"] or "").lower()

