"""Tests for the Resolver Coaching Digest Audit Hub router (DCRO4).

Pins:
  - /summary returns well-shaped response on empty DB
  - /summary requires auth
  - /summary window_days default echoes 90
  - /summary opt_in_stats keys present
  - /summary dispatch_stats keys present
  - /summary delivery_outcomes keys present
  - /summary trend_buckets is a list
  - /resolver-trajectory requires auth
  - /resolver-trajectory returns list on empty DB
  - /audit-events requires auth
  - /audit-events surface name correct
"""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

_CLINICIAN = {"Authorization": "Bearer clinician-demo-token"}
_ADMIN = {"Authorization": "Bearer admin-demo-token"}

_BASE = "/api/v1/resolver-coaching-digest-audit-hub"


# ── Auth guards ──────────────────────────────────────────────────────────────


def test_summary_requires_auth():
    r = client.get(f"{_BASE}/summary")
    assert r.status_code == 403


def test_resolver_trajectory_requires_auth():
    r = client.get(f"{_BASE}/resolver-trajectory")
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
    assert "opt_in_stats" in body
    assert "dispatch_stats" in body
    assert "delivery_outcomes" in body
    assert "trend_buckets" in body


def test_summary_window_days_default_90():
    r = client.get(f"{_BASE}/summary", headers=_CLINICIAN)
    assert r.status_code == 200
    assert r.json()["window_days"] == 90


def test_summary_window_days_custom():
    r = client.get(f"{_BASE}/summary?window_days=14", headers=_CLINICIAN)
    assert r.status_code == 200
    assert r.json()["window_days"] == 14


def test_summary_opt_in_stats_shape():
    r = client.get(f"{_BASE}/summary", headers=_CLINICIAN)
    assert r.status_code == 200
    ois = r.json()["opt_in_stats"]
    assert "total_resolvers_in_clinic" in ois
    assert "opted_in" in ois
    assert "opted_out" in ois
    assert "opt_in_pct" in ois


def test_summary_dispatch_stats_shape():
    r = client.get(f"{_BASE}/summary", headers=_CLINICIAN)
    assert r.status_code == 200
    ds = r.json()["dispatch_stats"]
    assert "total_dispatched" in ds
    assert "by_channel" in ds
    # Canonical channels present in by_channel
    for ch in ("slack", "twilio", "sendgrid", "pagerduty", "email"):
        assert ch in ds["by_channel"], f"Missing channel: {ch}"


def test_summary_delivery_outcomes_shape():
    r = client.get(f"{_BASE}/summary", headers=_CLINICIAN)
    assert r.status_code == 200
    do = r.json()["delivery_outcomes"]
    assert "delivered" in do
    assert "failed" in do
    assert "success_rate_pct" in do


def test_summary_trend_buckets_is_list():
    r = client.get(f"{_BASE}/summary", headers=_CLINICIAN)
    assert r.status_code == 200
    buckets = r.json()["trend_buckets"]
    assert isinstance(buckets, list)
    assert len(buckets) >= 1


# ── /resolver-trajectory ─────────────────────────────────────────────────────


def test_resolver_trajectory_empty_db_returns_list():
    r = client.get(f"{_BASE}/resolver-trajectory", headers=_CLINICIAN)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


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
    assert r.json()["surface"] == "resolver_coaching_digest_audit_hub"
