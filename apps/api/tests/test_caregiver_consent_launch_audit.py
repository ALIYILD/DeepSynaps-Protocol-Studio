"""Tests for the Caregiver Consent Grants launch-audit (2026-05-01).

Closes the caregiver-share loop opened by Patient Digest #376. Patient
Digest records intent + audit when a patient clicks "Share with
caregiver", but ``delivery_status`` is hard-coded ``queued`` because
there is no durable consent table for the platform to consult. This
suite asserts:

* the ``caregiver_consent`` surface is whitelisted in
  ``audit_trail_router.KNOWN_SURFACES`` + the qeeg-analysis
  ``audit-events`` ingestion;
* role gate — patient OK; clinician/admin/guest on patient endpoints
  → 404 (so the patient-scope URL existence is invisible);
* IDOR — clinician hitting the patient endpoints with a forged
  ``patient_id`` query param still returns 404;
* cross-patient — patient A cannot grant on behalf of patient B;
* grant lifecycle — create writes a row + revision + audit, revoke
  requires a reason and is immutable thereafter (409 on second
  revoke);
* by-caregiver — caregiver sees only grants pointed at them, with
  ``items=[]`` for non-caregiver callers;
* Patient Digest #376 wire-up — with an active grant carrying
  ``scope.digest=True`` the digest endpoint returns
  ``delivery_status='sent'``; without it, it stays ``queued`` and
  carries an honest message;
* audit ingestion at ``/api/v1/audit-trail?surface=caregiver_consent``.
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
            id="caregiver-consent-demo-patient",
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
def caregiver_user() -> User:
    """Seed a caregiver User row (role='patient' is fine — caregivers are
    just other users from the patient's perspective)."""
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
        db.refresh(cg)
        return cg
    finally:
        db.close()


@pytest.fixture(autouse=True)
def _clean_grants_after():
    yield
    db = SessionLocal()
    try:
        db.query(CaregiverConsentRevision).filter(
            CaregiverConsentRevision.patient_id.like("caregiver-consent-demo-%")
        ).delete(synchronize_session=False)
        db.query(CaregiverConsentGrant).filter(
            CaregiverConsentGrant.patient_id.like("caregiver-consent-demo-%")
        ).delete(synchronize_session=False)
        db.commit()
    finally:
        db.close()


# ── Surface whitelist sanity ────────────────────────────────────────────────


def test_caregiver_consent_in_audit_trail_known_surfaces() -> None:
    from app.routers.audit_trail_router import KNOWN_SURFACES
    assert "caregiver_consent" in KNOWN_SURFACES


def test_caregiver_consent_surface_accepted_by_qeeg_audit_events(
    client: TestClient, auth_headers: dict
) -> None:
    body = {
        "event": "view",
        "surface": "caregiver_consent",
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
    assert data.get("event_id", "").startswith("caregiver_consent-")


# ── Role gate ───────────────────────────────────────────────────────────────


class TestRoleGate:
    def test_patient_can_list_grants(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
    ) -> None:
        r = client.get(
            "/api/v1/caregiver-consent/grants",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "items" in data
        assert data["patient_id"] == demo_patient.id

    def test_clinician_on_grants_returns_404(
        self,
        client: TestClient,
        auth_headers: dict,
    ) -> None:
        r = client.get(
            "/api/v1/caregiver-consent/grants",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 404, r.text

    def test_admin_on_grants_returns_404(
        self,
        client: TestClient,
        auth_headers: dict,
    ) -> None:
        r = client.get(
            "/api/v1/caregiver-consent/grants",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 404, r.text

    def test_guest_denied(
        self,
        client: TestClient,
        auth_headers: dict,
    ) -> None:
        r = client.get(
            "/api/v1/caregiver-consent/grants",
            headers=auth_headers["guest"],
        )
        assert r.status_code != 200


# ── IDOR / cross-patient ────────────────────────────────────────────────────


class TestIDOR:
    def test_clinician_with_forged_patient_id_param_still_404(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
    ) -> None:
        r = client.get(
            f"/api/v1/caregiver-consent/grants?patient_id={demo_patient.id}",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 404, r.text

    def test_patient_cannot_view_other_patients_grant(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
        caregiver_user: User,
    ) -> None:
        # Seed a grant that belongs to a DIFFERENT patient.
        db = SessionLocal()
        try:
            other = Patient(
                id="caregiver-consent-demo-other",
                clinician_id="actor-clinician-demo",
                first_name="Other",
                last_name="Patient",
                email=f"other-{_uuid.uuid4().hex[:6]}@example.com",
                consent_signed=True,
                status="active",
            )
            db.add(other)
            db.commit()
            grant_id = "ccg-other-grant-id"
            g = CaregiverConsentGrant(
                id=grant_id,
                patient_id=other.id,
                caregiver_user_id=caregiver_user.id,
                granted_at="2026-05-01T00:00:00+00:00",
                granted_by_user_id="someone-else",
                scope='{"digest": true}',
                created_at="2026-05-01T00:00:00+00:00",
                updated_at="2026-05-01T00:00:00+00:00",
            )
            db.add(g)
            db.commit()
        finally:
            db.close()
        # Demo patient (resolved from token) tries to view another
        # patient's grant — must 404.
        r = client.get(
            f"/api/v1/caregiver-consent/grants/{grant_id}",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 404, r.text

    def test_patient_cannot_revoke_other_patients_grant(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
        caregiver_user: User,
    ) -> None:
        db = SessionLocal()
        try:
            other = Patient(
                id="caregiver-consent-demo-other2",
                clinician_id="actor-clinician-demo",
                first_name="Other2",
                last_name="Patient",
                email=f"other2-{_uuid.uuid4().hex[:6]}@example.com",
                consent_signed=True,
                status="active",
            )
            db.add(other)
            db.commit()
            grant_id = "ccg-other-revoke-id"
            g = CaregiverConsentGrant(
                id=grant_id,
                patient_id=other.id,
                caregiver_user_id=caregiver_user.id,
                granted_at="2026-05-01T00:00:00+00:00",
                granted_by_user_id="someone-else",
                scope='{"digest": true}',
                created_at="2026-05-01T00:00:00+00:00",
                updated_at="2026-05-01T00:00:00+00:00",
            )
            db.add(g)
            db.commit()
        finally:
            db.close()
        r = client.post(
            f"/api/v1/caregiver-consent/grants/{grant_id}/revoke",
            json={"reason": "trying to revoke a grant I don't own"},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 404, r.text


# ── Grant lifecycle ─────────────────────────────────────────────────────────


class TestGrantLifecycle:
    def test_create_grant_writes_row_and_audit(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
        caregiver_user: User,
    ) -> None:
        r = client.post(
            "/api/v1/caregiver-consent/grants",
            json={
                "caregiver_user_id": caregiver_user.id,
                "scope": {"digest": True, "messages": False, "reports": True},
                "note": "weekly digest only",
            },
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["patient_id"] == demo_patient.id
        assert data["caregiver_user_id"] == caregiver_user.id
        assert data["scope"]["digest"] is True
        assert data["scope"]["messages"] is False
        assert data["scope"]["reports"] is True
        assert data["is_active"] is True
        assert data["revoked_at"] is None
        # DB row exists.
        db = SessionLocal()
        try:
            row = db.query(CaregiverConsentGrant).filter_by(id=data["id"]).first()
            assert row is not None
            assert row.granted_by_user_id == "actor-patient-demo"
            # Revision row exists.
            rev = (
                db.query(CaregiverConsentRevision)
                .filter_by(grant_id=row.id, action="create")
                .first()
            )
            assert rev is not None
            # Audit row exists.
            aud = (
                db.query(AuditEventRecord)
                .filter(
                    AuditEventRecord.target_type == "caregiver_consent",
                    AuditEventRecord.action == "caregiver_consent.grant_created",
                )
                .order_by(AuditEventRecord.id.desc())
                .first()
            )
            assert aud is not None
        finally:
            db.close()

    def test_create_grant_idempotent_writes_scope_edit_revision(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
        caregiver_user: User,
    ) -> None:
        # First grant.
        r1 = client.post(
            "/api/v1/caregiver-consent/grants",
            json={
                "caregiver_user_id": caregiver_user.id,
                "scope": {"digest": True},
            },
            headers=auth_headers["patient"],
        )
        assert r1.status_code == 200, r1.text
        first_id = r1.json()["id"]
        # Second grant for the SAME caregiver — must update existing.
        r2 = client.post(
            "/api/v1/caregiver-consent/grants",
            json={
                "caregiver_user_id": caregiver_user.id,
                "scope": {"digest": True, "messages": True},
            },
            headers=auth_headers["patient"],
        )
        assert r2.status_code == 200, r2.text
        assert r2.json()["id"] == first_id
        assert r2.json()["scope"]["messages"] is True
        # Revision count = 2 (one create, one scope_edit).
        db = SessionLocal()
        try:
            revs = (
                db.query(CaregiverConsentRevision)
                .filter_by(grant_id=first_id)
                .order_by(CaregiverConsentRevision.created_at.asc())
                .all()
            )
            actions = [r.action for r in revs]
            assert "create" in actions
            assert "scope_edit" in actions
        finally:
            db.close()

    def test_create_grant_unknown_caregiver_404(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
    ) -> None:
        r = client.post(
            "/api/v1/caregiver-consent/grants",
            json={
                "caregiver_user_id": "no-such-caregiver",
                "scope": {"digest": True},
            },
            headers=auth_headers["patient"],
        )
        assert r.status_code == 404, r.text

    def test_revoke_requires_reason_and_is_immutable(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
        caregiver_user: User,
    ) -> None:
        # Create grant.
        r = client.post(
            "/api/v1/caregiver-consent/grants",
            json={
                "caregiver_user_id": caregiver_user.id,
                "scope": {"digest": True},
            },
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200, r.text
        gid = r.json()["id"]

        # Revoke without reason → 422.
        r_norevoke = client.post(
            f"/api/v1/caregiver-consent/grants/{gid}/revoke",
            json={},
            headers=auth_headers["patient"],
        )
        assert r_norevoke.status_code in (400, 422)

        # Revoke with reason → 200, stamps revoked_at.
        r_revoke = client.post(
            f"/api/v1/caregiver-consent/grants/{gid}/revoke",
            json={"reason": "no longer trust the recipient"},
            headers=auth_headers["patient"],
        )
        assert r_revoke.status_code == 200, r_revoke.text
        data = r_revoke.json()
        assert data["revoked_at"] is not None
        assert data["revoked_by_user_id"] == "actor-patient-demo"
        assert data["revocation_reason"] == "no longer trust the recipient"
        assert data["is_active"] is False

        # Second revoke → 409 (immutable).
        r_again = client.post(
            f"/api/v1/caregiver-consent/grants/{gid}/revoke",
            json={"reason": "double-revoke"},
            headers=auth_headers["patient"],
        )
        assert r_again.status_code == 409, r_again.text

    def test_get_grant_returns_404_for_unknown_id(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
    ) -> None:
        r = client.get(
            "/api/v1/caregiver-consent/grants/no-such-grant",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 404, r.text


# ── by-caregiver ────────────────────────────────────────────────────────────


class TestByCaregiver:
    def test_caregiver_sees_their_grants(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
    ) -> None:
        # Seed a grant pointed at the clinician demo actor (we just
        # use it as a stand-in caregiver — by-caregiver is filtered by
        # actor.actor_id).
        db = SessionLocal()
        try:
            g = CaregiverConsentGrant(
                id=f"ccg-bycg-{_uuid.uuid4().hex[:8]}",
                patient_id=demo_patient.id,
                caregiver_user_id="actor-clinician-demo",
                granted_at="2026-05-01T00:00:00+00:00",
                granted_by_user_id="actor-patient-demo",
                scope='{"digest": true}',
                created_at="2026-05-01T00:00:00+00:00",
                updated_at="2026-05-01T00:00:00+00:00",
            )
            db.add(g)
            db.commit()
        finally:
            db.close()
        r = client.get(
            "/api/v1/caregiver-consent/grants/by-caregiver",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["caregiver_user_id"] == "actor-clinician-demo"
        assert any(it["patient_id"] == demo_patient.id for it in data["items"])

    def test_non_caregiver_returns_empty_list(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
    ) -> None:
        # The patient is not a caregiver target for themselves — empty.
        r = client.get(
            "/api/v1/caregiver-consent/grants/by-caregiver",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200, r.text
        assert r.json()["items"] == []


# ── Patient Digest #376 wire-up ─────────────────────────────────────────────


class TestPatientDigestShareCaregiver:
    def test_share_caregiver_with_active_grant_sets_status_sent(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
        caregiver_user: User,
    ) -> None:
        # Patient grants caregiver digest scope.
        r_grant = client.post(
            "/api/v1/caregiver-consent/grants",
            json={
                "caregiver_user_id": caregiver_user.id,
                "scope": {"digest": True},
            },
            headers=auth_headers["patient"],
        )
        assert r_grant.status_code == 200, r_grant.text

        # Patient Digest #376 share-caregiver — must flip to 'sent'.
        r_share = client.post(
            "/api/v1/patient-digest/share-caregiver",
            json={"caregiver_user_id": caregiver_user.id, "reason": "weekly"},
            headers=auth_headers["patient"],
        )
        assert r_share.status_code == 200, r_share.text
        data = r_share.json()
        assert data["delivery_status"] == "sent"
        assert data["consent_required"] is False

    def test_share_caregiver_without_grant_stays_queued(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
        caregiver_user: User,
    ) -> None:
        r = client.post(
            "/api/v1/patient-digest/share-caregiver",
            json={"caregiver_user_id": caregiver_user.id, "reason": "weekly"},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["delivery_status"] == "queued"
        assert data["consent_required"] is True
        assert "consent" in (data.get("note") or "").lower()

    def test_share_caregiver_with_revoked_grant_stays_queued(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
        caregiver_user: User,
    ) -> None:
        # Grant + revoke.
        r_grant = client.post(
            "/api/v1/caregiver-consent/grants",
            json={
                "caregiver_user_id": caregiver_user.id,
                "scope": {"digest": True},
            },
            headers=auth_headers["patient"],
        )
        gid = r_grant.json()["id"]
        client.post(
            f"/api/v1/caregiver-consent/grants/{gid}/revoke",
            json={"reason": "withdrawn"},
            headers=auth_headers["patient"],
        )
        # Share — must stay queued because grant is revoked.
        r = client.post(
            "/api/v1/patient-digest/share-caregiver",
            json={"caregiver_user_id": caregiver_user.id},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["delivery_status"] == "queued"

    def test_share_caregiver_with_grant_missing_digest_scope_stays_queued(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
        caregiver_user: User,
    ) -> None:
        # Grant with messages=true but digest=false — share must stay queued.
        r_grant = client.post(
            "/api/v1/caregiver-consent/grants",
            json={
                "caregiver_user_id": caregiver_user.id,
                "scope": {"digest": False, "messages": True},
            },
            headers=auth_headers["patient"],
        )
        assert r_grant.status_code == 200, r_grant.text
        r = client.post(
            "/api/v1/patient-digest/share-caregiver",
            json={"caregiver_user_id": caregiver_user.id},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200, r.text
        assert r.json()["delivery_status"] == "queued"


# ── Audit ingestion ─────────────────────────────────────────────────────────


class TestAuditIngestion:
    def test_view_audit_event_persists(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
    ) -> None:
        r = client.post(
            "/api/v1/caregiver-consent/audit-events",
            json={"event": "view", "note": "page mount"},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["accepted"] is True
        assert body["event_id"].startswith("caregiver_consent-")

        db = SessionLocal()
        try:
            row = (
                db.query(AuditEventRecord)
                .filter(AuditEventRecord.event_id == body["event_id"])
                .first()
            )
            assert row is not None
            assert row.target_type == "caregiver_consent"
            assert row.action == "caregiver_consent.view"
        finally:
            db.close()

    def test_audit_trail_filter_returns_caregiver_consent_rows(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
    ) -> None:
        client.post(
            "/api/v1/caregiver-consent/audit-events",
            json={"event": "demo_banner_shown"},
            headers=auth_headers["patient"],
        )
        r = client.get(
            "/api/v1/audit-trail",
            params={"surface": "caregiver_consent", "limit": 50},
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        items = r.json().get("items", [])
        assert len(items) >= 1
        for it in items:
            assert it.get("surface") == "caregiver_consent"

    def test_admin_cannot_post_audit_events(
        self,
        client: TestClient,
        auth_headers: dict,
    ) -> None:
        r = client.post(
            "/api/v1/caregiver-consent/audit-events",
            json={"event": "view"},
            headers=auth_headers["admin"],
        )
        assert r.status_code == 403, r.text
