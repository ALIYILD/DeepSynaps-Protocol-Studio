"""Auto-split bucket — see app.persistence.models package docstring.

This file contains a domain-grouped subset of the SQLAlchemy ORM classes
formerly in ``apps/api/app/persistence/models.py``. The split is shim-only:
every class is re-exported from ``app.persistence.models`` so callers see
no behavioural change. All classes share the single ``Base`` from
``app.database`` (re-exported here via ``_base``) — verify with
``Patient.metadata is AuditEventRecord.metadata``.
"""
from __future__ import annotations

from ._base import (  # noqa: F401 — re-export surface for class definitions
    Base,
    BigInteger,
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    Mapped,
    Optional,
    String,
    Text,
    UniqueConstraint,
    datetime,
    event,
    mapped_column,
    sa_text,
    timezone,
    uuid,
    _HAS_PGVECTOR,
    _PgVector,
    _embedding_column,
    _embedding_column_1536,
)


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(50), default="guest")
    package_id: Mapped[str] = mapped_column(String(50), default="explorer")
    clinic_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    is_verified: Mapped[bool] = mapped_column(Boolean(), default=False)
    is_active: Mapped[bool] = mapped_column(Boolean(), default=True)
    # Settings API — profile extensions (migration 024_settings_schema)
    credentials: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    license_number: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    avatar_url: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    pending_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    pending_email_token: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    pending_email_expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

class TeamMember(Base):
    __tablename__ = "team_members"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    subscription_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    user_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    role: Mapped[str] = mapped_column(String(50), default="member")  # owner, admin, member
    invited_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))
    joined_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)

class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    token_hash: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(), nullable=False)
    used_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))


# ── Clinical Practice Models ────────────────────────────────────────────────────

class User2FASecret(Base):
    """TOTP secret (one row per user). Fernet-encrypted at rest.

    `enabled=False` until the user completes the verify step in /auth/2fa/verify.
    """
    __tablename__ = "user_2fa_secrets"

    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    secret_encrypted: Mapped[str] = mapped_column(String(255), nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean(), default=False)
    backup_codes_encrypted: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)  # JSON of hashed codes
    enabled_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    last_used_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)

class UserSession(Base):
    """Active refresh-token session (for 'log out other devices')."""
    __tablename__ = "user_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    refresh_token_hash: Mapped[str] = mapped_column(String(128), nullable=False, unique=True)
    user_agent: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    ip_address: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    revoked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)

class UserPreferences(Base):
    """Per-user UI + notification + clinical workflow preferences.

    Schema mirrors the design doc. Notification prefs / quiet hours /
    reminder timing are JSON-encoded Text columns (SQLite-compatible).
    """
    __tablename__ = "user_preferences"

    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    notification_prefs: Mapped[str] = mapped_column(Text(), nullable=False, default="{}")  # JSON matrix
    quiet_hours: Mapped[str] = mapped_column(Text(), nullable=False, default='{"enabled":false,"from":"22:00","to":"07:00"}')
    digest_freq: Mapped[str] = mapped_column(String(16), default="daily")  # daily/weekly/off
    reminder_timing: Mapped[str] = mapped_column(Text(), nullable=False, default="[]")  # JSON array
    language: Mapped[str] = mapped_column(String(8), default="en")
    date_format: Mapped[str] = mapped_column(String(8), default="ISO")  # ISO/US/EU
    time_format: Mapped[str] = mapped_column(String(4), default="24h")
    first_day: Mapped[str] = mapped_column(String(8), default="monday")
    units: Mapped[str] = mapped_column(String(16), default="metric")  # metric/imperial
    number_format: Mapped[str] = mapped_column(String(16), default="US")
    session_default_duration_min: Mapped[int] = mapped_column(Integer(), default=45)
    auto_logout_min: Mapped[int] = mapped_column(Integer(), default=30)  # 0 = never
    analytics_opt_in: Mapped[bool] = mapped_column(Boolean(), default=True)
    error_reports_opt_in: Mapped[bool] = mapped_column(Boolean(), default=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

class ClinicDefaults(Base):
    """Per-clinic clinical defaults (one row per clinic)."""
    __tablename__ = "clinic_defaults"

    clinic_id: Mapped[str] = mapped_column(String(36), ForeignKey("clinics.id", ondelete="CASCADE"), primary_key=True)
    default_protocol_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    default_session_duration_min: Mapped[int] = mapped_column(Integer(), default=45)
    default_followup_weeks: Mapped[int] = mapped_column(Integer(), default=4)
    default_course_length: Mapped[int] = mapped_column(Integer(), default=20)
    default_consent_template_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    custom_consent_text: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    default_disclaimer: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    default_assessments: Mapped[str] = mapped_column(Text(), nullable=False, default="[]")  # JSON array
    ae_protocol: Mapped[str] = mapped_column(String(32), default="auto-notify")
    updated_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

class UserContactMapping(Base):
    """Per-user contact mapping for the on-call delivery adapters.

    Replaces the ad-hoc ``ShiftRoster.contact_handle`` lookup with a
    durable per-user ``slack_user_id`` / ``pagerduty_user_id`` /
    ``twilio_phone`` row that survives across roster edits. The on-call
    delivery service prefers values here over ``contact_handle`` when
    they are present.

    One row per user. Soft FK to ``users.id`` so a deleted user's
    mapping row stays for audit history. ``clinic_id`` is denormalised
    so the policy editor can scope cross-clinic 404s without joining on
    every read.
    """

    __tablename__ = "user_contact_mappings"
    __table_args__ = (
        UniqueConstraint(
            "user_id",
            name="uq_user_contact_mappings_user",
        ),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    clinic_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    slack_user_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    pagerduty_user_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    twilio_phone: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    note: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    updated_by: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    created_at: Mapped[str] = mapped_column(String(64), nullable=False)
    updated_at: Mapped[str] = mapped_column(String(64), nullable=False)
