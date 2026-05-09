"""Tests for /api/v1/personalization/rules/review — governance review endpoint."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


ADMIN_HDR = {"Authorization": "Bearer admin-demo-token"}
CLINICIAN_HDR = {"Authorization": "Bearer clinician-demo-token"}


# ---------------------------------------------------------------------------
# Auth + role guard
# ---------------------------------------------------------------------------

class TestPersonalizationAuth:
    def test_unauthenticated_returns_403(self, client: TestClient) -> None:
        r = client.get("/api/v1/personalization/rules/review")
        assert r.status_code == 403

    def test_clinician_role_is_rejected(self, client: TestClient) -> None:
        """Endpoint requires admin — clinician should get 403."""
        r = client.get("/api/v1/personalization/rules/review", headers=CLINICIAN_HDR)
        assert r.status_code == 403


# ---------------------------------------------------------------------------
# Happy path — view=both (default)
# ---------------------------------------------------------------------------

class TestPersonalizationReviewBoth:
    def test_default_view_both_returns_snapshot_and_report(self, client: TestClient) -> None:
        r = client.get("/api/v1/personalization/rules/review", headers=ADMIN_HDR)
        assert r.status_code == 200
        body = r.json()
        assert "snapshot" in body
        assert isinstance(body["snapshot"], dict)
        # view=both (default) must include report_text
        assert body.get("report_text") is not None
        assert isinstance(body["report_text"], str)

    def test_view_report_returns_both_fields(self, client: TestClient) -> None:
        r = client.get(
            "/api/v1/personalization/rules/review?view=report", headers=ADMIN_HDR
        )
        assert r.status_code == 200
        body = r.json()
        assert "snapshot" in body
        assert body.get("report_text") is not None


# ---------------------------------------------------------------------------
# view=snapshot
# ---------------------------------------------------------------------------

class TestPersonalizationReviewSnapshot:
    def test_snapshot_view_returns_snapshot_only(self, client: TestClient) -> None:
        r = client.get(
            "/api/v1/personalization/rules/review?view=snapshot", headers=ADMIN_HDR
        )
        assert r.status_code == 200
        body = r.json()
        assert "snapshot" in body
        # view=snapshot — report_text must be null
        assert body.get("report_text") is None


# ---------------------------------------------------------------------------
# Invalid view param
# ---------------------------------------------------------------------------

class TestPersonalizationReviewBadParam:
    def test_invalid_view_returns_422(self, client: TestClient) -> None:
        r = client.get(
            "/api/v1/personalization/rules/review?view=invalid_value", headers=ADMIN_HDR
        )
        assert r.status_code == 422
