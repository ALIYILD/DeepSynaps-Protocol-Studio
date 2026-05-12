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


# ── P0 dual-review protocol gate tests ────────────────────────────────────────

import uuid


def _create_test_course() -> str:
    """Create a patient + course directly in the test DB and return course_id."""
    from datetime import datetime, timezone
    from app.database import SessionLocal
    from app.persistence.models import Patient, TreatmentCourse

    db = SessionLocal()
    patient_id = str(uuid.uuid4())
    patient = Patient(
        id=patient_id,
        clinician_id="actor-clinician-demo",
        first_name="Test",
        last_name="Patient",
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db.add(patient)
    db.flush()

    course = TreatmentCourse(
        id=str(uuid.uuid4()),
        patient_id=patient.id,
        clinician_id="actor-clinician-demo",
        protocol_id="demo-protocol-001",
        condition_slug="mdd",
        modality_slug="rtms",
    )
    db.add(course)
    db.commit()
    course_id = course.id
    db.close()
    return course_id


def test_activate_course_blocked_without_dual_review(client: TestClient) -> None:
    """A course with zero approvals must be blocked from activation (P0)."""
    course_id = _create_test_course()
    r = client.patch(
        f"/api/v1/treatment-courses/{course_id}/activate",
        json={},
        headers=AUTH_CLINICIAN,
    )
    assert r.status_code == 403, f"Expected 403 dual_review_required, got {r.status_code}: {r.text}"
    data = r.json()
    assert data.get("code") == "dual_review_required"
    assert "two independent clinician approvals" in data.get("message", "").lower()


def test_activate_course_blocked_with_only_one_review(client: TestClient) -> None:
    """A course with only one approval must still be blocked from activation (P0)."""
    from app.database import SessionLocal
    from app.persistence.models import TreatmentCourse

    course_id = _create_test_course()
    db = SessionLocal()
    course = db.query(TreatmentCourse).filter_by(id=course_id).first()
    course.reviewer_1_id = "reviewer-a"
    db.commit()
    db.close()

    r = client.patch(
        f"/api/v1/treatment-courses/{course_id}/activate",
        json={},
        headers=AUTH_CLINICIAN,
    )
    assert r.status_code == 403, f"Expected 403 with one reviewer, got {r.status_code}: {r.text}"
    assert r.json().get("code") == "dual_review_required"


def test_activate_course_passes_with_dual_review(client: TestClient) -> None:
    """A course with two distinct reviewer approvals may proceed past dual-review gate."""
    from app.database import SessionLocal
    from app.persistence.models import TreatmentCourse

    course_id = _create_test_course()
    db = SessionLocal()
    course = db.query(TreatmentCourse).filter_by(id=course_id).first()
    course.reviewer_1_id = "reviewer-a"
    course.reviewer_2_id = "reviewer-b"
    db.commit()
    db.close()

    r = client.patch(
        f"/api/v1/treatment-courses/{course_id}/activate",
        json={},
        headers=AUTH_CLINICIAN,
    )
    # Should NOT be blocked by dual-review; may still be blocked by EV-D / safety / governance.
    assert r.json().get("code") != "dual_review_required", \
        f"Unexpected dual-review block after two approvals: {r.text}"
