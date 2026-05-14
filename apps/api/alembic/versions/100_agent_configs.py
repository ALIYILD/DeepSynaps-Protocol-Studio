"""Add agent_configs table for per-clinic agent configuration.

Adds the ``agent_configs`` table — clinic-scoped override of an agent's
runtime configuration (tools, parameters, preferences). One row per
(clinic_id, agent_id) pair.

Design contract
---------------
* Additive only — one new table, nothing else touched.
* SQLite-safe — ``op.create_table`` only, stdlib SQLAlchemy types.
* FK on ``clinic_id`` so cascading a clinic delete drops the configs.
* Unique on ``(clinic_id, agent_id)`` enforces one config per clinic/agent.

Restored 2026-05-14: this migration was previously applied to production
(prod ``alembic_version`` stamp == ``100_agent_configs``) but the file was
removed from the source tree in a concurrent merge cluster. Restoring it
verbatim so Alembic can resolve the stamp; the merge migration sibling
folds it back into the active head chain. Because the prod DB is already
stamped at this revision, ``upgrade()`` is a no-op there. On a fresh dev
DB it creates the table from scratch.

Revision ID: 100_agent_configs
Revises: b5278dd39fee
Create Date: 2026-05-12
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "100_agent_configs"
down_revision = "b5278dd39fee"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "agent_configs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "clinic_id",
            sa.String(36),
            sa.ForeignKey("clinics.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("agent_id", sa.String(64), nullable=False),
        sa.Column("config", sa.JSON, nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.UniqueConstraint(
            "clinic_id", "agent_id", name="uq_agent_configs_clinic_agent"
        ),
    )


def downgrade() -> None:
    op.drop_table("agent_configs")
