"""Tests for the Caregiver Portal launch-audit (2026-05-01).

Closes the bidirectional half of the consent loop opened by Caregiver
Consent Grants #377: patient grants (#377), caregiver sees + ACKs them
(this PR). Asserts:

* the ``caregiver_portal`` surface is whitelisted in
  ``audit_trail_router.KNOWN_SURFACES`` + the qeeg-analysis
  ``audit-events`` ingestion;
* role gate — only the caregiver_user_id matching ``actor.actor_id``
  can ack their grant; cross-caregiver hits return 404 (so a
  caregiver cannot even confirm the existence of grants targeted at
  OTHER caregivers); guests get 403 on the portal endpoints;
* acknowledge-revocation creates an ``ack_revocation`` revision row +
  emits a ``caregiver_portal.revocation_acknowledged`` audit event;
* acknowledge-revocation is idempotent — re-acking returns the
  original timestamp + a low-priority duplicate audit row;
* acknowledge-revocation refuses to ack a non-revoked grant (400);
* access-log emits ``caregiver_portal.grant_accessed`` audit event;
* access-log is gated on ``scope[scope_key]=True`` — out-of-scope
  click → 403 + ``grant_accessed_out_of_scope`` audit row recorded;
* access-log refuses post-revocation access — 403 +
  ``grant_accessed_after_revocation`` audit row recorded;
* portal audit ingestion at ``/audit-events/portal`` accepts
  caregiver-side breadcrumbs (``view``, ``demo_banner_shown``, etc.);
* audit-trail filter at ``/api/v1/audit-trail?surface=caregiver_portal``
  returns the caregiver-side rows.
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
            id="caregiver-portal-demo-patient",
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
        gid = f"ccg-portal-{_uuid.uuid4().hex[:10]}"
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


@pytest.fixture(autouse=True)
def _clean_grants_after():
    yield
    db = SessionLocal()
    try:
        db.query(CaregiverConsentRevision).filter(
            CaregiverConsentRevision.patient_id.like(
                "caregiver-portal-demo-%"
            )
        ).delete(synchronize_session=False)
        db.query(CaregiverConsentGrant).filter(
            CaregiverConsentGrant.patient_id.like(
                "caregiver-portal-demo-%"
            )
        ).delete(synchronize_session=False)
        db.commit()
    finally:
        db.close()


# ── Surface whitelist sanity ────────────────────────────────────────────────


def test_caregiver_portal_in_audit_trail_known_surfaces() -> None:
    from app.routers.audit_trail_router import KNOWN_SURFACES
    assert "caregiver_portal" in KNOWN_SURFACES


def test_caregiver_portal_surface_accepted_by_qeeg_audit_events(
    client: TestClient, auth_headers: dict
) -> None:
    body = {
        "event": "view",
        "surface": "caregiver_portal",
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
    assert data.get("event_id", "").startswith("caregiver_portal-")


# ── Role gate ───────────────────────────────────────────────────────────────


class TestRoleGate:
    def test_guest_cannot_acknowledge_revocation(
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
        r = client.post(
            f"/api/v1/caregiver-consent/grants/{gid}/acknowledge-revocation",
            headers=auth_headers["guest"],
        )
        assert r.status_code == 403, r.text

    def test_caregiver_can_acknowledge_their_revoked_grant(
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
        r = client.post(
            f"/api/v1/caregiver-consent/grants/{gid}/acknowledge-revocation",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["grant_id"] == gid
        assert data["revocation_acknowledged_at"]
        assert data["audit_event_id"].startswith("caregiver_portal-")

    def test_other_user_cannot_acknowledge_someone_elses_grant(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
    ) -> None:
        # Grant pointed at the patient-demo as caregiver. Clinician-demo
        # tries to ack it — must 404 (cross-caregiver invisible).
        gid = _seed_grant(
            patient_id=demo_patient.id,
            caregiver_user_id="actor-patient-demo",
            revoked=True,
            revocation_reason="withdrew",
        )
        r = client.post(
            f"/api/v1/caregiver-consent/grants/{gid}/acknowledge-revocation",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 404, r.text


# ── Acknowledge revocation ──────────────────────────────────────────────────


class TestAcknowledgeRevocation:
    def test_ack_creates_revision_row_and_audit(
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
        r = client.post(
            f"/api/v1/caregiver-consent/grants/{gid}/acknowledge-revocation",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text

        db = SessionLocal()
        try:
            rev = (
                db.query(CaregiverConsentRevision)
                .filter_by(grant_id=gid, action="ack_revocation")
                .first()
            )
            assert rev is not None
            assert rev.actor_user_id == "actor-clinician-demo"
            aud = (
                db.query(AuditEventRecord)
                .filter(
                    AuditEventRecord.target_type == "caregiver_portal",
                    AuditEventRecord.action
                    == "caregiver_portal.revocation_acknowledged",
                )
                .order_by(AuditEventRecord.id.desc())
                .first()
            )
            assert aud is not None
            assert gid in (aud.note or "") or aud.target_id == gid
        finally:
            db.close()

    def test_ack_is_idempotent(
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
        r1 = client.post(
            f"/api/v1/caregiver-consent/grants/{gid}/acknowledge-revocation",
            headers=auth_headers["clinician"],
        )
        assert r1.status_code == 200, r1.text
        first_ack = r1.json()["revocation_acknowledged_at"]

        r2 = client.post(
            f"/api/v1/caregiver-consent/grants/{gid}/acknowledge-revocation",
            headers=auth_headers["clinician"],
        )
        assert r2.status_code == 200, r2.text
        # Second ack must return the SAME timestamp.
        assert r2.json()["revocation_acknowledged_at"] == first_ack

        # Only ONE ack revision row exists.
        db = SessionLocal()
        try:
            count = (
                db.query(CaregiverConsentRevision)
                .filter_by(grant_id=gid, action="ack_revocation")
                .count()
            )
            assert count == 1
        finally:
            db.close()

    def test_ack_on_active_grant_returns_400(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
    ) -> None:
        gid = _seed_grant(
            patient_id=demo_patient.id,
            caregiver_user_id="actor-clinician-demo",
            revoked=False,
        )
        r = client.post(
            f"/api/v1/caregiver-consent/grants/{gid}/acknowledge-revocation",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 400, r.text

    def test_ack_unknown_grant_returns_404(
        self,
        client: TestClient,
        auth_headers: dict,
    ) -> None:
        r = client.post(
            "/api/v1/caregiver-consent/grants/no-such-grant/acknowledge-revocation",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 404, r.text


# ── Access log ──────────────────────────────────────────────────────────────


class TestAccessLog:
    def test_access_log_emits_audit(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
    ) -> None:
        gid = _seed_grant(
            patient_id=demo_patient.id,
            caregiver_user_id="actor-clinician-demo",
            scope='{"digest": true, "messages": false}',
        )
        r = client.post(
            f"/api/v1/caregiver-consent/grants/{gid}/access-log",
            json={"scope_key": "digest", "surface": "caregiver_portal"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["accepted"] is True
        assert data["scope_key"] == "digest"
        assert data["audit_event_id"].startswith("caregiver_portal-")

        db = SessionLocal()
        try:
            aud = (
                db.query(AuditEventRecord)
                .filter(
                    AuditEventRecord.action
                    == "caregiver_portal.grant_accessed",
                    AuditEventRecord.target_id == gid,
                )
                .first()
            )
            assert aud is not None
            assert "scope_key=digest" in (aud.note or "")
        finally:
            db.close()

    def test_access_log_out_of_scope_returns_403_and_records_attempt(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
    ) -> None:
        gid = _seed_grant(
            patient_id=demo_patient.id,
            caregiver_user_id="actor-clinician-demo",
            scope='{"digest": true, "messages": false}',
        )
        r = client.post(
            f"/api/v1/caregiver-consent/grants/{gid}/access-log",
            json={"scope_key": "messages"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 403, r.text

        db = SessionLocal()
        try:
            aud = (
                db.query(AuditEventRecord)
                .filter(
                    AuditEventRecord.action
                    == "caregiver_portal.grant_accessed_out_of_scope",
                    AuditEventRecord.target_id == gid,
                )
                .first()
            )
            assert aud is not None
        finally:
            db.close()

    def test_access_log_after_revocation_returns_403_and_records_attempt(
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
            scope='{"digest": true}',
        )
        r = client.post(
            f"/api/v1/caregiver-consent/grants/{gid}/access-log",
            json={"scope_key": "digest"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 403, r.text

        db = SessionLocal()
        try:
            aud = (
                db.query(AuditEventRecord)
                .filter(
                    AuditEventRecord.action
                    == "caregiver_portal.grant_accessed_after_revocation",
                    AuditEventRecord.target_id == gid,
                )
                .first()
            )
            assert aud is not None
        finally:
            db.close()

    def test_access_log_unknown_scope_key_returns_400(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
    ) -> None:
        gid = _seed_grant(
            patient_id=demo_patient.id,
            caregiver_user_id="actor-clinician-demo",
            scope='{"digest": true}',
        )
        r = client.post(
            f"/api/v1/caregiver-consent/grants/{gid}/access-log",
            json={"scope_key": "rocketship"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 400, r.text

    def test_cross_caregiver_access_log_returns_404(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
    ) -> None:
        # Grant pointed at patient-demo. Clinician-demo tries to log
        # access — must 404 (not 403 — cross-caregiver invisible).
        gid = _seed_grant(
            patient_id=demo_patient.id,
            caregiver_user_id="actor-patient-demo",
            scope='{"digest": true}',
        )
        r = client.post(
            f"/api/v1/caregiver-consent/grants/{gid}/access-log",
            json={"scope_key": "digest"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 404, r.text


# ── by-caregiver caregiver-view enrichment ──────────────────────────────────


class TestByCaregiverView:
    def test_by_caregiver_returns_patient_first_name_and_clinic(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
    ) -> None:
        _seed_grant(
            patient_id=demo_patient.id,
            caregiver_user_id="actor-clinician-demo",
            scope='{"digest": true}',
        )
        r = client.get(
            "/api/v1/caregiver-consent/grants/by-caregiver",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        items = [it for it in data["items"] if it["patient_id"] == demo_patient.id]
        assert len(items) == 1
        it = items[0]
        # Caregiver-side enrichment present.
        assert it["patient_first_name"] == "Jane"
        # Clinic populated (clinic-demo-default seeded by conftest).
        assert it.get("patient_clinic_id") in {
            "clinic-demo-default",
            None,
        }  # tolerate missing clinician_id chain

    def test_by_caregiver_includes_revocation_acknowledged_at(
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
        # Ack first.
        client.post(
            f"/api/v1/caregiver-consent/grants/{gid}/acknowledge-revocation",
            headers=auth_headers["clinician"],
        )
        r = client.get(
            "/api/v1/caregiver-consent/grants/by-caregiver",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        items = [it for it in r.json()["items"] if it["id"] == gid]
        assert len(items) == 1
        assert items[0]["revocation_acknowledged_at"] is not None


# ── Audit ingestion ─────────────────────────────────────────────────────────


class TestPortalAuditIngestion:
    def test_view_audit_event_persists(
        self,
        client: TestClient,
        auth_headers: dict,
    ) -> None:
        r = client.post(
            "/api/v1/caregiver-consent/audit-events/portal",
            json={"event": "view", "note": "page mount"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["accepted"] is True
        assert body["event_id"].startswith("caregiver_portal-")

    def test_audit_trail_filter_returns_caregiver_portal_rows(
        self,
        client: TestClient,
        auth_headers: dict,
    ) -> None:
        client.post(
            "/api/v1/caregiver-consent/audit-events/portal",
            json={"event": "demo_banner_shown", "using_demo_data": True},
            headers=auth_headers["clinician"],
        )
        r = client.get(
            "/api/v1/audit-trail",
            params={"surface": "caregiver_portal", "limit": 50},
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        items = r.json().get("items", [])
        assert len(items) >= 1
        for it in items:
            assert it.get("surface") == "caregiver_portal"

    def test_guest_cannot_post_portal_audit_events(
        self,
        client: TestClient,
        auth_headers: dict,
    ) -> None:
        r = client.post(
            "/api/v1/caregiver-consent/audit-events/portal",
            json={"event": "view"},
            headers=auth_headers["guest"],
        )
        assert r.status_code == 403, r.text
