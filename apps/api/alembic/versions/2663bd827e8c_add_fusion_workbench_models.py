"""add fusion workbench models

Revision ID: 2663bd827e8c
Revises: 055_merge_054_heads
Create Date: 2026-04-28 07:20:00.000000+00:00

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "2663bd827e8c"
down_revision: Union[str, None] = "055_merge_054_heads"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "fusion_cases",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("patient_id", sa.String(36), sa.ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("clinician_id", sa.String(64), nullable=False, index=True),
        sa.Column("qeeg_analysis_id", sa.String(36), nullable=True, index=True),
        sa.Column("mri_analysis_id", sa.String(36), nullable=True, index=True),
        sa.Column("assessment_ids_json", sa.Text(), nullable=True),
        sa.Column("course_ids_json", sa.Text(), nullable=True),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column("confidence_grade", sa.String(16), nullable=True, server_default="heuristic"),
        sa.Column("recommendations_json", sa.Text(), nullable=True),
        sa.Column("modality_agreement_json", sa.Text(), nullable=True),
        sa.Column("protocol_fusion_json", sa.Text(), nullable=True),
        sa.Column("explainability_json", sa.Text(), nullable=True),
        sa.Column("safety_cockpit_json", sa.Text(), nullable=True),
        sa.Column("red_flags_json", sa.Text(), nullable=True),
        sa.Column("governance_json", sa.Text(), nullable=True),
        sa.Column("patient_facing_report_json", sa.Text(), nullable=True),
        sa.Column("limitations_json", sa.Text(), nullable=True),
        sa.Column("missing_modalities_json", sa.Text(), nullable=True),
        sa.Column("provenance_json", sa.Text(), nullable=True),
        sa.Column("report_state", sa.String(30), nullable=False, server_default="FUSION_DRAFT_AI"),
        sa.Column("reviewer_id", sa.String(64), nullable=True, index=True),
        sa.Column("reviewed_at", sa.DateTime(), nullable=True),
        sa.Column("clinician_amendments", sa.Text(), nullable=True),
        sa.Column("report_version", sa.String(16), nullable=True),
        sa.Column("signed_by", sa.String(64), nullable=True, index=True),
        sa.Column("signed_at", sa.DateTime(), nullable=True),
        sa.Column("partial", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column("source_qeeg_state", sa.String(30), nullable=True),
        sa.Column("source_mri_state", sa.String(30), nullable=True),
        sa.Column("radiology_review_required", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column("generated_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )

    op.create_table(
        "fusion_case_audits",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("fusion_case_id", sa.String(36), sa.ForeignKey("fusion_cases.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("action", sa.String(32), nullable=False),
        sa.Column("actor_id", sa.String(64), nullable=False),
        sa.Column("actor_role", sa.String(50), nullable=False),
        sa.Column("previous_state", sa.String(30), nullable=True),
        sa.Column("new_state", sa.String(30), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )

    op.create_table(
        "fusion_case_findings",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("fusion_case_id", sa.String(36), sa.ForeignKey("fusion_cases.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("target_id", sa.String(64), nullable=False),
        sa.Column("claim_type", sa.String(30), nullable=False),
        sa.Column("status", sa.String(30), nullable=False, server_default="PENDING_REVIEW"),
        sa.Column("evidence_grade", sa.String(16), nullable=True),
        sa.Column("clinician_note", sa.Text(), nullable=True),
        sa.Column("amended_text", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )


def downgrade() -> None:
    op.drop_table("fusion_case_findings")
    op.drop_table("fusion_case_audits")
    op.drop_table("fusion_cases")
