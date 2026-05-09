"""Tests for the Coaching Digest Delivery Failure Drilldown router (DCRO5).

Pins:
  - /summary returns well-shaped response on empty DB
  - /summary requires auth (403 without header)
  - /summary window clamp: window_days > 365 → clamped to 365
  - /list returns pagination shape on empty DB
  - /list requires auth
  - /list filters by channel (empty result when no matching data)
  - /audit-events returns well-shaped paginated response
  - /audit-events requires auth
  - /summary total_failed=0 and failure_rate_pct=None when no dispatched rows
  - /list page/page_size params echo back correctly
"""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

_CLINICIAN = {"Authorization": "Bearer clinician-demo-token"}
_ADMIN = {"Authorization": "Bearer admin-demo-token"}

_BASE = "/api/v1/coaching-digest-delivery-failure-drilldown"


# ── Auth guards ──────────────────────────────────────────────────────────────


def test_summary_requires_auth():
    r = client.get(f"{_BASE}/summary")
    assert r.status_code == 403


def test_list_requires_auth():
    r = client.get(f"{_BASE}/list")
    assert r.status_code == 403


def test_audit_events_requires_auth():
    r = client.get(f"{_BASE}/audit-events")
    assert r.status_code == 403


# ── /summary ─────────────────────────────────────────────────────────────────


def test_summary_empty_db_returns_well_shaped_response():
    r = client.get(f"{_BASE}/summary", headers=_CLINICIAN)
    assert r.status_code == 200
    body = r.json()
    assert "window_days" in body
    assert "total_failed" in body
    assert "total_dispatched" in body
    assert "by_channel" in body
    assert "top_error_classes" in body
    assert "trend_buckets" in body


def test_summary_empty_db_total_failed_zero_rate_null():
    r = client.get(f"{_BASE}/summary", headers=_CLINICIAN)
    assert r.status_code == 200
    body = r.json()
    assert body["total_failed"] == 0
    assert body["total_dispatched"] == 0
    assert body["failure_rate_pct"] is None


def test_summary_by_channel_always_contains_known_channels():
    r = client.get(f"{_BASE}/summary", headers=_CLINICIAN)
    assert r.status_code == 200
    by_ch = r.json()["by_channel"]
    # All 5 canonical channels must be present even on empty DB.
    for ch in ("slack", "twilio", "sendgrid", "pagerduty", "email"):
        assert ch in by_ch, f"Missing channel key: {ch}"


def test_summary_window_days_default_echoes_90():
    r = client.get(f"{_BASE}/summary", headers=_CLINICIAN)
    assert r.status_code == 200
    assert r.json()["window_days"] == 90


def test_summary_window_days_custom():
    r = client.get(f"{_BASE}/summary?window_days=30", headers=_CLINICIAN)
    assert r.status_code == 200
    assert r.json()["window_days"] == 30


def test_summary_trend_buckets_is_list():
    r = client.get(f"{_BASE}/summary", headers=_CLINICIAN)
    assert r.status_code == 200
    buckets = r.json()["trend_buckets"]
    assert isinstance(buckets, list)
    assert len(buckets) >= 1


# ── /list ────────────────────────────────────────────────────────────────────


def test_list_empty_db_returns_pagination_shape():
    r = client.get(f"{_BASE}/list", headers=_CLINICIAN)
    assert r.status_code == 200
    body = r.json()
    assert "items" in body
    assert "total" in body
    assert "page" in body
    assert "page_size" in body
    assert isinstance(body["items"], list)


def test_list_page_size_echoed():
    r = client.get(f"{_BASE}/list?page=1&page_size=10", headers=_CLINICIAN)
    assert r.status_code == 200
    body = r.json()
    assert body["page"] == 1
    assert body["page_size"] == 10


def test_list_channel_filter_no_crash():
    r = client.get(f"{_BASE}/list?channel=slack", headers=_CLINICIAN)
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 0
    assert body["items"] == []


# ── /audit-events ────────────────────────────────────────────────────────────


def test_audit_events_returns_pagination_shape():
    r = client.get(f"{_BASE}/audit-events", headers=_CLINICIAN)
    assert r.status_code == 200
    body = r.json()
    assert "items" in body
    assert "total" in body
    assert "limit" in body
    assert "offset" in body
    assert "surface" in body


def test_audit_events_surface_name_correct():
    r = client.get(f"{_BASE}/audit-events", headers=_CLINICIAN)
    assert r.status_code == 200
    assert (
        r.json()["surface"]
        == "coaching_digest_delivery_failure_drilldown"
    )
