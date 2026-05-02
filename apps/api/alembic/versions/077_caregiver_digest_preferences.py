"""Caregiver Email Digest Preferences (2026-05-01) — caregiver_digest_preferences.

Closes the bidirectional notification loop opened by Caregiver Notification
Hub #379. The Hub gives caregivers an in-app feed + unread badge; this
migration adds the durable preference row a daily-digest worker reads to
decide whether to dispatch an email/Slack/SMS roll-up of unread
notifications.

This migration adds ONE table:

* ``caregiver_digest_preferences`` — one row per caregiver user. Carries
  ``enabled`` flag, ``frequency`` (``daily`` / ``weekly``),
  ``time_of_day`` (HH:MM, 24h), and ``last_sent_at`` so the worker can
  enforce a per-caregiver cooldown.

Why additive (no destructive changes)
-------------------------------------
The table is net-new; nothing is renamed or dropped. The Caregiver
Notification Hub (#379) keeps working unchanged when no preference row
exists; a missing row is treated as ``enabled=False`` so the worker
defaults to silence until the caregiver opts in.

Cross-dialect safe — every column is a plain string PK / nullable text /
boolean. Soft FK to ``users.id`` so deleting a user does not clear the
historic preference row. SQLite-friendly.

Revision ID: 077_caregiver_digest_preferences
Revises: 076_caregiver_consent_grants
Create Date: 2026-05-01
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


# ── Alembic identifiers ──────────────────────────────────────────────────────

revision = "077_caregiver_digest_preferences"
down_revision = "076_caregiver_consent_grants"
branch_labels = None
depends_on = None


def _has_table(bind: sa.engine.Engine, name: str) -> bool:
    insp = sa.inspect(bind)
    try:
        return name in set(insp.get_table_names())
    except Exception:
        return False


def upgrade() -> None:
    bind = op.get_bind()

    if not _has_table(bind, "caregiver_digest_preferences"):
        op.create_table(
            "caregiver_digest_preferences",
            sa.Column("id", sa.String(64), primary_key=True),
            sa.Column("caregiver_user_id", sa.String(64), nullable=False, index=True, unique=True),
            sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("0")),
            sa.Column("frequency", sa.String(16), nullable=False, server_default="daily"),
            sa.Column("time_of_day", sa.String(8), nullable=False, server_default="08:00"),
            sa.Column("last_sent_at", sa.String(64), nullable=True),
            sa.Column("created_at", sa.String(64), nullable=False),
            sa.Column("updated_at", sa.String(64), nullable=False),
        )


def downgrade() -> None:
    bind = op.get_bind()
    if _has_table(bind, "caregiver_digest_preferences"):
        try:
            op.drop_table("caregiver_digest_preferences")
        except Exception:
            pass
