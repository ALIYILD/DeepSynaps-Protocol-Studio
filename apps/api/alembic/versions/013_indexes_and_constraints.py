"""Add missing indexes and CHECK constraints for data integrity

Revision ID: 013_indexes_and_constraints
Revises: 012_billing_status_enum
Create Date: 2026-04-12
"""
from alembic import op
import sqlalchemy as sa

revision = '013_indexes_and_constraints'
down_revision = '012_billing_status_enum'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Missing indexes on FK columns ─────────────────────────────────────────

    # patient_media_uploads.uploaded_by → users.id (FK exists in 007, index missing)
    with op.batch_alter_table('patient_media_uploads') as batch_op:
        batch_op.create_index('ix_pmu_uploaded_by', ['uploaded_by'])

    # patient_media_analysis.triggered_by → users.id (FK exists in 007, index missing)
    # patient_media_analysis.clinician_reviewer_id → users.id (FK exists in 007, index missing)
    with op.batch_alter_table('patient_media_analysis') as batch_op:
        batch_op.create_index('ix_pma_triggered_by', ['triggered_by'])
        batch_op.create_index('ix_pma_clinician_reviewer_id', ['clinician_reviewer_id'])

    # device_session_logs.reviewed_by → users.id (no index)
    with op.batch_alter_table('device_session_logs') as batch_op:
        batch_op.create_index('ix_dsl_reviewed_by', ['reviewed_by'])

    # home_device_assignments.assigned_by → users.id (no index)
    with op.batch_alter_table('home_device_assignments') as batch_op:
        batch_op.create_index('ix_hda_assigned_by', ['assigned_by'])

    # ── CHECK constraints for enum-like string columns ────────────────────────

    # adverse_events.severity
    with op.batch_alter_table('adverse_events') as batch_op:
        batch_op.create_check_constraint(
            'ck_adverse_events_severity',
            "severity IN ('mild', 'moderate', 'severe', 'serious')",
        )

    # adverse_events.resolution
    with op.batch_alter_table('adverse_events') as batch_op:
        batch_op.create_check_constraint(
            'ck_adverse_events_resolution',
            "resolution IN ('resolved', 'ongoing', 'withdrawn')",
        )

    # patient_adherence_events.event_type
    with op.batch_alter_table('patient_adherence_events') as batch_op:
        batch_op.create_check_constraint(
            'ck_patient_adherence_events_event_type',
            "event_type IN ('adherence_report', 'side_effect', 'tolerance_change', "
            "'break_request', 'concern', 'positive_feedback')",
        )

    # device_session_logs.status
    with op.batch_alter_table('device_session_logs') as batch_op:
        batch_op.create_check_constraint(
            'ck_device_session_logs_status',
            "status IN ('pending_review', 'reviewed', 'flagged')",
        )


def downgrade() -> None:
    # Drop CHECK constraints (reverse order)
    with op.batch_alter_table('device_session_logs') as batch_op:
        batch_op.drop_constraint('ck_device_session_logs_status', type_='check')
        batch_op.drop_index('ix_dsl_reviewed_by')

    with op.batch_alter_table('patient_adherence_events') as batch_op:
        batch_op.drop_constraint('ck_patient_adherence_events_event_type', type_='check')

    with op.batch_alter_table('adverse_events') as batch_op:
        batch_op.drop_constraint('ck_adverse_events_resolution', type_='check')
        batch_op.drop_constraint('ck_adverse_events_severity', type_='check')

    with op.batch_alter_table('home_device_assignments') as batch_op:
        batch_op.drop_index('ix_hda_assigned_by')

    with op.batch_alter_table('patient_media_analysis') as batch_op:
        batch_op.drop_index('ix_pma_clinician_reviewer_id')
        batch_op.drop_index('ix_pma_triggered_by')

    with op.batch_alter_table('patient_media_uploads') as batch_op:
        batch_op.drop_index('ix_pmu_uploaded_by')
