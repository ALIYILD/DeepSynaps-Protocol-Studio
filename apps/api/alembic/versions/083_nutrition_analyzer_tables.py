"""Nutrition analyzer MVP tables (diet log, supplements, audit).

Revision ID: 083_nutrition_analyzer_tables
Revises: 082_irb_amendment_workflow
Create Date: 2026-05-02
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "083_nutrition_analyzer_tables"
down_revision = "082_irb_amendment_workflow"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "patient_nutrition_diet_logs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("patient_id", sa.String(36), nullable=False),
        sa.Column("clinician_id", sa.String(64), nullable=False),
        sa.Column("log_day", sa.String(20), nullable=False),
        sa.Column("calories_kcal", sa.Float(), nullable=True),
        sa.Column("protein_g", sa.Float(), nullable=True),
        sa.Column("carbs_g", sa.Float(), nullable=True),
        sa.Column("fat_g", sa.Float(), nullable=True),
        sa.Column("sodium_mg", sa.Float(), nullable=True),
        sa.Column("fiber_g", sa.Float(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index(
        "ix_patient_nutrition_diet_logs_patient_id", "patient_nutrition_diet_logs", ["patient_id"]
    )
    op.create_index(
        "ix_patient_nutrition_diet_logs_clinician_id", "patient_nutrition_diet_logs", ["clinician_id"]
    )

    op.create_table(
        "patient_supplements",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("patient_id", sa.String(36), nullable=False),
        sa.Column("clinician_id", sa.String(64), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("dose", sa.String(120), nullable=True),
        sa.Column("frequency", sa.String(120), nullable=True),
        sa.Column("active", sa.Boolean(), nullable=False, server_default="1"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("started_at", sa.String(20), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_patient_supplements_patient_id", "patient_supplements", ["patient_id"])
    op.create_index("ix_patient_supplements_clinician_id", "patient_supplements", ["clinician_id"])
    op.create_index("ix_patient_supplements_active", "patient_supplements", ["active"])

    op.create_table(
        "nutrition_analyzer_audits",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("patient_id", sa.String(36), nullable=False),
        sa.Column("clinician_id", sa.String(64), nullable=False),
        sa.Column("event_type", sa.String(40), nullable=False),
        sa.Column("message", sa.Text(), nullable=False, server_default=""),
        sa.Column("actor_id", sa.String(64), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_nutrition_analyzer_audits_patient_id", "nutrition_analyzer_audits", ["patient_id"])
    op.create_index("ix_nutrition_analyzer_audits_clinician_id", "nutrition_analyzer_audits", ["clinician_id"])


def downgrade() -> None:
    op.drop_table("nutrition_analyzer_audits")
    op.drop_table("patient_supplements")
    op.drop_table("patient_nutrition_diet_logs")
