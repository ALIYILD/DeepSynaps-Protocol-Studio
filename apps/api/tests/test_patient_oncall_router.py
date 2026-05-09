"""Tests for the Patient On-Call Visibility router (PR 102 set L).

Covers:
  GET  /api/v1/patient-oncall/status
  POST /api/v1/patient-oncall/audit-events

Key contracts:
  * Patient role only — cross-role hits return 404.
  * Status payload NEVER contains clinician_name, phone, slack handles, or
    pagerduty identifiers (PHI redaction regression).
  * Demo patient gets is_demo=True.
  * Clinician audit endpoint is restricted to patient role (403 otherwise).
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.database import SessionLocal
from app.persistence.models import Patient

PATIENT_HDR = {"Authorization": "Bearer patient-demo-token"}
CLINICIAN_HDR = {"Authorization": "Bearer clinician-demo-token"}

# PHI keys that must NEVER appear in the status payload per the router docstring.
_PHI_KEYS = {
    "clinician_name",
    "primary_user_name",
    "display_name",
    "phone",
    "slack_user_id",
    "slack_handle",
    "pagerduty_user_id",
    "pagerduty_routing_key",
    "twilio_phone",
    "contact_handle",
}


@pytest.fixture
def demo_patient() -> Patient:
    """Seed the Patient row for actor-patient-demo."""
    db = SessionLocal()
    try:
        patient = Patient(
            id="oncall-patient-001",
            clinician_id="actor-clinician-demo",
            first_name="OnCall",
            last_name="Patient",
            email="patient@deepsynaps.com",
            consent_signed=True,
            status="active",
        )
        db.add(patient)
        db.commit()
        db.refresh(patient)
        yield patient
    finally:
        db.close()


# ── Role gate ───────────────────────────────────────────────────────────────


def test_status_clinician_returns_404(client: TestClient, demo_patient) -> None:
    """Clinicians get 404 (patient-scope URL invisible to clinical staff)."""
    r = client.get("/api/v1/patient-oncall/status", headers=CLINICIAN_HDR)
    assert r.status_code == 404


def test_status_unauthenticated_returns_4xx(client: TestClient) -> None:
    """Unauthenticated actor resolves to guest role → not patient → 404."""
    r = client.get("/api/v1/patient-oncall/status")
    assert r.status_code in (403, 404)


# ── Happy path ───────────────────────────────────────────────────────────────


def test_status_happy_path(client: TestClient, demo_patient) -> None:
    """Patient can fetch on-call status; returns known-shape payload."""
    r = client.get("/api/v1/patient-oncall/status", headers=PATIENT_HDR)
    assert r.status_code == 200
    body = r.json()
    assert "in_hours_now" in body
    assert "oncall_now" in body
    assert "urgent_path" in body
    assert "has_coverage_configured" in body
    assert "disclaimers" in body
    assert isinstance(body["disclaimers"], list)


def test_status_payload_redacts_phi(client: TestClient, demo_patient) -> None:
    """Status payload must NEVER contain clinician PHI keys."""
    r = client.get("/api/v1/patient-oncall/status", headers=PATIENT_HDR)
    assert r.status_code == 200
    body = r.json()
    leaked = _PHI_KEYS & set(body.keys())
    assert not leaked, f"PHI keys leaked into response: {leaked}"


def test_status_no_coverage_configured_returns_honest_state(client: TestClient) -> None:
    """Patient whose clinician has no ShiftRoster/EscalationChain gets honest empty state."""
    # The demo patient's clinician is in the demo clinic which has no shifts seeded —
    # so the honest empty state is already the default for any fresh test DB.
    db = SessionLocal()
    try:
        patient = Patient(
            id="oncall-nocoverage-001",
            clinician_id="actor-clinician-demo",
            first_name="NoCoverage",
            last_name="Patient",
            email="patient@deepsynaps.com",
            consent_signed=True,
            status="active",
        )
        db.add(patient)
        db.commit()
    finally:
        db.close()

    r = client.get("/api/v1/patient-oncall/status", headers=PATIENT_HDR)
    assert r.status_code == 200
    body = r.json()
    # With no ShiftRoster/EscalationChain rows: honest empty state
    assert body["has_coverage_configured"] is False
    assert body["urgent_path"] == "emergency_line"


# ── Audit events ─────────────────────────────────────────────────────────────


def test_audit_events_happy_path(client: TestClient, demo_patient) -> None:
    r = client.post(
        "/api/v1/patient-oncall/audit-events",
        json={"event": "view", "note": "patient opened on-call page"},
        headers=PATIENT_HDR,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["accepted"] is True
    assert "event_id" in body


def test_audit_events_clinician_returns_403(client: TestClient, demo_patient) -> None:
    """Clinician role must be rejected from the patient audit ingestion endpoint."""
    r = client.post(
        "/api/v1/patient-oncall/audit-events",
        json={"event": "view"},
        headers=CLINICIAN_HDR,
    )
    assert r.status_code == 403


def test_audit_events_missing_event_422(client: TestClient, demo_patient) -> None:
    """Empty body should trigger 422 (missing required field 'event')."""
    r = client.post(
        "/api/v1/patient-oncall/audit-events",
        json={},
        headers=PATIENT_HDR,
    )
    assert r.status_code == 422
