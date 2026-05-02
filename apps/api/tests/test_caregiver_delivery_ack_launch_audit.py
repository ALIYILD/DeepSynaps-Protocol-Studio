"""Tests for the Caregiver Delivery Acknowledgement launch-audit (2026-05-01).

Closes the bidirectional confirmation loop opened by SendGrid Adapter
(#381) + Delivery Failure Flag (#382). Today the audit transcript shows
``caregiver_portal.email_digest_sent`` rows with
``delivery_status=sent`` when SendGrid says the message landed — but a
regulator cannot prove the caregiver ACTUALLY received the dispatch.

This suite asserts:

  * Role gate — caregiver OK; cross-caregiver / guest blocked.
  * Acknowledge-delivery emits a
    ``caregiver_portal.delivery_acknowledged`` audit row keyed
    ``target_id={grant_id}`` and references the most recent landed
    dispatch via ``dispatch=...`` in the note.
  * Idempotent within 24h cooldown — second ack within 24h returns the
    SAME first-ack timestamp + dispatch id (no new audit row).
  * Cross-caregiver 404 on both POST and GET endpoints.
  * GET last-acknowledgement returns 200 with a None payload when the
    caregiver has not yet acked.
  * Patient-side ``caregiver-delivery-summary`` exposes
    ``last_acknowledged_at`` per caregiver row, populated by the most
    recent ack against any grant for the patient.
  * Audit-trail filter at
    ``/api/v1/audit-trail?surface=caregiver_portal&q=delivery_acknowledged``
    surfaces the new audit rows.
  * NO PHI of caregiver beyond first name leaks into the patient-side
    response.
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
    yield
    db = SessionLocal()
    try:
        db.query(CaregiverConsentGrant).filter(
            CaregiverConsentGrant.id.like("cda-grant-%")
        ).delete(synchronize_session=False)
        db.query(AuditEventRecord).filter(
            AuditEventRecord.event_id.like("cda-test-%")
        ).delete(synchronize_session=False)
        # Caregiver-portal audit rows the suite writes via the API
        # (delivery_acknowledged) — keep the cleanup tight to test scope.
        db.query(AuditEventRecord).filter(
            AuditEventRecord.action
            == "caregiver_portal.delivery_acknowledged",
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
            id="cda-launch-audit-patient",
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
) -> str:
    db = SessionLocal()
    try:
        gid = f"cda-grant-{_uuid.uuid4().hex[:10]}"
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
            revoked_at=None,
            revoked_by_user_id=None,
            revocation_reason=None,
        )
        db.add(g)
        db.commit()
        return gid
    finally:
        db.close()


def _seed_landed_dispatch(
    *,
    caregiver_user_id: str,
    when: _dt | None = None,
) -> str:
    """Seed a SendGrid-style email_digest_sent audit row with delivery_status=sent."""
    db = SessionLocal()
    try:
        ts = (when or _dt.now(_tz.utc)).isoformat()
        eid = f"cda-test-dispatch-{_uuid.uuid4().hex[:10]}"
        note = (
            "unread=3; recipient=cg@example.com; "
            "delivery_status=sent; adapter=sendgrid"
        )
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


# ── 1. Surface whitelist + helper symbol ────────────────────────────────────


def test_caregiver_portal_surface_in_audit_trail_known_surfaces() -> None:
    from app.routers.audit_trail_router import KNOWN_SURFACES
    assert "caregiver_portal" in KNOWN_SURFACES


def test_latest_delivery_ack_helper_symbol_exported() -> None:
    """Patient Digest joins acks via ``latest_delivery_ack_for_caregiver``."""
    from app.routers.caregiver_consent_router import (
        latest_delivery_ack_for_caregiver,
    )
    assert callable(latest_delivery_ack_for_caregiver)


# ── 2. Role gate ────────────────────────────────────────────────────────────


class TestRoleGate:
    def test_guest_cannot_acknowledge_delivery(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
    ) -> None:
        gid = _seed_grant(
            patient_id=demo_patient.id,
            caregiver_user_id="actor-clinician-demo",
        )
        r = client.post(
            f"/api/v1/caregiver-consent/grants/{gid}/acknowledge-delivery",
            headers=auth_headers["guest"],
        )
        assert r.status_code == 403, r.text

    def test_caregiver_can_acknowledge_their_grant(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
    ) -> None:
        gid = _seed_grant(
            patient_id=demo_patient.id,
            caregiver_user_id="actor-clinician-demo",
        )
        _seed_landed_dispatch(caregiver_user_id="actor-clinician-demo")
        r = client.post(
            f"/api/v1/caregiver-consent/grants/{gid}/acknowledge-delivery",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["grant_id"] == gid
        assert data["last_acknowledged_at"]
        assert data["audit_event_id"].startswith("caregiver_portal-")
        assert data["cooldown_active"] is False

    def test_other_user_cannot_acknowledge_someone_elses_grant(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
    ) -> None:
        # Grant pointed at the patient-demo as caregiver. Clinician-demo
        # tries to ack — must 404 (cross-caregiver invisible).
        gid = _seed_grant(
            patient_id=demo_patient.id,
            caregiver_user_id="actor-patient-demo",
        )
        r = client.post(
            f"/api/v1/caregiver-consent/grants/{gid}/acknowledge-delivery",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 404, r.text


# ── 3. Acknowledge delivery: audit + idempotency ────────────────────────────


class TestAcknowledgeDelivery:
    def test_ack_emits_delivery_acknowledged_audit(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
    ) -> None:
        gid = _seed_grant(
            patient_id=demo_patient.id,
            caregiver_user_id="actor-clinician-demo",
        )
        dispatch_id = _seed_landed_dispatch(
            caregiver_user_id="actor-clinician-demo",
        )
        r = client.post(
            f"/api/v1/caregiver-consent/grants/{gid}/acknowledge-delivery",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["acknowledged_dispatch_id"] == dispatch_id

        db = SessionLocal()
        try:
            aud = (
                db.query(AuditEventRecord)
                .filter(
                    AuditEventRecord.action
                    == "caregiver_portal.delivery_acknowledged",
                    AuditEventRecord.target_id == gid,
                    AuditEventRecord.actor_id == "actor-clinician-demo",
                )
                .first()
            )
            assert aud is not None
            assert f"dispatch={dispatch_id}" in (aud.note or "")
            assert aud.target_type == "caregiver_portal"
        finally:
            db.close()

    def test_ack_is_idempotent_within_24h(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
    ) -> None:
        gid = _seed_grant(
            patient_id=demo_patient.id,
            caregiver_user_id="actor-clinician-demo",
        )
        _seed_landed_dispatch(caregiver_user_id="actor-clinician-demo")
        r1 = client.post(
            f"/api/v1/caregiver-consent/grants/{gid}/acknowledge-delivery",
            headers=auth_headers["clinician"],
        )
        assert r1.status_code == 200
        first_ack = r1.json()["last_acknowledged_at"]
        first_dispatch = r1.json()["acknowledged_dispatch_id"]
        assert r1.json()["cooldown_active"] is False

        r2 = client.post(
            f"/api/v1/caregiver-consent/grants/{gid}/acknowledge-delivery",
            headers=auth_headers["clinician"],
        )
        assert r2.status_code == 200
        # Same first timestamp + dispatch id, cooldown flag flipped on.
        assert r2.json()["last_acknowledged_at"] == first_ack
        assert r2.json()["acknowledged_dispatch_id"] == first_dispatch
        assert r2.json()["cooldown_active"] is True

        # Only ONE delivery_acknowledged audit row exists.
        db = SessionLocal()
        try:
            count = (
                db.query(AuditEventRecord)
                .filter(
                    AuditEventRecord.action
                    == "caregiver_portal.delivery_acknowledged",
                    AuditEventRecord.target_id == gid,
                    AuditEventRecord.actor_id == "actor-clinician-demo",
                )
                .count()
            )
            assert count == 1
        finally:
            db.close()

    def test_ack_with_no_landed_dispatch_still_succeeds_with_null_dispatch(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
    ) -> None:
        # No landed dispatch seeded — the caregiver may be confirming an
        # off-system delivery. Ack is accepted with a None dispatch id.
        gid = _seed_grant(
            patient_id=demo_patient.id,
            caregiver_user_id="actor-clinician-demo",
        )
        r = client.post(
            f"/api/v1/caregiver-consent/grants/{gid}/acknowledge-delivery",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["acknowledged_dispatch_id"] is None
        assert data["last_acknowledged_at"]

    def test_ack_unknown_grant_returns_404(
        self,
        client: TestClient,
        auth_headers: dict,
    ) -> None:
        r = client.post(
            "/api/v1/caregiver-consent/grants/no-such-grant/acknowledge-delivery",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 404, r.text


# ── 4. GET last-acknowledgement ─────────────────────────────────────────────


class TestLastAcknowledgement:
    def test_get_last_acknowledgement_returns_none_when_never_acked(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
    ) -> None:
        gid = _seed_grant(
            patient_id=demo_patient.id,
            caregiver_user_id="actor-clinician-demo",
        )
        r = client.get(
            f"/api/v1/caregiver-consent/grants/{gid}/last-acknowledgement",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        data = r.json()
        assert data["grant_id"] == gid
        assert data["last_acknowledged_at"] is None
        assert data["acknowledged_dispatch_id"] is None

    def test_get_last_acknowledgement_returns_ts_after_ack(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
    ) -> None:
        gid = _seed_grant(
            patient_id=demo_patient.id,
            caregiver_user_id="actor-clinician-demo",
        )
        dispatch_id = _seed_landed_dispatch(
            caregiver_user_id="actor-clinician-demo",
        )
        r1 = client.post(
            f"/api/v1/caregiver-consent/grants/{gid}/acknowledge-delivery",
            headers=auth_headers["clinician"],
        )
        assert r1.status_code == 200

        r2 = client.get(
            f"/api/v1/caregiver-consent/grants/{gid}/last-acknowledgement",
            headers=auth_headers["clinician"],
        )
        assert r2.status_code == 200
        data = r2.json()
        assert data["grant_id"] == gid
        assert data["last_acknowledged_at"]
        assert data["acknowledged_dispatch_id"] == dispatch_id

    def test_cross_caregiver_get_last_acknowledgement_returns_404(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
    ) -> None:
        gid = _seed_grant(
            patient_id=demo_patient.id,
            caregiver_user_id="actor-patient-demo",
        )
        r = client.get(
            f"/api/v1/caregiver-consent/grants/{gid}/last-acknowledgement",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 404, r.text


# ── 5. Patient-side caregiver-delivery-summary join ─────────────────────────


class TestPatientSideJoin:
    def test_caregiver_delivery_summary_includes_last_acknowledged_at(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
    ) -> None:
        # Seed a grant + landed dispatch, then ack as caregiver.
        gid = _seed_grant(
            patient_id=demo_patient.id,
            caregiver_user_id="actor-clinician-demo",
        )
        _seed_landed_dispatch(caregiver_user_id="actor-clinician-demo")
        r_ack = client.post(
            f"/api/v1/caregiver-consent/grants/{gid}/acknowledge-delivery",
            headers=auth_headers["clinician"],
        )
        assert r_ack.status_code == 200
        ack_ts = r_ack.json()["last_acknowledged_at"]

        # Patient-side: read caregiver-delivery-summary as the patient
        # demo. The row for this caregiver must carry last_acknowledged_at.
        r = client.get(
            "/api/v1/patient-digest/caregiver-delivery-summary",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        rows = data.get("rows") or []
        # At least the caregiver we acked must be present with the stamp.
        matching = [
            row for row in rows
            if row.get("caregiver_user_id") == "actor-clinician-demo"
        ]
        assert len(matching) == 1
        assert matching[0]["last_acknowledged_at"] == ack_ts

    def test_caregiver_delivery_summary_last_acknowledged_at_none_when_never_acked(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
    ) -> None:
        _seed_grant(
            patient_id=demo_patient.id,
            caregiver_user_id="actor-clinician-demo",
        )
        r = client.get(
            "/api/v1/patient-digest/caregiver-delivery-summary",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        rows = data.get("rows") or []
        matching = [
            row for row in rows
            if row.get("caregiver_user_id") == "actor-clinician-demo"
        ]
        assert len(matching) == 1
        # Field is present in the schema, value is None until ack.
        assert "last_acknowledged_at" in matching[0]
        assert matching[0]["last_acknowledged_at"] is None


# ── 6. Audit-trail filter exposure ──────────────────────────────────────────


def test_audit_trail_filter_returns_delivery_acknowledged_rows(
    client: TestClient,
    auth_headers: dict,
    demo_patient: Patient,
) -> None:
    gid = _seed_grant(
        patient_id=demo_patient.id,
        caregiver_user_id="actor-clinician-demo",
    )
    _seed_landed_dispatch(caregiver_user_id="actor-clinician-demo")
    r_ack = client.post(
        f"/api/v1/caregiver-consent/grants/{gid}/acknowledge-delivery",
        headers=auth_headers["clinician"],
    )
    assert r_ack.status_code == 200

    r = client.get(
        "/api/v1/audit-trail",
        params={"surface": "caregiver_portal", "q": "delivery_acknowledged", "limit": 50},
        headers=auth_headers["admin"],
    )
    assert r.status_code == 200, r.text
    items = r.json().get("items") or []
    assert len(items) >= 1
    # At least one row carries the new action.
    actions = {(it.get("action") or "") for it in items}
    assert "caregiver_portal.delivery_acknowledged" in actions


# ── 7. NO PHI of caregiver leaks beyond first name on patient side ──────────


def test_patient_side_summary_does_not_leak_caregiver_email_or_full_name(
    client: TestClient,
    auth_headers: dict,
    demo_patient: Patient,
) -> None:
    # Seed a real caregiver User with a realistic display name + email.
    db = SessionLocal()
    try:
        cg_id = f"cda-cg-{_uuid.uuid4().hex[:8]}"
        cg_email = f"{cg_id}-realemail@example.com"
        db.add(User(
            id=cg_id,
            email=cg_email,
            display_name="Alex Verylonglastname",
            hashed_password="x",
            role="patient",
        ))
        db.commit()
    finally:
        db.close()

    _seed_grant(
        patient_id=demo_patient.id,
        caregiver_user_id=cg_id,
    )
    _seed_landed_dispatch(caregiver_user_id=cg_id)

    r = client.get(
        "/api/v1/patient-digest/caregiver-delivery-summary",
        headers=auth_headers["patient"],
    )
    assert r.status_code == 200, r.text
    body = r.text
    # Email + last-name MUST NOT appear in the patient-side response.
    assert "realemail" not in body
    assert "Verylonglastname" not in body
    # First name IS allowed.
    data = r.json()
    rows = [
        row for row in (data.get("rows") or [])
        if row.get("caregiver_user_id") == cg_id
    ]
    assert len(rows) == 1
    assert rows[0]["caregiver_first_name"] == "Alex"
