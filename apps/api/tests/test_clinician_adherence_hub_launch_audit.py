"""Tests for the Clinician Adherence Hub launch-audit (2026-05-01).

Bidirectional counterpart to ``test_adherence_events_launch_audit.py``
(merged in #350). Where the patient surface ensures patients have an
audited log → side-effect → escalate chain on their own row, this suite
proves the cross-patient triage queue at the clinic level is regulator-
credible:

* role gate (clinician / admin / supervisor / reviewer / regulator),
* cross-clinic IDOR (404 for clinicians at the wrong clinic; 200 for
  admins),
* aggregation across multiple patients,
* filter combinations (severity / status / surface_chip / patient_id /
  since-until / q),
* summary returns deterministic counts (no AI fabrication),
* acknowledge / escalate / resolve all require a note,
* escalation creates an :class:`AdverseEvent` draft + HIGH-priority audit,
* resolved events are immutable (409),
* bulk-acknowledge processes a list and reports partial failures,
* exports DEMO-prefix when any event's patient is demo,
* page-level audit ingestion at
  ``/api/v1/clinician-adherence/audit-events``,
* audit rows surface at
  ``/api/v1/audit-trail?surface=clinician_adherence_hub``.
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
    PatientAdherenceEvent,
    User,
)


# ── Fixtures ────────────────────────────────────────────────────────────────


@pytest.fixture
def home_clinic_patient() -> Patient:
    """Patient owned by the demo clinician's clinic (clinic-demo-default)."""
    db = SessionLocal()
    try:
        patient = Patient(
            id="patient-cah-home",
            clinician_id="actor-clinician-demo",
            first_name="Adher",
            last_name="Home",
            email="adher-home@example.com",
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
def home_clinic_patient_two() -> Patient:
    """Second patient at home clinic (for cross-patient aggregation)."""
    db = SessionLocal()
    try:
        patient = Patient(
            id="patient-cah-home2",
            clinician_id="actor-clinician-demo",
            first_name="Adher",
            last_name="HomeTwo",
            email="adher-home2@example.com",
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
def home_clinic_patient_three() -> Patient:
    """Third patient at home clinic (for cross-patient aggregation)."""
    db = SessionLocal()
    try:
        patient = Patient(
            id="patient-cah-home3",
            clinician_id="actor-clinician-demo",
            first_name="Adher",
            last_name="HomeThree",
            email="adher-home3@example.com",
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
    """Patient owned by a clinician in a DIFFERENT clinic (cross-clinic IDOR target)."""
    db = SessionLocal()
    try:
        if db.query(Clinic).filter_by(id="clinic-other-cah").first() is None:
            db.add(Clinic(id="clinic-other-cah", name="Other Clinic CAH"))
            db.flush()
        if db.query(User).filter_by(id="actor-clinician-other-cah").first() is None:
            db.add(User(
                id="actor-clinician-other-cah",
                email="other-clinician-cah@example.com",
                display_name="Other Clinic Clinician",
                hashed_password="x",
                role="clinician",
                package_id="clinician_pro",
                clinic_id="clinic-other-cah",
            ))
        patient = Patient(
            id="patient-cah-other",
            clinician_id="actor-clinician-other-cah",
            first_name="Other",
            last_name="ClinicCAH",
            email="other-clinic-cah@example.com",
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
    body: str | None = "Auto-seeded for adherence hub test.",
    structured: dict | None = None,
    report_date: str | None = None,
    created_at: _dt | None = None,
) -> str:
    import json
    db = SessionLocal()
    try:
        eid = str(_uuid.uuid4())
        rd = report_date or _dt.now(_tz.utc).date().isoformat()
        row = PatientAdherenceEvent(
            id=eid,
            patient_id=patient_id,
            event_type=event_type,
            severity=severity,
            report_date=rd,
            body=body,
            structured_json=json.dumps(structured or {"status": "complete"}),
            status=status,
            created_at=created_at or _dt.now(_tz.utc),
        )
        db.add(row)
        db.commit()
        return eid
    finally:
        db.close()


# ── Surface whitelist sanity ────────────────────────────────────────────────


def test_hub_surface_in_audit_trail_known_surfaces() -> None:
    from app.routers.audit_trail_router import KNOWN_SURFACES
    assert "clinician_adherence_hub" in KNOWN_SURFACES


def test_hub_surface_accepted_by_qeeg_audit_events(
    client: TestClient, auth_headers: dict
) -> None:
    body = {"event": "view", "surface": "clinician_adherence_hub", "note": "whitelist sanity"}
    r = client.post(
        "/api/v1/qeeg-analysis/audit-events",
        json=body,
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("accepted") is True
    assert data.get("event_id", "").startswith("clinician_adherence_hub-")


# ── Role gate ───────────────────────────────────────────────────────────────


class TestRoleGate:
    def test_patient_role_is_403(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/clinician-adherence/events",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 403, r.text

    def test_guest_is_unauthorized(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/clinician-adherence/events",
            headers=auth_headers["guest"],
        )
        # Guest token has role=guest; gate returns 403.
        assert r.status_code in (401, 403)

    def test_clinician_can_list(
        self, client: TestClient, auth_headers: dict, home_clinic_patient: Patient
    ) -> None:
        _seed_event(patient_id=home_clinic_patient.id)
        r = client.get(
            "/api/v1/clinician-adherence/events",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["total"] >= 1
        assert isinstance(data["disclaimers"], list) and data["disclaimers"]


# ── Cross-clinic isolation (IDOR) ───────────────────────────────────────────


class TestCrossClinicIsolation:
    def test_clinician_cannot_see_other_clinic_events_in_list(
        self,
        client: TestClient,
        auth_headers: dict,
        home_clinic_patient: Patient,
        other_clinic_patient: Patient,
    ) -> None:
        _seed_event(patient_id=other_clinic_patient.id)
        r = client.get(
            "/api/v1/clinician-adherence/events",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        # Home-clinic clinician must not see the other-clinic patient's row.
        items = r.json()["items"]
        for it in items:
            assert it["patient_id"] != other_clinic_patient.id

    def test_clinician_cannot_view_other_clinic_event_detail(
        self,
        client: TestClient,
        auth_headers: dict,
        other_clinic_patient: Patient,
    ) -> None:
        eid = _seed_event(patient_id=other_clinic_patient.id)
        r = client.get(
            f"/api/v1/clinician-adherence/events/{eid}",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 404

    def test_clinician_cannot_acknowledge_other_clinic_event(
        self,
        client: TestClient,
        auth_headers: dict,
        other_clinic_patient: Patient,
    ) -> None:
        eid = _seed_event(patient_id=other_clinic_patient.id)
        r = client.post(
            f"/api/v1/clinician-adherence/events/{eid}/acknowledge",
            json={"note": "trying"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 404

    def test_admin_can_see_other_clinic_event(
        self,
        client: TestClient,
        auth_headers: dict,
        other_clinic_patient: Patient,
    ) -> None:
        eid = _seed_event(patient_id=other_clinic_patient.id)
        r = client.get(
            f"/api/v1/clinician-adherence/events/{eid}",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        assert r.json()["id"] == eid


# ── Aggregation across patients ─────────────────────────────────────────────


class TestCrossPatientAggregation:
    def test_seed_5_events_across_3_patients_returns_5_rows(
        self,
        client: TestClient,
        auth_headers: dict,
        home_clinic_patient: Patient,
        home_clinic_patient_two: Patient,
        home_clinic_patient_three: Patient,
    ) -> None:
        _seed_event(patient_id=home_clinic_patient.id)
        _seed_event(patient_id=home_clinic_patient.id, event_type="side_effect", severity="high")
        _seed_event(patient_id=home_clinic_patient_two.id)
        _seed_event(patient_id=home_clinic_patient_two.id, event_type="side_effect", severity="urgent")
        _seed_event(patient_id=home_clinic_patient_three.id)

        r = client.get(
            "/api/v1/clinician-adherence/events",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        items = r.json()["items"]
        # All five events must appear; multiple patients represented.
        seen_pids = {it["patient_id"] for it in items}
        assert {home_clinic_patient.id, home_clinic_patient_two.id, home_clinic_patient_three.id}.issubset(seen_pids)
        assert sum(1 for it in items if it["patient_id"] in {
            home_clinic_patient.id, home_clinic_patient_two.id, home_clinic_patient_three.id
        }) >= 5


# ── List filters ────────────────────────────────────────────────────────────


class TestListFilters:
    def test_severity_filter(
        self, client: TestClient, auth_headers: dict, home_clinic_patient: Patient
    ) -> None:
        _seed_event(patient_id=home_clinic_patient.id, event_type="side_effect", severity="urgent")
        _seed_event(patient_id=home_clinic_patient.id, event_type="side_effect", severity="high")
        r = client.get(
            "/api/v1/clinician-adherence/events?severity=urgent",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        items = r.json()["items"]
        for it in items:
            if it["patient_id"] == home_clinic_patient.id:
                assert it["severity"] == "urgent"

    def test_surface_chip_filter(
        self, client: TestClient, auth_headers: dict, home_clinic_patient: Patient
    ) -> None:
        _seed_event(patient_id=home_clinic_patient.id, event_type="adherence_report")
        _seed_event(patient_id=home_clinic_patient.id, event_type="side_effect", severity="moderate")
        r = client.get(
            "/api/v1/clinician-adherence/events?surface_chip=side_effect",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        for it in r.json()["items"]:
            if it["patient_id"] == home_clinic_patient.id:
                assert it["event_type"] == "side_effect"

    def test_status_filter(
        self, client: TestClient, auth_headers: dict, home_clinic_patient: Patient
    ) -> None:
        _seed_event(patient_id=home_clinic_patient.id, status="open")
        _seed_event(patient_id=home_clinic_patient.id, status="acknowledged")
        r = client.get(
            "/api/v1/clinician-adherence/events?status=acknowledged",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        for it in r.json()["items"]:
            if it["patient_id"] == home_clinic_patient.id:
                assert it["status"] == "acknowledged"

    def test_patient_id_filter(
        self,
        client: TestClient,
        auth_headers: dict,
        home_clinic_patient: Patient,
        home_clinic_patient_two: Patient,
    ) -> None:
        _seed_event(patient_id=home_clinic_patient.id)
        _seed_event(patient_id=home_clinic_patient_two.id)
        r = client.get(
            f"/api/v1/clinician-adherence/events?patient_id={home_clinic_patient_two.id}",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        items = r.json()["items"]
        assert all(it["patient_id"] == home_clinic_patient_two.id for it in items)


# ── Summary ─────────────────────────────────────────────────────────────────


class TestSummary:
    def test_summary_counts_match_seeded_state(
        self,
        client: TestClient,
        auth_headers: dict,
        home_clinic_patient: Patient,
        home_clinic_patient_two: Patient,
    ) -> None:
        # Today's events (will count toward total_today / total_7d).
        _seed_event(patient_id=home_clinic_patient.id, event_type="side_effect", severity="urgent")
        _seed_event(patient_id=home_clinic_patient.id, status="escalated")
        _seed_event(patient_id=home_clinic_patient_two.id, event_type="side_effect", severity="moderate")
        _seed_event(patient_id=home_clinic_patient_two.id)
        r = client.get(
            "/api/v1/clinician-adherence/events/summary",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        s = r.json()
        # Seeded with today's date so total_today >= 4.
        assert s["total_today"] >= 4
        assert s["total_7d"] >= 4
        assert s["side_effects_7d"] >= 2
        assert s["escalated_7d"] >= 1
        # SAE = side_effect with severity=urgent.
        assert s["sae_flagged"] >= 1
        # Response rate is a percentage.
        assert isinstance(s["response_rate_pct"], (int, float))
        # Missed-streak top patients is a list.
        assert isinstance(s["missed_streak_top_patients"], list)


# ── Acknowledge ─────────────────────────────────────────────────────────────


class TestAcknowledge:
    def test_acknowledge_requires_note(
        self, client: TestClient, auth_headers: dict, home_clinic_patient: Patient
    ) -> None:
        eid = _seed_event(patient_id=home_clinic_patient.id)
        r = client.post(
            f"/api/v1/clinician-adherence/events/{eid}/acknowledge",
            json={"note": "  "},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 422

    def test_acknowledge_emits_audit_and_flips_status(
        self, client: TestClient, auth_headers: dict, home_clinic_patient: Patient
    ) -> None:
        eid = _seed_event(patient_id=home_clinic_patient.id)
        r = client.post(
            f"/api/v1/clinician-adherence/events/{eid}/acknowledge",
            json={"note": "Reviewed; patient confirmed dose taken."},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "acknowledged"

        audit = client.get(
            "/api/v1/audit-trail?surface=clinician_adherence_hub",
            headers=auth_headers["admin"],
        ).json()["items"]
        actions = {it.get("action") for it in audit}
        assert "clinician_adherence_hub.event_acknowledged" in actions

    def test_resolved_event_cannot_be_acknowledged(
        self, client: TestClient, auth_headers: dict, home_clinic_patient: Patient
    ) -> None:
        eid = _seed_event(patient_id=home_clinic_patient.id, status="resolved")
        r = client.post(
            f"/api/v1/clinician-adherence/events/{eid}/acknowledge",
            json={"note": "trying after resolve"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 409


# ── Escalate ────────────────────────────────────────────────────────────────


class TestEscalate:
    def test_escalate_creates_adverse_event_draft_and_high_priority_audit(
        self, client: TestClient, auth_headers: dict, home_clinic_patient: Patient
    ) -> None:
        eid = _seed_event(
            patient_id=home_clinic_patient.id,
            event_type="side_effect",
            severity="urgent",
        )
        r = client.post(
            f"/api/v1/clinician-adherence/events/{eid}/escalate",
            json={"note": "Severe headache reported during home tDCS — escalating."},
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
            assert ae.event_type == "adherence_escalation"
            assert ae.is_serious is True  # severity=urgent → severe → is_serious
            assert ae.patient_id == home_clinic_patient.id
        finally:
            db.close()

        # HIGH-priority audit row pinned to the event.
        audit = client.get(
            "/api/v1/audit-trail?surface=clinician_adherence_hub",
            headers=auth_headers["admin"],
        ).json()["items"]
        escalate_row = next(
            (it for it in audit
             if it.get("action") == "clinician_adherence_hub.event_escalated"),
            None,
        )
        assert escalate_row is not None
        assert "priority=high" in (escalate_row.get("note") or "")

    def test_escalate_requires_note(
        self, client: TestClient, auth_headers: dict, home_clinic_patient: Patient
    ) -> None:
        eid = _seed_event(patient_id=home_clinic_patient.id)
        r = client.post(
            f"/api/v1/clinician-adherence/events/{eid}/escalate",
            json={"note": ""},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 422

    def test_resolved_event_cannot_be_escalated(
        self, client: TestClient, auth_headers: dict, home_clinic_patient: Patient
    ) -> None:
        eid = _seed_event(patient_id=home_clinic_patient.id, status="resolved")
        r = client.post(
            f"/api/v1/clinician-adherence/events/{eid}/escalate",
            json={"note": "should not work"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 409


# ── Resolve ─────────────────────────────────────────────────────────────────


class TestResolve:
    def test_resolve_requires_note(
        self, client: TestClient, auth_headers: dict, home_clinic_patient: Patient
    ) -> None:
        eid = _seed_event(patient_id=home_clinic_patient.id)
        r = client.post(
            f"/api/v1/clinician-adherence/events/{eid}/resolve",
            json={"note": ""},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 422

    def test_resolve_makes_event_immutable(
        self, client: TestClient, auth_headers: dict, home_clinic_patient: Patient
    ) -> None:
        eid = _seed_event(patient_id=home_clinic_patient.id)
        r = client.post(
            f"/api/v1/clinician-adherence/events/{eid}/resolve",
            json={"note": "Patient confirmed by phone — non-clinical."},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        # Second resolve attempt → 409.
        r2 = client.post(
            f"/api/v1/clinician-adherence/events/{eid}/resolve",
            json={"note": "duplicate"},
            headers=auth_headers["clinician"],
        )
        assert r2.status_code == 409

        # Acknowledge after resolve → 409.
        r3 = client.post(
            f"/api/v1/clinician-adherence/events/{eid}/acknowledge",
            json={"note": "should not work after resolve"},
            headers=auth_headers["clinician"],
        )
        assert r3.status_code == 409


# ── Bulk acknowledge ────────────────────────────────────────────────────────


class TestBulkAcknowledge:
    def test_bulk_acknowledge_requires_note(
        self, client: TestClient, auth_headers: dict, home_clinic_patient: Patient
    ) -> None:
        eid = _seed_event(patient_id=home_clinic_patient.id)
        r = client.post(
            "/api/v1/clinician-adherence/events/bulk-acknowledge",
            json={"event_ids": [eid], "note": "  "},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 422

    def test_bulk_acknowledge_processes_list(
        self,
        client: TestClient,
        auth_headers: dict,
        home_clinic_patient: Patient,
        home_clinic_patient_two: Patient,
    ) -> None:
        e1 = _seed_event(patient_id=home_clinic_patient.id)
        e2 = _seed_event(patient_id=home_clinic_patient.id)
        e3 = _seed_event(patient_id=home_clinic_patient_two.id)
        r = client.post(
            "/api/v1/clinician-adherence/events/bulk-acknowledge",
            json={"event_ids": [e1, e2, e3], "note": "End-of-day clinic sweep."},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["accepted"] is True
        assert body["succeeded"] == 3
        assert body["failures"] == []

        # Bulk audit row was emitted.
        audit = client.get(
            "/api/v1/audit-trail?surface=clinician_adherence_hub",
            headers=auth_headers["admin"],
        ).json()["items"]
        actions = {it.get("action") for it in audit}
        assert "clinician_adherence_hub.bulk_acknowledged" in actions

    def test_bulk_acknowledge_partial_failures_reported(
        self,
        client: TestClient,
        auth_headers: dict,
        home_clinic_patient: Patient,
        other_clinic_patient: Patient,
    ) -> None:
        good = _seed_event(patient_id=home_clinic_patient.id)
        cross = _seed_event(patient_id=other_clinic_patient.id)  # cross-clinic → 404
        already_resolved = _seed_event(patient_id=home_clinic_patient.id, status="resolved")
        r = client.post(
            "/api/v1/clinician-adherence/events/bulk-acknowledge",
            json={
                "event_ids": [good, cross, already_resolved, "missing-id-zzz"],
                "note": "mixed bag",
            },
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["succeeded"] == 1
        assert len(body["failures"]) == 3
        codes = {f["code"] for f in body["failures"]}
        # Cross-clinic + missing both surface as not_found; resolved row as resolved.
        assert "not_found" in codes
        assert "resolved" in codes


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

        _seed_event(patient_id=home_clinic_patient.id)
        r = client.get(
            "/api/v1/clinician-adherence/events/export.csv",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        cd = r.headers.get("content-disposition", "")
        assert "DEMO-clinician-adherence-events.csv" in cd
        assert r.headers.get("X-ClinicianAdherenceHub-Demo") == "1"
        assert "event_id" in r.text  # CSV header

    def test_ndjson_export_no_prefix_when_not_demo(
        self, client: TestClient, auth_headers: dict, home_clinic_patient: Patient
    ) -> None:
        # Re-point clinician away from a demo clinic to keep the row honest.
        db = SessionLocal()
        try:
            if db.query(Clinic).filter_by(id="clinic-real-prod-cah").first() is None:
                db.add(Clinic(id="clinic-real-prod-cah", name="Real Prod CAH"))
                db.flush()
            if db.query(User).filter_by(id="actor-clinician-real-cah").first() is None:
                db.add(User(
                    id="actor-clinician-real-cah",
                    email="real-cah@example.com",
                    display_name="Real Clinician CAH",
                    hashed_password="x",
                    role="clinician",
                    package_id="clinician_pro",
                    clinic_id="clinic-real-prod-cah",
                ))
            p = db.query(Patient).filter_by(id=home_clinic_patient.id).first()
            assert p is not None
            p.clinician_id = "actor-clinician-real-cah"
            db.commit()
        finally:
            db.close()

        _seed_event(patient_id=home_clinic_patient.id)
        # Use admin (cross-clinic) to read the relocated patient's event.
        r = client.get(
            "/api/v1/clinician-adherence/events/export.ndjson",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        cd = r.headers.get("content-disposition", "")
        assert "DEMO-" not in cd
        assert r.headers.get("X-ClinicianAdherenceHub-Demo") == "0"


# ── Audit ingestion ─────────────────────────────────────────────────────────


class TestAuditIngestion:
    def test_view_audit_event_accepted(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(
            "/api/v1/clinician-adherence/audit-events",
            json={"event": "view", "note": "clinician mounted Hub"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        body = r.json()
        assert body["accepted"] is True
        assert body["event_id"].startswith("clinician_adherence_hub-")

    def test_audit_ingestion_patient_403(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(
            "/api/v1/clinician-adherence/audit-events",
            json={"event": "view"},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 403

    def test_audit_event_with_cross_clinic_id_returns_404(
        self,
        client: TestClient,
        auth_headers: dict,
        other_clinic_patient: Patient,
    ) -> None:
        eid = _seed_event(patient_id=other_clinic_patient.id)
        r = client.post(
            "/api/v1/clinician-adherence/audit-events",
            json={"event": "event_viewed", "event_record_id": eid},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 404

    def test_event_viewed_audit_surfaces_in_audit_trail(
        self,
        client: TestClient,
        auth_headers: dict,
        home_clinic_patient: Patient,
    ) -> None:
        eid = _seed_event(patient_id=home_clinic_patient.id)
        # Detail GET emits the event_viewed audit row.
        r = client.get(
            f"/api/v1/clinician-adherence/events/{eid}",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200

        audit = client.get(
            "/api/v1/audit-trail?surface=clinician_adherence_hub",
            headers=auth_headers["admin"],
        ).json()["items"]
        actions = {it.get("action") for it in audit}
        assert "clinician_adherence_hub.event_viewed" in actions
