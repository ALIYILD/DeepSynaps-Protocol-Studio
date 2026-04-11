"""Wave 15: Forms, Medication Safety, Reminders, IRB, Literature Library

Revision ID: 010_wave15_new_tables
Revises: 009_ae_resolved_at_consent_fields
Create Date: 2026-04-11

New tables (12):
  Forms & Assessments:
    - form_definitions
    - form_submissions
  Medication Safety:
    - patient_medications
    - medication_interaction_logs
  Reminder Campaigns:
    - reminder_campaigns
    - reminder_outbox_messages
  IRB Studies:
    - irb_studies
    - irb_amendments
    - irb_adverse_events
  Literature Library:
    - literature_papers
    - literature_protocol_tags
    - literature_reading_list
"""
from alembic import op
import sqlalchemy as sa

revision = '010_wave15_new_tables'
down_revision = '009_ae_resolved_at_consent_fields'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Forms & Assessments ──────────────────────────────────────────────────

    op.create_table(
        'form_definitions',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('clinician_id', sa.String(64), nullable=False),
        sa.Column('title', sa.String(255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('form_type', sa.String(60), nullable=False, server_default='custom'),
        sa.Column('questions_json', sa.Text(), nullable=False, server_default='[]'),
        sa.Column('scoring_json', sa.Text(), nullable=True),
        sa.Column('status', sa.String(30), nullable=False, server_default='draft'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_form_definitions_clinician_id', 'form_definitions', ['clinician_id'])

    op.create_table(
        'form_submissions',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('form_id', sa.String(36), nullable=False),
        sa.Column('patient_id', sa.String(36), nullable=False),
        sa.Column('clinician_id', sa.String(64), nullable=False),
        sa.Column('responses_json', sa.Text(), nullable=False, server_default='{}'),
        sa.Column('score', sa.String(60), nullable=True),
        sa.Column('score_numeric', sa.Float(), nullable=True),
        sa.Column('scoring_details_json', sa.Text(), nullable=True),
        sa.Column('status', sa.String(30), nullable=False, server_default='submitted'),
        sa.Column('submitted_at', sa.DateTime(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_form_submissions_form_id', 'form_submissions', ['form_id'])
    op.create_index('ix_form_submissions_patient_id', 'form_submissions', ['patient_id'])
    op.create_index('ix_form_submissions_clinician_id', 'form_submissions', ['clinician_id'])

    # ── Medication Safety ────────────────────────────────────────────────────

    op.create_table(
        'patient_medications',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('patient_id', sa.String(36), nullable=False),
        sa.Column('clinician_id', sa.String(64), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('generic_name', sa.String(255), nullable=True),
        sa.Column('drug_class', sa.String(120), nullable=True),
        sa.Column('dose', sa.String(80), nullable=True),
        sa.Column('frequency', sa.String(80), nullable=True),
        sa.Column('route', sa.String(60), nullable=True),
        sa.Column('indication', sa.String(255), nullable=True),
        sa.Column('prescriber', sa.String(255), nullable=True),
        sa.Column('started_at', sa.String(20), nullable=True),
        sa.Column('stopped_at', sa.String(20), nullable=True),
        sa.Column('active', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_patient_medications_patient_id', 'patient_medications', ['patient_id'])
    op.create_index('ix_patient_medications_clinician_id', 'patient_medications', ['clinician_id'])
    op.create_index('ix_patient_medications_active', 'patient_medications', ['active'])

    op.create_table(
        'medication_interaction_logs',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('patient_id', sa.String(36), nullable=False),
        sa.Column('clinician_id', sa.String(64), nullable=False),
        sa.Column('medications_checked_json', sa.Text(), nullable=False, server_default='[]'),
        sa.Column('interactions_found_json', sa.Text(), nullable=False, server_default='[]'),
        sa.Column('severity_summary', sa.String(30), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_medication_interaction_logs_patient_id', 'medication_interaction_logs', ['patient_id'])
    op.create_index('ix_medication_interaction_logs_clinician_id', 'medication_interaction_logs', ['clinician_id'])

    # ── Reminder Campaigns ───────────────────────────────────────────────────

    op.create_table(
        'reminder_campaigns',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('clinician_id', sa.String(64), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('campaign_type', sa.String(60), nullable=False, server_default='session'),
        sa.Column('channel', sa.String(30), nullable=False, server_default='email'),
        sa.Column('schedule_json', sa.Text(), nullable=False, server_default='{}'),
        sa.Column('message_template', sa.Text(), nullable=False, server_default=''),
        sa.Column('patient_ids_json', sa.Text(), nullable=False, server_default='[]'),
        sa.Column('active', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_reminder_campaigns_clinician_id', 'reminder_campaigns', ['clinician_id'])
    op.create_index('ix_reminder_campaigns_active', 'reminder_campaigns', ['active'])

    op.create_table(
        'reminder_outbox_messages',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('campaign_id', sa.String(36), nullable=True),
        sa.Column('patient_id', sa.String(36), nullable=False),
        sa.Column('clinician_id', sa.String(64), nullable=False),
        sa.Column('channel', sa.String(30), nullable=False),
        sa.Column('message_body', sa.Text(), nullable=False),
        sa.Column('status', sa.String(30), nullable=False, server_default='queued'),
        sa.Column('scheduled_at', sa.DateTime(), nullable=True),
        sa.Column('sent_at', sa.DateTime(), nullable=True),
        sa.Column('error_detail', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_reminder_outbox_messages_campaign_id', 'reminder_outbox_messages', ['campaign_id'])
    op.create_index('ix_reminder_outbox_messages_patient_id', 'reminder_outbox_messages', ['patient_id'])
    op.create_index('ix_reminder_outbox_messages_clinician_id', 'reminder_outbox_messages', ['clinician_id'])
    op.create_index('ix_reminder_outbox_messages_status', 'reminder_outbox_messages', ['status'])

    # ── IRB Studies ──────────────────────────────────────────────────────────

    op.create_table(
        'irb_studies',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('clinician_id', sa.String(64), nullable=False),
        sa.Column('title', sa.String(512), nullable=False),
        sa.Column('irb_number', sa.String(120), nullable=True),
        sa.Column('sponsor', sa.String(255), nullable=True),
        sa.Column('principal_investigator', sa.String(255), nullable=True),
        sa.Column('phase', sa.String(40), nullable=True),
        sa.Column('status', sa.String(40), nullable=False, server_default='pending'),
        sa.Column('approval_date', sa.String(20), nullable=True),
        sa.Column('expiry_date', sa.String(20), nullable=True),
        sa.Column('enrollment_target', sa.Integer(), nullable=True),
        sa.Column('enrolled_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('protocol_json', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_irb_studies_clinician_id', 'irb_studies', ['clinician_id'])
    op.create_index('ix_irb_studies_irb_number', 'irb_studies', ['irb_number'])

    op.create_table(
        'irb_amendments',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('study_id', sa.String(36), nullable=False),
        sa.Column('clinician_id', sa.String(64), nullable=False),
        sa.Column('amendment_type', sa.String(60), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('status', sa.String(30), nullable=False, server_default='submitted'),
        sa.Column('submitted_at', sa.DateTime(), nullable=False),
        sa.Column('resolved_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_irb_amendments_study_id', 'irb_amendments', ['study_id'])
    op.create_index('ix_irb_amendments_clinician_id', 'irb_amendments', ['clinician_id'])

    op.create_table(
        'irb_adverse_events',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('study_id', sa.String(36), nullable=False),
        sa.Column('patient_id', sa.String(36), nullable=True),
        sa.Column('clinician_id', sa.String(64), nullable=False),
        sa.Column('event_type', sa.String(60), nullable=False),
        sa.Column('severity', sa.String(20), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('relatedness', sa.String(40), nullable=True),
        sa.Column('status', sa.String(30), nullable=False, server_default='open'),
        sa.Column('reported_at', sa.DateTime(), nullable=False),
        sa.Column('resolved_at', sa.DateTime(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_irb_adverse_events_study_id', 'irb_adverse_events', ['study_id'])
    op.create_index('ix_irb_adverse_events_patient_id', 'irb_adverse_events', ['patient_id'])
    op.create_index('ix_irb_adverse_events_clinician_id', 'irb_adverse_events', ['clinician_id'])

    # ── Literature Library ───────────────────────────────────────────────────

    op.create_table(
        'literature_papers',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('added_by', sa.String(64), nullable=False),
        sa.Column('title', sa.String(1024), nullable=False),
        sa.Column('authors', sa.Text(), nullable=True),
        sa.Column('journal', sa.String(255), nullable=True),
        sa.Column('year', sa.Integer(), nullable=True),
        sa.Column('doi', sa.String(255), nullable=True),
        sa.Column('pubmed_id', sa.String(60), nullable=True),
        sa.Column('abstract', sa.Text(), nullable=True),
        sa.Column('modality', sa.String(60), nullable=True),
        sa.Column('condition', sa.String(120), nullable=True),
        sa.Column('evidence_grade', sa.String(20), nullable=True),
        sa.Column('study_type', sa.String(80), nullable=True),
        sa.Column('tags_json', sa.Text(), nullable=False, server_default='[]'),
        sa.Column('url', sa.String(1024), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_literature_papers_added_by', 'literature_papers', ['added_by'])
    op.create_index('ix_literature_papers_year', 'literature_papers', ['year'])
    op.create_index('ix_literature_papers_modality', 'literature_papers', ['modality'])
    op.create_index('ix_literature_papers_condition', 'literature_papers', ['condition'])

    op.create_table(
        'literature_protocol_tags',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('paper_id', sa.String(36), nullable=False),
        sa.Column('protocol_id', sa.String(64), nullable=False),
        sa.Column('tagged_by', sa.String(64), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_literature_protocol_tags_paper_id', 'literature_protocol_tags', ['paper_id'])
    op.create_index('ix_literature_protocol_tags_protocol_id', 'literature_protocol_tags', ['protocol_id'])

    op.create_table(
        'literature_reading_list',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('user_id', sa.String(64), nullable=False),
        sa.Column('paper_id', sa.String(36), nullable=False),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('read_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_literature_reading_list_user_id', 'literature_reading_list', ['user_id'])
    op.create_index('ix_literature_reading_list_paper_id', 'literature_reading_list', ['paper_id'])


def downgrade() -> None:
    # Drop in reverse dependency order

    # Literature Library
    op.drop_index('ix_literature_reading_list_paper_id', table_name='literature_reading_list')
    op.drop_index('ix_literature_reading_list_user_id', table_name='literature_reading_list')
    op.drop_table('literature_reading_list')

    op.drop_index('ix_literature_protocol_tags_protocol_id', table_name='literature_protocol_tags')
    op.drop_index('ix_literature_protocol_tags_paper_id', table_name='literature_protocol_tags')
    op.drop_table('literature_protocol_tags')

    op.drop_index('ix_literature_papers_condition', table_name='literature_papers')
    op.drop_index('ix_literature_papers_modality', table_name='literature_papers')
    op.drop_index('ix_literature_papers_year', table_name='literature_papers')
    op.drop_index('ix_literature_papers_added_by', table_name='literature_papers')
    op.drop_table('literature_papers')

    # IRB Studies
    op.drop_index('ix_irb_adverse_events_clinician_id', table_name='irb_adverse_events')
    op.drop_index('ix_irb_adverse_events_patient_id', table_name='irb_adverse_events')
    op.drop_index('ix_irb_adverse_events_study_id', table_name='irb_adverse_events')
    op.drop_table('irb_adverse_events')

    op.drop_index('ix_irb_amendments_clinician_id', table_name='irb_amendments')
    op.drop_index('ix_irb_amendments_study_id', table_name='irb_amendments')
    op.drop_table('irb_amendments')

    op.drop_index('ix_irb_studies_irb_number', table_name='irb_studies')
    op.drop_index('ix_irb_studies_clinician_id', table_name='irb_studies')
    op.drop_table('irb_studies')

    # Reminder Campaigns
    op.drop_index('ix_reminder_outbox_messages_status', table_name='reminder_outbox_messages')
    op.drop_index('ix_reminder_outbox_messages_clinician_id', table_name='reminder_outbox_messages')
    op.drop_index('ix_reminder_outbox_messages_patient_id', table_name='reminder_outbox_messages')
    op.drop_index('ix_reminder_outbox_messages_campaign_id', table_name='reminder_outbox_messages')
    op.drop_table('reminder_outbox_messages')

    op.drop_index('ix_reminder_campaigns_active', table_name='reminder_campaigns')
    op.drop_index('ix_reminder_campaigns_clinician_id', table_name='reminder_campaigns')
    op.drop_table('reminder_campaigns')

    # Medication Safety
    op.drop_index('ix_medication_interaction_logs_clinician_id', table_name='medication_interaction_logs')
    op.drop_index('ix_medication_interaction_logs_patient_id', table_name='medication_interaction_logs')
    op.drop_table('medication_interaction_logs')

    op.drop_index('ix_patient_medications_active', table_name='patient_medications')
    op.drop_index('ix_patient_medications_clinician_id', table_name='patient_medications')
    op.drop_index('ix_patient_medications_patient_id', table_name='patient_medications')
    op.drop_table('patient_medications')

    # Forms & Assessments
    op.drop_index('ix_form_submissions_clinician_id', table_name='form_submissions')
    op.drop_index('ix_form_submissions_patient_id', table_name='form_submissions')
    op.drop_index('ix_form_submissions_form_id', table_name='form_submissions')
    op.drop_table('form_submissions')

    op.drop_index('ix_form_definitions_clinician_id', table_name='form_definitions')
    op.drop_table('form_definitions')
