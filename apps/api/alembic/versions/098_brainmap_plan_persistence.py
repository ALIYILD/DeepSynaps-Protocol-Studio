"""Brain Map Planner persistence tables.

Adds two new tables:
- ``brain_map_plans``: Planning report data with nested artifact storage
- ``brain_map_plan_audit``: Audit trail for plan CRUD operations

Design contract:
- Additive only — two new tables, nothing else touched.
- SQLite-safe — ``op.create_table`` only, stdlib SQLAlchemy types + JSONB where supported.
- No FK on ``created_by`` — demo actors don't have ``users`` rows; authenticated via auth token in router.
- Full ``artifact`` stored as JSONB for retrospective audit + schema flexibility.
- Readiness and parameters stored as denormalized columns for fast queries.
- demo_stamp blocks production workflow (blocks persistent save, audit logs as demo).

Revision ID: 098_brainmap_plan_persistence
Revises: 097_agent_hires
Create Date: 2026-05-09
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "098_brainmap_plan_persistence"
down_revision = "097_agent_hires"
branch_labels = None
depends_on = None


def _has_table(bind: sa.engine.Engine, table_name: str) -> bool:
    insp = sa.inspect(bind)
    return table_name in insp.get_table_names()


def upgrade() -> None:
    bind = op.get_bind()
    
    # Create brain_map_plans table
    if not _has_table(bind, "brain_map_plans"):
        op.create_table(
            "brain_map_plans",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("patient_id", sa.String(255), nullable=True, index=True),
            sa.Column("created_by", sa.String(64), nullable=False, index=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
            sa.Column("status", sa.String(50), nullable=False, default="draft", index=True),
            sa.Column("region", sa.String(100), nullable=True),
            sa.Column("target_anchor", sa.String(10), nullable=True),
            sa.Column("protocol_id", sa.String(255), nullable=True),
            sa.Column("protocol_name", sa.String(255), nullable=True),
            sa.Column("intensity_ma", sa.Float(), nullable=True),
            sa.Column("frequency_hz", sa.Float(), nullable=True),
            sa.Column("session_duration_min", sa.Integer(), nullable=True),
            sa.Column("num_sessions", sa.Integer(), nullable=True),
            sa.Column("qeeg_analysis_id", sa.String(255), nullable=True),
            sa.Column("analyzer_fit", sa.JSON(), nullable=True),
            sa.Column("demo_stamp", sa.Boolean(), nullable=False, default=False),
            sa.Column("full_artifact", sa.JSON(), nullable=False),
            sa.Column("notes", sa.Text(), nullable=True),
        )
    
    # Create brain_map_plan_audit table
    if not _has_table(bind, "brain_map_plan_audit"):
        op.create_table(
            "brain_map_plan_audit",
            sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
            sa.Column("plan_id", sa.String(36), sa.ForeignKey("brain_map_plans.id"), nullable=False),
            sa.Column("actor_id", sa.String(64), nullable=False),
            sa.Column("action", sa.String(50), nullable=False),
            sa.Column("timestamp", sa.DateTime(), nullable=False, default=sa.func.now()),
            sa.Column("metadata", sa.JSON(), nullable=True),
            sa.Index("ix_brain_map_plan_audit_plan_id_timestamp", "plan_id", "timestamp"),
        )


def downgrade() -> None:
    bind = op.get_bind()
    
    # Drop audit table first (has FK to plans)
    if _has_table(bind, "brain_map_plan_audit"):
        op.drop_table("brain_map_plan_audit")
    
    # Drop plans table
    if _has_table(bind, "brain_map_plans"):
        op.drop_table("brain_map_plans")
