"""Tests for the Caregiver Notification Hub launch-audit (2026-05-01).

Closes the next chain step flagged by Caregiver Portal #378. The Hub is
a server-side notification feed for caregivers that joins
``audit_event_records`` (where ``target_id`` is one of the actor's
grant ids) with ``caregiver_consent_revisions`` (revoke + ack rows)
into a typed event stream. Read-receipt state is stored as
``caregiver_portal.notification_dismissed`` audit rows keyed
``target_id=notif-{id}`` — no new tables.

This suite asserts:

* role gate — caregiver_user_id matching ``actor.actor_id`` ✅;
  cross-caregiver hit on mark-read returns 404; guest is 403;
* list joins audit_events + revisions correctly — a freshly revoked
  grant + an access-log row both appear in the feed;
* summary counts unread / read accurately;
* mark-read is idempotent — re-marking returns ``already_read=True``
  with no new audit row;
* mark-read emits a ``caregiver_portal.notification_dismissed`` audit
  row keyed ``target_id=notif-{id}``;
* bulk-mark-read processes a list, increments ``not_found`` for
  unknown ids, and emits one audit row per processed id;
* cross-caregiver bulk-mark-read still increments not_found rather
  than leaking the existence of OTHER caregivers' notifications;
* audit-trail ingestion at
  ``/api/v1/audit-trail?surface=caregiver_portal&q=caregiver_portal.notification``
  returns the dismissal rows.
"""
from __future__ import annotations

import uuid as _uuid

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.persistence.models import (
    AuditEventRecord,
    CaregiverConsentGrant,
    CaregiverConsentRevision,
    Patient,
    User,
)


# ── Fixtures ────────────────────────────────────────────────────────────────


@pytest.fixture
def demo_patient() -> Patient:
    """Seed the Patient row that ``actor-patient-demo`` resolves to."""
    db = SessionLocal()
    try:
        db.query(Patient).filter(
            Patient.email == "patient@deepsynaps.com"
        ).delete()
        db.commit()
        patient = Patient(
            id="caregiver-notif-demo-patient",
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


def _seed_grant(
    *,
    patient_id: str,
    caregiver_user_id: str,
    scope: str = '{"digest": true}',
    revoked: bool = False,
    revocation_reason: str | None = None,
) -> str:
    db = SessionLocal()
    try:
        gid = f"ccg-notif-{_uuid.uuid4().hex[:10]}"
        g = CaregiverConsentGrant(
            id=gid,
            patient_id=patient_id,
            caregiver_user_id=caregiver_user_id,
            granted_at="2026-05-01T00:00:00+00:00",
            granted_by_user_id="actor-patient-demo",
            scope=scope,
            note=None,
            created_at="2026-05-01T00:00:00+00:00",
            updated_at="2026-05-01T00:00:00+00:00",
            revoked_at=("2026-05-01T01:00:00+00:00" if revoked else None),
            revoked_by_user_id=("actor-patient-demo" if revoked else None),
            revocation_reason=revocation_reason,
        )
        db.add(g)
        db.commit()
        return gid
    finally:
        db.close()


def _seed_revision(
    *,
    grant_id: str,
    patient_id: str,
    caregiver_user_id: str,
    action: str,
    actor_user_id: str = "actor-patient-demo",
    reason: str | None = None,
    created_at: str = "2026-05-01T01:00:00+00:00",
) -> str:
    db = SessionLocal()
    try:
        rid = f"ccr-notif-{_uuid.uuid4().hex[:10]}"
        rev = CaregiverConsentRevision(
            id=rid,
            grant_id=grant_id,
            patient_id=patient_id,
            caregiver_user_id=caregiver_user_id,
            action=action,
            scope_before=None,
            scope_after=None,
            actor_user_id=actor_user_id,
            reason=reason,
            created_at=created_at,
        )
        db.add(rev)
        db.commit()
        return rid
    finally:
        db.close()


def _seed_audit_row(
    *,
    target_id: str,
    action: str,
    actor_id: str = "actor-clinician-demo",
    role: str = "clinician",
    note: str = "",
    created_at: str = "2026-05-01T02:00:00+00:00",
) -> str:
    db = SessionLocal()
    try:
        eid = f"caregiver_portal-notif-{_uuid.uuid4().hex[:10]}"
        row = AuditEventRecord(
            event_id=eid,
            target_id=target_id,
            target_type="caregiver_portal",
            action=action,
            role=role,
            actor_id=actor_id,
            note=note,
            created_at=created_at,
        )
        db.add(row)
        db.commit()
        return eid
    finally:
        db.close()


@pytest.fixture(autouse=True)
def _clean_after():
    yield
    db = SessionLocal()
    try:
        db.query(CaregiverConsentRevision).filter(
            CaregiverConsentRevision.patient_id.like("caregiver-notif-demo-%")
        ).delete(synchronize_session=False)
        db.query(CaregiverConsentGrant).filter(
            CaregiverConsentGrant.patient_id.like("caregiver-notif-demo-%")
        ).delete(synchronize_session=False)
        db.commit()
    finally:
        db.close()


# ── Role gate ───────────────────────────────────────────────────────────────


class TestRoleGate:
    def test_guest_cannot_list_notifications(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/caregiver-consent/notifications",
            headers=auth_headers["guest"],
        )
        assert r.status_code == 403, r.text

    def test_guest_cannot_summary(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/caregiver-consent/notifications/summary",
            headers=auth_headers["guest"],
        )
        assert r.status_code == 403, r.text

    def test_caregiver_can_list_their_own_feed(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
    ) -> None:
        gid = _seed_grant(
            patient_id=demo_patient.id,
            caregiver_user_id="actor-clinician-demo",
            revoked=True,
            revocation_reason="withdrew",
        )
        _seed_revision(
            grant_id=gid,
            patient_id=demo_patient.id,
            caregiver_user_id="actor-clinician-demo",
            action="revoke",
            reason="withdrew",
        )
        r = client.get(
            "/api/v1/caregiver-consent/notifications",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        items = r.json().get("items", [])
        assert any(it["type"] == "revocation" for it in items)

    def test_actor_with_no_grants_gets_empty_feed(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        # The patient-demo has zero caregiver grants pointed at them.
        r = client.get(
            "/api/v1/caregiver-consent/notifications",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200, r.text
        assert r.json().get("items") == []


# ── Feed join ───────────────────────────────────────────────────────────────


class TestFeedJoin:
    def test_revocation_revision_appears_as_typed_notification(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
    ) -> None:
        gid = _seed_grant(
            patient_id=demo_patient.id,
            caregiver_user_id="actor-clinician-demo",
            revoked=True,
            revocation_reason="changed mind",
        )
        rev_id = _seed_revision(
            grant_id=gid,
            patient_id=demo_patient.id,
            caregiver_user_id="actor-clinician-demo",
            action="revoke",
            reason="changed mind",
        )
        r = client.get(
            "/api/v1/caregiver-consent/notifications",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        items = r.json().get("items", [])
        rev_items = [it for it in items if it["id"] == f"rev-{rev_id}"]
        assert len(rev_items) == 1
        it = rev_items[0]
        assert it["type"] == "revocation"
        assert it["grant_id"] == gid
        assert "changed mind" in it["summary"]
        assert it["surface"] == "caregiver_consent"

    def test_access_log_audit_row_appears_in_feed(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
    ) -> None:
        gid = _seed_grant(
            patient_id=demo_patient.id,
            caregiver_user_id="actor-clinician-demo",
        )
        eid = _seed_audit_row(
            target_id=gid,
            action="caregiver_portal.grant_accessed",
            note=f"patient={demo_patient.id}; scope_key=digest",
        )
        r = client.get(
            "/api/v1/caregiver-consent/notifications",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        items = r.json().get("items", [])
        ev_items = [it for it in items if it["id"] == f"aud-{eid}"]
        assert len(ev_items) == 1
        assert ev_items[0]["type"] == "access_log"
        assert ev_items[0]["surface"] == "caregiver_portal"

    def test_status_filter_unread_drops_already_read(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
    ) -> None:
        gid = _seed_grant(
            patient_id=demo_patient.id,
            caregiver_user_id="actor-clinician-demo",
        )
        eid = _seed_audit_row(
            target_id=gid,
            action="caregiver_portal.grant_accessed",
        )
        notif_id = f"aud-{eid}"
        # Mark it read.
        client.post(
            f"/api/v1/caregiver-consent/notifications/{notif_id}/mark-read",
            headers=auth_headers["clinician"],
        )
        r_unread = client.get(
            "/api/v1/caregiver-consent/notifications?status=unread",
            headers=auth_headers["clinician"],
        )
        assert r_unread.status_code == 200, r_unread.text
        unread = [
            it for it in r_unread.json()["items"] if it["id"] == notif_id
        ]
        assert len(unread) == 0
        r_read = client.get(
            "/api/v1/caregiver-consent/notifications?status=read",
            headers=auth_headers["clinician"],
        )
        assert r_read.status_code == 200, r_read.text
        read = [
            it for it in r_read.json()["items"] if it["id"] == notif_id
        ]
        assert len(read) == 1
        assert read[0]["is_read"] is True

    def test_surface_filter(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
    ) -> None:
        gid = _seed_grant(
            patient_id=demo_patient.id,
            caregiver_user_id="actor-clinician-demo",
            revoked=True,
            revocation_reason="surface filter",
        )
        _seed_revision(
            grant_id=gid,
            patient_id=demo_patient.id,
            caregiver_user_id="actor-clinician-demo",
            action="revoke",
            reason="surface filter",
        )
        _seed_audit_row(
            target_id=gid,
            action="caregiver_portal.grant_accessed",
        )
        r = client.get(
            "/api/v1/caregiver-consent/notifications?surface=caregiver_portal",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        items = r.json()["items"]
        assert all(it["surface"] == "caregiver_portal" for it in items)


# ── Summary ─────────────────────────────────────────────────────────────────


class TestSummary:
    def test_summary_counts_unread_and_read(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
    ) -> None:
        gid = _seed_grant(
            patient_id=demo_patient.id,
            caregiver_user_id="actor-clinician-demo",
        )
        eid = _seed_audit_row(
            target_id=gid,
            action="caregiver_portal.grant_accessed",
        )
        notif_id = f"aud-{eid}"

        # Pre-mark: 1 unread.
        s_pre = client.get(
            "/api/v1/caregiver-consent/notifications/summary",
            headers=auth_headers["clinician"],
        ).json()
        assert s_pre["unread"] >= 1

        client.post(
            f"/api/v1/caregiver-consent/notifications/{notif_id}/mark-read",
            headers=auth_headers["clinician"],
        )
        s_post = client.get(
            "/api/v1/caregiver-consent/notifications/summary",
            headers=auth_headers["clinician"],
        ).json()
        assert s_post["unread"] == s_pre["unread"] - 1
        assert s_post["read"] >= 1


# ── Mark-read ───────────────────────────────────────────────────────────────


class TestMarkRead:
    def test_mark_read_emits_dismissal_audit(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
    ) -> None:
        gid = _seed_grant(
            patient_id=demo_patient.id,
            caregiver_user_id="actor-clinician-demo",
        )
        eid = _seed_audit_row(
            target_id=gid,
            action="caregiver_portal.grant_accessed",
        )
        notif_id = f"aud-{eid}"
        r = client.post(
            f"/api/v1/caregiver-consent/notifications/{notif_id}/mark-read",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["accepted"] is True
        assert body["already_read"] is False
        assert body["audit_event_id"].startswith("caregiver_portal-")

        db = SessionLocal()
        try:
            row = (
                db.query(AuditEventRecord)
                .filter(
                    AuditEventRecord.action
                    == "caregiver_portal.notification_dismissed",
                    AuditEventRecord.target_id == f"notif-{notif_id}",
                    AuditEventRecord.actor_id == "actor-clinician-demo",
                )
                .first()
            )
            assert row is not None
        finally:
            db.close()

    def test_mark_read_is_idempotent(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
    ) -> None:
        gid = _seed_grant(
            patient_id=demo_patient.id,
            caregiver_user_id="actor-clinician-demo",
        )
        eid = _seed_audit_row(
            target_id=gid,
            action="caregiver_portal.grant_accessed",
        )
        notif_id = f"aud-{eid}"

        r1 = client.post(
            f"/api/v1/caregiver-consent/notifications/{notif_id}/mark-read",
            headers=auth_headers["clinician"],
        )
        assert r1.status_code == 200
        r2 = client.post(
            f"/api/v1/caregiver-consent/notifications/{notif_id}/mark-read",
            headers=auth_headers["clinician"],
        )
        assert r2.status_code == 200
        assert r2.json()["already_read"] is True

        db = SessionLocal()
        try:
            count = (
                db.query(AuditEventRecord)
                .filter(
                    AuditEventRecord.action
                    == "caregiver_portal.notification_dismissed",
                    AuditEventRecord.target_id == f"notif-{notif_id}",
                    AuditEventRecord.actor_id == "actor-clinician-demo",
                )
                .count()
            )
            assert count == 1
        finally:
            db.close()

    def test_mark_read_unknown_id_returns_404(
        self,
        client: TestClient,
        auth_headers: dict,
    ) -> None:
        r = client.post(
            "/api/v1/caregiver-consent/notifications/aud-nope/mark-read",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 404, r.text

    def test_cross_caregiver_mark_read_returns_404(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
    ) -> None:
        # Grant pointed at patient-demo as caregiver. The clinician-demo
        # actor calling mark-read must NOT be able to dismiss it.
        gid = _seed_grant(
            patient_id=demo_patient.id,
            caregiver_user_id="actor-patient-demo",
        )
        eid = _seed_audit_row(
            target_id=gid,
            action="caregiver_portal.grant_accessed",
            actor_id="actor-patient-demo",
            role="patient",
        )
        notif_id = f"aud-{eid}"
        r = client.post(
            f"/api/v1/caregiver-consent/notifications/{notif_id}/mark-read",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 404, r.text


# ── Bulk mark-read ──────────────────────────────────────────────────────────


class TestBulkMarkRead:
    def test_bulk_mark_read_processes_list(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
    ) -> None:
        gid = _seed_grant(
            patient_id=demo_patient.id,
            caregiver_user_id="actor-clinician-demo",
        )
        e1 = _seed_audit_row(
            target_id=gid,
            action="caregiver_portal.grant_accessed",
            created_at="2026-05-01T02:00:00+00:00",
        )
        e2 = _seed_audit_row(
            target_id=gid,
            action="caregiver_portal.grant_accessed_out_of_scope",
            created_at="2026-05-01T03:00:00+00:00",
        )
        ids = [f"aud-{e1}", f"aud-{e2}"]

        r = client.post(
            "/api/v1/caregiver-consent/notifications/bulk-mark-read",
            json={
                "notification_ids": ids,
                "note": "Mark all read CTA",
            },
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["accepted"] is True
        assert body["processed"] == 2
        assert body["already_read"] == 0
        assert body["not_found"] == 0
        assert len(body["audit_event_ids"]) == 2

    def test_bulk_mark_read_counts_unknown_as_not_found(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
    ) -> None:
        gid = _seed_grant(
            patient_id=demo_patient.id,
            caregiver_user_id="actor-clinician-demo",
        )
        eid = _seed_audit_row(
            target_id=gid,
            action="caregiver_portal.grant_accessed",
        )
        r = client.post(
            "/api/v1/caregiver-consent/notifications/bulk-mark-read",
            json={
                "notification_ids": [f"aud-{eid}", "aud-bogus", ""],
                "note": "mixed",
            },
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["processed"] == 1
        assert body["not_found"] == 1

    def test_bulk_mark_read_cross_caregiver_counts_as_not_found(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
    ) -> None:
        # A grant pointed at patient-demo. clinician-demo tries to bulk
        # mark-read the underlying access-log notification — must increment
        # not_found, NOT dismiss.
        gid = _seed_grant(
            patient_id=demo_patient.id,
            caregiver_user_id="actor-patient-demo",
        )
        eid = _seed_audit_row(
            target_id=gid,
            action="caregiver_portal.grant_accessed",
            actor_id="actor-patient-demo",
            role="patient",
        )
        notif_id = f"aud-{eid}"
        r = client.post(
            "/api/v1/caregiver-consent/notifications/bulk-mark-read",
            json={"notification_ids": [notif_id]},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["processed"] == 0
        assert body["not_found"] == 1

    def test_bulk_mark_read_idempotent(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
    ) -> None:
        gid = _seed_grant(
            patient_id=demo_patient.id,
            caregiver_user_id="actor-clinician-demo",
        )
        eid = _seed_audit_row(
            target_id=gid,
            action="caregiver_portal.grant_accessed",
        )
        notif_id = f"aud-{eid}"
        # First mark via single endpoint, then bulk mark same id.
        client.post(
            f"/api/v1/caregiver-consent/notifications/{notif_id}/mark-read",
            headers=auth_headers["clinician"],
        )
        r = client.post(
            "/api/v1/caregiver-consent/notifications/bulk-mark-read",
            json={"notification_ids": [notif_id]},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["already_read"] == 1
        assert body["processed"] == 0


# ── Audit-trail ingestion ───────────────────────────────────────────────────


class TestAuditTrailIngestion:
    def test_dismissal_audit_appears_in_audit_trail(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
    ) -> None:
        gid = _seed_grant(
            patient_id=demo_patient.id,
            caregiver_user_id="actor-clinician-demo",
        )
        eid = _seed_audit_row(
            target_id=gid,
            action="caregiver_portal.grant_accessed",
        )
        notif_id = f"aud-{eid}"
        client.post(
            f"/api/v1/caregiver-consent/notifications/{notif_id}/mark-read",
            headers=auth_headers["clinician"],
        )
        # Admin-scoped read so the cross-actor self-scope on audit-trail
        # does not hide the row.
        r = client.get(
            "/api/v1/audit-trail",
            params={
                "surface": "caregiver_portal",
                "q": "caregiver_portal.notification",
                "limit": 50,
            },
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        items = r.json().get("items", [])
        dismissals = [
            it for it in items
            if it.get("action") == "caregiver_portal.notification_dismissed"
            and it.get("target_id") == f"notif-{notif_id}"
        ]
        assert len(dismissals) >= 1


# ── Sanity ──────────────────────────────────────────────────────────────────


def test_summary_includes_disclaimers(
    client: TestClient, auth_headers: dict
) -> None:
    r = client.get(
        "/api/v1/caregiver-consent/notifications/summary",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200, r.text
    assert isinstance(r.json().get("disclaimers"), list)
    assert any(
        "audit" in (d or "").lower() for d in r.json()["disclaimers"]
    )
