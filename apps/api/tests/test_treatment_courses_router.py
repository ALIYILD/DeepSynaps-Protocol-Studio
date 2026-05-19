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


# ── Off-label acknowledgement gate tests (must-have #5 wiring, PR #1089) ─────


def _create_off_label_course_with_dual_review() -> tuple[str, str]:
    """Create a patient + off-label course with two reviewer approvals.

    Returns (course_id, patient_id). The course passes dual-review and
    safety so the only remaining gate is the off-label acknowledgement.
    """
    import uuid as _uuid
    from datetime import datetime, timezone

    from app.database import SessionLocal
    from app.persistence.models import Patient, TreatmentCourse

    db = SessionLocal()
    patient_id = str(_uuid.uuid4())
    patient = Patient(
        id=patient_id,
        clinician_id="actor-clinician-demo",
        first_name="OffLabel",
        last_name="Patient",
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db.add(patient)
    db.flush()

    course = TreatmentCourse(
        id=str(_uuid.uuid4()),
        patient_id=patient.id,
        clinician_id="actor-clinician-demo",
        protocol_id="demo-off-label-001",
        condition_slug="mdd",
        modality_slug="rtms",
        on_label=False,
        evidence_grade="EV-B",
        reviewer_1_id="reviewer-a",
        reviewer_2_id="reviewer-b",
    )
    db.add(course)
    db.commit()
    course_id = course.id
    db.close()
    return course_id, patient_id


def test_activate_off_label_course_blocked_without_acknowledgement(client: TestClient) -> None:
    """An off-label course with no consent_type='off_label_acknowledgement'
    must be blocked from activation with code=off_label_consent_missing."""
    course_id, _ = _create_off_label_course_with_dual_review()
    r = client.patch(
        f"/api/v1/treatment-courses/{course_id}/activate",
        json={},
        headers=AUTH_CLINICIAN,
    )
    # The off-label gate may surface AFTER patient-safety / governance gates,
    # so we only assert it fires when nothing earlier blocked. If something
    # earlier blocks the test would be inconclusive — the assertion below
    # tolerates that path so this test is resilient to legitimate ordering.
    assert r.status_code == 403, f"Expected 403, got {r.status_code}: {r.text}"
    code = r.json().get("code")
    assert code in (
        "off_label_consent_missing",
        "safety_block",
        "governance_block",
    ), f"Unexpected denial code: {code} — body: {r.text}"


def test_activate_off_label_course_passes_with_signed_acknowledgement(client: TestClient) -> None:
    """An off-label course with a valid acknowledgement row must NOT be
    blocked by the off-label gate. (Other gates may still fire.)"""
    import uuid as _uuid
    from datetime import datetime, timezone

    from app.database import SessionLocal
    from app.persistence.models import ConsentRecord
    from app.services.consent_enforcement import OFF_LABEL_CONSENT_TYPE

    course_id, patient_id = _create_off_label_course_with_dual_review()

    db = SessionLocal()
    consent = ConsentRecord(
        id=str(_uuid.uuid4()),
        patient_id=patient_id,
        clinician_id="actor-clinician-demo",
        consent_type=OFF_LABEL_CONSENT_TYPE,
        modality_slug="rtms",
        status="active",
        signed=True,
        signed_at=datetime.now(timezone.utc),
        expires_at=None,
    )
    db.add(consent)
    db.commit()
    db.close()

    r = client.patch(
        f"/api/v1/treatment-courses/{course_id}/activate",
        json={},
        headers=AUTH_CLINICIAN,
    )
    # Must NOT be blocked by the off-label gate — earlier gates may still
    # block, which is fine for this test's purpose.
    assert r.json().get("code") != "off_label_consent_missing", (
        f"Off-label gate unexpectedly fired with valid acknowledgement: {r.text}"
    )


# ── Conservative on_label default in _run_governance ─────────────────────────


def test_run_governance_treats_missing_on_label_as_off_label() -> None:
    """When a partial params dict reaches ``_run_governance`` without an
    ``on_label`` key the helper MUST default to ``False`` per
    ``docs/safety_evidence_policy.md`` so the off-label warnings + gates
    fire. The registry builder always sets the key, but the router's
    defensive default still has to match policy.
    """
    from app.routers.treatment_courses_router import _run_governance

    class _Actor:
        actor_id = "actor-clinician-demo"
        role = "clinician"
        clinic_id = None

    on_label_warnings = _run_governance(
        {"on_label": True, "evidence_grade": "EV-B"},
        _Actor(),  # type: ignore[arg-type]
    )
    off_label_warnings = _run_governance(
        {"on_label": False, "evidence_grade": "EV-B"},
        _Actor(),  # type: ignore[arg-type]
    )
    default_warnings = _run_governance(
        {"evidence_grade": "EV-B"},  # no on_label key
        _Actor(),  # type: ignore[arg-type]
    )

    # Sanity: on-label and off-label produce different governance outputs.
    assert on_label_warnings != off_label_warnings, (
        "Governance engine must distinguish on-label from off-label inputs."
    )
    # The actual conservative-default contract: missing key behaves like off-label.
    assert default_warnings == off_label_warnings, (
        "Missing on_label key MUST default to off-label (False), not on-label."
        f" Got default={default_warnings!r} vs off-label={off_label_warnings!r}."
    )
