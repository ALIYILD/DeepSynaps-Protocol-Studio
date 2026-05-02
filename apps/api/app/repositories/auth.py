"""Repository functions for auth-related persistence rows.

Architect Rec #8: routers must not import directly from
``app.persistence.models``. This module wraps the SQLAlchemy queries used
by ``app.routers.auth_router`` so the router stays free of model imports.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..persistence.models import (
    PasswordResetToken,
    Patient,
    PatientInvite,
    User,
    User2FASecret,
    UserSession,
)


# ── PasswordResetToken ───────────────────────────────────────────────────────


def create_password_reset_token(
    session: Session,
    *,
    user_id: str,
    token_hash: str,
    expires_at: datetime,
) -> PasswordResetToken:
    row = PasswordResetToken(
        user_id=user_id,
        token_hash=token_hash,
        expires_at=expires_at,
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


def get_password_reset_token_by_hash(
    session: Session, token_hash: str
) -> Optional[PasswordResetToken]:
    return session.scalar(
        select(PasswordResetToken).where(PasswordResetToken.token_hash == token_hash)
    )


# ── PatientInvite / Patient ──────────────────────────────────────────────────


def get_patient_invite_by_code(
    session: Session, invite_code: str
) -> Optional[PatientInvite]:
    return session.scalar(
        select(PatientInvite).where(PatientInvite.invite_code == invite_code)
    )


def get_patient_by_email(session: Session, email: str) -> Optional[Patient]:
    return session.query(Patient).filter(Patient.email == email).first()


# ── User2FASecret ────────────────────────────────────────────────────────────


def get_user_2fa_secret(session: Session, user_id: str) -> Optional[User2FASecret]:
    return session.scalar(
        select(User2FASecret).where(User2FASecret.user_id == user_id)
    )


def upsert_user_2fa_secret(
    session: Session,
    *,
    user_id: str,
    secret_encrypted: str,
    backup_codes_encrypted: str,
) -> User2FASecret:
    """Create or reset (re-enroll) a User2FASecret row.

    Re-enrollment overwrites the secret + backup blob and forces
    ``enabled=False`` until the caller proves possession via /verify.
    Caller is responsible for committing.
    """
    row = get_user_2fa_secret(session, user_id)
    if row is None:
        row = User2FASecret(
            user_id=user_id,
            secret_encrypted=secret_encrypted,
            enabled=False,
            backup_codes_encrypted=backup_codes_encrypted,
        )
        session.add(row)
    else:
        row.secret_encrypted = secret_encrypted
        row.backup_codes_encrypted = backup_codes_encrypted
        row.enabled = False
        row.enabled_at = None
    return row


# ── UserSession ──────────────────────────────────────────────────────────────


def create_user_session(
    session: Session,
    *,
    user_id: str,
    refresh_token_hash: str,
    user_agent: str,
    ip_address: str,
) -> UserSession:
    row = UserSession(
        user_id=user_id,
        refresh_token_hash=refresh_token_hash,
        user_agent=user_agent,
        ip_address=ip_address,
    )
    session.add(row)
    return row


def get_user_session_by_refresh_hash(
    session: Session, refresh_token_hash: str
) -> Optional[UserSession]:
    return session.scalar(
        select(UserSession).where(UserSession.refresh_token_hash == refresh_token_hash)
    )


def get_user_session_for_user_by_refresh_hash(
    session: Session, *, user_id: str, refresh_token_hash: str
) -> Optional[UserSession]:
    return session.scalar(
        select(UserSession).where(
            UserSession.refresh_token_hash == refresh_token_hash,
            UserSession.user_id == user_id,
        )
    )


def get_user_session_by_id(
    session: Session, *, session_id: str, user_id: str
) -> Optional[UserSession]:
    return session.scalar(
        select(UserSession).where(
            UserSession.id == session_id, UserSession.user_id == user_id
        )
    )


def list_active_user_sessions(session: Session, user_id: str) -> list[UserSession]:
    return list(
        session.scalars(
            select(UserSession)
            .where(UserSession.user_id == user_id, UserSession.revoked_at.is_(None))
            .order_by(UserSession.last_seen_at.desc())
        ).all()
    )
