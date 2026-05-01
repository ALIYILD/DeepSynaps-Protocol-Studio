"""Tests for the Patient Wearables launch-audit (PR 2026-05-01).

EIGHTH and final patient-facing surface to receive the launch-audit
treatment after Symptom Journal (#344), Wellness Hub (#345), Patient
Reports (#346), Patient Messages (#347), Home Devices (#348),
Adherence Events (#350) and Home Program Tasks (#351).

Covers the patient-scope endpoints added in
``apps/api/app/routers/patient_wearables_router.py``:

* GET    /api/v1/patient-wearables/devices
* GET    /api/v1/patient-wearables/devices/summary
* GET    /api/v1/patient-wearables/devices/{id}
* GET    /api/v1/patient-wearables/devices/{id}/observations
* POST   /api/v1/patient-wearables/devices/{id}/sync
* POST   /api/v1/patient-wearables/devices/{id}/disconnect
* GET    /api/v1/patient-wearables/devices/{id}/observations/export.csv
* GET    /api/v1/patient-wearables/devices/{id}/observations/export.ndjson
* POST   /api/v1/patient-wearables/audit-events

Plus the cross-router contracts:

* ``wearables`` is whitelisted by ``audit_trail_router.KNOWN_SURFACES``.
* ``wearables`` is accepted by ``/api/v1/qeeg-analysis/audit-events``.
* Patient-side audit rows surface at
  ``/api/v1/audit-trail?surface=wearables``.
"""
from __future__ import annotations

import uuid as _uuid
from datetime import datetime as _dt, timedelta as _td, timezone as _tz

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.persistence.models import (
    AdverseEvent,
    ConsentRecord,
    DeviceConnection,
    Patient,
    WearableAlertFlag,
    WearableObservation,
)


# ── Fixtures ────────────────────────────────────────────────────────────────


@pytest.fixture
def demo_patient_with_consent() -> Patient:
    """Seed the Patient row that ``actor-patient-demo`` resolves to via email."""
    db = SessionLocal()
    try:
        patient = Patient(
            id="patient-wearables-demo",
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
            id="patient-wearables-withdrawn",
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
            id="patient-wearables-other",
            clinician_id="actor-clinician-demo",
            first_name="Other",
            last_name="Patient",
            email="other-wearables@example.com",
            consent_signed=True,
            status="active",
        )
        db.add(patient)
        db.commit()
        db.refresh(patient)
        return patient
    finally:
        db.close()


def _seed_device(
    *,
    patient_id: str,
    source: str = "fitbit",
    status: str = "connected",
    consent_given: bool = True,
    last_sync_at: _dt | None = None,
    external_id: str | None = None,
) -> str:
    """Create a device_connections row owned by ``patient_id``."""
    db = SessionLocal()
    try:
        did = external_id or f"dev-{_uuid.uuid4().hex[:10]}"
        row = DeviceConnection(
            id=did,
            patient_id=patient_id,
            source=source,
            source_type="wearable",
            display_name=source.replace("_", " ").title(),
            status=status,
            consent_given=consent_given,
            consent_given_at=_dt.now(_tz.utc) if consent_given else None,
            connected_at=_dt.now(_tz.utc),
            last_sync_at=last_sync_at,
            created_at=_dt.now(_tz.utc),
        )
        db.add(row)
        db.commit()
        return did
    finally:
        db.close()


def _seed_observation(
    *,
    patient_id: str,
    connection_id: str,
    metric_type: str = "rhr_bpm",
    value: float = 65.0,
    source: str = "fitbit",
    observed_at: _dt | None = None,
) -> str:
    db = SessionLocal()
    try:
        oid = str(_uuid.uuid4())
        db.add(
            WearableObservation(
                id=oid,
                patient_id=patient_id,
                connection_id=connection_id,
                source=source,
                source_type="wearable",
                metric_type=metric_type,
                value=value,
                unit="bpm" if metric_type == "rhr_bpm" else "%",
                observed_at=observed_at or _dt.now(_tz.utc),
                quality_flag="good",
            )
        )
        db.commit()
        return oid
    finally:
        db.close()


# ── Surface whitelist sanity ────────────────────────────────────────────────


def test_wearables_surface_in_audit_trail_known_surfaces() -> None:
    from app.routers.audit_trail_router import KNOWN_SURFACES

    assert "wearables" in KNOWN_SURFACES


def test_wearables_surface_accepted_by_qeeg_audit_events(
    client: TestClient, auth_headers: dict
) -> None:
    body = {
        "event": "view",
        "note": "wearables surface whitelist sanity",
        "surface": "wearables",
    }
    r = client.post(
        "/api/v1/qeeg-analysis/audit-events",
        json=body,
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("accepted") is True
    assert data.get("event_id", "").startswith("wearables-")


# ── Role gate ───────────────────────────────────────────────────────────────


class TestRoleGate:
    def test_patient_can_list_devices(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        _seed_device(patient_id=demo_patient_with_consent.id)
        r = client.get(
            "/api/v1/patient-wearables/devices",
            headers=auth_headers["patient"],
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
        # they use the existing /api/v1/wearables (no /patient-wearables
        # prefix) router for the clinician queue.
        r = client.get(
            "/api/v1/patient-wearables/devices",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 404, r.text

    def test_admin_calling_patient_scope_endpoint_returns_404(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        r = client.get(
            "/api/v1/patient-wearables/devices",
            headers=auth_headers["admin"],
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
        did = _seed_device(patient_id=other_patient.id)
        r = client.get(
            f"/api/v1/patient-wearables/devices/{did}",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 404, r.text

    def test_patient_cannot_sync_another_patients_device(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
        other_patient: Patient,
    ) -> None:
        did = _seed_device(patient_id=other_patient.id)
        r = client.post(
            f"/api/v1/patient-wearables/devices/{did}/sync",
            json={"note": "hijack attempt"},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 404, r.text

    def test_patient_cannot_disconnect_another_patients_device(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
        other_patient: Patient,
    ) -> None:
        did = _seed_device(patient_id=other_patient.id)
        r = client.post(
            f"/api/v1/patient-wearables/devices/{did}/disconnect",
            json={"note": "hijack"},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 404, r.text

    def test_patient_cannot_view_another_patients_observations(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
        other_patient: Patient,
    ) -> None:
        did = _seed_device(patient_id=other_patient.id)
        _seed_observation(
            patient_id=other_patient.id, connection_id=did, value=70.0
        )
        r = client.get(
            f"/api/v1/patient-wearables/devices/{did}/observations",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 404, r.text

    def test_devices_list_excludes_other_patients_devices(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
        other_patient: Patient,
    ) -> None:
        _seed_device(patient_id=other_patient.id, source="oura")
        r = client.get(
            "/api/v1/patient-wearables/devices",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200
        # Demo patient owns no devices in this test; other patient's
        # device must NOT leak into the list.
        assert r.json()["total"] == 0

    def test_audit_event_with_cross_patient_device_returns_404(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
        other_patient: Patient,
    ) -> None:
        did = _seed_device(patient_id=other_patient.id)
        r = client.post(
            "/api/v1/patient-wearables/audit-events",
            json={"event": "device_viewed", "device_id": did},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 404


# ── Devices list / summary ──────────────────────────────────────────────────


class TestListsAndSummary:
    def test_summary_counts_connected_synced_today_pending(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        # Connected, synced today.
        _seed_device(
            patient_id=demo_patient_with_consent.id,
            source="fitbit",
            last_sync_at=_dt.now(_tz.utc),
            external_id="dev-fitbit-1",
        )
        # Connected, synced 5 days ago.
        _seed_device(
            patient_id=demo_patient_with_consent.id,
            source="oura",
            last_sync_at=_dt.now(_tz.utc) - _td(days=5),
            external_id="dev-oura-1",
        )
        # Disconnected — should NOT count toward connected.
        _seed_device(
            patient_id=demo_patient_with_consent.id,
            source="garmin_connect",
            status="disconnected",
            external_id="dev-garmin-1",
        )

        r = client.get(
            "/api/v1/patient-wearables/devices/summary",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200, r.text
        s = r.json()
        assert s["connected"] == 2
        assert s["synced_today"] == 1
        assert s["synced_7d"] == 2
        assert s["consent_active"] is True


# ── Sync ────────────────────────────────────────────────────────────────────


class TestSync:
    def test_sync_emits_audit_and_updates_last_sync(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        did = _seed_device(patient_id=demo_patient_with_consent.id)
        r = client.post(
            f"/api/v1/patient-wearables/devices/{did}/sync",
            json={"rhr_bpm": 72.0},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["accepted"] is True
        assert body["device_id"] == did
        # Normal sample — no anomaly.
        assert body["anomaly_flag_id"] is None
        assert body["adverse_event_id"] is None

        audit = client.get(
            "/api/v1/audit-trail?surface=wearables",
            headers=auth_headers["admin"],
        ).json()["items"]
        actions = {it.get("action") for it in audit}
        assert "wearables.sync_triggered" in actions

    def test_sync_anomaly_creates_high_priority_mirror_and_ae_draft(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        did = _seed_device(patient_id=demo_patient_with_consent.id)
        r = client.post(
            f"/api/v1/patient-wearables/devices/{did}/sync",
            # HR 195 — above _HR_HIGH_THRESHOLD (180).
            json={"rhr_bpm": 195.0, "note": "felt my heart pounding"},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["anomaly_flag_id"] is not None
        assert body["adverse_event_id"] is not None
        assert body["pending_anomalies"] >= 1

        # Verify a WearableAlertFlag row was created.
        db = SessionLocal()
        try:
            flag = (
                db.query(WearableAlertFlag)
                .filter_by(patient_id=demo_patient_with_consent.id)
                .first()
            )
            assert flag is not None
            assert flag.severity == "urgent"
            assert "hr_high" in flag.flag_type
            # Verify AE Hub draft was created.
            ae = (
                db.query(AdverseEvent)
                .filter_by(patient_id=demo_patient_with_consent.id)
                .first()
            )
            assert ae is not None
            assert ae.event_type == "wearable_anomaly"
        finally:
            db.close()

        audit = client.get(
            "/api/v1/audit-trail?surface=wearables",
            headers=auth_headers["admin"],
        ).json()["items"]
        mirror = next(
            (
                it
                for it in audit
                if it.get("action") == "wearables.observation_anomaly_to_clinician"
            ),
            None,
        )
        assert mirror is not None
        assert "priority=high" in (mirror.get("note") or "")
        assert mirror.get("target_id") == "actor-clinician-demo"

    def test_sync_blocked_when_consent_withdrawn(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_consent_withdrawn: Patient,
    ) -> None:
        did = _seed_device(patient_id=demo_patient_consent_withdrawn.id)
        r = client.post(
            f"/api/v1/patient-wearables/devices/{did}/sync",
            json={},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 403

    def test_sync_blocked_when_device_disconnected(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        did = _seed_device(
            patient_id=demo_patient_with_consent.id, status="disconnected"
        )
        r = client.post(
            f"/api/v1/patient-wearables/devices/{did}/sync",
            json={},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 409


# ── Disconnect ──────────────────────────────────────────────────────────────


class TestDisconnect:
    def test_disconnect_requires_note_and_revokes_consent(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        did = _seed_device(patient_id=demo_patient_with_consent.id)
        # Blank note → 422.
        r = client.post(
            f"/api/v1/patient-wearables/devices/{did}/disconnect",
            json={"note": "  "},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 422

        r = client.post(
            f"/api/v1/patient-wearables/devices/{did}/disconnect",
            json={"note": "device misplaced"},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "disconnected"

        # Consent flag must flip to False so the bridge sync layer can
        # block future writes.
        db = SessionLocal()
        try:
            row = db.query(DeviceConnection).filter_by(id=did).first()
            assert row is not None
            assert row.status == "disconnected"
            assert row.consent_given is False
        finally:
            db.close()

        audit = client.get(
            "/api/v1/audit-trail?surface=wearables",
            headers=auth_headers["admin"],
        ).json()["items"]
        actions = {it.get("action") for it in audit}
        assert "wearables.wearable_disconnected" in actions
        assert "wearables.wearable_disconnected_to_clinician" in actions

    def test_disconnect_blocked_when_consent_withdrawn(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_consent_withdrawn: Patient,
    ) -> None:
        did = _seed_device(patient_id=demo_patient_consent_withdrawn.id)
        r = client.post(
            f"/api/v1/patient-wearables/devices/{did}/disconnect",
            json={"note": "consent test"},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 403


# ── Observations ────────────────────────────────────────────────────────────


class TestObservations:
    def test_observations_filtered_by_metric(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        did = _seed_device(patient_id=demo_patient_with_consent.id)
        _seed_observation(
            patient_id=demo_patient_with_consent.id,
            connection_id=did,
            metric_type="rhr_bpm",
            value=65.0,
        )
        _seed_observation(
            patient_id=demo_patient_with_consent.id,
            connection_id=did,
            metric_type="spo2_pct",
            value=98.0,
        )
        r = client.get(
            f"/api/v1/patient-wearables/devices/{did}/observations?metric=rhr_bpm",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200
        items = r.json()["items"]
        assert all(it["metric_type"] == "rhr_bpm" for it in items)
        assert any(it["value"] == 65.0 for it in items)


# ── Exports ─────────────────────────────────────────────────────────────────


class TestExports:
    def test_csv_export_demo_prefix(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        # Force the DEMO branch by stamping ``[DEMO]`` in patient.notes.
        db = SessionLocal()
        try:
            p = db.query(Patient).filter_by(id=demo_patient_with_consent.id).first()
            assert p is not None
            p.notes = "[DEMO] launch-audit"
            db.commit()
        finally:
            db.close()

        did = _seed_device(patient_id=demo_patient_with_consent.id)
        _seed_observation(
            patient_id=demo_patient_with_consent.id, connection_id=did
        )
        r = client.get(
            f"/api/v1/patient-wearables/devices/{did}/observations/export.csv",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200, r.text
        cd = r.headers.get("content-disposition", "")
        assert "DEMO-wearable-observations-" in cd
        assert r.headers.get("X-PatientWearables-Demo") == "1"
        assert "observation_id" in r.text  # CSV header row

    def test_ndjson_export_when_not_demo_no_prefix(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        # demo_patient_with_consent has notes=None and clinician_id=
        # "actor-clinician-demo"; the default conftest setup wires
        # actor-clinician-demo into a demo clinic
        # (clinic-cd-demo / clinic-demo-default), which trips the demo
        # branch via _patient_is_demo_pw. Re-point clinician for this case.
        db = SessionLocal()
        try:
            p = db.query(Patient).filter_by(id=demo_patient_with_consent.id).first()
            assert p is not None
            p.clinician_id = "non-demo-clinician"
            db.commit()
        finally:
            db.close()

        did = _seed_device(patient_id=demo_patient_with_consent.id)
        r = client.get(
            f"/api/v1/patient-wearables/devices/{did}/observations/export.ndjson",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200, r.text
        cd = r.headers.get("content-disposition", "")
        assert "DEMO-" not in cd
        assert r.headers.get("X-PatientWearables-Demo") == "0"


# ── Audit ingestion ─────────────────────────────────────────────────────────


class TestAuditIngestion:
    def test_view_audit_event_accepted(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        r = client.post(
            "/api/v1/patient-wearables/audit-events",
            json={"event": "view", "note": "patient mounted Wearables page"},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["accepted"] is True
        assert body["event_id"].startswith("wearables-")

    def test_audit_ingestion_clinician_403(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        r = client.post(
            "/api/v1/patient-wearables/audit-events",
            json={"event": "view"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 403

    def test_audit_ingestion_with_own_device_ok(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        did = _seed_device(patient_id=demo_patient_with_consent.id)
        r = client.post(
            "/api/v1/patient-wearables/audit-events",
            json={"event": "device_viewed", "device_id": did},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200

        # Verify the row reaches /api/v1/audit-trail.
        audit = client.get(
            "/api/v1/audit-trail?surface=wearables",
            headers=auth_headers["admin"],
        ).json()["items"]
        actions = {it.get("action") for it in audit}
        assert "wearables.device_viewed" in actions
