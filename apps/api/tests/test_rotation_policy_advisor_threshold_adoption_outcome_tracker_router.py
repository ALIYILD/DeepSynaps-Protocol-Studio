"""Tests for CSAHP7: Rotation Policy Advisor Threshold Adoption Outcome Tracker router.

Covers:
- GET /summary — happy path returns correct shape
- GET /summary — guest → 403
- GET /adopter-calibration — happy path
- GET /adopter-calibration — min_adoptions upper-bound (>100 → 422)
- GET /list — happy path returns paginated shape
- GET /audit-events — happy path returns list shape
- POST /audit-events — page-level audit ingestion returns accepted=True
- POST /audit-events — missing event field → 422
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

_BASE = "/api/v1/rotation-policy-advisor-threshold-adoption-outcome-tracker"


class TestSummary:
    def test_happy_path_empty_clinic(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(f"{_BASE}/summary", headers=auth_headers["clinician"])
        assert r.status_code == 200, r.text
        body = r.json()
        assert "window_days" in body
        assert "pair_lookahead_days" in body
        assert "total_adoptions" in body
        assert "outcome_counts" in body
        assert "outcome_pct" in body
        assert "by_advice_code" in body
        assert "trend_buckets" in body
        assert isinstance(body["trend_buckets"], list)

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

    def test_admin_can_access(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(f"{_BASE}/summary", headers=auth_headers["admin"])
        assert r.status_code == 200, r.text


class TestAdopterCalibration:
    def test_happy_path_returns_shape(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            f"{_BASE}/adopter-calibration", headers=auth_headers["clinician"]
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert "items" in body
        assert isinstance(body["items"], list)
        assert "total" in body
        assert "window_days" in body
        assert "min_adoptions" in body

    def test_min_adoptions_upper_bound_422(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            f"{_BASE}/adopter-calibration?min_adoptions=101",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 422, r.text


class TestListAdoptions:
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

    def test_outcome_filter_accepted(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            f"{_BASE}/list?outcome=improved",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text


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
            json={"event": "threshold_adoption_page_viewed"},
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
            json={"note": "missing event key"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 422, r.text
