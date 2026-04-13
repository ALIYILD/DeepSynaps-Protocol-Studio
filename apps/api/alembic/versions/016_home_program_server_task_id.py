"""Authoritative server_task_id UUID for clinician home program tasks

Revision ID: 016_home_program_server_task_id
Revises: 015_home_program_task_revision
Create Date: 2026-04-12
"""
from __future__ import annotations

import uuid

import sqlalchemy as sa
from alembic import op

revision = '016_home_program_server_task_id'
down_revision = '015_home_program_task_revision'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('clinician_home_program_tasks', sa.Column('server_task_id', sa.String(length=36), nullable=True))
    conn = op.get_bind()
    rows = conn.execute(sa.text('SELECT id FROM clinician_home_program_tasks')).fetchall()
    for (row_id,) in rows:
        conn.execute(
            sa.text('UPDATE clinician_home_program_tasks SET server_task_id = :u WHERE id = :i'),
            {'u': str(uuid.uuid4()), 'i': row_id},
        )
    with op.batch_alter_table('clinician_home_program_tasks') as batch:
        batch.create_unique_constraint('uq_chpt_server_task_id', ['server_task_id'])
        batch.alter_column('server_task_id', nullable=False)


def downgrade() -> None:
    with op.batch_alter_table('clinician_home_program_tasks') as batch:
        batch.drop_constraint('uq_chpt_server_task_id', type_='unique')
    op.drop_column('clinician_home_program_tasks', 'server_task_id')
