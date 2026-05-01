"""Onboarding wizard launch-audit (2026-05-01) — server-side state table.

Adds ``onboarding_state`` so the Phase 10 / Phase 12 wizard can resume
across browsers / devices instead of relying on localStorage alone. One
row per actor (``actor_id`` is the primary key) carrying the current
step, completion timestamps, the `is_demo` flag (sticky once a user
elects to seed sample data or skip), and a reason for `wizard_abandoned`.

Design contract
---------------
* Additive only — single new table, no edits to existing rows.
* Cross-dialect — stdlib SQLAlchemy types only so this runs against the
  SQLite test harness and Postgres production engine identically.
* Defensive — ``upgrade`` / ``downgrade`` both no-op when the table is in
  the unexpected state, mirroring 056_onboarding_events.

Revision ID: 067_onboarding_state
Revises: 066_clinical_trials
Create Date: 2026-05-01
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


# ── Alembic identifiers ──────────────────────────────────────────────────────

revision = "067_onboarding_state"
down_revision = "066_clinical_trials"
branch_labels = None
depends_on = None


def _has_table(bind: sa.engine.Engine, table_name: str) -> bool:
    insp = sa.inspect(bind)
    return table_name in insp.get_table_names()


# ── Upgrade ──────────────────────────────────────────────────────────────────


def upgrade() -> None:
    bind = op.get_bind()
    if _has_table(bind, "onboarding_state"):
        return

    op.create_table(
        "onboarding_state",
        sa.Column("actor_id", sa.String(64), primary_key=True),
        sa.Column(
            "clinic_id",
            sa.String(64),
            sa.ForeignKey("clinics.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("current_step", sa.String(64), nullable=False, server_default="welcome"),
        sa.Column("is_demo", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("abandoned_at", sa.DateTime(), nullable=True),
        sa.Column("abandon_reason", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )

    op.create_index(
        "ix_onboarding_state_clinic_id", "onboarding_state", ["clinic_id"]
    )


# ── Downgrade ────────────────────────────────────────────────────────────────


def downgrade() -> None:
    bind = op.get_bind()
    if not _has_table(bind, "onboarding_state"):
        return
    try:
        op.drop_index("ix_onboarding_state_clinic_id", table_name="onboarding_state")
    except Exception:
        pass
    op.drop_table("onboarding_state")
