"""Per-clinician AI Agent hire roster.

Adds the ``agent_hires`` table — the per-clinician active-roster of AI
agents. This is a separate concern from ``agent_subscriptions`` (the
clinic-wide Stripe entitlement that says "this clinic has paid for
agent X"). A clinic may be entitled to ten agents; an individual
clinician hires only the ones they actually want on their daily roster.

Design contract
---------------
* Additive only — one new table, nothing else touched.
* SQLite-safe — ``op.create_table`` only, stdlib SQLAlchemy types.
* No FK on ``actor_id`` — demo actors don't have ``users`` rows; we still
  scope writes to the actor's authenticated identity in the router.
* FK on ``clinic_id`` so cascading a clinic delete drops the hires.
* Unique on ``(actor_id, agent_id)`` enforces idempotent hire.
* Indexes on ``clinic_id``, ``actor_id`` (the two query dimensions used
  by ``GET /api/v1/agents/hired`` and clinic-admin reports).

Revision ID: 097_agent_hires
Revises: 01ee9cbee8d6
Create Date: 2026-05-08
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "097_agent_hires"
down_revision = "01ee9cbee8d6"
branch_labels = None
depends_on = None


def _has_table(bind: sa.engine.Engine, table_name: str) -> bool:
    insp = sa.inspect(bind)
    return table_name in insp.get_table_names()


def upgrade() -> None:
    bind = op.get_bind()
    if _has_table(bind, "agent_hires"):
        return

    op.create_table(
        "agent_hires",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "clinic_id",
            sa.String(36),
            sa.ForeignKey("clinics.id", ondelete="CASCADE"),
            nullable=True,
            index=True,
        ),
        sa.Column("actor_id", sa.String(64), nullable=False, index=True),
        sa.Column("agent_id", sa.String(64), nullable=False, index=True),
        sa.Column(
            "status",
            sa.String(16),
            nullable=False,
            server_default="active",
        ),
        sa.Column("hired_at", sa.DateTime(), nullable=False),
        sa.Column("last_used_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint(
            "actor_id", "agent_id", name="uq_agent_hires_actor_agent"
        ),
    )

    op.create_index("ix_agent_hires_clinic_id", "agent_hires", ["clinic_id"])
    op.create_index("ix_agent_hires_actor_id", "agent_hires", ["actor_id"])
    op.create_index("ix_agent_hires_agent_id", "agent_hires", ["agent_id"])


def downgrade() -> None:
    bind = op.get_bind()
    if not _has_table(bind, "agent_hires"):
        return
    op.drop_index("ix_agent_hires_agent_id", table_name="agent_hires")
    op.drop_index("ix_agent_hires_actor_id", table_name="agent_hires")
    op.drop_index("ix_agent_hires_clinic_id", table_name="agent_hires")
    op.drop_table("agent_hires")
