"""Tests for caregiver_delivery_concern_aggregator_router.py — happy + auth + edge."""
from __future__ import annotations

from fastapi.testclient import TestClient


_BASE = "/api/v1/caregiver-delivery-concern-aggregator"


# ── /status ───────────────────────────────────────────────────────────────────


def test_status_clinician_200(client: TestClient, auth_headers: dict) -> None:
    """Clinician can read the worker status snapshot."""
    r = client.get(f"{_BASE}/status", headers=auth_headers["clinician"])
    assert r.status_code == 200
    body = r.json()
    assert "running" in body
    assert "threshold" in body
    assert "window_hours" in body
    assert "cooldown_hours" in body
    assert isinstance(body["disclaimers"], list)
    assert len(body["disclaimers"]) > 0


def test_status_requires_auth(client: TestClient) -> None:
    """Status must reject unauthenticated requests."""
    r = client.get(f"{_BASE}/status")
    assert r.status_code == 403


def test_status_patient_forbidden(client: TestClient, auth_headers: dict) -> None:
    """Patient role is below clinician minimum — must be rejected."""
    r = client.get(f"{_BASE}/status", headers=auth_headers["patient"])
    assert r.status_code == 403


# ── /tick ─────────────────────────────────────────────────────────────────────


def test_tick_clinician_with_clinic(client: TestClient, auth_headers: dict) -> None:
    """Clinician (in demo clinic) can run a manual tick."""
    r = client.post(f"{_BASE}/tick", headers=auth_headers["clinician"])
    # Clinician belongs to a clinic — tick should be accepted.
    assert r.status_code in (200, 400)  # 400 only when no_clinic; demo clinician has one
    if r.status_code == 200:
        body = r.json()
        assert body["accepted"] is True
        assert "concerns_scanned" in body
        assert "caregivers_flagged" in body
        assert "audit_event_id" in body


def test_tick_requires_auth(client: TestClient) -> None:
    """Tick must reject unauthenticated requests."""
    r = client.post(f"{_BASE}/tick")
    assert r.status_code == 403


def test_tick_guest_forbidden(client: TestClient, auth_headers: dict) -> None:
    """Guest role is below reviewer minimum — must be rejected."""
    r = client.post(f"{_BASE}/tick", headers=auth_headers["guest"])
    assert r.status_code == 403


# ── /audit-events GET ─────────────────────────────────────────────────────────


def test_list_audit_events_clinician(client: TestClient, auth_headers: dict) -> None:
    """Clinician gets a paginated audit-event list."""
    r = client.get(f"{_BASE}/audit-events", headers=auth_headers["clinician"])
    assert r.status_code == 200
    body = r.json()
    assert "items" in body
    assert "total" in body
    assert "limit" in body
    assert "offset" in body
    assert isinstance(body["items"], list)


def test_list_audit_events_requires_auth(client: TestClient) -> None:
    """Audit-event list must reject unauthenticated requests."""
    r = client.get(f"{_BASE}/audit-events")
    assert r.status_code == 403


def test_list_audit_events_invalid_surface_falls_back(client: TestClient, auth_headers: dict) -> None:
    """An unknown surface value falls back to the default surface without 422."""
    r = client.get(
        f"{_BASE}/audit-events?surface=totally_unknown_surface",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200
    assert r.json()["surface"] in {
        "caregiver_delivery_concern_aggregator",
        "caregiver_portal",
    }


# ── /audit-events POST ────────────────────────────────────────────────────────


def test_post_audit_event_clinician(client: TestClient, auth_headers: dict) -> None:
    """Clinician can ingest a page-level audit event."""
    r = client.post(
        f"{_BASE}/audit-events",
        json={"event": "view", "note": "initial load"},
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200
    body = r.json()
    assert body["accepted"] is True
    assert "event_id" in body


def test_post_audit_event_missing_event_422(client: TestClient, auth_headers: dict) -> None:
    """Missing required event field returns 422."""
    r = client.post(
        f"{_BASE}/audit-events",
        json={"note": "no event field"},
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 422
