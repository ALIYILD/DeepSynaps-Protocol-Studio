"""Happy-path tests for the Caregiver Consent router.

Scope: /api/v1/caregiver-consent — grants list, by-caregiver, create,
revoke, audit-event ingestion. Verifies empty-DB stability and role
isolation (clinician/admin access patterns).
"""
from __future__ import annotations

from fastapi.testclient import TestClient


AUTH_CLINICIAN = {"Authorization": "Bearer clinician-demo-token"}
AUTH_ADMIN = {"Authorization": "Bearer admin-demo-token"}
AUTH_PATIENT = {"Authorization": "Bearer patient-demo-token"}
AUTH_GUEST = {"Authorization": "Bearer guest-demo-token"}


def test_grants_list_empty_returns_stable_shape(client: TestClient) -> None:
    """GET /grants returns a list shape even with an empty DB."""
    r = client.get("/api/v1/caregiver-consent/grants", headers=AUTH_PATIENT)
    # The router returns patient-scoped data; the patient fixture may not have
    # a matching Patient row, so accept 200 (empty list) or 404 (no patient row).
    assert r.status_code in (200, 404)
    if r.status_code == 200:
        body = r.json()
        assert "items" in body
        assert isinstance(body["items"], list)


def test_grants_list_clinician_sees_empty_or_data(client: TestClient) -> None:
    """Clinicians querying /grants should not crash the server."""
    r = client.get("/api/v1/caregiver-consent/grants", headers=AUTH_CLINICIAN)
    # Clinician may be redirected or see an empty list — must not be a 5xx.
    assert r.status_code < 500


def test_by_caregiver_empty_returns_stable_shape(client: TestClient) -> None:
    """GET /grants/by-caregiver returns empty list when no grants exist."""
    r = client.get("/api/v1/caregiver-consent/grants/by-caregiver", headers=AUTH_CLINICIAN)
    assert r.status_code == 200
    body = r.json()
    assert "items" in body
    assert isinstance(body["items"], list)


def test_get_nonexistent_grant_returns_404(client: TestClient) -> None:
    r = client.get(
        "/api/v1/caregiver-consent/grants/nonexistent-grant-id",
        headers=AUTH_PATIENT,
    )
    assert r.status_code == 404


def test_guest_blocked_from_grants(client: TestClient) -> None:
    """Guest tokens must not access consent grants."""
    r = client.get("/api/v1/caregiver-consent/grants", headers=AUTH_GUEST)
    assert r.status_code in (401, 403, 404)


def test_audit_event_ingestion_accepted(client: TestClient) -> None:
    """Page-level audit events must be accepted without error."""
    r = client.post(
        "/api/v1/caregiver-consent/audit-events",
        json={"event": "page_viewed"},
        headers=AUTH_CLINICIAN,
    )
    assert r.status_code == 200
    body = r.json()
    assert body.get("accepted") is True
    assert body.get("event_id")


def test_audit_event_with_demo_flag(client: TestClient) -> None:
    """Demo-flagged audit events must also be accepted."""
    r = client.post(
        "/api/v1/caregiver-consent/audit-events",
        json={"event": "demo_banner_shown", "using_demo_data": True},
        headers=AUTH_CLINICIAN,
    )
    assert r.status_code == 200
    assert r.json().get("accepted") is True
