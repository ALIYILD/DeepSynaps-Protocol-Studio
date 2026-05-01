"""Tests for the Patient Home Devices launch-audit (PR 2026-05-01).

Fifth patient-facing surface to receive the launch-audit treatment
after Symptom Journal (#344), Wellness Hub (#345), Patient Reports
(#346), and Patient Messages (#347). Higher regulatory weight: device
session logs become clinical records feeding Course Detail telemetry,
AE Hub adverse-event detection, and signed completion reports.

Covers the patient-scope endpoints added in
``apps/api/app/routers/home_devices_patient_router.py``:

* GET    /api/v1/home-devices/devices
* GET    /api/v1/home-devices/devices/summary
* GET    /api/v1/home-devices/devices/{id}
* POST   /api/v1/home-devices/devices
* PATCH  /api/v1/home-devices/devices/{id}
* POST   /api/v1/home-devices/devices/{id}/decommission
* POST   /api/v1/home-devices/devices/{id}/mark-faulty
* POST   /api/v1/home-devices/devices/{id}/calibrate
* POST   /api/v1/home-devices/devices/{id}/sessions
* GET    /api/v1/home-devices/devices/{id}/sessions/export.csv
* GET    /api/v1/home-devices/devices/{id}/sessions/export.ndjson
* POST   /api/v1/home-devices/audit-events

Plus the cross-router contracts:

* ``home_devices`` is whitelisted by ``audit_trail_router.KNOWN_SURFACES``.
* ``home_devices`` is accepted by ``/api/v1/qeeg-analysis/audit-events``.
* Patient-side audit rows surface at ``/api/v1/audit-trail?surface=home_devices``.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.persistence.models import (
    ConsentRecord,
    DeviceSessionLog,
    Patient,
    PatientHomeDeviceRegistration,
)


# ── Fixtures ────────────────────────────────────────────────────────────────


@pytest.fixture
def demo_patient_with_consent() -> Patient:
    """Seed the Patient row that ``actor-patient-demo`` resolves to via email."""
    db = SessionLocal()
    try:
        patient = Patient(
            id="patient-home-devices-demo",
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
            id="patient-home-devices-withdrawn",
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
            id="patient-home-devices-other",
            clinician_id="actor-clinician-demo",
            first_name="Other",
            last_name="Patient",
            email="other-home-devices@example.com",
            consent_signed=True,
            status="active",
        )
        db.add(patient)
        db.commit()
        db.refresh(patient)
        return patient
    finally:
        db.close()


def _seed_registration(
    *,
    patient_id: str,
    clinic_id: str | None = "clinic-demo-default",
    device_name: str = "Synaps One",
    device_category: str = "tdcs",
    device_serial: str | None = "SN-1234",
    status: str = "active",
) -> str:
    import uuid as _uuid
    from datetime import datetime as _dt, timezone as _tz

    db = SessionLocal()
    try:
        rid = str(_uuid.uuid4())
        reg = PatientHomeDeviceRegistration(
            id=rid,
            patient_id=patient_id,
            assignment_id=None,
            clinic_id=clinic_id,
            registered_by_actor_id="actor-patient-demo",
            device_name=device_name,
            device_model=None,
            device_category=device_category,
            device_serial=device_serial,
            settings_json="{}",
            settings_revision=0,
            status=status,
            is_demo=False,
            created_at=_dt.now(_tz.utc),
            updated_at=_dt.now(_tz.utc),
        )
        db.add(reg)
        db.commit()
        return rid
    finally:
        db.close()


# ── Surface whitelist sanity ────────────────────────────────────────────────


def test_home_devices_surface_in_audit_trail_known_surfaces() -> None:
    from app.routers.audit_trail_router import KNOWN_SURFACES

    assert "home_devices" in KNOWN_SURFACES


def test_home_devices_surface_accepted_by_qeeg_audit_events(
    client: TestClient, auth_headers: dict
) -> None:
    body = {
        "event": "view",
        "note": "home_devices surface whitelist sanity",
        "surface": "home_devices",
    }
    r = client.post(
        "/api/v1/qeeg-analysis/audit-events",
        json=body,
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("accepted") is True
    assert data.get("event_id", "").startswith("home_devices-")


# ── Role gate ───────────────────────────────────────────────────────────────


class TestRoleGate:
    def test_patient_can_list_own_devices(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        _seed_registration(patient_id=demo_patient_with_consent.id)
        r = client.get(
            "/api/v1/home-devices/devices", headers=auth_headers["patient"]
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
        # The patient-scope /devices listing must 404 for clinicians —
        # they use the existing /assignments / /session-logs endpoints.
        r = client.get(
            "/api/v1/home-devices/devices", headers=auth_headers["clinician"]
        )
        assert r.status_code == 404, r.text

    def test_admin_calling_patient_scope_endpoint_returns_404(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        r = client.get(
            "/api/v1/home-devices/devices", headers=auth_headers["admin"]
        )
        assert r.status_code == 404, r.text


# ── Cross-patient isolation (IDOR) ──────────────────────────────────────────


class TestCrossPatientIsolation:
    def test_patient_cannot_view_another_patients_device(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
        other_patient: Patient,
    ) -> None:
        rid = _seed_registration(patient_id=other_patient.id)
        r = client.get(
            f"/api/v1/home-devices/devices/{rid}",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 404, r.text

    def test_patient_cannot_log_session_on_another_patients_device(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
        other_patient: Patient,
    ) -> None:
        rid = _seed_registration(patient_id=other_patient.id)
        from datetime import datetime as _dt, timezone as _tz
        today = _dt.now(_tz.utc).date().isoformat()
        r = client.post(
            f"/api/v1/home-devices/devices/{rid}/sessions",
            json={
                "session_date": today,
                "duration_minutes": 20,
                "completed": True,
            },
            headers=auth_headers["patient"],
        )
        assert r.status_code == 404, r.text

    def test_patient_cannot_decommission_another_patients_device(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
        other_patient: Patient,
    ) -> None:
        rid = _seed_registration(patient_id=other_patient.id)
        r = client.post(
            f"/api/v1/home-devices/devices/{rid}/decommission",
            json={"reason": "testing"},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 404, r.text

    def test_patient_cannot_mark_faulty_another_patients_device(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
        other_patient: Patient,
    ) -> None:
        rid = _seed_registration(patient_id=other_patient.id)
        r = client.post(
            f"/api/v1/home-devices/devices/{rid}/mark-faulty",
            json={"reason": "testing"},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 404, r.text


# ── Register ────────────────────────────────────────────────────────────────


class TestRegister:
    def test_register_creates_row_and_audits(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        r = client.post(
            "/api/v1/home-devices/devices",
            json={
                "device_name": "Synaps One",
                "device_category": "tdcs",
                "device_serial": "SN-NEW-1",
                "settings": {"intensity_ma": 1.5, "duration_min": 20},
            },
            headers=auth_headers["patient"],
        )
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["device_name"] == "Synaps One"
        assert body["device_category"] == "tdcs"
        assert body["status"] == "active"
        assert body["settings"] == {"intensity_ma": 1.5, "duration_min": 20}

        audit = client.get(
            "/api/v1/audit-trail?surface=home_devices",
            headers=auth_headers["admin"],
        ).json()["items"]
        actions = {it.get("action") for it in audit}
        assert "home_devices.device_registered" in actions

    def test_register_serial_uniqueness_within_clinic(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        r1 = client.post(
            "/api/v1/home-devices/devices",
            json={
                "device_name": "Synaps One",
                "device_category": "tdcs",
                "device_serial": "SN-DUP",
            },
            headers=auth_headers["patient"],
        )
        assert r1.status_code == 201, r1.text
        r2 = client.post(
            "/api/v1/home-devices/devices",
            json={
                "device_name": "Synaps One Two",
                "device_category": "tdcs",
                "device_serial": "SN-DUP",
            },
            headers=auth_headers["patient"],
        )
        assert r2.status_code == 409, r2.text
        assert r2.json().get("code") == "serial_conflict"

    def test_register_blocked_when_consent_withdrawn(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_consent_withdrawn: Patient,
    ) -> None:
        r = client.post(
            "/api/v1/home-devices/devices",
            json={
                "device_name": "Synaps One",
                "device_category": "tdcs",
            },
            headers=auth_headers["patient"],
        )
        assert r.status_code == 403, r.text
        assert r.json().get("code") == "consent_inactive"

    def test_register_invalid_category_returns_422(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        r = client.post(
            "/api/v1/home-devices/devices",
            json={
                "device_name": "Synaps One",
                "device_category": "not-a-category",
            },
            headers=auth_headers["patient"],
        )
        assert r.status_code == 422


# ── Decommission ────────────────────────────────────────────────────────────


class TestDecommission:
    def test_decommission_requires_note(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        rid = _seed_registration(patient_id=demo_patient_with_consent.id)
        r = client.post(
            f"/api/v1/home-devices/devices/{rid}/decommission",
            json={"reason": ""},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 422, r.text

    def test_decommission_succeeds_with_note_and_is_immutable(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        rid = _seed_registration(patient_id=demo_patient_with_consent.id)
        r = client.post(
            f"/api/v1/home-devices/devices/{rid}/decommission",
            json={"reason": "device returned to clinic"},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "decommissioned"

        # Subsequent edits / calibrate / decommission / log session all 409.
        r2 = client.patch(
            f"/api/v1/home-devices/devices/{rid}",
            json={"settings": {"intensity_ma": 2.0}},
            headers=auth_headers["patient"],
        )
        assert r2.status_code == 409
        r3 = client.post(
            f"/api/v1/home-devices/devices/{rid}/calibrate",
            json={"result": "passed"},
            headers=auth_headers["patient"],
        )
        assert r3.status_code == 409
        from datetime import datetime as _dt, timezone as _tz
        today = _dt.now(_tz.utc).date().isoformat()
        r4 = client.post(
            f"/api/v1/home-devices/devices/{rid}/sessions",
            json={"session_date": today, "duration_minutes": 20},
            headers=auth_headers["patient"],
        )
        assert r4.status_code == 409


# ── Mark-faulty ─────────────────────────────────────────────────────────────


class TestMarkFaulty:
    def test_mark_faulty_emits_clinician_visible_audit(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        rid = _seed_registration(patient_id=demo_patient_with_consent.id)
        r = client.post(
            f"/api/v1/home-devices/devices/{rid}/mark-faulty",
            json={"reason": "intensity slider stuck"},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "faulty"

        audit = client.get(
            "/api/v1/audit-trail?surface=home_devices",
            headers=auth_headers["admin"],
        ).json()["items"]
        actions = {it.get("action") for it in audit}
        # Patient-side row.
        assert "home_devices.device_marked_faulty" in actions
        # Clinician-visible mirror at HIGH priority.
        mirror = next(
            (
                it
                for it in audit
                if it.get("action") == "home_devices.device_faulty_to_clinician"
            ),
            None,
        )
        assert mirror is not None
        assert "priority=high" in (mirror.get("note") or "")
        assert mirror.get("target_id") == "actor-clinician-demo"

    def test_mark_faulty_blocks_session_logging(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        rid = _seed_registration(patient_id=demo_patient_with_consent.id)
        client.post(
            f"/api/v1/home-devices/devices/{rid}/mark-faulty",
            json={"reason": "test fault"},
            headers=auth_headers["patient"],
        )
        from datetime import datetime as _dt, timezone as _tz
        today = _dt.now(_tz.utc).date().isoformat()
        r = client.post(
            f"/api/v1/home-devices/devices/{rid}/sessions",
            json={"session_date": today, "duration_minutes": 20},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 409, r.text
        assert r.json().get("code") == "device_faulty"


# ── Calibration ─────────────────────────────────────────────────────────────


class TestCalibration:
    def test_calibration_persists_result_and_bumps_last_calibrated_at(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        rid = _seed_registration(patient_id=demo_patient_with_consent.id)
        r = client.post(
            f"/api/v1/home-devices/devices/{rid}/calibrate",
            json={"result": "passed", "notes": "all good"},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["result"] == "passed"
        assert body["last_calibrated_at"]

        # Detail reflects last_calibrated_at.
        detail = client.get(
            f"/api/v1/home-devices/devices/{rid}",
            headers=auth_headers["patient"],
        ).json()
        assert detail["last_calibrated_at"]


# ── Session log ─────────────────────────────────────────────────────────────


class TestSessionLog:
    def test_log_session_persists_and_audits(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        rid = _seed_registration(patient_id=demo_patient_with_consent.id)
        from datetime import datetime as _dt, timezone as _tz
        today = _dt.now(_tz.utc).date().isoformat()
        r = client.post(
            f"/api/v1/home-devices/devices/{rid}/sessions",
            json={
                "session_date": today,
                "duration_minutes": 20,
                "completed": True,
                "tolerance_rating": 4,
            },
            headers=auth_headers["patient"],
        )
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["accepted"] is True
        assert body["status"] == "pending_review"

        # Row exists in DB.
        db = SessionLocal()
        try:
            log = db.query(DeviceSessionLog).filter_by(id=body["id"]).first()
            assert log is not None
            assert log.tolerance_rating == 4
        finally:
            db.close()

        audit = client.get(
            "/api/v1/audit-trail?surface=home_devices",
            headers=auth_headers["admin"],
        ).json()["items"]
        actions = {it.get("action") for it in audit}
        assert "home_devices.session_logged" in actions

    def test_log_session_rejects_future_date(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        rid = _seed_registration(patient_id=demo_patient_with_consent.id)
        r = client.post(
            f"/api/v1/home-devices/devices/{rid}/sessions",
            json={"session_date": "2099-01-01", "duration_minutes": 20},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 422


# ── Exports ─────────────────────────────────────────────────────────────────


class TestExports:
    def test_csv_export_demo_prefix(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        # Flip the patient's notes to [DEMO] so _patient_is_demo_hd flags it.
        db = SessionLocal()
        try:
            p = db.query(Patient).filter_by(id=demo_patient_with_consent.id).first()
            p.notes = "[DEMO] seed patient"
            db.commit()
        finally:
            db.close()

        rid = _seed_registration(patient_id=demo_patient_with_consent.id)
        r = client.get(
            f"/api/v1/home-devices/devices/{rid}/sessions/export.csv",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200, r.text
        cd = r.headers.get("content-disposition", "")
        assert "DEMO-" in cd
        assert r.headers.get("x-home-devices-demo") == "1"
        # CSV header line is honest.
        assert "session_id,registration_id,session_date" in r.text

    def test_ndjson_export_runs_and_audits(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        rid = _seed_registration(patient_id=demo_patient_with_consent.id)
        r = client.get(
            f"/api/v1/home-devices/devices/{rid}/sessions/export.ndjson",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("application/x-ndjson")
        audit = client.get(
            "/api/v1/audit-trail?surface=home_devices",
            headers=auth_headers["admin"],
        ).json()["items"]
        actions = {it.get("action") for it in audit}
        assert "home_devices.export" in actions


# ── Audit-event ingestion ───────────────────────────────────────────────────


class TestAuditIngestion:
    def test_post_audit_event_visible_at_audit_trail(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        r = client.post(
            "/api/v1/home-devices/audit-events",
            json={"event": "view", "note": "page mount"},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["accepted"] is True
        assert body["event_id"].startswith("home_devices-")

        listing = client.get(
            "/api/v1/audit-trail?surface=home_devices",
            headers=auth_headers["admin"],
        ).json()
        assert any(
            (
                it.get("target_type") == "home_devices"
                or it.get("surface") == "home_devices"
            )
            for it in listing.get("items", [])
        )

    def test_clinician_cannot_post_home_devices_audit_events(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(
            "/api/v1/home-devices/audit-events",
            json={"event": "view"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 403

    def test_audit_event_with_cross_patient_device_returns_404(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
        other_patient: Patient,
    ) -> None:
        rid = _seed_registration(patient_id=other_patient.id)
        r = client.post(
            "/api/v1/home-devices/audit-events",
            json={"event": "device_viewed", "device_id": rid},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 404


# ── Summary ─────────────────────────────────────────────────────────────────


class TestSummary:
    def test_summary_counts_status(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        _seed_registration(patient_id=demo_patient_with_consent.id, device_serial="SN-A")
        _seed_registration(patient_id=demo_patient_with_consent.id, device_serial="SN-B", status="faulty")
        _seed_registration(patient_id=demo_patient_with_consent.id, device_serial="SN-C", status="decommissioned")
        r = client.get(
            "/api/v1/home-devices/devices/summary",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200, r.text
        s = r.json()
        assert s["total_devices"] == 3
        assert s["active"] == 1
        assert s["faulty"] == 1
        assert s["decommissioned"] == 1
        assert s["consent_active"] is True


# ── Consent-revoked read-only ───────────────────────────────────────────────


class TestConsentRevoked:
    def test_consent_revoked_still_allows_read(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_consent_withdrawn: Patient,
    ) -> None:
        _seed_registration(patient_id=demo_patient_consent_withdrawn.id)
        r = client.get(
            "/api/v1/home-devices/devices",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["consent_active"] is False
        assert body["total"] == 1

    def test_consent_revoked_blocks_calibration(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_consent_withdrawn: Patient,
    ) -> None:
        rid = _seed_registration(patient_id=demo_patient_consent_withdrawn.id)
        r = client.post(
            f"/api/v1/home-devices/devices/{rid}/calibrate",
            json={"result": "passed"},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 403
        assert r.json().get("code") == "consent_inactive"
