"""Tests for /api/v1/research-consent (Slice B of Data Console pipeline).

Covers
------
* Grant → revoke → re-grant: the ledger ends with a second active row.
* Double grant is idempotent — the second call returns the existing row.
* Revoke without an active consent → 400 ``no_active_consent``.
* Cross-clinic clinician actor → 403.
* Patient can revoke their own consent (no clinician approval needed).
* Audit events are emitted for both grant and revoke.

The DB fixture in ``conftest.py`` seeds:
* clinic-demo-default
* actor-clinician-demo (clinician @ clinic-demo-default)
* actor-admin-demo
* actor-supervisor-demo

We add a real Patient + a second clinic + cross-clinic clinician
inside each test so the gate has something to deny.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.persistence.models import (
    AuditEventRecord,
    Clinic,
    Patient,
    ResearchConsent,
    User,
)


AUTH_CLINICIAN = {"Authorization": "Bearer clinician-demo-token"}
AUTH_ADMIN = {"Authorization": "Bearer admin-demo-token"}
AUTH_PATIENT = {"Authorization": "Bearer patient-demo-token"}
AUTH_GUEST = {"Authorization": "Bearer guest-demo-token"}


# ── Helpers ──────────────────────────────────────────────────────────────────


def _seed_patient(
    db: Session,
    *,
    patient_id: str = "test-rc-patient-1",
    clinician_id: str = "actor-clinician-demo",
    email: str | None = None,
) -> Patient:
    """Insert a Patient bound to the seeded demo clinician."""
    patient = Patient(
        id=patient_id,
        clinician_id=clinician_id,
        first_name="Research",
        last_name="Subject",
        email=email,
        status="active",
    )
    db.add(patient)
    db.commit()
    db.refresh(patient)
    return patient


def _seed_foreign_clinic(db: Session) -> tuple[str, str]:
    """Seed a second clinic + clinician so cross-clinic 403 has a target."""
    foreign_clinic_id = "clinic-foreign-x"
    foreign_clinician_id = "actor-foreign-clinician"
    if db.query(Clinic).filter_by(id=foreign_clinic_id).first() is None:
        db.add(Clinic(id=foreign_clinic_id, name="Foreign Clinic"))
    if db.query(User).filter_by(id=foreign_clinician_id).first() is None:
        db.add(
            User(
                id=foreign_clinician_id,
                email="foreign_clinician@example.com",
                display_name="Foreign Clinician",
                hashed_password="x",
                role="clinician",
                package_id="clinician_pro",
                clinic_id=foreign_clinic_id,
            )
        )
    db.commit()
    return foreign_clinic_id, foreign_clinician_id


def _seed_patient_as_demo_patient(db: Session) -> Patient:
    """Seed the canonical demo Patient so the patient-demo-token resolves."""
    demo_email = "patient@deepsynaps.com"
    existing = db.query(Patient).filter(Patient.email == demo_email).first()
    if existing is not None:
        return existing
    return _seed_patient(
        db,
        patient_id="test-rc-demo-patient",
        clinician_id="actor-clinician-demo",
        email=demo_email,
    )


# ── Grant + revoke happy path ────────────────────────────────────────────────


def test_grant_then_revoke_then_regrant_creates_second_active_row(
    client: TestClient,
) -> None:
    db = SessionLocal()
    try:
        _seed_patient(db)
    finally:
        db.close()

    r = client.post(
        "/api/v1/research-consent/patients/test-rc-patient-1/grant",
        json={},
        headers=AUTH_CLINICIAN,
    )
    assert r.status_code == 200, r.text
    grant_body = r.json()
    assert grant_body["granted"] is True
    assert grant_body["is_active"] is True
    assert grant_body["scope"] == "anonymized_research"
    assert grant_body["granted_at"]
    first_id = grant_body["id"]

    r = client.post(
        "/api/v1/research-consent/patients/test-rc-patient-1/revoke",
        json={"reason": "Patient asked verbally during visit."},
        headers=AUTH_CLINICIAN,
    )
    assert r.status_code == 200, r.text
    revoke_body = r.json()
    assert revoke_body["id"] == first_id
    assert revoke_body["is_active"] is False
    assert revoke_body["revoked_at"]
    assert revoke_body["revocation_reason"].startswith("Patient asked")

    # Re-grant after revoke — must insert a new row, not resurrect the old one.
    r = client.post(
        "/api/v1/research-consent/patients/test-rc-patient-1/grant",
        json={"scope": "anonymized_research"},
        headers=AUTH_CLINICIAN,
    )
    assert r.status_code == 200, r.text
    second_grant = r.json()
    assert second_grant["id"] != first_id
    assert second_grant["is_active"] is True

    r = client.get(
        "/api/v1/research-consent/patients/test-rc-patient-1/history",
        headers=AUTH_CLINICIAN,
    )
    assert r.status_code == 200
    history = r.json()
    assert history["total"] == 2
    ids = [item["id"] for item in history["items"]]
    assert first_id in ids and second_grant["id"] in ids


# ── Idempotent double-grant ─────────────────────────────────────────────────


def test_double_grant_is_idempotent(client: TestClient) -> None:
    db = SessionLocal()
    try:
        _seed_patient(db, patient_id="test-rc-double-grant")
    finally:
        db.close()

    r1 = client.post(
        "/api/v1/research-consent/patients/test-rc-double-grant/grant",
        json={},
        headers=AUTH_CLINICIAN,
    )
    assert r1.status_code == 200, r1.text
    r2 = client.post(
        "/api/v1/research-consent/patients/test-rc-double-grant/grant",
        json={},
        headers=AUTH_CLINICIAN,
    )
    assert r2.status_code == 200, r2.text
    assert r1.json()["id"] == r2.json()["id"]


# ── Revoke without active consent ────────────────────────────────────────────


def test_revoke_without_active_consent_returns_400(client: TestClient) -> None:
    db = SessionLocal()
    try:
        _seed_patient(db, patient_id="test-rc-no-active")
    finally:
        db.close()

    r = client.post(
        "/api/v1/research-consent/patients/test-rc-no-active/revoke",
        json={},
        headers=AUTH_CLINICIAN,
    )
    assert r.status_code == 400, r.text
    body = r.json()
    assert body.get("code") == "no_active_consent"


# ── Cross-clinic gate ────────────────────────────────────────────────────────


def test_cross_clinic_actor_is_403(client: TestClient) -> None:
    db = SessionLocal()
    try:
        # Patient owned by a FOREIGN clinic.
        foreign_clinic_id, foreign_clinician_id = _seed_foreign_clinic(db)
        _seed_patient(
            db,
            patient_id="test-rc-foreign-patient",
            clinician_id=foreign_clinician_id,
        )
    finally:
        db.close()

    # clinician-demo-token belongs to clinic-demo-default → 403 on foreign patient.
    r = client.get(
        "/api/v1/research-consent/patients/test-rc-foreign-patient/active",
        headers=AUTH_CLINICIAN,
    )
    assert r.status_code == 403, r.text
    body = r.json()
    assert body.get("code") == "cross_clinic_access_denied"


# ── Patient self-revoke ──────────────────────────────────────────────────────


def test_patient_can_revoke_their_own_consent(client: TestClient) -> None:
    db = SessionLocal()
    try:
        demo_patient = _seed_patient_as_demo_patient(db)
        pid = demo_patient.id
    finally:
        db.close()

    # Clinician grants first (clinician + patient share clinic-demo-default).
    r = client.post(
        f"/api/v1/research-consent/patients/{pid}/grant",
        json={},
        headers=AUTH_CLINICIAN,
    )
    assert r.status_code == 200, r.text

    # Patient revokes via their own token.
    r = client.post(
        f"/api/v1/research-consent/patients/{pid}/revoke",
        json={"reason": "Changed my mind."},
        headers=AUTH_PATIENT,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["is_active"] is False
    assert body["revoked_by_role"] == "patient"


def test_patient_cannot_revoke_other_patient(client: TestClient) -> None:
    """Patient actor scoping a foreign patient_id returns 404 (not 403)."""
    db = SessionLocal()
    try:
        _seed_patient_as_demo_patient(db)  # the patient-demo-token's row
        _seed_patient(db, patient_id="test-rc-other-patient")
    finally:
        db.close()

    r = client.post(
        "/api/v1/research-consent/patients/test-rc-other-patient/revoke",
        json={},
        headers=AUTH_PATIENT,
    )
    assert r.status_code == 404, r.text


# ── Audit events ─────────────────────────────────────────────────────────────


def test_grant_and_revoke_write_audit_events(client: TestClient) -> None:
    db = SessionLocal()
    try:
        _seed_patient(db, patient_id="test-rc-audit-1")
    finally:
        db.close()

    r = client.post(
        "/api/v1/research-consent/patients/test-rc-audit-1/grant",
        json={},
        headers=AUTH_CLINICIAN,
    )
    assert r.status_code == 200, r.text
    r = client.post(
        "/api/v1/research-consent/patients/test-rc-audit-1/revoke",
        json={"reason": "test"},
        headers=AUTH_CLINICIAN,
    )
    assert r.status_code == 200, r.text

    db = SessionLocal()
    try:
        rows = (
            db.query(AuditEventRecord)
            .filter(
                AuditEventRecord.target_type == "research_consent",
                AuditEventRecord.target_id == "test-rc-audit-1",
            )
            .order_by(AuditEventRecord.id.asc())
            .all()
        )
        actions = [r.action for r in rows]
        assert "research_consent_grant" in actions
        assert "research_consent_revoke" in actions
    finally:
        db.close()


# ── Active endpoint shapes ───────────────────────────────────────────────────


def test_active_returns_null_consent_when_none(client: TestClient) -> None:
    db = SessionLocal()
    try:
        _seed_patient(db, patient_id="test-rc-no-rows")
    finally:
        db.close()

    r = client.get(
        "/api/v1/research-consent/patients/test-rc-no-rows/active",
        headers=AUTH_CLINICIAN,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["has_active_consent"] is False
    assert body["consent"] is None


def test_guest_blocked(client: TestClient) -> None:
    db = SessionLocal()
    try:
        _seed_patient(db, patient_id="test-rc-guest-block")
    finally:
        db.close()

    r = client.get(
        "/api/v1/research-consent/patients/test-rc-guest-block/active",
        headers=AUTH_GUEST,
    )
    assert r.status_code in (401, 403), r.text


# ── Bulk consent lookup (Slice C entrypoint) ─────────────────────────────────


def test_bulk_status_lookup_returns_per_patient_flags() -> None:
    """The service helper Slice C will call to pre-filter exports."""
    from app.services.research_consent_service import (
        get_consent_status_for_patients,
        grant_consent,
    )

    db = SessionLocal()
    try:
        _seed_patient(db, patient_id="test-rc-bulk-a")
        _seed_patient(db, patient_id="test-rc-bulk-b")
        _seed_patient(db, patient_id="test-rc-bulk-c")
        grant_consent(
            db,
            patient_id="test-rc-bulk-a",
            actor_user_id="actor-clinician-demo",
            actor_role="clinician",
        )
        # B left ungranted; C granted then revoked.
        grant_consent(
            db,
            patient_id="test-rc-bulk-c",
            actor_user_id="actor-clinician-demo",
            actor_role="clinician",
        )
        from app.services.research_consent_service import revoke_consent

        revoke_consent(
            db,
            patient_id="test-rc-bulk-c",
            actor_user_id="actor-clinician-demo",
            actor_role="clinician",
        )

        statuses = get_consent_status_for_patients(
            db,
            ["test-rc-bulk-a", "test-rc-bulk-b", "test-rc-bulk-c", "missing-pt"],
        )
    finally:
        db.close()

    assert statuses == {
        "test-rc-bulk-a": True,
        "test-rc-bulk-b": False,
        "test-rc-bulk-c": False,
        "missing-pt": False,
    }
