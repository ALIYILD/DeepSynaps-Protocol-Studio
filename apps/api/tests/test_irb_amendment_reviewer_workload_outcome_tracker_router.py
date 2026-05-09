"""Tests for IRB-AMD3: Reviewer Workload Outcome Tracker router.

Covers:
- GET /summary — happy path (empty clinic returns zeroed shape)
- GET /summary — requires clinician role (guest → 403)
- GET /reviewer-calibration — happy path
- GET /reviewer-calibration — min_breaches validation (>100 → 422)
- GET /list — happy path (empty clinic returns paginated empty)
- GET /list — outcome filter: unknown value is silently ignored (no 422)
- GET /audit-events — happy path
- GET /audit-events — limit/offset pagination params are honoured
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

_BASE = "/api/v1/irb-amendment-reviewer-workload-outcome-tracker"


class TestSummary:
    def test_happy_path_empty_clinic(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(f"{_BASE}/summary", headers=auth_headers["clinician"])
        assert r.status_code == 200, r.text
        body = r.json()
        assert "window_days" in body
        assert "sla_response_days" in body
        assert "total_breaches" in body
        assert "outcome_counts" in body
        assert "outcome_pct" in body
        assert "by_reviewer_top" in body
        assert isinstance(body["by_reviewer_top"], list)
        assert "disclaimers" in body
        assert isinstance(body["disclaimers"], list)
        assert len(body["disclaimers"]) > 0

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

    def test_window_days_query_param_is_accepted(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            f"{_BASE}/summary?window_days=60",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        assert r.json()["window_days"] == 60


class TestReviewerCalibration:
    def test_happy_path_returns_list_shape(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            f"{_BASE}/reviewer-calibration", headers=auth_headers["clinician"]
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert "items" in body
        assert isinstance(body["items"], list)
        assert "window_days" in body
        assert "sla_response_days" in body
        assert "min_breaches" in body

    def test_min_breaches_upper_bound_422(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            f"{_BASE}/reviewer-calibration?min_breaches=101",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 422, r.text

    def test_admin_can_read(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            f"{_BASE}/reviewer-calibration", headers=auth_headers["admin"]
        )
        assert r.status_code == 200, r.text


class TestListPaired:
    def test_happy_path_empty_returns_paginated_shape(
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

    def test_unknown_outcome_filter_is_ignored(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        # The router silently ignores unknown outcome values — no 422.
        r = client.get(
            f"{_BASE}/list?outcome=totally_unknown_outcome",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text

    def test_page_size_upper_bound_422(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            f"{_BASE}/list?page_size=201", headers=auth_headers["clinician"]
        )
        assert r.status_code == 422, r.text


class TestAuditEvents:
    def test_happy_path_returns_list(
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

    def test_limit_param_is_respected(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            f"{_BASE}/audit-events?limit=5",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        assert r.json()["limit"] == 5

    def test_limit_upper_bound_422(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            f"{_BASE}/audit-events?limit=201",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 422, r.text
