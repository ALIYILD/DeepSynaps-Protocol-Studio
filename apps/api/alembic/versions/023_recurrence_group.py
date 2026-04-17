"""Add recurrence_group to clinical_sessions for recurring appointment support

Revision ID: 022_recurrence_group
Revises: 021_scheduling_fields
Create Date: 2026-04-16

Changes:
  - clinical_sessions.recurrence_group : varchar(100) nullable, indexed
"""
from alembic import op
import sqlalchemy as sa


revision = "023_recurrence_group"
down_revision = "022_leads_reception_tables"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("clinical_sessions") as batch_op:
        batch_op.add_column(sa.Column("recurrence_group", sa.String(100), nullable=True))
    op.create_index("ix_clinical_sessions_recurrence_group", "clinical_sessions", ["recurrence_group"])


def downgrade() -> None:
    op.drop_index("ix_clinical_sessions_recurrence_group", table_name="clinical_sessions")
    with op.batch_alter_table("clinical_sessions") as batch_op:
        batch_op.drop_column("recurrence_group")
