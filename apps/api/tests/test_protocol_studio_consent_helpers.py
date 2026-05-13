"""Unit tests for the protocol_studio consent helpers introduced by #843.

These tests exist because PR #890 shipped ``_consent_active_protocol``
without a ``consent_type`` filter, meaning any active ConsentRecord
(media, device_sync, ai_analysis, etc.) would silently authorise
protocol generation. The follow-up tightened the filter to
``consent_type="document_generation"``.

The follow-up to #842 (PR #895) added the analogous test file for the
device-sync consent helpers; this is the matching companion.
"""
from __future__ import annotations

import uuid

from app.database import SessionLocal
from app.errors import ApiServiceError
from app.persistence.models import ConsentRecord, Patient
from app.routers.protocol_studio_router import (
    _assert_protocol_consent_active,
    _consent_active_protocol,
)

import pytest


def _new_patient(db) -> Patient:
    p = Patient(
        id=str(uuid.uuid4()),
        clinician_id="test-clinician",
        first_name="Proto",
        last_name="Patient",
    )
    db.add(p)
    db.commit()
    return p


def _seed_consent(
    db, *, patient_id: str, consent_type: str, status: str = "active"
) -> ConsentRecord:
    c = ConsentRecord(
        id=str(uuid.uuid4()),
        patient_id=patient_id,
        clinician_id="test-clinician",
        consent_type=consent_type,
        status=status,
        signed=True,
    )
    db.add(c)
    db.commit()
    return c


def test_consent_active_protocol_false_for_no_patient_id() -> None:
    db = SessionLocal()
    try:
        assert _consent_active_protocol(db, "") is False
    finally:
        db.close()


def test_consent_active_protocol_false_for_missing_patient() -> None:
    db = SessionLocal()
    try:
        assert _consent_active_protocol(db, "no-such-patient-xxx") is False
    finally:
        db.close()


def test_consent_active_protocol_false_when_no_consent_record() -> None:
    db = SessionLocal()
    try:
        p = _new_patient(db)
        assert _consent_active_protocol(db, p.id) is False
    finally:
        db.close()


def test_consent_active_protocol_true_for_matching_active_consent() -> None:
    db = SessionLocal()
    try:
        p = _new_patient(db)
        _seed_consent(db, patient_id=p.id, consent_type="document_generation", status="active")
        assert _consent_active_protocol(db, p.id) is True
    finally:
        db.close()


def test_consent_active_protocol_ignores_unrelated_consent_type() -> None:
    """ai_analysis / device_sync / media consents must NOT authorise protocol gen."""
    db = SessionLocal()
    try:
        p = _new_patient(db)
        _seed_consent(db, patient_id=p.id, consent_type="ai_analysis", status="active")
        _seed_consent(db, patient_id=p.id, consent_type="device_sync", status="active")
        _seed_consent(db, patient_id=p.id, consent_type="media", status="active")
        assert _consent_active_protocol(db, p.id) is False
    finally:
        db.close()


def test_consent_active_protocol_ignores_withdrawn_consent() -> None:
    db = SessionLocal()
    try:
        p = _new_patient(db)
        _seed_consent(
            db, patient_id=p.id, consent_type="document_generation", status="withdrawn"
        )
        assert _consent_active_protocol(db, p.id) is False
    finally:
        db.close()


def test_assert_protocol_consent_active_raises_when_missing() -> None:
    db = SessionLocal()
    try:
        p = _new_patient(db)
        with pytest.raises(ApiServiceError) as exc_info:
            _assert_protocol_consent_active(db, p.id)
        assert exc_info.value.status_code == 403
        assert exc_info.value.code == "consent_required"
    finally:
        db.close()


def test_assert_protocol_consent_active_no_raise_when_active() -> None:
    db = SessionLocal()
    try:
        p = _new_patient(db)
        _seed_consent(db, patient_id=p.id, consent_type="document_generation", status="active")
        _assert_protocol_consent_active(db, p.id)  # must not raise
    finally:
        db.close()
