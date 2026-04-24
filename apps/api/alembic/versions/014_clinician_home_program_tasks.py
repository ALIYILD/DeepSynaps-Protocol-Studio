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
    # Idempotent bootstrap: Fly's SQLite volume has this table from an earlier
    # Base.metadata.create_all() path before alembic was wired in for it, so
    # re-running the DDL would raise "table already exists". Skip when the
    # schema already matches.
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())
    if 'clinician_home_program_tasks' not in existing_tables:
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
    existing_indexes = {ix['name'] for ix in inspector.get_indexes('clinician_home_program_tasks')}
    if 'ix_clinician_home_program_tasks_patient_id' not in existing_indexes:
        op.create_index('ix_clinician_home_program_tasks_patient_id', 'clinician_home_program_tasks', ['patient_id'])
    if 'ix_clinician_home_program_tasks_clinician_id' not in existing_indexes:
        op.create_index('ix_clinician_home_program_tasks_clinician_id', 'clinician_home_program_tasks', ['clinician_id'])


def downgrade() -> None:
    op.drop_index('ix_clinician_home_program_tasks_clinician_id', table_name='clinician_home_program_tasks')
    op.drop_index('ix_clinician_home_program_tasks_patient_id', table_name='clinician_home_program_tasks')
    op.drop_table('clinician_home_program_tasks')
