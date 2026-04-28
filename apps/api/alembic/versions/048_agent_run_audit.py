"""Agent Marketplace — per-run audit trail table.

Creates ``agent_run_audit`` so the admin UI can answer "what did the
Reception agent reply to clinician X on Tuesday at 14:32?" and so the
back-end can build ratelimit / abuse detection on top of a real table.

Design contract
---------------
* Additive only — one new table, nothing else touched.
* SQLite-safe — uses ``op.create_table`` (no raw SQL), all column types
  are stdlib SQLAlchemy types.
* Indexes on the four query dimensions: ``created_at`` (time bucket),
  ``actor_id`` (per-user history), ``clinic_id`` (per-tenant filter),
  ``agent_id`` (per-agent filter).

Revision ID: 048_agent_run_audit
Revises: 047_pipeline_failure_reason
Create Date: 2026-04-28
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


# ── Alembic identifiers ──────────────────────────────────────────────────────

revision = "048_agent_run_audit"
down_revision = "047_pipeline_failure_reason"
branch_labels = None
depends_on = None


def _has_table(bind: sa.engine.Engine, table_name: str) -> bool:
    insp = sa.inspect(bind)
    return table_name in insp.get_table_names()


# ── Upgrade ──────────────────────────────────────────────────────────────────

def upgrade() -> None:
    bind = op.get_bind()
    if _has_table(bind, "agent_run_audit"):
        return

    op.create_table(
        "agent_run_audit",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, index=True),
        # SET NULL keeps the audit row alive after a user is deleted —
        # critical for incident review of departed staff accounts.
        sa.Column(
            "actor_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
            index=True,
        ),
        sa.Column("clinic_id", sa.String(64), nullable=True, index=True),
        sa.Column("agent_id", sa.String(64), nullable=False, index=True),
        sa.Column("message_preview", sa.String(220), nullable=False, server_default=""),
        sa.Column("reply_preview", sa.String(520), nullable=False, server_default=""),
        sa.Column("context_used_json", sa.Text(), nullable=True),
        sa.Column("latency_ms", sa.Integer(), nullable=True),
        sa.Column("ok", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        sa.Column("error_code", sa.String(64), nullable=True),
    )

    # The Column(..., index=True) calls above already register an index
    # for SQLAlchemy's create_all, but Alembic only emits the index when
    # `op.create_index` is called explicitly. Doing so here keeps Postgres
    # deployments aligned with what reset_database() / Base.metadata builds
    # under SQLite.
    op.create_index(
        "ix_agent_run_audit_created_at", "agent_run_audit", ["created_at"]
    )
    op.create_index(
        "ix_agent_run_audit_actor_id", "agent_run_audit", ["actor_id"]
    )
    op.create_index(
        "ix_agent_run_audit_clinic_id", "agent_run_audit", ["clinic_id"]
    )
    op.create_index(
        "ix_agent_run_audit_agent_id", "agent_run_audit", ["agent_id"]
    )


# ── Downgrade ────────────────────────────────────────────────────────────────

def downgrade() -> None:
    bind = op.get_bind()
    if not _has_table(bind, "agent_run_audit"):
        return
    for ix in (
        "ix_agent_run_audit_agent_id",
        "ix_agent_run_audit_clinic_id",
        "ix_agent_run_audit_actor_id",
        "ix_agent_run_audit_created_at",
    ):
        try:
            op.drop_index(ix, table_name="agent_run_audit")
        except Exception:
            pass
    op.drop_table("agent_run_audit")
