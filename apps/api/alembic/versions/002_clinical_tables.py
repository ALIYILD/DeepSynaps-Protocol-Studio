"""Add clinical practice tables: patients, clinical_sessions, assessment_records, prescribed_protocols

Revision ID: 002_clinical_tables
Revises: 001
Create Date: 2026-04-07
"""
from alembic import op
import sqlalchemy as sa

revision = '002_clinical_tables'
down_revision = '001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'patients',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('clinician_id', sa.String(64), nullable=False),
        sa.Column('first_name', sa.String(120), nullable=False),
        sa.Column('last_name', sa.String(120), nullable=False),
        sa.Column('dob', sa.String(20), nullable=True),
        sa.Column('email', sa.String(255), nullable=True),
        sa.Column('phone', sa.String(40), nullable=True),
        sa.Column('gender', sa.String(30), nullable=True),
        sa.Column('primary_condition', sa.String(120), nullable=True),
        sa.Column('secondary_conditions', sa.Text(), nullable=True),
        sa.Column('primary_modality', sa.String(60), nullable=True),
        sa.Column('referring_clinician', sa.String(255), nullable=True),
        sa.Column('insurance_provider', sa.String(120), nullable=True),
        sa.Column('insurance_number', sa.String(60), nullable=True),
        sa.Column('consent_signed', sa.Boolean(), nullable=False, server_default='0'),
        sa.Column('consent_date', sa.String(20), nullable=True),
        sa.Column('status', sa.String(30), nullable=False, server_default='active'),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_patients_clinician_id', 'patients', ['clinician_id'])

    op.create_table(
        'clinical_sessions',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('patient_id', sa.String(36), nullable=False),
        sa.Column('clinician_id', sa.String(64), nullable=False),
        sa.Column('scheduled_at', sa.String(32), nullable=False),
        sa.Column('duration_minutes', sa.Integer(), nullable=False, server_default='60'),
        sa.Column('modality', sa.String(60), nullable=True),
        sa.Column('protocol_ref', sa.String(255), nullable=True),
        sa.Column('session_number', sa.Integer(), nullable=True),
        sa.Column('total_sessions', sa.Integer(), nullable=True),
        sa.Column('status', sa.String(30), nullable=False, server_default='scheduled'),
        sa.Column('outcome', sa.String(30), nullable=True),
        sa.Column('session_notes', sa.Text(), nullable=True),
        sa.Column('adverse_events', sa.Text(), nullable=True),
        sa.Column('billing_code', sa.String(30), nullable=True),
        sa.Column('billing_status', sa.String(30), nullable=False, server_default='unbilled'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_clinical_sessions_patient_id', 'clinical_sessions', ['patient_id'])
    op.create_index('ix_clinical_sessions_clinician_id', 'clinical_sessions', ['clinician_id'])
    op.create_index('ix_clinical_sessions_scheduled_at', 'clinical_sessions', ['scheduled_at'])

    op.create_table(
        'assessment_records',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('patient_id', sa.String(36), nullable=True),
        sa.Column('clinician_id', sa.String(64), nullable=False),
        sa.Column('template_id', sa.String(64), nullable=False),
        sa.Column('template_title', sa.String(255), nullable=False),
        sa.Column('data_json', sa.Text(), nullable=False, server_default='{}'),
        sa.Column('clinician_notes', sa.Text(), nullable=True),
        sa.Column('status', sa.String(30), nullable=False, server_default='draft'),
        sa.Column('score', sa.String(30), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_assessment_records_patient_id', 'assessment_records', ['patient_id'])
    op.create_index('ix_assessment_records_clinician_id', 'assessment_records', ['clinician_id'])

    op.create_table(
        'prescribed_protocols',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('patient_id', sa.String(36), nullable=False),
        sa.Column('clinician_id', sa.String(64), nullable=False),
        sa.Column('condition', sa.String(120), nullable=False),
        sa.Column('modality', sa.String(60), nullable=False),
        sa.Column('device', sa.String(120), nullable=True),
        sa.Column('protocol_json', sa.Text(), nullable=False, server_default='{}'),
        sa.Column('sessions_total', sa.Integer(), nullable=False, server_default='12'),
        sa.Column('sessions_completed', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('status', sa.String(30), nullable=False, server_default='active'),
        sa.Column('started_at', sa.String(20), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_prescribed_protocols_patient_id', 'prescribed_protocols', ['patient_id'])
    op.create_index('ix_prescribed_protocols_clinician_id', 'prescribed_protocols', ['clinician_id'])


def downgrade() -> None:
    op.drop_table('prescribed_protocols')
    op.drop_table('assessment_records')
    op.drop_table('clinical_sessions')
    op.drop_table('patients')
