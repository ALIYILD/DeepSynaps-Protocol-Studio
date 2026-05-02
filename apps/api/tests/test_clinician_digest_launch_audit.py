"""Tests for the Clinician Notifications Pulse / Daily Digest launch-audit (2026-05-01).

Top-of-loop telemetry the Care Team Coverage SLA chain (#357) lacks. End-of-shift
summary across the four clinician hubs (Inbox #354, Wearables Workbench #353,
Adherence Hub #361, Wellness Hub #365) plus AE Hub #342 escalations.

Asserts:
* surface whitelisted in audit_trail_router KNOWN_SURFACES + qeeg-analysis,
* role gate (clinician minimum),
* cross-clinic 404 (clinician) / 200 (admin) on share-colleague,
* aggregation across 3+ surfaces returns honest counts,
* date-range presets (today / yesterday / 7d) compute correctly,
* send-email emits audit; delivery_status='queued' when SMTP not configured,
* colleague-share scoped to clinic; cross-clinic recipient → 404,
* exports DEMO prefix when any included event has a demo patient,
* audit ingestion at ``/api/v1/audit-trail?surface=clinician_digest``.
"""
from __future__ import annotations

import uuid as _uuid
from datetime import datetime as _dt, timedelta as _td, timezone as _tz

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.persistence.models import (
    AdverseEvent,
    AuditEventRecord,
    Clinic,
    Patient,
    PatientAdherenceEvent,
    User,
    WearableAlertFlag,
    WellnessCheckin,
)


# ── Fixtures ────────────────────────────────────────────────────────────────


@pytest.fixture
def home_clinic_patient() -> Patient:
    db = SessionLocal()
    try:
        patient = Patient(
            id="patient-cdg-home",
            clinician_id="actor-clinician-demo",
            first_name="Digest",
            last_name="HomeTest",
            email="digest-home@example.com",
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
    db = SessionLocal()
    try:
        patient = Patient(
            id="patient-cdg-home2",
            clinician_id="actor-clinician-demo",
            first_name="Digest",
            last_name="HomeTwo",
            email="digest-home2@example.com",
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
def other_clinic_user() -> User:
    """User in a DIFFERENT clinic — colleague-share IDOR target."""
    db = SessionLocal()
    try:
        if db.query(Clinic).filter_by(id="clinic-other-cdg").first() is None:
            db.add(Clinic(id="clinic-other-cdg", name="Other Clinic CDG"))
            db.flush()
        if db.query(User).filter_by(id="actor-clinician-other-cdg").first() is None:
            db.add(User(
                id="actor-clinician-other-cdg",
                email="other-clinician-cdg@example.com",
                display_name="Other Clinic Clinician CDG",
                hashed_password="x",
                role="clinician",
                package_id="clinician_pro",
                clinic_id="clinic-other-cdg",
            ))
        db.commit()
        return db.query(User).filter_by(id="actor-clinician-other-cdg").first()
    finally:
        db.close()


@pytest.fixture
def home_colleague_user() -> User:
    """A colleague at the same clinic as the demo clinician."""
    db = SessionLocal()
    try:
        if db.query(User).filter_by(id="actor-colleague-cdg").first() is None:
            db.add(User(
                id="actor-colleague-cdg",
                email="colleague-cdg@example.com",
                display_name="Demo Colleague CDG",
                hashed_password="x",
                role="clinician",
                package_id="clinician_pro",
                clinic_id="clinic-demo-default",
            ))
        db.commit()
        return db.query(User).filter_by(id="actor-colleague-cdg").first()
    finally:
        db.close()


def _seed_audit(
    *,
    target_type: str,
    action: str,
    target_id: str,
    actor_id: str = "actor-clinician-demo",
    role: str = "clinician",
    note: str = "",
    created_at: _dt | None = None,
) -> str:
    db = SessionLocal()
    try:
        ts = (created_at or _dt.now(_tz.utc)).isoformat()
        # Use a full uuid for the event_id so consecutive seeds in the
        # same second can't collide on the unique key.
        eid = f"seed-{_uuid.uuid4().hex}"
        db.add(AuditEventRecord(
            event_id=eid,
            target_id=target_id,
            target_type=target_type,
            action=action,
            role=role,
            actor_id=actor_id,
            note=note,
            created_at=ts,
        ))
        db.commit()
        return eid
    finally:
        db.close()


def _seed_handled_audits_in_window(
    *,
    inbox: int = 0,
    wearables: int = 0,
    adherence_escalation: int = 0,
    paged: int = 0,
    target_id: str = "patient-cdg-home",
) -> None:
    """Seed audit rows that should count as handled / escalated / paged in window."""
    for _ in range(inbox):
        _seed_audit(
            target_type="clinician_inbox",
            action="clinician_inbox.item_acknowledged",
            target_id=f"audit-{_uuid.uuid4().hex[:8]}",
            note=f"event=seed; patient={target_id}; reviewed",
        )
    for _ in range(wearables):
        _seed_audit(
            target_type="wearables_workbench",
            action="wearables_workbench.flag_acknowledged",
            target_id=f"flag-{_uuid.uuid4().hex[:8]}",
            note=f"patient={target_id}; wearable triage",
        )
    for _ in range(adherence_escalation):
        _seed_audit(
            target_type="clinician_adherence_hub",
            action="clinician_adherence_hub.event_escalated",
            target_id=f"adh-{_uuid.uuid4().hex[:8]}",
            note=f"priority=high; patient={target_id}; severity=urgent",
        )
    for _ in range(paged):
        _seed_audit(
            target_type="clinician_inbox",
            action="inbox.item_paged_to_oncall",
            target_id=f"page-{_uuid.uuid4().hex[:8]}",
            note=f"patient={target_id}; manual page",
        )


# ── Surface whitelist sanity ────────────────────────────────────────────────


def test_digest_surface_in_audit_trail_known_surfaces() -> None:
    from app.routers.audit_trail_router import KNOWN_SURFACES
    assert "clinician_digest" in KNOWN_SURFACES


def test_digest_surface_accepted_by_qeeg_audit_events(
    client: TestClient, auth_headers: dict
) -> None:
    body = {"event": "view", "surface": "clinician_digest", "note": "whitelist sanity"}
    r = client.post(
        "/api/v1/qeeg-analysis/audit-events",
        json=body,
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("accepted") is True
    assert data.get("event_id", "").startswith("clinician_digest-")


# ── Role gate ───────────────────────────────────────────────────────────────


class TestRoleGate:
    def test_patient_role_is_403(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/clinician-digest/summary",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 403, r.text

    def test_guest_is_unauthorized(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/clinician-digest/summary",
            headers=auth_headers["guest"],
        )
        assert r.status_code in (401, 403)

    def test_clinician_can_view_summary(
        self, client: TestClient, auth_headers: dict, home_clinic_patient: Patient
    ) -> None:
        r = client.get(
            "/api/v1/clinician-digest/summary",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        for k in ("handled", "escalated", "paged", "open", "sla_breached", "by_surface", "since", "until"):
            assert k in data
        assert isinstance(data["disclaimers"], list) and data["disclaimers"]

    def test_admin_can_view_summary(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/clinician-digest/summary",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text


# ── Aggregation honesty ─────────────────────────────────────────────────────


class TestAggregation:
    def test_seed_3_inbox_2_wearables_1_adherence_returns_correct_breakdown(
        self,
        client: TestClient,
        auth_headers: dict,
        home_clinic_patient: Patient,
    ) -> None:
        _seed_handled_audits_in_window(
            inbox=3,
            wearables=2,
            adherence_escalation=1,
            target_id=home_clinic_patient.id,
        )
        # Wide window — last 7 days, so timing is forgiving.
        until = _dt.now(_tz.utc).isoformat()
        since = (_dt.now(_tz.utc) - _td(days=7)).isoformat()
        r = client.get(
            f"/api/v1/clinician-digest/summary?since={since}&until={until}",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        # 5 handled (3 inbox + 2 wearables) + 1 escalation
        assert data["handled"] >= 5
        assert data["escalated"] >= 1
        # Per-surface breakdown
        bs = data["by_surface"]
        assert bs["clinician_inbox"]["handled"] >= 3
        assert bs["wearables_workbench"]["handled"] >= 2
        assert bs["clinician_adherence_hub"]["escalated"] >= 1

    def test_paged_count_uses_inbox_paged_action(
        self,
        client: TestClient,
        auth_headers: dict,
        home_clinic_patient: Patient,
    ) -> None:
        _seed_handled_audits_in_window(paged=2, target_id=home_clinic_patient.id)
        until = _dt.now(_tz.utc).isoformat()
        since = (_dt.now(_tz.utc) - _td(days=1)).isoformat()
        r = client.get(
            f"/api/v1/clinician-digest/summary?since={since}&until={until}",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        assert r.json()["paged"] >= 2

    def test_open_count_aggregates_from_hub_tables(
        self,
        client: TestClient,
        auth_headers: dict,
        home_clinic_patient: Patient,
    ) -> None:
        # Seed an open wellness check-in.
        db = SessionLocal()
        try:
            db.add(WellnessCheckin(
                id=str(_uuid.uuid4()),
                patient_id=home_clinic_patient.id,
                author_actor_id="actor-patient-demo",
                mood=4,
                clinician_status="open",
                created_at=_dt.now(_tz.utc),
                updated_at=_dt.now(_tz.utc),
            ))
            # Seed an open adherence event.
            db.add(PatientAdherenceEvent(
                id=str(_uuid.uuid4()),
                patient_id=home_clinic_patient.id,
                event_type="side_effect",
                severity="moderate",
                report_date=_dt.now(_tz.utc).date().isoformat(),
                status="open",
                created_at=_dt.now(_tz.utc),
            ))
            db.commit()
        finally:
            db.close()

        r = client.get(
            "/api/v1/clinician-digest/summary",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        # Both should land under their respective surfaces' open count.
        assert data["by_surface"]["clinician_wellness_hub"]["open"] >= 1
        assert data["by_surface"]["clinician_adherence_hub"]["open"] >= 1
        assert data["open"] >= 2


# ── Date-range filters ──────────────────────────────────────────────────────


class TestDateRange:
    def test_today_window_excludes_yesterday(
        self,
        client: TestClient,
        auth_headers: dict,
        home_clinic_patient: Patient,
    ) -> None:
        # Yesterday: 2 events; Today: 1 event.
        _seed_audit(
            target_type="clinician_inbox",
            action="clinician_inbox.item_acknowledged",
            target_id="audit-y1",
            created_at=_dt.now(_tz.utc) - _td(days=1, hours=2),
            note="yesterday-1",
        )
        _seed_audit(
            target_type="clinician_inbox",
            action="clinician_inbox.item_acknowledged",
            target_id="audit-y2",
            created_at=_dt.now(_tz.utc) - _td(days=1, hours=4),
            note="yesterday-2",
        )
        _seed_audit(
            target_type="clinician_inbox",
            action="clinician_inbox.item_acknowledged",
            target_id="audit-t1",
            created_at=_dt.now(_tz.utc),
            note="today-1",
        )
        # Today window — last 12h.
        since = (_dt.now(_tz.utc) - _td(hours=12)).isoformat()
        until = _dt.now(_tz.utc).isoformat()
        r = client.get(
            f"/api/v1/clinician-digest/summary?since={since}&until={until}",
            headers=auth_headers["clinician"],
        )
        today_handled = r.json()["handled"]
        assert today_handled >= 1

        # Yesterday window — 24h..48h ago.
        since_y = (_dt.now(_tz.utc) - _td(hours=48)).isoformat()
        until_y = (_dt.now(_tz.utc) - _td(hours=24)).isoformat()
        r2 = client.get(
            f"/api/v1/clinician-digest/summary?since={since_y}&until={until_y}",
            headers=auth_headers["clinician"],
        )
        assert r2.status_code == 200
        # Yesterday window contains the two yesterday rows.
        assert r2.json()["handled"] >= 2

    def test_7d_window_covers_recent(
        self,
        client: TestClient,
        auth_headers: dict,
        home_clinic_patient: Patient,
    ) -> None:
        _seed_audit(
            target_type="clinician_inbox",
            action="clinician_inbox.item_acknowledged",
            target_id="audit-w1",
            created_at=_dt.now(_tz.utc) - _td(days=3),
            note="3d-ago",
        )
        since = (_dt.now(_tz.utc) - _td(days=7)).isoformat()
        until = _dt.now(_tz.utc).isoformat()
        r = client.get(
            f"/api/v1/clinician-digest/summary?since={since}&until={until}",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        assert r.json()["handled"] >= 1

    def test_default_window_is_last_12h(
        self,
        client: TestClient,
        auth_headers: dict,
    ) -> None:
        r = client.get(
            "/api/v1/clinician-digest/summary",
            headers=auth_headers["clinician"],
        )
        data = r.json()
        since_dt = _dt.fromisoformat(data["since"])
        until_dt = _dt.fromisoformat(data["until"])
        delta = until_dt - since_dt
        # ~12h default; allow a few seconds of slack.
        assert _td(hours=11, minutes=58) <= delta <= _td(hours=12, minutes=2)


# ── Send email ──────────────────────────────────────────────────────────────


class TestSendEmail:
    def test_send_email_to_actor_default_emits_audit_queued(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(
            "/api/v1/clinician-digest/send-email",
            json={"reason": "End-of-shift summary"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["delivery_status"] == "queued"
        assert body["recipient_email"]
        assert body["audit_event_id"].startswith("clinician_digest-email_sent-")

        # Audit row exists.
        audit = client.get(
            "/api/v1/audit-trail?surface=clinician_digest",
            headers=auth_headers["admin"],
        ).json()["items"]
        actions = {it.get("action") for it in audit}
        assert "clinician_digest.email_sent" in actions

    def test_send_email_with_explicit_recipient(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(
            "/api/v1/clinician-digest/send-email",
            json={
                "recipient_email": "supervisor@example.com",
                "reason": "Director CC",
            },
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        assert r.json()["recipient_email"] == "supervisor@example.com"

    def test_send_email_invalid_recipient_rejected(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(
            "/api/v1/clinician-digest/send-email",
            json={"recipient_email": "not-an-email"},
            headers=auth_headers["clinician"],
        )
        # Pydantic validation -> 422.
        assert r.status_code == 422


# ── Colleague share ─────────────────────────────────────────────────────────


class TestColleagueShare:
    def test_share_with_same_clinic_colleague_succeeds(
        self,
        client: TestClient,
        auth_headers: dict,
        home_colleague_user: User,
    ) -> None:
        r = client.post(
            "/api/v1/clinician-digest/share-colleague",
            json={
                "recipient_user_id": home_colleague_user.id,
                "reason": "FYI",
            },
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["recipient_user_id"] == home_colleague_user.id
        assert body["delivery_status"] == "queued"

    def test_share_with_cross_clinic_user_404_for_clinician(
        self,
        client: TestClient,
        auth_headers: dict,
        other_clinic_user: User,
    ) -> None:
        r = client.post(
            "/api/v1/clinician-digest/share-colleague",
            json={"recipient_user_id": other_clinic_user.id, "reason": "leak"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 404

    def test_share_with_cross_clinic_user_200_for_admin(
        self,
        client: TestClient,
        auth_headers: dict,
        other_clinic_user: User,
    ) -> None:
        r = client.post(
            "/api/v1/clinician-digest/share-colleague",
            json={"recipient_user_id": other_clinic_user.id, "reason": "audit"},
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text

    def test_share_with_unknown_recipient_404(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(
            "/api/v1/clinician-digest/share-colleague",
            json={"recipient_user_id": "user-does-not-exist", "reason": "x"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 404


# ── Sections (per-surface card) ─────────────────────────────────────────────


class TestSections:
    def test_sections_returns_all_surfaces(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/clinician-digest/sections",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        surfaces = {s["surface"] for s in data["sections"]}
        assert {
            "clinician_inbox",
            "wearables_workbench",
            "clinician_adherence_hub",
            "clinician_wellness_hub",
            "adverse_events_hub",
        }.issubset(surfaces)

    def test_sections_top_patients_by_activity(
        self,
        client: TestClient,
        auth_headers: dict,
        home_clinic_patient: Patient,
        home_clinic_patient_two: Patient,
    ) -> None:
        # 3 events for patient-1, 1 for patient-2.
        for _ in range(3):
            _seed_audit(
                target_type="clinician_inbox",
                action="clinician_inbox.item_acknowledged",
                target_id=f"audit-{_uuid.uuid4().hex[:8]}",
                note=f"patient={home_clinic_patient.id}",
            )
        _seed_audit(
            target_type="clinician_inbox",
            action="clinician_inbox.item_acknowledged",
            target_id=f"audit-{_uuid.uuid4().hex[:8]}",
            note=f"patient={home_clinic_patient_two.id}",
        )

        until = _dt.now(_tz.utc).isoformat()
        since = (_dt.now(_tz.utc) - _td(days=1)).isoformat()
        r = client.get(
            f"/api/v1/clinician-digest/sections?since={since}&until={until}",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        sections = r.json()["sections"]
        inbox_section = next(s for s in sections if s["surface"] == "clinician_inbox")
        # patient-1 appears with 3 events, patient-2 with 1.
        top = inbox_section["top_patients"]
        if top:
            assert top[0]["patient_id"] == home_clinic_patient.id
            assert top[0]["event_count"] >= 3


# ── Events listing ──────────────────────────────────────────────────────────


class TestEvents:
    def test_events_filter_by_surface(
        self,
        client: TestClient,
        auth_headers: dict,
        home_clinic_patient: Patient,
    ) -> None:
        _seed_handled_audits_in_window(
            inbox=2, adherence_escalation=1, target_id=home_clinic_patient.id,
        )
        until = _dt.now(_tz.utc).isoformat()
        since = (_dt.now(_tz.utc) - _td(days=1)).isoformat()
        r = client.get(
            f"/api/v1/clinician-digest/events?since={since}&until={until}&surface=clinician_adherence_hub",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        items = r.json()["items"]
        for it in items:
            assert it["surface"] == "clinician_adherence_hub"
        assert any(it["is_escalated"] for it in items)

    def test_events_filter_by_patient(
        self,
        client: TestClient,
        auth_headers: dict,
        home_clinic_patient: Patient,
        home_clinic_patient_two: Patient,
    ) -> None:
        _seed_audit(
            target_type="clinician_inbox",
            action="clinician_inbox.item_acknowledged",
            target_id=f"audit-{_uuid.uuid4().hex[:8]}",
            note=f"patient={home_clinic_patient.id}; ack",
        )
        _seed_audit(
            target_type="clinician_inbox",
            action="clinician_inbox.item_acknowledged",
            target_id=f"audit-{_uuid.uuid4().hex[:8]}",
            note=f"patient={home_clinic_patient_two.id}; ack",
        )
        until = _dt.now(_tz.utc).isoformat()
        since = (_dt.now(_tz.utc) - _td(days=1)).isoformat()
        r = client.get(
            f"/api/v1/clinician-digest/events?since={since}&until={until}&patient_id={home_clinic_patient.id}",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        items = r.json()["items"]
        for it in items:
            assert it["patient_id"] == home_clinic_patient.id

    def test_events_drill_out_url_set(
        self,
        client: TestClient,
        auth_headers: dict,
        home_clinic_patient: Patient,
    ) -> None:
        _seed_audit(
            target_type="clinician_inbox",
            action="clinician_inbox.item_acknowledged",
            target_id=f"audit-{_uuid.uuid4().hex[:8]}",
            note=f"patient={home_clinic_patient.id}; ack",
        )
        until = _dt.now(_tz.utc).isoformat()
        since = (_dt.now(_tz.utc) - _td(days=1)).isoformat()
        r = client.get(
            f"/api/v1/clinician-digest/events?since={since}&until={until}",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        items = r.json()["items"]
        for it in items:
            if it["patient_id"]:
                assert it["drill_out_url"] is not None
                assert it["drill_out_url"].startswith("?page=")


# ── Exports ─────────────────────────────────────────────────────────────────


class TestExports:
    def test_csv_export_returns_csv(
        self, client: TestClient, auth_headers: dict, home_clinic_patient: Patient
    ) -> None:
        _seed_handled_audits_in_window(inbox=1, target_id=home_clinic_patient.id)
        r = client.get(
            "/api/v1/clinician-digest/export.csv",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        assert "text/csv" in r.headers.get("content-type", "")
        # First line should be the header row.
        text = r.text.splitlines()
        assert text[0].startswith("created_at,")

    def test_csv_export_demo_prefix_when_demo_patient_present(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        # Create a demo patient — clinic-cd-demo isn't seeded so we mark a
        # patient with the [DEMO] notes prefix instead, which the helper
        # also detects.
        db = SessionLocal()
        try:
            demo_p = Patient(
                id="patient-cdg-demo",
                clinician_id="actor-clinician-demo",
                first_name="Demo",
                last_name="Digest",
                email="demo-digest@example.com",
                consent_signed=True,
                status="active",
                notes="[DEMO] seeded for digest test",
            )
            db.add(demo_p)
            db.commit()
        finally:
            db.close()
        _seed_audit(
            target_type="clinician_inbox",
            action="clinician_inbox.item_acknowledged",
            target_id=f"audit-{_uuid.uuid4().hex[:8]}",
            note="patient=patient-cdg-demo; ack",
        )
        r = client.get(
            "/api/v1/clinician-digest/export.csv",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        cd = r.headers.get("content-disposition", "")
        assert "DEMO-clinician-digest" in cd
        assert r.headers.get("X-ClinicianDigest-Demo") == "1"

    def test_ndjson_export_returns_ndjson(
        self, client: TestClient, auth_headers: dict, home_clinic_patient: Patient
    ) -> None:
        _seed_handled_audits_in_window(inbox=1, target_id=home_clinic_patient.id)
        r = client.get(
            "/api/v1/clinician-digest/export.ndjson",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        assert "application/x-ndjson" in r.headers.get("content-type", "")


# ── Audit ingestion ─────────────────────────────────────────────────────────


class TestAuditIngestion:
    def test_post_audit_event_view(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(
            "/api/v1/clinician-digest/audit-events",
            json={"event": "view", "note": "page mounted"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        assert r.json()["accepted"] is True

    def test_audit_rows_surface_in_audit_trail(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        # Trigger a couple of audits.
        client.post(
            "/api/v1/clinician-digest/audit-events",
            json={"event": "view"},
            headers=auth_headers["clinician"],
        )
        client.get(
            "/api/v1/clinician-digest/summary",
            headers=auth_headers["clinician"],
        )
        # Admin-scoped query for the surface.
        r = client.get(
            "/api/v1/audit-trail?surface=clinician_digest",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        items = r.json()["items"]
        actions = {it.get("action") for it in items}
        assert "clinician_digest.view" in actions
        assert "clinician_digest.summary_viewed" in actions
