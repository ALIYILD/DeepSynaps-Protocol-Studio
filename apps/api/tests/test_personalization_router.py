"""Tests for the personalization router (admin-only governance endpoint)."""
from __future__ import annotations

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

CLINICIAN_HDR = {"Authorization": "Bearer clinician-demo-token"}
ADMIN_HDR = {"Authorization": "Bearer admin-demo-token"}


def test_rules_review_requires_auth():
    """Endpoint must reject unauthenticated requests."""
    r = client.get("/api/v1/personalization/rules/review")
    assert r.status_code == 403


def test_rules_review_clinician_forbidden():
    """Clinician role is insufficient — admin role required."""
    r = client.get("/api/v1/personalization/rules/review", headers=CLINICIAN_HDR)
    assert r.status_code in (403, 422)


def test_rules_review_admin_default_both():
    """Admin gets a valid response with snapshot and report_text."""
    r = client.get("/api/v1/personalization/rules/review", headers=ADMIN_HDR)
    assert r.status_code == 200
    body = r.json()
    assert "snapshot" in body
    # view=both → report_text must be a string (not null)
    assert body.get("report_text") is not None
    assert isinstance(body["report_text"], str)


def test_rules_review_snapshot_view():
    """view=snapshot returns snapshot, report_text is null."""
    r = client.get("/api/v1/personalization/rules/review?view=snapshot", headers=ADMIN_HDR)
    assert r.status_code == 200
    body = r.json()
    assert "snapshot" in body
    assert body.get("report_text") is None


def test_rules_review_report_view():
    """view=report returns non-null report_text."""
    r = client.get("/api/v1/personalization/rules/review?view=report", headers=ADMIN_HDR)
    assert r.status_code == 200
    body = r.json()
    assert body.get("report_text") is not None


def test_rules_review_both_view_matches_report():
    """view=both produces identical result shape as view=report."""
    r_both = client.get("/api/v1/personalization/rules/review?view=both", headers=ADMIN_HDR)
    r_report = client.get("/api/v1/personalization/rules/review?view=report", headers=ADMIN_HDR)
    assert r_both.status_code == 200
    assert r_report.status_code == 200
    both_body = r_both.json()
    report_body = r_report.json()
    # Both views return a report_text; its content should be identical
    assert both_body.get("report_text") == report_body.get("report_text")
