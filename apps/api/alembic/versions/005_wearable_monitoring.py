"""Add wearable monitoring tables

Revision ID: 005_wearable_monitoring
Revises: 004_patient_invites_messages
Create Date: 2026-04-10
"""
from alembic import op
import sqlalchemy as sa

revision = '005_wearable_monitoring'
down_revision = '004_patient_invites_messages'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── device_connections ────────────────────────────────────────────────────
    op.create_table(
        'device_connections',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('patient_id', sa.String(36), nullable=False),
        sa.Column('source', sa.String(64), nullable=False),          # apple_health, fitbit, oura, android_health
        sa.Column('source_type', sa.String(32), nullable=False),     # wearable, platform, manual
        sa.Column('display_name', sa.String(128), nullable=True),    # "John's Apple Watch"
        sa.Column('status', sa.String(32), nullable=False, server_default='disconnected'),  # connected, disconnected, pending, error
        sa.Column('consent_given', sa.Boolean(), nullable=False, server_default='0'),
        sa.Column('consent_given_at', sa.DateTime(), nullable=True),
        sa.Column('connected_at', sa.DateTime(), nullable=True),
        sa.Column('last_sync_at', sa.DateTime(), nullable=True),
        sa.Column('external_device_id', sa.String(256), nullable=True),
        # Tokens stored encrypted; empty in V1 scaffold (OAuth flows added later)
        sa.Column('access_token_enc', sa.Text(), nullable=True),
        sa.Column('refresh_token_enc', sa.Text(), nullable=True),
        sa.Column('scope', sa.Text(), nullable=True),                # JSON array of granted scopes
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_device_connections_patient_id', 'device_connections', ['patient_id'])
    op.create_index('ix_device_connections_source', 'device_connections', ['source'])
    op.create_index('ix_device_connections_status', 'device_connections', ['status'])

    # ── wearable_observations ─────────────────────────────────────────────────
    op.create_table(
        'wearable_observations',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('patient_id', sa.String(36), nullable=False),
        sa.Column('connection_id', sa.String(36), nullable=True),    # FK to device_connections
        sa.Column('source', sa.String(64), nullable=False),
        sa.Column('source_type', sa.String(32), nullable=False),
        sa.Column('metric_type', sa.String(64), nullable=False),     # rhr_bpm, hrv_ms, sleep_duration_h, steps, spo2_pct, skin_temp_delta, mood_score, sleep_quality, pain_score, anxiety_score, side_effect_notes
        sa.Column('value', sa.Float(), nullable=True),
        sa.Column('value_text', sa.Text(), nullable=True),           # for non-numeric values
        sa.Column('unit', sa.String(32), nullable=True),
        sa.Column('observed_at', sa.DateTime(), nullable=False),
        sa.Column('aggregation_window', sa.String(32), nullable=True),  # point, daily, nightly, weekly
        sa.Column('quality_flag', sa.String(32), nullable=True),     # good, low_confidence, estimated, missing
        sa.Column('synced_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_wearable_observations_patient_id', 'wearable_observations', ['patient_id'])
    op.create_index('ix_wearable_observations_metric_type', 'wearable_observations', ['metric_type'])
    op.create_index('ix_wearable_observations_observed_at', 'wearable_observations', ['observed_at'])
    op.create_index('ix_wearable_observations_source', 'wearable_observations', ['source'])

    # ── wearable_daily_summaries ──────────────────────────────────────────────
    op.create_table(
        'wearable_daily_summaries',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('patient_id', sa.String(36), nullable=False),
        sa.Column('source', sa.String(64), nullable=False),
        sa.Column('date', sa.String(10), nullable=False),            # YYYY-MM-DD
        sa.Column('rhr_bpm', sa.Float(), nullable=True),
        sa.Column('hrv_ms', sa.Float(), nullable=True),
        sa.Column('sleep_duration_h', sa.Float(), nullable=True),
        sa.Column('sleep_consistency_score', sa.Float(), nullable=True),  # 0-100
        sa.Column('steps', sa.Integer(), nullable=True),
        sa.Column('spo2_pct', sa.Float(), nullable=True),
        sa.Column('skin_temp_delta', sa.Float(), nullable=True),     # degrees C above baseline
        sa.Column('readiness_score', sa.Float(), nullable=True),     # 0-100, device-native if available
        sa.Column('mood_score', sa.Float(), nullable=True),          # 1-5 patient self-report
        sa.Column('pain_score', sa.Float(), nullable=True),          # 0-10 patient self-report
        sa.Column('anxiety_score', sa.Float(), nullable=True),       # 0-10 patient self-report
        sa.Column('data_json', sa.Text(), nullable=True),            # raw extra fields as JSON
        sa.Column('synced_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_wearable_daily_summaries_patient_id', 'wearable_daily_summaries', ['patient_id'])
    op.create_index('ix_wearable_daily_summaries_date', 'wearable_daily_summaries', ['date'])
    op.create_index('ix_wearable_daily_summaries_source', 'wearable_daily_summaries', ['source'])
    # Unique per patient+source+date
    op.create_index(
        'ix_wearable_daily_summaries_patient_source_date',
        'wearable_daily_summaries',
        ['patient_id', 'source', 'date'],
        unique=True,
    )

    # ── wearable_alert_flags ──────────────────────────────────────────────────
    op.create_table(
        'wearable_alert_flags',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('patient_id', sa.String(36), nullable=False),
        sa.Column('course_id', sa.String(36), nullable=True),
        sa.Column('flag_type', sa.String(64), nullable=False),       # sleep_worsening, rhr_rising, hrv_declining, sync_gap, symptom_worsening, presession_concern
        sa.Column('severity', sa.String(16), nullable=False),        # info, warning, urgent
        sa.Column('detail', sa.Text(), nullable=True),
        sa.Column('metric_snapshot', sa.Text(), nullable=True),      # JSON of metrics that triggered the flag
        sa.Column('triggered_at', sa.DateTime(), nullable=False),
        sa.Column('reviewed_at', sa.DateTime(), nullable=True),
        sa.Column('reviewed_by', sa.String(64), nullable=True),
        sa.Column('dismissed', sa.Boolean(), nullable=False, server_default='0'),
        sa.Column('auto_generated', sa.Boolean(), nullable=False, server_default='1'),
    )
    op.create_index('ix_wearable_alert_flags_patient_id', 'wearable_alert_flags', ['patient_id'])
    op.create_index('ix_wearable_alert_flags_dismissed', 'wearable_alert_flags', ['dismissed'])
    op.create_index('ix_wearable_alert_flags_triggered_at', 'wearable_alert_flags', ['triggered_at'])
    op.create_index('ix_wearable_alert_flags_flag_type', 'wearable_alert_flags', ['flag_type'])

    # ── ai_summary_audit ──────────────────────────────────────────────────────
    op.create_table(
        'ai_summary_audit',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('patient_id', sa.String(36), nullable=False),
        sa.Column('actor_id', sa.String(64), nullable=False),
        sa.Column('actor_role', sa.String(32), nullable=False),
        sa.Column('summary_type', sa.String(32), nullable=False),    # patient_wearable, clinician_monitoring
        sa.Column('prompt_hash', sa.String(64), nullable=True),      # SHA-256 of prompt for dedup/audit
        sa.Column('response_preview', sa.Text(), nullable=True),     # first 500 chars
        sa.Column('sources_used', sa.Text(), nullable=True),         # JSON list: wearable_summary, assessments, courses
        sa.Column('model_used', sa.String(64), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_ai_summary_audit_patient_id', 'ai_summary_audit', ['patient_id'])
    op.create_index('ix_ai_summary_audit_actor_id', 'ai_summary_audit', ['actor_id'])
    op.create_index('ix_ai_summary_audit_created_at', 'ai_summary_audit', ['created_at'])


def downgrade() -> None:
    op.drop_index('ix_ai_summary_audit_created_at', table_name='ai_summary_audit')
    op.drop_index('ix_ai_summary_audit_actor_id', table_name='ai_summary_audit')
    op.drop_index('ix_ai_summary_audit_patient_id', table_name='ai_summary_audit')
    op.drop_table('ai_summary_audit')

    op.drop_index('ix_wearable_alert_flags_flag_type', table_name='wearable_alert_flags')
    op.drop_index('ix_wearable_alert_flags_triggered_at', table_name='wearable_alert_flags')
    op.drop_index('ix_wearable_alert_flags_dismissed', table_name='wearable_alert_flags')
    op.drop_index('ix_wearable_alert_flags_patient_id', table_name='wearable_alert_flags')
    op.drop_table('wearable_alert_flags')

    op.drop_index('ix_wearable_daily_summaries_patient_source_date', table_name='wearable_daily_summaries')
    op.drop_index('ix_wearable_daily_summaries_source', table_name='wearable_daily_summaries')
    op.drop_index('ix_wearable_daily_summaries_date', table_name='wearable_daily_summaries')
    op.drop_index('ix_wearable_daily_summaries_patient_id', table_name='wearable_daily_summaries')
    op.drop_table('wearable_daily_summaries')

    op.drop_index('ix_wearable_observations_source', table_name='wearable_observations')
    op.drop_index('ix_wearable_observations_observed_at', table_name='wearable_observations')
    op.drop_index('ix_wearable_observations_metric_type', table_name='wearable_observations')
    op.drop_index('ix_wearable_observations_patient_id', table_name='wearable_observations')
    op.drop_table('wearable_observations')

    op.drop_index('ix_device_connections_status', table_name='device_connections')
    op.drop_index('ix_device_connections_source', table_name='device_connections')
    op.drop_index('ix_device_connections_patient_id', table_name='device_connections')
    op.drop_table('device_connections')
