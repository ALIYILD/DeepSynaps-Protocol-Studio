"""Tests for registries_router — /api/v1/registry/*.

Covers:
- GET /registry/conditions requires auth and returns items list
- GET /registry/modalities returns items list
- GET /registry/devices returns items list
- GET /registry/protocols supports filter params
- GET /registry/protocols/{id} returns 404 for unknown ID
- GET /registry/conditions/{id} returns 404 for unknown ID
- GET /registry/phenotypes returns items list
- GET /registry/governance-rules returns items list
"""
from __future__ import annotations

from fastapi.testclient import TestClient


def test_list_conditions_accessible_anonymously(client: TestClient) -> None:
    """The registry endpoints allow any actor including anonymous guests."""
    resp = client.get("/api/v1/registry/conditions")
    assert resp.status_code == 200
    body = resp.json()
    assert "items" in body


def test_list_conditions_returns_items(client: TestClient, auth_headers: dict) -> None:
    resp = client.get("/api/v1/registry/conditions", headers=auth_headers["clinician"])
    assert resp.status_code == 200
    body = resp.json()
    assert "items" in body
    assert "total" in body
    assert isinstance(body["items"], list)
    assert body["total"] == len(body["items"])


def test_list_modalities_returns_items(client: TestClient, auth_headers: dict) -> None:
    resp = client.get("/api/v1/registry/modalities", headers=auth_headers["clinician"])
    assert resp.status_code == 200
    body = resp.json()
    assert "items" in body
    assert isinstance(body["items"], list)


def test_list_devices_returns_items(client: TestClient, auth_headers: dict) -> None:
    resp = client.get("/api/v1/registry/devices", headers=auth_headers["clinician"])
    assert resp.status_code == 200
    body = resp.json()
    assert "items" in body
    assert isinstance(body["items"], list)


def test_list_protocols_returns_items(client: TestClient, auth_headers: dict) -> None:
    resp = client.get("/api/v1/registry/protocols", headers=auth_headers["clinician"])
    assert resp.status_code == 200
    body = resp.json()
    assert "items" in body
    assert "total" in body
    assert isinstance(body["items"], list)


def test_list_protocols_on_label_filter(client: TestClient, auth_headers: dict) -> None:
    resp = client.get(
        "/api/v1/registry/protocols?on_label_only=true",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200
    body = resp.json()
    # Every returned protocol should be on-label
    for p in body["items"]:
        assert p["on_label_vs_off_label"].lower().startswith("on-label")


def test_get_protocol_not_found(client: TestClient, auth_headers: dict) -> None:
    resp = client.get(
        "/api/v1/registry/protocols/NONEXISTENT-PROTOCOL-99999",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 404


def test_get_condition_not_found(client: TestClient, auth_headers: dict) -> None:
    resp = client.get(
        "/api/v1/registry/conditions/NONEXISTENT-COND-99999",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 404


def test_list_phenotypes_returns_items(client: TestClient, auth_headers: dict) -> None:
    resp = client.get("/api/v1/registry/phenotypes", headers=auth_headers["clinician"])
    assert resp.status_code == 200
    body = resp.json()
    assert "items" in body
    assert isinstance(body["items"], list)


def test_list_governance_rules_returns_items(client: TestClient, auth_headers: dict) -> None:
    resp = client.get("/api/v1/registry/governance-rules", headers=auth_headers["clinician"])
    assert resp.status_code == 200
    body = resp.json()
    assert "items" in body
    assert isinstance(body["items"], list)
