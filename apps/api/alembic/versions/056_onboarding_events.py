"""Phase 12 — onboarding wizard funnel telemetry table.

Creates ``onboarding_events`` so the four-step Phase 10 wizard can record
each step transition (started, package_selected, stripe_initiated, etc.)
and the ``/api/v1/onboarding/funnel`` endpoint can aggregate started →
completed conversion. See :class:`app.persistence.models.OnboardingEvent`
for the full design contract.

Design contract
---------------
* Additive only — single new table, four indexes, no edits to existing
  rows.
* Cross-dialect — uses stdlib SQLAlchemy types only (Integer, String,
  Text, DateTime) so the same migration runs against the SQLite test
  harness and the Postgres production engine.
* Defensive ``upgrade``/``downgrade`` — both are no-ops if the table
  is in the unexpected state, mirroring 050_agent_subscriptions.

Revision ID: 056_onboarding_events
Revises: 055_merge_054_heads
Create Date: 2026-04-28
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


# ── Alembic identifiers ──────────────────────────────────────────────────────

revision = "056_onboarding_events"
down_revision = "055_merge_054_heads"
branch_labels = None
depends_on = None


def _has_table(bind: sa.engine.Engine, table_name: str) -> bool:
    insp = sa.inspect(bind)
    return table_name in insp.get_table_names()


# ── Upgrade ──────────────────────────────────────────────────────────────────


def upgrade() -> None:
    bind = op.get_bind()
    if _has_table(bind, "onboarding_events"):
        return

    op.create_table(
        "onboarding_events",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "clinic_id",
            sa.String(64),
            sa.ForeignKey("clinics.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "actor_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("step", sa.String(64), nullable=False),
        sa.Column("payload_json", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )

    op.create_index(
        "ix_onboarding_events_clinic_id", "onboarding_events", ["clinic_id"]
    )
    op.create_index(
        "ix_onboarding_events_step", "onboarding_events", ["step"]
    )
    op.create_index(
        "ix_onboarding_events_created_at", "onboarding_events", ["created_at"]
    )


# ── Downgrade ────────────────────────────────────────────────────────────────


def downgrade() -> None:
    bind = op.get_bind()
    if not _has_table(bind, "onboarding_events"):
        return
    for ix in (
        "ix_onboarding_events_created_at",
        "ix_onboarding_events_step",
        "ix_onboarding_events_clinic_id",
    ):
        try:
            op.drop_index(ix, table_name="onboarding_events")
        except Exception:
            pass
    op.drop_table("onboarding_events")
