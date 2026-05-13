"""Unit tests for the device_sync consent helpers introduced by #842.

These tests exist because PR #891 shipped a call to
``_assert_device_consent_active`` without defining the function, and the
follow-up PR fixed the definition. The risk of regression — losing the
helper again, or filtering by the wrong column — is uniquely high here,
because the integration tests in ``test_device_sync_router.py`` only
exercise the 404-on-missing-connection branch and never reach the
consent gate.
"""
from __future__ import annotations

import uuid

import pytest

from app.database import SessionLocal
from app.errors import ApiServiceError
from app.persistence.models import ConsentRecord, Patient
from app.routers.device_sync_router import (
    _assert_device_consent_active,
    _consent_active_device,
)


def _new_patient(db) -> Patient:
    p = Patient(
        id=str(uuid.uuid4()),
        clinician_id="test-clinician",
        first_name="Consent",
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


def test_consent_active_device_false_for_no_patient_id() -> None:
    db = SessionLocal()
    try:
        assert _consent_active_device("", db) is False
    finally:
        db.close()


def test_consent_active_device_false_for_missing_patient() -> None:
    db = SessionLocal()
    try:
        assert _consent_active_device("no-such-patient-xxx", db) is False
    finally:
        db.close()


def test_consent_active_device_false_when_no_consent_record() -> None:
    db = SessionLocal()
    try:
        p = _new_patient(db)
        assert _consent_active_device(p.id, db) is False
    finally:
        db.close()


def test_consent_active_device_true_for_matching_active_consent() -> None:
    db = SessionLocal()
    try:
        p = _new_patient(db)
        _seed_consent(db, patient_id=p.id, consent_type="device_sync", status="active")
        assert _consent_active_device(p.id, db) is True
    finally:
        db.close()


def test_consent_active_device_ignores_unrelated_consent_type() -> None:
    """A media or ai_analysis consent should NOT authorise device sync."""
    db = SessionLocal()
    try:
        p = _new_patient(db)
        _seed_consent(db, patient_id=p.id, consent_type="media", status="active")
        _seed_consent(db, patient_id=p.id, consent_type="ai_analysis", status="active")
        assert _consent_active_device(p.id, db) is False
    finally:
        db.close()


def test_consent_active_device_ignores_withdrawn_consent() -> None:
    db = SessionLocal()
    try:
        p = _new_patient(db)
        _seed_consent(db, patient_id=p.id, consent_type="device_sync", status="withdrawn")
        assert _consent_active_device(p.id, db) is False
    finally:
        db.close()


def test_assert_device_consent_active_raises_when_missing() -> None:
    db = SessionLocal()
    try:
        p = _new_patient(db)
        with pytest.raises(ApiServiceError) as exc_info:
            _assert_device_consent_active(p.id, db)
        assert exc_info.value.status_code == 403
        assert exc_info.value.code == "consent_required"
    finally:
        db.close()


def test_assert_device_consent_active_no_raise_when_active() -> None:
    db = SessionLocal()
    try:
        p = _new_patient(db)
        _seed_consent(db, patient_id=p.id, consent_type="device_sync", status="active")
        _assert_device_consent_active(p.id, db)  # must not raise
    finally:
        db.close()
