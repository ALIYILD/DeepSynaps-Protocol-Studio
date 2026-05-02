"""Tests for the Patient Digest launch-audit (2026-05-01).

Patient-side mirror of the Clinician Digest (#366). Daily/weekly self-
summary the patient sees on demand: sessions completed, adherence
streak, wellness trends, pending messages, recent reports.

This suite asserts:

* surface whitelisted in ``audit_trail_router.KNOWN_SURFACES`` + the
  qeeg-analysis ``audit-events`` ingestion;
* role gate — patient OK; clinician/admin/guest on patient endpoints
  → 404 (so the patient-scope URL existence is invisible);
* aggregation honest — counts come from real rows in ClinicalSession
  / PatientAdherenceEvent / WellnessCheckin / SymptomJournalEntry /
  Message — NOT AI fabrication;
* date-range filters honoured (since/until);
* send-email recorded with ``delivery_status='queued'`` until SMTP
  wires up;
* caregiver-share emits audit + flags ``consent_required=true``;
* exports DEMO-prefix when patient is demo;
* audit ingestion landing in ``/api/v1/audit-trail?surface=patient_digest``;
* **NO PHI of OTHER patients** appears in any response (the response
  payload contains only ``actor.patient_id``, never another patient_id).
* IDOR — clinician hitting a patient endpoint with a forged
  ``patient_id`` query param still gets 404.
"""
from __future__ import annotations

import uuid as _uuid
from datetime import datetime as _dt, timedelta as _td, timezone as _tz

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.persistence.models import (
    AuditEventRecord,
    ClinicalSession,
    Message,
    Patient,
    PatientAdherenceEvent,
    SymptomJournalEntry,
    User,
    WellnessCheckin,
)


# ── Fixtures ────────────────────────────────────────────────────────────────


@pytest.fixture
def demo_patient() -> Patient:
    """Seed the Patient row that ``actor-patient-demo`` resolves to."""
    db = SessionLocal()
    try:
        # Belt & braces: clean any pre-seeded row at the demo email.
        db.query(Patient).filter(
            Patient.email == "patient@deepsynaps.com"
        ).delete()
        db.commit()
        patient = Patient(
            id="patient-digest-demo",
            clinician_id="actor-clinician-demo",
            first_name="Jane",
            last_name="Patient",
            email="patient@deepsynaps.com",
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
def other_patient() -> Patient:
    """Second patient at the same clinic — used for the no-PHI regression."""
    db = SessionLocal()
    try:
        patient = Patient(
            id="patient-digest-other",
            clinician_id="actor-clinician-demo",
            first_name="Other",
            last_name="Patient",
            email=f"other-{_uuid.uuid4().hex[:6]}@example.com",
            consent_signed=True,
            status="active",
        )
        db.add(patient)
        db.commit()
        db.refresh(patient)
        return patient
    finally:
        db.close()


def _seed_completed_session(patient_id: str, when: _dt) -> str:
    db = SessionLocal()
    try:
        s = ClinicalSession(
            id=f"sess-{_uuid.uuid4().hex[:10]}",
            patient_id=patient_id,
            clinician_id="actor-clinician-demo",
            scheduled_at=when.isoformat(),
            duration_minutes=60,
            status="completed",
            completed_at=when.isoformat(),
        )
        db.add(s)
        db.commit()
        return s.id
    finally:
        db.close()


def _seed_adherence_report(patient_id: str, day: _dt) -> None:
    db = SessionLocal()
    try:
        e = PatientAdherenceEvent(
            id=f"adh-{_uuid.uuid4().hex[:10]}",
            patient_id=patient_id,
            event_type="adherence_report",
            severity=None,
            report_date=day.date().isoformat(),
            body=None,
            structured_json="{}",
            status="open",
        )
        db.add(e)
        db.commit()
    finally:
        db.close()


def _seed_wellness(patient_id: str, when: _dt, *, mood: int) -> None:
    db = SessionLocal()
    try:
        c = WellnessCheckin(
            id=f"wel-{_uuid.uuid4().hex[:10]}",
            patient_id=patient_id,
            author_actor_id="actor-patient-demo",
            mood=mood,
            energy=5,
            sleep=5,
            anxiety=3,
            focus=5,
            pain=3,
            note=None,
            tags=None,
            is_demo=False,
            revision_count=0,
            created_at=when,
            updated_at=when,
        )
        db.add(c)
        db.commit()
    finally:
        db.close()


def _seed_symptom(patient_id: str, when: _dt, severity: int) -> None:
    db = SessionLocal()
    try:
        e = SymptomJournalEntry(
            id=f"sym-{_uuid.uuid4().hex[:10]}",
            patient_id=patient_id,
            author_actor_id="actor-patient-demo",
            severity=severity,
            note="seed",
            tags=None,
            is_demo=False,
            revision_count=0,
            created_at=when,
            updated_at=when,
        )
        db.add(e)
        db.commit()
    finally:
        db.close()


def _seed_message(patient_id: str, sender_id: str, recipient_id: str) -> None:
    db = SessionLocal()
    try:
        m = Message(
            id=f"msg-{_uuid.uuid4().hex[:10]}",
            sender_id=sender_id,
            recipient_id=recipient_id,
            patient_id=patient_id,
            body="hello from clinician",
            subject="seed",
        )
        db.add(m)
        db.commit()
    finally:
        db.close()


# ── Surface whitelist sanity ────────────────────────────────────────────────


def test_patient_digest_in_audit_trail_known_surfaces() -> None:
    from app.routers.audit_trail_router import KNOWN_SURFACES
    assert "patient_digest" in KNOWN_SURFACES


def test_patient_digest_surface_accepted_by_qeeg_audit_events(
    client: TestClient, auth_headers: dict
) -> None:
    body = {
        "event": "view",
        "surface": "patient_digest",
        "note": "whitelist sanity",
    }
    r = client.post(
        "/api/v1/qeeg-analysis/audit-events",
        json=body,
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("accepted") is True
    assert data.get("event_id", "").startswith("patient_digest-")


# ── Role gate ───────────────────────────────────────────────────────────────


class TestRoleGate:
    def test_patient_can_get_summary(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
    ) -> None:
        r = client.get(
            "/api/v1/patient-digest/summary",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        for key in (
            "sessions_completed",
            "adherence_streak_days",
            "wellness_axes_trends",
            "pending_messages",
            "new_reports",
            "since",
            "until",
            "is_demo",
            "patient_id",
        ):
            assert key in data, f"missing key {key}"

    def test_clinician_on_summary_returns_404(
        self,
        client: TestClient,
        auth_headers: dict,
    ) -> None:
        r = client.get(
            "/api/v1/patient-digest/summary",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 404, r.text

    def test_admin_on_summary_returns_404(
        self,
        client: TestClient,
        auth_headers: dict,
    ) -> None:
        r = client.get(
            "/api/v1/patient-digest/summary",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 404, r.text

    def test_guest_denied(
        self,
        client: TestClient,
        auth_headers: dict,
    ) -> None:
        r = client.get(
            "/api/v1/patient-digest/summary",
            headers=auth_headers["guest"],
        )
        assert r.status_code != 200

    def test_clinician_on_audit_post_returns_403(
        self,
        client: TestClient,
        auth_headers: dict,
    ) -> None:
        r = client.post(
            "/api/v1/patient-digest/audit-events",
            json={"event": "view"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 403, r.text


# ── IDOR / cross-patient ────────────────────────────────────────────────────


class TestIDOR:
    def test_clinician_with_forged_patient_id_param_still_404(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
    ) -> None:
        # The patient endpoint resolves the patient row from the actor
        # token, NOT from a query / path param. A clinician hitting the
        # endpoint with ?patient_id=... must still 404.
        r = client.get(
            f"/api/v1/patient-digest/summary?patient_id={demo_patient.id}",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 404, r.text

    def test_admin_with_forged_patient_id_param_still_404(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
    ) -> None:
        r = client.get(
            f"/api/v1/patient-digest/sections?patient_id={demo_patient.id}",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 404, r.text


# ── Aggregation honesty ─────────────────────────────────────────────────────


class TestAggregation:
    def test_sessions_completed_honest_count(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
    ) -> None:
        now = _dt.now(_tz.utc)
        _seed_completed_session(demo_patient.id, now - _td(days=2))
        _seed_completed_session(demo_patient.id, now - _td(days=3))
        # One session OUTSIDE the default 7-day window — must NOT count.
        _seed_completed_session(demo_patient.id, now - _td(days=30))
        r = client.get(
            "/api/v1/patient-digest/summary",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200
        data = r.json()
        assert data["sessions_completed"] == 2

    def test_adherence_streak_honest(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
    ) -> None:
        now = _dt.now(_tz.utc)
        # Today + yesterday = streak of 2; gap on day-2; day-3 doesn't
        # count because the streak is broken.
        _seed_adherence_report(demo_patient.id, now)
        _seed_adherence_report(demo_patient.id, now - _td(days=1))
        _seed_adherence_report(demo_patient.id, now - _td(days=3))
        r = client.get(
            "/api/v1/patient-digest/summary",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200
        assert r.json()["adherence_streak_days"] == 2

    def test_wellness_axes_trends_present(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
    ) -> None:
        now = _dt.now(_tz.utc)
        _seed_wellness(demo_patient.id, now - _td(days=1), mood=7)
        r = client.get(
            "/api/v1/patient-digest/summary",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200
        trends = r.json()["wellness_axes_trends"]
        assert "mood" in trends
        assert trends["mood"]["current"] == 7

    def test_symptom_entries_counted(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
    ) -> None:
        now = _dt.now(_tz.utc)
        _seed_symptom(demo_patient.id, now - _td(days=1), severity=4)
        _seed_symptom(demo_patient.id, now - _td(days=2), severity=8)
        r = client.get(
            "/api/v1/patient-digest/summary",
            headers=auth_headers["patient"],
        )
        data = r.json()
        assert data["symptom_entries"] == 2
        assert data["symptom_severity_max"] == 8

    def test_pending_messages_counted(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
    ) -> None:
        _seed_message(
            demo_patient.id,
            sender_id="actor-clinician-demo",
            recipient_id="actor-patient-demo",
        )
        r = client.get(
            "/api/v1/patient-digest/summary",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200
        assert r.json()["pending_messages"] >= 1

    def test_sections_endpoint_returns_six_sections(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
    ) -> None:
        r = client.get(
            "/api/v1/patient-digest/sections",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200
        data = r.json()
        labels = {s["section"] for s in data["sections"]}
        assert {
            "sessions", "adherence", "wellness",
            "symptoms", "messages", "reports",
        } <= labels


# ── Date-range filters ──────────────────────────────────────────────────────


class TestDateRange:
    def test_since_until_query_filters_sessions(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
    ) -> None:
        now = _dt.now(_tz.utc)
        _seed_completed_session(demo_patient.id, now - _td(days=1))
        _seed_completed_session(demo_patient.id, now - _td(days=20))
        # Window of "last 30 days" picks up both.
        since = (now - _td(days=30)).isoformat()
        r = client.get(
            f"/api/v1/patient-digest/summary?since={since}",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200
        assert r.json()["sessions_completed"] == 2
        # Window of "last 5 days" picks up only the recent one.
        since5 = (now - _td(days=5)).isoformat()
        r2 = client.get(
            f"/api/v1/patient-digest/summary?since={since5}",
            headers=auth_headers["patient"],
        )
        assert r2.status_code == 200
        assert r2.json()["sessions_completed"] == 1


# ── Send-email queued status ────────────────────────────────────────────────


class TestSendEmail:
    def test_send_email_records_audit_and_returns_queued(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
    ) -> None:
        r = client.post(
            "/api/v1/patient-digest/send-email",
            json={"recipient_email": "self@example.com", "reason": "weekly"},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["accepted"] is True
        assert data["delivery_status"] == "queued"
        assert data["recipient_email"] == "self@example.com"
        assert data["audit_event_id"].startswith("patient_digest-")

    def test_send_email_invalid_recipient_400(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
    ) -> None:
        r = client.post(
            "/api/v1/patient-digest/send-email",
            json={"recipient_email": "not-an-email"},
            headers=auth_headers["patient"],
        )
        assert r.status_code in (400, 422), r.text


# ── Caregiver share ─────────────────────────────────────────────────────────


class TestCaregiverShare:
    def test_share_caregiver_records_audit_and_consent_flag(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
    ) -> None:
        # Seed a caregiver User row.
        db = SessionLocal()
        try:
            cg_id = f"caregiver-{_uuid.uuid4().hex[:8]}"
            cg = User(
                id=cg_id,
                email=f"{cg_id}@example.com",
                display_name="Care Giver",
                hashed_password="x",
                role="patient",
                clinic_id=None,
            )
            db.add(cg)
            db.commit()
        finally:
            db.close()
        r = client.post(
            "/api/v1/patient-digest/share-caregiver",
            json={"caregiver_user_id": cg_id, "reason": "weekly"},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["accepted"] is True
        assert data["delivery_status"] == "queued"
        assert data["consent_required"] is True
        assert data["caregiver_user_id"] == cg_id

    def test_share_caregiver_unknown_user_404(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
    ) -> None:
        r = client.post(
            "/api/v1/patient-digest/share-caregiver",
            json={"caregiver_user_id": "nonexistent-caregiver"},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 404, r.text


# ── Exports DEMO prefix ─────────────────────────────────────────────────────


class TestExports:
    def test_csv_export_demo_prefix_when_demo_clinic(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
    ) -> None:
        # Make the patient demo by setting a [DEMO]-prefixed note.
        db = SessionLocal()
        try:
            p = db.query(Patient).filter_by(id=demo_patient.id).first()
            p.notes = "[DEMO] seeded for export test"
            db.commit()
        finally:
            db.close()
        r = client.get(
            "/api/v1/patient-digest/export.csv",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200, r.text
        cd = r.headers.get("content-disposition", "")
        assert "DEMO-patient-digest.csv" in cd
        assert r.headers.get("x-patientdigest-demo") == "1"

    def test_ndjson_export_returns_lines(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
    ) -> None:
        r = client.get(
            "/api/v1/patient-digest/export.ndjson",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200, r.text
        body = r.text.strip()
        assert body, "ndjson body should not be empty"
        # Each non-empty line parses as JSON.
        import json as _json
        for ln in body.splitlines():
            obj = _json.loads(ln)
            assert obj["section"] in {
                "sessions", "adherence", "wellness",
                "symptoms", "messages", "reports",
            }


# ── No PHI of OTHER patients ────────────────────────────────────────────────


def _walk_strings(obj):
    if isinstance(obj, dict):
        for k, v in obj.items():
            yield from _walk_strings(k)
            yield from _walk_strings(v)
    elif isinstance(obj, list):
        for v in obj:
            yield from _walk_strings(v)
    elif isinstance(obj, str):
        yield obj


class TestNoPHILeak:
    def test_no_other_patient_id_in_summary_response(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
        other_patient: Patient,
    ) -> None:
        # Seed activity for BOTH patients. Only the actor's own activity
        # may surface.
        now = _dt.now(_tz.utc)
        _seed_completed_session(demo_patient.id, now - _td(days=1))
        _seed_completed_session(other_patient.id, now - _td(days=1))
        _seed_wellness(demo_patient.id, now - _td(days=1), mood=6)
        _seed_wellness(other_patient.id, now - _td(days=1), mood=2)
        _seed_symptom(other_patient.id, now - _td(days=1), severity=9)

        r = client.get(
            "/api/v1/patient-digest/summary",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["patient_id"] == demo_patient.id
        # The `other_patient.id` MUST NOT appear anywhere in the
        # serialised payload — the response is per-patient.
        body = r.text
        assert other_patient.id not in body, (
            "Other patient id leaked into summary response"
        )

    def test_no_other_patient_id_in_sections_response(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
        other_patient: Patient,
    ) -> None:
        r = client.get(
            "/api/v1/patient-digest/sections",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200, r.text
        body = r.text
        assert other_patient.id not in body

    def test_sessions_count_excludes_other_patient(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
        other_patient: Patient,
    ) -> None:
        now = _dt.now(_tz.utc)
        _seed_completed_session(demo_patient.id, now - _td(days=1))
        _seed_completed_session(other_patient.id, now - _td(days=1))
        _seed_completed_session(other_patient.id, now - _td(days=2))
        _seed_completed_session(other_patient.id, now - _td(days=3))
        r = client.get(
            "/api/v1/patient-digest/summary",
            headers=auth_headers["patient"],
        )
        assert r.json()["sessions_completed"] == 1


# ── Audit ingestion ─────────────────────────────────────────────────────────


class TestAuditIngestion:
    def test_view_audit_event_persists(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
    ) -> None:
        r = client.post(
            "/api/v1/patient-digest/audit-events",
            json={"event": "view", "note": "page mount"},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["accepted"] is True
        assert body["event_id"].startswith("patient_digest-")

        db = SessionLocal()
        try:
            row = (
                db.query(AuditEventRecord)
                .filter(AuditEventRecord.event_id == body["event_id"])
                .first()
            )
            assert row is not None
            assert row.target_type == "patient_digest"
            assert row.action == "patient_digest.view"
        finally:
            db.close()

    def test_audit_trail_filter_returns_patient_digest_rows(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
    ) -> None:
        client.post(
            "/api/v1/patient-digest/audit-events",
            json={"event": "demo_banner_shown"},
            headers=auth_headers["patient"],
        )
        r = client.get(
            "/api/v1/audit-trail",
            params={"surface": "patient_digest", "limit": 50},
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        items = r.json().get("items", [])
        assert len(items) >= 1
        for it in items:
            assert it.get("surface") == "patient_digest"

    def test_summary_get_emits_summary_viewed_audit(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
    ) -> None:
        r = client.get(
            "/api/v1/patient-digest/summary",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200
        db = SessionLocal()
        try:
            row = (
                db.query(AuditEventRecord)
                .filter(
                    AuditEventRecord.target_type == "patient_digest",
                    AuditEventRecord.action == "patient_digest.summary_viewed",
                )
                .order_by(AuditEventRecord.id.desc())
                .first()
            )
            assert row is not None
            assert row.actor_id == "actor-patient-demo"
            assert row.role == "patient"
        finally:
            db.close()
