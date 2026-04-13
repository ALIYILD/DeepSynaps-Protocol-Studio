"""Add revision counter for home program task sync/conflict detection

Revision ID: 015_home_program_task_revision
Revises: 014_clinician_home_program_tasks
Create Date: 2026-04-12
"""
from alembic import op
import sqlalchemy as sa

revision = '015_home_program_task_revision'
down_revision = '014_clinician_home_program_tasks'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'clinician_home_program_tasks',
        sa.Column('revision', sa.Integer(), nullable=False, server_default='1'),
    )
    op.execute("UPDATE clinician_home_program_tasks SET revision = 1 WHERE revision IS NULL")


def downgrade() -> None:
    op.drop_column('clinician_home_program_tasks', 'revision')
