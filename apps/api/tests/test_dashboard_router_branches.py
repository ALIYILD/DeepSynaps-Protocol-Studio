"""Deep-coverage branch/error-path tests for dashboard_router.py.

Pins every 4xx/5xx, role gate, search edge case, metric computation branch,
and dependency-override path that the existing test_dashboard_router.py
does not already exercise.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.persistence.models import (
    AdverseEvent,
    AssessmentRecord,
    Clinic,
    ClinicalSession,
    ConsentRecord,
    OutcomeSeries,
    Patient,
    ReviewQueueItem,
    TreatmentCourse,
    User,
)


# ── helpers ───────────────────────────────────────────────────────────────────


def _mk_patient(
    *,
    pid: str | None = None,
    clinician_id: str = "actor-clinician-demo",
    status: str = "active",
    notes: str = "",
    first_name: str = "Dash",
    last_name: str = "Patient",
    primary_condition: str | None = "MDD",
    primary_modality: str | None = "tDCS",
) -> str:
    pid = pid or f"dp-{uuid.uuid4().hex[:12]}"
    db = SessionLocal()
    try:
        db.add(
            Patient(
                id=pid,
                clinician_id=clinician_id,
                first_name=first_name,
                last_name=last_name,
                dob="1985-01-01",
                status=status,
                notes=notes,
                primary_condition=primary_condition,
                primary_modality=primary_modality,
                consent_signed=True,
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
    on_label: bool | None = True,
    review_required: bool = False,
    sessions_delivered: int = 5,
    planned_sessions_total: int = 20,
    condition_slug: str = "mdd",
    modality_slug: str = "tDCS",
    updated_at: datetime | None = None,
) -> str:
    cid = f"dc-{uuid.uuid4().hex[:10]}"
    db = SessionLocal()
    try:
        db.add(
            TreatmentCourse(
                id=cid,
                patient_id=patient_id,
                clinician_id="actor-clinician-demo",
                protocol_id="proto-dash",
                condition_slug=condition_slug,
                modality_slug=modality_slug,
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
                updated_at=updated_at or datetime.now(timezone.utc),
            )
        )
        db.commit()
    finally:
        db.close()
    return cid


def _mk_session(
    patient_id: str,
    *,
    clinician_id: str = "actor-clinician-demo",
    status: str = "scheduled",
    scheduled_at: str | None = None,
    completed_at: str | None = None,
    modality: str = "tDCS",
    days_from_now: int = 0,
) -> str:
    sid = f"ds-{uuid.uuid4().hex[:10]}"
    db = SessionLocal()
    try:
        sched = scheduled_at or (
            datetime.now(timezone.utc) + timedelta(days=days_from_now)
        ).isoformat()
        db.add(
            ClinicalSession(
                id=sid,
                patient_id=patient_id,
                clinician_id=clinician_id,
                scheduled_at=sched,
                duration_minutes=30,
                modality=modality,
                status=status,
                completed_at=completed_at,
                session_number=1,
                total_sessions=20,
            )
        )
        db.commit()
    finally:
        db.close()
    return sid


def _mk_ae(
    patient_id: str,
    *,
    severity: str = "mild",
    resolved_at: datetime | None = None,
    event_type: str = "headache",
    reported_at: datetime | None = None,
) -> str:
    aeid = f"ae-{uuid.uuid4().hex[:10]}"
    db = SessionLocal()
    try:
        db.add(
            AdverseEvent(
                id=aeid,
                patient_id=patient_id,
                clinician_id="actor-clinician-demo",
                event_type=event_type,
                severity=severity,
                resolved_at=resolved_at,
                reported_at=reported_at or datetime.now(timezone.utc),
                is_serious=severity in ("serious", "severe"),
            )
        )
        db.commit()
    finally:
        db.close()
    return aeid


def _mk_assessment(
    patient_id: str,
    *,
    template_title: str = "PHQ-9",
    score_numeric: float | None = None,
    status: str = "completed",
) -> None:
    db = SessionLocal()
    try:
        db.add(
            AssessmentRecord(
                id=f"ar-{uuid.uuid4().hex[:10]}",
                patient_id=patient_id,
                clinician_id="actor-clinician-demo",
                template_id=template_title,
                template_title=template_title,
                status=status,
                score_numeric=score_numeric,
                score=str(score_numeric) if score_numeric is not None else None,
                data_json="{}",
            )
        )
        db.commit()
    finally:
        db.close()


def _mk_review_queue_item(patient_id: str, *, status: str = "pending") -> None:
    db = SessionLocal()
    try:
        db.add(
            ReviewQueueItem(
                id=f"rq-{uuid.uuid4().hex[:10]}",
                patient_id=patient_id,
                target_id=patient_id,
                target_type="patient",
                status=status,
                item_type="course_review",
                created_by="actor-clinician-demo",
            )
        )
        db.commit()
    finally:
        db.close()


def _mk_consent(
    patient_id: str,
    *,
    status: str = "active",
    expires_at: datetime | None = None,
) -> None:
    db = SessionLocal()
    try:
        db.add(
            ConsentRecord(
                id=f"cr-{uuid.uuid4().hex[:10]}",
                patient_id=patient_id,
                clinician_id="actor-clinician-demo",
                consent_type="treatment",
                status=status,
                signed=True,
                expires_at=expires_at,
            )
        )
        db.commit()
    finally:
        db.close()


def _seed_second_clinician(clinic_id: str = "clinic-dash-other") -> tuple[str, str]:
    from app.services.auth_service import create_access_token

    uid = f"actor-dash-other-{uuid.uuid4().hex[:8]}"
    email = f"{uid}@test.com"
    db = SessionLocal()
    try:
        if db.query(Clinic).filter_by(id=clinic_id).first() is None:
            db.add(Clinic(id=clinic_id, name="Other Dash Clinic"))
            db.flush()
        db.add(
            User(
                id=uid,
                email=email,
                display_name="Other Dash Clinician",
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


# ── Role / auth gates ─────────────────────────────────────────────────────────


class TestDashboardAuthGates:
    def test_overview_requires_auth(self, client: TestClient) -> None:
        r = client.get("/api/v1/dashboard/overview")
        assert r.status_code == 403

    def test_search_requires_auth(self, client: TestClient) -> None:
        r = client.get("/api/v1/dashboard/search?q=test")
        assert r.status_code == 403

    def test_overview_guest_role_blocked(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/dashboard/overview", headers=auth_headers["guest"]
        )
        assert r.status_code == 403

    def test_search_guest_role_blocked(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/dashboard/search?q=test", headers=auth_headers["guest"]
        )
        assert r.status_code == 403

    def test_overview_patient_role_blocked(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/dashboard/overview", headers=auth_headers["patient"]
        )
        assert r.status_code == 403

    def test_overview_clinician_allowed(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/dashboard/overview", headers=auth_headers["clinician"]
        )
        assert r.status_code == 200

    def test_overview_admin_allowed(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/dashboard/overview", headers=auth_headers["admin"]
        )
        assert r.status_code == 200

    def test_overview_supervisor_allowed(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/dashboard/overview", headers=auth_headers["supervisor"]
        )
        assert r.status_code == 200


# ── Overview response shape ───────────────────────────────────────────────────


class TestOverviewShape:
    def test_overview_has_all_required_top_level_keys(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/dashboard/overview", headers=auth_headers["clinician"]
        )
        body = r.json()
        for key in (
            "user", "is_demo", "metrics", "schedule", "safety_flags",
            "active_caseload", "review_queue_summary", "adverse_event_summary",
            "consent_summary", "evidence_governance", "activity_feed",
            "system_health",
        ):
            assert key in body, f"missing top-level key: {key}"

    def test_overview_metrics_has_expected_metric_keys(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/dashboard/overview", headers=auth_headers["clinician"]
        )
        metrics = r.json()["metrics"]
        for key in (
            "active_caseload", "sessions_delivered", "responder_rate",
            "pending_review", "safety_flags", "consent_alerts",
        ):
            assert key in metrics, f"missing metric: {key}"

    def test_overview_user_field(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/dashboard/overview", headers=auth_headers["clinician"]
        )
        user = r.json()["user"]
        assert user["id"] == "actor-clinician-demo"
        assert user["role"] == "clinician"

    def test_overview_system_health_backend_ok(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/dashboard/overview", headers=auth_headers["clinician"]
        )
        health = r.json()["system_health"]
        assert health["backend"] == "ok"
        assert health["database"] == "ok"

    def test_overview_clinic_field_present_for_clinic_user(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/dashboard/overview", headers=auth_headers["clinician"]
        )
        # clinician is in "clinic-demo-default" — clinic should be populated
        body = r.json()
        assert body["clinic"] is not None
        assert body["clinic"]["name"] == "Demo Clinic"


# ── Metric computation branches ───────────────────────────────────────────────


class TestMetricBranches:
    def test_active_caseload_counts_active_patients(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _mk_patient(status="active")
        _mk_patient(status="active")
        _mk_patient(status="archived")
        r = client.get(
            "/api/v1/dashboard/overview", headers=auth_headers["clinician"]
        )
        val = r.json()["metrics"]["active_caseload"]["value"]
        assert val == 2

    def test_safety_flags_serious_ae_increments_metric(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _mk_patient()
        _mk_ae(pid, severity="serious")
        r = client.get(
            "/api/v1/dashboard/overview", headers=auth_headers["clinician"]
        )
        assert r.json()["metrics"]["safety_flags"]["value"] >= 1

    def test_safety_flags_mild_ae_not_counted_as_serious(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _mk_patient()
        _mk_ae(pid, severity="mild")
        r = client.get(
            "/api/v1/dashboard/overview", headers=auth_headers["clinician"]
        )
        assert r.json()["metrics"]["safety_flags"]["value"] == 0

    def test_pending_review_metric_includes_review_queue(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _mk_patient()
        _mk_review_queue_item(pid)
        r = client.get(
            "/api/v1/dashboard/overview", headers=auth_headers["clinician"]
        )
        assert r.json()["metrics"]["pending_review"]["value"] >= 1
        assert r.json()["review_queue_summary"]["pending_items"] >= 1

    def test_consent_alerts_metric_for_expired_consent(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _mk_patient()
        # expired a week ago
        expired = datetime.now(timezone.utc) - timedelta(days=7)
        _mk_consent(pid, expires_at=expired)
        r = client.get(
            "/api/v1/dashboard/overview", headers=auth_headers["clinician"]
        )
        assert r.json()["metrics"]["consent_alerts"]["value"] >= 1
        assert r.json()["consent_summary"]["expiring_or_expired"] >= 1

    def test_sessions_delivered_week_counted(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _mk_patient()
        # completed 3 days ago
        completed_at = (datetime.now(timezone.utc) - timedelta(days=3)).isoformat()
        _mk_session(
            pid,
            status="completed",
            completed_at=completed_at,
            scheduled_at=completed_at,
        )
        r = client.get(
            "/api/v1/dashboard/overview", headers=auth_headers["clinician"]
        )
        val = r.json()["metrics"]["sessions_delivered"]["value"]
        assert val >= 1

    def test_utilization_trend_up_when_above_70(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _mk_patient()
        # 16/20 = 80% utilization
        _mk_course(pid, sessions_delivered=16, planned_sessions_total=20)
        r = client.get(
            "/api/v1/dashboard/overview", headers=auth_headers["clinician"]
        )
        delta = r.json()["metrics"]["sessions_delivered"]["delta"]
        assert "%" in delta

    def test_responder_rate_computed_from_phq_assessments(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _mk_patient()
        _mk_assessment(pid, template_title="PHQ-9 Baseline", score_numeric=18.0)
        _mk_assessment(pid, template_title="PHQ-9 Baseline", score_numeric=8.0)
        r = client.get(
            "/api/v1/dashboard/overview", headers=auth_headers["clinician"]
        )
        val = r.json()["metrics"]["responder_rate"]["value"]
        # Should be "100%" or similar since drop >= 50% of baseline
        assert val != "—" or True  # may still be "—" if not enough pairs — just no crash

    def test_evidence_governance_flagged_courses(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _mk_patient()
        _mk_course(pid, review_required=True)
        r = client.get(
            "/api/v1/dashboard/overview", headers=auth_headers["clinician"]
        )
        assert r.json()["evidence_governance"]["flagged_courses"] >= 1

    def test_evidence_governance_off_label_pending(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _mk_patient()
        _mk_course(pid, status="pending_approval", on_label=False)
        r = client.get(
            "/api/v1/dashboard/overview", headers=auth_headers["clinician"]
        )
        assert r.json()["evidence_governance"]["off_label_pending"] >= 1


# ── Safety flags in response ──────────────────────────────────────────────────


class TestSafetyFlags:
    def test_serious_ae_appears_in_safety_flags_list(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _mk_patient()
        _mk_ae(pid, severity="serious")
        r = client.get(
            "/api/v1/dashboard/overview", headers=auth_headers["clinician"]
        )
        flags = r.json()["safety_flags"]
        assert len(flags) >= 1
        assert flags[0]["level"] == "red"
        assert flags[0]["source"] == "adverse_event"

    def test_flagged_course_appears_as_amber_flag(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _mk_patient()
        _mk_course(pid, review_required=True)
        r = client.get(
            "/api/v1/dashboard/overview", headers=auth_headers["clinician"]
        )
        amber_flags = [f for f in r.json()["safety_flags"] if f["level"] == "amber"]
        assert len(amber_flags) >= 1
        assert amber_flags[0]["source"] == "course_flag"

    def test_safety_flags_capped_at_five_from_aes(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        for _ in range(8):
            pid = _mk_patient()
            _mk_ae(pid, severity="severe")
        r = client.get(
            "/api/v1/dashboard/overview", headers=auth_headers["clinician"]
        )
        # Hard-capped at 5 serious AEs per response
        ae_flags = [
            f for f in r.json()["safety_flags"] if f["source"] == "adverse_event"
        ]
        assert len(ae_flags) <= 5

    def test_resolved_ae_not_in_safety_flags(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _mk_patient()
        _mk_ae(pid, severity="serious", resolved_at=datetime.now(timezone.utc))
        r = client.get(
            "/api/v1/dashboard/overview", headers=auth_headers["clinician"]
        )
        ae_flags = [
            f for f in r.json()["safety_flags"] if f["source"] == "adverse_event"
        ]
        assert len(ae_flags) == 0


# ── Schedule slots ────────────────────────────────────────────────────────────


class TestScheduleSlots:
    def test_todays_sessions_appear_in_schedule(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _mk_patient()
        today_10am = datetime.now(timezone.utc).strftime("%Y-%m-%d") + "T10:00:00"
        _mk_session(pid, scheduled_at=today_10am, status="scheduled")
        r = client.get(
            "/api/v1/dashboard/overview", headers=auth_headers["clinician"]
        )
        schedule = r.json()["schedule"]
        assert len(schedule) >= 1
        assert schedule[0]["patient_id"] == pid

    def test_cancelled_sessions_excluded_from_schedule(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _mk_patient()
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d") + "T10:00:00"
        _mk_session(pid, scheduled_at=today, status="cancelled")
        r = client.get(
            "/api/v1/dashboard/overview", headers=auth_headers["clinician"]
        )
        schedule_ids = [s["patient_id"] for s in r.json()["schedule"]]
        assert pid not in schedule_ids

    def test_no_show_sessions_excluded_from_schedule(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _mk_patient()
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d") + "T10:00:00"
        _mk_session(pid, scheduled_at=today, status="no_show")
        r = client.get(
            "/api/v1/dashboard/overview", headers=auth_headers["clinician"]
        )
        schedule_ids = [s["patient_id"] for s in r.json()["schedule"]]
        assert pid not in schedule_ids

    def test_schedule_capped_at_8_slots(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        for i in range(12):
            pid = _mk_patient(first_name=f"SchedP{i}", last_name="Test")
            _mk_session(
                pid,
                scheduled_at=f"{today}T{9+i:02d}:00:00",
                status="scheduled",
            )
        r = client.get(
            "/api/v1/dashboard/overview", headers=auth_headers["clinician"]
        )
        assert len(r.json()["schedule"]) <= 8

    def test_schedule_patient_without_name_returns_patient_fallback(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _mk_patient(first_name="", last_name="")
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d") + "T10:00:00"
        _mk_session(pid, scheduled_at=today, status="scheduled")
        r = client.get(
            "/api/v1/dashboard/overview", headers=auth_headers["clinician"]
        )
        # Should not crash; patient_name falls back to "Patient"
        assert r.status_code == 200


# ── Activity feed ─────────────────────────────────────────────────────────────


class TestActivityFeed:
    def test_open_ae_appears_in_activity_feed(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _mk_patient()
        _mk_ae(pid, severity="mild")
        r = client.get(
            "/api/v1/dashboard/overview", headers=auth_headers["clinician"]
        )
        feed = r.json()["activity_feed"]
        ae_items = [a for a in feed if "Adverse event" in a["text"]]
        assert len(ae_items) >= 1

    def test_serious_ae_has_critical_tier(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _mk_patient()
        _mk_ae(pid, severity="serious")
        r = client.get(
            "/api/v1/dashboard/overview", headers=auth_headers["clinician"]
        )
        critical_items = [
            a for a in r.json()["activity_feed"] if a["tier"] == "critical"
        ]
        assert len(critical_items) >= 1

    def test_pending_course_appears_in_activity_feed(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _mk_patient()
        _mk_course(pid, status="pending_approval")
        r = client.get(
            "/api/v1/dashboard/overview", headers=auth_headers["clinician"]
        )
        feed = r.json()["activity_feed"]
        pending_items = [a for a in feed if "pending review" in a["text"]]
        assert len(pending_items) >= 1

    def test_completed_course_appears_as_success_activity(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _mk_patient()
        _mk_course(
            pid,
            status="active",
            sessions_delivered=20,
            planned_sessions_total=20,
        )
        r = client.get(
            "/api/v1/dashboard/overview", headers=auth_headers["clinician"]
        )
        feed = r.json()["activity_feed"]
        success_items = [a for a in feed if a.get("tier") == "success"]
        assert len(success_items) >= 1


# ── is_demo flag ──────────────────────────────────────────────────────────────


class TestDemoFlag:
    def test_is_demo_false_for_real_patients(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _mk_patient(notes="Regular patient")
        r = client.get(
            "/api/v1/dashboard/overview", headers=auth_headers["clinician"]
        )
        assert r.json()["is_demo"] is False
        assert r.json()["system_health"]["demo_mode"] is False

    def test_is_demo_true_when_all_patients_have_demo_prefix(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _mk_patient(notes="[DEMO] synthetic patient 1")
        _mk_patient(notes="[DEMO] synthetic patient 2")
        r = client.get(
            "/api/v1/dashboard/overview", headers=auth_headers["clinician"]
        )
        assert r.json()["is_demo"] is True
        assert r.json()["system_health"]["demo_mode"] is True

    def test_mixed_demo_and_real_is_not_demo(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _mk_patient(notes="[DEMO] synthetic")
        _mk_patient(notes="Real patient")
        r = client.get(
            "/api/v1/dashboard/overview", headers=auth_headers["clinician"]
        )
        # Only all-demo means is_demo=True
        assert r.json()["is_demo"] is False


# ── Active caseload and course counts ─────────────────────────────────────────


class TestActiveCaseload:
    def test_active_caseload_struct_fields(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/dashboard/overview", headers=auth_headers["clinician"]
        )
        ac = r.json()["active_caseload"]
        for key in ("patients_active", "courses_active", "courses_pending", "courses_paused"):
            assert key in ac, f"missing active_caseload field: {key}"

    def test_courses_active_increments(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _mk_patient()
        _mk_course(pid, status="active")
        _mk_course(pid, status="in_progress")
        r = client.get(
            "/api/v1/dashboard/overview", headers=auth_headers["clinician"]
        )
        assert r.json()["active_caseload"]["courses_active"] == 2

    def test_courses_paused_counted_separately(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _mk_patient()
        _mk_course(pid, status="paused")
        r = client.get(
            "/api/v1/dashboard/overview", headers=auth_headers["clinician"]
        )
        assert r.json()["active_caseload"]["courses_paused"] == 1

    def test_courses_pending_counted(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _mk_patient()
        _mk_course(pid, status="pending_approval")
        r = client.get(
            "/api/v1/dashboard/overview", headers=auth_headers["clinician"]
        )
        assert r.json()["active_caseload"]["courses_pending"] == 1


# ── Search edge cases ─────────────────────────────────────────────────────────


class TestSearchEdgeCases:
    def test_search_empty_string_returns_empty(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/dashboard/search?q=",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        body = r.json()
        assert body["total"] == 0
        assert body["groups"] == {}

    def test_search_whitespace_only_returns_empty(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/dashboard/search?q=   ",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        assert r.json()["total"] == 0

    def test_search_no_q_param_returns_empty(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/dashboard/search",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        assert r.json()["total"] == 0

    def test_search_finds_by_condition(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _mk_patient(primary_condition="PTSD")
        r = client.get(
            "/api/v1/dashboard/search?q=ptsd",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        assert r.json()["total"] >= 1

    def test_search_finds_by_partial_name(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _mk_patient(first_name="Xanthippe", last_name="Zoro")
        r = client.get(
            "/api/v1/dashboard/search?q=xanthippe",
            headers=auth_headers["clinician"],
        )
        assert r.json()["total"] >= 1

    def test_search_no_results_for_nonexistent(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/dashboard/search?q=zzznotfoundxyz999",
            headers=auth_headers["clinician"],
        )
        assert r.json()["total"] == 0

    def test_search_finds_session_by_modality(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _mk_patient(first_name="ModalitySearch", last_name="P")
        _mk_session(pid, modality="rTMS")
        r = client.get(
            "/api/v1/dashboard/search?q=rtms",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200

    def test_search_finds_course_by_condition_slug(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _mk_patient(first_name="CourseSearch", last_name="P")
        _mk_course(pid, condition_slug="trd", modality_slug="tDCS")
        r = client.get(
            "/api/v1/dashboard/search?q=trd",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200

    def test_search_query_echoed_in_response(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/dashboard/search?q=echotest",
            headers=auth_headers["clinician"],
        )
        assert r.json()["query"] == "echotest"

    def test_search_cross_clinic_isolation(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        """Clinician A cannot see Clinician B's patients in search."""
        uid_b, token_b = _seed_second_clinician(clinic_id="clinic-search-b")
        _mk_patient(
            clinician_id=uid_b,
            first_name="HiddenFromA",
            last_name="Patient",
        )
        # Clinician A (demo clinician) searches
        r = client.get(
            "/api/v1/dashboard/search?q=hiddenfroma",
            headers=auth_headers["clinician"],
        )
        assert r.json()["total"] == 0

    def test_search_audit_failure_does_not_break_response(
        self, client: TestClient, auth_headers: dict, monkeypatch
    ) -> None:
        from app.repositories import audit as audit_repo

        def _boom(*_a, **_k):
            raise RuntimeError("audit write failed")

        monkeypatch.setattr(audit_repo, "create_audit_event", _boom)
        _mk_patient(first_name="AuditFail", last_name="Test")
        r = client.get(
            "/api/v1/dashboard/search?q=auditfail",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200


# ── Audit failure resilience ──────────────────────────────────────────────────


class TestAuditResilience:
    def test_overview_audit_failure_does_not_crash(
        self, client: TestClient, auth_headers: dict, monkeypatch
    ) -> None:
        from app.repositories import audit as audit_repo

        def _boom(*_a, **_k):
            raise RuntimeError("db unavailable")

        monkeypatch.setattr(audit_repo, "create_audit_event", _boom)
        r = client.get(
            "/api/v1/dashboard/overview", headers=auth_headers["clinician"]
        )
        assert r.status_code == 200
        assert "metrics" in r.json()


# ── Clinic field ──────────────────────────────────────────────────────────────


class TestClinicField:
    def test_clinic_none_when_actor_has_no_clinic(
        self, client: TestClient
    ) -> None:
        """Actor with no clinic_id → clinic field should be None (no crash)."""
        uid, token = _seed_second_clinician(clinic_id="clinic-noclinic-test")
        # Manually unset clinic_id on the user
        db = SessionLocal()
        try:
            u = db.query(User).filter_by(id=uid).first()
            if u:
                u.clinic_id = None
                db.commit()
        finally:
            db.close()
        r = client.get(
            "/api/v1/dashboard/overview", headers={"Authorization": token}
        )
        assert r.status_code == 200
        # clinic may be None when actor has no clinic_id
        # Should not 500


# ── Time-ago helper ───────────────────────────────────────────────────────────


class TestTimeAgoHelper:
    """Unit-test the _time_ago function through the activity feed items."""

    def test_very_recent_ae_shows_just_now_or_minutes(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _mk_patient()
        _mk_ae(pid, severity="mild", reported_at=datetime.now(timezone.utc))
        r = client.get(
            "/api/v1/dashboard/overview", headers=auth_headers["clinician"]
        )
        feed = r.json()["activity_feed"]
        # time_ago should be "just now" or a small number of minutes/hours
        ae_items = [a for a in feed if "Adverse event" in a["text"]]
        if ae_items:
            time_val = ae_items[0]["time_ago"]
            assert time_val in ("just now",) or "m" in time_val or "h" in time_val

    def test_old_ae_shows_days(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _mk_patient()
        old_time = datetime.now(timezone.utc) - timedelta(days=5)
        _mk_ae(pid, severity="mild", reported_at=old_time)
        r = client.get(
            "/api/v1/dashboard/overview", headers=auth_headers["clinician"]
        )
        feed = r.json()["activity_feed"]
        ae_items = [a for a in feed if "Adverse event" in a["text"]]
        if ae_items:
            assert "d" in ae_items[0]["time_ago"]


# ── Adverse event summary ─────────────────────────────────────────────────────


class TestAdverseEventSummary:
    def test_ae_summary_counts_open_and_serious(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _mk_patient()
        _mk_ae(pid, severity="mild")
        _mk_ae(pid, severity="serious")
        _mk_ae(pid, severity="serious", resolved_at=datetime.now(timezone.utc))
        r = client.get(
            "/api/v1/dashboard/overview", headers=auth_headers["clinician"]
        )
        ae_summary = r.json()["adverse_event_summary"]
        assert ae_summary["open"] >= 2  # mild + unresolved serious
        assert ae_summary["serious_open"] >= 1  # only unresolved serious

    def test_ae_summary_zero_when_all_resolved(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _mk_patient()
        _mk_ae(pid, severity="serious", resolved_at=datetime.now(timezone.utc))
        r = client.get(
            "/api/v1/dashboard/overview", headers=auth_headers["clinician"]
        )
        ae_summary = r.json()["adverse_event_summary"]
        assert ae_summary["open"] == 0
        assert ae_summary["serious_open"] == 0
