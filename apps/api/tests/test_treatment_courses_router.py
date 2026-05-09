"""Happy-path tests for the Treatment Courses router.

Scope: /api/v1/treatment-courses — list, create (protocol registry driven),
get detail, sessions list, review queue. Verifies role gate, empty-DB
stability, and that 404 is returned for missing courses.
"""
from __future__ import annotations

from fastapi.testclient import TestClient


AUTH_CLINICIAN = {"Authorization": "Bearer clinician-demo-token"}
AUTH_ADMIN = {"Authorization": "Bearer admin-demo-token"}
AUTH_GUEST = {"Authorization": "Bearer guest-demo-token"}


def test_list_courses_empty_db(client: TestClient) -> None:
    r = client.get("/api/v1/treatment-courses", headers=AUTH_CLINICIAN)
    assert r.status_code == 200
    body = r.json()
    assert "items" in body
    assert isinstance(body["items"], list)
    assert body["total"] == 0


def test_list_courses_guest_blocked(client: TestClient) -> None:
    r = client.get("/api/v1/treatment-courses", headers=AUTH_GUEST)
    assert r.status_code in (403, 404)


def test_get_course_not_found(client: TestClient) -> None:
    r = client.get("/api/v1/treatment-courses/nonexistent-id", headers=AUTH_CLINICIAN)
    assert r.status_code == 404


def test_get_course_sessions_not_found(client: TestClient) -> None:
    r = client.get("/api/v1/treatment-courses/nonexistent-id/sessions", headers=AUTH_CLINICIAN)
    assert r.status_code == 404


def test_list_review_queue_empty(client: TestClient) -> None:
    r = client.get("/api/v1/review-queue", headers=AUTH_CLINICIAN)
    assert r.status_code == 200
    body = r.json()
    assert "items" in body
    assert isinstance(body["items"], list)
    assert body["total"] == 0


def test_review_queue_guest_blocked(client: TestClient) -> None:
    r = client.get("/api/v1/review-queue", headers=AUTH_GUEST)
    assert r.status_code in (403, 404)


def test_create_course_unknown_protocol_returns_404(client: TestClient) -> None:
    """Creating a course with an unknown protocol ID must return 404."""
    r = client.post(
        "/api/v1/treatment-courses",
        json={
            "patient_id": "patient-does-not-exist",
            "protocol_id": "nonexistent-protocol-xyz",
        },
        headers=AUTH_CLINICIAN,
    )
    # Protocol not found → 404; or governance block → 403/422. Never 5xx.
    assert r.status_code in (404, 403, 422), r.text


def test_course_audit_events_returns_404_for_missing_course(client: TestClient) -> None:
    r = client.get(
        "/api/v1/treatment-courses/no-such-course/audit-events",
        headers=AUTH_CLINICIAN,
    )
    assert r.status_code == 404


def test_review_actions_invalid_action_rejected(client: TestClient) -> None:
    r = client.post(
        "/api/v1/review-queue/actions",
        json={
            "review_item_id": "does-not-exist",
            "action": "invalid_action",
        },
        headers=AUTH_CLINICIAN,
    )
    # invalid action → 422; missing item → 404. Either is acceptable — never 5xx.
    assert r.status_code in (404, 422), r.text
