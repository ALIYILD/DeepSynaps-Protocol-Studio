"""Tests for /api/v1/auth-drift-rotation-policy-advisor (CSAHP4).

Covers:
- GET /advice — auth gate, empty clinic, window_days param, thresholds shape
- GET /audit-events — auth gate, empty list
- POST /audit-events — create + round-trip
- Edge: window_days out of range (422)
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app

_CLINICIAN = {"Authorization": "Bearer clinician-demo-token"}
_ADMIN = {"Authorization": "Bearer admin-demo-token"}
_BASE = "/api/v1/auth-drift-rotation-policy-advisor"


@pytest.fixture
def client() -> TestClient:
    with TestClient(app) as c:
        yield c


# ── /advice ──────────────────────────────────────────────────────────────────

def test_advice_requires_auth(client: TestClient) -> None:
    r = client.get(f"{_BASE}/advice")
    assert r.status_code == 403


def test_advice_returns_list_shape_empty_db(client: TestClient) -> None:
    r = client.get(f"{_BASE}/advice", headers=_CLINICIAN)
    assert r.status_code == 200
    body = r.json()
    assert "advice_cards" in body
    assert "window_days" in body
    assert "thresholds" in body
    assert "generated_at" in body
    assert isinstance(body["advice_cards"], list)


def test_advice_thresholds_present(client: TestClient) -> None:
    r = client.get(f"{_BASE}/advice", headers=_CLINICIAN)
    body = r.json()
    thresholds = body["thresholds"]
    assert "reflag_high_pct" in thresholds
    assert "manual_share_pct" in thresholds
    assert "auth_dominant_pct" in thresholds


def test_advice_custom_window_days(client: TestClient) -> None:
    r = client.get(f"{_BASE}/advice?window_days=30", headers=_CLINICIAN)
    assert r.status_code == 200
    assert r.json()["window_days"] == 30


def test_advice_window_days_too_large_returns_422(client: TestClient) -> None:
    r = client.get(f"{_BASE}/advice?window_days=9999999", headers=_CLINICIAN)
    assert r.status_code == 422


def test_advice_window_days_zero_returns_422(client: TestClient) -> None:
    r = client.get(f"{_BASE}/advice?window_days=0", headers=_CLINICIAN)
    assert r.status_code == 422


# ── /audit-events GET ────────────────────────────────────────────────────────

def test_audit_events_list_requires_auth(client: TestClient) -> None:
    r = client.get(f"{_BASE}/audit-events")
    assert r.status_code == 403


def test_audit_events_list_empty_db(client: TestClient) -> None:
    r = client.get(f"{_BASE}/audit-events", headers=_CLINICIAN)
    assert r.status_code == 200
    body = r.json()
    assert body["items"] == []
    assert body["total"] == 0
    assert "surface" in body


# ── /audit-events POST ───────────────────────────────────────────────────────

def test_post_audit_event_creates_and_returns_event_id(client: TestClient) -> None:
    payload = {"event": "policy_viewed"}
    r = client.post(f"{_BASE}/audit-events", json=payload, headers=_CLINICIAN)
    assert r.status_code == 200
    body = r.json()
    assert body["accepted"] is True
    assert isinstance(body["event_id"], str)
    assert len(body["event_id"]) > 0


def test_post_audit_event_with_note(client: TestClient) -> None:
    payload = {"event": "advice_dismissed", "note": "No action needed"}
    r = client.post(f"{_BASE}/audit-events", json=payload, headers=_CLINICIAN)
    assert r.status_code == 200
    assert r.json()["accepted"] is True


def test_post_audit_event_requires_auth(client: TestClient) -> None:
    r = client.post(f"{_BASE}/audit-events", json={"event": "test_event"})
    assert r.status_code == 403


def test_post_audit_event_blank_event_returns_422(client: TestClient) -> None:
    r = client.post(f"{_BASE}/audit-events", json={"event": ""}, headers=_CLINICIAN)
    # Pydantic min_length=1 enforces this at the schema level
    assert r.status_code == 422
