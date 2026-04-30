"""add deeptwin_analysis_runs, deeptwin_simulation_runs, deeptwin_clinician_notes

Revision ID: 063_add_deeptwin_persistence
Revises: 062_merge_061_heads
Create Date: 2026-04-30
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "063_add_deeptwin_persistence"
down_revision = "062_merge_061_heads"
branch_labels = None
depends_on = None


def _has_table(bind, table_name: str) -> bool:
    inspector = sa.inspect(bind)
    return table_name in inspector.get_table_names()


def upgrade() -> None:
    bind = op.get_bind()

    if not _has_table(bind, "deeptwin_analysis_runs"):
        op.create_table(
            "deeptwin_analysis_runs",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("patient_id", sa.String(36), sa.ForeignKey("patients.id", ondelete="CASCADE"), nullable=False),
            sa.Column("clinician_id", sa.String(64), nullable=False),
            sa.Column("analysis_type", sa.String(40), nullable=False),
            sa.Column("input_sources_json", sa.Text(), nullable=True),
            sa.Column("output_summary_json", sa.Text(), nullable=True),
            sa.Column("limitations_json", sa.Text(), nullable=True),
            sa.Column("confidence", sa.Float(), nullable=True),
            sa.Column("model_name", sa.String(100), nullable=True),
            sa.Column("status", sa.String(30), nullable=False, server_default="completed"),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("reviewed_at", sa.DateTime(), nullable=True),
            sa.Column("reviewed_by", sa.String(64), nullable=True),
        )
        op.create_index("ix_deeptwin_analysis_runs_patient_id", "deeptwin_analysis_runs", ["patient_id"])
        op.create_index("ix_deeptwin_analysis_runs_clinician_id", "deeptwin_analysis_runs", ["clinician_id"])

    if not _has_table(bind, "deeptwin_simulation_runs"):
        op.create_table(
            "deeptwin_simulation_runs",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("patient_id", sa.String(36), sa.ForeignKey("patients.id", ondelete="CASCADE"), nullable=False),
            sa.Column("clinician_id", sa.String(64), nullable=False),
            sa.Column("proposed_protocol_json", sa.Text(), nullable=True),
            sa.Column("assumptions_json", sa.Text(), nullable=True),
            sa.Column("predicted_direction_json", sa.Text(), nullable=True),
            sa.Column("evidence_links_json", sa.Text(), nullable=True),
            sa.Column("confidence", sa.Float(), nullable=True),
            sa.Column("limitations", sa.Text(), nullable=True),
            sa.Column("clinician_review_required", sa.Boolean(), nullable=False, server_default="1"),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("reviewed_at", sa.DateTime(), nullable=True),
            sa.Column("reviewed_by", sa.String(64), nullable=True),
        )
        op.create_index("ix_deeptwin_simulation_runs_patient_id", "deeptwin_simulation_runs", ["patient_id"])
        op.create_index("ix_deeptwin_simulation_runs_clinician_id", "deeptwin_simulation_runs", ["clinician_id"])

    if not _has_table(bind, "deeptwin_clinician_notes"):
        op.create_table(
            "deeptwin_clinician_notes",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("patient_id", sa.String(36), sa.ForeignKey("patients.id", ondelete="CASCADE"), nullable=False),
            sa.Column("clinician_id", sa.String(64), nullable=False),
            sa.Column("note_text", sa.Text(), nullable=False),
            sa.Column("related_analysis_id", sa.String(36), nullable=True),
            sa.Column("related_simulation_id", sa.String(36), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_deeptwin_clinician_notes_patient_id", "deeptwin_clinician_notes", ["patient_id"])
        op.create_index("ix_deeptwin_clinician_notes_clinician_id", "deeptwin_clinician_notes", ["clinician_id"])


def downgrade() -> None:
    bind = op.get_bind()
    if _has_table(bind, "deeptwin_clinician_notes"):
        op.drop_table("deeptwin_clinician_notes")
    if _has_table(bind, "deeptwin_simulation_runs"):
        op.drop_table("deeptwin_simulation_runs")
    if _has_table(bind, "deeptwin_analysis_runs"):
        op.drop_table("deeptwin_analysis_runs")
