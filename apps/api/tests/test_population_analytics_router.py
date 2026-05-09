"""Tests for the Population Analytics router.

Pins:
  - GET /cohorts/summary requires auth
  - GET /cohorts/summary empty DB returns well-shaped response with disclaimers
  - GET /cohorts/list requires auth
  - GET /cohorts/list empty DB returns empty list
  - GET /outcomes/trend requires auth
  - GET /outcomes/trend empty DB returns series=[]
  - GET /adverse-events/incidence requires auth
  - GET /adverse-events/incidence returns shape with empty cohort
  - GET /treatment-response requires auth
  - GET /treatment-response empty DB returns distributions=[]
  - GET /export.csv returns CSV content-type
  - POST /audit-events accepts valid event
"""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

_CLINICIAN = {"Authorization": "Bearer clinician-demo-token"}
_ADMIN = {"Authorization": "Bearer admin-demo-token"}

_BASE = "/api/v1/population-analytics"


# ── Auth guards ──────────────────────────────────────────────────────────────


def test_cohort_summary_requires_auth():
    r = client.get(f"{_BASE}/cohorts/summary")
    assert r.status_code == 403


def test_cohort_list_requires_auth():
    r = client.get(f"{_BASE}/cohorts/list")
    assert r.status_code == 403


def test_outcomes_trend_requires_auth():
    r = client.get(f"{_BASE}/outcomes/trend")
    assert r.status_code == 403


def test_ae_incidence_requires_auth():
    r = client.get(f"{_BASE}/adverse-events/incidence")
    assert r.status_code == 403


def test_treatment_response_requires_auth():
    r = client.get(f"{_BASE}/treatment-response")
    assert r.status_code == 403


def test_export_csv_requires_auth():
    r = client.get(f"{_BASE}/export.csv")
    assert r.status_code == 403


# ── GET /cohorts/summary ──────────────────────────────────────────────────────


def test_cohort_summary_empty_db_well_shaped():
    r = client.get(f"{_BASE}/cohorts/summary", headers=_CLINICIAN)
    assert r.status_code == 200
    body = r.json()
    for key in (
        "cohort_size", "courses_total", "courses_active", "courses_completed",
        "sessions_logged", "adverse_event_total", "adverse_event_serious",
        "adverse_event_reportable", "ae_incidence_per_100_courses",
        "demo_count", "has_demo", "by_condition", "by_modality",
        "by_age_band", "by_sex", "disclaimers",
    ):
        assert key in body, f"Missing key: {key}"
    assert body["cohort_size"] == 0
    assert body["courses_total"] == 0
    assert body["has_demo"] is False


def test_cohort_summary_disclaimers_present():
    r = client.get(f"{_BASE}/cohorts/summary", headers=_CLINICIAN)
    assert r.status_code == 200
    assert len(r.json()["disclaimers"]) >= 1


def test_cohort_summary_ae_incidence_zero_on_empty():
    r = client.get(f"{_BASE}/cohorts/summary", headers=_CLINICIAN)
    assert r.status_code == 200
    assert r.json()["ae_incidence_per_100_courses"] == 0.0


# ── GET /cohorts/list ─────────────────────────────────────────────────────────


def test_cohort_list_empty_db_returns_empty_list():
    r = client.get(f"{_BASE}/cohorts/list", headers=_CLINICIAN)
    assert r.status_code == 200
    body = r.json()
    assert "items" in body
    assert "total" in body
    assert "has_demo" in body
    assert "disclaimers" in body
    assert body["items"] == []
    assert body["total"] == 0


# ── GET /outcomes/trend ───────────────────────────────────────────────────────


def test_outcomes_trend_empty_db_returns_empty_series():
    r = client.get(f"{_BASE}/outcomes/trend", headers=_CLINICIAN)
    assert r.status_code == 200
    body = r.json()
    assert "series" in body
    assert "cohort_size" in body
    assert "has_demo" in body
    assert "disclaimers" in body
    assert body["series"] == []
    assert body["cohort_size"] == 0


# ── GET /adverse-events/incidence ─────────────────────────────────────────────


def test_ae_incidence_empty_db_well_shaped():
    r = client.get(f"{_BASE}/adverse-events/incidence", headers=_CLINICIAN)
    assert r.status_code == 200
    body = r.json()
    assert "by_protocol" in body
    assert "by_modality" in body
    assert "by_severity_band" in body
    assert "cohort_size" in body
    assert "has_demo" in body
    assert "disclaimers" in body
    assert body["cohort_size"] == 0


# ── GET /treatment-response ────────────────────────────────────────────────────


def test_treatment_response_empty_db_returns_empty_distributions():
    r = client.get(f"{_BASE}/treatment-response", headers=_CLINICIAN)
    assert r.status_code == 200
    body = r.json()
    assert "distributions" in body
    assert "has_demo" in body
    assert "disclaimers" in body
    assert body["distributions"] == []


# ── GET /export.csv ───────────────────────────────────────────────────────────


def test_export_csv_returns_csv_content_type():
    r = client.get(f"{_BASE}/export.csv", headers=_CLINICIAN)
    assert r.status_code == 200
    assert "text/csv" in r.headers.get("content-type", "")


def test_export_ndjson_returns_ndjson_content_type():
    r = client.get(f"{_BASE}/export.ndjson", headers=_CLINICIAN)
    assert r.status_code == 200
    assert "ndjson" in r.headers.get("content-type", "")


# ── POST /audit-events ────────────────────────────────────────────────────────


def test_audit_events_accepts_valid_event():
    r = client.post(
        f"{_BASE}/audit-events",
        json={"event": "page_viewed"},
        headers=_CLINICIAN,
    )
    assert r.status_code in (200, 201)
    body = r.json()
    assert body.get("accepted") is True
    assert "event_id" in body
