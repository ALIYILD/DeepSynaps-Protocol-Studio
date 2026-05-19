"""Unit tests for ``require_off_label_acknowledgement``.

Implements universal must-have #5 from the 2026-05-19 Clinician Workflow OS
audit (PR #1073): persisted ``off_label_acknowledged`` gate that fires before
an off-label protocol can launch. Direct unit tests of the service helper —
no HTTP layer, no router wiring (that lives in follow-up PRs). The helper is
the canonical primitive other routers will call.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

import pytest
from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor
from app.database import SessionLocal
from app.persistence.models import ConsentRecord, Patient, SafetyFlag, AuditEventRecord
from app.services.consent_enforcement import (
    CONSENT_GRANTED_STATES,
    ConsentMissingError,
    OFF_LABEL_CONSENT_TYPE,
    require_off_label_acknowledgement,
)


# ---------------------------------------------------------------------------
# Test fixtures (table-driven; no router wiring yet — that's a separate PR)
# ---------------------------------------------------------------------------


def _make_actor(actor_id: str = "actor-clinician-demo", clinic_id: str = "clinic-x") -> AuthenticatedActor:
    return AuthenticatedActor(
        actor_id=actor_id,
        display_name="Test Clinician",
        role="clinician",
        clinic_id=clinic_id,
        package_id="explorer",
    )


def _seed_patient(db: Session) -> str:
    pid = str(uuid.uuid4())
    patient = Patient(
        id=pid,
        clinician_id="actor-clinician-demo",
        first_name="OffLabel",
        last_name="Test",
        email=f"{pid}@example.com",
        consent_signed=False,
        status="active",
        notes=None,
    )
    db.add(patient)
    db.commit()
    return pid


def _seed_off_label_consent(
    db: Session,
    patient_id: str,
    *,
    status: str = "active",
    signed: bool = True,
    expires_at: Optional[datetime] = None,
    clinician_id: str = "actor-clinician-demo",
) -> ConsentRecord:
    consent = ConsentRecord(
        id=str(uuid.uuid4()),
        patient_id=patient_id,
        clinician_id=clinician_id,
        consent_type=OFF_LABEL_CONSENT_TYPE,
        modality_slug="rtms",
        status=status,
        signed=signed,
        signed_at=datetime.now(timezone.utc) if signed else None,
        expires_at=expires_at,
    )
    db.add(consent)
    db.commit()
    return consent


# ---------------------------------------------------------------------------
# Sanity checks on the policy contract itself
# ---------------------------------------------------------------------------


def test_consent_granted_states_contains_active() -> None:
    assert "active" in CONSENT_GRANTED_STATES


def test_consent_granted_states_excludes_withdrawn_and_expired() -> None:
    assert "withdrawn" not in CONSENT_GRANTED_STATES
    assert "expired" not in CONSENT_GRANTED_STATES


def test_off_label_consent_type_is_a_dedicated_slug() -> None:
    # CWOS audit calls this out as a SEPARATE consent type from
    # ai_analysis / device_sync / document_generation so callers can't
    # accidentally reuse a generic consent row as an off-label gate-open.
    assert OFF_LABEL_CONSENT_TYPE == "off_label_acknowledgement"


# ---------------------------------------------------------------------------
# Enforcer behaviour
# ---------------------------------------------------------------------------


def test_returns_consent_when_active_signed_and_unexpired() -> None:
    db = SessionLocal()
    try:
        pid = _seed_patient(db)
        _seed_off_label_consent(db, pid, status="active", signed=True)
        actor = _make_actor()

        consent = require_off_label_acknowledgement(db, pid, actor, modality_slug="rtms")

        assert consent.consent_type == OFF_LABEL_CONSENT_TYPE
        assert consent.signed is True
        assert consent.status == "active"
    finally:
        db.close()


def test_raises_when_consent_row_missing() -> None:
    db = SessionLocal()
    try:
        pid = _seed_patient(db)
        actor = _make_actor()

        with pytest.raises(ConsentMissingError) as exc:
            require_off_label_acknowledgement(db, pid, actor, modality_slug="tdcs")

        assert "missing" in str(exc.value).lower()
    finally:
        db.close()


def test_raises_when_consent_withdrawn() -> None:
    db = SessionLocal()
    try:
        pid = _seed_patient(db)
        _seed_off_label_consent(db, pid, status="withdrawn", signed=True)
        actor = _make_actor()

        with pytest.raises(ConsentMissingError):
            require_off_label_acknowledgement(db, pid, actor, modality_slug="rtms")
    finally:
        db.close()


def test_raises_when_consent_expired_in_past() -> None:
    db = SessionLocal()
    try:
        pid = _seed_patient(db)
        past = datetime.now(timezone.utc) - timedelta(days=1)
        _seed_off_label_consent(db, pid, status="active", signed=True, expires_at=past)
        actor = _make_actor()

        with pytest.raises(ConsentMissingError) as exc:
            require_off_label_acknowledgement(db, pid, actor, modality_slug="rtms")

        assert "expired" in str(exc.value).lower()
    finally:
        db.close()


def test_raises_when_consent_unsigned_even_if_active() -> None:
    # A row that exists with signed=False is an unfinished workflow; the
    # docstring on the enforcer calls this out as a deliberate gate.
    db = SessionLocal()
    try:
        pid = _seed_patient(db)
        _seed_off_label_consent(db, pid, status="active", signed=False)
        actor = _make_actor()

        with pytest.raises(ConsentMissingError) as exc:
            require_off_label_acknowledgement(db, pid, actor, modality_slug="rtms")

        assert "unsigned" in str(exc.value).lower()
    finally:
        db.close()


def test_does_not_match_consent_signed_by_different_clinician() -> None:
    # Off-label acknowledgement is per-clinician — a different clinician's
    # acknowledgement must not gate-open for this actor. This matches the
    # other three enforcers in consent_enforcement.py.
    db = SessionLocal()
    try:
        pid = _seed_patient(db)
        _seed_off_label_consent(db, pid, status="active", signed=True, clinician_id="other-clinician")
        actor = _make_actor()  # actor-clinician-demo

        with pytest.raises(ConsentMissingError):
            require_off_label_acknowledgement(db, pid, actor, modality_slug="rtms")
    finally:
        db.close()


def test_does_not_match_consent_with_different_consent_type() -> None:
    # A generic ai_analysis consent must NOT satisfy the off-label gate.
    db = SessionLocal()
    try:
        pid = _seed_patient(db)
        # Reuse seed helper but with a different consent_type
        bystander = ConsentRecord(
            id=str(uuid.uuid4()),
            patient_id=pid,
            clinician_id="actor-clinician-demo",
            consent_type="ai_analysis",
            modality_slug="rtms",
            status="active",
            signed=True,
            signed_at=datetime.now(timezone.utc),
            expires_at=None,
        )
        db.add(bystander)
        db.commit()
        actor = _make_actor()

        with pytest.raises(ConsentMissingError):
            require_off_label_acknowledgement(db, pid, actor, modality_slug="rtms")
    finally:
        db.close()


def test_denial_writes_safety_flag_and_audit_row() -> None:
    db = SessionLocal()
    try:
        pid = _seed_patient(db)
        actor = _make_actor()

        with pytest.raises(ConsentMissingError):
            require_off_label_acknowledgement(db, pid, actor, modality_slug="ces")

        # SafetyFlag was recorded for clinician follow-up
        flag = (
            db.query(SafetyFlag)
            .filter(SafetyFlag.patient_id == pid, SafetyFlag.flag_type == "consent_missing")
            .first()
        )
        assert flag is not None
        assert flag.severity == "high"
        assert "off_label_launch_attempted" in (flag.message or "")
        # AuditEventRecord was written with action=off_label_launch_attempted
        event = (
            db.query(AuditEventRecord)
            .filter(
                AuditEventRecord.target_id == pid,
                AuditEventRecord.action == "off_label_launch_attempted",
            )
            .first()
        )
        assert event is not None
        assert event.actor_id == actor.actor_id
    finally:
        db.close()


def test_allow_writes_audit_event_without_safety_flag() -> None:
    db = SessionLocal()
    try:
        pid = _seed_patient(db)
        _seed_off_label_consent(db, pid, status="active", signed=True)
        actor = _make_actor()

        require_off_label_acknowledgement(db, pid, actor, modality_slug="dbs")

        event = (
            db.query(AuditEventRecord)
            .filter(
                AuditEventRecord.target_id == pid,
                AuditEventRecord.action == "off_label_launch_allowed",
            )
            .first()
        )
        assert event is not None
        assert event.target_type == "dbs"
        assert event.actor_id == actor.actor_id

        # And no consent_missing SafetyFlag should have been created
        flag = (
            db.query(SafetyFlag)
            .filter(SafetyFlag.patient_id == pid, SafetyFlag.flag_type == "consent_missing")
            .first()
        )
        assert flag is None
    finally:
        db.close()
