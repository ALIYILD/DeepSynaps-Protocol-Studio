"""Tests for the Clinician Wellness Hub launch-audit (2026-05-01).

Bidirectional counterpart to ``test_wellness_hub_launch_audit.py``
(merged in #345). Where the patient surface ensures patients have an
audited log → share → soft-delete chain on their own row, this suite
proves the cross-patient triage queue at the clinic level is regulator-
credible:

* role gate (clinician / admin / supervisor / reviewer / regulator),
* cross-clinic IDOR (404 for clinicians at the wrong clinic; 200 for
  admins),
* aggregation across multiple patients,
* filter combinations (severity_band / axis / clinician_status /
  patient_id / since-until / q),
* summary returns deterministic counts (no AI fabrication),
* acknowledge / escalate / resolve all require a note,
* escalation creates an :class:`AdverseEvent` draft + HIGH-priority audit,
* resolved check-ins are immutable (409),
* bulk-acknowledge processes a list and reports partial failures,
* exports DEMO-prefix when any check-in's patient is demo,
* page-level audit ingestion at
  ``/api/v1/clinician-wellness/audit-events``,
* audit rows surface at
  ``/api/v1/audit-trail?surface=clinician_wellness_hub``.
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
    WellnessCheckin,
)


# ── Fixtures ────────────────────────────────────────────────────────────────


@pytest.fixture
def home_clinic_patient() -> Patient:
    """Patient owned by the demo clinician's clinic (clinic-demo-default)."""
    db = SessionLocal()
    try:
        patient = Patient(
            id="patient-cwh-home",
            clinician_id="actor-clinician-demo",
            first_name="Well",
            last_name="Home",
            email="well-home@example.com",
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
            id="patient-cwh-home2",
            clinician_id="actor-clinician-demo",
            first_name="Well",
            last_name="HomeTwo",
            email="well-home2@example.com",
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
            id="patient-cwh-home3",
            clinician_id="actor-clinician-demo",
            first_name="Well",
            last_name="HomeThree",
            email="well-home3@example.com",
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
    """Patient at a DIFFERENT clinic (cross-clinic IDOR target)."""
    db = SessionLocal()
    try:
        if db.query(Clinic).filter_by(id="clinic-other-cwh").first() is None:
            db.add(Clinic(id="clinic-other-cwh", name="Other Clinic CWH"))
            db.flush()
        if db.query(User).filter_by(id="actor-clinician-other-cwh").first() is None:
            db.add(User(
                id="actor-clinician-other-cwh",
                email="other-clinician-cwh@example.com",
                display_name="Other Clinic Clinician CWH",
                hashed_password="x",
                role="clinician",
                package_id="clinician_pro",
                clinic_id="clinic-other-cwh",
            ))
        patient = Patient(
            id="patient-cwh-other",
            clinician_id="actor-clinician-other-cwh",
            first_name="Other",
            last_name="ClinicCWH",
            email="other-clinic-cwh@example.com",
            consent_signed=True,
            status="active",
        )
        db.add(patient)
        db.commit()
        db.refresh(patient)
        return patient
    finally:
        db.close()


def _seed_checkin(
    *,
    patient_id: str,
    mood: int | None = 5,
    energy: int | None = 5,
    sleep: int | None = 5,
    anxiety: int | None = 3,
    focus: int | None = 5,
    pain: int | None = 2,
    note: str | None = "Auto-seeded for wellness hub test.",
    tags: str | None = None,
    clinician_status: str = "open",
    created_at: _dt | None = None,
    author_actor_id: str = "actor-patient-demo",
) -> str:
    db = SessionLocal()
    try:
        cid = str(_uuid.uuid4())
        row = WellnessCheckin(
            id=cid,
            patient_id=patient_id,
            author_actor_id=author_actor_id,
            mood=mood,
            energy=energy,
            sleep=sleep,
            anxiety=anxiety,
            focus=focus,
            pain=pain,
            note=note,
            tags=tags,
            clinician_status=clinician_status,
            created_at=created_at or _dt.now(_tz.utc),
            updated_at=created_at or _dt.now(_tz.utc),
        )
        db.add(row)
        db.commit()
        return cid
    finally:
        db.close()


# ── Surface whitelist sanity ────────────────────────────────────────────────


def test_hub_surface_in_audit_trail_known_surfaces() -> None:
    from app.routers.audit_trail_router import KNOWN_SURFACES
    assert "clinician_wellness_hub" in KNOWN_SURFACES


def test_hub_surface_accepted_by_qeeg_audit_events(
    client: TestClient, auth_headers: dict
) -> None:
    body = {"event": "view", "surface": "clinician_wellness_hub", "note": "whitelist sanity"}
    r = client.post(
        "/api/v1/qeeg-analysis/audit-events",
        json=body,
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("accepted") is True
    assert data.get("event_id", "").startswith("clinician_wellness_hub-")


# ── Role gate ───────────────────────────────────────────────────────────────


class TestRoleGate:
    def test_patient_role_is_403(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/clinician-wellness/checkins",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 403, r.text

    def test_guest_is_unauthorized(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/clinician-wellness/checkins",
            headers=auth_headers["guest"],
        )
        # Guest token has role=guest; gate returns 403.
        assert r.status_code in (401, 403)

    def test_clinician_can_list(
        self, client: TestClient, auth_headers: dict, home_clinic_patient: Patient
    ) -> None:
        _seed_checkin(patient_id=home_clinic_patient.id)
        r = client.get(
            "/api/v1/clinician-wellness/checkins",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["total"] >= 1
        assert isinstance(data["disclaimers"], list) and data["disclaimers"]


# ── Cross-clinic isolation (IDOR) ───────────────────────────────────────────


class TestCrossClinicIsolation:
    def test_clinician_cannot_see_other_clinic_checkins_in_list(
        self,
        client: TestClient,
        auth_headers: dict,
        home_clinic_patient: Patient,
        other_clinic_patient: Patient,
    ) -> None:
        _seed_checkin(patient_id=other_clinic_patient.id)
        r = client.get(
            "/api/v1/clinician-wellness/checkins",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        # Home-clinic clinician must not see the other-clinic patient's row.
        items = r.json()["items"]
        for it in items:
            assert it["patient_id"] != other_clinic_patient.id

    def test_clinician_cannot_view_other_clinic_checkin_detail(
        self,
        client: TestClient,
        auth_headers: dict,
        other_clinic_patient: Patient,
    ) -> None:
        cid = _seed_checkin(patient_id=other_clinic_patient.id)
        r = client.get(
            f"/api/v1/clinician-wellness/checkins/{cid}",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 404

    def test_clinician_cannot_acknowledge_other_clinic_checkin(
        self,
        client: TestClient,
        auth_headers: dict,
        other_clinic_patient: Patient,
    ) -> None:
        cid = _seed_checkin(patient_id=other_clinic_patient.id)
        r = client.post(
            f"/api/v1/clinician-wellness/checkins/{cid}/acknowledge",
            json={"note": "trying"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 404

    def test_admin_can_see_other_clinic_checkin(
        self,
        client: TestClient,
        auth_headers: dict,
        other_clinic_patient: Patient,
    ) -> None:
        cid = _seed_checkin(patient_id=other_clinic_patient.id)
        r = client.get(
            f"/api/v1/clinician-wellness/checkins/{cid}",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        assert r.json()["id"] == cid


# ── Aggregation across patients ─────────────────────────────────────────────


class TestCrossPatientAggregation:
    def test_seed_5_checkins_across_3_patients_returns_5_rows(
        self,
        client: TestClient,
        auth_headers: dict,
        home_clinic_patient: Patient,
        home_clinic_patient_two: Patient,
        home_clinic_patient_three: Patient,
    ) -> None:
        _seed_checkin(patient_id=home_clinic_patient.id, mood=4)
        _seed_checkin(patient_id=home_clinic_patient.id, anxiety=8)
        _seed_checkin(patient_id=home_clinic_patient_two.id, mood=2)
        _seed_checkin(patient_id=home_clinic_patient_two.id, pain=9)
        _seed_checkin(patient_id=home_clinic_patient_three.id)

        r = client.get(
            "/api/v1/clinician-wellness/checkins",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        items = r.json()["items"]
        seen_pids = {it["patient_id"] for it in items}
        assert {
            home_clinic_patient.id,
            home_clinic_patient_two.id,
            home_clinic_patient_three.id,
        }.issubset(seen_pids)
        assert sum(1 for it in items if it["patient_id"] in {
            home_clinic_patient.id,
            home_clinic_patient_two.id,
            home_clinic_patient_three.id,
        }) >= 5


# ── List filters ────────────────────────────────────────────────────────────


class TestListFilters:
    def test_severity_band_filter_high(
        self, client: TestClient, auth_headers: dict, home_clinic_patient: Patient
    ) -> None:
        # mood=2 → low (<=3) → high band
        _seed_checkin(patient_id=home_clinic_patient.id, mood=2)
        # mood=8 → low band
        _seed_checkin(patient_id=home_clinic_patient.id, mood=8, anxiety=2, pain=2)
        r = client.get(
            "/api/v1/clinician-wellness/checkins?severity_band=high",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        for it in r.json()["items"]:
            if it["patient_id"] == home_clinic_patient.id:
                assert it["severity_band"] == "high"

    def test_axis_filter_anxiety(
        self, client: TestClient, auth_headers: dict, home_clinic_patient: Patient
    ) -> None:
        _seed_checkin(patient_id=home_clinic_patient.id, anxiety=8, mood=8, pain=2)
        _seed_checkin(patient_id=home_clinic_patient.id, anxiety=3, mood=8, pain=2)
        r = client.get(
            "/api/v1/clinician-wellness/checkins?axis=anxiety",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        for it in r.json()["items"]:
            if it["patient_id"] == home_clinic_patient.id:
                assert it["anxiety"] is not None and it["anxiety"] >= 7

    def test_clinician_status_filter(
        self, client: TestClient, auth_headers: dict, home_clinic_patient: Patient
    ) -> None:
        _seed_checkin(patient_id=home_clinic_patient.id, clinician_status="open")
        _seed_checkin(patient_id=home_clinic_patient.id, clinician_status="acknowledged")
        r = client.get(
            "/api/v1/clinician-wellness/checkins?clinician_status=acknowledged",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        for it in r.json()["items"]:
            if it["patient_id"] == home_clinic_patient.id:
                assert it["clinician_status"] == "acknowledged"

    def test_patient_id_filter(
        self,
        client: TestClient,
        auth_headers: dict,
        home_clinic_patient: Patient,
        home_clinic_patient_two: Patient,
    ) -> None:
        _seed_checkin(patient_id=home_clinic_patient.id)
        _seed_checkin(patient_id=home_clinic_patient_two.id)
        r = client.get(
            f"/api/v1/clinician-wellness/checkins?patient_id={home_clinic_patient_two.id}",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        items = r.json()["items"]
        assert all(it["patient_id"] == home_clinic_patient_two.id for it in items)

    def test_q_text_filter_matches_note(
        self,
        client: TestClient,
        auth_headers: dict,
        home_clinic_patient: Patient,
    ) -> None:
        _seed_checkin(patient_id=home_clinic_patient.id, note="Sleep was awful last night.")
        _seed_checkin(patient_id=home_clinic_patient.id, note="Feeling great today.")
        r = client.get(
            "/api/v1/clinician-wellness/checkins?q=awful",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        for it in r.json()["items"]:
            if it["patient_id"] == home_clinic_patient.id:
                assert "awful" in (it.get("note") or "").lower()


# ── Summary ─────────────────────────────────────────────────────────────────


class TestSummary:
    def test_summary_counts_match_seeded_state(
        self,
        client: TestClient,
        auth_headers: dict,
        home_clinic_patient: Patient,
        home_clinic_patient_two: Patient,
    ) -> None:
        # Today's check-ins (will count toward total_today / total_7d).
        _seed_checkin(patient_id=home_clinic_patient.id, mood=2)  # candidate
        _seed_checkin(patient_id=home_clinic_patient.id, anxiety=8)  # candidate
        _seed_checkin(patient_id=home_clinic_patient_two.id, pain=9)  # candidate
        _seed_checkin(patient_id=home_clinic_patient_two.id, mood=5, anxiety=2, pain=2)
        r = client.get(
            "/api/v1/clinician-wellness/checkins/summary",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        s = r.json()
        # Seeded with today's date so total_today >= 4.
        assert s["total_today"] >= 4
        assert s["total_7d"] >= 4
        # Three candidates seeded (mood=2, anxiety=8, pain=9) — all open.
        assert s["escalation_candidates"] >= 3
        # Response rate is a percentage.
        assert isinstance(s["response_rate_pct"], (int, float))
        # Top lists are list payloads.
        assert isinstance(s["low_mood_top_patients"], list)
        assert isinstance(s["missed_streak_top_patients"], list)


# ── Acknowledge ─────────────────────────────────────────────────────────────


class TestAcknowledge:
    def test_acknowledge_requires_note(
        self, client: TestClient, auth_headers: dict, home_clinic_patient: Patient
    ) -> None:
        cid = _seed_checkin(patient_id=home_clinic_patient.id)
        r = client.post(
            f"/api/v1/clinician-wellness/checkins/{cid}/acknowledge",
            json={"note": "  "},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 422

    def test_acknowledge_emits_audit_and_flips_status(
        self, client: TestClient, auth_headers: dict, home_clinic_patient: Patient
    ) -> None:
        cid = _seed_checkin(patient_id=home_clinic_patient.id, mood=4)
        r = client.post(
            f"/api/v1/clinician-wellness/checkins/{cid}/acknowledge",
            json={"note": "Reviewed; mood acceptable for week 3."},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["clinician_status"] == "acknowledged"

        audit = client.get(
            "/api/v1/audit-trail?surface=clinician_wellness_hub",
            headers=auth_headers["admin"],
        ).json()["items"]
        actions = {it.get("action") for it in audit}
        assert "clinician_wellness_hub.checkin_acknowledged" in actions

    def test_resolved_checkin_cannot_be_acknowledged(
        self, client: TestClient, auth_headers: dict, home_clinic_patient: Patient
    ) -> None:
        cid = _seed_checkin(patient_id=home_clinic_patient.id, clinician_status="resolved")
        r = client.post(
            f"/api/v1/clinician-wellness/checkins/{cid}/acknowledge",
            json={"note": "trying after resolve"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 409


# ── Escalate ────────────────────────────────────────────────────────────────


class TestEscalate:
    def test_escalate_creates_adverse_event_draft_and_high_priority_audit_anxiety(
        self, client: TestClient, auth_headers: dict, home_clinic_patient: Patient
    ) -> None:
        # anxiety=9 → urgent band; should produce is_serious=True
        cid = _seed_checkin(patient_id=home_clinic_patient.id, anxiety=9)
        r = client.post(
            f"/api/v1/clinician-wellness/checkins/{cid}/escalate",
            json={"note": "Severe anxiety reported during week 2 of home tDCS — escalating."},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["clinician_status"] == "escalated"
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
            assert ae.event_type == "wellness_escalation"
            assert ae.is_serious is True  # anxiety=9 → urgent → severe → is_serious
            assert ae.patient_id == home_clinic_patient.id
        finally:
            db.close()

        # HIGH-priority audit row pinned to the check-in.
        audit = client.get(
            "/api/v1/audit-trail?surface=clinician_wellness_hub",
            headers=auth_headers["admin"],
        ).json()["items"]
        escalate_row = next(
            (it for it in audit
             if it.get("action") == "clinician_wellness_hub.checkin_escalated"),
            None,
        )
        assert escalate_row is not None
        assert "priority=high" in (escalate_row.get("note") or "")

    def test_escalate_low_mood_creates_adverse_event(
        self, client: TestClient, auth_headers: dict, home_clinic_patient: Patient
    ) -> None:
        # mood=2 → high band (mood<=3), candidate=True
        cid = _seed_checkin(patient_id=home_clinic_patient.id, mood=2)
        r = client.post(
            f"/api/v1/clinician-wellness/checkins/{cid}/escalate",
            json={"note": "Persistent low mood — flag for safety review."},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["adverse_event_id"]

    def test_escalate_pain_high_creates_adverse_event(
        self, client: TestClient, auth_headers: dict, home_clinic_patient: Patient
    ) -> None:
        # pain=8 → high band, candidate=True
        cid = _seed_checkin(patient_id=home_clinic_patient.id, pain=8)
        r = client.post(
            f"/api/v1/clinician-wellness/checkins/{cid}/escalate",
            json={"note": "Pain reported above tolerance threshold."},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text

    def test_escalate_requires_note(
        self, client: TestClient, auth_headers: dict, home_clinic_patient: Patient
    ) -> None:
        cid = _seed_checkin(patient_id=home_clinic_patient.id)
        r = client.post(
            f"/api/v1/clinician-wellness/checkins/{cid}/escalate",
            json={"note": ""},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 422

    def test_resolved_checkin_cannot_be_escalated(
        self, client: TestClient, auth_headers: dict, home_clinic_patient: Patient
    ) -> None:
        cid = _seed_checkin(patient_id=home_clinic_patient.id, clinician_status="resolved")
        r = client.post(
            f"/api/v1/clinician-wellness/checkins/{cid}/escalate",
            json={"note": "should not work"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 409


# ── Resolve ─────────────────────────────────────────────────────────────────


class TestResolve:
    def test_resolve_requires_note(
        self, client: TestClient, auth_headers: dict, home_clinic_patient: Patient
    ) -> None:
        cid = _seed_checkin(patient_id=home_clinic_patient.id)
        r = client.post(
            f"/api/v1/clinician-wellness/checkins/{cid}/resolve",
            json={"note": ""},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 422

    def test_resolve_makes_checkin_immutable(
        self, client: TestClient, auth_headers: dict, home_clinic_patient: Patient
    ) -> None:
        cid = _seed_checkin(patient_id=home_clinic_patient.id)
        r = client.post(
            f"/api/v1/clinician-wellness/checkins/{cid}/resolve",
            json={"note": "Patient confirmed by phone — no clinical concern."},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        # Second resolve attempt → 409.
        r2 = client.post(
            f"/api/v1/clinician-wellness/checkins/{cid}/resolve",
            json={"note": "duplicate"},
            headers=auth_headers["clinician"],
        )
        assert r2.status_code == 409

        # Acknowledge after resolve → 409.
        r3 = client.post(
            f"/api/v1/clinician-wellness/checkins/{cid}/acknowledge",
            json={"note": "should not work after resolve"},
            headers=auth_headers["clinician"],
        )
        assert r3.status_code == 409

        # Escalate after resolve → 409.
        r4 = client.post(
            f"/api/v1/clinician-wellness/checkins/{cid}/escalate",
            json={"note": "should not work after resolve"},
            headers=auth_headers["clinician"],
        )
        assert r4.status_code == 409


# ── Bulk acknowledge ────────────────────────────────────────────────────────


class TestBulkAcknowledge:
    def test_bulk_acknowledge_requires_note(
        self, client: TestClient, auth_headers: dict, home_clinic_patient: Patient
    ) -> None:
        cid = _seed_checkin(patient_id=home_clinic_patient.id)
        r = client.post(
            "/api/v1/clinician-wellness/checkins/bulk-acknowledge",
            json={"checkin_ids": [cid], "note": "  "},
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
        c1 = _seed_checkin(patient_id=home_clinic_patient.id)
        c2 = _seed_checkin(patient_id=home_clinic_patient.id)
        c3 = _seed_checkin(patient_id=home_clinic_patient_two.id)
        r = client.post(
            "/api/v1/clinician-wellness/checkins/bulk-acknowledge",
            json={"checkin_ids": [c1, c2, c3], "note": "End-of-day clinic sweep."},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["accepted"] is True
        assert body["succeeded"] == 3
        assert body["failures"] == []

        # Bulk audit row was emitted.
        audit = client.get(
            "/api/v1/audit-trail?surface=clinician_wellness_hub",
            headers=auth_headers["admin"],
        ).json()["items"]
        actions = {it.get("action") for it in audit}
        assert "clinician_wellness_hub.bulk_acknowledged" in actions

    def test_bulk_acknowledge_partial_failures_reported(
        self,
        client: TestClient,
        auth_headers: dict,
        home_clinic_patient: Patient,
        other_clinic_patient: Patient,
    ) -> None:
        good = _seed_checkin(patient_id=home_clinic_patient.id)
        cross = _seed_checkin(patient_id=other_clinic_patient.id)  # cross-clinic → 404
        already_resolved = _seed_checkin(
            patient_id=home_clinic_patient.id, clinician_status="resolved"
        )
        r = client.post(
            "/api/v1/clinician-wellness/checkins/bulk-acknowledge",
            json={
                "checkin_ids": [good, cross, already_resolved, "missing-id-zzz"],
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

        _seed_checkin(patient_id=home_clinic_patient.id)
        r = client.get(
            "/api/v1/clinician-wellness/checkins/export.csv",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        cd = r.headers.get("content-disposition", "")
        assert "DEMO-clinician-wellness-checkins.csv" in cd
        assert r.headers.get("X-ClinicianWellnessHub-Demo") == "1"
        assert "checkin_id" in r.text  # CSV header

    def test_ndjson_export_no_prefix_when_not_demo(
        self, client: TestClient, auth_headers: dict, home_clinic_patient: Patient
    ) -> None:
        # Re-point clinician away from a demo clinic to keep the row honest.
        db = SessionLocal()
        try:
            if db.query(Clinic).filter_by(id="clinic-real-prod-cwh").first() is None:
                db.add(Clinic(id="clinic-real-prod-cwh", name="Real Prod CWH"))
                db.flush()
            if db.query(User).filter_by(id="actor-clinician-real-cwh").first() is None:
                db.add(User(
                    id="actor-clinician-real-cwh",
                    email="real-cwh@example.com",
                    display_name="Real Clinician CWH",
                    hashed_password="x",
                    role="clinician",
                    package_id="clinician_pro",
                    clinic_id="clinic-real-prod-cwh",
                ))
            p = db.query(Patient).filter_by(id=home_clinic_patient.id).first()
            assert p is not None
            p.clinician_id = "actor-clinician-real-cwh"
            p.notes = ""  # ensure not [DEMO]
            db.commit()
        finally:
            db.close()

        _seed_checkin(patient_id=home_clinic_patient.id)
        # Use admin (cross-clinic) to read the relocated patient's check-in.
        r = client.get(
            "/api/v1/clinician-wellness/checkins/export.ndjson",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        cd = r.headers.get("content-disposition", "")
        assert "DEMO-" not in cd
        assert r.headers.get("X-ClinicianWellnessHub-Demo") == "0"


# ── Audit ingestion ─────────────────────────────────────────────────────────


class TestAuditIngestion:
    def test_view_audit_event_accepted(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(
            "/api/v1/clinician-wellness/audit-events",
            json={"event": "view", "note": "clinician mounted Hub"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        body = r.json()
        assert body["accepted"] is True
        assert body["event_id"].startswith("clinician_wellness_hub-")

    def test_audit_ingestion_patient_403(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(
            "/api/v1/clinician-wellness/audit-events",
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
        cid = _seed_checkin(patient_id=other_clinic_patient.id)
        r = client.post(
            "/api/v1/clinician-wellness/audit-events",
            json={"event": "checkin_viewed", "checkin_id": cid},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 404

    def test_checkin_viewed_audit_surfaces_in_audit_trail(
        self,
        client: TestClient,
        auth_headers: dict,
        home_clinic_patient: Patient,
    ) -> None:
        cid = _seed_checkin(patient_id=home_clinic_patient.id)
        # Detail GET emits the checkin_viewed audit row.
        r = client.get(
            f"/api/v1/clinician-wellness/checkins/{cid}",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200

        audit = client.get(
            "/api/v1/audit-trail?surface=clinician_wellness_hub",
            headers=auth_headers["admin"],
        ).json()["items"]
        actions = {it.get("action") for it in audit}
        assert "clinician_wellness_hub.checkin_viewed" in actions
