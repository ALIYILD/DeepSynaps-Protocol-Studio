"""Add patient_invites and messages tables

Revision ID: 004_patient_invites_messages
Revises: 003_neuro_platform
Create Date: 2026-04-10
"""
from alembic import op
import sqlalchemy as sa

revision = '004_patient_invites_messages'
down_revision = '003_neuro_platform'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add clinic_id to users table (nullable, backward-compatible)
    op.add_column('users', sa.Column('clinic_id', sa.String(64), nullable=True))
    op.create_index('ix_users_clinic_id', 'users', ['clinic_id'])

    op.create_table(
        'patient_invites',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('invite_code', sa.String(32), nullable=False, unique=True),
        sa.Column('patient_name', sa.String(255), nullable=True),
        sa.Column('patient_email', sa.String(255), nullable=True),
        sa.Column('clinic_id', sa.String(64), nullable=True),
        sa.Column('clinician_id', sa.String(64), nullable=False),
        sa.Column('condition', sa.String(120), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.Column('used_at', sa.DateTime(), nullable=True),
        sa.Column('activated_user_id', sa.String(36), nullable=True),
    )
    op.create_index('ix_patient_invites_invite_code', 'patient_invites', ['invite_code'], unique=True)
    op.create_index('ix_patient_invites_clinic_id', 'patient_invites', ['clinic_id'])
    op.create_index('ix_patient_invites_clinician_id', 'patient_invites', ['clinician_id'])

    op.create_table(
        'messages',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('sender_id', sa.String(64), nullable=False),
        sa.Column('recipient_id', sa.String(64), nullable=False),
        sa.Column('patient_id', sa.String(36), nullable=True),
        sa.Column('body', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('read_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_messages_sender_id', 'messages', ['sender_id'])
    op.create_index('ix_messages_recipient_id', 'messages', ['recipient_id'])
    op.create_index('ix_messages_patient_id', 'messages', ['patient_id'])


def downgrade() -> None:
    op.drop_index('ix_users_clinic_id', table_name='users')
    op.drop_column('users', 'clinic_id')

    op.drop_index('ix_messages_patient_id', table_name='messages')
    op.drop_index('ix_messages_recipient_id', table_name='messages')
    op.drop_index('ix_messages_sender_id', table_name='messages')
    op.drop_table('messages')

    op.drop_index('ix_patient_invites_clinician_id', table_name='patient_invites')
    op.drop_index('ix_patient_invites_clinic_id', table_name='patient_invites')
    op.drop_index('ix_patient_invites_invite_code', table_name='patient_invites')
    op.drop_table('patient_invites')
