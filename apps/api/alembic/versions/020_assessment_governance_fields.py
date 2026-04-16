"""Assessment governance fields: respondent_type, phase, due_date, scale_version, bundle_id, approval + AI audit

Revision ID: 020_assessment_governance_fields
Revises: 019_sales_inquiries
Create Date: 2026-04-17

Changes:
  - assessment_records.respondent_type : varchar(30) default 'patient' ('patient' | 'clinician' | 'caregiver')
  - assessment_records.phase           : varchar(30) nullable ('baseline' | 'mid' | 'post' | 'follow_up' | 'weekly' | 'pre_session' | 'post_session' | 'milestone' | 'discharge')
  - assessment_records.due_date        : DateTime nullable — real column, replaces notes-string hack
  - assessment_records.scale_version   : varchar(40) nullable — preserves scoring-rule version over time
  - assessment_records.bundle_id       : varchar(64) nullable — links to condition bundle
  - assessment_records.approved_status : varchar(30) default 'unreviewed' ('unreviewed' | 'approved' | 'rejected')
  - assessment_records.reviewed_by     : varchar(64) nullable — clinician_id who approved
  - assessment_records.reviewed_at     : DateTime nullable
  - assessment_records.ai_generated_at : DateTime nullable — set when content was populated by AI; clinician edit does not clear this
  - assessment_records.source          : varchar(40) default 'manual' ('manual' | 'bundle' | 'ai_draft' | 'import')
  - indexes on (patient_id, phase), (bundle_id), (approved_status)

SQLite-compatible: all columns are nullable or have server defaults.
"""
from alembic import op
import sqlalchemy as sa


revision = "020_assessment_governance_fields"
down_revision = "019_sales_inquiries"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("assessment_records") as batch_op:
        batch_op.add_column(sa.Column("respondent_type", sa.String(30), nullable=False, server_default="patient"))
        batch_op.add_column(sa.Column("phase", sa.String(30), nullable=True))
        batch_op.add_column(sa.Column("due_date", sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column("scale_version", sa.String(40), nullable=True))
        batch_op.add_column(sa.Column("bundle_id", sa.String(64), nullable=True))
        batch_op.add_column(sa.Column("approved_status", sa.String(30), nullable=False, server_default="unreviewed"))
        batch_op.add_column(sa.Column("reviewed_by", sa.String(64), nullable=True))
        batch_op.add_column(sa.Column("reviewed_at", sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column("ai_generated_at", sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column("source", sa.String(40), nullable=False, server_default="manual"))

    op.create_index("ix_assessment_records_phase", "assessment_records", ["patient_id", "phase"])
    op.create_index("ix_assessment_records_bundle_id", "assessment_records", ["bundle_id"])
    op.create_index("ix_assessment_records_approved_status", "assessment_records", ["approved_status"])


def downgrade() -> None:
    op.drop_index("ix_assessment_records_approved_status", table_name="assessment_records")
    op.drop_index("ix_assessment_records_bundle_id", table_name="assessment_records")
    op.drop_index("ix_assessment_records_phase", table_name="assessment_records")
    with op.batch_alter_table("assessment_records") as batch_op:
        batch_op.drop_column("source")
        batch_op.drop_column("ai_generated_at")
        batch_op.drop_column("reviewed_at")
        batch_op.drop_column("reviewed_by")
        batch_op.drop_column("approved_status")
        batch_op.drop_column("bundle_id")
        batch_op.drop_column("scale_version")
        batch_op.drop_column("due_date")
        batch_op.drop_column("phase")
        batch_op.drop_column("respondent_type")
