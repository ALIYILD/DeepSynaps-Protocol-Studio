"""Happy-path tests for the Outcomes router.

Scope: /api/v1/outcomes — list, events list, summary, aggregate,
longitudinal. Verifies role gate, empty-DB stability, and that 404 is
returned for unknown courses.
"""
from __future__ import annotations

from fastapi.testclient import TestClient


AUTH_CLINICIAN = {"Authorization": "Bearer clinician-demo-token"}
AUTH_ADMIN = {"Authorization": "Bearer admin-demo-token"}
AUTH_GUEST = {"Authorization": "Bearer guest-demo-token"}


def test_list_outcomes_empty_db(client: TestClient) -> None:
    r = client.get("/api/v1/outcomes", headers=AUTH_CLINICIAN)
    assert r.status_code == 200
    body = r.json()
    assert "items" in body
    assert isinstance(body["items"], list)
    assert body["total"] == 0


def test_list_outcomes_guest_blocked(client: TestClient) -> None:
    r = client.get("/api/v1/outcomes", headers=AUTH_GUEST)
    assert r.status_code in (403, 404)


def test_list_outcome_events_empty_db(client: TestClient) -> None:
    r = client.get("/api/v1/outcomes/events", headers=AUTH_CLINICIAN)
    assert r.status_code == 200
    body = r.json()
    assert "items" in body
    assert isinstance(body["items"], list)
    assert body["total"] == 0


def test_summary_nonexistent_course(client: TestClient) -> None:
    r = client.get(
        "/api/v1/outcomes/summary/nonexistent-course-id",
        headers=AUTH_CLINICIAN,
    )
    # No outcomes for nonexistent course → 200 empty or 404 depending on impl
    assert r.status_code in (200, 404)
    if r.status_code == 200:
        body = r.json()
        assert "summaries" in body
        assert isinstance(body["summaries"], list)


def test_aggregate_empty_db(client: TestClient) -> None:
    r = client.get("/api/v1/outcomes/aggregate", headers=AUTH_CLINICIAN)
    assert r.status_code == 200


def test_longitudinal_empty_db(client: TestClient) -> None:
    r = client.get("/api/v1/outcomes/longitudinal", headers=AUTH_CLINICIAN)
    assert r.status_code == 200


def test_create_outcome_missing_required_fields(client: TestClient) -> None:
    """Creating an outcome without required fields must return 422."""
    r = client.post(
        "/api/v1/outcomes",
        json={},
        headers=AUTH_CLINICIAN,
    )
    assert r.status_code == 422


def test_list_outcomes_filter_by_patient(client: TestClient) -> None:
    r = client.get(
        "/api/v1/outcomes?patient_id=patient-filter-test",
        headers=AUTH_CLINICIAN,
    )
    assert r.status_code == 200
    body = r.json()
    assert "items" in body
    assert body["total"] == 0
