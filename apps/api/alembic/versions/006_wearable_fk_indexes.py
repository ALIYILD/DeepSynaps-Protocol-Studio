"""Add FK constraint and indexes to wearable tables

Revision ID: 006_wearable_fk_indexes
Revises: 005_wearable_monitoring
Create Date: 2026-04-11

Adds:
- Foreign key constraint: wearable_observations.connection_id → device_connections.id
  (ON DELETE SET NULL — orphan-safe; observation records survive device disconnection)
- Composite index on wearable_alert_flags(patient_id, triggered_at) for flag queries
- Index on wearable_observations(patient_id, observed_at) for time-range queries
"""
from alembic import op

revision = '006_wearable_fk_indexes'
down_revision = '005_wearable_monitoring'
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table('wearable_observations') as batch_op:
        batch_op.create_foreign_key(
            'fk_wearable_obs_connection_id',
            'device_connections',
            ['connection_id'], ['id'],
            ondelete='SET NULL',
        )
        batch_op.create_index(
            'ix_wearable_observations_patient_observed_at',
            ['patient_id', 'observed_at'],
        )

    with op.batch_alter_table('wearable_alert_flags') as batch_op:
        batch_op.create_index(
            'ix_wearable_alert_flags_patient_triggered',
            ['patient_id', 'triggered_at'],
        )


def downgrade() -> None:
    with op.batch_alter_table('wearable_alert_flags') as batch_op:
        batch_op.drop_index('ix_wearable_alert_flags_patient_triggered')

    with op.batch_alter_table('wearable_observations') as batch_op:
        batch_op.drop_index('ix_wearable_observations_patient_observed_at')
        batch_op.drop_constraint('fk_wearable_obs_connection_id', type_='foreignkey')
