"""Add media upload and AI analysis workflow tables

Revision ID: 007_media_workflows
Revises: 006_wearable_fk_indexes
Create Date: 2026-04-11

Adds:
- media_consents: patient consent records for media upload and AI analysis
- patient_media_uploads: patient voice/video/text uploads
- patient_media_transcripts: ASR transcripts for patient uploads
- patient_media_analysis: AI-structured analysis output for patient uploads
- patient_media_review_actions: clinician review audit trail for patient uploads
- clinician_media_notes: clinician voice/video/text notes
- media_red_flags: AI or clinician-flagged safety/urgency signals
- clinician_media_transcripts: ASR transcripts for clinician notes
- clinician_note_drafts: AI-generated draft clinical notes from clinician media
"""
from alembic import op
import sqlalchemy as sa

revision = '007_media_workflows'
down_revision = '006_wearable_fk_indexes'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── media_consents ────────────────────────────────────────────────────────
    op.create_table(
        'media_consents',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('patient_id', sa.String(36), nullable=False),
        sa.Column('consent_type', sa.String(40), nullable=False),       # "upload_voice"|"upload_video"|"upload_text"|"ai_analysis"
        sa.Column('granted', sa.Boolean(), nullable=False, server_default='0'),
        sa.Column('granted_at', sa.DateTime(), nullable=True),
        sa.Column('revoked_at', sa.DateTime(), nullable=True),
        sa.Column('retention_days', sa.Integer(), nullable=False, server_default='365'),
        sa.Column('ip_address', sa.String(64), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['patient_id'], ['patients.id'], name='fk_media_consents_patient_id'),
    )
    op.create_index('ix_media_consents_patient_id', 'media_consents', ['patient_id'])

    # ── clinician_media_notes ─────────────────────────────────────────────────
    # Created before tables that FK into it (media_red_flags, clinician_media_transcripts,
    # clinician_note_drafts).
    op.create_table(
        'clinician_media_notes',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('patient_id', sa.String(36), nullable=False),
        sa.Column('course_id', sa.String(36), nullable=True),
        sa.Column('session_id', sa.String(36), nullable=True),
        sa.Column('clinician_id', sa.String(36), nullable=False),
        sa.Column('note_type', sa.String(40), nullable=False),          # "post_session"|"clinical_update"|"adverse_event"|"progress"
        sa.Column('media_type', sa.String(20), nullable=False),         # "voice"|"text"|"video"
        sa.Column('file_ref', sa.String(512), nullable=True),
        sa.Column('file_size_bytes', sa.Integer(), nullable=True),
        sa.Column('duration_seconds', sa.Integer(), nullable=True),
        sa.Column('text_content', sa.Text(), nullable=True),
        sa.Column('status', sa.String(40), nullable=False, server_default='recorded'),  # "recorded"|"transcribed"|"draft_generated"|"draft_approved"|"finalized"
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['patient_id'], ['patients.id'], name='fk_clinician_media_notes_patient_id'),
        sa.ForeignKeyConstraint(['course_id'], ['treatment_courses.id'], name='fk_clinician_media_notes_course_id'),
        sa.ForeignKeyConstraint(['session_id'], ['clinical_sessions.id'], name='fk_clinician_media_notes_session_id'),
        sa.ForeignKeyConstraint(['clinician_id'], ['users.id'], name='fk_clinician_media_notes_clinician_id'),
    )
    op.create_index('ix_clinician_media_notes_patient_id', 'clinician_media_notes', ['patient_id'])
    op.create_index('ix_clinician_media_notes_clinician_id', 'clinician_media_notes', ['clinician_id'])

    # ── patient_media_uploads ─────────────────────────────────────────────────
    op.create_table(
        'patient_media_uploads',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('patient_id', sa.String(36), nullable=False),
        sa.Column('course_id', sa.String(36), nullable=True),
        sa.Column('session_id', sa.String(36), nullable=True),
        sa.Column('uploaded_by', sa.String(36), nullable=False),
        sa.Column('media_type', sa.String(20), nullable=False),         # "voice"|"video"|"text"
        sa.Column('file_ref', sa.String(512), nullable=True),
        sa.Column('file_size_bytes', sa.Integer(), nullable=True),
        sa.Column('duration_seconds', sa.Integer(), nullable=True),
        sa.Column('text_content', sa.Text(), nullable=True),
        sa.Column('patient_note', sa.String(512), nullable=True),
        sa.Column('status', sa.String(40), nullable=False, server_default='uploaded'),  # uploaded|pending_review|approved_for_analysis|analyzing|analyzed|clinician_reviewed|rejected|reupload_requested
        sa.Column('consent_id', sa.String(36), nullable=True),
        sa.Column('expires_at', sa.DateTime(), nullable=True),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['patient_id'], ['patients.id'], name='fk_patient_media_uploads_patient_id'),
        sa.ForeignKeyConstraint(['course_id'], ['treatment_courses.id'], name='fk_patient_media_uploads_course_id'),
        sa.ForeignKeyConstraint(['session_id'], ['clinical_sessions.id'], name='fk_patient_media_uploads_session_id'),
        sa.ForeignKeyConstraint(['uploaded_by'], ['users.id'], name='fk_patient_media_uploads_uploaded_by'),
        sa.ForeignKeyConstraint(['consent_id'], ['media_consents.id'], name='fk_patient_media_uploads_consent_id'),
    )
    op.create_index('ix_patient_media_uploads_patient_id', 'patient_media_uploads', ['patient_id'])
    op.create_index('ix_patient_media_uploads_course_id', 'patient_media_uploads', ['course_id'])

    # ── patient_media_transcripts ─────────────────────────────────────────────
    op.create_table(
        'patient_media_transcripts',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('upload_id', sa.String(36), nullable=False),
        sa.Column('transcript_text', sa.Text(), nullable=False),
        sa.Column('provider', sa.String(64), nullable=False),           # "whisper-1"|"whisper-local"
        sa.Column('language', sa.String(20), nullable=True),
        sa.Column('confidence', sa.Float(), nullable=True),
        sa.Column('word_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('processing_seconds', sa.Float(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['upload_id'], ['patient_media_uploads.id'], name='fk_patient_media_transcripts_upload_id'),
        sa.UniqueConstraint('upload_id', name='uq_patient_media_transcripts_upload_id'),
    )

    # ── patient_media_analysis ────────────────────────────────────────────────
    op.create_table(
        'patient_media_analysis',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('upload_id', sa.String(36), nullable=False),
        sa.Column('transcript_id', sa.String(36), nullable=True),
        sa.Column('triggered_by', sa.String(36), nullable=False),
        sa.Column('model_used', sa.String(128), nullable=False),
        sa.Column('prompt_hash', sa.String(64), nullable=False),
        sa.Column('structured_summary', sa.Text(), nullable=True),
        sa.Column('symptoms_mentioned', sa.Text(), nullable=True),      # JSON array
        sa.Column('side_effects_mentioned', sa.Text(), nullable=True),  # JSON array
        sa.Column('functional_impact', sa.Text(), nullable=True),       # JSON
        sa.Column('adherence_mentions', sa.Text(), nullable=True),      # JSON
        sa.Column('follow_up_questions', sa.Text(), nullable=True),     # JSON array
        sa.Column('chart_note_draft', sa.Text(), nullable=True),
        sa.Column('comparison_notes', sa.Text(), nullable=True),        # JSON trend notes
        sa.Column('approved_for_clinical_use', sa.Boolean(), nullable=False, server_default='0'),
        sa.Column('clinician_reviewed_at', sa.DateTime(), nullable=True),
        sa.Column('clinician_reviewer_id', sa.String(36), nullable=True),
        sa.Column('clinician_amendments', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['upload_id'], ['patient_media_uploads.id'], name='fk_patient_media_analysis_upload_id'),
        sa.ForeignKeyConstraint(['transcript_id'], ['patient_media_transcripts.id'], name='fk_patient_media_analysis_transcript_id'),
        sa.ForeignKeyConstraint(['triggered_by'], ['users.id'], name='fk_patient_media_analysis_triggered_by'),
        sa.ForeignKeyConstraint(['clinician_reviewer_id'], ['users.id'], name='fk_patient_media_analysis_clinician_reviewer_id'),
        sa.UniqueConstraint('upload_id', name='uq_patient_media_analysis_upload_id'),
    )

    # ── patient_media_review_actions ──────────────────────────────────────────
    op.create_table(
        'patient_media_review_actions',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('upload_id', sa.String(36), nullable=False),
        sa.Column('actor_id', sa.String(36), nullable=False),
        sa.Column('action', sa.String(40), nullable=False),             # "approve"|"reject"|"request_reupload"|"flag_urgent"|"mark_reviewed"
        sa.Column('reason', sa.String(512), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['upload_id'], ['patient_media_uploads.id'], name='fk_patient_media_review_actions_upload_id'),
        sa.ForeignKeyConstraint(['actor_id'], ['users.id'], name='fk_patient_media_review_actions_actor_id'),
    )
    op.create_index('ix_patient_media_review_actions_upload_id', 'patient_media_review_actions', ['upload_id'])

    # ── media_red_flags ───────────────────────────────────────────────────────
    op.create_table(
        'media_red_flags',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('upload_id', sa.String(36), nullable=True),
        sa.Column('clinician_note_id', sa.String(36), nullable=True),
        sa.Column('patient_id', sa.String(36), nullable=False),
        sa.Column('flag_type', sa.String(60), nullable=False),          # "safety_concern"|"adverse_event_signal"|"urgent_symptom"|"medication_issue"
        sa.Column('extracted_text', sa.Text(), nullable=False),
        sa.Column('severity', sa.String(20), nullable=False, server_default='medium'),  # "low"|"medium"|"high"|"critical"
        sa.Column('ai_generated', sa.Boolean(), nullable=False, server_default='1'),
        sa.Column('reviewed_at', sa.DateTime(), nullable=True),
        sa.Column('reviewed_by', sa.String(36), nullable=True),
        sa.Column('dismissed', sa.Boolean(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['upload_id'], ['patient_media_uploads.id'], name='fk_media_red_flags_upload_id'),
        sa.ForeignKeyConstraint(['clinician_note_id'], ['clinician_media_notes.id'], name='fk_media_red_flags_clinician_note_id'),
        sa.ForeignKeyConstraint(['patient_id'], ['patients.id'], name='fk_media_red_flags_patient_id'),
        sa.ForeignKeyConstraint(['reviewed_by'], ['users.id'], name='fk_media_red_flags_reviewed_by'),
    )
    op.create_index('ix_media_red_flags_patient_id', 'media_red_flags', ['patient_id'])

    # ── clinician_media_transcripts ───────────────────────────────────────────
    op.create_table(
        'clinician_media_transcripts',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('note_id', sa.String(36), nullable=False),
        sa.Column('transcript_text', sa.Text(), nullable=False),
        sa.Column('provider', sa.String(64), nullable=False),
        sa.Column('language', sa.String(20), nullable=True),
        sa.Column('word_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['note_id'], ['clinician_media_notes.id'], name='fk_clinician_media_transcripts_note_id'),
        sa.UniqueConstraint('note_id', name='uq_clinician_media_transcripts_note_id'),
    )

    # ── clinician_note_drafts ─────────────────────────────────────────────────
    op.create_table(
        'clinician_note_drafts',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('note_id', sa.String(36), nullable=False),
        sa.Column('generated_by', sa.String(128), nullable=False),
        sa.Column('prompt_hash', sa.String(64), nullable=False),
        sa.Column('session_note', sa.Text(), nullable=True),
        sa.Column('treatment_update_draft', sa.Text(), nullable=True),
        sa.Column('adverse_event_draft', sa.Text(), nullable=True),
        sa.Column('patient_friendly_summary', sa.Text(), nullable=True),
        sa.Column('task_suggestions', sa.Text(), nullable=True),        # JSON array
        sa.Column('status', sa.String(20), nullable=False, server_default='generated'),  # "generated"|"edited"|"approved"|"rejected"
        sa.Column('approved_by', sa.String(36), nullable=True),
        sa.Column('approved_at', sa.DateTime(), nullable=True),
        sa.Column('clinician_edits', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['note_id'], ['clinician_media_notes.id'], name='fk_clinician_note_drafts_note_id'),
        sa.ForeignKeyConstraint(['approved_by'], ['users.id'], name='fk_clinician_note_drafts_approved_by'),
    )
    op.create_index('ix_clinician_note_drafts_note_id', 'clinician_note_drafts', ['note_id'])


def downgrade() -> None:
    op.drop_index('ix_clinician_note_drafts_note_id', table_name='clinician_note_drafts')
    op.drop_table('clinician_note_drafts')

    op.drop_table('clinician_media_transcripts')

    op.drop_index('ix_media_red_flags_patient_id', table_name='media_red_flags')
    op.drop_table('media_red_flags')

    op.drop_index('ix_patient_media_review_actions_upload_id', table_name='patient_media_review_actions')
    op.drop_table('patient_media_review_actions')

    op.drop_table('patient_media_analysis')

    op.drop_table('patient_media_transcripts')

    op.drop_index('ix_patient_media_uploads_course_id', table_name='patient_media_uploads')
    op.drop_index('ix_patient_media_uploads_patient_id', table_name='patient_media_uploads')
    op.drop_table('patient_media_uploads')

    op.drop_index('ix_clinician_media_notes_clinician_id', table_name='clinician_media_notes')
    op.drop_index('ix_clinician_media_notes_patient_id', table_name='clinician_media_notes')
    op.drop_table('clinician_media_notes')

    op.drop_index('ix_media_consents_patient_id', table_name='media_consents')
    op.drop_table('media_consents')
