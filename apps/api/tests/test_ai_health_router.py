"""Tests for ai_health_router — /api/v1/health/ai.

Pins:
  - endpoint is reachable and returns the expected top-level shape
  - summary keys are present
  - features list is non-empty
  - each feature entry carries required keys
  - no env vars → features with real_ai=True show unavailable/fallback (not active)
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_ai_health_returns_200():
    """GET /api/v1/health/ai must return 200 with no auth."""
    r = client.get("/api/v1/health/ai")
    assert r.status_code == 200


def test_ai_health_top_level_shape():
    """Response must have timestamp, summary, and features keys."""
    r = client.get("/api/v1/health/ai")
    body = r.json()
    assert "timestamp" in body
    assert "summary" in body
    assert "features" in body


def test_ai_health_summary_keys():
    """summary must carry active, total, and llm_backend_configured."""
    summary = client.get("/api/v1/health/ai").json()["summary"]
    assert "active" in summary
    assert "total" in summary
    assert "llm_backend_configured" in summary
    assert isinstance(summary["active"], int)
    assert isinstance(summary["total"], int)


def test_ai_health_features_non_empty():
    """features list must not be empty — at least the safety engine is always present."""
    features = client.get("/api/v1/health/ai").json()["features"]
    assert isinstance(features, list)
    assert len(features) >= 1


def test_ai_health_feature_entry_shape():
    """Every feature entry must carry the required diagnostic keys."""
    features = client.get("/api/v1/health/ai").json()["features"]
    required = {
        "feature",
        "status",
        "real_ai",
        "required_env_vars",
        "required_packages",
        "required_weights",
        "current_missing",
        "safe_user_message",
        "last_checked",
    }
    for f in features:
        assert required.issubset(f.keys()), f"Feature {f.get('feature')} is missing keys"


def test_ai_health_known_features_present():
    """Mandatory feature names must always appear in the list."""
    names = {f["feature"] for f in client.get("/api/v1/health/ai").json()["features"]}
    for expected in ("safety_engine", "generation_engine", "chat_copilot"):
        assert expected in names, f"Feature '{expected}' not in response"


def test_ai_health_no_llm_key_env_means_chat_not_active(monkeypatch):
    """When no LLM API key is set, chat_copilot must not report status=active."""
    for key in ("GLM_API_KEY", "ANTHROPIC_API_KEY", "OPENAI_API_KEY"):
        monkeypatch.delenv(key, raising=False)
    # Re-call the endpoint (the helper re-checks env each request)
    features = client.get("/api/v1/health/ai").json()["features"]
    chat = next((f for f in features if f["feature"] == "chat_copilot"), None)
    assert chat is not None
    assert chat["status"] != "active"
