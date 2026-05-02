"""Add ``audio_analyses`` for DeepSynaps Voice/Audio analyzer pipeline results.

Revision ID: 080_audio_analyses_table
Revises: 079_caregiver_preferred_channel
Create Date: 2026-05-02
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "080_audio_analyses_table"
down_revision = "079_caregiver_preferred_channel"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "audio_analyses",
        sa.Column("analysis_id", sa.String(36), primary_key=True, nullable=False),
        sa.Column("patient_id", sa.Text(), nullable=True),
        sa.Column("session_id", sa.String(64), nullable=True),
        sa.Column("run_id", sa.String(64), nullable=True),
        sa.Column("input_path", sa.Text(), nullable=True),
        sa.Column("file_hash_sha256", sa.String(64), nullable=True),
        sa.Column("status", sa.String(16), nullable=False, server_default="completed"),
        sa.Column("voice_report_json", sa.Text(), nullable=True),
        sa.Column("run_context_json", sa.Text(), nullable=True),
        sa.Column("pipeline_version", sa.String(32), nullable=True),
        sa.Column("norm_db_version", sa.String(32), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_audio_analyses_patient_id", "audio_analyses", ["patient_id"])
    op.create_index("ix_audio_analyses_session_id", "audio_analyses", ["session_id"])
    op.create_index("ix_audio_analyses_run_id", "audio_analyses", ["run_id"])
    op.create_index("ix_audio_analyses_file_hash", "audio_analyses", ["file_hash_sha256"])
    op.create_index("ix_audio_analyses_created_at", "audio_analyses", ["created_at"])


def downgrade() -> None:
    op.drop_table("audio_analyses")
