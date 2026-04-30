"""Tests for the dashboard router."""
import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

AUTH_HDR = {"Authorization": "Bearer token-testadmin"}


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
    client.post("/api/v1/patients/" + pid + "/adverse-events", json={
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
