"""Tests for irb_amendment_reviewer_workload_router.py — happy + auth + edge."""
from __future__ import annotations

from fastapi.testclient import TestClient


_BASE = "/api/v1/irb-amendment-reviewer-workload"


# ── /workload ─────────────────────────────────────────────────────────────────


def test_workload_clinician_200(client: TestClient, auth_headers: dict) -> None:
    """Clinician gets the reviewer workload list with expected shape."""
    r = client.get(f"{_BASE}/workload", headers=auth_headers["clinician"])
    assert r.status_code == 200
    body = r.json()
    assert "items" in body
    assert "clinic_id" in body
    assert "queue_threshold" in body
    assert "age_threshold_days" in body
    assert isinstance(body["items"], list)
    assert isinstance(body["disclaimers"], list)


def test_workload_admin_200(client: TestClient, auth_headers: dict) -> None:
    """Admin also gets 200 with valid workload shape."""
    r = client.get(f"{_BASE}/workload", headers=auth_headers["admin"])
    assert r.status_code == 200
    assert "items" in r.json()


def test_workload_requires_auth(client: TestClient) -> None:
    """Workload must reject unauthenticated requests."""
    r = client.get(f"{_BASE}/workload")
    assert r.status_code == 403


def test_workload_patient_forbidden(client: TestClient, auth_headers: dict) -> None:
    """Patient role is below clinician minimum — must be rejected."""
    r = client.get(f"{_BASE}/workload", headers=auth_headers["patient"])
    assert r.status_code == 403


# ── /unassigned-amendments ────────────────────────────────────────────────────


def test_unassigned_amendments_clinician(client: TestClient, auth_headers: dict) -> None:
    """Clinician gets the unassigned amendments list."""
    r = client.get(f"{_BASE}/unassigned-amendments", headers=auth_headers["clinician"])
    assert r.status_code == 200
    body = r.json()
    assert "items" in body
    assert "total" in body
    assert isinstance(body["items"], list)


def test_unassigned_amendments_requires_auth(client: TestClient) -> None:
    """Unassigned amendments must reject unauthenticated requests."""
    r = client.get(f"{_BASE}/unassigned-amendments")
    assert r.status_code == 403


# ── /suggest-reviewer ─────────────────────────────────────────────────────────


def test_suggest_reviewer_returns_shape(client: TestClient, auth_headers: dict) -> None:
    """Suggest-reviewer returns the expected fields with no amendment in DB."""
    r = client.get(
        f"{_BASE}/suggest-reviewer?amendment_id=amd-nonexistent",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200
    body = r.json()
    assert body["amendment_id"] == "amd-nonexistent"
    # No amendments in DB → suggested_reviewer_user_id is None
    assert "suggested_reviewer_user_id" in body


def test_suggest_reviewer_requires_auth(client: TestClient) -> None:
    """Suggest-reviewer must reject unauthenticated requests."""
    r = client.get(f"{_BASE}/suggest-reviewer?amendment_id=amd-test")
    assert r.status_code == 403


def test_suggest_reviewer_missing_amendment_id_422(
    client: TestClient, auth_headers: dict
) -> None:
    """Missing amendment_id query param returns 422."""
    r = client.get(f"{_BASE}/suggest-reviewer", headers=auth_headers["clinician"])
    assert r.status_code == 422


# ── /worker/status ────────────────────────────────────────────────────────────


def test_worker_status_clinician(client: TestClient, auth_headers: dict) -> None:
    """Clinician gets worker status snapshot."""
    r = client.get(f"{_BASE}/worker/status", headers=auth_headers["clinician"])
    assert r.status_code == 200
    body = r.json()
    assert "enabled" in body
    assert "running" in body
    assert "queue_threshold" in body
    assert "age_threshold_days" in body
    assert isinstance(body["disclaimers"], list)


def test_worker_status_requires_auth(client: TestClient) -> None:
    """Worker status must reject unauthenticated requests."""
    r = client.get(f"{_BASE}/worker/status")
    assert r.status_code == 403


# ── /worker/tick ──────────────────────────────────────────────────────────────


def test_worker_tick_admin_200(client: TestClient, auth_headers: dict) -> None:
    """Admin can run a manual SLA tick."""
    r = client.post(f"{_BASE}/worker/tick", headers=auth_headers["admin"])
    assert r.status_code in (200, 400)
    if r.status_code == 200:
        body = r.json()
        assert body["accepted"] is True
        assert "reviewers_examined" in body
        assert "breaches_emitted" in body


def test_worker_tick_clinician_forbidden(client: TestClient, auth_headers: dict) -> None:
    """Clinician is below admin minimum for tick — must be rejected."""
    r = client.post(f"{_BASE}/worker/tick", headers=auth_headers["clinician"])
    assert r.status_code == 403


def test_worker_tick_requires_auth(client: TestClient) -> None:
    """Tick must reject unauthenticated requests."""
    r = client.post(f"{_BASE}/worker/tick")
    assert r.status_code == 403


# ── /audit-events ─────────────────────────────────────────────────────────────


def test_audit_events_clinician(client: TestClient, auth_headers: dict) -> None:
    """Clinician gets the audit-event list."""
    r = client.get(f"{_BASE}/audit-events", headers=auth_headers["clinician"])
    assert r.status_code == 200
    body = r.json()
    assert "items" in body
    assert "total" in body
    assert "surface" in body


def test_audit_events_requires_auth(client: TestClient) -> None:
    """Audit-event list must reject unauthenticated requests."""
    r = client.get(f"{_BASE}/audit-events")
    assert r.status_code == 403
