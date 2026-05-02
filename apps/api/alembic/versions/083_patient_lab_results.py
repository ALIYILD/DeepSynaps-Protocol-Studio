"""Patient lab results table for Labs Analyzer persistence.

Revision ID: 083_patient_lab_results
Revises: 082_irb_amendment_workflow
Create Date: 2026-05-02
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "083_patient_lab_results"
down_revision = "082_irb_amendment_workflow"
branch_labels = None
depends_on = None


def _has_table(bind: sa.engine.Engine, table_name: str) -> bool:
    insp = sa.inspect(bind)
    return table_name in insp.get_table_names()


def upgrade() -> None:
    bind = op.get_bind()
    if _has_table(bind, "patient_lab_results"):
        return

    op.create_table(
        "patient_lab_results",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("patient_id", sa.String(36), sa.ForeignKey("patients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("clinician_id", sa.String(64), nullable=False),
        sa.Column("analyte_code", sa.String(64), nullable=False),
        sa.Column("analyte_display_name", sa.String(255), nullable=False),
        sa.Column("panel_name", sa.String(255), nullable=True),
        sa.Column("value_numeric", sa.Float(), nullable=True),
        sa.Column("value_text", sa.String(255), nullable=True),
        sa.Column("unit_ucum", sa.String(64), nullable=True),
        sa.Column("ref_low", sa.Float(), nullable=True),
        sa.Column("ref_high", sa.Float(), nullable=True),
        sa.Column("ref_text", sa.String(255), nullable=True),
        sa.Column("sample_collected_at", sa.DateTime(), nullable=True),
        sa.Column("source", sa.String(32), nullable=False, server_default="manual"),
        sa.Column("is_demo", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_patient_lab_results_patient_id", "patient_lab_results", ["patient_id"])
    op.create_index("ix_patient_lab_results_analyte_code", "patient_lab_results", ["analyte_code"])
    op.create_index(
        "ix_patient_lab_results_patient_created",
        "patient_lab_results",
        ["patient_id", "created_at"],
    )


def downgrade() -> None:
    bind = op.get_bind()
    if not _has_table(bind, "patient_lab_results"):
        return
    op.drop_table("patient_lab_results")
