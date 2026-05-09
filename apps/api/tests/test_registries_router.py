"""Tests for the registries router (conditions, modalities, devices, protocols, phenotypes, governance)."""
from __future__ import annotations

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

CLINICIAN_HDR = {"Authorization": "Bearer clinician-demo-token"}


def test_conditions_accessible_without_auth():
    """GET /registry/conditions is accessible (uses guest actor by default)."""
    r = client.get("/api/v1/registry/conditions")
    # Registry endpoints use get_authenticated_actor which defaults to guest;
    # the endpoint does not call require_minimum_role so 200 is correct.
    assert r.status_code == 200
    body = r.json()
    assert "items" in body


def test_conditions_returns_list():
    """Authenticated clinician gets conditions list."""
    r = client.get("/api/v1/registry/conditions", headers=CLINICIAN_HDR)
    assert r.status_code == 200
    body = r.json()
    assert "items" in body
    assert "total" in body
    assert isinstance(body["items"], list)
    assert body["total"] == len(body["items"])


def test_modalities_returns_list():
    """Authenticated clinician gets modalities list."""
    r = client.get("/api/v1/registry/modalities", headers=CLINICIAN_HDR)
    assert r.status_code == 200
    body = r.json()
    assert "items" in body
    assert isinstance(body["items"], list)


def test_devices_returns_list():
    """Authenticated clinician gets devices list."""
    r = client.get("/api/v1/registry/devices", headers=CLINICIAN_HDR)
    assert r.status_code == 200
    body = r.json()
    assert "items" in body
    assert isinstance(body["items"], list)


def test_protocols_returns_list():
    """Authenticated clinician gets protocols list."""
    r = client.get("/api/v1/registry/protocols", headers=CLINICIAN_HDR)
    assert r.status_code == 200
    body = r.json()
    assert "items" in body
    assert isinstance(body["items"], list)


def test_protocols_filter_on_label():
    """on_label_only=true returns only on-label protocols."""
    r = client.get("/api/v1/registry/protocols?on_label_only=true", headers=CLINICIAN_HDR)
    assert r.status_code == 200
    body = r.json()
    for p in body["items"]:
        assert p["on_label_vs_off_label"].lower().startswith("on-label")


def test_condition_not_found_returns_404():
    """Unknown condition slug returns 404."""
    r = client.get("/api/v1/registry/conditions/NONEXISTENT_XYZ", headers=CLINICIAN_HDR)
    assert r.status_code == 404


def test_phenotypes_returns_list():
    """Authenticated clinician gets phenotypes list."""
    r = client.get("/api/v1/registry/phenotypes", headers=CLINICIAN_HDR)
    assert r.status_code == 200
    body = r.json()
    assert "items" in body
    assert isinstance(body["items"], list)


def test_governance_rules_returns_list():
    """Authenticated clinician gets governance rules list."""
    r = client.get("/api/v1/registry/governance-rules", headers=CLINICIAN_HDR)
    assert r.status_code == 200
    body = r.json()
    assert "items" in body
    assert isinstance(body["items"], list)
