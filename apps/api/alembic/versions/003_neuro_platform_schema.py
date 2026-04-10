"""Add neuromodulation platform tables: treatment courses, delivered sessions, adverse events,
phenotypes, qeeg, outcomes, review queue, intake packets, consent, protocol versions

Revision ID: 003_neuro_platform
Revises: 002_clinical_tables
Create Date: 2026-04-10
"""
from alembic import op
import sqlalchemy as sa

revision = '003_neuro_platform'
down_revision = '002_clinical_tables'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'treatment_courses',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('patient_id', sa.String(36), nullable=False),
        sa.Column('clinician_id', sa.String(64), nullable=False),
        sa.Column('protocol_id', sa.String(64), nullable=False),
        sa.Column('condition_slug', sa.String(120), nullable=False),
        sa.Column('modality_slug', sa.String(60), nullable=False),
        sa.Column('device_slug', sa.String(120), nullable=True),
        sa.Column('target_region', sa.String(60), nullable=True),
        sa.Column('phenotype_id', sa.String(64), nullable=True),
        sa.Column('evidence_grade', sa.String(20), nullable=True),
        sa.Column('on_label', sa.Boolean(), nullable=False, server_default='1'),
        sa.Column('planned_sessions_total', sa.Integer(), nullable=False, server_default='20'),
        sa.Column('planned_sessions_per_week', sa.Integer(), nullable=False, server_default='5'),
        sa.Column('planned_session_duration_minutes', sa.Integer(), nullable=False, server_default='40'),
        sa.Column('planned_frequency_hz', sa.String(30), nullable=True),
        sa.Column('planned_intensity', sa.String(60), nullable=True),
        sa.Column('coil_placement', sa.String(60), nullable=True),
        sa.Column('status', sa.String(40), nullable=False, server_default='pending_approval'),
        sa.Column('approved_by', sa.String(64), nullable=True),
        sa.Column('approved_at', sa.DateTime(), nullable=True),
        sa.Column('started_at', sa.DateTime(), nullable=True),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
        sa.Column('sessions_delivered', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('clinician_notes', sa.Text(), nullable=True),
        sa.Column('protocol_json', sa.Text(), nullable=True),
        sa.Column('review_required', sa.Boolean(), nullable=False, server_default='1'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_treatment_courses_patient_id', 'treatment_courses', ['patient_id'])
    op.create_index('ix_treatment_courses_clinician_id', 'treatment_courses', ['clinician_id'])
    op.create_index('ix_treatment_courses_protocol_id', 'treatment_courses', ['protocol_id'])

    op.create_table(
        'treatment_course_reviews',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('course_id', sa.String(36), nullable=False),
        sa.Column('reviewer_id', sa.String(64), nullable=False),
        sa.Column('review_type', sa.String(40), nullable=False),
        sa.Column('outcome', sa.String(40), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('milestone_session', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_treatment_course_reviews_course_id', 'treatment_course_reviews', ['course_id'])
    op.create_index('ix_treatment_course_reviews_reviewer_id', 'treatment_course_reviews', ['reviewer_id'])

    op.create_table(
        'protocol_versions',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('protocol_ref', sa.String(64), nullable=False),
        sa.Column('version', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('condition_slug', sa.String(120), nullable=False),
        sa.Column('modality_slug', sa.String(60), nullable=False),
        sa.Column('device_slug', sa.String(120), nullable=True),
        sa.Column('parameters_json', sa.Text(), nullable=False),
        sa.Column('evidence_grade', sa.String(20), nullable=False),
        sa.Column('on_label', sa.Boolean(), nullable=False, server_default='1'),
        sa.Column('governance_json', sa.Text(), nullable=True),
        sa.Column('created_by', sa.String(64), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('is_current', sa.Boolean(), nullable=False, server_default='1'),
    )
    op.create_index('ix_protocol_versions_protocol_ref', 'protocol_versions', ['protocol_ref'])

    op.create_table(
        'delivered_session_parameters',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('session_id', sa.String(36), nullable=False),
        sa.Column('course_id', sa.String(36), nullable=False),
        sa.Column('device_slug', sa.String(120), nullable=True),
        sa.Column('device_serial', sa.String(120), nullable=True),
        sa.Column('coil_position', sa.String(60), nullable=True),
        sa.Column('frequency_hz', sa.String(30), nullable=True),
        sa.Column('intensity_pct_rmt', sa.String(30), nullable=True),
        sa.Column('pulses_delivered', sa.Integer(), nullable=True),
        sa.Column('duration_minutes', sa.Integer(), nullable=True),
        sa.Column('side', sa.String(20), nullable=True),
        sa.Column('montage', sa.String(60), nullable=True),
        sa.Column('tech_id', sa.String(64), nullable=True),
        sa.Column('tolerance_rating', sa.String(20), nullable=True),
        sa.Column('interruptions', sa.Boolean(), nullable=False, server_default='0'),
        sa.Column('interruption_reason', sa.Text(), nullable=True),
        sa.Column('post_session_notes', sa.Text(), nullable=True),
        sa.Column('checklist_json', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_delivered_session_parameters_session_id', 'delivered_session_parameters', ['session_id'])
    op.create_index('ix_delivered_session_parameters_course_id', 'delivered_session_parameters', ['course_id'])

    op.create_table(
        'adverse_events',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('patient_id', sa.String(36), nullable=False),
        sa.Column('course_id', sa.String(36), nullable=True),
        sa.Column('session_id', sa.String(36), nullable=True),
        sa.Column('clinician_id', sa.String(64), nullable=False),
        sa.Column('event_type', sa.String(40), nullable=False),
        sa.Column('severity', sa.String(20), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('onset_timing', sa.String(30), nullable=True),
        sa.Column('resolution', sa.String(30), nullable=True),
        sa.Column('action_taken', sa.String(30), nullable=True),
        sa.Column('reported_at', sa.DateTime(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_adverse_events_patient_id', 'adverse_events', ['patient_id'])
    op.create_index('ix_adverse_events_course_id', 'adverse_events', ['course_id'])
    op.create_index('ix_adverse_events_session_id', 'adverse_events', ['session_id'])
    op.create_index('ix_adverse_events_clinician_id', 'adverse_events', ['clinician_id'])

    op.create_table(
        'consent_records',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('patient_id', sa.String(36), nullable=False),
        sa.Column('clinician_id', sa.String(64), nullable=False),
        sa.Column('consent_type', sa.String(40), nullable=False),
        sa.Column('modality_slug', sa.String(60), nullable=True),
        sa.Column('signed', sa.Boolean(), nullable=False, server_default='0'),
        sa.Column('signed_at', sa.DateTime(), nullable=True),
        sa.Column('document_ref', sa.String(255), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_consent_records_patient_id', 'consent_records', ['patient_id'])
    op.create_index('ix_consent_records_clinician_id', 'consent_records', ['clinician_id'])

    op.create_table(
        'phenotype_assignments',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('patient_id', sa.String(36), nullable=False),
        sa.Column('clinician_id', sa.String(64), nullable=False),
        sa.Column('phenotype_id', sa.String(64), nullable=False),
        sa.Column('phenotype_name', sa.String(255), nullable=False),
        sa.Column('domain', sa.String(120), nullable=True),
        sa.Column('rationale', sa.Text(), nullable=True),
        sa.Column('qeeg_supported', sa.Boolean(), nullable=False, server_default='0'),
        sa.Column('confidence', sa.String(20), nullable=True),
        sa.Column('assigned_at', sa.DateTime(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_phenotype_assignments_patient_id', 'phenotype_assignments', ['patient_id'])
    op.create_index('ix_phenotype_assignments_clinician_id', 'phenotype_assignments', ['clinician_id'])
    op.create_index('ix_phenotype_assignments_phenotype_id', 'phenotype_assignments', ['phenotype_id'])

    op.create_table(
        'qeeg_records',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('patient_id', sa.String(36), nullable=False),
        sa.Column('clinician_id', sa.String(64), nullable=False),
        sa.Column('course_id', sa.String(36), nullable=True),
        sa.Column('recording_type', sa.String(30), nullable=False),
        sa.Column('recording_date', sa.String(20), nullable=True),
        sa.Column('equipment', sa.String(120), nullable=True),
        sa.Column('eyes_condition', sa.String(20), nullable=True),
        sa.Column('raw_data_ref', sa.String(255), nullable=True),
        sa.Column('summary_notes', sa.Text(), nullable=True),
        sa.Column('findings_json', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_qeeg_records_patient_id', 'qeeg_records', ['patient_id'])
    op.create_index('ix_qeeg_records_clinician_id', 'qeeg_records', ['clinician_id'])
    op.create_index('ix_qeeg_records_course_id', 'qeeg_records', ['course_id'])

    op.create_table(
        'outcome_series',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('patient_id', sa.String(36), nullable=False),
        sa.Column('course_id', sa.String(36), nullable=False),
        sa.Column('assessment_id', sa.String(36), nullable=True),
        sa.Column('template_id', sa.String(64), nullable=False),
        sa.Column('template_title', sa.String(255), nullable=False),
        sa.Column('score', sa.String(30), nullable=True),
        sa.Column('score_numeric', sa.Float(), nullable=True),
        sa.Column('measurement_point', sa.String(40), nullable=False),
        sa.Column('administered_at', sa.DateTime(), nullable=False),
        sa.Column('clinician_id', sa.String(64), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_outcome_series_patient_id', 'outcome_series', ['patient_id'])
    op.create_index('ix_outcome_series_course_id', 'outcome_series', ['course_id'])
    op.create_index('ix_outcome_series_assessment_id', 'outcome_series', ['assessment_id'])
    op.create_index('ix_outcome_series_clinician_id', 'outcome_series', ['clinician_id'])

    op.create_table(
        'review_queue_items',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('item_type', sa.String(40), nullable=False),
        sa.Column('target_id', sa.String(36), nullable=False),
        sa.Column('target_type', sa.String(40), nullable=False),
        sa.Column('patient_id', sa.String(36), nullable=False),
        sa.Column('assigned_to', sa.String(64), nullable=True),
        sa.Column('priority', sa.String(20), nullable=False, server_default='normal'),
        sa.Column('status', sa.String(20), nullable=False, server_default='pending'),
        sa.Column('created_by', sa.String(64), nullable=False),
        sa.Column('due_by', sa.DateTime(), nullable=True),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_review_queue_items_target_id', 'review_queue_items', ['target_id'])
    op.create_index('ix_review_queue_items_patient_id', 'review_queue_items', ['patient_id'])
    op.create_index('ix_review_queue_items_assigned_to', 'review_queue_items', ['assigned_to'])

    op.create_table(
        'intake_packets',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('patient_id', sa.String(36), nullable=False),
        sa.Column('clinician_id', sa.String(64), nullable=False),
        sa.Column('status', sa.String(20), nullable=False, server_default='incomplete'),
        sa.Column('chief_complaint', sa.Text(), nullable=True),
        sa.Column('history_of_present_illness', sa.Text(), nullable=True),
        sa.Column('psychiatric_history', sa.Text(), nullable=True),
        sa.Column('medical_history', sa.Text(), nullable=True),
        sa.Column('medications', sa.Text(), nullable=True),
        sa.Column('allergies', sa.Text(), nullable=True),
        sa.Column('prior_neuromod_treatments', sa.Text(), nullable=True),
        sa.Column('contraindication_screening_json', sa.Text(), nullable=True),
        sa.Column('baseline_assessments_complete', sa.Boolean(), nullable=False, server_default='0'),
        sa.Column('consent_obtained', sa.Boolean(), nullable=False, server_default='0'),
        sa.Column('clinician_notes', sa.Text(), nullable=True),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_intake_packets_patient_id', 'intake_packets', ['patient_id'])
    op.create_index('ix_intake_packets_clinician_id', 'intake_packets', ['clinician_id'])


def downgrade() -> None:
    op.drop_table('intake_packets')
    op.drop_table('review_queue_items')
    op.drop_table('outcome_series')
    op.drop_table('qeeg_records')
    op.drop_table('phenotype_assignments')
    op.drop_table('consent_records')
    op.drop_table('adverse_events')
    op.drop_table('delivered_session_parameters')
    op.drop_table('protocol_versions')
    op.drop_table('treatment_course_reviews')
    op.drop_table('treatment_courses')
