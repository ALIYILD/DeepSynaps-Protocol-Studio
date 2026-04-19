"""Session recordings — minimal media-storage MVP.

Revision ID: 030_session_recordings
Revises: 029_home_task_templates
Create Date: 2026-04-19

Backs the Virtual Care Recording Studio playback button. Stores audio / video
session recordings on the local Fly volume under
`{media_storage_root}/recordings/{owner_id}/{recording_id}` and exposes them
through `/api/v1/recordings*` (clinician-owned, multipart upload, byte-range
streaming download).
"""
from alembic import op
import sqlalchemy as sa


revision = "030_session_recordings"
down_revision = "029_home_task_templates"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "session_recordings",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("owner_clinician_id", sa.String(64), nullable=False),
        sa.Column("patient_id", sa.String(64), nullable=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("file_path", sa.String(512), nullable=False),
        sa.Column("mime_type", sa.String(80), nullable=False),
        sa.Column("byte_size", sa.BigInteger(), nullable=False),
        sa.Column("duration_seconds", sa.Integer(), nullable=True),
        sa.Column("uploaded_at", sa.DateTime(), nullable=False),
    )
    op.create_index(
        "ix_session_recordings_owner",
        "session_recordings",
        ["owner_clinician_id"],
    )
    op.create_index(
        "ix_session_recordings_owner_patient",
        "session_recordings",
        ["owner_clinician_id", "patient_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_session_recordings_owner_patient", table_name="session_recordings")
    op.drop_index("ix_session_recordings_owner", table_name="session_recordings")
    op.drop_table("session_recordings")
