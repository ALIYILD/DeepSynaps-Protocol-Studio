"""Add home device workflow tables

Revision ID: 008_home_device_workflows
Revises: 007_media_workflows
Create Date: 2026-04-11

Phase 1 — manual/supervised home device support:
  - device_source_registry   : extensible registry of device source types (seeded with 'manual')
  - home_device_assignments  : clinician assigns device + parameters to patient per course
  - device_session_logs      : patient-reported home sessions (pending clinician review)
  - patient_adherence_events : structured adherence, side-effect, tolerance, concern reports
  - home_device_review_flags : auto-generated flags for clinician attention
  - device_sync_events       : Phase 3 hook table for vendor adapter / HealthKit events (empty in V1)
"""
from alembic import op
import sqlalchemy as sa
from datetime import datetime, timezone

revision = '008_home_device_workflows'
down_revision = '007_media_workflows'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── device_source_registry ────────────────────────────────────────────────
    op.create_table(
        'device_source_registry',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('source_slug', sa.String(80), nullable=False, unique=True),
        sa.Column('display_name', sa.String(200), nullable=False),
        sa.Column('device_category', sa.String(80), nullable=False),
        sa.Column('manufacturer', sa.String(200), nullable=True),
        sa.Column('integration_status', sa.String(50), nullable=False, server_default='not_integrated'),
        sa.Column('adapter_class', sa.String(300), nullable=True),
        sa.Column('capabilities_json', sa.Text(), nullable=False, server_default='{}'),
        sa.Column('oauth_required', sa.Boolean(), nullable=False, server_default='0'),
        sa.Column('webhook_supported', sa.Boolean(), nullable=False, server_default='0'),
        sa.Column('documentation_url', sa.String(500), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='1'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_device_source_registry_source_slug', 'device_source_registry', ['source_slug'], unique=True)

    # Seed V1 "manual" entry — the only supported integration in Phase 1
    op.execute(
        sa.text(
            "INSERT INTO device_source_registry "
            "(id, source_slug, display_name, device_category, manufacturer, "
            " integration_status, capabilities_json, oauth_required, webhook_supported, "
            " is_active, created_at, updated_at) "
            "VALUES "
            "('00000000-0000-0000-0000-000000000001', 'manual', 'Manual Entry', 'other', NULL, "
            " 'not_integrated', '{\"session_duration\": true, \"intensity\": true, \"notes\": true}', "
            " 0, 0, 1, :now, :now)"
        ).bindparams(now=datetime.now(timezone.utc))
    )

    # ── home_device_assignments ───────────────────────────────────────────────
    op.create_table(
        'home_device_assignments',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('patient_id', sa.String(36), nullable=False),
        sa.Column('course_id', sa.String(36), nullable=True),
        sa.Column('assigned_by', sa.String(36), nullable=False),
        sa.Column('source_registry_id', sa.String(36), nullable=True),
        sa.Column('device_name', sa.String(200), nullable=False),
        sa.Column('device_model', sa.String(200), nullable=True),
        sa.Column('device_serial', sa.String(100), nullable=True),
        sa.Column('device_category', sa.String(80), nullable=False, server_default='other'),
        sa.Column('parameters_json', sa.Text(), nullable=False, server_default='{}'),
        sa.Column('instructions_text', sa.Text(), nullable=True),
        sa.Column('session_frequency_per_week', sa.Integer(), nullable=True),
        sa.Column('planned_total_sessions', sa.Integer(), nullable=True),
        sa.Column('status', sa.String(30), nullable=False, server_default='active'),
        sa.Column('revoked_at', sa.DateTime(), nullable=True),
        sa.Column('revoke_reason', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['patient_id'], ['patients.id'],
                                name='fk_home_device_assignments_patient_id', ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['course_id'], ['treatment_courses.id'],
                                name='fk_home_device_assignments_course_id', ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['source_registry_id'], ['device_source_registry.id'],
                                name='fk_home_device_assignments_registry_id'),
    )
    op.create_index('ix_home_device_assignments_patient_id', 'home_device_assignments', ['patient_id'])
    op.create_index('ix_home_device_assignments_course_id', 'home_device_assignments', ['course_id'])
    op.create_index('ix_home_device_assignments_status', 'home_device_assignments', ['status'])

    # ── device_session_logs ───────────────────────────────────────────────────
    op.create_table(
        'device_session_logs',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('assignment_id', sa.String(36), nullable=False),
        sa.Column('patient_id', sa.String(36), nullable=False),
        sa.Column('course_id', sa.String(36), nullable=True),
        sa.Column('session_date', sa.String(10), nullable=False),
        sa.Column('logged_at', sa.DateTime(), nullable=False),
        sa.Column('duration_minutes', sa.Integer(), nullable=True),
        sa.Column('completed', sa.Boolean(), nullable=False, server_default='1'),
        sa.Column('actual_intensity', sa.String(100), nullable=True),
        sa.Column('electrode_placement', sa.String(200), nullable=True),
        sa.Column('side_effects_during', sa.Text(), nullable=True),
        sa.Column('tolerance_rating', sa.Integer(), nullable=True),
        sa.Column('mood_before', sa.Integer(), nullable=True),
        sa.Column('mood_after', sa.Integer(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('media_upload_id', sa.String(36), nullable=True),
        sa.Column('status', sa.String(30), nullable=False, server_default='pending_review'),
        sa.Column('reviewed_by', sa.String(36), nullable=True),
        sa.Column('reviewed_at', sa.DateTime(), nullable=True),
        sa.Column('review_note', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['assignment_id'], ['home_device_assignments.id'],
                                name='fk_device_session_logs_assignment_id', ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['patient_id'], ['patients.id'],
                                name='fk_device_session_logs_patient_id', ondelete='CASCADE'),
    )
    op.create_index('ix_device_session_logs_assignment_id', 'device_session_logs', ['assignment_id'])
    op.create_index('ix_device_session_logs_patient_id', 'device_session_logs', ['patient_id'])
    op.create_index('ix_device_session_logs_status', 'device_session_logs', ['status'])
    op.create_index('ix_device_session_logs_session_date', 'device_session_logs', ['patient_id', 'session_date'])

    # ── patient_adherence_events ──────────────────────────────────────────────
    op.create_table(
        'patient_adherence_events',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('patient_id', sa.String(36), nullable=False),
        sa.Column('assignment_id', sa.String(36), nullable=True),
        sa.Column('course_id', sa.String(36), nullable=True),
        sa.Column('event_type', sa.String(50), nullable=False),
        sa.Column('severity', sa.String(20), nullable=True),
        sa.Column('report_date', sa.String(10), nullable=False),
        sa.Column('body', sa.Text(), nullable=True),
        sa.Column('structured_json', sa.Text(), nullable=False, server_default='{}'),
        sa.Column('media_upload_id', sa.String(36), nullable=True),
        sa.Column('status', sa.String(30), nullable=False, server_default='open'),
        sa.Column('acknowledged_by', sa.String(36), nullable=True),
        sa.Column('acknowledged_at', sa.DateTime(), nullable=True),
        sa.Column('resolution_note', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['patient_id'], ['patients.id'],
                                name='fk_patient_adherence_events_patient_id', ondelete='CASCADE'),
    )
    op.create_index('ix_patient_adherence_events_patient_id', 'patient_adherence_events', ['patient_id'])
    op.create_index('ix_patient_adherence_events_assignment_id', 'patient_adherence_events', ['assignment_id'])
    op.create_index('ix_patient_adherence_events_event_type', 'patient_adherence_events', ['event_type'])
    op.create_index('ix_patient_adherence_events_status', 'patient_adherence_events', ['status'])

    # ── home_device_review_flags ──────────────────────────────────────────────
    op.create_table(
        'home_device_review_flags',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('patient_id', sa.String(36), nullable=False),
        sa.Column('assignment_id', sa.String(36), nullable=True),
        sa.Column('session_log_id', sa.String(36), nullable=True),
        sa.Column('adherence_event_id', sa.String(36), nullable=True),
        sa.Column('course_id', sa.String(36), nullable=True),
        sa.Column('flag_type', sa.String(60), nullable=False),
        sa.Column('severity', sa.String(20), nullable=False, server_default='warning'),
        sa.Column('detail', sa.Text(), nullable=False),
        sa.Column('auto_generated', sa.Boolean(), nullable=False, server_default='1'),
        sa.Column('triggered_at', sa.DateTime(), nullable=False),
        sa.Column('reviewed_at', sa.DateTime(), nullable=True),
        sa.Column('reviewed_by', sa.String(36), nullable=True),
        sa.Column('dismissed', sa.Boolean(), nullable=False, server_default='0'),
        sa.Column('resolution', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['patient_id'], ['patients.id'],
                                name='fk_home_device_review_flags_patient_id', ondelete='CASCADE'),
    )
    op.create_index('ix_home_device_review_flags_patient_id', 'home_device_review_flags', ['patient_id'])
    op.create_index('ix_home_device_review_flags_flag_type', 'home_device_review_flags', ['flag_type'])
    op.create_index('ix_home_device_review_flags_triggered_at', 'home_device_review_flags', ['triggered_at'])
    op.create_index('ix_home_device_review_flags_dismissed', 'home_device_review_flags', ['dismissed'])

    # ── device_sync_events (Phase 3 hook — empty in V1) ──────────────────────
    op.create_table(
        'device_sync_events',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('assignment_id', sa.String(36), nullable=True),
        sa.Column('patient_id', sa.String(36), nullable=False),
        sa.Column('source_registry_id', sa.String(36), nullable=True),
        sa.Column('event_type', sa.String(50), nullable=False),
        sa.Column('event_data', sa.Text(), nullable=False, server_default='{}'),
        sa.Column('source', sa.String(80), nullable=False, server_default='manual'),
        sa.Column('occurred_at', sa.DateTime(), nullable=False),
        sa.Column('synced_at', sa.DateTime(), nullable=False),
        sa.Column('reconciled', sa.Boolean(), nullable=False, server_default='0'),
        sa.Column('reconciled_session_id', sa.String(36), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['patient_id'], ['patients.id'],
                                name='fk_device_sync_events_patient_id', ondelete='CASCADE'),
    )
    op.create_index('ix_device_sync_events_assignment_id', 'device_sync_events', ['assignment_id'])
    op.create_index('ix_device_sync_events_patient_id', 'device_sync_events', ['patient_id'])


def downgrade() -> None:
    op.drop_table('device_sync_events')
    op.drop_table('home_device_review_flags')
    op.drop_table('patient_adherence_events')
    op.drop_table('device_session_logs')
    op.drop_table('home_device_assignments')
    op.drop_table('device_source_registry')
