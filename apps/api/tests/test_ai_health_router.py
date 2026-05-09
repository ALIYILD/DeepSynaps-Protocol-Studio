"""Tests for ai_health_router — GET /api/v1/health/ai.

The endpoint requires no auth, calls no external services, and returns a
structured report. We verify the contract thoroughly since the router is
a pure function with only env/importlib side effects.
"""

from __future__ import annotations

import importlib
import os
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_ai_health_returns_200(client: TestClient) -> None:
    r = client.get("/api/v1/health/ai")
    assert r.status_code == 200


def test_ai_health_top_level_keys(client: TestClient) -> None:
    r = client.get("/api/v1/health/ai")
    body = r.json()
    assert "timestamp" in body
    assert "summary" in body
    assert "features" in body


def test_ai_health_summary_shape(client: TestClient) -> None:
    r = client.get("/api/v1/health/ai")
    summary = r.json()["summary"]
    assert "active" in summary
    assert "total" in summary
    assert "llm_backend_configured" in summary
    assert isinstance(summary["active"], int)
    assert isinstance(summary["total"], int)
    assert isinstance(summary["llm_backend_configured"], bool)


def test_ai_health_features_list_non_empty(client: TestClient) -> None:
    r = client.get("/api/v1/health/ai")
    features = r.json()["features"]
    assert isinstance(features, list)
    assert len(features) > 0


def test_ai_health_each_feature_has_required_fields(client: TestClient) -> None:
    r = client.get("/api/v1/health/ai")
    for feature in r.json()["features"]:
        assert "feature" in feature, f"missing 'feature' key in {feature}"
        assert "status" in feature, f"missing 'status' key in {feature}"
        assert "real_ai" in feature, f"missing 'real_ai' key in {feature}"
        assert "safe_user_message" in feature, f"missing 'safe_user_message' key in {feature}"
        assert "last_checked" in feature, f"missing 'last_checked' key in {feature}"


def test_ai_health_known_features_present(client: TestClient) -> None:
    """Check a subset of known-required features are always reported."""
    r = client.get("/api/v1/health/ai")
    names = {f["feature"] for f in r.json()["features"]}
    expected = {"chat_copilot", "qeeg_interpreter", "generation_engine", "safety_engine"}
    for name in expected:
        assert name in names, f"feature '{name}' missing from health report"


def test_ai_health_no_llm_key_marks_chat_copilot_unavailable(client: TestClient) -> None:
    """Without any LLM key, chat_copilot must NOT be 'active'."""
    env_backup = {
        k: os.environ.pop(k, None)
        for k in ("GLM_API_KEY", "ANTHROPIC_API_KEY", "OPENAI_API_KEY")
    }
    try:
        # Re-import the router module so _has_env sees the cleared env
        import importlib
        import app.routers.ai_health_router as mod
        importlib.reload(mod)

        r = client.get("/api/v1/health/ai")
        feature_map = {f["feature"]: f for f in r.json()["features"]}
        chat = feature_map.get("chat_copilot", {})
        assert chat.get("status") != "active", "chat_copilot should not be active without any API key"
    finally:
        for k, v in env_backup.items():
            if v is not None:
                os.environ[k] = v


def test_ai_health_rule_based_features_never_active(client: TestClient) -> None:
    """Rule-based features should have real_ai=False and not report 'active'."""
    r = client.get("/api/v1/health/ai")
    for feat in r.json()["features"]:
        if not feat["real_ai"]:
            assert feat["status"] != "active", (
                f"rule-based feature '{feat['feature']}' reported status='active'"
            )


def test_ai_health_summary_total_matches_features_count(client: TestClient) -> None:
    r = client.get("/api/v1/health/ai")
    body = r.json()
    assert body["summary"]["total"] == len(body["features"])


def test_ai_health_summary_active_count_consistent(client: TestClient) -> None:
    r = client.get("/api/v1/health/ai")
    body = r.json()
    actual_active = sum(1 for f in body["features"] if f["status"] == "active")
    assert body["summary"]["active"] == actual_active
