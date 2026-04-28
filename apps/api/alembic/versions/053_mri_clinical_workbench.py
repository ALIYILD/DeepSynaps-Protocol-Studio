"""MRI Clinical Workbench schema.

Adds clinical governance, report review, safety cockpit, and export gating
to the existing MRI analysis tables.
"""

from alembic import op
import sqlalchemy as sa

revision = "053_mri_clinical_workbench"
down_revision = "052_patient_agent_activation"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add clinical workbench columns to mri_analyses
    # Use individual add_column calls to avoid batch_alter_table
    # CircularDependencyError on SQLite with SQLAlchemy 2.x
    op.add_column("mri_analyses", sa.Column("safety_cockpit_json", sa.Text(), nullable=True))
    op.add_column("mri_analyses", sa.Column("red_flags_json", sa.Text(), nullable=True))
    op.add_column("mri_analyses", sa.Column("atlas_metadata_json", sa.Text(), nullable=True))
    op.add_column("mri_analyses", sa.Column("interpretability_status", sa.String(30), nullable=True))
    op.add_column("mri_analyses", sa.Column("report_state", sa.String(30), nullable=True))
    op.add_column("mri_analyses", sa.Column("reviewer_id", sa.String(64), nullable=True))
    op.add_column("mri_analyses", sa.Column("reviewed_at", sa.DateTime(), nullable=True))
    op.add_column("mri_analyses", sa.Column("signed_by", sa.String(64), nullable=True))
    op.add_column("mri_analyses", sa.Column("signed_at", sa.DateTime(), nullable=True))
    op.add_column("mri_analyses", sa.Column("claim_governance_json", sa.Text(), nullable=True))
    op.add_column("mri_analyses", sa.Column("patient_facing_report_json", sa.Text(), nullable=True))
    op.add_column("mri_analyses", sa.Column("report_version", sa.String(16), nullable=True))

    # Index for report_state lookups
    op.create_index("ix_mri_analyses_report_state", "mri_analyses", ["report_state"])

    # mri_report_findings — per-target finding review and annotation
    op.create_table(
        "mri_report_findings",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("analysis_id", sa.String(36), sa.ForeignKey("mri_analyses.analysis_id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("target_id", sa.String(64), nullable=False),
        sa.Column("claim_type", sa.String(30), nullable=False),
        sa.Column("status", sa.String(30), nullable=False, server_default="PENDING_REVIEW"),
        sa.Column("evidence_grade", sa.String(16), nullable=True),
        sa.Column("clinician_note", sa.Text(), nullable=True),
        sa.Column("amended_text", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )

    # mri_report_audits — immutable state transition log
    op.create_table(
        "mri_report_audits",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("analysis_id", sa.String(36), sa.ForeignKey("mri_analyses.analysis_id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("action", sa.String(32), nullable=False),
        sa.Column("actor_id", sa.String(64), nullable=False),
        sa.Column("actor_role", sa.String(50), nullable=False),
        sa.Column("previous_state", sa.String(30), nullable=True),
        sa.Column("new_state", sa.String(30), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )

    # mri_target_plans — stimulation target governance records
    op.create_table(
        "mri_target_plans",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("analysis_id", sa.String(36), sa.ForeignKey("mri_analyses.analysis_id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("target_index", sa.Integer(), nullable=False),
        sa.Column("anatomical_label", sa.String(64), nullable=False),
        sa.Column("modality_compatibility", sa.Text(), nullable=True),
        sa.Column("atlas_version", sa.String(32), nullable=True),
        sa.Column("registration_confidence", sa.String(16), nullable=True),
        sa.Column("coordinate_uncertainty_mm", sa.Float(), nullable=True),
        sa.Column("contraindications", sa.Text(), nullable=True),
        sa.Column("evidence_grade", sa.String(16), nullable=True),
        sa.Column("off_label_flag", sa.Boolean(), default=False),
        sa.Column("match_rationale", sa.Text(), nullable=True),
        sa.Column("caution_rationale", sa.Text(), nullable=True),
        sa.Column("required_checks", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )

    # mri_timeline_events — longitudinal patient event log
    op.create_table(
        "mri_timeline_events",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("patient_id", sa.Text(), nullable=False, index=True),
        sa.Column("event_type", sa.String(32), nullable=False),
        sa.Column("source_analysis_id", sa.String(36), sa.ForeignKey("mri_analyses.analysis_id", ondelete="SET NULL"), nullable=True),
        sa.Column("title", sa.String(128), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("event_date", sa.DateTime(), nullable=True),
        sa.Column("severity", sa.String(16), nullable=True),
        sa.Column("resolved", sa.Boolean(), default=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )


def downgrade() -> None:
    op.drop_table("mri_timeline_events")
    op.drop_table("mri_target_plans")
    op.drop_table("mri_report_audits")
    op.drop_table("mri_report_findings")
    op.drop_index("ix_mri_analyses_report_state", table_name="mri_analyses")
    op.drop_column("mri_analyses", "report_version")
    op.drop_column("mri_analyses", "patient_facing_report_json")
    op.drop_column("mri_analyses", "claim_governance_json")
    op.drop_column("mri_analyses", "signed_at")
    op.drop_column("mri_analyses", "signed_by")
    op.drop_column("mri_analyses", "reviewed_at")
    op.drop_column("mri_analyses", "reviewer_id")
    op.drop_column("mri_analyses", "report_state")
    op.drop_column("mri_analyses", "interpretability_status")
    op.drop_column("mri_analyses", "atlas_metadata_json")
    op.drop_column("mri_analyses", "red_flags_json")
    op.drop_column("mri_analyses", "safety_cockpit_json")
