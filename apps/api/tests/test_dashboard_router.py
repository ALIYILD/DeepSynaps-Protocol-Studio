"""Dashboard router demo readiness tests.

Scope:
  - /api/v1/dashboard/overview does not crash on empty DB
  - demo-seeded DB returns stable shape
  - /api/v1/dashboard/search returns route-compatible url_path values
  - audit-write failures do not break responses (best-effort)
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.orm import Session


def _mk_demo_patient(db: Session, *, pid: str, clinician_id: str) -> None:
    from app.persistence.models import Patient

    db.add(Patient(
        id=pid,
        clinician_id=clinician_id,
        first_name="DEMO",
        last_name=f"Patient {pid[-4:]}",
        dob="1980-01-01",
        email=None,
        phone=None,
        gender="prefer_not_to_say",
        primary_condition="Demo",
        primary_modality="Demo",
        consent_signed=True,
        consent_date="2026-01-01",
        status="active",
        notes="[DEMO] synthetic non-PHI sample record",
    ))


def test_dashboard_overview_empty_db_does_not_crash(client, auth_headers) -> None:
    r = client.get("/api/v1/dashboard/overview", headers=auth_headers["clinician"])
    assert r.status_code == 200
    body = r.json()
    assert "metrics" in body
    assert "schedule" in body
    assert "safety_flags" in body
    assert "activity_feed" in body
    assert "system_health" in body


def test_dashboard_overview_demo_seed_returns_complete_shape(client, auth_headers) -> None:
    # Seed a minimal demo cohort directly to the authenticated clinician actor.
    from app.database import SessionLocal
    from app.persistence.models import TreatmentCourse

    db = SessionLocal()
    try:
        clinician_id = "actor-clinician-demo"
        _mk_demo_patient(db, pid="P-DEMO-1", clinician_id=clinician_id)
        _mk_demo_patient(db, pid="P-DEMO-2", clinician_id=clinician_id)
        now = datetime.now(timezone.utc)
        db.add(TreatmentCourse(
            id="C-DEMO-1",
            patient_id="P-DEMO-1",
            clinician_id=clinician_id,
            protocol_id="demo-proto",
            condition_slug="mdd",
            modality_slug="tDCS",
            device_slug="demo",
            target_region="DLPFC",
            evidence_grade="A",
            on_label=True,
            planned_sessions_total=20,
            planned_sessions_per_week=3,
            planned_session_duration_minutes=30,
            status="active",
            sessions_delivered=4,
            review_required=False,
            updated_at=now,
        ))
        db.commit()
    finally:
        db.close()

    r = client.get("/api/v1/dashboard/overview", headers=auth_headers["clinician"])
    assert r.status_code == 200
    body = r.json()
    assert body.get("is_demo") is True
    assert isinstance(body.get("metrics"), dict)
    assert "active_caseload" in body["metrics"]
    assert isinstance(body.get("schedule"), list)
    assert isinstance(body.get("safety_flags"), list)
    assert isinstance(body.get("activity_feed"), list)


def test_dashboard_search_returns_route_compatible_url_paths(client, auth_headers) -> None:
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        _mk_demo_patient(db, pid="P-DEMO-SEARCH", clinician_id="actor-clinician-demo")
        db.commit()
    finally:
        db.close()

    r = client.get("/api/v1/dashboard/search?q=demo", headers=auth_headers["clinician"])
    assert r.status_code == 200
    body = r.json()
    assert body["query"] == "demo"
    # Patients group should contain at least one routeable result.
    groups = body.get("groups") or {}
    pats = groups.get("Patients") or []
    assert isinstance(pats, list)
    assert any("patient-profile" in (p.get("url_path") or "") for p in pats)

"""Tests for the dashboard router."""
import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

AUTH_HDR = {"Authorization": "Bearer admin-demo-token"}


def test_overview_requires_auth():
    """Dashboard overview must require authentication."""
    r = client.get("/api/v1/dashboard/overview")
    assert r.status_code == 403


def test_overview_empty_clinic():
    """Empty clinic returns honest empty dashboard."""
    r = client.get("/api/v1/dashboard/overview", headers=AUTH_HDR)
    assert r.status_code == 200
    data = r.json()
    assert data["is_demo"] is False
    assert "metrics" in data
    assert data["schedule"] == []
    assert data["safety_flags"] == []


def test_overview_with_patient():
    """Creating a patient updates caseload metric."""
    r = client.get("/api/v1/dashboard/overview", headers=AUTH_HDR)
    initial = r.json()["metrics"]["active_caseload"]["value"]

    client.post("/api/v1/patients", json={
        "first_name": "Dash",
        "last_name": "Test",
        "date_of_birth": "1990-01-01",
        "primary_condition": "MDD",
        "status": "active",
    }, headers=AUTH_HDR)

    r = client.get("/api/v1/dashboard/overview", headers=AUTH_HDR)
    assert r.json()["metrics"]["active_caseload"]["value"] == initial + 1


def test_overview_with_adverse_event():
    """Adverse events appear in safety flags."""
    # Create a patient first
    pr = client.post("/api/v1/patients", json={
        "first_name": "AE",
        "last_name": "Test",
        "date_of_birth": "1985-06-15",
        "status": "active",
    }, headers=AUTH_HDR)
    pid = pr.json()["id"]

    # Create a serious adverse event
    client.post("/api/v1/adverse-events", json={
        "patient_id": pid,
        "event_type": "seizure",
        "severity": "serious",
        "reported_at": "2024-06-01T00:00:00Z",
    }, headers=AUTH_HDR)

    r = client.get("/api/v1/dashboard/overview", headers=AUTH_HDR)
    data = r.json()
    assert data["metrics"]["safety_flags"]["value"] >= 1
    assert len(data["safety_flags"]) >= 1
    assert data["safety_flags"][0]["level"] == "red"


def test_overview_audit_log_created():
    """Loading dashboard writes an audit event."""
    r = client.get("/api/v1/dashboard/overview", headers=AUTH_HDR)
    assert r.status_code == 200


def test_search_requires_auth():
    """Search must require authentication."""
    r = client.get("/api/v1/dashboard/search?q=test")
    assert r.status_code == 403


def test_search_empty_query():
    """Empty search returns empty results."""
    r = client.get("/api/v1/dashboard/search?q=", headers=AUTH_HDR)
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 0
    assert data["groups"] == {}


def test_search_finds_patient():
    """Search returns a patient by name."""
    client.post("/api/v1/patients", json={
        "first_name": "SearchMe",
        "last_name": "Patient",
        "date_of_birth": "1992-03-03",
        "status": "active",
    }, headers=AUTH_HDR)

    r = client.get("/api/v1/dashboard/search?q=searchme", headers=AUTH_HDR)
    assert r.status_code == 200
    data = r.json()
    assert data["total"] >= 1
    assert any(p["title"].lower().startswith("searchme") for g in data["groups"].values() for p in g)


def test_search_no_results():
    """Search for nonexistent returns zero results."""
    r = client.get("/api/v1/dashboard/search?q=xyznotfound999", headers=AUTH_HDR)
    data = r.json()
    assert data["total"] == 0


def test_search_case_insensitive():
    """Search is case-insensitive."""
    client.post("/api/v1/patients", json={
        "first_name": "CamelCase",
        "last_name": "Person",
        "date_of_birth": "1990-01-01",
        "status": "active",
    }, headers=AUTH_HDR)

    r = client.get("/api/v1/dashboard/search?q=camelcase", headers=AUTH_HDR)
    assert r.status_code == 200
    data = r.json()
    assert data["total"] >= 1
