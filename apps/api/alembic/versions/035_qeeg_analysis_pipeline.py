"""qEEG analysis pipeline — analyses, AI reports, and comparisons.

Revision ID: 035_qeeg_analysis_pipeline
Revises: 034_risk_stratification
Create Date: 2026-04-23
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "035_qeeg_analysis_pipeline"
down_revision = "034_risk_stratification"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "qeeg_analyses",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("qeeg_record_id", sa.String(36), nullable=True, index=True),
        sa.Column("patient_id", sa.String(36), nullable=False, index=True),
        sa.Column("clinician_id", sa.String(64), nullable=False, index=True),
        sa.Column("file_ref", sa.String(512), nullable=True),
        sa.Column("original_filename", sa.String(255), nullable=True),
        sa.Column("file_size_bytes", sa.Integer(), nullable=True),
        sa.Column("recording_duration_sec", sa.Float(), nullable=True),
        sa.Column("sample_rate_hz", sa.Float(), nullable=True),
        sa.Column("channels_json", sa.Text(), nullable=True),
        sa.Column("channel_count", sa.Integer(), nullable=True),
        sa.Column("recording_date", sa.String(20), nullable=True),
        sa.Column("eyes_condition", sa.String(20), nullable=True),
        sa.Column("equipment", sa.String(120), nullable=True),
        sa.Column("course_id", sa.String(36), nullable=True, index=True),
        sa.Column("analysis_status", sa.String(30), nullable=False, server_default="pending"),
        sa.Column("analysis_error", sa.Text(), nullable=True),
        sa.Column("band_powers_json", sa.Text(), nullable=True),
        sa.Column("normative_deviations_json", sa.Text(), nullable=True),
        sa.Column("artifact_rejection_json", sa.Text(), nullable=True),
        sa.Column("analysis_params_json", sa.Text(), nullable=True),
        sa.Column("analyzed_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "qeeg_ai_reports",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("analysis_id", sa.String(36), nullable=False, index=True),
        sa.Column("patient_id", sa.String(36), nullable=False, index=True),
        sa.Column("clinician_id", sa.String(64), nullable=False, index=True),
        sa.Column("report_type", sa.String(40), nullable=False, server_default="standard"),
        sa.Column("ai_narrative_json", sa.Text(), nullable=True),
        sa.Column("clinical_impressions", sa.Text(), nullable=True),
        sa.Column("condition_matches_json", sa.Text(), nullable=True),
        sa.Column("protocol_suggestions_json", sa.Text(), nullable=True),
        sa.Column("literature_refs_json", sa.Text(), nullable=True),
        sa.Column("model_used", sa.String(64), nullable=True),
        sa.Column("prompt_hash", sa.String(64), nullable=True),
        sa.Column("confidence_note", sa.Text(), nullable=True),
        sa.Column("clinician_reviewed", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column("clinician_amendments", sa.Text(), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "qeeg_comparisons",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("patient_id", sa.String(36), nullable=False, index=True),
        sa.Column("clinician_id", sa.String(64), nullable=False, index=True),
        sa.Column("baseline_analysis_id", sa.String(36), nullable=False, index=True),
        sa.Column("followup_analysis_id", sa.String(36), nullable=False, index=True),
        sa.Column("comparison_type", sa.String(40), nullable=False, server_default="pre_post"),
        sa.Column("delta_powers_json", sa.Text(), nullable=True),
        sa.Column("improvement_summary_json", sa.Text(), nullable=True),
        sa.Column("ai_comparison_narrative", sa.Text(), nullable=True),
        sa.Column("course_id", sa.String(36), nullable=True, index=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("qeeg_comparisons")
    op.drop_table("qeeg_ai_reports")
    op.drop_table("qeeg_analyses")
