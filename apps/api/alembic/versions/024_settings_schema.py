"""Settings API foundation — clinics, team invites, 2FA, sessions, preferences, exports.

Revision ID: 024_settings_schema
Revises: 023_recurrence_group
Create Date: 2026-04-17

Adds tables:
  - clinics                  : multi-user org (profile, logo, specialties, working hours)
  - clinic_team_invites      : pending role-scoped invitations (48h TTL, single-use)
  - user_2fa_secrets         : Fernet-encrypted TOTP secret + backup codes
  - user_sessions            : stateful refresh-token session rows
  - user_preferences         : per-user UI + notification + clinical workflow prefs
  - clinic_defaults          : per-clinic clinical defaults (protocol, consent, AE)
  - data_exports             : async GDPR Article 20 export jobs

Extends users:
  - credentials, license_number, avatar_url
  - pending_email, pending_email_token, pending_email_expires_at
  - FK constraint users.clinic_id -> clinics.id ON DELETE SET NULL
    (added via batch_alter_table for SQLite compatibility)
"""
from alembic import op
import sqlalchemy as sa


revision = "024_settings_schema"
down_revision = "023_recurrence_group"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── New tables ──────────────────────────────────────────────────────────
    op.create_table(
        "clinics",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("address", sa.Text(), nullable=True),
        sa.Column("phone", sa.String(32), nullable=True),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("website", sa.String(512), nullable=True),
        sa.Column("timezone", sa.String(64), nullable=False, server_default="UTC"),
        sa.Column("logo_url", sa.String(512), nullable=True),
        sa.Column("specialties", sa.Text(), nullable=True),
        sa.Column("working_hours", sa.Text(), nullable=True),
        sa.Column("retention_days", sa.Integer(), nullable=False, server_default="2555"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )

    op.create_table(
        "clinic_team_invites",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("clinic_id", sa.String(36), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("role", sa.String(32), nullable=False),
        sa.Column("token", sa.String(64), nullable=False, unique=True),
        sa.Column("invited_by", sa.String(36), nullable=True),
        sa.Column("invited_at", sa.DateTime(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("accepted_at", sa.DateTime(), nullable=True),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(
            ["clinic_id"], ["clinics.id"],
            name="fk_clinic_team_invites_clinic_id",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["invited_by"], ["users.id"],
            name="fk_clinic_team_invites_invited_by",
            ondelete="SET NULL",
        ),
    )
    op.create_index(
        "ix_clinic_team_invites_clinic_id",
        "clinic_team_invites", ["clinic_id"],
    )
    op.create_index(
        "ix_clinic_team_invites_email",
        "clinic_team_invites", ["email"],
    )

    op.create_table(
        "user_2fa_secrets",
        sa.Column("user_id", sa.String(36), primary_key=True),
        sa.Column("secret_encrypted", sa.String(255), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column("backup_codes_encrypted", sa.Text(), nullable=True),
        sa.Column("enabled_at", sa.DateTime(), nullable=True),
        sa.Column("last_used_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"],
            name="fk_user_2fa_secrets_user_id",
            ondelete="CASCADE",
        ),
    )

    op.create_table(
        "user_sessions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), nullable=False),
        sa.Column("refresh_token_hash", sa.String(128), nullable=False, unique=True),
        sa.Column("user_agent", sa.String(512), nullable=True),
        sa.Column("ip_address", sa.String(64), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(), nullable=False),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"],
            name="fk_user_sessions_user_id",
            ondelete="CASCADE",
        ),
    )
    op.create_index("ix_user_sessions_user_id", "user_sessions", ["user_id"])

    op.create_table(
        "user_preferences",
        sa.Column("user_id", sa.String(36), primary_key=True),
        sa.Column("notification_prefs", sa.Text(), nullable=False, server_default="{}"),
        sa.Column(
            "quiet_hours", sa.Text(), nullable=False,
            server_default='{"enabled":false,"from":"22:00","to":"07:00"}',
        ),
        sa.Column("digest_freq", sa.String(16), nullable=False, server_default="daily"),
        sa.Column("reminder_timing", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("language", sa.String(8), nullable=False, server_default="en"),
        sa.Column("date_format", sa.String(8), nullable=False, server_default="ISO"),
        sa.Column("time_format", sa.String(4), nullable=False, server_default="24h"),
        sa.Column("first_day", sa.String(8), nullable=False, server_default="monday"),
        sa.Column("units", sa.String(16), nullable=False, server_default="metric"),
        sa.Column("number_format", sa.String(16), nullable=False, server_default="US"),
        sa.Column("session_default_duration_min", sa.Integer(), nullable=False, server_default="45"),
        sa.Column("auto_logout_min", sa.Integer(), nullable=False, server_default="30"),
        sa.Column("analytics_opt_in", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        sa.Column("error_reports_opt_in", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"],
            name="fk_user_preferences_user_id",
            ondelete="CASCADE",
        ),
    )

    op.create_table(
        "clinic_defaults",
        sa.Column("clinic_id", sa.String(36), primary_key=True),
        sa.Column("default_protocol_id", sa.String(64), nullable=True),
        sa.Column("default_session_duration_min", sa.Integer(), nullable=False, server_default="45"),
        sa.Column("default_followup_weeks", sa.Integer(), nullable=False, server_default="4"),
        sa.Column("default_course_length", sa.Integer(), nullable=False, server_default="20"),
        sa.Column("default_consent_template_id", sa.String(64), nullable=True),
        sa.Column("custom_consent_text", sa.Text(), nullable=True),
        sa.Column("default_disclaimer", sa.Text(), nullable=True),
        sa.Column("default_assessments", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("ae_protocol", sa.String(32), nullable=False, server_default="auto-notify"),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["clinic_id"], ["clinics.id"],
            name="fk_clinic_defaults_clinic_id",
            ondelete="CASCADE",
        ),
    )

    op.create_table(
        "data_exports",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), nullable=False),
        sa.Column("clinic_id", sa.String(36), nullable=True),
        sa.Column("status", sa.String(16), nullable=False, server_default="queued"),
        sa.Column("file_url", sa.String(512), nullable=True),
        sa.Column("file_bytes", sa.Integer(), nullable=True),
        sa.Column("requested_at", sa.DateTime(), nullable=False),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"],
            name="fk_data_exports_user_id",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["clinic_id"], ["clinics.id"],
            name="fk_data_exports_clinic_id",
            ondelete="SET NULL",
        ),
    )
    op.create_index("ix_data_exports_user_id", "data_exports", ["user_id"])
    op.create_index("ix_data_exports_clinic_id", "data_exports", ["clinic_id"])

    # ── Extend users: new profile columns + FK on clinic_id ─────────────────
    # SQLite cannot ALTER ADD CONSTRAINT; use batch mode which rebuilds the table.
    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(sa.Column("credentials", sa.String(128), nullable=True))
        batch_op.add_column(sa.Column("license_number", sa.String(64), nullable=True))
        batch_op.add_column(sa.Column("avatar_url", sa.String(512), nullable=True))
        batch_op.add_column(sa.Column("pending_email", sa.String(255), nullable=True))
        batch_op.add_column(sa.Column("pending_email_token", sa.String(64), nullable=True))
        batch_op.add_column(sa.Column("pending_email_expires_at", sa.DateTime(), nullable=True))
        batch_op.create_foreign_key(
            "fk_users_clinic_id",
            "clinics",
            ["clinic_id"],
            ["id"],
            ondelete="SET NULL",
        )


def downgrade() -> None:
    # Drop FK + added user columns first (batch rebuild).
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_constraint("fk_users_clinic_id", type_="foreignkey")
        batch_op.drop_column("pending_email_expires_at")
        batch_op.drop_column("pending_email_token")
        batch_op.drop_column("pending_email")
        batch_op.drop_column("avatar_url")
        batch_op.drop_column("license_number")
        batch_op.drop_column("credentials")

    op.drop_index("ix_data_exports_clinic_id", table_name="data_exports")
    op.drop_index("ix_data_exports_user_id", table_name="data_exports")
    op.drop_table("data_exports")

    op.drop_table("clinic_defaults")
    op.drop_table("user_preferences")

    op.drop_index("ix_user_sessions_user_id", table_name="user_sessions")
    op.drop_table("user_sessions")

    op.drop_table("user_2fa_secrets")

    op.drop_index("ix_clinic_team_invites_email", table_name="clinic_team_invites")
    op.drop_index("ix_clinic_team_invites_clinic_id", table_name="clinic_team_invites")
    op.drop_table("clinic_team_invites")

    op.drop_table("clinics")
