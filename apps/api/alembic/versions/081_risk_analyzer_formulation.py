"""Patient Risk Analyzer — formulation & safety plan persistence.

Revision ID: 081_risk_analyzer_formulation
Revises: 080_audio_analyses_table
Create Date: 2026-05-02
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "081_risk_analyzer_formulation"
down_revision = "080_audio_analyses_table"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "patient_risk_formulation",
        sa.Column("patient_id", sa.String(36), sa.ForeignKey("patients.id", ondelete="CASCADE"), primary_key=True, nullable=False),
        sa.Column("formulation_json", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("safety_plan_json", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("updated_by", sa.String(64), nullable=True),
    )
    op.create_table(
        "risk_analyzer_audit",
        sa.Column("id", sa.String(36), primary_key=True, nullable=False),
        sa.Column("patient_id", sa.String(36), nullable=False, index=True),
        sa.Column("event_type", sa.String(40), nullable=False),
        sa.Column("actor_id", sa.String(64), nullable=True),
        sa.Column("payload_summary", sa.Text(), nullable=True),
        sa.Column("payload_json", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_risk_analyzer_audit_patient_created", "risk_analyzer_audit", ["patient_id", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_risk_analyzer_audit_patient_created", table_name="risk_analyzer_audit")
    op.drop_table("risk_analyzer_audit")
    op.drop_table("patient_risk_formulation")
