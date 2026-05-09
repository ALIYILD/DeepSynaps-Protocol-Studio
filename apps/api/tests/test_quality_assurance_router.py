"""Tests for the Quality Assurance findings router.

Pins:
  - GET /findings requires auth
  - GET /findings empty DB returns well-shaped list response with disclaimers
  - GET /findings/summary returns well-shaped summary on empty DB
  - POST /findings creates a finding (happy path)
  - POST /findings returns 422 on missing required fields
  - POST /findings returns 422 on invalid severity
  - GET /findings/{id} returns 404 for unknown id
  - POST /findings/{id}/close closes finding (happy path)
  - GET /findings/export.csv returns CSV content-type
  - POST /findings/audit-events accepts valid event
"""
from __future__ import annotations

import uuid

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

_CLINICIAN = {"Authorization": "Bearer clinician-demo-token"}
_ADMIN = {"Authorization": "Bearer admin-demo-token"}

_BASE = "/api/v1/qa/findings"


# ── Auth guards ──────────────────────────────────────────────────────────────


def test_list_findings_requires_auth():
    r = client.get(_BASE)
    assert r.status_code == 403


def test_create_finding_requires_auth():
    r = client.post(_BASE, json={"title": "Test", "finding_type": "non_conformance"})
    assert r.status_code == 403


# ── GET /findings (list) ─────────────────────────────────────────────────────


def test_list_findings_empty_db_well_shaped():
    r = client.get(_BASE, headers=_CLINICIAN)
    assert r.status_code == 200
    body = r.json()
    assert "items" in body
    assert "total" in body
    assert "limit" in body
    assert "offset" in body
    assert "disclaimers" in body
    assert isinstance(body["items"], list)
    assert body["total"] == 0


def test_list_findings_disclaimers_present():
    r = client.get(_BASE, headers=_CLINICIAN)
    assert r.status_code == 200
    disclaimers = r.json()["disclaimers"]
    assert len(disclaimers) >= 1


# ── GET /findings/summary ────────────────────────────────────────────────────


def test_summary_empty_db_well_shaped():
    r = client.get(f"{_BASE}/summary", headers=_CLINICIAN)
    assert r.status_code == 200
    body = r.json()
    for key in ("total", "open", "in_progress", "closed", "reopened",
                "by_severity", "by_finding_type", "sae_related",
                "capa_overdue", "demo_rows", "disclaimers"):
        assert key in body, f"Missing key: {key}"
    assert body["total"] == 0


# ── POST /findings (create) ───────────────────────────────────────────────────


def test_create_finding_happy_path():
    r = client.post(
        _BASE,
        json={"title": "Test Finding", "finding_type": "non_conformance", "severity": "minor"},
        headers=_CLINICIAN,
    )
    assert r.status_code == 201
    body = r.json()
    assert body["title"] == "Test Finding"
    assert body["finding_type"] == "non_conformance"
    assert body["severity"] == "minor"
    assert body["status"] == "open"
    assert "id" in body


def test_create_finding_missing_title_returns_422():
    r = client.post(
        _BASE,
        json={"finding_type": "non_conformance"},
        headers=_CLINICIAN,
    )
    assert r.status_code == 422


def test_create_finding_invalid_severity_returns_422():
    r = client.post(
        _BASE,
        json={"title": "Bad severity", "severity": "extreme"},
        headers=_CLINICIAN,
    )
    assert r.status_code == 422


def test_create_finding_invalid_source_target_type_returns_422():
    r = client.post(
        _BASE,
        json={
            "title": "Test",
            "source_target_type": "not_a_real_surface",
        },
        headers=_CLINICIAN,
    )
    assert r.status_code == 422


# ── GET /findings/{id} ───────────────────────────────────────────────────────


def test_get_finding_unknown_id_returns_404():
    r = client.get(f"{_BASE}/{uuid.uuid4()}", headers=_CLINICIAN)
    assert r.status_code == 404


def test_get_finding_returns_correct_shape():
    create_r = client.post(
        _BASE,
        json={"title": "Get Test", "severity": "major"},
        headers=_CLINICIAN,
    )
    assert create_r.status_code == 201
    fid = create_r.json()["id"]

    r = client.get(f"{_BASE}/{fid}", headers=_CLINICIAN)
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == fid
    assert body["title"] == "Get Test"
    assert body["severity"] == "major"


# ── POST /findings/{id}/close ─────────────────────────────────────────────────


def test_close_finding_happy_path():
    create_r = client.post(
        _BASE,
        json={"title": "Close Me", "severity": "minor"},
        headers=_CLINICIAN,
    )
    assert create_r.status_code == 201
    fid = create_r.json()["id"]

    close_r = client.post(
        f"{_BASE}/{fid}/close",
        json={"note": "Closing with sign-off"},
        headers=_CLINICIAN,
    )
    assert close_r.status_code == 200
    assert close_r.json()["status"] == "closed"


# ── GET /export.csv ───────────────────────────────────────────────────────────


def test_export_csv_returns_csv_content_type():
    r = client.get(f"{_BASE}/export.csv", headers=_CLINICIAN)
    assert r.status_code == 200
    assert "text/csv" in r.headers.get("content-type", "")


# ── POST /audit-events ────────────────────────────────────────────────────────


def test_audit_events_accepts_valid_event():
    r = client.post(
        f"{_BASE}/audit-events",
        json={"event": "page_viewed", "note": "test"},
        headers=_CLINICIAN,
    )
    assert r.status_code in (200, 201)
    body = r.json()
    assert body.get("accepted") is True
    assert "event_id" in body
