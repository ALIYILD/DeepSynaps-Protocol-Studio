"""Production-hardening tests for H22, billing_status, H12, and H25.

Covers:
  - H22: dismiss_alert ownership — clinician cannot dismiss another clinician's patient alert
  - billing_status: only 'unbilled', 'billed', 'paid' accepted at the model/DB level
  - H12: reviewer assignment persists via PATCH /api/v1/review-queue/{id}/assign
  - H25: GET /api/v1/patient-portal/courses returns correct session_count with batch loading
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.persistence.models import (
    ClinicalSession,
    DeliveredSessionParameters,
    Patient,
    TreatmentCourse,
    User,
    WearableAlertFlag,
)


# ── Shared helpers ───────────────────────────���──────────────────────────��──────

def _register_clinician(client: TestClient, suffix: str) -> str:
    resp = client.post(
        "/api/v1/auth/register",
        json={
            "email": f"harden_clin_{suffix}@example.com",
            "display_name": f"Clinician {suffix}",
            "password": "HardenTest99!",
            "role": "clinician",
        },
    )
    assert resp.status_code == 201, resp.text
    token = resp.json()["access_token"]
    # Ensure the clinician is bound to a clinic so cross-clinic gates pass.
    db = SessionLocal()
    try:
        from app.persistence.models import Clinic
        clinic = Clinic(id=f"clinic-{suffix}", name=f"Test Clinic {suffix}")
        db.add(clinic)
        user = db.query(User).filter_by(email=f"harden_clin_{suffix}@example.com").first()
        if user:
            user.clinic_id = clinic.id
        db.commit()
    finally:
        db.close()
    return token


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _create_patient_api(client: TestClient, token: str) -> str:
    """Create a patient via API and return patient_id."""
    resp = client.post(
        "/api/v1/patients",
        json={"first_name": "Harden", "last_name": "Patient", "dob": "1985-03-15"},
        headers=_auth(token),
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def _seed_alert(patient_id: str, severity: str = "urgent") -> str:
    """Insert a WearableAlertFlag directly in DB and return its id."""
    db: Session = SessionLocal()
    try:
        flag = WearableAlertFlag(
            id=str(uuid.uuid4()),
            patient_id=patient_id,
            flag_type="hr_anomaly",
            severity=severity,
            dismissed=False,
            triggered_at=datetime.now(timezone.utc),  # required NOT NULL column
        )
        db.add(flag)
        db.commit()
        return flag.id
    finally:
        db.close()


# ── H22: dismiss_alert ownership ───────────────────────────���───────────────────

class TestDismissAlertOwnership:
    def test_clinician_can_dismiss_own_patient_alert(self, client: TestClient) -> None:
        token = _register_clinician(client, "dism_own")
        patient_id = _create_patient_api(client, token)
        flag_id = _seed_alert(patient_id)

        resp = client.post(
            f"/api/v1/wearables/alerts/{flag_id}/dismiss",
            headers=_auth(token),
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["ok"] is True

    def test_clinician_cannot_dismiss_other_clinicians_patient_alert(
        self, client: TestClient
    ) -> None:
        token_a = _register_clinician(client, "dism_a")
        token_b = _register_clinician(client, "dism_b")
        # Patient belongs to clinician B
        patient_id_b = _create_patient_api(client, token_b)
        flag_id = _seed_alert(patient_id_b)

        # Clinician A tries to dismiss Clinician B's patient alert — must be 403
        resp = client.post(
            f"/api/v1/wearables/alerts/{flag_id}/dismiss",
            headers=_auth(token_a),
        )
        assert resp.status_code == 403, resp.text

    def test_dismiss_nonexistent_flag_returns_404(self, client: TestClient) -> None:
        # Use demo admin token — no DB user lookup required, tests the 404 path only.
        resp = client.post(
            f"/api/v1/wearables/alerts/{str(uuid.uuid4())}/dismiss",
            headers={"Authorization": "Bearer admin-demo-token"},
        )
        assert resp.status_code == 404, resp.text

    def test_unauthenticated_dismiss_rejected(self, client: TestClient) -> None:
        resp = client.post(f"/api/v1/wearables/alerts/{str(uuid.uuid4())}/dismiss")
        assert resp.status_code in (401, 403)


# ── billing_status enum constraint ────────────────────────────────��───────────

class TestBillingStatusEnum:
    """Test that ClinicalSession.billing_status enforces the Enum constraint."""

    def _make_patient_and_clinician(self) -> tuple[str, str]:
        """Seed a Patient directly and return (patient_id, clinician_id)."""
        db: Session = SessionLocal()
        try:
            clin_id = f"clin-{uuid.uuid4().hex[:8]}"
            p = Patient(
                id=str(uuid.uuid4()),
                clinician_id=clin_id,
                first_name="Billing",
                last_name="Test",
                dob="1980-01-01",
                created_at=datetime.now(timezone.utc),
                updated_at=datetime.now(timezone.utc),
            )
            db.add(p)
            db.commit()
            return p.id, clin_id
        finally:
            db.close()

    def _make_session(self, patient_id: str, clinician_id: str, billing_status: str) -> ClinicalSession:
        return ClinicalSession(
            id=str(uuid.uuid4()),
            patient_id=patient_id,
            clinician_id=clinician_id,
            scheduled_at=datetime.now(timezone.utc).isoformat(),
            billing_status=billing_status,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )

    @pytest.mark.parametrize("status", ["unbilled", "billed", "paid"])
    def test_valid_billing_statuses_accepted(self, status: str) -> None:
        patient_id, clin_id = self._make_patient_and_clinician()
        db: Session = SessionLocal()
        try:
            session = self._make_session(patient_id, clin_id, status)
            db.add(session)
            db.commit()
            fetched = db.query(ClinicalSession).filter_by(id=session.id).first()
            assert fetched is not None
            assert fetched.billing_status == status
        finally:
            db.close()

    def test_invalid_billing_status_rejected_by_orm(self) -> None:
        """Verify that the Enum type raises an error for an invalid value."""
        patient_id, clin_id = self._make_patient_and_clinician()
        db: Session = SessionLocal()
        try:
            session = self._make_session(patient_id, clin_id, "invoiced")
            db.add(session)
            with pytest.raises(Exception):
                db.flush()  # flush to trigger constraint check before commit
        finally:
            db.rollback()
            db.close()

    def test_default_billing_status_is_unbilled(self) -> None:
        patient_id, clin_id = self._make_patient_and_clinician()
        db: Session = SessionLocal()
        try:
            session = ClinicalSession(
                id=str(uuid.uuid4()),
                patient_id=patient_id,
                clinician_id=clin_id,
                scheduled_at=datetime.now(timezone.utc).isoformat(),
                created_at=datetime.now(timezone.utc),
                updated_at=datetime.now(timezone.utc),
            )
            db.add(session)
            db.commit()
            fetched = db.query(ClinicalSession).filter_by(id=session.id).first()
            assert fetched.billing_status == "unbilled"
        finally:
            db.close()


# ── H12: reviewer assignment persistence ──────────────────────────��───────────

class TestReviewerAssignment:
    """Reviewer assignment persists via PATCH /api/v1/review-queue/{id}/assign."""

    def _create_course_and_queue_item(
        self, client: TestClient, token: str
    ) -> tuple[str, str]:
        """Create a patient + course via API; return (patient_id, review_item_id)."""
        patient_id = _create_patient_api(client, token)
        # POST a treatment course — this also pushes a review queue item
        resp = client.post(
            "/api/v1/treatment-courses",
            json={"patient_id": patient_id, "protocol_id": "PRO-001"},
            headers=_auth(token),
        )
        assert resp.status_code == 201, resp.text
        course_id = resp.json()["id"]

        # Fetch the review queue item created for this course
        rq = client.get("/api/v1/review-queue", headers=_auth(token))
        assert rq.status_code == 200, rq.text
        items = rq.json().get("items", [])
        item = next((i for i in items if i.get("target_id") == course_id), None)
        assert item is not None, f"No review queue item found for course {course_id}"
        return patient_id, item["id"]

    def test_assign_reviewer_persists_across_reload(self, client: TestClient) -> None:
        token = _register_clinician(client, "rq_persist")
        _, item_id = self._create_course_and_queue_item(client, token)

        # Assign a reviewer
        resp = client.patch(
            f"/api/v1/review-queue/{item_id}/assign",
            json={"assigned_to": "reviewer-dr-chen"},
            headers=_auth(token),
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["assigned_to"] == "reviewer-dr-chen"

        # Re-fetch the review queue and confirm persistence
        rq = client.get("/api/v1/review-queue", headers=_auth(token))
        items = rq.json().get("items", [])
        saved = next((i for i in items if i["id"] == item_id), None)
        assert saved is not None
        assert saved["assigned_to"] == "reviewer-dr-chen"

    def test_assign_reviewer_can_unassign(self, client: TestClient) -> None:
        token = _register_clinician(client, "rq_unassign")
        _, item_id = self._create_course_and_queue_item(client, token)

        client.patch(
            f"/api/v1/review-queue/{item_id}/assign",
            json={"assigned_to": "reviewer-xyz"},
            headers=_auth(token),
        )
        resp = client.patch(
            f"/api/v1/review-queue/{item_id}/assign",
            json={"assigned_to": None},
            headers=_auth(token),
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["assigned_to"] is None

    def test_assign_reviewer_not_found_returns_404(self, client: TestClient) -> None:
        token = _register_clinician(client, "rq_404")
        resp = client.patch(
            f"/api/v1/review-queue/{str(uuid.uuid4())}/assign",
            json={"assigned_to": "some-reviewer"},
            headers=_auth(token),
        )
        assert resp.status_code == 404, resp.text

    def test_assign_reviewer_requires_auth(self, client: TestClient) -> None:
        resp = client.patch(
            f"/api/v1/review-queue/{str(uuid.uuid4())}/assign",
            json={"assigned_to": "reviewer"},
        )
        assert resp.status_code in (401, 403)

    def test_assign_reviewer_cross_clinician_forbidden(self, client: TestClient) -> None:
        token_owner = _register_clinician(client, "rq_owner")
        token_other = _register_clinician(client, "rq_other")
        _, item_id = self._create_course_and_queue_item(client, token_owner)

        # Another clinician tries to assign reviewer on owner's item — must be 403
        resp = client.patch(
            f"/api/v1/review-queue/{item_id}/assign",
            json={"assigned_to": "attacker"},
            headers=_auth(token_other),
        )
        assert resp.status_code == 403, resp.text


# ── H25: patient portal courses — session_count correctness ──────────────────
# Uses the demo patient token (bearer patient-demo-token) which resolves to
# a Patient record with email "patient@demo.com".  We seed that record and a
# treatment course directly in the DB to avoid the activate-patient flow
# (which has a pre-existing timezone comparison bug).

_DEMO_PATIENT_HEADERS = {"Authorization": "Bearer patient-demo-token"}
_DEMO_PATIENT_EMAIL = "patient@demo.com"


@pytest.fixture
def h25_patient_and_course() -> tuple[str, str]:
    """Seed demo patient + course directly; return (patient_id, course_id)."""
    db: Session = SessionLocal()
    try:
        clin_id = "actor-clinician-demo"
        patient_id = str(uuid.uuid4())
        p = Patient(
            id=patient_id,
            clinician_id=clin_id,
            first_name="Demo",
            last_name="Portal",
            dob="1990-01-01",
            email=_DEMO_PATIENT_EMAIL,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        db.add(p)
        db.flush()

        course_id = str(uuid.uuid4())
        c = TreatmentCourse(
            id=course_id,
            patient_id=patient_id,
            clinician_id=clin_id,
            protocol_id="PRO-001",
            condition_slug="depression",
            modality_slug="tdcs",
            status="active",
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        db.add(c)
        db.commit()
        return patient_id, course_id
    finally:
        db.close()


class TestPortalCourseSessionCount:
    def _seed_sessions(self, course_id: str, count: int) -> None:
        db: Session = SessionLocal()
        try:
            sid = str(uuid.uuid4())
            for _ in range(count):
                db.add(DeliveredSessionParameters(
                    id=str(uuid.uuid4()),
                    session_id=sid,
                    course_id=course_id,
                ))
            db.commit()
        finally:
            db.close()

    def test_session_count_zero_with_no_sessions(
        self,
        client: TestClient,
        h25_patient_and_course: tuple[str, str],
    ) -> None:
        _, course_id = h25_patient_and_course
        resp = client.get("/api/v1/patient-portal/courses", headers=_DEMO_PATIENT_HEADERS)
        assert resp.status_code == 200, resp.text
        courses = resp.json()
        matched = [c for c in courses if c["id"] == course_id]
        assert len(matched) == 1
        assert matched[0]["session_count"] == 0

    def test_session_count_reflects_seeded_sessions(
        self,
        client: TestClient,
        h25_patient_and_course: tuple[str, str],
    ) -> None:
        _, course_id = h25_patient_and_course
        self._seed_sessions(course_id, 3)

        resp = client.get("/api/v1/patient-portal/courses", headers=_DEMO_PATIENT_HEADERS)
        assert resp.status_code == 200, resp.text
        courses = resp.json()
        matched = [c for c in courses if c["id"] == course_id]
        assert len(matched) == 1
        assert matched[0]["session_count"] == 3
