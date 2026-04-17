"""Add scheduling fields to clinical_sessions: appointment_type, room/device, audit timestamps, conflict support

Revision ID: 021_scheduling_fields
Revises: 020_assessment_governance_fields
Create Date: 2026-04-16

Changes:
  - clinical_sessions.appointment_type  : varchar(50)  default 'session'
  - clinical_sessions.room_id           : varchar(100) nullable
  - clinical_sessions.device_id         : varchar(100) nullable
  - clinical_sessions.confirmed_at      : varchar(50)  nullable
  - clinical_sessions.checked_in_at     : varchar(50)  nullable
  - clinical_sessions.completed_at      : varchar(50)  nullable
  - clinical_sessions.cancelled_at      : varchar(50)  nullable
  - clinical_sessions.cancel_reason     : varchar(500) nullable
  - clinical_sessions.rescheduled_from  : varchar(100) nullable
  - indexes on (room_id), (device_id), (appointment_type)

SQLite-compatible: all columns are nullable or have server defaults.
"""
from alembic import op
import sqlalchemy as sa


revision = "021_scheduling_fields"
down_revision = "020_assessment_governance_fields"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("clinical_sessions") as batch_op:
        batch_op.add_column(sa.Column("appointment_type", sa.String(50), nullable=False, server_default="session"))
        batch_op.add_column(sa.Column("room_id", sa.String(100), nullable=True))
        batch_op.add_column(sa.Column("device_id", sa.String(100), nullable=True))
        batch_op.add_column(sa.Column("confirmed_at", sa.String(50), nullable=True))
        batch_op.add_column(sa.Column("checked_in_at", sa.String(50), nullable=True))
        batch_op.add_column(sa.Column("completed_at", sa.String(50), nullable=True))
        batch_op.add_column(sa.Column("cancelled_at", sa.String(50), nullable=True))
        batch_op.add_column(sa.Column("cancel_reason", sa.String(500), nullable=True))
        batch_op.add_column(sa.Column("rescheduled_from", sa.String(100), nullable=True))

    op.create_index("ix_clinical_sessions_room_id", "clinical_sessions", ["room_id"])
    op.create_index("ix_clinical_sessions_device_id", "clinical_sessions", ["device_id"])
    op.create_index("ix_clinical_sessions_appointment_type", "clinical_sessions", ["appointment_type"])


def downgrade() -> None:
    op.drop_index("ix_clinical_sessions_appointment_type", table_name="clinical_sessions")
    op.drop_index("ix_clinical_sessions_device_id", table_name="clinical_sessions")
    op.drop_index("ix_clinical_sessions_room_id", table_name="clinical_sessions")
    with op.batch_alter_table("clinical_sessions") as batch_op:
        batch_op.drop_column("rescheduled_from")
        batch_op.drop_column("cancel_reason")
        batch_op.drop_column("cancelled_at")
        batch_op.drop_column("completed_at")
        batch_op.drop_column("checked_in_at")
        batch_op.drop_column("confirmed_at")
        batch_op.drop_column("device_id")
        batch_op.drop_column("room_id")
        batch_op.drop_column("appointment_type")
