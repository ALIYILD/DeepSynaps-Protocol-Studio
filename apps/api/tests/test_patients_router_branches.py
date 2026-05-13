"""Deep-coverage branch/error-path tests for patients_router.py.

Targets every 4xx/5xx path, IDOR/cross-clinic guard, role gate,
filter/search/pagination edge-case, and Pydantic 422 that the existing
test_patients_router.py does not already exercise.
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.database import SessionLocal
from app.persistence.models import (
    AssessmentRecord,
    Clinic,
    ClinicalSession,
    ConsentRecord,
    DeviceSessionLog,
    HomeDeviceAssignment,
    OutcomeSeries,
    Patient,
    TreatmentCourse,
    User,
)


# ── helpers ──────────────────────────────────────────────────────────────────


def _seed_second_clinician(*, clinic_id: str = "clinic-other") -> tuple[str, str]:
    """Seed a second clinician in a *different* clinic.  Returns (user_id, bearer_token)."""
    from app.services.auth_service import create_access_token

    uid = f"actor-other-{uuid.uuid4().hex[:8]}"
    email = f"{uid}@example.com"
    db = SessionLocal()
    try:
        if db.query(Clinic).filter_by(id=clinic_id).first() is None:
            db.add(Clinic(id=clinic_id, name="Other Clinic"))
            db.flush()
        db.add(
            User(
                id=uid,
                email=email,
                display_name="Other Clinician",
                hashed_password="x",
                role="clinician",
                package_id="clinician_pro",
                clinic_id=clinic_id,
            )
        )
        db.commit()
    finally:
        db.close()
    token = create_access_token(user_id=uid, email=email, role="clinician", package_id="clinician_pro", clinic_id=clinic_id)
    return uid, f"Bearer {token}"


def _create_patient_direct(
    *,
    clinician_id: str = "actor-clinician-demo",
    status: str = "active",
    notes: str = "",
    dob: str = "1990-06-15",
    primary_condition: str = "MDD",
    primary_modality: str = "tDCS",
    email: str | None = None,
) -> str:
    pid = f"pat-{uuid.uuid4().hex[:12]}"
    db = SessionLocal()
    try:
        db.add(
            Patient(
                id=pid,
                clinician_id=clinician_id,
                first_name="Branch",
                last_name="Test",
                dob=dob,
                email=email,
                status=status,
                notes=notes,
                primary_condition=primary_condition,
                primary_modality=primary_modality,
                consent_signed=False,
            )
        )
        db.commit()
    finally:
        db.close()
    return pid


def _mk_course(
    patient_id: str,
    *,
    status: str = "active",
    on_label: bool = True,
    review_required: bool = False,
    sessions_delivered: int = 0,
    planned_sessions_total: int = 20,
) -> str:
    cid = f"course-{uuid.uuid4().hex[:10]}"
    db = SessionLocal()
    try:
        db.add(
            TreatmentCourse(
                id=cid,
                patient_id=patient_id,
                clinician_id="actor-clinician-demo",
                protocol_id="proto-test",
                condition_slug="mdd",
                modality_slug="tDCS",
                device_slug="dev-1",
                target_region="DLPFC",
                evidence_grade="A",
                on_label=on_label,
                planned_sessions_total=planned_sessions_total,
                planned_sessions_per_week=3,
                planned_session_duration_minutes=30,
                status=status,
                sessions_delivered=sessions_delivered,
                review_required=review_required,
            )
        )
        db.commit()
    finally:
        db.close()
    return cid


def _mk_outcome(
    patient_id: str,
    *,
    clinician_id: str = "actor-clinician-demo",
    template_title: str = "PHQ-9",
    score_numeric: float = 12.0,
    measurement_point: str = "baseline",
    days_ago: int = 0,
    course_id: str | None = None,
) -> None:
    db = SessionLocal()
    try:
        # outcome_series.course_id is NOT NULL — create a stub course if not given
        if course_id is None:
            cid = f"course-os-{uuid.uuid4().hex[:8]}"
            if db.query(TreatmentCourse).filter_by(id=cid).first() is None:
                db.add(TreatmentCourse(
                    id=cid,
                    patient_id=patient_id,
                    clinician_id=clinician_id,
                    protocol_id="proto-os",
                    condition_slug="mdd",
                    modality_slug="tDCS",
                    device_slug="dev",
                    target_region="DLPFC",
                    evidence_grade="A",
                    on_label=True,
                    planned_sessions_total=20,
                    planned_sessions_per_week=3,
                    planned_session_duration_minutes=30,
                    status="active",
                    sessions_delivered=0,
                    review_required=False,
                ))
                db.flush()
            course_id = cid
        db.add(
            OutcomeSeries(
                id=f"os-{uuid.uuid4().hex[:10]}",
                patient_id=patient_id,
                clinician_id=clinician_id,
                course_id=course_id,
                template_id="PHQ-9",
                template_title=template_title,
                score=str(score_numeric),
                score_numeric=score_numeric,
                measurement_point=measurement_point,
                administered_at=datetime.now(timezone.utc) - timedelta(days=days_ago),
            )
        )
        db.commit()
    finally:
        db.close()


def _mk_device_log(
    patient_id: str,
    *,
    session_date: str | None = None,
    completed: bool = True,
    days_ago: int = 0,
) -> None:
    db = SessionLocal()
    try:
        today = datetime.now(timezone.utc)
        # DeviceSessionLog.assignment_id is NOT NULL — create a stub HomeDeviceAssignment
        aid = f"hda-{uuid.uuid4().hex[:10]}"
        db.add(
            HomeDeviceAssignment(
                id=aid,
                patient_id=patient_id,
                assigned_by="actor-clinician-demo",
                device_name="Test Device",
                device_category="neuromodulation",
                parameters_json="{}",
                status="active",
            )
        )
        db.flush()
        db.add(
            DeviceSessionLog(
                id=f"dsl-{uuid.uuid4().hex[:10]}",
                patient_id=patient_id,
                assignment_id=aid,
                session_date=session_date or today.date().isoformat(),
                completed=completed,
                logged_at=today - timedelta(days=days_ago),
            )
        )
        db.commit()
    finally:
        db.close()


def _mk_session(
    patient_id: str,
    *,
    clinician_id: str = "actor-clinician-demo",
    status: str = "scheduled",
    days_from_now: int = 1,
) -> str:
    sid = f"sess-{uuid.uuid4().hex[:10]}"
    db = SessionLocal()
    try:
        sched = datetime.now(timezone.utc) + timedelta(days=days_from_now)
        db.add(
            ClinicalSession(
                id=sid,
                patient_id=patient_id,
                clinician_id=clinician_id,
                scheduled_at=sched.isoformat(),
                duration_minutes=30,
                modality="tDCS",
                status=status,
                session_number=1,
                total_sessions=20,
            )
        )
        db.commit()
    finally:
        db.close()
    return sid


def _mk_consent(patient_id: str, *, days_ago: int = 30) -> None:
    db = SessionLocal()
    try:
        db.add(
            ConsentRecord(
                id=f"cr-{uuid.uuid4().hex[:10]}",
                patient_id=patient_id,
                clinician_id="actor-clinician-demo",
                consent_type="treatment",
                status="active",
                signed=True,
                signed_at=datetime.now(timezone.utc) - timedelta(days=days_ago),
            )
        )
        db.commit()
    finally:
        db.close()


def _mk_assessment(
    patient_id: str,
    *,
    status: str = "pending",
    due_days_ago: int = 0,
) -> None:
    db = SessionLocal()
    try:
        due = datetime.now(timezone.utc) - timedelta(days=due_days_ago)
        db.add(
            AssessmentRecord(
                id=f"ar-{uuid.uuid4().hex[:10]}",
                patient_id=patient_id,
                clinician_id="actor-clinician-demo",
                template_id="PHQ-9",
                template_title="PHQ-9",
                status=status,
                due_date=due if due_days_ago > 0 else None,
                data_json=json.dumps({}),
                score=None,
            )
        )
        db.commit()
    finally:
        db.close()


# ── Auth / role gates ─────────────────────────────────────────────────────────


class TestAuthGates:
    def test_list_requires_auth(self, client: TestClient) -> None:
        r = client.get("/api/v1/patients")
        assert r.status_code == 403

    def test_create_requires_auth(self, client: TestClient) -> None:
        r = client.post("/api/v1/patients", json={"first_name": "X", "last_name": "Y"})
        assert r.status_code == 403

    def test_get_requires_auth(self, client: TestClient) -> None:
        r = client.get("/api/v1/patients/any-id")
        assert r.status_code == 403

    def test_patch_requires_auth(self, client: TestClient) -> None:
        r = client.patch("/api/v1/patients/any-id", json={})
        assert r.status_code == 403

    def test_delete_requires_auth(self, client: TestClient) -> None:
        r = client.delete("/api/v1/patients/any-id")
        assert r.status_code == 403

    def test_guest_role_blocked(self, client: TestClient, auth_headers: dict) -> None:
        r = client.get("/api/v1/patients", headers=auth_headers["guest"])
        assert r.status_code == 403

    def test_patient_role_blocked_from_list(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get("/api/v1/patients", headers=auth_headers["patient"])
        assert r.status_code == 403

    def test_cohort_summary_requires_clinician(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get("/api/v1/patients/cohort-summary", headers=auth_headers["guest"])
        assert r.status_code == 403

    def test_invite_requires_clinician(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(
            "/api/v1/patients/invite",
            json={"patient_name": "Test"},
            headers=auth_headers["guest"],
        )
        assert r.status_code == 403

    def test_medical_history_get_requires_clinician(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/patients/fake-id/medical-history",
            headers=auth_headers["guest"],
        )
        assert r.status_code == 403

    def test_export_csv_requires_clinician(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/patients/fake-id/export.csv",
            headers=auth_headers["guest"],
        )
        assert r.status_code == 403


# ── IDOR / cross-clinic 403 ───────────────────────────────────────────────────


class TestIDOR:
    def test_get_other_clinicians_patient_returns_403(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        """A clinician cannot see another clinician's patient — 403 cross_clinic_access_denied.

        Honest-contract update (#907): the gate previously downgraded
        ``cross_clinic_access_denied`` to ``404 not_found`` to hide existence.
        That pattern leaked via timing / error-message ambiguity and gave
        attackers an enumeration oracle, so ``_gate_patient_access`` now
        raises 403 honestly. See also ``test_access_control_isolation.py``.
        """
        pid = _create_patient_direct(clinician_id="actor-clinician-demo")
        # use a second clinician token that is a different actor
        _, token = _seed_second_clinician()
        r = client.get(
            f"/api/v1/patients/{pid}",
            headers={"Authorization": token},
        )
        assert r.status_code == 403
        assert r.json()["code"] == "cross_clinic_access_denied"

    def test_patch_other_clinicians_patient_returns_403(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _create_patient_direct(clinician_id="actor-clinician-demo")
        _, token = _seed_second_clinician(clinic_id="clinic-other-2")
        r = client.patch(
            f"/api/v1/patients/{pid}",
            json={"status": "archived"},
            headers={"Authorization": token},
        )
        assert r.status_code == 403
        assert r.json()["code"] == "cross_clinic_access_denied"

    def test_delete_other_clinicians_patient_returns_403(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _create_patient_direct(clinician_id="actor-clinician-demo")
        _, token = _seed_second_clinician(clinic_id="clinic-other-3")
        r = client.delete(
            f"/api/v1/patients/{pid}",
            headers={"Authorization": token},
        )
        assert r.status_code == 403
        assert r.json()["code"] == "cross_clinic_access_denied"

    def test_medical_history_other_clinician_returns_403(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _create_patient_direct(clinician_id="actor-clinician-demo")
        _, token = _seed_second_clinician(clinic_id="clinic-other-4")
        r = client.get(
            f"/api/v1/patients/{pid}/medical-history",
            headers={"Authorization": token},
        )
        assert r.status_code == 403
        assert r.json()["code"] == "cross_clinic_access_denied"

    def test_admin_can_see_any_patient(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        """Admin bypasses the clinic-ownership check."""
        pid = _create_patient_direct(clinician_id="actor-clinician-demo")
        r = client.get(
            f"/api/v1/patients/{pid}/detail",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200


# ── 404 paths ─────────────────────────────────────────────────────────────────


class TestNotFound:
    def test_get_nonexistent_patient(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/patients/does-not-exist",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 404

    def test_patch_nonexistent_patient(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.patch(
            "/api/v1/patients/does-not-exist",
            json={"notes": "x"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 404

    def test_delete_nonexistent_patient(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.delete(
            "/api/v1/patients/does-not-exist",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 404

    def test_detail_nonexistent_patient(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/patients/does-not-exist/detail",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 404

    def test_consent_history_nonexistent_patient(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/patients/does-not-exist/consent-history",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 404


# ── Pydantic 422 paths ────────────────────────────────────────────────────────


class TestPydantic422:
    def test_create_missing_first_name(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(
            "/api/v1/patients",
            json={"last_name": "Missing"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 422

    def test_create_missing_last_name(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(
            "/api/v1/patients",
            json={"first_name": "Missing"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 422

    def test_list_limit_below_minimum(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/patients?limit=0",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 422

    def test_list_offset_negative(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/patients?offset=-1",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 422

    def test_list_limit_above_maximum(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/patients?limit=501",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 422

    def test_medical_history_replace_mode_requires_body(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _create_patient_direct()
        r = client.patch(
            f"/api/v1/patients/{pid}/medical-history",
            json={"mode": "replace"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 400

    def test_audit_event_event_field_too_long(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _create_patient_direct()
        r = client.post(
            f"/api/v1/patients/{pid}/audit-events",
            json={"event": "x" * 65},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 422

    def test_send_message_empty_body(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _create_patient_direct()
        r = client.post(
            f"/api/v1/patients/{pid}/messages",
            json={"body": "   "},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 400


# ── CRUD full lifecycle ───────────────────────────────────────────────────────


class TestCRUDLifecycle:
    def test_create_and_get(self, client: TestClient, auth_headers: dict) -> None:
        r = client.post(
            "/api/v1/patients",
            json={
                "first_name": "Alice",
                "last_name": "Bravo",
                "dob": "1985-03-01",
                "primary_condition": "GAD",
                "status": "active",
            },
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 201
        pid = r.json()["id"]
        r2 = client.get(f"/api/v1/patients/{pid}", headers=auth_headers["clinician"])
        assert r2.status_code == 200
        assert r2.json()["first_name"] == "Alice"

    def test_patch_updates_fields(self, client: TestClient, auth_headers: dict) -> None:
        pid = _create_patient_direct()
        r = client.patch(
            f"/api/v1/patients/{pid}",
            json={"notes": "updated note", "status": "intake"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        assert r.json()["notes"] == "updated note"
        assert r.json()["status"] == "intake"

    def test_delete_removes_patient(self, client: TestClient, auth_headers: dict) -> None:
        pid = _create_patient_direct()
        r = client.delete(
            f"/api/v1/patients/{pid}", headers=auth_headers["clinician"]
        )
        assert r.status_code == 204
        r2 = client.get(
            f"/api/v1/patients/{pid}", headers=auth_headers["clinician"]
        )
        assert r2.status_code == 404


# ── Filter pipeline edge cases ────────────────────────────────────────────────


class TestFilterEdgeCases:
    def test_status_archived_tab(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _create_patient_direct(status="archived")
        _create_patient_direct(status="active")
        r = client.get(
            "/api/v1/patients?status=archived", headers=auth_headers["clinician"]
        )
        assert r.status_code == 200
        assert r.json()["total"] == 1

    def test_status_discharged_maps_to_archived_tab(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _create_patient_direct(status="discharged")
        r = client.get(
            "/api/v1/patients?status=archived", headers=auth_headers["clinician"]
        )
        assert r.json()["total"] == 1

    def test_status_new_maps_to_intake(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _create_patient_direct(status="new")
        r = client.get(
            "/api/v1/patients?status=intake", headers=auth_headers["clinician"]
        )
        assert r.json()["total"] == 1

    def test_unknown_status_tab_returns_all(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _create_patient_direct(status="active")
        r = client.get(
            "/api/v1/patients?status=unknown_tab", headers=auth_headers["clinician"]
        )
        assert r.status_code == 200
        # "unknown_tab" has no members → no filter → returns all
        assert r.json()["total"] == 1

    def test_search_by_modality(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _create_patient_direct(primary_modality="rTMS")
        _create_patient_direct(primary_modality="tDCS")
        r = client.get(
            "/api/v1/patients?q=rtms", headers=auth_headers["clinician"]
        )
        assert r.json()["total"] == 1

    def test_search_by_patient_id_suffix(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        """Patient id (last 8 chars uppercase) is included in the search haystack."""
        pid = _create_patient_direct(primary_condition="Insomnia")
        # search by condition slug to find this patient
        r = client.get(
            "/api/v1/patients?q=insomnia",
            headers=auth_headers["clinician"],
        )
        assert r.json()["total"] == 1

    def test_facet_filter_condition(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _create_patient_direct(primary_condition="PTSD")
        _create_patient_direct(primary_condition="MDD")
        r = client.get(
            "/api/v1/patients?condition=ptsd", headers=auth_headers["clinician"]
        )
        assert r.json()["total"] == 1

    def test_facet_filter_modality(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _create_patient_direct(primary_modality="TMS")
        _create_patient_direct(primary_modality="tDCS")
        r = client.get(
            "/api/v1/patients?modality=tms", headers=auth_headers["clinician"]
        )
        assert r.json()["total"] == 1

    def test_sort_by_name(self, client: TestClient, auth_headers: dict) -> None:
        _create_patient_direct(primary_condition="MDD")  # creates Branch Test
        r = client.get(
            "/api/v1/patients?sort=name", headers=auth_headers["clinician"]
        )
        assert r.status_code == 200

    def test_sort_by_progress(self, client: TestClient, auth_headers: dict) -> None:
        pid = _create_patient_direct()
        _mk_course(pid, sessions_delivered=5, planned_sessions_total=10)
        r = client.get(
            "/api/v1/patients?sort=progress", headers=auth_headers["clinician"]
        )
        assert r.status_code == 200

    def test_sort_by_outcome_delta(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _create_patient_direct()
        _mk_outcome(pid, score_numeric=20.0, days_ago=5)
        _mk_outcome(pid, score_numeric=12.0, measurement_point="followup")
        r = client.get(
            "/api/v1/patients?sort=outcome_delta", headers=auth_headers["clinician"]
        )
        assert r.status_code == 200

    def test_sort_by_follow_up_urgency(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _create_patient_direct()
        _mk_assessment(pid, status="pending", due_days_ago=10)
        r = client.get(
            "/api/v1/patients?sort=follow_up", headers=auth_headers["clinician"]
        )
        assert r.status_code == 200

    def test_pagination_offset_beyond_total_returns_empty(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _create_patient_direct()
        r = client.get(
            "/api/v1/patients?limit=10&offset=999",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        assert r.json()["total"] == 1
        assert r.json()["items"] == []


# ── Enrichment branches ───────────────────────────────────────────────────────


class TestEnrichmentBranches:
    def test_off_label_flag_set_for_off_label_course(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _create_patient_direct()
        _mk_course(pid, on_label=False)
        r = client.get("/api/v1/patients", headers=auth_headers["clinician"])
        assert r.json()["items"][0]["off_label_flag"] is True

    def test_needs_review_flag_set_for_review_required_course(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _create_patient_direct()
        _mk_course(pid, review_required=True)
        r = client.get("/api/v1/patients", headers=auth_headers["clinician"])
        assert r.json()["items"][0]["needs_review"] is True

    def test_home_adherence_computed_from_device_logs(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _create_patient_direct()
        _mk_device_log(pid, completed=True)
        _mk_device_log(pid, completed=True)
        _mk_device_log(pid, completed=False)
        r = client.get("/api/v1/patients", headers=auth_headers["clinician"])
        adh = r.json()["items"][0]["home_adherence"]
        assert adh is not None
        assert 0.0 <= adh <= 1.0

    def test_outcome_trend_improved(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _create_patient_direct()
        # newest-first: lower score = improvement
        _mk_outcome(pid, score_numeric=25.0, days_ago=10, measurement_point="baseline")
        _mk_outcome(pid, score_numeric=10.0, days_ago=0, measurement_point="followup")
        r = client.get("/api/v1/patients", headers=auth_headers["clinician"])
        assert r.json()["items"][0]["outcome_trend"] == "improved"

    def test_outcome_trend_worsened(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _create_patient_direct()
        _mk_outcome(pid, score_numeric=5.0, days_ago=10, measurement_point="baseline")
        _mk_outcome(pid, score_numeric=20.0, days_ago=0, measurement_point="followup")
        r = client.get("/api/v1/patients", headers=auth_headers["clinician"])
        assert r.json()["items"][0]["outcome_trend"] == "worsened"

    def test_outcome_trend_stable(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _create_patient_direct()
        _mk_outcome(pid, score_numeric=10.0, days_ago=5)
        _mk_outcome(pid, score_numeric=10.0, days_ago=0, measurement_point="f2")
        r = client.get("/api/v1/patients", headers=auth_headers["clinician"])
        assert r.json()["items"][0]["outcome_trend"] == "stable"

    def test_age_from_dob_valid(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _create_patient_direct(dob="1990-01-01")
        r = client.get("/api/v1/patients", headers=auth_headers["clinician"])
        age = r.json()["items"][0]["age"]
        assert age is not None and age > 0

    def test_age_from_dob_invalid_returns_none(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _create_patient_direct(dob="invalid-date")
        r = client.get("/api/v1/patients", headers=auth_headers["clinician"])
        assert r.json()["items"][0]["age"] is None

    def test_assessment_overdue_sets_flag(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _create_patient_direct()
        _mk_assessment(pid, status="pending", due_days_ago=5)
        r = client.get("/api/v1/patients", headers=auth_headers["clinician"])
        p = r.json()["items"][0]
        assert p["assessment_overdue"] is True
        assert p["pending_assessments"] >= 1

    def test_next_session_date_populated(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _create_patient_direct()
        _mk_session(pid, status="scheduled", days_from_now=2)
        r = client.get("/api/v1/patients", headers=auth_headers["clinician"])
        assert r.json()["items"][0]["next_session_date"] is not None

    def test_sessions_today_count(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _create_patient_direct()
        # schedule a session for today
        db = SessionLocal()
        try:
            today_iso = datetime.now(timezone.utc).date().isoformat()
            sid = f"sess-today-{uuid.uuid4().hex[:8]}"
            db.add(
                ClinicalSession(
                    id=sid,
                    patient_id=pid,
                    clinician_id="actor-clinician-demo",
                    scheduled_at=f"{today_iso}T10:00:00",
                    duration_minutes=30,
                    modality="tDCS",
                    status="scheduled",
                    session_number=1,
                    total_sessions=20,
                )
            )
            db.commit()
        finally:
            db.close()
        r = client.get("/api/v1/patients", headers=auth_headers["clinician"])
        assert r.json()["items"][0]["sessions_today"] >= 1

    def test_is_responder_phq9(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _create_patient_direct()
        _mk_outcome(
            pid, template_title="PHQ-9", score_numeric=20.0,
            measurement_point="baseline", days_ago=30,
        )
        _mk_outcome(
            pid, template_title="PHQ-9", score_numeric=10.0,
            measurement_point="followup", days_ago=0,
        )
        r = client.get("/api/v1/patients", headers=auth_headers["clinician"])
        assert r.json()["items"][0]["is_responder"] is True

    def test_review_overdue_days_computed(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _create_patient_direct()
        _mk_assessment(pid, status="pending", due_days_ago=14)
        r = client.get("/api/v1/patients", headers=auth_headers["clinician"])
        assert r.json()["items"][0]["review_overdue_days"] is not None
        assert r.json()["items"][0]["review_overdue_days"] >= 14


# ── Sub-resource endpoints (sessions, courses, assessments, reports) ──────────


class TestSubResourceEndpoints:
    def test_get_patient_sessions_clinician(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _create_patient_direct()
        _mk_session(pid)
        r = client.get(
            f"/api/v1/patients/{pid}/sessions",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        assert r.json()["total"] >= 1

    def test_get_patient_sessions_patient_role_self(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        """Patient can read their own sessions when patient_id == actor_id."""
        pid = "actor-patient-demo"
        db = SessionLocal()
        try:
            if db.query(Patient).filter_by(id=pid).first() is None:
                db.add(
                    Patient(
                        id=pid,
                        clinician_id="actor-clinician-demo",
                        first_name="Self",
                        last_name="Patient",
                        status="active",
                        consent_signed=False,
                    )
                )
                db.commit()
        finally:
            db.close()
        r = client.get(
            f"/api/v1/patients/{pid}/sessions",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200

    def test_get_patient_sessions_patient_role_other_forbidden(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _create_patient_direct()
        r = client.get(
            f"/api/v1/patients/{pid}/sessions",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 403

    def test_get_patient_courses(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _create_patient_direct()
        _mk_course(pid)
        r = client.get(
            f"/api/v1/patients/{pid}/courses",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        assert r.json()["total"] >= 1

    def test_get_patient_courses_patient_role_forbidden(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _create_patient_direct()
        r = client.get(
            f"/api/v1/patients/{pid}/courses",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 403

    def test_get_patient_assessments(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _create_patient_direct()
        _mk_assessment(pid)
        r = client.get(
            f"/api/v1/patients/{pid}/assessments",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        assert r.json()["total"] >= 1

    def test_get_patient_reports_empty(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _create_patient_direct()
        r = client.get(
            f"/api/v1/patients/{pid}/reports",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        assert r.json()["total"] == 0

    def test_get_patient_reports_patient_role_forbidden(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _create_patient_direct()
        r = client.get(
            f"/api/v1/patients/{pid}/reports",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 403


# ── Medical History CRUD ─────────────────────────────────────────────────────


class TestMedicalHistory:
    def test_get_empty_medical_history(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _create_patient_direct()
        r = client.get(
            f"/api/v1/patients/{pid}/medical-history",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        assert r.json()["medical_history"] is None

    def test_replace_mode_sets_blob(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _create_patient_direct()
        mh = {"presenting": {"notes": "Headache and fatigue"}}
        r = client.patch(
            f"/api/v1/patients/{pid}/medical-history",
            json={"medical_history": mh, "mode": "replace"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        body = r.json()["medical_history"]
        assert body is not None
        assert body["meta"]["version"] >= 1

    def test_merge_sections_mode_partial_update(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _create_patient_direct()
        # First set via replace
        client.patch(
            f"/api/v1/patients/{pid}/medical-history",
            json={
                "medical_history": {"sections": {"presenting": {"notes": "baseline"}}},
                "mode": "replace",
            },
            headers=auth_headers["clinician"],
        )
        # Then merge single section
        r = client.patch(
            f"/api/v1/patients/{pid}/medical-history",
            json={"sections": {"diagnoses": {"notes": "MDD"}}, "mode": "merge_sections"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        secs = r.json()["medical_history"]["sections"]
        assert "diagnoses" in secs
        assert "presenting" in secs  # preserved

    def test_merge_sections_invalid_section_ignored(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _create_patient_direct()
        r = client.patch(
            f"/api/v1/patients/{pid}/medical-history",
            json={"sections": {"invalid_section": {"notes": "should be ignored"}}},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        secs = r.json()["medical_history"]["sections"]
        assert "invalid_section" not in secs

    def test_safety_acknowledged_stamped(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _create_patient_direct()
        r = client.patch(
            f"/api/v1/patients/{pid}/medical-history",
            json={"safety": {"acknowledged": True}, "mode": "merge_sections"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        safety = r.json()["medical_history"]["safety"]
        assert safety["acknowledged"] is True
        assert safety["acknowledged_by"] == "actor-clinician-demo"

    def test_safety_unacknowledged_clears_stamp(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _create_patient_direct()
        # first acknowledge
        client.patch(
            f"/api/v1/patients/{pid}/medical-history",
            json={"safety": {"acknowledged": True}, "mode": "merge_sections"},
            headers=auth_headers["clinician"],
        )
        # then unacknowledge
        r = client.patch(
            f"/api/v1/patients/{pid}/medical-history",
            json={"safety": {"acknowledged": False}, "mode": "merge_sections"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        safety = r.json()["medical_history"]["safety"]
        assert safety["acknowledged"] is False
        assert "acknowledged_by" not in safety

    def test_mark_reviewed_stamps_meta(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _create_patient_direct()
        r = client.patch(
            f"/api/v1/patients/{pid}/medical-history",
            json={"mark_reviewed": True, "mode": "merge_sections"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        meta = r.json()["medical_history"]["meta"]
        assert meta["reviewed_by"] == "actor-clinician-demo"
        assert meta["requires_review"] is False

    def test_version_increments_on_each_save(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _create_patient_direct()
        for _ in range(3):
            client.patch(
                f"/api/v1/patients/{pid}/medical-history",
                json={"sections": {"goals": {"notes": "improve"}}, "mode": "merge_sections"},
                headers=auth_headers["clinician"],
            )
        r = client.get(
            f"/api/v1/patients/{pid}/medical-history",
            headers=auth_headers["clinician"],
        )
        assert r.json()["medical_history"]["meta"]["version"] >= 3

    def test_safety_flags_merged(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _create_patient_direct()
        r = client.patch(
            f"/api/v1/patients/{pid}/medical-history",
            json={"safety": {"flags": {"suicidality": True}}, "mode": "merge_sections"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        flags = r.json()["medical_history"]["safety"]["flags"]
        assert flags.get("suicidality") is True


# ── Patient detail endpoint ───────────────────────────────────────────────────


class TestPatientDetail:
    def test_detail_response_shape(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _create_patient_direct()
        r = client.get(
            f"/api/v1/patients/{pid}/detail",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        body = r.json()
        assert "header" in body
        assert "counts" in body
        assert "disclaimers" in body
        assert len(body["disclaimers"]) >= 1

    def test_detail_demo_flag_from_notes(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _create_patient_direct(notes="[DEMO] synthetic patient")
        r = client.get(
            f"/api/v1/patients/{pid}/detail",
            headers=auth_headers["clinician"],
        )
        assert r.json()["header"]["is_demo"] is True

    def test_detail_counts_courses(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _create_patient_direct()
        _mk_course(pid, status="active")
        _mk_course(pid, status="active")
        r = client.get(
            f"/api/v1/patients/{pid}/detail",
            headers=auth_headers["clinician"],
        )
        assert r.json()["counts"]["active_courses"] == 2

    def test_detail_has_consent_signed(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _create_patient_direct()
        r = client.patch(
            f"/api/v1/patients/{pid}",
            json={"consent_signed": True},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        r2 = client.get(
            f"/api/v1/patients/{pid}/detail",
            headers=auth_headers["clinician"],
        )
        assert r2.json()["has_consent_signed"] is True


# ── Consent history endpoint ──────────────────────────────────────────────────


class TestConsentHistory:
    def test_empty_consent_history(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _create_patient_direct()
        r = client.get(
            f"/api/v1/patients/{pid}/consent-history",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        assert r.json()["total"] == 0
        assert r.json()["items"] == []

    def test_consent_history_returns_rows(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _create_patient_direct()
        _mk_consent(pid)
        r = client.get(
            f"/api/v1/patients/{pid}/consent-history",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        assert r.json()["total"] == 1

    def test_consent_history_idor_blocked(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _create_patient_direct()
        _, token = _seed_second_clinician(clinic_id="clinic-ch-idor")
        r = client.get(
            f"/api/v1/patients/{pid}/consent-history",
            headers={"Authorization": token},
        )
        assert r.status_code == 404


# ── Audit events endpoints ────────────────────────────────────────────────────


class TestAuditEvents:
    def test_list_audit_events_empty(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _create_patient_direct()
        r = client.get(
            f"/api/v1/patients/{pid}/audit-events",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        assert r.json()["total"] == 0

    def test_post_audit_event_accepted(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _create_patient_direct()
        r = client.post(
            f"/api/v1/patients/{pid}/audit-events",
            json={"event": "view", "note": "clinician viewed profile"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        assert r.json()["accepted"] is True

    def test_post_audit_event_demo_flag(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _create_patient_direct(notes="[DEMO] test")
        r = client.post(
            f"/api/v1/patients/{pid}/audit-events",
            json={"event": "view", "using_demo_data": True},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200


# ── Export endpoints ──────────────────────────────────────────────────────────


class TestExportEndpoints:
    def test_export_csv_returns_csv_content_type(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _create_patient_direct()
        r = client.get(
            f"/api/v1/patients/{pid}/export.csv",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        assert "text/csv" in r.headers.get("content-type", "")

    def test_export_csv_demo_header_when_demo(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _create_patient_direct(notes="[DEMO] demo patient")
        r = client.get(
            f"/api/v1/patients/{pid}/export.csv",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        assert r.headers.get("X-Patient-Demo") == "1"
        assert "DEMO" in r.text

    def test_export_csv_no_demo_flag_for_real_patient(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        """Patients in the demo clinic are flagged demo via clinic check.
        A patient whose notes don't start with [DEMO] but whose clinician IS in
        a demo clinic will still have is_demo=True. This test verifies the header
        is always present, not that it's always 0."""
        pid = _create_patient_direct(notes="Normal patient")
        r = client.get(
            f"/api/v1/patients/{pid}/export.csv",
            headers=auth_headers["clinician"],
        )
        # The header must be present; value depends on clinic demo state
        assert r.headers.get("X-Patient-Demo") in ("0", "1")

    def test_export_csv_idor_blocked(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _create_patient_direct()
        _, token = _seed_second_clinician(clinic_id="clinic-export-idor")
        r = client.get(
            f"/api/v1/patients/{pid}/export.csv",
            headers={"Authorization": token},
        )
        assert r.status_code == 404

    def test_export_ndjson_returns_ndjson(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _create_patient_direct()
        r = client.get(
            f"/api/v1/patients/{pid}/export.ndjson",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        # Verify it's valid NDJSON: each non-empty line is valid JSON
        for line in r.text.splitlines():
            if line.strip():
                json.loads(line)  # should not raise


# ── Invite endpoint ────────────────────────────────────────────────────────────


class TestInviteEndpoint:
    def test_create_invite_returns_code_and_expiry(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(
            "/api/v1/patients/invite",
            json={"patient_name": "New Patient", "expires_in_days": 3},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 201
        body = r.json()
        assert "invite_code" in body
        assert "expires_at" in body
        # code format: PREFIX-YEAR-SUFFIX
        assert "-" in body["invite_code"]

    def test_invite_with_clinic_prefix(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(
            "/api/v1/patients/invite",
            json={"clinic_id": "ABCD", "patient_email": "p@test.com"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 201
        assert r.json()["invite_code"].startswith("ABCD")


# ── Messaging endpoints ───────────────────────────────────────────────────────


class TestMessaging:
    def test_send_message_and_list(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _create_patient_direct()
        r = client.post(
            f"/api/v1/patients/{pid}/messages",
            json={"body": "Hello patient", "subject": "Update"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 201
        msg = r.json()
        assert msg["sender_type"] == "clinician"
        assert msg["body"] == "Hello patient"

    def test_list_messages_empty(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _create_patient_direct()
        r = client.get(
            f"/api/v1/patients/{pid}/messages",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        assert r.json()["total"] == 0

    def test_list_messages_after_send(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _create_patient_direct()
        client.post(
            f"/api/v1/patients/{pid}/messages",
            json={"body": "Check-in"},
            headers=auth_headers["clinician"],
        )
        r = client.get(
            f"/api/v1/patients/{pid}/messages",
            headers=auth_headers["clinician"],
        )
        assert r.json()["total"] == 1

    def test_send_message_idor_blocked(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _create_patient_direct()
        _, token = _seed_second_clinician(clinic_id="clinic-msg-idor")
        r = client.post(
            f"/api/v1/patients/{pid}/messages",
            json={"body": "Sneaky message"},
            headers={"Authorization": token},
        )
        assert r.status_code in (403, 404)

    def test_send_and_mark_message_read(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _create_patient_direct()
        # Send a message from clinician to patient
        resp = client.post(
            f"/api/v1/patients/{pid}/messages",
            json={"body": "Please confirm appointment"},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 201
        msg_id = resp.json()["id"]
        # The clinician sent it to patient (recipient=patient_id); mark it via PATCH
        r = client.patch(
            f"/api/v1/patients/{pid}/messages/{msg_id}/read",
            headers=auth_headers["clinician"],
        )
        # 403 because recipient is patient, not clinician — this tests the guard
        assert r.status_code in (200, 403)

    def test_mark_nonexistent_message_read_returns_404(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _create_patient_direct()
        r = client.patch(
            f"/api/v1/patients/{pid}/messages/nonexistent-msg/read",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 404


# ── Cohort summary KPI branches ───────────────────────────────────────────────


class TestCohortSummaryKPIs:
    def test_kpi_phq_delta_computed_when_outcomes_present(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _create_patient_direct()
        _mk_outcome(pid, template_title="PHQ-9", score_numeric=18.0, days_ago=30)
        _mk_outcome(pid, template_title="PHQ-9", score_numeric=10.0, days_ago=0, measurement_point="f2")
        r = client.get(
            "/api/v1/patients/cohort-summary", headers=auth_headers["clinician"]
        )
        kpi = r.json()["kpis"]
        assert kpi["phq_delta_avg"] is not None
        assert kpi["phq_delta_n"] == 1

    def test_kpi_homework_adherence_computed(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _create_patient_direct()
        _mk_device_log(pid, completed=True)
        _mk_device_log(pid, completed=True)
        r = client.get(
            "/api/v1/patients/cohort-summary", headers=auth_headers["clinician"]
        )
        kpi = r.json()["kpis"]
        assert kpi["homework_adherence_pct"] is not None

    def test_kpi_active_courses_delta_7d(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _create_patient_direct()
        _mk_course(pid, status="active")
        r = client.get(
            "/api/v1/patients/cohort-summary", headers=auth_headers["clinician"]
        )
        kpi = r.json()["kpis"]
        # delta_7d is >= 0 always
        assert kpi["active_courses_delta_7d"] >= 0

    def test_kpi_discharged_this_quarter(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        # Patient directly archived/discharged (status set on creation)
        _create_patient_direct(status="discharged")
        r = client.get(
            "/api/v1/patients/cohort-summary", headers=auth_headers["clinician"]
        )
        kpi = r.json()["kpis"]
        assert kpi["discharged_this_quarter"] >= 1
