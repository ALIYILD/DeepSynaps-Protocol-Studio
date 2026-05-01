"""Tests for the Patient Delivery-Failure Flag launch-audit (2026-05-01).

Closes the regulator gap on the SendGrid Adapter PR (#381). Today the
audit transcript records ``caregiver_portal.email_digest_sent`` rows
with an honest ``delivery_status=sent|queued|failed``. This PR adds a
patient-side aggregator of the *failed* dispatches plus a "Report
problem" CTA that emits a ``patient_digest.caregiver_delivery_concern``
audit row AND a clinician-mirror row that surfaces in the inbox under
HIGH priority via the existing ``_to_clinician_mirror`` predicate.

This suite asserts:

  * Role gate — patient OK on the patient endpoints, clinician/admin →
    404 (so the patient-scope URL existence is invisible to staff).
    The clinician-side mirror endpoint requires clinician+ scope.
  * IDOR / cross-patient — clinician/admin hitting the patient endpoints
    with a forged ``patient_id`` query param still gets 404. The
    patient-side resolver uses ``actor.actor_id`` only — there is no
    ``patient_id`` to forge.
  * Failures-list returns only failed dispatches scoped to the actor's
    consent grants. ``delivery_status=sent`` rows MUST be excluded.
  * Concern POST emits BOTH the patient-scope audit row
    (``patient_digest.caregiver_delivery_concern``) AND the clinician-
    mirror row
    (``clinician_inbox.caregiver_delivery_concern_to_clinician_mirror``)
    that qualifies as HIGH-priority via the inbox predicate.
  * Concern requires a non-whitespace note (≥1 char trimmed).
  * Audit-trail listing endpoint joins the patient concern rows under
    ``q=patient_digest.caregiver_delivery_concern`` (action filter).
  * NO PHI of caregiver beyond first name leaks through the response —
    the response NEVER contains the caregiver's email or full name.
"""
from __future__ import annotations

import uuid as _uuid
from datetime import datetime as _dt, timedelta as _td, timezone as _tz

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.persistence.models import (
    AuditEventRecord,
    CaregiverConsentGrant,
    Patient,
    User,
)


# ── Fixtures ────────────────────────────────────────────────────────────────


@pytest.fixture(autouse=True)
def _clean_after():
    """Best-effort cleanup of the rows this suite produces.

    Drops audit rows whose target is the demo caregiver(s) and the
    consent grants minted in fixtures, so a re-run does not double-
    seed and so other tests don't see ghost rows.
    """
    yield
    db = SessionLocal()
    try:
        db.query(CaregiverConsentGrant).filter(
            CaregiverConsentGrant.id.like("dlf-grant-%")
        ).delete(synchronize_session=False)
        db.query(AuditEventRecord).filter(
            AuditEventRecord.event_id.like("dlf-test-%")
        ).delete(synchronize_session=False)
        # Patient-digest audit rows produced by the suite (the actor id
        # filter is conservative — only test-scope rows are removed).
        db.query(AuditEventRecord).filter(
            AuditEventRecord.target_type == "patient_digest",
            AuditEventRecord.actor_id == "actor-patient-demo",
        ).delete(synchronize_session=False)
        db.query(AuditEventRecord).filter(
            AuditEventRecord.action
            == "clinician_inbox.caregiver_delivery_concern_to_clinician_mirror",
            AuditEventRecord.actor_id == "actor-patient-demo",
        ).delete(synchronize_session=False)
        db.commit()
    finally:
        db.close()


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
            id="dlf-launch-audit-patient",
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


def _seed_caregiver_user(*, display_name: str = "Care Giver") -> str:
    db = SessionLocal()
    try:
        cg_id = f"dlf-cg-{_uuid.uuid4().hex[:8]}"
        cg = User(
            id=cg_id,
            email=f"{cg_id}@example.com",
            display_name=display_name,
            hashed_password="x",
            role="patient",
            clinic_id=None,
        )
        db.add(cg)
        db.commit()
        return cg_id
    finally:
        db.close()


def _seed_active_grant(*, patient_id: str, caregiver_user_id: str) -> str:
    db = SessionLocal()
    try:
        gid = f"dlf-grant-{_uuid.uuid4().hex[:10]}"
        g = CaregiverConsentGrant(
            id=gid,
            patient_id=patient_id,
            caregiver_user_id=caregiver_user_id,
            granted_at="2026-05-01T00:00:00+00:00",
            granted_by_user_id="actor-patient-demo",
            scope='{"digest": true}',
            note=None,
            created_at="2026-05-01T00:00:00+00:00",
            updated_at="2026-05-01T00:00:00+00:00",
            revoked_at=None,
            revoked_by_user_id=None,
            revocation_reason=None,
        )
        db.add(g)
        db.commit()
        return gid
    finally:
        db.close()


def _seed_dispatch_audit(
    *,
    caregiver_user_id: str,
    delivery_status: str,
    error: str = "",
    when: _dt | None = None,
) -> str:
    db = SessionLocal()
    try:
        ts = (when or _dt.now(_tz.utc)).isoformat()
        eid = f"dlf-test-dispatch-{_uuid.uuid4().hex[:10]}"
        note_parts = [
            "unread=3",
            "recipient=cg@example.com",
            f"delivery_status={delivery_status}",
            "adapter=sendgrid",
        ]
        if error:
            note_parts.append(f"error={error}")
        note = "; ".join(note_parts)
        db.add(
            AuditEventRecord(
                event_id=eid,
                target_id=caregiver_user_id,
                target_type="caregiver_portal",
                action="caregiver_portal.email_digest_sent",
                role="admin",
                actor_id="caregiver-email-digest-worker",
                note=note,
                created_at=ts,
            )
        )
        db.commit()
        return eid
    finally:
        db.close()


# ── 1. Surface whitelist ────────────────────────────────────────────────────


def test_patient_digest_surface_still_in_audit_trail_known_surfaces() -> None:
    """The new endpoints reuse the existing ``patient_digest`` whitelist."""
    from app.routers.audit_trail_router import KNOWN_SURFACES
    assert "patient_digest" in KNOWN_SURFACES
    assert "clinician_inbox" in KNOWN_SURFACES


# ── 2. Role gate — patient endpoints are patient-only ──────────────────────


class TestRoleGate:
    def test_patient_can_get_failures(
        self, client: TestClient, auth_headers: dict, demo_patient: Patient,
    ) -> None:
        r = client.get(
            "/api/v1/patient-digest/caregiver-delivery-failures",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        for k in ("rows", "total_failed_count", "since", "until", "patient_id", "is_demo"):
            assert k in data, f"missing key {k}"

    def test_clinician_on_failures_returns_404(
        self, client: TestClient, auth_headers: dict, demo_patient: Patient,
    ) -> None:
        r = client.get(
            "/api/v1/patient-digest/caregiver-delivery-failures",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 404, r.text

    def test_admin_on_failures_returns_404(
        self, client: TestClient, auth_headers: dict, demo_patient: Patient,
    ) -> None:
        r = client.get(
            "/api/v1/patient-digest/caregiver-delivery-failures",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 404, r.text

    def test_clinician_on_concerns_post_returns_404(
        self, client: TestClient, auth_headers: dict, demo_patient: Patient,
    ) -> None:
        r = client.post(
            "/api/v1/patient-digest/caregiver-delivery-concerns",
            json={"dispatch_id": "anything", "concern_text": "test"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 404, r.text


# ── 3. IDOR — forged patient_id query param still denied ──────────────────


class TestIDOR:
    def test_clinician_with_forged_patient_id_param_still_404(
        self, client: TestClient, auth_headers: dict, demo_patient: Patient,
    ) -> None:
        r = client.get(
            f"/api/v1/patient-digest/caregiver-delivery-failures?patient_id={demo_patient.id}",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 404, r.text

    def test_admin_with_forged_patient_id_param_still_404(
        self, client: TestClient, auth_headers: dict, demo_patient: Patient,
    ) -> None:
        r = client.post(
            "/api/v1/patient-digest/caregiver-delivery-concerns",
            json={
                "dispatch_id": "anything",
                "concern_text": "test",
                "patient_id": demo_patient.id,
            },
            headers=auth_headers["admin"],
        )
        assert r.status_code == 404, r.text


# ── 4. Failures list returns only the actor's grants' failures ────────────


class TestFailuresList:
    def test_failed_dispatch_for_active_grant_is_listed(
        self, client: TestClient, auth_headers: dict, demo_patient: Patient,
    ) -> None:
        cg = _seed_caregiver_user()
        _seed_active_grant(patient_id=demo_patient.id, caregiver_user_id=cg)
        eid = _seed_dispatch_audit(
            caregiver_user_id=cg,
            delivery_status="failed",
            error="HttpStatusError 421",
        )
        r = client.get(
            "/api/v1/patient-digest/caregiver-delivery-failures",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        ids = [row["dispatch_id"] for row in data["rows"]]
        assert eid in ids
        assert data["total_failed_count"] >= 1

    def test_sent_dispatch_excluded(
        self, client: TestClient, auth_headers: dict, demo_patient: Patient,
    ) -> None:
        cg = _seed_caregiver_user()
        _seed_active_grant(patient_id=demo_patient.id, caregiver_user_id=cg)
        sent_eid = _seed_dispatch_audit(caregiver_user_id=cg, delivery_status="sent")
        r = client.get(
            "/api/v1/patient-digest/caregiver-delivery-failures",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200
        ids = [row["dispatch_id"] for row in r.json()["rows"]]
        assert sent_eid not in ids

    def test_failure_outside_window_excluded(
        self, client: TestClient, auth_headers: dict, demo_patient: Patient,
    ) -> None:
        cg = _seed_caregiver_user()
        _seed_active_grant(patient_id=demo_patient.id, caregiver_user_id=cg)
        old_eid = _seed_dispatch_audit(
            caregiver_user_id=cg,
            delivery_status="failed",
            when=_dt.now(_tz.utc) - _td(days=30),
        )
        r = client.get(
            "/api/v1/patient-digest/caregiver-delivery-failures",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200
        ids = [row["dispatch_id"] for row in r.json()["rows"]]
        assert old_eid not in ids


# ── 5. Concern POST emits patient + clinician-mirror audits ───────────────


class TestConcernPostEmitsBothAudits:
    def test_concern_post_records_patient_audit(
        self, client: TestClient, auth_headers: dict, demo_patient: Patient,
    ) -> None:
        cg = _seed_caregiver_user()
        _seed_active_grant(patient_id=demo_patient.id, caregiver_user_id=cg)
        dispatch_eid = _seed_dispatch_audit(
            caregiver_user_id=cg, delivery_status="failed", error="timeout",
        )
        r = client.post(
            "/api/v1/patient-digest/caregiver-delivery-concerns",
            json={
                "dispatch_id": dispatch_eid,
                "concern_text": "She still didn't get the digest.",
            },
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["accepted"] is True
        assert body["dispatch_id"] == dispatch_eid
        assert body["audit_event_id"].startswith("patient_digest-caregiver_delivery_concern-")
        assert body["clinician_mirror_event_id"].startswith(
            "clinician_inbox-caregiver_delivery_concern_to_clinician_mirror-"
        )
        # Patient audit row exists.
        db = SessionLocal()
        try:
            row = (
                db.query(AuditEventRecord)
                .filter(AuditEventRecord.event_id == body["audit_event_id"])
                .first()
            )
            assert row is not None
            assert row.action == "patient_digest.caregiver_delivery_concern"
            assert row.target_type == "patient_digest"
            assert dispatch_eid in (row.note or "")
        finally:
            db.close()

    def test_concern_post_records_clinician_mirror(
        self, client: TestClient, auth_headers: dict, demo_patient: Patient,
    ) -> None:
        cg = _seed_caregiver_user()
        _seed_active_grant(patient_id=demo_patient.id, caregiver_user_id=cg)
        dispatch_eid = _seed_dispatch_audit(
            caregiver_user_id=cg, delivery_status="failed",
        )
        r = client.post(
            "/api/v1/patient-digest/caregiver-delivery-concerns",
            json={"dispatch_id": dispatch_eid, "concern_text": "still missing"},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200, r.text
        mirror_eid = r.json()["clinician_mirror_event_id"]
        db = SessionLocal()
        try:
            row = (
                db.query(AuditEventRecord)
                .filter(AuditEventRecord.event_id == mirror_eid)
                .first()
            )
            assert row is not None
            assert (
                row.action
                == "clinician_inbox.caregiver_delivery_concern_to_clinician_mirror"
            )
            assert row.target_type == "clinician_inbox"
            note = (row.note or "")
            # The mirror row carries the canonical priority=high marker
            # so the clinician inbox HIGH-priority predicate routes it.
            assert "priority=high" in note.lower()
            assert demo_patient.id in note
        finally:
            db.close()

    def test_clinician_mirror_qualifies_as_high_priority(
        self, client: TestClient, auth_headers: dict, demo_patient: Patient,
    ) -> None:
        # The Inbox predicate routes any action ending in
        # ``_to_clinician_mirror`` as HIGH-priority. Pin the predicate
        # against the new action so a future predicate-tightening
        # cannot silently drop these rows.
        from app.routers.clinician_inbox_router import _row_is_high_priority
        cg = _seed_caregiver_user()
        _seed_active_grant(patient_id=demo_patient.id, caregiver_user_id=cg)
        dispatch_eid = _seed_dispatch_audit(
            caregiver_user_id=cg, delivery_status="failed",
        )
        r = client.post(
            "/api/v1/patient-digest/caregiver-delivery-concerns",
            json={"dispatch_id": dispatch_eid, "concern_text": "concern"},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200
        mirror_eid = r.json()["clinician_mirror_event_id"]
        db = SessionLocal()
        try:
            row = (
                db.query(AuditEventRecord)
                .filter(AuditEventRecord.event_id == mirror_eid)
                .first()
            )
            assert row is not None
            assert _row_is_high_priority(row) is True
        finally:
            db.close()


# ── 6. Concern note required ───────────────────────────────────────────────


class TestConcernNoteRequired:
    def test_empty_concern_rejected(
        self, client: TestClient, auth_headers: dict, demo_patient: Patient,
    ) -> None:
        r = client.post(
            "/api/v1/patient-digest/caregiver-delivery-concerns",
            json={"dispatch_id": "anything", "concern_text": ""},
            headers=auth_headers["patient"],
        )
        assert r.status_code in (400, 422), r.text

    def test_whitespace_only_concern_rejected(
        self, client: TestClient, auth_headers: dict, demo_patient: Patient,
    ) -> None:
        r = client.post(
            "/api/v1/patient-digest/caregiver-delivery-concerns",
            json={"dispatch_id": "anything", "concern_text": "    "},
            headers=auth_headers["patient"],
        )
        assert r.status_code in (400, 422), r.text


# ── 7. Audit-trail listing joins the new rows ──────────────────────────────


class TestAuditTrailIngestion:
    def test_audit_trail_lists_concern_rows_via_q_filter(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
    ) -> None:
        cg = _seed_caregiver_user()
        _seed_active_grant(patient_id=demo_patient.id, caregiver_user_id=cg)
        dispatch_eid = _seed_dispatch_audit(
            caregiver_user_id=cg, delivery_status="failed",
        )
        r0 = client.post(
            "/api/v1/patient-digest/caregiver-delivery-concerns",
            json={"dispatch_id": dispatch_eid, "concern_text": "where is my caregiver"},
            headers=auth_headers["patient"],
        )
        assert r0.status_code == 200
        # The audit-trail listing endpoint matches ``q`` against action via
        # LIKE; the patient action key is the canonical search term.
        r1 = client.get(
            "/api/v1/audit-trail?q=patient_digest.caregiver_delivery_concern&limit=200",
            headers=auth_headers["admin"],
        )
        assert r1.status_code == 200, r1.text
        actions = [it["action"] for it in r1.json()["items"]]
        assert "patient_digest.caregiver_delivery_concern" in actions


# ── 8. NO PHI of caregiver beyond first name ──────────────────────────────


class TestNoPhiOfCaregiver:
    def test_failure_row_carries_first_name_only_never_email(
        self, client: TestClient, auth_headers: dict, demo_patient: Patient,
    ) -> None:
        cg = _seed_caregiver_user(display_name="Wendy Caregiver-Doe")
        _seed_active_grant(patient_id=demo_patient.id, caregiver_user_id=cg)
        _seed_dispatch_audit(
            caregiver_user_id=cg,
            delivery_status="failed",
            error="HttpStatusError 421",
        )
        r = client.get(
            "/api/v1/patient-digest/caregiver-delivery-failures",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200
        body = r.text
        # Email never appears.
        assert f"{cg}@example.com" not in body
        # Full display name never appears (last name "Caregiver-Doe").
        assert "Caregiver-Doe" not in body
        # First name ("Wendy") IS present in the row.
        assert "Wendy" in body


# ── 9. Cross-patient — failures list scopes only to actor's grants ────────


class TestCrossPatientScope:
    def test_failures_for_other_patients_grants_are_not_listed(
        self, client: TestClient, auth_headers: dict, demo_patient: Patient,
    ) -> None:
        # Seed a caregiver + grant for ANOTHER patient (the demo
        # account does not own this caregiver). The failed dispatch
        # row for that caregiver MUST NOT appear in the demo patient's
        # response.
        db = SessionLocal()
        try:
            other = Patient(
                id=f"dlf-other-{_uuid.uuid4().hex[:8]}",
                clinician_id="actor-clinician-demo",
                first_name="Other",
                last_name="Patient",
                email=f"other-{_uuid.uuid4().hex[:6]}@example.com",
                consent_signed=True,
                status="active",
            )
            db.add(other)
            db.commit()
            db.refresh(other)
            other_id = other.id
        finally:
            db.close()
        other_cg = _seed_caregiver_user()
        _seed_active_grant(patient_id=other_id, caregiver_user_id=other_cg)
        bad_eid = _seed_dispatch_audit(
            caregiver_user_id=other_cg, delivery_status="failed",
        )
        r = client.get(
            "/api/v1/patient-digest/caregiver-delivery-failures",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200
        ids = [row["dispatch_id"] for row in r.json()["rows"]]
        assert bad_eid not in ids


# ── 10. Coverage-side mirror feed ──────────────────────────────────────────


class TestCoverageMirror:
    def test_coverage_delivery_concerns_endpoint_lists_patient_concerns(
        self, client: TestClient, auth_headers: dict, demo_patient: Patient,
    ) -> None:
        cg = _seed_caregiver_user()
        _seed_active_grant(patient_id=demo_patient.id, caregiver_user_id=cg)
        dispatch_eid = _seed_dispatch_audit(
            caregiver_user_id=cg, delivery_status="failed",
        )
        r0 = client.post(
            "/api/v1/patient-digest/caregiver-delivery-concerns",
            json={"dispatch_id": dispatch_eid, "concern_text": "where is it"},
            headers=auth_headers["patient"],
        )
        assert r0.status_code == 200
        # The coverage endpoint requires clinician scope; admin sees
        # all clinics so we test against admin.
        r1 = client.get(
            "/api/v1/care-team-coverage/delivery-concerns?limit=200",
            headers=auth_headers["admin"],
        )
        assert r1.status_code == 200, r1.text
        items = r1.json()["items"]
        # Some concern row matching this patient must be present.
        patient_ids = {it["patient_id"] for it in items}
        assert demo_patient.id in patient_ids
