"""Tests for channel_misconfiguration_detector_router — set D (PR 76/N).

Covers:
  - GET  /api/v1/channel-misconfiguration-detector/status
  - POST /api/v1/channel-misconfiguration-detector/tick-once
  - POST /api/v1/channel-misconfiguration-detector/audit-events

Auth, role gates, happy paths, 422 / edge cases.
"""
from __future__ import annotations

import os

import pytest
from fastapi.testclient import TestClient

# Keep the background scheduler from firing in test.
os.environ.pop("DEEPSYNAPS_CHANNEL_DETECTOR_ENABLED", None)


# ── fixtures ─────────────────────────────────────────────────────────────────


@pytest.fixture(autouse=True)
def _reset_worker():
    from app.workers.channel_misconfiguration_detector_worker import _reset_for_tests
    _reset_for_tests()
    yield
    _reset_for_tests()


# ── GET /status ───────────────────────────────────────────────────────────────


def test_status_requires_auth(client: TestClient) -> None:
    r = client.get("/api/v1/channel-misconfiguration-detector/status")
    assert r.status_code == 403


def test_status_patient_is_403(client: TestClient, auth_headers: dict) -> None:
    r = client.get(
        "/api/v1/channel-misconfiguration-detector/status",
        headers=auth_headers["patient"],
    )
    assert r.status_code == 403


def test_status_clinician_happy_path(client: TestClient, auth_headers: dict) -> None:
    r = client.get(
        "/api/v1/channel-misconfiguration-detector/status",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200
    body = r.json()
    assert "running" in body
    assert "caregivers_in_clinic" in body
    assert "misconfigs_flagged_last_24h" in body
    assert "interval_sec" in body
    assert "cooldown_hours" in body
    assert "staleness_hours" in body
    assert isinstance(body["disclaimers"], list)
    assert len(body["disclaimers"]) >= 1


def test_status_admin_happy_path(client: TestClient, auth_headers: dict) -> None:
    r = client.get(
        "/api/v1/channel-misconfiguration-detector/status",
        headers=auth_headers["admin"],
    )
    assert r.status_code == 200
    body = r.json()
    assert body["clinic_id"] == "clinic-demo-default"


def test_status_scoped_to_own_clinic(client: TestClient, auth_headers: dict) -> None:
    r = client.get(
        "/api/v1/channel-misconfiguration-detector/status",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200
    assert r.json()["clinic_id"] == "clinic-demo-default"


# ── POST /tick-once ───────────────────────────────────────────────────────────


def test_tick_once_clinician_is_403(client: TestClient, auth_headers: dict) -> None:
    r = client.post(
        "/api/v1/channel-misconfiguration-detector/tick-once",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 403


def test_tick_once_patient_is_403(client: TestClient, auth_headers: dict) -> None:
    r = client.post(
        "/api/v1/channel-misconfiguration-detector/tick-once",
        headers=auth_headers["patient"],
    )
    assert r.status_code == 403


def test_tick_once_admin_happy_path(client: TestClient, auth_headers: dict) -> None:
    r = client.post(
        "/api/v1/channel-misconfiguration-detector/tick-once",
        headers=auth_headers["admin"],
    )
    assert r.status_code == 200
    body = r.json()
    assert body["accepted"] is True
    assert body["clinic_id"] == "clinic-demo-default"
    assert "caregivers_scanned" in body
    assert "misconfigs_flagged" in body
    assert "audit_event_id" in body
    assert body["audit_event_id"].startswith("channel_misconfiguration_detector-")


# ── POST /audit-events ────────────────────────────────────────────────────────


def test_audit_events_requires_auth(client: TestClient) -> None:
    r = client.post(
        "/api/v1/channel-misconfiguration-detector/audit-events",
        json={"event": "view"},
    )
    assert r.status_code == 403


def test_audit_events_patient_is_403(client: TestClient, auth_headers: dict) -> None:
    r = client.post(
        "/api/v1/channel-misconfiguration-detector/audit-events",
        json={"event": "view"},
        headers=auth_headers["patient"],
    )
    assert r.status_code == 403


def test_audit_events_clinician_happy_path(client: TestClient, auth_headers: dict) -> None:
    r = client.post(
        "/api/v1/channel-misconfiguration-detector/audit-events",
        json={"event": "view", "note": "test view event"},
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200
    body = r.json()
    assert body["accepted"] is True
    assert body["event_id"].startswith("channel_misconfiguration_detector-")


def test_audit_events_missing_event_field_is_422(client: TestClient, auth_headers: dict) -> None:
    r = client.post(
        "/api/v1/channel-misconfiguration-detector/audit-events",
        json={"note": "no event field"},
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 422


def test_audit_events_empty_event_is_422(client: TestClient, auth_headers: dict) -> None:
    r = client.post(
        "/api/v1/channel-misconfiguration-detector/audit-events",
        json={"event": ""},
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 422
