"""Resolver Coaching Self-Review Digest Preference (DCRO3, 2026-05-02).

Closes section I rec from the Resolver Coaching Inbox (DCRO2, #397):

* DCRO1 (#393) measures resolver calibration accuracy.
* DCRO2 (#397) gives each resolver a private inbox + self-review-note
  flow so they self-correct without admin intervention.
* THIS migration adds the durable preference row a weekly-digest worker
  reads to decide whether to nudge a resolver via their preferred
  on-call channel (Slack DM / Twilio SMS / SendGrid email / PagerDuty)
  when they have un-self-reviewed wrong false_positive calls. Closes
  the loop end-to-end: DCRO1 measures → DCRO2 self-corrects → DCRO3
  nudges.

This migration adds ONE table:

* ``resolver_coaching_digest_preferences`` — one row per (resolver,
  clinic). Carries ``opted_in`` flag (default False — honest opt-in),
  ``preferred_channel`` (None = use the clinic EscalationPolicy
  dispatch chain), and ``last_dispatched_at`` so the worker can
  enforce a per-resolver weekly cooldown without scanning the audit
  trail.

Why additive (no destructive changes)
-------------------------------------
The table is net-new; nothing is renamed or dropped. The Resolver
Coaching Inbox (#397) keeps working unchanged when no preference row
exists; a missing row is treated as ``opted_in=False`` so the worker
defaults to silence until the resolver opts in.

Cross-dialect safe — every column is a plain integer / nullable string /
boolean / timestamp. SQLite-friendly. Soft FK to ``users.id`` /
``clinics.id`` so deleting a user/clinic does not cascade-clear the
historic preference row (audit hygiene).

Revision ID: 080_resolver_coaching_digest_preference
Revises: 079_caregiver_preferred_channel
Create Date: 2026-05-02
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


# ── Alembic identifiers ──────────────────────────────────────────────────────

revision = "080_resolver_coaching_digest_preference"
down_revision = "079_caregiver_preferred_channel"
branch_labels = None
depends_on = None


TABLE_NAME = "resolver_coaching_digest_preferences"


def _has_table(bind: sa.engine.Engine, name: str) -> bool:
    insp = sa.inspect(bind)
    try:
        return name in set(insp.get_table_names())
    except Exception:
        return False


def upgrade() -> None:
    bind = op.get_bind()

    # Defensive: only create when the table is not already present.
    # Concurrent sessions may have run this revision ahead of us; this
    # guard keeps the migration idempotent so re-runs after
    # ``alembic upgrade head`` are safe.
    if _has_table(bind, TABLE_NAME):
        return

    op.create_table(
        TABLE_NAME,
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column(
            "resolver_user_id",
            sa.String(64),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "clinic_id",
            sa.String(64),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "opted_in",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column(
            "preferred_channel",
            sa.String(32),
            nullable=True,
        ),
        sa.Column(
            "last_dispatched_at",
            sa.String(64),
            nullable=True,
        ),
        sa.Column("created_at", sa.String(64), nullable=False),
        sa.Column("updated_at", sa.String(64), nullable=False),
        sa.UniqueConstraint(
            "resolver_user_id",
            "clinic_id",
            name="uq_resolver_coaching_digest_pref_resolver_clinic",
        ),
    )


def downgrade() -> None:
    bind = op.get_bind()
    if not _has_table(bind, TABLE_NAME):
        return
    try:
        op.drop_table(TABLE_NAME)
    except Exception:
        pass
