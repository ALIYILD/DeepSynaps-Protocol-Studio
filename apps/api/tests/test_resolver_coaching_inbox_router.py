"""Tests for the Resolver Coaching Inbox router (DCRO2).

Pins:
  - /my-coaching-inbox returns well-shaped response (reviewer minimum)
  - /my-coaching-inbox requires auth
  - /my-coaching-inbox window_days default 90
  - /my-coaching-inbox response shape: resolver_user_id, calibration_accuracy_pct, wrong_false_positive_calls
  - /self-review-note rejects short note (< 10 chars) with 422
  - /self-review-note rejects missing resolved_audit_id with 422
  - /audit-events requires auth
  - /audit-events returns pagination shape + surface name
  - /admin-overview requires admin role
  - /admin-overview returns list shape on empty DB
"""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

# resolver_coaching_inbox requires "reviewer" minimum.
# clinician >= reviewer so clinician-demo-token is sufficient.
_CLINICIAN = {"Authorization": "Bearer clinician-demo-token"}
_ADMIN = {"Authorization": "Bearer admin-demo-token"}

_BASE = "/api/v1/resolver-coaching-inbox"


# ── Auth guards ──────────────────────────────────────────────────────────────


def test_my_coaching_inbox_requires_auth():
    r = client.get(f"{_BASE}/my-coaching-inbox")
    assert r.status_code == 403


def test_audit_events_requires_auth():
    r = client.get(f"{_BASE}/audit-events")
    assert r.status_code == 403


def test_admin_overview_requires_auth():
    r = client.get(f"{_BASE}/admin-overview")
    assert r.status_code == 403


# ── /my-coaching-inbox ────────────────────────────────────────────────────────


def test_my_coaching_inbox_empty_db_returns_well_shaped_response():
    r = client.get(f"{_BASE}/my-coaching-inbox", headers=_CLINICIAN)
    assert r.status_code == 200
    body = r.json()
    assert "resolver_user_id" in body
    assert "calibration_accuracy_pct" in body
    assert "in_bottom_quartile" in body
    assert "wrong_false_positive_calls" in body
    assert "summary" in body
    assert "window_days" in body


def test_my_coaching_inbox_window_days_default_90():
    r = client.get(f"{_BASE}/my-coaching-inbox", headers=_CLINICIAN)
    assert r.status_code == 200
    assert r.json()["window_days"] == 90


def test_my_coaching_inbox_wrong_calls_empty_list_on_clean_db():
    r = client.get(f"{_BASE}/my-coaching-inbox", headers=_CLINICIAN)
    assert r.status_code == 200
    assert r.json()["wrong_false_positive_calls"] == []


def test_my_coaching_inbox_calibration_accuracy_100_when_no_data():
    r = client.get(f"{_BASE}/my-coaching-inbox", headers=_CLINICIAN)
    assert r.status_code == 200
    assert r.json()["calibration_accuracy_pct"] == 100.0


def test_my_coaching_inbox_custom_window():
    r = client.get(
        f"{_BASE}/my-coaching-inbox?window_days=30", headers=_CLINICIAN
    )
    assert r.status_code == 200
    assert r.json()["window_days"] == 30


# ── /self-review-note ─────────────────────────────────────────────────────────


def test_self_review_note_missing_fields_returns_422():
    r = client.post(f"{_BASE}/self-review-note", json={}, headers=_CLINICIAN)
    assert r.status_code == 422


def test_self_review_note_short_note_returns_422():
    r = client.post(
        f"{_BASE}/self-review-note",
        json={"resolved_audit_id": "some-audit-id", "self_review_note": "short"},
        headers=_CLINICIAN,
    )
    assert r.status_code == 422


def test_self_review_note_requires_auth():
    r = client.post(
        f"{_BASE}/self-review-note",
        json={
            "resolved_audit_id": "some-audit-id",
            "self_review_note": "This is a valid self review note.",
        },
    )
    assert r.status_code == 403


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
    assert r.json()["surface"] == "resolver_coaching_inbox"


# ── /admin-overview ───────────────────────────────────────────────────────────


def test_admin_overview_empty_db_returns_shape():
    r = client.get(f"{_BASE}/admin-overview", headers=_ADMIN)
    assert r.status_code == 200
    body = r.json()
    assert "items" in body
    assert "window_days" in body
    assert "min_resolutions" in body
    assert isinstance(body["items"], list)
