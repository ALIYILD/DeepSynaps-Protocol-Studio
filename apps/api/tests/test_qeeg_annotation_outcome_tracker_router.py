"""Tests for qeeg_annotation_outcome_tracker_router (QEEG-ANN2).

Covers:
  - GET /summary auth gate + happy path
  - GET /summary sla_days and window_days bounds
  - GET /clinician-creator-summary shape
  - GET /resolver-latency-summary shape
  - GET /backlog shape + include_grace flag
  - GET /audit-events shape + auth gate
"""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

CLINICIAN = {"Authorization": "Bearer clinician-demo-token"}

BASE = "/api/v1/qeeg-annotation-outcome-tracker"


def test_summary_requires_auth():
    r = client.get(f"{BASE}/summary")
    assert r.status_code == 403


def test_summary_empty_db():
    r = client.get(f"{BASE}/summary", headers=CLINICIAN)
    assert r.status_code == 200
    data = r.json()
    assert "window_days" in data
    assert "sla_days" in data
    assert "total_annotations" in data
    assert "outcome_counts" in data
    assert "outcome_pct" in data
    assert isinstance(data["trend_buckets"], list)
    assert isinstance(data["disclaimers"], list)
    assert len(data["disclaimers"]) > 0


def test_summary_custom_params():
    r = client.get(f"{BASE}/summary?window_days=30&sla_days=14", headers=CLINICIAN)
    assert r.status_code == 200
    data = r.json()
    assert data["sla_days"] == 14


def test_clinician_creator_summary_requires_auth():
    r = client.get(f"{BASE}/clinician-creator-summary")
    assert r.status_code == 403


def test_clinician_creator_summary_empty():
    r = client.get(f"{BASE}/clinician-creator-summary", headers=CLINICIAN)
    assert r.status_code == 200
    data = r.json()
    assert "items" in data
    assert "window_days" in data
    assert isinstance(data["items"], list)


def test_resolver_latency_summary_requires_auth():
    r = client.get(f"{BASE}/resolver-latency-summary")
    assert r.status_code == 403


def test_resolver_latency_summary_empty():
    r = client.get(f"{BASE}/resolver-latency-summary", headers=CLINICIAN)
    assert r.status_code == 200
    data = r.json()
    assert "items" in data
    assert isinstance(data["items"], list)


def test_backlog_requires_auth():
    r = client.get(f"{BASE}/backlog")
    assert r.status_code == 403


def test_backlog_empty():
    r = client.get(f"{BASE}/backlog", headers=CLINICIAN)
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 0
    assert data["include_grace"] is False
    assert isinstance(data["items"], list)


def test_backlog_include_grace_flag():
    r = client.get(f"{BASE}/backlog?include_grace=true", headers=CLINICIAN)
    assert r.status_code == 200
    data = r.json()
    assert data["include_grace"] is True


def test_audit_events_requires_auth():
    r = client.get(f"{BASE}/audit-events")
    assert r.status_code == 403


def test_audit_events_shape():
    r = client.get(f"{BASE}/audit-events", headers=CLINICIAN)
    assert r.status_code == 200
    data = r.json()
    assert "items" in data
    assert "total" in data
    assert "surface" in data
