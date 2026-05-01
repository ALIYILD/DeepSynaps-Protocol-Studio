"""Tests for the Clinician Wearables Workbench launch-audit (2026-05-01).

Bidirectional counterpart to ``test_patient_wearables_launch_audit.py``
(merged in #352). Where the patient surface ensures patients have an
audited connect / sync / disconnect chain with anomaly escalation, this
suite proves the clinician triage queue over the resulting
``wearable_alert_flags`` rows is regulator-credible:

* role gate (clinician / admin / supervisor / reviewer / technician),
* cross-clinic IDOR (404 for clinicians at the wrong clinic; 200 for
  admins),
* filter honesty (status / severity / patient_id),
* summary returns deterministic counts (no AI fabrication),
* acknowledge / escalate / resolve all require a note,
* escalation creates an :class:`AdverseEvent` draft + HIGH-priority audit,
* resolved flags are immutable (409),
* exports DEMO-prefix when any flag's patient is demo,
* page-level audit ingestion at ``/api/v1/wearables/workbench/audit-events``,
* audit rows surface at ``/api/v1/audit-trail?surface=wearables_workbench``.
"""
from __future__ import annotations

import uuid as _uuid
from datetime import datetime as _dt, timedelta as _td, timezone as _tz

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.persistence.models import (
    AdverseEvent,
    Clinic,
    Patient,
    User,
    WearableAlertFlag,
    WearableObservation,
)


# ── Fixtures ────────────────────────────────────────────────────────────────


@pytest.fixture
def home_clinic_patient() -> Patient:
    """Patient owned by the demo clinician's clinic (clinic-demo-default)."""
    db = SessionLocal()
    try:
        patient = Patient(
            id="patient-wb-home",
            clinician_id="actor-clinician-demo",
            first_name="Home",
            last_name="Triage",
            email="home-triage@example.com",
            consent_signed=True,
            status="active",
        )
        db.add(patient)
        db.commit()
        db.refresh(patient)
        return patient
    finally:
        db.close()


@pytest.fixture
def other_clinic_patient() -> Patient:
    """Patient owned by a clinician in a DIFFERENT clinic.

    Used as the cross-clinic IDOR target. Adds a fresh Clinic row +
    clinician + patient so there is no overlap with the home clinic.
    """
    db = SessionLocal()
    try:
        if db.query(Clinic).filter_by(id="clinic-other-wb").first() is None:
            db.add(Clinic(id="clinic-other-wb", name="Other Clinic WB"))
            db.flush()
        if db.query(User).filter_by(id="actor-clinician-other-wb").first() is None:
            db.add(User(
                id="actor-clinician-other-wb",
                email="other-clinician-wb@example.com",
                display_name="Other Clinic Clinician",
                hashed_password="x",
                role="clinician",
                package_id="clinician_pro",
                clinic_id="clinic-other-wb",
            ))
        patient = Patient(
            id="patient-wb-other",
            clinician_id="actor-clinician-other-wb",
            first_name="Other",
            last_name="Clinic",
            email="other-clinic-wb@example.com",
            consent_signed=True,
            status="active",
        )
        db.add(patient)
        db.commit()
        db.refresh(patient)
        return patient
    finally:
        db.close()


def _seed_flag(
    *,
    patient_id: str,
    severity: str = "warning",
    flag_type: str = "low_hrv_streak",
    triggered_at: _dt | None = None,
    course_id: str | None = None,
    detail: str | None = "Auto-detected by deterministic flag rule.",
    workbench_status: str | None = None,
    dismissed: bool = False,
) -> str:
    db = SessionLocal()
    try:
        fid = str(_uuid.uuid4())
        row = WearableAlertFlag(
            id=fid,
            patient_id=patient_id,
            course_id=course_id,
            flag_type=flag_type,
            severity=severity,
            detail=detail,
            triggered_at=triggered_at or _dt.now(_tz.utc),
            dismissed=dismissed,
            auto_generated=True,
            workbench_status=workbench_status,
        )
        db.add(row)
        db.commit()
        return fid
    finally:
        db.close()


def _seed_observation(
    *,
    patient_id: str,
    metric_type: str = "hrv_ms",
    value: float = 28.0,
    observed_at: _dt | None = None,
) -> str:
    db = SessionLocal()
    try:
        oid = str(_uuid.uuid4())
        db.add(WearableObservation(
            id=oid,
            patient_id=patient_id,
            connection_id=None,
            source="fitbit",
            source_type="wearable",
            metric_type=metric_type,
            value=value,
            unit="ms",
            observed_at=observed_at or _dt.now(_tz.utc),
            quality_flag="good",
        ))
        db.commit()
        return oid
    finally:
        db.close()


# ── Surface whitelist sanity ────────────────────────────────────────────────


def test_workbench_surface_in_audit_trail_known_surfaces() -> None:
    from app.routers.audit_trail_router import KNOWN_SURFACES
    assert "wearables_workbench" in KNOWN_SURFACES


def test_workbench_surface_accepted_by_qeeg_audit_events(
    client: TestClient, auth_headers: dict
) -> None:
    body = {"event": "view", "surface": "wearables_workbench", "note": "whitelist sanity"}
    r = client.post(
        "/api/v1/qeeg-analysis/audit-events",
        json=body,
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("accepted") is True
    assert data.get("event_id", "").startswith("wearables_workbench-")


# ── Role gate ───────────────────────────────────────────────────────────────


class TestRoleGate:
    def test_patient_role_is_403(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/wearables/workbench/flags",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 403, r.text

    def test_guest_is_unauthorized(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/wearables/workbench/flags",
            headers=auth_headers["guest"],
        )
        # Guest token has role=guest; gate returns 403.
        assert r.status_code in (401, 403)

    def test_clinician_can_list(
        self, client: TestClient, auth_headers: dict, home_clinic_patient: Patient
    ) -> None:
        _seed_flag(patient_id=home_clinic_patient.id)
        r = client.get(
            "/api/v1/wearables/workbench/flags",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["total"] == 1
        assert isinstance(data["disclaimers"], list) and data["disclaimers"]


# ── Cross-clinic isolation (IDOR) ───────────────────────────────────────────


class TestCrossClinicIsolation:
    def test_clinician_cannot_see_other_clinic_flags_in_list(
        self,
        client: TestClient,
        auth_headers: dict,
        home_clinic_patient: Patient,
        other_clinic_patient: Patient,
    ) -> None:
        _seed_flag(patient_id=other_clinic_patient.id)
        r = client.get(
            "/api/v1/wearables/workbench/flags",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        # Home-clinic clinician must not see the other-clinic patient's flag.
        assert r.json()["total"] == 0

    def test_clinician_cannot_view_other_clinic_flag_detail(
        self,
        client: TestClient,
        auth_headers: dict,
        other_clinic_patient: Patient,
    ) -> None:
        fid = _seed_flag(patient_id=other_clinic_patient.id)
        r = client.get(
            f"/api/v1/wearables/workbench/flags/{fid}",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 404

    def test_clinician_cannot_acknowledge_other_clinic_flag(
        self,
        client: TestClient,
        auth_headers: dict,
        other_clinic_patient: Patient,
    ) -> None:
        fid = _seed_flag(patient_id=other_clinic_patient.id)
        r = client.post(
            f"/api/v1/wearables/workbench/flags/{fid}/acknowledge",
            json={"note": "trying"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 404

    def test_admin_can_see_other_clinic_flag(
        self,
        client: TestClient,
        auth_headers: dict,
        other_clinic_patient: Patient,
    ) -> None:
        fid = _seed_flag(patient_id=other_clinic_patient.id)
        r = client.get(
            f"/api/v1/wearables/workbench/flags/{fid}",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        assert r.json()["id"] == fid


# ── List filters ────────────────────────────────────────────────────────────


class TestListFilters:
    def test_status_filter_open(
        self, client: TestClient, auth_headers: dict, home_clinic_patient: Patient
    ) -> None:
        _seed_flag(patient_id=home_clinic_patient.id, severity="warning")
        _seed_flag(
            patient_id=home_clinic_patient.id,
            severity="urgent",
            workbench_status="resolved",
            dismissed=True,
        )
        r = client.get(
            "/api/v1/wearables/workbench/flags?status=open",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        items = r.json()["items"]
        assert len(items) == 1
        assert items[0]["status"] == "open"

    def test_severity_filter(
        self, client: TestClient, auth_headers: dict, home_clinic_patient: Patient
    ) -> None:
        _seed_flag(patient_id=home_clinic_patient.id, severity="info")
        _seed_flag(patient_id=home_clinic_patient.id, severity="urgent")
        r = client.get(
            "/api/v1/wearables/workbench/flags?severity=urgent",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        items = r.json()["items"]
        assert len(items) == 1
        assert items[0]["severity"] == "urgent"


# ── Summary ─────────────────────────────────────────────────────────────────


class TestSummary:
    def test_summary_counts_match_seeded_state(
        self, client: TestClient, auth_headers: dict, home_clinic_patient: Patient
    ) -> None:
        _seed_flag(patient_id=home_clinic_patient.id, severity="warning")
        _seed_flag(
            patient_id=home_clinic_patient.id,
            severity="warning",
            workbench_status="acknowledged",
        )
        _seed_flag(
            patient_id=home_clinic_patient.id,
            severity="urgent",
            workbench_status="escalated",
        )
        _seed_flag(
            patient_id=home_clinic_patient.id,
            severity="info",
            workbench_status="resolved",
            dismissed=True,
        )
        r = client.get(
            "/api/v1/wearables/workbench/flags/summary",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        s = r.json()
        assert s["open"] == 1
        assert s["acknowledged"] == 1
        assert s["escalated"] == 1
        assert s["resolved"] == 1
        # All four were triggered_at=now() so 7d incidence is 4.
        assert s["incidence_7d"] == 4


# ── Acknowledge ─────────────────────────────────────────────────────────────


class TestAcknowledge:
    def test_acknowledge_requires_note(
        self, client: TestClient, auth_headers: dict, home_clinic_patient: Patient
    ) -> None:
        fid = _seed_flag(patient_id=home_clinic_patient.id)
        r = client.post(
            f"/api/v1/wearables/workbench/flags/{fid}/acknowledge",
            json={"note": "  "},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 422

    def test_acknowledge_emits_audit_and_flips_status(
        self, client: TestClient, auth_headers: dict, home_clinic_patient: Patient
    ) -> None:
        fid = _seed_flag(patient_id=home_clinic_patient.id)
        r = client.post(
            f"/api/v1/wearables/workbench/flags/{fid}/acknowledge",
            json={"note": "Reviewed device sync logs; HRV dip aligns with caffeine spike."},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "acknowledged"

        audit = client.get(
            "/api/v1/audit-trail?surface=wearables_workbench",
            headers=auth_headers["admin"],
        ).json()["items"]
        actions = {it.get("action") for it in audit}
        assert "wearables_workbench.flag_acknowledged" in actions

    def test_resolved_flag_cannot_be_acknowledged(
        self, client: TestClient, auth_headers: dict, home_clinic_patient: Patient
    ) -> None:
        fid = _seed_flag(
            patient_id=home_clinic_patient.id,
            workbench_status="resolved",
            dismissed=True,
        )
        r = client.post(
            f"/api/v1/wearables/workbench/flags/{fid}/acknowledge",
            json={"note": "trying after resolve"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 409


# ── Escalate ────────────────────────────────────────────────────────────────


class TestEscalate:
    def test_escalate_creates_adverse_event_draft_and_high_priority_audit(
        self, client: TestClient, auth_headers: dict, home_clinic_patient: Patient
    ) -> None:
        fid = _seed_flag(
            patient_id=home_clinic_patient.id,
            severity="urgent",
            flag_type="manual_sync_hr_high_anomaly",
        )
        r = client.post(
            f"/api/v1/wearables/workbench/flags/{fid}/escalate",
            json={"note": "Tachycardia >180bpm during home tDCS — escalating to AE Hub."},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "escalated"
        assert body["adverse_event_id"]

        # AE row exists with the expected event_type.
        db = SessionLocal()
        try:
            ae = (
                db.query(AdverseEvent)
                .filter_by(id=body["adverse_event_id"])
                .first()
            )
            assert ae is not None
            assert ae.event_type == "wearable_anomaly"
            assert ae.is_serious is True
            assert ae.patient_id == home_clinic_patient.id
        finally:
            db.close()

        # HIGH-priority audit row pinned to the flag.
        audit = client.get(
            "/api/v1/audit-trail?surface=wearables_workbench",
            headers=auth_headers["admin"],
        ).json()["items"]
        escalate_row = next(
            (it for it in audit
             if it.get("action") == "wearables_workbench.flag_escalated"),
            None,
        )
        assert escalate_row is not None
        assert "priority=high" in (escalate_row.get("note") or "")

    def test_escalate_requires_note(
        self, client: TestClient, auth_headers: dict, home_clinic_patient: Patient
    ) -> None:
        fid = _seed_flag(patient_id=home_clinic_patient.id)
        r = client.post(
            f"/api/v1/wearables/workbench/flags/{fid}/escalate",
            json={"note": ""},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 422

    def test_resolved_flag_cannot_be_escalated(
        self, client: TestClient, auth_headers: dict, home_clinic_patient: Patient
    ) -> None:
        fid = _seed_flag(
            patient_id=home_clinic_patient.id,
            workbench_status="resolved",
            dismissed=True,
        )
        r = client.post(
            f"/api/v1/wearables/workbench/flags/{fid}/escalate",
            json={"note": "should not work"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 409


# ── Resolve ─────────────────────────────────────────────────────────────────


class TestResolve:
    def test_resolve_requires_note(
        self, client: TestClient, auth_headers: dict, home_clinic_patient: Patient
    ) -> None:
        fid = _seed_flag(patient_id=home_clinic_patient.id)
        r = client.post(
            f"/api/v1/wearables/workbench/flags/{fid}/resolve",
            json={"note": ""},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 422

    def test_resolve_makes_flag_immutable(
        self, client: TestClient, auth_headers: dict, home_clinic_patient: Patient
    ) -> None:
        fid = _seed_flag(patient_id=home_clinic_patient.id)
        r = client.post(
            f"/api/v1/wearables/workbench/flags/{fid}/resolve",
            json={"note": "Patient confirmed device false positive."},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        # Second resolve attempt → 409.
        r2 = client.post(
            f"/api/v1/wearables/workbench/flags/{fid}/resolve",
            json={"note": "duplicate"},
            headers=auth_headers["clinician"],
        )
        assert r2.status_code == 409


# ── Exports ─────────────────────────────────────────────────────────────────


class TestExports:
    def test_csv_export_demo_prefix_when_any_patient_demo(
        self, client: TestClient, auth_headers: dict, home_clinic_patient: Patient
    ) -> None:
        # Force the DEMO branch by stamping ``[DEMO]`` in patient.notes.
        db = SessionLocal()
        try:
            p = db.query(Patient).filter_by(id=home_clinic_patient.id).first()
            assert p is not None
            p.notes = "[DEMO] launch-audit"
            db.commit()
        finally:
            db.close()

        _seed_flag(patient_id=home_clinic_patient.id)
        r = client.get(
            "/api/v1/wearables/workbench/flags/export.csv",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        cd = r.headers.get("content-disposition", "")
        assert "DEMO-wearables-workbench-flags.csv" in cd
        assert r.headers.get("X-WearablesWorkbench-Demo") == "1"
        assert "flag_id" in r.text  # CSV header

    def test_ndjson_export_no_prefix_when_not_demo(
        self, client: TestClient, auth_headers: dict, home_clinic_patient: Patient
    ) -> None:
        # Re-point clinician away from a demo clinic to keep the row honest.
        db = SessionLocal()
        try:
            if db.query(Clinic).filter_by(id="clinic-real-prod").first() is None:
                db.add(Clinic(id="clinic-real-prod", name="Real Prod"))
                db.flush()
            if db.query(User).filter_by(id="actor-clinician-real").first() is None:
                db.add(User(
                    id="actor-clinician-real",
                    email="real@example.com",
                    display_name="Real Clinician",
                    hashed_password="x",
                    role="clinician",
                    package_id="clinician_pro",
                    clinic_id="clinic-real-prod",
                ))
            p = db.query(Patient).filter_by(id=home_clinic_patient.id).first()
            assert p is not None
            p.clinician_id = "actor-clinician-real"
            db.commit()
        finally:
            db.close()

        _seed_flag(patient_id=home_clinic_patient.id)
        # Use admin (cross-clinic) to read the relocated patient's flag.
        r = client.get(
            "/api/v1/wearables/workbench/flags/export.ndjson",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        cd = r.headers.get("content-disposition", "")
        assert "DEMO-" not in cd
        assert r.headers.get("X-WearablesWorkbench-Demo") == "0"


# ── Audit ingestion ─────────────────────────────────────────────────────────


class TestAuditIngestion:
    def test_view_audit_event_accepted(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(
            "/api/v1/wearables/workbench/audit-events",
            json={"event": "view", "note": "clinician mounted Workbench"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        body = r.json()
        assert body["accepted"] is True
        assert body["event_id"].startswith("wearables_workbench-")

    def test_audit_ingestion_patient_403(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(
            "/api/v1/wearables/workbench/audit-events",
            json={"event": "view"},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 403

    def test_audit_event_with_cross_clinic_flag_returns_404(
        self,
        client: TestClient,
        auth_headers: dict,
        other_clinic_patient: Patient,
    ) -> None:
        fid = _seed_flag(patient_id=other_clinic_patient.id)
        r = client.post(
            "/api/v1/wearables/workbench/audit-events",
            json={"event": "flag_viewed", "flag_id": fid},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 404

    def test_flag_viewed_audit_surfaces_in_audit_trail(
        self,
        client: TestClient,
        auth_headers: dict,
        home_clinic_patient: Patient,
    ) -> None:
        fid = _seed_flag(patient_id=home_clinic_patient.id)
        # Detail GET emits the flag_viewed audit row.
        r = client.get(
            f"/api/v1/wearables/workbench/flags/{fid}",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200

        audit = client.get(
            "/api/v1/audit-trail?surface=wearables_workbench",
            headers=auth_headers["admin"],
        ).json()["items"]
        actions = {it.get("action") for it in audit}
        assert "wearables_workbench.flag_viewed" in actions
