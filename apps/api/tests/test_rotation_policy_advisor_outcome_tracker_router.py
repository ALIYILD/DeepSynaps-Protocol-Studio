"""Tests for CSAHP5: Rotation Policy Advisor Outcome Tracker router.

Covers:
- GET /summary — happy path (empty clinic returns zeroed shape with all advice codes)
- GET /summary — requires clinician role (guest → 403)
- GET /list — happy path returns paginated shape
- GET /list — page_size upper-bound validation (>200 → 422)
- POST /run-snapshot-now — clinician → 403 (admin-only)
- POST /run-snapshot-now — admin happy path
- GET /audit-events — happy path
- POST /audit-events — page-level audit ingestion returns accepted=True
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

_BASE = "/api/v1/rotation-policy-advisor-outcome-tracker"


class TestSummary:
    def test_happy_path_empty_clinic_returns_known_advice_codes(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(f"{_BASE}/summary", headers=auth_headers["clinician"])
        assert r.status_code == 200, r.text
        body = r.json()
        assert "window_days" in body
        assert "pair_lookahead_days" in body
        assert "total_paired_cards" in body
        assert "total_pending_cards" in body
        assert "total_disappeared_cards" in body
        assert "by_advice_code" in body
        assert isinstance(body["by_advice_code"], dict)
        assert "by_channel" in body
        assert "trend_buckets" in body
        assert isinstance(body["trend_buckets"], list)
        assert "worker_enabled" in body

    def test_guest_is_rejected(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(f"{_BASE}/summary", headers=auth_headers["guest"])
        assert r.status_code == 403, r.text

    def test_unauthenticated_is_rejected(
        self, client: TestClient
    ) -> None:
        r = client.get(f"{_BASE}/summary")
        assert r.status_code in {401, 403}, r.text

    def test_admin_can_access_summary(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(f"{_BASE}/summary", headers=auth_headers["admin"])
        assert r.status_code == 200, r.text


class TestListPaired:
    def test_happy_path_returns_paginated_shape(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(f"{_BASE}/list", headers=auth_headers["clinician"])
        assert r.status_code == 200, r.text
        body = r.json()
        assert "items" in body
        assert isinstance(body["items"], list)
        assert "total" in body
        assert "page" in body
        assert "page_size" in body

    def test_page_size_upper_bound_422(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            f"{_BASE}/list?page_size=201", headers=auth_headers["clinician"]
        )
        assert r.status_code == 422, r.text

    def test_advice_code_filter_accepted(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            f"{_BASE}/list?advice_code=ROTATION_FREQUENCY",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text


class TestRunSnapshotNow:
    def test_clinician_is_rejected(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(f"{_BASE}/run-snapshot-now", headers=auth_headers["clinician"])
        assert r.status_code == 403, r.text

    def test_admin_runs_snapshot_returns_accepted(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(f"{_BASE}/run-snapshot-now", headers=auth_headers["admin"])
        assert r.status_code == 200, r.text
        body = r.json()
        assert "accepted" in body
        assert body["accepted"] is True
        assert "clinics_scanned" in body
        assert "errors" in body


class TestAuditEvents:
    def test_get_returns_list_shape(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(f"{_BASE}/audit-events", headers=auth_headers["clinician"])
        assert r.status_code == 200, r.text
        body = r.json()
        assert "items" in body
        assert "total" in body
        assert "surface" in body

    def test_post_page_level_audit_accepted(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(
            f"{_BASE}/audit-events",
            json={"event": "page_viewed", "note": "test pin"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["accepted"] is True
        assert "event_id" in body

    def test_post_missing_event_field_422(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(
            f"{_BASE}/audit-events",
            json={"note": "no event field"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 422, r.text
