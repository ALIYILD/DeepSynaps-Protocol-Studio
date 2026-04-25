"""Add cleaning_config_json column to qeeg_analyses.

Stores the user's interactive cleaning preferences (bad channels, bad
segments, ICA component overrides, filter parameters) so the pipeline
can be re-run with manual edits applied.

Revision ID: 046_cleaning_config
Revises: 045_evidence_citation_validator
"""
from alembic import op
import sqlalchemy as sa


revision = "046_cleaning_config"
down_revision = "045_evidence_citation_validator"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("qeeg_analyses") as batch_op:
        batch_op.add_column(sa.Column("cleaning_config_json", sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("qeeg_analyses") as batch_op:
        batch_op.drop_column("cleaning_config_json")
