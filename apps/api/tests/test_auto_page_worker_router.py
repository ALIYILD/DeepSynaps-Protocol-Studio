"""Tests for the Auto-Page Worker control-plane router.

Covers:
- GET /status — clinician can read; returns correct shape
- GET /status — guest → 403
- POST /start — clinician → 403 (admin-only)
- POST /start — admin happy path returns accepted=True + audit_event_id
- POST /stop — admin happy path returns accepted=True
- POST /tick-once — clinician → 403
- POST /tick-once — admin runs tick on empty clinic, returns shape
- GET /adapters — clinician can read adapter health shape
- POST /audit-events — page-level audit ingestion returns accepted=True
"""
from __future__ import annotations

import os
import pytest
from fastapi.testclient import TestClient

# Ensure the background worker scheduler does not auto-start during tests.
os.environ.pop("DEEPSYNAPS_AUTO_PAGE_ENABLED", None)

_BASE = "/api/v1/auto-page-worker"


@pytest.fixture(autouse=True)
def _reset_worker_singleton() -> None:
    """Reset the in-memory worker singleton between tests."""
    from app.workers.auto_page_worker import _reset_for_tests

    _reset_for_tests()
    yield
    _reset_for_tests()


class TestWorkerStatus:
    def test_clinician_can_read_status(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(f"{_BASE}/status", headers=auth_headers["clinician"])
        assert r.status_code == 200, r.text
        body = r.json()
        assert "running" in body
        assert "enabled_in_clinic" in body
        assert "process_enabled_via_env" in body
        assert "breaches_pending_now" in body
        assert "interval_sec" in body
        assert "cooldown_min" in body
        assert "disclaimers" in body
        assert isinstance(body["disclaimers"], list)

    def test_guest_is_rejected(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(f"{_BASE}/status", headers=auth_headers["guest"])
        assert r.status_code == 403, r.text

    def test_unauthenticated_is_rejected(
        self, client: TestClient
    ) -> None:
        r = client.get(f"{_BASE}/status")
        assert r.status_code in {401, 403}, r.text


class TestWorkerStart:
    def test_clinician_is_rejected(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(f"{_BASE}/start", headers=auth_headers["clinician"])
        assert r.status_code == 403, r.text

    def test_admin_start_returns_accepted_shape(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(f"{_BASE}/start", headers=auth_headers["admin"])
        assert r.status_code == 200, r.text
        body = r.json()
        assert "accepted" in body
        assert body["accepted"] is True
        assert "audit_event_id" in body
        assert "enabled_in_clinic" in body
        assert "surfaces_changed" in body


class TestWorkerStop:
    def test_admin_stop_returns_accepted_shape(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(f"{_BASE}/stop", headers=auth_headers["admin"])
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["accepted"] is True
        assert "audit_event_id" in body
        assert body["enabled_in_clinic"] is False


class TestTickOnce:
    def test_clinician_is_rejected(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(f"{_BASE}/tick-once", headers=auth_headers["clinician"])
        assert r.status_code == 403, r.text

    def test_admin_tick_returns_counts_shape(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(f"{_BASE}/tick-once", headers=auth_headers["admin"])
        assert r.status_code == 200, r.text
        body = r.json()
        assert "accepted" in body
        assert body["accepted"] is True
        assert "breaches_found" in body
        assert "paged" in body
        assert "skipped_cooldown" in body
        assert "errors" in body
        assert "audit_event_id" in body


class TestAdapterHealth:
    def test_clinician_can_read_adapters(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(f"{_BASE}/adapters", headers=auth_headers["clinician"])
        assert r.status_code == 200, r.text
        body = r.json()
        assert "adapters" in body
        assert isinstance(body["adapters"], list)
        assert "mock_mode" in body


class TestPageLevelAudit:
    def test_post_audit_event_accepted(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(
            f"{_BASE}/audit-events",
            json={"event": "page_viewed", "note": "test coverage pin"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["accepted"] is True
        assert "event_id" in body

    def test_missing_event_field_422(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(
            f"{_BASE}/audit-events",
            json={"note": "no event key"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 422, r.text
