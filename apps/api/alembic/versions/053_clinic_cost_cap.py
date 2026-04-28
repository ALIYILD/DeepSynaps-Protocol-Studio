"""Phase 9 — per-clinic monthly cost cap.

Phase 8 populated ``agent_run_audit.cost_pence`` with real numbers; this
migration adds the budget guardrail.

Design contract
---------------
* One row per clinic — unique index on ``clinic_id``.
* ``cap_pence == 0`` is the "disabled" sentinel (allow all). The runner
  returns early without invoking the LLM when the month-to-date spend
  meets or exceeds a non-zero ``cap_pence``.
* ``updated_by_id`` -> ``users.id`` ON DELETE SET NULL preserves the cap
  row when a user account is removed — the audit attribution is
  best-effort, the guardrail itself is not.
* SQLite-safe: ``op.create_table`` + ``op.create_index``, no raw SQL.

Revision ID: 053_clinic_cost_cap
Revises: 052_patient_agent_activation
Create Date: 2026-04-28
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


# ── Alembic identifiers ──────────────────────────────────────────────────────

revision = "053_clinic_cost_cap"
down_revision = "052_patient_agent_activation"
branch_labels = None
depends_on = None


# ── Helpers ──────────────────────────────────────────────────────────────────


def _has_table(bind: sa.engine.Engine, table_name: str) -> bool:
    insp = sa.inspect(bind)
    return table_name in insp.get_table_names()


def _has_index(bind: sa.engine.Engine, table_name: str, index_name: str) -> bool:
    insp = sa.inspect(bind)
    if table_name not in insp.get_table_names():
        return False
    return any(ix["name"] == index_name for ix in insp.get_indexes(table_name))


# ── Upgrade ──────────────────────────────────────────────────────────────────


def upgrade() -> None:
    bind = op.get_bind()

    if not _has_table(bind, "clinic_monthly_cost_cap"):
        op.create_table(
            "clinic_monthly_cost_cap",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column(
                "clinic_id",
                sa.String(36),
                sa.ForeignKey("clinics.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("cap_pence", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.Column(
                "updated_by_id",
                sa.String(36),
                sa.ForeignKey("users.id", ondelete="SET NULL"),
                nullable=True,
            ),
        )

    if not _has_index(
        bind, "clinic_monthly_cost_cap", "ix_clinic_monthly_cost_cap_clinic_id"
    ):
        op.create_index(
            "ix_clinic_monthly_cost_cap_clinic_id",
            "clinic_monthly_cost_cap",
            ["clinic_id"],
            unique=True,
        )


# ── Downgrade ────────────────────────────────────────────────────────────────


def downgrade() -> None:
    bind = op.get_bind()
    if not _has_table(bind, "clinic_monthly_cost_cap"):
        return
    try:
        op.drop_index(
            "ix_clinic_monthly_cost_cap_clinic_id",
            table_name="clinic_monthly_cost_cap",
        )
    except Exception:  # pragma: no cover — defensive
        pass
    op.drop_table("clinic_monthly_cost_cap")
