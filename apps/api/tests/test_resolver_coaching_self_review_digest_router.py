"""Tests for DCRO3: Resolver Coaching Self-Review Digest router.

Covers:
- GET /my-preference — happy path (creates default opted_in=False row)
- GET /my-preference — unauthenticated → 403
- PUT /my-preference — happy path (opt in, set channel)
- PUT /my-preference — invalid channel → 422
- GET /status — clinician can read
- GET /status — guest → 403
- POST /tick — admin only; clinician → 403
- GET /audit-events — happy path returns list shape
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

_BASE = "/api/v1/resolver-coaching-self-review-digest"


class TestMyPreference:
    def test_get_creates_default_opted_out_row(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(f"{_BASE}/my-preference", headers=auth_headers["clinician"])
        assert r.status_code == 200, r.text
        body = r.json()
        assert "opted_in" in body
        assert body["opted_in"] is False  # default must be opted-out
        assert "clinic_id" in body
        assert "resolver_user_id" in body
        assert "worker_enabled_via_env" in body

    def test_unauthenticated_is_rejected(
        self, client: TestClient
    ) -> None:
        r = client.get(f"{_BASE}/my-preference")
        assert r.status_code in {401, 403}, r.text

    def test_put_opt_in_updates_row(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.put(
            f"{_BASE}/my-preference",
            json={"opted_in": True, "preferred_channel": None},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["opted_in"] is True

    def test_put_valid_channel_is_stored(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.put(
            f"{_BASE}/my-preference",
            json={"opted_in": True, "preferred_channel": "email"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["preferred_channel"] == "email"

    def test_put_invalid_channel_returns_422(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.put(
            f"{_BASE}/my-preference",
            json={"opted_in": True, "preferred_channel": "telegram"},
            headers=auth_headers["clinician"],
        )
        # Router raises ApiServiceError(status_code=422) for unknown channels.
        assert r.status_code == 422, r.text

    def test_put_auto_channel_maps_to_none(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.put(
            f"{_BASE}/my-preference",
            json={"opted_in": True, "preferred_channel": "auto"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["preferred_channel"] is None


class TestWorkerStatus:
    def test_clinician_can_read_status(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(f"{_BASE}/status", headers=auth_headers["clinician"])
        assert r.status_code == 200, r.text
        body = r.json()
        assert "running" in body
        assert "enabled" in body
        assert "interval_hours" in body
        assert "cooldown_hours" in body
        assert "disclaimers" in body

    def test_guest_is_rejected(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(f"{_BASE}/status", headers=auth_headers["guest"])
        assert r.status_code == 403, r.text


class TestTick:
    def test_clinician_cannot_tick(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(f"{_BASE}/tick", json={}, headers=auth_headers["clinician"])
        assert r.status_code == 403, r.text

    def test_admin_can_tick_empty_clinic(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(f"{_BASE}/tick", json={}, headers=auth_headers["admin"])
        assert r.status_code == 200, r.text
        body = r.json()
        assert "accepted" in body
        assert body["accepted"] is True
        assert "resolvers_scanned" in body
        assert "digests_dispatched" in body
        assert "audit_event_id" in body


class TestAuditEvents:
    def test_happy_path_returns_list_shape(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(f"{_BASE}/audit-events", headers=auth_headers["clinician"])
        assert r.status_code == 200, r.text
        body = r.json()
        assert "items" in body
        assert "total" in body
        assert "limit" in body
        assert "offset" in body
        assert "surface" in body

    def test_limit_upper_bound_422(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            f"{_BASE}/audit-events?limit=201",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 422, r.text
