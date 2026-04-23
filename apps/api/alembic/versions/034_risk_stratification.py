"""Risk stratification — per-patient traffic-light safety levels.

Revision ID: 034_risk_stratification
Revises: 033_virtual_care
Create Date: 2026-04-23
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "034_risk_stratification"
down_revision = "033_virtual_care"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "risk_stratification_results",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("patient_id", sa.String(36), sa.ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("clinician_id", sa.String(64), nullable=True),
        sa.Column("category", sa.String(40), nullable=False),
        sa.Column("level", sa.String(10), nullable=False, server_default="green"),
        sa.Column("confidence", sa.String(20), nullable=False, server_default="no_data"),
        sa.Column("rationale", sa.Text(), nullable=True),
        sa.Column("data_sources_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("evidence_refs_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("override_level", sa.String(10), nullable=True),
        sa.Column("override_by", sa.String(64), nullable=True),
        sa.Column("override_at", sa.DateTime(), nullable=True),
        sa.Column("override_reason", sa.Text(), nullable=True),
        sa.Column("computed_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint("patient_id", "category", name="uq_risk_patient_category"),
        sa.CheckConstraint("level IN ('green','amber','red')", name="ck_risk_level"),
        sa.CheckConstraint("confidence IN ('high','medium','low','no_data')", name="ck_risk_confidence"),
    )

    op.create_table(
        "risk_stratification_audit",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("patient_id", sa.String(36), nullable=False, index=True),
        sa.Column("category", sa.String(40), nullable=False),
        sa.Column("previous_level", sa.String(10), nullable=True),
        sa.Column("new_level", sa.String(10), nullable=False),
        sa.Column("trigger", sa.String(60), nullable=False),
        sa.Column("actor_id", sa.String(64), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )


def downgrade() -> None:
    op.drop_table("risk_stratification_audit")
    op.drop_table("risk_stratification_results")
