"""Repository-level tests for app.repositories.auth.

Pins CRUD behaviour for PasswordResetToken, PatientInvite, User2FASecret,
and UserSession tables against in-memory SQLite.
All tests rely on the isolated_database autouse fixture from conftest.py.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone


# ── Helpers ──────────────────────────────────────────────────────────────────

_USER_ID = "actor-clinician-demo"
_CLINIC = "clinic-demo-default"


def _db():
    from app.database import SessionLocal
    return SessionLocal()


def _future(days: int = 1) -> datetime:
    return datetime.now(timezone.utc) + timedelta(days=days)


# ── PasswordResetToken ────────────────────────────────────────────────────────


def test_create_and_get_password_reset_token():
    from app.repositories.auth import (
        create_password_reset_token,
        get_password_reset_token_by_hash,
    )

    db = _db()
    try:
        row = create_password_reset_token(
            db,
            user_id=_USER_ID,
            token_hash="hash-abc-001",
            expires_at=_future(),
        )
        assert row.user_id == _USER_ID
        assert row.token_hash == "hash-abc-001"

        fetched = get_password_reset_token_by_hash(db, "hash-abc-001")
        assert fetched is not None
        assert fetched.id == row.id
    finally:
        db.close()


def test_get_password_reset_token_missing_returns_none():
    from app.repositories.auth import get_password_reset_token_by_hash

    db = _db()
    try:
        result = get_password_reset_token_by_hash(db, "nonexistent-hash")
        assert result is None
    finally:
        db.close()


# ── PatientInvite ──────────────────────────────────────────────────────────────


def test_get_patient_invite_by_code():
    from app.persistence.models import PatientInvite
    from app.repositories.auth import get_patient_invite_by_code

    db = _db()
    try:
        invite = PatientInvite(
            invite_code="INVITE-XYZ-001",
            clinician_id=_USER_ID,
            clinic_id=_CLINIC,
            expires_at=_future(7),
        )
        db.add(invite)
        db.commit()

        fetched = get_patient_invite_by_code(db, "INVITE-XYZ-001")
        assert fetched is not None
        assert fetched.clinician_id == _USER_ID
    finally:
        db.close()


def test_get_patient_invite_missing_returns_none():
    from app.repositories.auth import get_patient_invite_by_code

    db = _db()
    try:
        result = get_patient_invite_by_code(db, "NO-SUCH-CODE")
        assert result is None
    finally:
        db.close()


# ── User2FASecret ─────────────────────────────────────────────────────────────


def test_upsert_user_2fa_secret_creates_row():
    from app.repositories.auth import get_user_2fa_secret, upsert_user_2fa_secret

    db = _db()
    try:
        row = upsert_user_2fa_secret(
            db,
            user_id=_USER_ID,
            secret_encrypted="enc-secret-v1",
            backup_codes_encrypted="enc-codes-v1",
        )
        db.commit()
        assert row.user_id == _USER_ID
        assert row.enabled is False

        fetched = get_user_2fa_secret(db, _USER_ID)
        assert fetched is not None
        assert fetched.secret_encrypted == "enc-secret-v1"
    finally:
        db.close()


def test_upsert_user_2fa_secret_updates_existing():
    from app.repositories.auth import get_user_2fa_secret, upsert_user_2fa_secret

    db = _db()
    try:
        upsert_user_2fa_secret(
            db,
            user_id=_USER_ID,
            secret_encrypted="enc-secret-v1",
            backup_codes_encrypted="enc-codes-v1",
        )
        db.commit()
        # Re-enrol
        upsert_user_2fa_secret(
            db,
            user_id=_USER_ID,
            secret_encrypted="enc-secret-v2",
            backup_codes_encrypted="enc-codes-v2",
        )
        db.commit()

        fetched = get_user_2fa_secret(db, _USER_ID)
        assert fetched.secret_encrypted == "enc-secret-v2"
        assert fetched.enabled is False  # must reset on re-enrol
    finally:
        db.close()


def test_get_user_2fa_secret_missing_returns_none():
    from app.repositories.auth import get_user_2fa_secret

    db = _db()
    try:
        result = get_user_2fa_secret(db, "user-nobody-here")
        assert result is None
    finally:
        db.close()


# ── UserSession ───────────────────────────────────────────────────────────────


def test_create_and_get_user_session_by_refresh_hash():
    from app.repositories.auth import (
        create_user_session,
        get_user_session_by_refresh_hash,
    )

    db = _db()
    try:
        row = create_user_session(
            db,
            user_id=_USER_ID,
            refresh_token_hash="refresh-hash-001",
            user_agent="TestAgent/1.0",
            ip_address="127.0.0.1",
        )
        db.commit()

        fetched = get_user_session_by_refresh_hash(db, "refresh-hash-001")
        assert fetched is not None
        assert fetched.user_id == _USER_ID
        assert fetched.revoked_at is None
    finally:
        db.close()


def test_list_active_user_sessions_excludes_revoked():
    from datetime import datetime, timezone as tz
    from app.repositories.auth import create_user_session, list_active_user_sessions

    db = _db()
    try:
        active_row = create_user_session(
            db,
            user_id=_USER_ID,
            refresh_token_hash="active-hash",
            user_agent="Browser",
            ip_address="10.0.0.1",
        )
        db.commit()

        revoked_row = create_user_session(
            db,
            user_id=_USER_ID,
            refresh_token_hash="revoked-hash",
            user_agent="OldBrowser",
            ip_address="10.0.0.2",
        )
        db.commit()
        revoked_row.revoked_at = datetime.now(tz.utc)
        db.commit()

        sessions = list_active_user_sessions(db, _USER_ID)
        ids = [s.refresh_token_hash for s in sessions]
        assert "active-hash" in ids
        assert "revoked-hash" not in ids
    finally:
        db.close()


def test_get_user_session_by_id():
    from app.repositories.auth import create_user_session, get_user_session_by_id

    db = _db()
    try:
        row = create_user_session(
            db,
            user_id=_USER_ID,
            refresh_token_hash="hash-by-id-test",
            user_agent="X",
            ip_address="1.2.3.4",
        )
        db.commit()

        fetched = get_user_session_by_id(db, session_id=row.id, user_id=_USER_ID)
        assert fetched is not None
        assert fetched.id == row.id

        # Wrong user_id returns None
        wrong = get_user_session_by_id(db, session_id=row.id, user_id="wrong-user")
        assert wrong is None
    finally:
        db.close()
