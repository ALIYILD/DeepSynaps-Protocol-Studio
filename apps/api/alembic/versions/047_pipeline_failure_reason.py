"""Add failure_reason column to mri_analyses.

When an MRI pipeline run fails, the SSE / status endpoint should return
a human-readable reason so the clinician sees a meaningful error card
instead of a generic "the pipeline stopped before a report was
generated" message. (qeeg_analyses already has `analysis_error`.)

Revision ID: 047_pipeline_failure_reason
Revises: 046_cleaning_config
"""
from alembic import op
import sqlalchemy as sa


revision = "047_pipeline_failure_reason"
down_revision = "046_cleaning_config"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("mri_analyses") as batch_op:
        batch_op.add_column(sa.Column("failure_reason", sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("mri_analyses") as batch_op:
        batch_op.drop_column("failure_reason")
