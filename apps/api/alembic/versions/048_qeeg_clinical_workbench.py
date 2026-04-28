"""Add Clinical Intelligence Workbench schema.

Adds safety cockpit, claim governance, clinician review workflow,
protocol fit, and longitudinal timeline support to the qEEG module.

Revision ID: 048_qeeg_clinical_workbench
Revises: 047_pipeline_failure_reason
"""
from alembic import op
import sqlalchemy as sa


revision = "048_qeeg_clinical_workbench"
down_revision = "047_pipeline_failure_reason"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Alter qeeg_analyses
    with op.batch_alter_table("qeeg_analyses") as batch_op:
        batch_op.add_column(sa.Column("safety_cockpit_json", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("red_flags_json", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("normative_metadata_json", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("interpretability_status", sa.String(30), nullable=True))

    # Alter qeeg_ai_reports
    with op.batch_alter_table("qeeg_ai_reports") as batch_op:
        batch_op.add_column(sa.Column("report_state", sa.String(30), nullable=False, server_default="DRAFT_AI"))
        batch_op.add_column(sa.Column("reviewer_id", sa.String(64), nullable=True))
        batch_op.add_column(sa.Column("model_version", sa.String(64), nullable=True))
        batch_op.add_column(sa.Column("prompt_version", sa.String(64), nullable=True))
        batch_op.add_column(sa.Column("report_version", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("claim_governance_json", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("patient_facing_report_json", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("signed_by", sa.String(64), nullable=True))
        batch_op.add_column(sa.Column("signed_at", sa.DateTime(), nullable=True))
        batch_op.create_index("ix_qeeg_ai_reports_reviewer_id", ["reviewer_id"])
        batch_op.create_index("ix_qeeg_ai_reports_signed_by", ["signed_by"])

    # New table: qeeg_report_findings
    op.create_table(
        "qeeg_report_findings",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("report_id", sa.String(36), nullable=False, index=True),
        sa.Column("finding_text", sa.Text(), nullable=False),
        sa.Column("claim_type", sa.String(20), nullable=False, server_default="INFERRED"),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.Column("clinician_note", sa.Text(), nullable=True),
        sa.Column("evidence_grade", sa.String(8), nullable=True),
        sa.Column("amended_text", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now(), onupdate=sa.func.now()),
    )

    # New table: qeeg_report_audits
    op.create_table(
        "qeeg_report_audits",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("report_id", sa.String(36), nullable=False, index=True),
        sa.Column("action", sa.String(40), nullable=False),
        sa.Column("actor_id", sa.String(64), nullable=False, index=True),
        sa.Column("actor_role", sa.String(32), nullable=False),
        sa.Column("previous_state", sa.String(30), nullable=True),
        sa.Column("new_state", sa.String(30), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    # New table: qeeg_protocol_fits
    op.create_table(
        "qeeg_protocol_fits",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("analysis_id", sa.String(36), nullable=False, index=True),
        sa.Column("patient_id", sa.String(36), nullable=False, index=True),
        sa.Column("pattern_summary", sa.Text(), nullable=False),
        sa.Column("symptom_linkage_json", sa.Text(), nullable=True),
        sa.Column("contraindications_json", sa.Text(), nullable=True),
        sa.Column("evidence_grade", sa.String(8), nullable=True),
        sa.Column("off_label_flag", sa.Boolean(), nullable=False, server_default="0"),
        sa.Column("candidate_protocol_json", sa.Text(), nullable=True),
        sa.Column("alternative_protocols_json", sa.Text(), nullable=True),
        sa.Column("match_rationale", sa.Text(), nullable=True),
        sa.Column("caution_rationale", sa.Text(), nullable=True),
        sa.Column("required_checks_json", sa.Text(), nullable=True),
        sa.Column("clinician_reviewed", sa.Boolean(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    # New table: qeeg_timeline_events
    op.create_table(
        "qeeg_timeline_events",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("patient_id", sa.String(36), nullable=False, index=True),
        sa.Column("event_type", sa.String(40), nullable=False, index=True),
        sa.Column("event_date", sa.String(20), nullable=False, index=True),
        sa.Column("event_data_json", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("source", sa.String(64), nullable=False),
        sa.Column("confidence", sa.String(20), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("qeeg_timeline_events")
    op.drop_table("qeeg_protocol_fits")
    op.drop_table("qeeg_report_audits")
    op.drop_table("qeeg_report_findings")

    with op.batch_alter_table("qeeg_ai_reports") as batch_op:
        batch_op.drop_index("ix_qeeg_ai_reports_signed_by")
        batch_op.drop_index("ix_qeeg_ai_reports_reviewer_id")
        batch_op.drop_column("signed_at")
        batch_op.drop_column("signed_by")
        batch_op.drop_column("patient_facing_report_json")
        batch_op.drop_column("claim_governance_json")
        batch_op.drop_column("report_version")
        batch_op.drop_column("prompt_version")
        batch_op.drop_column("model_version")
        batch_op.drop_column("reviewer_id")
        batch_op.drop_column("report_state")

    with op.batch_alter_table("qeeg_analyses") as batch_op:
        batch_op.drop_column("interpretability_status")
        batch_op.drop_column("normative_metadata_json")
        batch_op.drop_column("red_flags_json")
        batch_op.drop_column("safety_cockpit_json")
