"""Tests for /api/v1/chat/agent doctor practice agent endpoint."""

from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)

AUTH_HDR = {"Authorization": "Bearer clinician-demo-token"}


def test_chat_agent_returns_honest_not_configured_when_no_keys() -> None:
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

