"""Clinician home program tasks (validated provenance JSON)

Revision ID: 014_clinician_home_program_tasks
Revises: 013_indexes_and_constraints
Create Date: 2026-04-12
"""
from alembic import op
import sqlalchemy as sa

revision = '014_clinician_home_program_tasks'
down_revision = '013_indexes_and_constraints'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'clinician_home_program_tasks',
        sa.Column('id', sa.String(length=96), nullable=False),
        sa.Column('patient_id', sa.String(length=36), nullable=False),
        sa.Column('clinician_id', sa.String(length=64), nullable=False),
        sa.Column('task_json', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['patient_id'], ['patients.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_clinician_home_program_tasks_patient_id', 'clinician_home_program_tasks', ['patient_id'])
    op.create_index('ix_clinician_home_program_tasks_clinician_id', 'clinician_home_program_tasks', ['clinician_id'])


def downgrade() -> None:
    op.drop_index('ix_clinician_home_program_tasks_clinician_id', table_name='clinician_home_program_tasks')
    op.drop_index('ix_clinician_home_program_tasks_patient_id', table_name='clinician_home_program_tasks')
    op.drop_table('clinician_home_program_tasks')
