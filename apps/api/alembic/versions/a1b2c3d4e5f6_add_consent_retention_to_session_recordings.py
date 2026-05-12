"""Add consent and retention columns to session_recordings

Revision ID: a1b2c3d4e5f6
Revises: b5278dd39fee, fee91f3d630f
Create Date: 2026-05-12 12:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = ('b5278dd39fee', 'fee91f3d630f')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Consent + clinic isolation
    op.add_column('session_recordings', sa.Column('clinic_id', sa.String(length=64), nullable=True))
    op.add_column('session_recordings', sa.Column('consent_granted', sa.Boolean(), nullable=False, server_default='0'))
    op.add_column('session_recordings', sa.Column('consent_recorded_at', sa.DateTime(), nullable=True))
    op.add_column('session_recordings', sa.Column('consent_document_id', sa.String(length=36), nullable=True))
    # Retention
    op.add_column('session_recordings', sa.Column('retention_days', sa.Integer(), nullable=False, server_default='90'))
    op.add_column('session_recordings', sa.Column('expires_at', sa.DateTime(), nullable=True))
    op.add_column('session_recordings', sa.Column('auto_deleted', sa.Boolean(), nullable=False, server_default='0'))
    op.add_column('session_recordings', sa.Column('deleted_at', sa.DateTime(), nullable=True))
    op.add_column('session_recordings', sa.Column('deleted_by', sa.String(length=64), nullable=True))

    # Indexes
    op.create_index('ix_session_recordings_clinic_id', 'session_recordings', ['clinic_id'], unique=False)
    op.create_index('ix_session_recordings_clinic_id_uploaded_at', 'session_recordings', ['clinic_id', 'uploaded_at'], unique=False)
    op.create_index('ix_session_recordings_clinic_id_expires_at', 'session_recordings', ['clinic_id', 'expires_at'], unique=False)
    op.create_index('ix_session_recordings_patient_id_uploaded_at', 'session_recordings', ['patient_id', 'uploaded_at'], unique=False)
    op.create_index('ix_session_recordings_auto_deleted_expires_at', 'session_recordings', ['auto_deleted', 'expires_at'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_session_recordings_auto_deleted_expires_at', table_name='session_recordings')
    op.drop_index('ix_session_recordings_patient_id_uploaded_at', table_name='session_recordings')
    op.drop_index('ix_session_recordings_clinic_id_expires_at', table_name='session_recordings')
    op.drop_index('ix_session_recordings_clinic_id_uploaded_at', table_name='session_recordings')
    op.drop_index('ix_session_recordings_clinic_id', table_name='session_recordings')

    op.drop_column('session_recordings', 'deleted_by')
    op.drop_column('session_recordings', 'deleted_at')
    op.drop_column('session_recordings', 'auto_deleted')
    op.drop_column('session_recordings', 'expires_at')
    op.drop_column('session_recordings', 'retention_days')
    op.drop_column('session_recordings', 'consent_document_id')
    op.drop_column('session_recordings', 'consent_recorded_at')
    op.drop_column('session_recordings', 'consent_granted')
    op.drop_column('session_recordings', 'clinic_id')
