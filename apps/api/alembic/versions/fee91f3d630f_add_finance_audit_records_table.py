"""Add finance_audit_records table

Revision ID: fee91f3d630f
Revises: e2c4a3a5eb8b
Create Date: 2026-05-12 11:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'fee91f3d630f'
down_revision: Union[str, None] = 'e2c4a3a5eb8b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'finance_audit_records',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('event_id', sa.String(length=36), nullable=False),
        sa.Column('action', sa.String(length=32), nullable=False),
        sa.Column('target_type', sa.String(length=16), nullable=False),
        sa.Column('target_id', sa.String(length=36), nullable=False),
        sa.Column('patient_id', sa.String(length=36), nullable=True),
        sa.Column('actor_id', sa.String(length=64), nullable=False),
        sa.Column('actor_role', sa.String(length=32), nullable=False),
        sa.Column('clinic_id', sa.String(length=64), nullable=True),
        sa.Column('amount', sa.Float(), nullable=True),
        sa.Column('currency', sa.String(length=8), nullable=True),
        sa.Column('snapshot_json', sa.Text(), nullable=False),
        sa.Column('delta_json', sa.Text(), nullable=True),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('event_id', name='uq_finance_audit_event_id')
    )
    op.create_index('ix_finance_audit_action', 'finance_audit_records', ['action'], unique=False)
    op.create_index('ix_finance_audit_actor_id', 'finance_audit_records', ['actor_id'], unique=False)
    op.create_index('ix_finance_audit_clinic_created', 'finance_audit_records', ['clinic_id', 'created_at'], unique=False)
    op.create_index('ix_finance_audit_created_at', 'finance_audit_records', ['created_at'], unique=False)
    op.create_index('ix_finance_audit_event_id', 'finance_audit_records', ['event_id'], unique=True)
    op.create_index('ix_finance_audit_patient_id', 'finance_audit_records', ['patient_id'], unique=False)
    op.create_index('ix_finance_audit_target', 'finance_audit_records', ['target_type', 'target_id'], unique=False)
    op.create_index('ix_finance_audit_target_id', 'finance_audit_records', ['target_id'], unique=False)
    op.create_index('ix_finance_audit_target_type', 'finance_audit_records', ['target_type'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_finance_audit_target_type', table_name='finance_audit_records')
    op.drop_index('ix_finance_audit_target_id', table_name='finance_audit_records')
    op.drop_index('ix_finance_audit_target', table_name='finance_audit_records')
    op.drop_index('ix_finance_audit_patient_id', table_name='finance_audit_records')
    op.drop_index('ix_finance_audit_event_id', table_name='finance_audit_records')
    op.drop_index('ix_finance_audit_created_at', table_name='finance_audit_records')
    op.drop_index('ix_finance_audit_clinic_created', table_name='finance_audit_records')
    op.drop_index('ix_finance_audit_actor_id', table_name='finance_audit_records')
    op.drop_index('ix_finance_audit_action', table_name='finance_audit_records')
    op.drop_table('finance_audit_records')
