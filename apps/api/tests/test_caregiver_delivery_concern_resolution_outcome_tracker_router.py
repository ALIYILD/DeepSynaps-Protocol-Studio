"""Tests for caregiver_delivery_concern_resolution_outcome_tracker_router.py."""
from __future__ import annotations

from fastapi.testclient import TestClient


_BASE = "/api/v1/caregiver-delivery-concern-resolution-outcome-tracker"


# ── /summary ─────────────────────────────────────────────────────────────────


def test_summary_clinician_200(client: TestClient, auth_headers: dict) -> None:
    """Clinician gets the outcome summary with the expected shape."""
    r = client.get(f"{_BASE}/summary", headers=auth_headers["clinician"])
    assert r.status_code == 200
    body = r.json()
    assert "window_days" in body
    assert "total_resolutions" in body
    assert "outcome_counts" in body
    assert "outcome_pct" in body
    assert "by_reason" in body


def test_summary_custom_window(client: TestClient, auth_headers: dict) -> None:
    """Custom window_days is respected in the response."""
    r = client.get(f"{_BASE}/summary?window_days=30", headers=auth_headers["clinician"])
    assert r.status_code == 200
    assert r.json()["window_days"] == 30


def test_summary_window_out_of_range_422(client: TestClient, auth_headers: dict) -> None:
    """window_days=0 is below the minimum — must return 422."""
    r = client.get(f"{_BASE}/summary?window_days=0", headers=auth_headers["clinician"])
    assert r.status_code == 422


def test_summary_requires_auth(client: TestClient) -> None:
    """Summary must reject unauthenticated requests."""
    r = client.get(f"{_BASE}/summary")
    assert r.status_code == 403


def test_summary_patient_forbidden(client: TestClient, auth_headers: dict) -> None:
    """Patient role is below clinician minimum — must be rejected."""
    r = client.get(f"{_BASE}/summary", headers=auth_headers["patient"])
    assert r.status_code == 403


# ── /resolver-calibration ────────────────────────────────────────────────────


def test_resolver_calibration_clinician(client: TestClient, auth_headers: dict) -> None:
    """Clinician gets the resolver calibration list."""
    r = client.get(f"{_BASE}/resolver-calibration", headers=auth_headers["clinician"])
    assert r.status_code == 200
    body = r.json()
    assert "items" in body
    assert "window_days" in body
    assert "min_resolutions" in body
    assert isinstance(body["items"], list)


def test_resolver_calibration_requires_auth(client: TestClient) -> None:
    """Resolver calibration must reject unauthenticated requests."""
    r = client.get(f"{_BASE}/resolver-calibration")
    assert r.status_code == 403


def test_resolver_calibration_min_resolutions_param(client: TestClient, auth_headers: dict) -> None:
    """min_resolutions query param is reflected in the response."""
    r = client.get(
        f"{_BASE}/resolver-calibration?min_resolutions=5",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200
    assert r.json()["min_resolutions"] == 5


# ── /audit-events GET ─────────────────────────────────────────────────────────


def test_list_audit_events_clinician(client: TestClient, auth_headers: dict) -> None:
    """Clinician can list audit events for this surface."""
    r = client.get(f"{_BASE}/audit-events", headers=auth_headers["clinician"])
    assert r.status_code == 200
    body = r.json()
    assert "items" in body
    assert "total" in body
    assert "surface" in body


def test_list_audit_events_requires_auth(client: TestClient) -> None:
    """Audit-event list must reject unauthenticated requests."""
    r = client.get(f"{_BASE}/audit-events")
    assert r.status_code == 403


# ── /audit-events POST ────────────────────────────────────────────────────────


def test_post_audit_event_accepted(client: TestClient, auth_headers: dict) -> None:
    """Page-level audit event is accepted."""
    r = client.post(
        f"{_BASE}/audit-events",
        json={"event": "page_view"},
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200
    body = r.json()
    assert body["accepted"] is True
    assert "event_id" in body


def test_post_audit_event_missing_event_field_422(
    client: TestClient, auth_headers: dict
) -> None:
    """Missing required event field returns 422."""
    r = client.post(
        f"{_BASE}/audit-events",
        json={"note": "oops"},
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 422
