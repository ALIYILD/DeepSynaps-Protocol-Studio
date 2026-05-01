"""Tests for the Patient Adherence Events launch-audit (PR 2026-05-01).

Sixth patient-facing surface to receive the launch-audit treatment after
Symptom Journal (#344), Wellness Hub (#345), Patient Reports (#346),
Patient Messages (#347), and Home Devices (#348). Closes the home-therapy
patient-side regulatory chain (register → log session → adherence event
→ side-effect → escalate to AE Hub draft).

Covers the patient-scope endpoints added in
``apps/api/app/routers/adherence_events_router.py``:

* GET    /api/v1/adherence/events
* GET    /api/v1/adherence/summary
* GET    /api/v1/adherence/events/{id}
* POST   /api/v1/adherence/events
* POST   /api/v1/adherence/events/{id}/side-effect
* POST   /api/v1/adherence/events/{id}/escalate
* GET    /api/v1/adherence/export.csv
* GET    /api/v1/adherence/export.ndjson
* POST   /api/v1/adherence/audit-events

Plus the cross-router contracts:

* ``adherence_events`` is whitelisted by ``audit_trail_router.KNOWN_SURFACES``.
* ``adherence_events`` is accepted by ``/api/v1/qeeg-analysis/audit-events``.
* Patient-side audit rows surface at
  ``/api/v1/audit-trail?surface=adherence_events``.
"""
from __future__ import annotations

import json
import uuid as _uuid
from datetime import datetime as _dt, timezone as _tz

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.persistence.models import (
    AdverseEvent,
    ConsentRecord,
    Patient,
    PatientAdherenceEvent,
)


# ── Fixtures ────────────────────────────────────────────────────────────────


@pytest.fixture
def demo_patient_with_consent() -> Patient:
    """Seed the Patient row that ``actor-patient-demo`` resolves to via email."""
    db = SessionLocal()
    try:
        patient = Patient(
            id="patient-adherence-demo",
            clinician_id="actor-clinician-demo",
            first_name="Jane",
            last_name="Patient",
            email="patient@deepsynaps.com",
            consent_signed=True,
            status="active",
            notes=None,
        )
        db.add(patient)
        db.commit()
        db.refresh(patient)
        return patient
    finally:
        db.close()


@pytest.fixture
def demo_patient_consent_withdrawn() -> Patient:
    """Patient who signed and later withdrew consent."""
    db = SessionLocal()
    try:
        patient = Patient(
            id="patient-adherence-withdrawn",
            clinician_id="actor-clinician-demo",
            first_name="Withdrawn",
            last_name="Patient",
            email="patient@deepsynaps.com",
            consent_signed=True,
            status="active",
            notes=None,
        )
        db.add(patient)
        db.add(
            ConsentRecord(
                patient_id=patient.id,
                clinician_id="actor-clinician-demo",
                consent_type="participation",
                status="withdrawn",
            )
        )
        db.commit()
        db.refresh(patient)
        return patient
    finally:
        db.close()


@pytest.fixture
def other_patient() -> Patient:
    """A different patient — used as the cross-patient IDOR target."""
    db = SessionLocal()
    try:
        patient = Patient(
            id="patient-adherence-other",
            clinician_id="actor-clinician-demo",
            first_name="Other",
            last_name="Patient",
            email="other-adherence@example.com",
            consent_signed=True,
            status="active",
        )
        db.add(patient)
        db.commit()
        db.refresh(patient)
        return patient
    finally:
        db.close()


def _seed_event(
    *,
    patient_id: str,
    event_type: str = "adherence_report",
    severity: str | None = None,
    status: str = "open",
    structured: dict | None = None,
    report_date: str | None = None,
) -> str:
    db = SessionLocal()
    try:
        eid = str(_uuid.uuid4())
        ev = PatientAdherenceEvent(
            id=eid,
            patient_id=patient_id,
            assignment_id=None,
            course_id=None,
            event_type=event_type,
            severity=severity,
            report_date=(report_date or _dt.now(_tz.utc).date().isoformat()),
            body=None,
            structured_json=json.dumps(structured or {"status": "complete"}),
            status=status,
            created_at=_dt.now(_tz.utc),
        )
        db.add(ev)
        db.commit()
        return eid
    finally:
        db.close()


# ── Surface whitelist sanity ────────────────────────────────────────────────


def test_adherence_events_surface_in_audit_trail_known_surfaces() -> None:
    from app.routers.audit_trail_router import KNOWN_SURFACES

    assert "adherence_events" in KNOWN_SURFACES


def test_adherence_events_surface_accepted_by_qeeg_audit_events(
    client: TestClient, auth_headers: dict
) -> None:
    body = {
        "event": "view",
        "note": "adherence_events surface whitelist sanity",
        "surface": "adherence_events",
    }
    r = client.post(
        "/api/v1/qeeg-analysis/audit-events",
        json=body,
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("accepted") is True
    assert data.get("event_id", "").startswith("adherence_events-")


# ── Role gate ───────────────────────────────────────────────────────────────


class TestRoleGate:
    def test_patient_can_list_own_events(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        _seed_event(patient_id=demo_patient_with_consent.id)
        r = client.get(
            "/api/v1/adherence/events", headers=auth_headers["patient"]
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["total"] == 1
        assert data["consent_active"] is True
        assert isinstance(data["disclaimers"], list) and data["disclaimers"]

    def test_clinician_calling_patient_scope_endpoint_returns_404(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        # The patient-scope /events listing must 404 for clinicians —
        # they use the existing /home-devices/adherence-events queue.
        r = client.get(
            "/api/v1/adherence/events", headers=auth_headers["clinician"]
        )
        assert r.status_code == 404, r.text

    def test_admin_calling_patient_scope_endpoint_returns_404(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        r = client.get(
            "/api/v1/adherence/events", headers=auth_headers["admin"]
        )
        assert r.status_code == 404, r.text


# ── Cross-patient isolation (IDOR) ──────────────────────────────────────────


class TestCrossPatientIsolation:
    def test_patient_cannot_view_another_patients_event(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
        other_patient: Patient,
    ) -> None:
        eid = _seed_event(patient_id=other_patient.id)
        r = client.get(
            f"/api/v1/adherence/events/{eid}",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 404, r.text

    def test_patient_cannot_side_effect_another_patients_event(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
        other_patient: Patient,
    ) -> None:
        eid = _seed_event(patient_id=other_patient.id)
        r = client.post(
            f"/api/v1/adherence/events/{eid}/side-effect",
            json={"severity": 5, "note": "testing"},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 404, r.text

    def test_patient_cannot_escalate_another_patients_event(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
        other_patient: Patient,
    ) -> None:
        eid = _seed_event(patient_id=other_patient.id)
        r = client.post(
            f"/api/v1/adherence/events/{eid}/escalate",
            json={"reason": "testing"},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 404, r.text

    def test_audit_event_with_cross_patient_record_returns_404(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
        other_patient: Patient,
    ) -> None:
        eid = _seed_event(patient_id=other_patient.id)
        r = client.post(
            "/api/v1/adherence/audit-events",
            json={"event": "event_viewed", "event_record_id": eid},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 404


# ── Log task ────────────────────────────────────────────────────────────────


class TestLogTask:
    def test_log_complete_persists_and_audits(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        today = _dt.now(_tz.utc).date().isoformat()
        r = client.post(
            "/api/v1/adherence/events",
            json={"status": "complete", "report_date": today},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["event_type"] == "adherence_report"
        assert body["report_date"] == today

        audit = client.get(
            "/api/v1/audit-trail?surface=adherence_events",
            headers=auth_headers["admin"],
        ).json()["items"]
        actions = {it.get("action") for it in audit}
        assert "adherence_events.task_completed" in actions

    def test_log_skipped_emits_skipped_audit(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        today = _dt.now(_tz.utc).date().isoformat()
        r = client.post(
            "/api/v1/adherence/events",
            json={"status": "skipped", "report_date": today, "reason": "tired"},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 201, r.text

        audit = client.get(
            "/api/v1/audit-trail?surface=adherence_events",
            headers=auth_headers["admin"],
        ).json()["items"]
        actions = {it.get("action") for it in audit}
        assert "adherence_events.task_skipped" in actions

    def test_log_blocked_when_consent_withdrawn(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_consent_withdrawn: Patient,
    ) -> None:
        today = _dt.now(_tz.utc).date().isoformat()
        r = client.post(
            "/api/v1/adherence/events",
            json={"status": "complete", "report_date": today},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 403, r.text
        assert r.json().get("code") == "consent_inactive"

    def test_log_invalid_status_returns_422(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        today = _dt.now(_tz.utc).date().isoformat()
        r = client.post(
            "/api/v1/adherence/events",
            json={"status": "not-a-status", "report_date": today},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 422

    def test_log_future_date_returns_422(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        r = client.post(
            "/api/v1/adherence/events",
            json={"status": "complete", "report_date": "2099-01-01"},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 422


# ── Side-effect ─────────────────────────────────────────────────────────────


class TestSideEffect:
    def test_high_severity_creates_high_priority_clinician_audit(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        eid = _seed_event(patient_id=demo_patient_with_consent.id)
        r = client.post(
            f"/api/v1/adherence/events/{eid}/side-effect",
            json={"severity": 8, "body_part": "scalp", "note": "burning sensation"},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["event_type"] == "side_effect"
        assert body["severity"] == "high"

        audit = client.get(
            "/api/v1/audit-trail?surface=adherence_events",
            headers=auth_headers["admin"],
        ).json()["items"]
        actions = {it.get("action") for it in audit}
        assert "adherence_events.side_effect_logged" in actions
        # HIGH-priority clinician-visible mirror.
        mirror = next(
            (
                it
                for it in audit
                if it.get("action") == "adherence_events.side_effect_to_clinician"
            ),
            None,
        )
        assert mirror is not None
        assert "priority=high" in (mirror.get("note") or "")
        assert mirror.get("target_id") == "actor-clinician-demo"

    def test_low_severity_does_not_create_clinician_mirror(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        eid = _seed_event(patient_id=demo_patient_with_consent.id)
        r = client.post(
            f"/api/v1/adherence/events/{eid}/side-effect",
            json={"severity": 3, "note": "mild headache"},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 201, r.text
        assert r.json()["severity"] == "low"

        audit = client.get(
            "/api/v1/audit-trail?surface=adherence_events",
            headers=auth_headers["admin"],
        ).json()["items"]
        actions = {it.get("action") for it in audit}
        assert "adherence_events.side_effect_logged" in actions
        # Low severity must not promote to clinician priority.
        assert "adherence_events.side_effect_to_clinician" not in actions

    def test_invalid_severity_returns_422(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        eid = _seed_event(patient_id=demo_patient_with_consent.id)
        r = client.post(
            f"/api/v1/adherence/events/{eid}/side-effect",
            json={"severity": 11, "note": "off the chart"},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 422

    def test_consent_withdrawn_blocks_side_effect(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_consent_withdrawn: Patient,
    ) -> None:
        eid = _seed_event(patient_id=demo_patient_consent_withdrawn.id)
        r = client.post(
            f"/api/v1/adherence/events/{eid}/side-effect",
            json={"severity": 5, "note": "test"},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 403


# ── Escalate ────────────────────────────────────────────────────────────────


class TestEscalate:
    def test_escalate_high_severity_side_effect_creates_ae_hub_draft(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        # Seed a side-effect with severity_int=8 and bucket="high".
        eid = _seed_event(
            patient_id=demo_patient_with_consent.id,
            event_type="side_effect",
            severity="high",
            structured={"severity_int": 8},
        )
        r = client.post(
            f"/api/v1/adherence/events/{eid}/escalate",
            json={"reason": "getting worse, want my clinician's eyes on this"},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "escalated"
        assert body["adverse_event_id"], "AE Hub draft must be created"

        # AE row exists in DB and is patient-scoped.
        db = SessionLocal()
        try:
            ae = db.query(AdverseEvent).filter_by(id=body["adverse_event_id"]).first()
            assert ae is not None
            assert ae.patient_id == demo_patient_with_consent.id
            assert ae.event_type == "patient_reported_side_effect"
        finally:
            db.close()

        # Patient-side + clinician-mirror audit rows.
        audit = client.get(
            "/api/v1/audit-trail?surface=adherence_events",
            headers=auth_headers["admin"],
        ).json()["items"]
        actions = {it.get("action") for it in audit}
        assert "adherence_events.escalated_to_clinician" in actions
        mirror = next(
            (
                it
                for it in audit
                if it.get("action") == "adherence_events.escalated_to_clinician_mirror"
            ),
            None,
        )
        assert mirror is not None
        assert "priority=high" in (mirror.get("note") or "")

    def test_escalate_low_severity_does_not_create_ae_hub_draft(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        eid = _seed_event(patient_id=demo_patient_with_consent.id)
        r = client.post(
            f"/api/v1/adherence/events/{eid}/escalate",
            json={"reason": "want clinician to see this skipped task"},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "escalated"
        assert body["adverse_event_id"] is None

    def test_escalate_blocked_when_consent_withdrawn(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_consent_withdrawn: Patient,
    ) -> None:
        eid = _seed_event(patient_id=demo_patient_consent_withdrawn.id)
        r = client.post(
            f"/api/v1/adherence/events/{eid}/escalate",
            json={"reason": "test"},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 403


# ── Summary ─────────────────────────────────────────────────────────────────


class TestSummary:
    def test_summary_counts_today_and_streak(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        today = _dt.now(_tz.utc).date().isoformat()
        _seed_event(
            patient_id=demo_patient_with_consent.id,
            structured={"status": "complete"},
            report_date=today,
        )
        _seed_event(
            patient_id=demo_patient_with_consent.id,
            structured={"status": "skipped"},
            report_date=today,
        )

        r = client.get(
            "/api/v1/adherence/summary",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200, r.text
        s = r.json()
        assert s["total_events"] >= 2
        assert s["completed_today"] == 1
        assert s["skipped_today"] == 1
        # Missed-streak resets to 0 the moment a complete is logged today.
        assert s["missed_streak_days"] == 0
        assert s["consent_active"] is True


# ── Exports ─────────────────────────────────────────────────────────────────


class TestExports:
    def test_csv_export_demo_prefix(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        # Flip the patient's notes to [DEMO] so _patient_is_demo_ad flags it.
        db = SessionLocal()
        try:
            p = db.query(Patient).filter_by(id=demo_patient_with_consent.id).first()
            p.notes = "[DEMO] seed patient"
            db.commit()
        finally:
            db.close()

        _seed_event(patient_id=demo_patient_with_consent.id)
        r = client.get(
            "/api/v1/adherence/export.csv",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200, r.text
        cd = r.headers.get("content-disposition", "")
        assert "DEMO-" in cd
        assert r.headers.get("x-adherence-demo") == "1"
        assert "event_id,patient_id,event_type" in r.text

    def test_ndjson_export_runs_and_audits(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        _seed_event(patient_id=demo_patient_with_consent.id)
        r = client.get(
            "/api/v1/adherence/export.ndjson",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("application/x-ndjson")
        audit = client.get(
            "/api/v1/audit-trail?surface=adherence_events",
            headers=auth_headers["admin"],
        ).json()["items"]
        actions = {it.get("action") for it in audit}
        assert "adherence_events.export" in actions


# ── Audit-event ingestion ───────────────────────────────────────────────────


class TestAuditIngestion:
    def test_post_audit_event_visible_at_audit_trail(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        r = client.post(
            "/api/v1/adherence/audit-events",
            json={"event": "view", "note": "page mount"},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["accepted"] is True
        assert body["event_id"].startswith("adherence_events-")

        listing = client.get(
            "/api/v1/audit-trail?surface=adherence_events",
            headers=auth_headers["admin"],
        ).json()
        assert any(
            (
                it.get("target_type") == "adherence_events"
                or it.get("surface") == "adherence_events"
            )
            for it in listing.get("items", [])
        )

    def test_clinician_cannot_post_adherence_audit_events(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(
            "/api/v1/adherence/audit-events",
            json={"event": "view"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 403


# ── Consent-revoked read-only ───────────────────────────────────────────────


class TestConsentRevoked:
    def test_consent_revoked_still_allows_read(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_consent_withdrawn: Patient,
    ) -> None:
        _seed_event(patient_id=demo_patient_consent_withdrawn.id)
        r = client.get(
            "/api/v1/adherence/events",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["consent_active"] is False
        assert body["total"] == 1
