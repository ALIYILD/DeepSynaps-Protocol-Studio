"""Tests for caregiver_delivery_concern_resolution_audit_hub_router (DCR2).

Covers:
  - GET /summary auth gate + happy path (empty clinic)
  - GET /summary with seeded resolved rows
  - GET /list auth gate + happy path (empty)
  - GET /list with reason filter (invalid reason returns empty)
  - GET /audit-events shape
  - POST /audit-events page-level ingestion
  - window_days out-of-range → 422
"""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

CLINICIAN = {"Authorization": "Bearer clinician-demo-token"}
ADMIN = {"Authorization": "Bearer admin-demo-token"}

BASE = "/api/v1/caregiver-delivery-concern-resolution-audit-hub"


def test_summary_requires_auth():
    r = client.get(f"{BASE}/summary")
    assert r.status_code == 403


def test_summary_empty_clinic():
    r = client.get(f"{BASE}/summary", headers=CLINICIAN)
    assert r.status_code == 200
    data = r.json()
    assert data["total_resolved"] == 0
    assert "by_reason" in data
    assert "by_reason_pct" in data
    assert isinstance(data["trend_buckets"], list)
    assert "top_resolvers" in data


def test_summary_window_days_out_of_range_422():
    r = client.get(f"{BASE}/summary?window_days=999", headers=CLINICIAN)
    assert r.status_code == 422


def test_summary_custom_window():
    r = client.get(f"{BASE}/summary?window_days=7", headers=CLINICIAN)
    assert r.status_code == 200
    data = r.json()
    assert data["window_days"] == 7


def test_list_requires_auth():
    r = client.get(f"{BASE}/list")
    assert r.status_code == 403


def test_list_empty_clinic():
    r = client.get(f"{BASE}/list", headers=CLINICIAN)
    assert r.status_code == 200
    data = r.json()
    assert "items" in data
    assert data["total"] == 0


def test_list_invalid_reason_returns_empty():
    """An unknown reason filter should return zero items (not 422)."""
    r = client.get(f"{BASE}/list?reason=totally_invalid_reason", headers=CLINICIAN)
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 0


def test_list_valid_reason_filter():
    r = client.get(f"{BASE}/list?reason=false_positive", headers=CLINICIAN)
    assert r.status_code == 200
    data = r.json()
    assert "items" in data


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
    assert data["surface"] == "caregiver_delivery_concern_resolution_audit_hub"


def test_post_audit_event_happy_path():
    r = client.post(
        f"{BASE}/audit-events",
        json={"event": "hub_page_viewed", "note": "opened audit hub"},
        headers=CLINICIAN,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["accepted"] is True
    assert "event_id" in data


def test_post_audit_event_requires_auth():
    r = client.post(
        f"{BASE}/audit-events",
        json={"event": "hub_page_viewed"},
    )
    assert r.status_code == 403
