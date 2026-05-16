"""Tests for agent_config_router — per-clinic agent configuration.

Covers:
  - GET /api/v1/agent-config/{agent_id}
  - PUT /api/v1/agent-config/{agent_id}
  - GET /api/v1/agent-config/defaults/{agent_id}

Auth, role gates, happy paths, empty-config fallback.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.persistence.models import AgentConfig

_AGENT_ID = "clinic.reception"
_CLINIC_ID = "clinic-demo-default"


# ── GET /{agent_id} ───────────────────────────────────────────────────────────


def test_get_config_no_row_returns_empty(client: TestClient, auth_headers: dict) -> None:
    r = client.get(
        f"/api/v1/agent-config/{_AGENT_ID}",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200
    body = r.json()
    assert body["agent_id"] == _AGENT_ID
    assert body["config"] == {}
    assert body["updated_at"] is None


def test_get_config_requires_auth(client: TestClient) -> None:
    r = client.get(f"/api/v1/agent-config/{_AGENT_ID}")
    assert r.status_code == 403


def test_get_config_patient_is_403(client: TestClient, auth_headers: dict) -> None:
    r = client.get(
        f"/api/v1/agent-config/{_AGENT_ID}",
        headers=auth_headers["patient"],
    )
    assert r.status_code == 403


# ── PUT /{agent_id} ───────────────────────────────────────────────────────────


def test_put_config_creates_row(client: TestClient, auth_headers: dict) -> None:
    r = client.put(
        f"/api/v1/agent-config/{_AGENT_ID}",
        json={"config": {"tools": ["sessions.list"], "temperature": 0.7}},
        headers=auth_headers["admin"],
    )
    assert r.status_code == 200
    body = r.json()
    assert body["agent_id"] == _AGENT_ID
    assert body["config"] == {"tools": ["sessions.list"], "temperature": 0.7}
    assert body["updated_at"] is not None


def test_put_config_updates_existing_row(client: TestClient, auth_headers: dict) -> None:
    # First create
    r1 = client.put(
        f"/api/v1/agent-config/{_AGENT_ID}",
        json={"config": {"tools": ["sessions.list"]}},
        headers=auth_headers["admin"],
    )
    assert r1.status_code == 200

    # Then update
    r2 = client.put(
        f"/api/v1/agent-config/{_AGENT_ID}",
        json={"config": {"tools": ["sessions.list", "patients.list"], "temperature": 0.5}},
        headers=auth_headers["admin"],
    )
    assert r2.status_code == 200
    body = r2.json()
    assert body["config"] == {"tools": ["sessions.list", "patients.list"], "temperature": 0.5}


def test_put_config_requires_auth(client: TestClient) -> None:
    r = client.put(
        f"/api/v1/agent-config/{_AGENT_ID}",
        json={"config": {"tools": []}},
    )
    assert r.status_code == 403


def test_put_config_clinician_is_403(client: TestClient, auth_headers: dict) -> None:
    r = client.put(
        f"/api/v1/agent-config/{_AGENT_ID}",
        json={"config": {"tools": []}},
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 403


def test_put_config_invalid_body_is_422(client: TestClient, auth_headers: dict) -> None:
    r = client.put(
        f"/api/v1/agent-config/{_AGENT_ID}",
        json={"config": "not-a-dict"},
        headers=auth_headers["admin"],
    )
    assert r.status_code == 422


# ── GET /defaults/{agent_id} ──────────────────────────────────────────────────


def test_get_defaults_returns_registry_default(client: TestClient, auth_headers: dict) -> None:
    r = client.get(
        f"/api/v1/agent-config/defaults/{_AGENT_ID}",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200
    body = r.json()
    assert body["agent_id"] == _AGENT_ID
    # AGENT_REGISTRY agents currently have no default_config attribute
    assert body["config"] == {}


def test_get_defaults_requires_auth(client: TestClient) -> None:
    r = client.get(f"/api/v1/agent-config/defaults/{_AGENT_ID}")
    assert r.status_code == 403


def test_get_defaults_patient_is_403(client: TestClient, auth_headers: dict) -> None:
    r = client.get(
        f"/api/v1/agent-config/defaults/{_AGENT_ID}",
        headers=auth_headers["patient"],
    )
    assert r.status_code == 403


# ── Persistence sanity ────────────────────────────────────────────────────────


def test_put_config_persists_to_db(client: TestClient, auth_headers: dict) -> None:
    db = SessionLocal()
    try:
        db.query(AgentConfig).filter(
            AgentConfig.clinic_id == _CLINIC_ID,
            AgentConfig.agent_id == _AGENT_ID,
        ).delete()
        db.commit()
    finally:
        db.close()

    r = client.put(
        f"/api/v1/agent-config/{_AGENT_ID}",
        json={"config": {"persisted": True}},
        headers=auth_headers["admin"],
    )
    assert r.status_code == 200

    db = SessionLocal()
    try:
        row = db.query(AgentConfig).filter(
            AgentConfig.clinic_id == _CLINIC_ID,
            AgentConfig.agent_id == _AGENT_ID,
        ).first()
        assert row is not None
        assert row.config == {"persisted": True}
    finally:
        db.close()
