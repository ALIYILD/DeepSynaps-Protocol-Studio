"""Tests for the Adverse Events Hub launch-audit hardening (2026-05-01).

Covers the new endpoints in
``apps/api/app/routers/adverse_events_router.py`` for the page-level
Adverse Events Hub drill-in surface (NOT the per-record adverse events
which are covered by ``test_adverse_events_launch_audit.py``):

* GET    /api/v1/adverse-events                 (now accepts trial_id + q)
* GET    /api/v1/adverse-events/summary         (now accepts trial_id + since/until)
* GET    /api/v1/adverse-events/detail
* GET    /api/v1/adverse-events/export.csv      (now DEMO-prefixed)
* GET    /api/v1/adverse-events/export.ndjson   (new)
* POST   /api/v1/adverse-events/audit-events    (page-level audit ingestion)
* POST   /api/v1/adverse-events/{id}/close
* POST   /api/v1/adverse-events/{id}/reopen
* PATCH  /api/v1/adverse-events/{id}            (closed → 409 immutable)

Also asserts that the ``adverse_events_hub`` surface is whitelisted by both
``audit_trail_router.KNOWN_SURFACES`` and the qEEG audit-events endpoint
(per the cross-router audit-hook spec).
"""
from __future__ import annotations

import csv
import io
import json
import uuid
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal


# ── Helpers ──────────────────────────────────────────────────────────────────


def _ensure_demo_clinician_in_clinic() -> None:
    from app.persistence.models import Clinic, User

    db = SessionLocal()
    try:
        existing = db.query(User).filter_by(id="actor-clinician-demo").first()
        if existing is not None and existing.clinic_id:
            return
        clinic_id = "clinic-ae-hub"
        if db.query(Clinic).filter_by(id=clinic_id).first() is None:
            db.add(Clinic(id=clinic_id, name="AE Hub Demo Clinic"))
            db.flush()
        if existing is None:
            db.add(
                User(
                    id="actor-clinician-demo",
                    email="ae_hub@example.com",
                    display_name="AE Hub Clinician",
                    hashed_password="x",
                    role="clinician",
                    package_id="clinician_pro",
                    clinic_id=clinic_id,
                )
            )
        else:
            existing.clinic_id = clinic_id
        db.commit()
    finally:
        db.close()


@pytest.fixture
def patient_id(client: TestClient, auth_headers: dict) -> str:
    _ensure_demo_clinician_in_clinic()
    resp = client.post(
        "/api/v1/patients",
        json={"first_name": "AE", "last_name": "HubPatient", "dob": "1990-04-01", "gender": "F"},
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 201
    return resp.json()["id"]


def _create_ae(
    client: TestClient,
    headers: dict,
    *,
    patient_id: str,
    course_id: str | None = None,
    severity: str = "mild",
    event_type: str = "headache",
    is_demo: bool = False,
    body_system: str | None = None,
) -> dict:
    body = {
        "patient_id": patient_id,
        "event_type": event_type,
        "severity": severity,
        "is_demo": is_demo,
    }
    if course_id:
        body["course_id"] = course_id
    if body_system:
        body["body_system"] = body_system
    r = client.post("/api/v1/adverse-events", json=body, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


def _seed_irb_protocol(*, clinic_id: str | None = "clinic-ae-hub") -> str:
    from app.persistence.models import IRBProtocol

    db = SessionLocal()
    try:
        proto_id = str(uuid.uuid4())
        db.add(
            IRBProtocol(
                id=proto_id,
                clinic_id=clinic_id,
                protocol_code="DS-AE-2026-001",
                title="AE Hub Drill-In Test Protocol",
                description="seed",
                pi_user_id="actor-clinician-demo",
                phase="ii",
                status="active",
                created_by="actor-clinician-demo",
            )
        )
        db.commit()
        return proto_id
    finally:
        db.close()


def _seed_trial_with_enrolled(
    patient_ids: list[str],
    *,
    clinic_id: str = "clinic-ae-hub",
) -> str:
    from app.persistence.models import (
        ClinicalTrial,
        ClinicalTrialEnrollment,
    )

    proto_id = _seed_irb_protocol(clinic_id=clinic_id)
    db = SessionLocal()
    try:
        tid = str(uuid.uuid4())
        db.add(
            ClinicalTrial(
                id=tid,
                clinic_id=clinic_id,
                irb_protocol_id=proto_id,
                title="AE Hub Drill-In Test Trial",
                description="x",
                pi_user_id="actor-clinician-demo",
                phase="ii",
                status="recruiting",
                created_by="actor-clinician-demo",
            )
        )
        db.flush()
        for pid in patient_ids:
            db.add(
                ClinicalTrialEnrollment(
                    id=str(uuid.uuid4()),
                    trial_id=tid,
                    patient_id=pid,
                    enrolled_by="actor-clinician-demo",
                    status="active",
                )
            )
        db.commit()
        return tid
    finally:
        db.close()


# ── Surface whitelist sanity ──────────────────────────────────────────────


def test_adverse_events_hub_surface_in_audit_trail_known_surfaces():
    from app.routers.audit_trail_router import KNOWN_SURFACES

    assert "adverse_events_hub" in KNOWN_SURFACES


def test_adverse_events_hub_surface_accepted_by_qeeg_audit_events(
    client: TestClient, auth_headers: dict
) -> None:
    _ensure_demo_clinician_in_clinic()
    body = {
        "event": "view",
        "note": "ae_hub surface whitelist sanity",
        "surface": "adverse_events_hub",
    }
    r = client.post(
        "/api/v1/qeeg-analysis/audit-events",
        json=body,
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("accepted") is True
    assert data.get("event_id", "").startswith("adverse_events_hub-")


# ── /detail aggregated drill-in payload ────────────────────────────────────


class TestDetailEndpoint:
    def test_role_gate_guest_forbidden(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/adverse-events/detail",
            headers=auth_headers["guest"],
        )
        assert r.status_code == 403

    def test_unknown_drill_in_surface_422(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _ensure_demo_clinician_in_clinic()
        r = client.get(
            "/api/v1/adverse-events/detail"
            "?source_target_type=evil&source_target_id=x",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 422
        assert r.json()["code"] == "invalid_drill_in"

    def test_half_supplied_drill_in_422(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _ensure_demo_clinician_in_clinic()
        r = client.get(
            "/api/v1/adverse-events/detail?source_target_type=patient_profile",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 422
        assert r.json()["code"] == "invalid_drill_in"

    def test_no_drill_in_returns_clinic_scope(
        self, client: TestClient, auth_headers: dict, patient_id: str
    ) -> None:
        h = auth_headers["clinician"]
        _create_ae(client, h, patient_id=patient_id, severity="mild")
        r = client.get("/api/v1/adverse-events/detail", headers=h)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["drill_in"]["active"] is False
        assert data["drill_in"]["source_target_type"] is None
        assert isinstance(data["disclaimers"], list) and data["disclaimers"]
        assert isinstance(data["scope_limitations"], list) and data["scope_limitations"]
        assert data["total"] == 1

    def test_drill_in_patient_profile_filters_by_patient(
        self, client: TestClient, auth_headers: dict, patient_id: str
    ) -> None:
        h = auth_headers["clinician"]
        # Two patients, one AE each.
        other_pid = client.post(
            "/api/v1/patients",
            json={"first_name": "Other", "last_name": "Patient", "dob": "1985-01-01", "gender": "M"},
            headers=h,
        ).json()["id"]
        _create_ae(client, h, patient_id=patient_id, severity="mild")
        _create_ae(client, h, patient_id=other_pid, severity="moderate")
        r = client.get(
            f"/api/v1/adverse-events/detail"
            f"?source_target_type=patient_profile&source_target_id={patient_id}",
            headers=h,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["drill_in"]["active"] is True
        assert data["drill_in"]["source_target_type"] == "patient_profile"
        assert data["drill_in"]["source_target_id"] == patient_id
        assert data["total"] == 1
        assert data["items"][0]["patient_id"] == patient_id
        # Summary echoes the patient filter.
        assert data["summary"]["filtered_by_patient_id"] == patient_id
        assert data["summary"]["filtered_by_course_id"] is None

    def test_drill_in_course_detail_filters_by_course(
        self, client: TestClient, auth_headers: dict, patient_id: str
    ) -> None:
        h = auth_headers["clinician"]
        # Seed a TreatmentCourse directly so the test does not depend on
        # the protocol-registry validation pipeline (which is exercised in
        # the dedicated course tests).
        from app.persistence.models import TreatmentCourse

        course_id = str(uuid.uuid4())
        db = SessionLocal()
        try:
            db.add(
                TreatmentCourse(
                    id=course_id,
                    patient_id=patient_id,
                    clinician_id="actor-clinician-demo",
                    condition_slug="depression",
                    modality_slug="tms",
                    protocol_id="sp-01",
                    status="active",
                    review_required=False,
                    planned_sessions_total=20,
                )
            )
            db.commit()
        finally:
            db.close()
        _create_ae(client, h, patient_id=patient_id, severity="mild")
        _create_ae(client, h, patient_id=patient_id, course_id=course_id, severity="moderate")
        r = client.get(
            f"/api/v1/adverse-events/detail"
            f"?source_target_type=course_detail&source_target_id={course_id}",
            headers=h,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["total"] == 1
        assert data["items"][0]["course_id"] == course_id
        assert data["summary"]["filtered_by_course_id"] == course_id

    def test_drill_in_clinical_trials_filters_by_trial(
        self, client: TestClient, auth_headers: dict, patient_id: str
    ) -> None:
        h = auth_headers["clinician"]
        # Seed an enrolled patient + AE on that patient.
        _create_ae(client, h, patient_id=patient_id, severity="serious")
        # Second patient — NOT enrolled in the trial.
        other_pid = client.post(
            "/api/v1/patients",
            json={"first_name": "OutOf", "last_name": "Trial", "dob": "1985-01-01", "gender": "M"},
            headers=h,
        ).json()["id"]
        _create_ae(client, h, patient_id=other_pid, severity="mild")
        trial_id = _seed_trial_with_enrolled([patient_id])
        r = client.get(
            f"/api/v1/adverse-events/detail"
            f"?source_target_type=clinical_trials&source_target_id={trial_id}",
            headers=h,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["total"] == 1
        assert data["items"][0]["patient_id"] == patient_id
        assert data["summary"]["filtered_by_trial_id"] == trial_id

    def test_drill_in_invalid_trial_id_422(
        self, client: TestClient, auth_headers: dict, patient_id: str
    ) -> None:
        h = auth_headers["clinician"]
        _create_ae(client, h, patient_id=patient_id, severity="mild")
        r = client.get(
            "/api/v1/adverse-events/detail"
            "?source_target_type=clinical_trials&source_target_id=does-not-exist",
            headers=h,
        )
        assert r.status_code == 422
        assert r.json()["code"] == "invalid_trial"


# ── Summary honors filters ────────────────────────────────────────────────


class TestSummaryFilters:
    def test_summary_counts_honors_patient_id(
        self, client: TestClient, auth_headers: dict, patient_id: str
    ) -> None:
        h = auth_headers["clinician"]
        other_pid = client.post(
            "/api/v1/patients",
            json={"first_name": "Other", "last_name": "P", "dob": "1985-01-01", "gender": "M"},
            headers=h,
        ).json()["id"]
        _create_ae(client, h, patient_id=patient_id, severity="serious")
        _create_ae(client, h, patient_id=other_pid, severity="mild")

        full = client.get("/api/v1/adverse-events/summary", headers=h).json()
        scoped = client.get(
            f"/api/v1/adverse-events/summary?patient_id={patient_id}", headers=h
        ).json()
        assert full["total"] == 2
        assert scoped["total"] == 1
        assert scoped["filtered_by_patient_id"] == patient_id
        # New surface counts (closed / unexpected / capa_required / demo)
        for k in ("closed", "unexpected", "capa_required", "demo"):
            assert k in scoped, k
        # CAPA = SAE | reportable. The serious row qualifies.
        assert scoped["capa_required"] >= 1

    def test_summary_counts_honors_trial_id(
        self, client: TestClient, auth_headers: dict, patient_id: str
    ) -> None:
        h = auth_headers["clinician"]
        other_pid = client.post(
            "/api/v1/patients",
            json={"first_name": "Other", "last_name": "P", "dob": "1985-01-01", "gender": "M"},
            headers=h,
        ).json()["id"]
        _create_ae(client, h, patient_id=patient_id, severity="moderate")
        _create_ae(client, h, patient_id=other_pid, severity="mild")
        trial_id = _seed_trial_with_enrolled([patient_id])
        scoped = client.get(
            f"/api/v1/adverse-events/summary?trial_id={trial_id}", headers=h
        ).json()
        assert scoped["total"] == 1
        assert scoped["filtered_by_trial_id"] == trial_id


# ── List filters: trial_id + q ────────────────────────────────────────────


class TestListNewFilters:
    def test_list_filter_trial_id(
        self, client: TestClient, auth_headers: dict, patient_id: str
    ) -> None:
        h = auth_headers["clinician"]
        other_pid = client.post(
            "/api/v1/patients",
            json={"first_name": "X", "last_name": "Y", "dob": "1985-01-01", "gender": "M"},
            headers=h,
        ).json()["id"]
        _create_ae(client, h, patient_id=patient_id, severity="mild")
        _create_ae(client, h, patient_id=other_pid, severity="mild")
        trial_id = _seed_trial_with_enrolled([patient_id])
        r = client.get(
            f"/api/v1/adverse-events?trial_id={trial_id}", headers=h
        )
        assert r.status_code == 200
        items = r.json()["items"]
        assert len(items) == 1
        assert items[0]["patient_id"] == patient_id

    def test_list_filter_q_text(
        self, client: TestClient, auth_headers: dict, patient_id: str
    ) -> None:
        h = auth_headers["clinician"]
        _create_ae(client, h, patient_id=patient_id, event_type="headache")
        _create_ae(client, h, patient_id=patient_id, event_type="nausea")
        r = client.get(
            "/api/v1/adverse-events?q=head", headers=h
        )
        items = r.json()["items"]
        assert all("head" in (it["event_type"] or "").lower() for it in items)
        assert any(it["event_type"] == "headache" for it in items)

    def test_invalid_trial_id_422(
        self, client: TestClient, auth_headers: dict, patient_id: str
    ) -> None:
        h = auth_headers["clinician"]
        _create_ae(client, h, patient_id=patient_id, severity="mild")
        r = client.get(
            "/api/v1/adverse-events?trial_id=does-not-exist", headers=h
        )
        assert r.status_code == 422
        assert r.json()["code"] == "invalid_trial"


# ── Exports — DEMO prefix + filter-aware ──────────────────────────────────


class TestExports:
    def test_csv_export_demo_prefix(
        self, client: TestClient, auth_headers: dict, patient_id: str
    ) -> None:
        h = auth_headers["clinician"]
        _create_ae(client, h, patient_id=patient_id, severity="mild", is_demo=True)
        r = client.get("/api/v1/adverse-events/export.csv", headers=h)
        assert r.status_code == 200
        text = r.text
        assert text.startswith("# DEMO"), text[:80]
        assert r.headers.get("X-Adverse-Event-Demo-Rows") == "1"

    def test_csv_export_no_demo_prefix_when_real_only(
        self, client: TestClient, auth_headers: dict, patient_id: str
    ) -> None:
        h = auth_headers["clinician"]
        _create_ae(client, h, patient_id=patient_id, severity="mild", is_demo=False)
        r = client.get("/api/v1/adverse-events/export.csv", headers=h)
        assert r.status_code == 200
        # First non-empty line is the CSV header.
        first_line = r.text.splitlines()[0]
        assert not first_line.startswith("# DEMO"), first_line
        assert r.headers.get("X-Adverse-Event-Demo-Rows") == "0"

    def test_ndjson_export_envelope(
        self, client: TestClient, auth_headers: dict, patient_id: str
    ) -> None:
        h = auth_headers["clinician"]
        _create_ae(client, h, patient_id=patient_id, severity="mild")
        r = client.get("/api/v1/adverse-events/export.ndjson", headers=h)
        assert r.status_code == 200, r.text
        assert "x-ndjson" in r.headers.get("content-type", "")
        lines = [ln for ln in r.text.splitlines() if ln.strip()]
        assert lines, "ndjson body must have at least one line"
        # No demo row → no _meta line; the first line is a real AE record.
        first = json.loads(lines[0])
        assert "id" in first
        assert "_meta" not in first

    def test_ndjson_export_demo_meta_line(
        self, client: TestClient, auth_headers: dict, patient_id: str
    ) -> None:
        h = auth_headers["clinician"]
        _create_ae(client, h, patient_id=patient_id, severity="mild", is_demo=True)
        r = client.get("/api/v1/adverse-events/export.ndjson", headers=h)
        assert r.status_code == 200
        lines = [ln for ln in r.text.splitlines() if ln.strip()]
        assert json.loads(lines[0])["_meta"] == "DEMO"

    def test_export_filters_by_trial_id(
        self, client: TestClient, auth_headers: dict, patient_id: str
    ) -> None:
        h = auth_headers["clinician"]
        other_pid = client.post(
            "/api/v1/patients",
            json={"first_name": "X", "last_name": "Y", "dob": "1985-01-01", "gender": "M"},
            headers=h,
        ).json()["id"]
        _create_ae(client, h, patient_id=patient_id, event_type="seizure")
        _create_ae(client, h, patient_id=other_pid, event_type="rash")
        trial_id = _seed_trial_with_enrolled([patient_id])
        r = client.get(
            f"/api/v1/adverse-events/export.csv?trial_id={trial_id}", headers=h
        )
        assert r.status_code == 200
        rows = list(csv.DictReader(io.StringIO(r.text)))
        assert len(rows) == 1
        assert rows[0]["event_type"] == "seizure"


# ── Audit-events POST round-trip ──────────────────────────────────────────


class TestAuditEvents:
    def test_audit_event_accepted(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _ensure_demo_clinician_in_clinic()
        r = client.post(
            "/api/v1/adverse-events/audit-events",
            json={"event": "page_loaded", "note": "test"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        body = r.json()
        assert body["accepted"] is True
        assert body["event_id"].startswith("adverse_events_hub-")

    def test_audit_event_visible_in_audit_trail(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _ensure_demo_clinician_in_clinic()
        client.post(
            "/api/v1/adverse-events/audit-events",
            json={"event": "filter_changed", "note": "severity=serious"},
            headers=auth_headers["clinician"],
        )
        r = client.get(
            "/api/v1/audit-trail?surface=adverse_events_hub",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        items = data.get("items", [])
        assert any(
            (it.get("surface") == "adverse_events_hub"
             or it.get("target_type") == "adverse_events_hub")
            for it in items
        )

    def test_audit_event_demo_flag_recorded(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _ensure_demo_clinician_in_clinic()
        r = client.post(
            "/api/v1/adverse-events/audit-events",
            json={
                "event": "page_loaded",
                "note": "page mount",
                "using_demo_data": True,
            },
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        listing = client.get(
            "/api/v1/audit-trail?surface=adverse_events_hub",
            headers=auth_headers["clinician"],
        ).json()
        items = listing.get("items", [])
        cd = [
            it for it in items
            if it.get("target_type") == "adverse_events_hub"
        ]
        assert any("DEMO" in (it.get("note") or "") for it in cd)

    def test_audit_event_drill_in_pair_recorded(
        self, client: TestClient, auth_headers: dict, patient_id: str
    ) -> None:
        h = auth_headers["clinician"]
        r = client.post(
            "/api/v1/adverse-events/audit-events",
            json={
                "event": "page_loaded",
                "source_target_type": "patient_profile",
                "source_target_id": patient_id,
            },
            headers=h,
        )
        assert r.status_code == 200
        listing = client.get(
            "/api/v1/audit-trail?surface=adverse_events_hub", headers=h
        ).json()
        items = listing.get("items", [])
        rows = [it for it in items if it.get("target_type") == "adverse_events_hub"]
        assert any(
            f"drill_in_from=patient_profile:{patient_id}" in (it.get("note") or "")
            for it in rows
        )

    def test_audit_event_validation(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _ensure_demo_clinician_in_clinic()
        r = client.post(
            "/api/v1/adverse-events/audit-events",
            json={"event": ""},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 422


# ── Close / reopen + immutability ─────────────────────────────────────────


class TestCloseAndReopen:
    def test_close_requires_note(
        self, client: TestClient, auth_headers: dict, patient_id: str
    ) -> None:
        h = auth_headers["clinician"]
        ae = _create_ae(client, h, patient_id=patient_id, severity="mild")
        r = client.post(
            f"/api/v1/adverse-events/{ae['id']}/close",
            json={"note": "  "},
            headers=h,
        )
        assert r.status_code == 422
        assert r.json()["code"] == "closure_note_required"

    def test_close_then_patch_is_409(
        self, client: TestClient, auth_headers: dict, patient_id: str
    ) -> None:
        h = auth_headers["clinician"]
        ae = _create_ae(client, h, patient_id=patient_id, severity="mild")
        c = client.post(
            f"/api/v1/adverse-events/{ae['id']}/close",
            json={"note": "investigation complete"},
            headers=h,
        )
        assert c.status_code == 200
        assert c.json()["status"] == "resolved"
        # Patching a closed AE → 409 immutable.
        r = client.patch(
            f"/api/v1/adverse-events/{ae['id']}",
            json={"severity": "moderate"},
            headers=h,
        )
        assert r.status_code == 409
        assert r.json()["code"] == "adverse_event_immutable"

    def test_close_then_close_is_409(
        self, client: TestClient, auth_headers: dict, patient_id: str
    ) -> None:
        h = auth_headers["clinician"]
        ae = _create_ae(client, h, patient_id=patient_id, severity="mild")
        client.post(
            f"/api/v1/adverse-events/{ae['id']}/close",
            json={"note": "done"},
            headers=h,
        )
        r = client.post(
            f"/api/v1/adverse-events/{ae['id']}/close",
            json={"note": "again"},
            headers=h,
        )
        assert r.status_code == 409
        assert r.json()["code"] == "adverse_event_already_closed"

    def test_reopen_requires_reason(
        self, client: TestClient, auth_headers: dict, patient_id: str
    ) -> None:
        h = auth_headers["clinician"]
        ae = _create_ae(client, h, patient_id=patient_id, severity="mild")
        client.post(
            f"/api/v1/adverse-events/{ae['id']}/close",
            json={"note": "ok"},
            headers=h,
        )
        r = client.post(
            f"/api/v1/adverse-events/{ae['id']}/reopen",
            json={"reason": "  "},
            headers=h,
        )
        assert r.status_code == 422
        assert r.json()["code"] == "reopen_reason_required"

    def test_reopen_only_when_closed(
        self, client: TestClient, auth_headers: dict, patient_id: str
    ) -> None:
        h = auth_headers["clinician"]
        ae = _create_ae(client, h, patient_id=patient_id, severity="mild")
        # Never closed; reopen → 409.
        r = client.post(
            f"/api/v1/adverse-events/{ae['id']}/reopen",
            json={"reason": "needs more review"},
            headers=h,
        )
        assert r.status_code == 409
        assert r.json()["code"] == "adverse_event_not_closed"

    def test_close_reopen_round_trip(
        self, client: TestClient, auth_headers: dict, patient_id: str
    ) -> None:
        h = auth_headers["clinician"]
        ae = _create_ae(client, h, patient_id=patient_id, severity="mild")
        client.post(
            f"/api/v1/adverse-events/{ae['id']}/close",
            json={"note": "investigation done"},
            headers=h,
        )
        r = client.post(
            f"/api/v1/adverse-events/{ae['id']}/reopen",
            json={"reason": "new evidence emerged"},
            headers=h,
        )
        assert r.status_code == 200
        assert r.json()["resolved_at"] is None
        # And we can patch again after reopen.
        r2 = client.patch(
            f"/api/v1/adverse-events/{ae['id']}",
            json={"severity": "moderate"},
            headers=h,
        )
        assert r2.status_code == 200, r2.text
        assert r2.json()["severity"] == "moderate"


# ── Cross-clinic IDOR ──────────────────────────────────────────────────────


def test_cross_clinic_returns_404_for_clinician(
    client: TestClient, auth_headers: dict, patient_id: str
) -> None:
    """A clinician for another clinic must see a 404 (never the row).

    Simulated by reassigning the AE's ``clinician_id`` to a foreign actor
    after creation, so the demo clinician is no longer the owner.
    """
    h = auth_headers["clinician"]
    ae = _create_ae(client, h, patient_id=patient_id, severity="mild")

    db = SessionLocal()
    try:
        from app.persistence.models import AdverseEvent as _AE

        rec = db.query(_AE).filter_by(id=ae["id"]).first()
        assert rec is not None
        rec.clinician_id = "actor-clinician-other"
        db.commit()
    finally:
        db.close()

    r = client.get(
        f"/api/v1/adverse-events/{ae['id']}", headers=h
    )
    assert r.status_code == 404, (r.status_code, r.text)
    # Patch / close / reopen / escalate / review must also 404 for the
    # non-owner clinician.
    for method, path, payload in (
        ("patch", f"/api/v1/adverse-events/{ae['id']}", {"severity": "moderate"}),
        ("post", f"/api/v1/adverse-events/{ae['id']}/close", {"note": "x"}),
        ("post", f"/api/v1/adverse-events/{ae['id']}/reopen", {"reason": "x"}),
        ("post", f"/api/v1/adverse-events/{ae['id']}/escalate", {"target": "irb"}),
        ("post", f"/api/v1/adverse-events/{ae['id']}/review", {}),
    ):
        r = getattr(client, method)(path, json=payload, headers=h)
        assert r.status_code == 404, (method, path, r.status_code)


def test_cross_clinic_admin_sees_200(
    client: TestClient, auth_headers: dict, patient_id: str
) -> None:
    """Admins are cross-clinic by design and must see 200 even after the
    AE is reassigned to another clinician."""
    h_clin = auth_headers["clinician"]
    h_admin = auth_headers["admin"]
    ae = _create_ae(client, h_clin, patient_id=patient_id, severity="mild")
    db = SessionLocal()
    try:
        from app.persistence.models import AdverseEvent as _AE

        rec = db.query(_AE).filter_by(id=ae["id"]).first()
        rec.clinician_id = "actor-clinician-other"
        db.commit()
    finally:
        db.close()

    r = client.get(f"/api/v1/adverse-events/{ae['id']}", headers=h_admin)
    assert r.status_code == 200, r.text


def test_cross_clinic_detail_returns_empty_for_clinician(
    client: TestClient, auth_headers: dict, patient_id: str
) -> None:
    """Filtered detail under cross-clinic patient must be empty for the
    non-owner clinician (their list/summary scope already excludes the
    foreign rows; here we additionally verify drill-in detail respects it).
    """
    h = auth_headers["clinician"]
    ae = _create_ae(client, h, patient_id=patient_id, severity="mild")
    # Reassign clinician_id so the demo clinician no longer owns the row.
    db = SessionLocal()
    try:
        from app.persistence.models import AdverseEvent as _AE

        rec = db.query(_AE).filter_by(id=ae["id"]).first()
        rec.clinician_id = "actor-clinician-other"
        db.commit()
    finally:
        db.close()
    r = client.get(
        f"/api/v1/adverse-events/detail"
        f"?source_target_type=patient_profile&source_target_id={patient_id}",
        headers=h,
    )
    assert r.status_code == 200
    # Demo clinician sees nothing; admins would see the row.
    assert r.json()["total"] == 0
