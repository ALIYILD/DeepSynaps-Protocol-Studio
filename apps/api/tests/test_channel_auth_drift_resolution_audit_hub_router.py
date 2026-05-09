"""Tests for channel_auth_drift_resolution_audit_hub_router.py — happy + auth + edge."""
from __future__ import annotations

from fastapi.testclient import TestClient


_BASE = "/api/v1/channel-auth-drift-resolution-audit-hub"

_PROBE_CHANNELS = {"slack", "sendgrid", "twilio", "pagerduty"}


# ── /summary ─────────────────────────────────────────────────────────────────


def test_summary_clinician_200(client: TestClient, auth_headers: dict) -> None:
    """Clinician gets the summary with the expected top-level shape."""
    r = client.get(f"{_BASE}/summary", headers=auth_headers["clinician"])
    assert r.status_code == 200
    body = r.json()
    assert "window_days" in body
    assert "total_drifts" in body
    assert "rotation_funnel" in body
    assert "rotation_funnel_pct" in body
    assert "rotation_method_distribution" in body
    assert "by_channel" in body
    assert "trend_buckets" in body


def test_summary_by_channel_always_seeded(client: TestClient, auth_headers: dict) -> None:
    """by_channel contains all canonical PROBE_CHANNELS even with empty DB."""
    r = client.get(f"{_BASE}/summary", headers=auth_headers["clinician"])
    assert r.status_code == 200
    by_channel = r.json()["by_channel"]
    for ch in _PROBE_CHANNELS:
        assert ch in by_channel, f"Missing channel {ch!r} in by_channel"


def test_summary_custom_window(client: TestClient, auth_headers: dict) -> None:
    """Custom window_days parameter is reflected in the response."""
    r = client.get(f"{_BASE}/summary?window_days=30", headers=auth_headers["clinician"])
    assert r.status_code == 200
    assert r.json()["window_days"] == 30


def test_summary_window_out_of_range_422(client: TestClient, auth_headers: dict) -> None:
    """window_days=0 is below minimum — must return 422."""
    r = client.get(f"{_BASE}/summary?window_days=0", headers=auth_headers["clinician"])
    assert r.status_code == 422


def test_summary_requires_auth(client: TestClient) -> None:
    """Summary must reject unauthenticated requests."""
    r = client.get(f"{_BASE}/summary")
    assert r.status_code == 403


def test_summary_patient_forbidden(client: TestClient, auth_headers: dict) -> None:
    """Patient role is below clinician minimum — must be rejected."""
    r = client.get(f"{_BASE}/summary", headers=auth_headers["patient"])
    assert r.status_code == 403


# ── /top-rotators ─────────────────────────────────────────────────────────────


def test_top_rotators_clinician_200(client: TestClient, auth_headers: dict) -> None:
    """Clinician gets the top-rotators list."""
    r = client.get(f"{_BASE}/top-rotators", headers=auth_headers["clinician"])
    assert r.status_code == 200
    body = r.json()
    assert "items" in body
    assert "window_days" in body
    assert "min_rotations" in body
    assert isinstance(body["items"], list)


def test_top_rotators_empty_db(client: TestClient, auth_headers: dict) -> None:
    """Empty DB returns an empty items list, not an error."""
    r = client.get(f"{_BASE}/top-rotators", headers=auth_headers["clinician"])
    assert r.status_code == 200
    assert r.json()["items"] == []


def test_top_rotators_requires_auth(client: TestClient) -> None:
    """Top-rotators must reject unauthenticated requests."""
    r = client.get(f"{_BASE}/top-rotators")
    assert r.status_code == 403


def test_top_rotators_min_rotations_param(client: TestClient, auth_headers: dict) -> None:
    """min_rotations param is reflected in the response."""
    r = client.get(
        f"{_BASE}/top-rotators?min_rotations=3",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200
    assert r.json()["min_rotations"] == 3


# ── /audit-events GET ─────────────────────────────────────────────────────────


def test_list_audit_events_clinician(client: TestClient, auth_headers: dict) -> None:
    """Clinician can list audit events for the hub surface."""
    r = client.get(f"{_BASE}/audit-events", headers=auth_headers["clinician"])
    assert r.status_code == 200
    body = r.json()
    assert "items" in body
    assert "total" in body
    assert "surface" in body
    assert body["surface"] == "channel_auth_drift_resolution_audit_hub"


def test_list_audit_events_requires_auth(client: TestClient) -> None:
    """Audit-event list must reject unauthenticated requests."""
    r = client.get(f"{_BASE}/audit-events")
    assert r.status_code == 403


# ── /audit-events POST ────────────────────────────────────────────────────────


def test_post_audit_event_accepted(client: TestClient, auth_headers: dict) -> None:
    """Clinician can ingest a page-level audit event."""
    r = client.post(
        f"{_BASE}/audit-events",
        json={"event": "page_view", "note": "loaded the hub"},
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200
    body = r.json()
    assert body["accepted"] is True
    assert "event_id" in body


def test_post_audit_event_missing_event_422(client: TestClient, auth_headers: dict) -> None:
    """Missing required event field returns 422."""
    r = client.post(
        f"{_BASE}/audit-events",
        json={"note": "no event field"},
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 422


def test_post_audit_event_requires_auth(client: TestClient) -> None:
    """Audit ingestion must reject unauthenticated requests."""
    r = client.post(f"{_BASE}/audit-events", json={"event": "view"})
    assert r.status_code == 403
