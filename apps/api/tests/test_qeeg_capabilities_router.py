"""Tests for the qEEG Capabilities router (PR 102 set L).

Covers:
  GET /api/v1/qeeg/capabilities

Key contracts:
  * No authentication required — pure capability/dependency report.
  * Returns QeegCapabilitiesResponse shape with features, normative_database, wineeg_reference.
  * generated_at is a valid ISO-8601 timestamp.
  * Every feature item has: id, label, status, required_packages, missing_packages,
    clinical_caveat, ui_surfaces.
  * No secrets / env var values are returned (only presence flags).
  * Status values are restricted to known CapabilityStatus literals.
  * wineeg_reference always describes itself as reference-only (safety boundary).
  * features list is deterministically sorted by id.
  * 'wineeg_reference_library' feature has status='reference_only'.
"""
from __future__ import annotations

import pytest
from datetime import datetime
from fastapi.testclient import TestClient

from app.main import app

_KNOWN_STATUSES = {"active", "fallback", "unavailable", "experimental", "reference_only"}


# ── Happy path ───────────────────────────────────────────────────────────────


def test_capabilities_happy_path(client: TestClient) -> None:
    """Endpoint returns 200 without authentication."""
    r = client.get("/api/v1/qeeg/capabilities")
    assert r.status_code == 200


def test_capabilities_shape(client: TestClient) -> None:
    """Response contains the expected top-level keys."""
    r = client.get("/api/v1/qeeg/capabilities")
    body = r.json()
    assert "features" in body
    assert "normative_database" in body
    assert "wineeg_reference" in body
    assert "generated_at" in body


def test_capabilities_generated_at_is_iso(client: TestClient) -> None:
    """generated_at must be a parseable ISO-8601 timestamp."""
    r = client.get("/api/v1/qeeg/capabilities")
    ts = r.json()["generated_at"]
    # Raises ValueError if not parseable
    datetime.fromisoformat(ts.replace("Z", "+00:00"))


def test_capabilities_features_is_list(client: TestClient) -> None:
    r = client.get("/api/v1/qeeg/capabilities")
    assert isinstance(r.json()["features"], list)


def test_capabilities_features_have_required_keys(client: TestClient) -> None:
    """Every feature must have the mandatory keys."""
    r = client.get("/api/v1/qeeg/capabilities")
    for feature in r.json()["features"]:
        for key in ("id", "label", "status", "required_packages", "missing_packages", "clinical_caveat", "ui_surfaces"):
            assert key in feature, f"Feature '{feature.get('id')}' missing key '{key}'"


def test_capabilities_feature_statuses_valid(client: TestClient) -> None:
    """All feature status values must be in the known set."""
    r = client.get("/api/v1/qeeg/capabilities")
    for feature in r.json()["features"]:
        assert feature["status"] in _KNOWN_STATUSES, (
            f"Unknown status '{feature['status']}' for feature '{feature['id']}'"
        )


def test_capabilities_no_env_secrets_in_response(client: TestClient) -> None:
    """The response must never contain actual env-var values (only absence/presence flags)."""
    r = client.get("/api/v1/qeeg/capabilities")
    body_str = r.text
    # Common secret patterns: database DSNs, API keys
    import re
    # Should not contain postgresql:// or sqlite:// connection strings
    assert "postgresql://" not in body_str, "DB connection string leaked into capabilities response"
    assert "sk-" not in body_str, "OpenAI-style API key leaked into capabilities response"


def test_capabilities_wineeg_is_reference_only(client: TestClient) -> None:
    """WinEEG feature must always be reference_only — no native compatibility."""
    r = client.get("/api/v1/qeeg/capabilities")
    features = {f["id"]: f for f in r.json()["features"]}
    wineeg_feat = features.get("wineeg_reference_library")
    assert wineeg_feat is not None, "wineeg_reference_library feature not found"
    assert wineeg_feat["status"] == "reference_only", (
        f"Expected reference_only, got {wineeg_feat['status']}"
    )


def test_capabilities_features_sorted_by_id(client: TestClient) -> None:
    """Features must be returned in deterministic alphabetical id order."""
    r = client.get("/api/v1/qeeg/capabilities")
    ids = [f["id"] for f in r.json()["features"]]
    assert ids == sorted(ids), f"Features not sorted by id: {ids}"


def test_capabilities_normative_database_has_status(client: TestClient) -> None:
    norm = client.get("/api/v1/qeeg/capabilities").json()["normative_database"]
    assert "status" in norm
    assert "clinical_caveat" in norm
    assert norm["status"] in ("configured", "toy", "unavailable")


def test_capabilities_wineeg_reference_has_caveat(client: TestClient) -> None:
    wineeg = client.get("/api/v1/qeeg/capabilities").json()["wineeg_reference"]
    assert "caveat" in wineeg
    caveat = wineeg["caveat"].lower()
    assert "reference-only" in caveat or "reference only" in caveat, (
        "WinEEG reference caveat must mention 'reference-only'"
    )
