"""Tests for the Patient Messages launch-audit (PR 2026-05-01).

Fourth patient-facing surface to receive the launch-audit treatment
after Symptom Journal (#344), Wellness Hub (#345), and Patient Reports
(#346). Cements the patient-side audit pattern across four surfaces.

Covers the patient-scope endpoints added in
``apps/api/app/routers/patient_messages_router.py``:

* GET    /api/v1/messages/threads
* GET    /api/v1/messages/threads/summary
* GET    /api/v1/messages/threads/{thread_id}
* POST   /api/v1/messages/threads
* POST   /api/v1/messages/threads/{thread_id}/messages
* POST   /api/v1/messages/threads/{thread_id}/mark-urgent
* POST   /api/v1/messages/threads/{thread_id}/mark-resolved
* POST   /api/v1/messages/threads/{thread_id}/messages/{message_id}/mark-read
* POST   /api/v1/messages/audit-events

Plus the cross-router contracts:

* ``patient_messages`` is whitelisted by ``audit_trail_router.KNOWN_SURFACES``.
* ``patient_messages`` is accepted by ``/api/v1/qeeg-analysis/audit-events``.
* Patient-side audit rows surface at ``/api/v1/audit-trail?surface=patient_messages``.
* The Patient Reports ``start-question`` handler creates a thread keyed
  ``thread_id=report-{id}`` that this surface can open via deep-link.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.persistence.models import (
    ConsentRecord,
    Message,
    Patient,
    PatientMediaUpload,
)


# ── Fixtures ────────────────────────────────────────────────────────────────


@pytest.fixture
def demo_patient_with_consent() -> Patient:
    """Seed the Patient row that ``actor-patient-demo`` resolves to via email."""
    db = SessionLocal()
    try:
        patient = Patient(
            id="patient-messages-demo",
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
            id="patient-messages-withdrawn",
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
            id="patient-messages-other",
            clinician_id="actor-clinician-demo",
            first_name="Other",
            last_name="Patient",
            email="other-messages@example.com",
            consent_signed=True,
            status="active",
        )
        db.add(patient)
        db.commit()
        db.refresh(patient)
        return patient
    finally:
        db.close()


def _seed_inbound_message(
    *,
    patient_id: str,
    body: str = "Hello",
    subject: str = "Care team update",
    category: str = "general",
    thread_id: str | None = None,
    priority: str = "normal",
    sender_id: str = "actor-clinician-demo",
    recipient_id: str = "actor-patient-demo",
    is_read: bool = False,
) -> str:
    """Insert a Message row addressed to the patient (clinician → patient)."""
    import uuid as _uuid
    from datetime import datetime as _dt, timezone as _tz

    db = SessionLocal()
    try:
        mid = str(_uuid.uuid4())
        tid = thread_id or mid
        msg = Message(
            id=mid,
            sender_id=sender_id,
            recipient_id=recipient_id,
            patient_id=patient_id,
            body=body,
            subject=subject,
            category=category,
            thread_id=tid,
            priority=priority,
            created_at=_dt.now(_tz.utc),
            read_at=(_dt.now(_tz.utc) if is_read else None),
        )
        db.add(msg)
        db.commit()
        return mid
    finally:
        db.close()


def _seed_report(
    *,
    patient_id: str,
    title: str = "Progress note",
) -> str:
    """Insert a PatientMediaUpload row representing a report. Returns the id."""
    import json as _json
    import uuid as _uuid
    from datetime import datetime as _dt, timezone as _tz

    db = SessionLocal()
    try:
        rid = str(_uuid.uuid4())
        meta = {
            "report_type": "clinician",
            "title": title,
            "source": "test",
            "report_date": _dt.now(_tz.utc).date().isoformat(),
            "is_demo": False,
            "revision": 1,
        }
        rec = PatientMediaUpload(
            id=rid,
            patient_id=patient_id,
            uploaded_by="actor-clinician-demo",
            media_type="text",
            file_ref=None,
            file_size_bytes=None,
            text_content="body",
            patient_note=_json.dumps(meta)[:512],
            status="generated",
            deleted_at=None,
        )
        db.add(rec)
        db.commit()
        return rid
    finally:
        db.close()


# ── Surface whitelist sanity ────────────────────────────────────────────────


def test_patient_messages_surface_in_audit_trail_known_surfaces() -> None:
    from app.routers.audit_trail_router import KNOWN_SURFACES

    assert "patient_messages" in KNOWN_SURFACES


def test_patient_messages_surface_accepted_by_qeeg_audit_events(
    client: TestClient, auth_headers: dict
) -> None:
    body = {
        "event": "view",
        "note": "patient_messages surface whitelist sanity",
        "surface": "patient_messages",
    }
    r = client.post(
        "/api/v1/qeeg-analysis/audit-events",
        json=body,
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("accepted") is True
    assert data.get("event_id", "").startswith("patient_messages-")


# ── Role gate ───────────────────────────────────────────────────────────────


class TestRoleGate:
    def test_patient_can_list_own_threads(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        _seed_inbound_message(patient_id=demo_patient_with_consent.id)
        r = client.get(
            "/api/v1/messages/threads", headers=auth_headers["patient"]
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
        r = client.get(
            "/api/v1/messages/threads", headers=auth_headers["clinician"]
        )
        assert r.status_code == 404, r.text

    def test_admin_calling_patient_scope_endpoint_returns_404(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        r = client.get(
            "/api/v1/messages/threads", headers=auth_headers["admin"]
        )
        assert r.status_code == 404, r.text

    def test_guest_cannot_list_patient_threads(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/messages/threads", headers=auth_headers["guest"]
        )
        assert r.status_code in (401, 403, 404), r.text


# ── Cross-patient isolation (IDOR) ──────────────────────────────────────────


class TestCrossPatientIsolation:
    def test_patient_cannot_open_another_patients_thread(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
        other_patient: Patient,
    ) -> None:
        tid = "thread-cross-patient"
        _seed_inbound_message(
            patient_id=other_patient.id,
            thread_id=tid,
            recipient_id="someone-else",
        )
        r = client.get(
            f"/api/v1/messages/threads/{tid}",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 404
        # Reply / urgent / resolved / mark-read all 404 too.
        r = client.post(
            f"/api/v1/messages/threads/{tid}/messages",
            json={"body": "hi"},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 404
        r = client.post(
            f"/api/v1/messages/threads/{tid}/mark-urgent",
            json={},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 404
        r = client.post(
            f"/api/v1/messages/threads/{tid}/mark-resolved",
            json={},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 404


# ── Thread-opened auto-emits audit ──────────────────────────────────────────


class TestThreadOpenedAudit:
    def test_thread_open_emits_audit_row(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        tid = "thread-audit"
        _seed_inbound_message(
            patient_id=demo_patient_with_consent.id, thread_id=tid
        )
        r = client.get(
            f"/api/v1/messages/threads/{tid}",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["thread"]["thread_id"] == tid

        listing = client.get(
            "/api/v1/audit-trail?surface=patient_messages",
            headers=auth_headers["admin"],
        )
        assert listing.status_code == 200
        items = listing.json()["items"]
        actions = {it.get("action") for it in items}
        assert "patient_messages.thread_opened" in actions


# ── Compose ────────────────────────────────────────────────────────────────


class TestCompose:
    def test_compose_creates_thread_and_first_message(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        r = client.post(
            "/api/v1/messages/threads",
            json={
                "category": "general",
                "subject": "Hello",
                "body": "Question about my plan.",
            },
            headers=auth_headers["patient"],
        )
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["thread"]["thread_id"]
        assert len(body["messages"]) == 1
        assert body["messages"][0]["body"] == "Question about my plan."

        # Thread is visible to the patient.
        listing = client.get(
            "/api/v1/messages/threads", headers=auth_headers["patient"]
        ).json()
        assert listing["total"] == 1
        # Audit row recorded.
        audit = client.get(
            "/api/v1/audit-trail?surface=patient_messages",
            headers=auth_headers["admin"],
        ).json()["items"]
        assert any(
            it.get("action") == "patient_messages.message_sent" for it in audit
        )

    def test_compose_with_urgent_emits_clinician_visible_audit(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        r = client.post(
            "/api/v1/messages/threads",
            json={
                "category": "treatment-plan",
                "subject": "Urgent question",
                "body": "I need help with side effects.",
                "is_urgent": True,
            },
            headers=auth_headers["patient"],
        )
        assert r.status_code == 201, r.text
        audit = client.get(
            "/api/v1/audit-trail?surface=patient_messages",
            headers=auth_headers["admin"],
        ).json()["items"]
        actions = [it.get("action") for it in audit]
        assert "patient_messages.urgent_marked" in actions
        # Clinician-visible mirror row routed to the clinician actor.
        mirror = next(
            (
                it
                for it in audit
                if it.get("action") == "patient_messages.urgent_flag_to_clinician"
            ),
            None,
        )
        assert mirror is not None
        assert mirror.get("target_id") == "actor-clinician-demo"

    def test_compose_blocks_blank_body(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        r = client.post(
            "/api/v1/messages/threads",
            json={"category": "general", "body": "   "},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 422


# ── Reply ──────────────────────────────────────────────────────────────────


class TestReply:
    def test_reply_appends_to_existing_thread(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        tid = "thread-reply"
        _seed_inbound_message(
            patient_id=demo_patient_with_consent.id, thread_id=tid
        )
        r = client.post(
            f"/api/v1/messages/threads/{tid}/messages",
            json={"body": "Thanks for the update!"},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 201, r.text
        body = r.json()
        assert len(body["messages"]) == 2
        # Reply audit row emitted.
        audit = client.get(
            "/api/v1/audit-trail?surface=patient_messages",
            headers=auth_headers["admin"],
        ).json()["items"]
        sent = [
            it
            for it in audit
            if it.get("action") == "patient_messages.message_sent"
        ]
        assert len(sent) >= 1


# ── Urgent ─────────────────────────────────────────────────────────────────


class TestUrgent:
    def test_mark_urgent_audited_with_clinician_mirror(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        tid = "thread-urgent"
        _seed_inbound_message(
            patient_id=demo_patient_with_consent.id, thread_id=tid
        )
        r = client.post(
            f"/api/v1/messages/threads/{tid}/mark-urgent",
            json={"note": "side effects worsening"},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["accepted"] is True
        assert body["is_urgent"] is True

        audit = client.get(
            "/api/v1/audit-trail?surface=patient_messages",
            headers=auth_headers["admin"],
        ).json()["items"]
        actions = {it.get("action") for it in audit}
        assert "patient_messages.urgent_marked" in actions
        assert "patient_messages.urgent_flag_to_clinician" in actions


# ── Resolved ───────────────────────────────────────────────────────────────


class TestResolved:
    def test_mark_resolved_audited(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        tid = "thread-resolved"
        _seed_inbound_message(
            patient_id=demo_patient_with_consent.id, thread_id=tid
        )
        r = client.post(
            f"/api/v1/messages/threads/{tid}/mark-resolved",
            json={"note": "thanks!"},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["is_resolved"] is True

        audit = client.get(
            "/api/v1/audit-trail?surface=patient_messages",
            headers=auth_headers["admin"],
        ).json()["items"]
        actions = {it.get("action") for it in audit}
        assert "patient_messages.thread_resolved" in actions


# ── Mark-read ──────────────────────────────────────────────────────────────


class TestMarkRead:
    def test_mark_read_updates_flag_and_audits(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        tid = "thread-read"
        mid = _seed_inbound_message(
            patient_id=demo_patient_with_consent.id, thread_id=tid
        )
        r = client.post(
            f"/api/v1/messages/threads/{tid}/messages/{mid}/mark-read",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["accepted"] is True
        assert body["read_at"]

        # The Message row read_at is now non-null.
        db = SessionLocal()
        try:
            msg = db.query(Message).filter_by(id=mid).first()
            assert msg is not None
            assert msg.read_at is not None
        finally:
            db.close()

        audit = client.get(
            "/api/v1/audit-trail?surface=patient_messages",
            headers=auth_headers["admin"],
        ).json()["items"]
        actions = {it.get("action") for it in audit}
        assert "patient_messages.message_read" in actions

    def test_cannot_mark_own_outgoing_read(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        # Patient sends a message; the system should reject "mark read" on
        # their own outgoing.
        sent = client.post(
            "/api/v1/messages/threads",
            json={"category": "general", "body": "Hello"},
            headers=auth_headers["patient"],
        ).json()
        tid = sent["thread"]["thread_id"]
        mid = sent["messages"][0]["id"]
        r = client.post(
            f"/api/v1/messages/threads/{tid}/messages/{mid}/mark-read",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 400


# ── Consent-revoked ─────────────────────────────────────────────────────────


class TestConsentRevoked:
    def test_consent_revoked_blocks_compose(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_consent_withdrawn: Patient,
    ) -> None:
        r = client.post(
            "/api/v1/messages/threads",
            json={"category": "general", "body": "hi"},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 403
        assert r.json().get("code") == "consent_inactive"

    def test_consent_revoked_blocks_reply(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_consent_withdrawn: Patient,
    ) -> None:
        tid = "thread-consent"
        _seed_inbound_message(
            patient_id=demo_patient_consent_withdrawn.id, thread_id=tid
        )
        r = client.post(
            f"/api/v1/messages/threads/{tid}/messages",
            json={"body": "hi"},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 403
        assert r.json().get("code") == "consent_inactive"

    def test_consent_revoked_blocks_urgent(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_consent_withdrawn: Patient,
    ) -> None:
        tid = "thread-consent-urgent"
        _seed_inbound_message(
            patient_id=demo_patient_consent_withdrawn.id, thread_id=tid
        )
        r = client.post(
            f"/api/v1/messages/threads/{tid}/mark-urgent",
            json={},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 403
        assert r.json().get("code") == "consent_inactive"

    def test_consent_revoked_still_allows_read(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_consent_withdrawn: Patient,
    ) -> None:
        _seed_inbound_message(
            patient_id=demo_patient_consent_withdrawn.id
        )
        r = client.get(
            "/api/v1/messages/threads",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200
        body = r.json()
        assert body["consent_active"] is False
        assert body["total"] == 1


# ── Summary ─────────────────────────────────────────────────────────────────


class TestSummary:
    def test_summary_counts_unread_urgent_awaiting(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        # Two clinician → patient threads, one urgent + unread, one read.
        _seed_inbound_message(
            patient_id=demo_patient_with_consent.id,
            thread_id="t-urgent",
            priority="urgent",
        )
        _seed_inbound_message(
            patient_id=demo_patient_with_consent.id,
            thread_id="t-read",
            is_read=True,
        )
        # Patient-started thread awaiting clinician reply.
        client.post(
            "/api/v1/messages/threads",
            json={"category": "general", "body": "Question?"},
            headers=auth_headers["patient"],
        )

        r = client.get(
            "/api/v1/messages/threads/summary",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200, r.text
        s = r.json()
        assert s["total_threads"] == 3
        assert s["urgent"] >= 1
        assert s["unread"] >= 1
        assert s["awaiting_reply"] >= 1
        assert s["consent_active"] is True


# ── Deep-link from Patient Reports ──────────────────────────────────────────


class TestDeepLinkFromReports:
    def test_report_question_thread_opens_via_deep_link(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        # Use the Patient Reports start-question handler (PR #346) to
        # create a thread, then verify the patient_messages surface can
        # open it via the report-{id} thread_id.
        rid = _seed_report(patient_id=demo_patient_with_consent.id)
        sq = client.post(
            f"/api/v1/reports/{rid}/start-question",
            json={"question": "What does this trend mean?"},
            headers=auth_headers["patient"],
        )
        assert sq.status_code == 200, sq.text
        thread_id = sq.json()["thread_id"]
        assert thread_id == f"report-{rid}"

        # Now open that thread via the patient_messages surface.
        r = client.get(
            f"/api/v1/messages/threads/{thread_id}",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["thread"]["thread_id"] == thread_id
        assert body["related_report_id"] == rid
        assert len(body["messages"]) == 1


# ── Audit-event ingestion ───────────────────────────────────────────────────


class TestAuditIngestion:
    def test_post_audit_event_visible_at_audit_trail(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        r = client.post(
            "/api/v1/messages/audit-events",
            json={"event": "view", "note": "page mount"},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["accepted"] is True
        assert body["event_id"].startswith("patient_messages-")

        listing = client.get(
            "/api/v1/audit-trail?surface=patient_messages",
            headers=auth_headers["admin"],
        ).json()
        assert any(
            (
                it.get("target_type") == "patient_messages"
                or it.get("surface") == "patient_messages"
            )
            for it in listing.get("items", [])
        )

    def test_clinician_cannot_post_patient_messages_audit_events(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(
            "/api/v1/messages/audit-events",
            json={"event": "view"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 403

    def test_audit_event_with_cross_patient_thread_returns_404(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
        other_patient: Patient,
    ) -> None:
        tid = "thread-cross-audit"
        _seed_inbound_message(patient_id=other_patient.id, thread_id=tid)
        r = client.post(
            "/api/v1/messages/audit-events",
            json={"event": "thread_opened", "thread_id": tid},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 404
