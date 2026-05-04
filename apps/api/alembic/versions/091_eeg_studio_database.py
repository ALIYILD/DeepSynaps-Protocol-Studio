"""EEG Studio patient profile JSON + recordings / derivatives (WinEEG eegbase parity).

Revision ID: 091_eeg_studio_database
Revises: 090_merge_release_heads_for_fly_deploy
Create Date: 2026-05-04
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "091_eeg_studio_database"
down_revision = "090_merge_release_heads_for_fly_deploy"
branch_labels = None
depends_on = None


def _has_table(bind: sa.engine.Engine, name: str) -> bool:
    insp = sa.inspect(bind)
    try:
        return name in set(insp.get_table_names())
    except Exception:
        return False


def _has_column(bind: sa.engine.Engine, table: str, col: str) -> bool:
    insp = sa.inspect(bind)
    try:
        return any(c["name"] == col for c in insp.get_columns(table))
    except Exception:
        return False


def upgrade() -> None:
    bind = op.get_bind()

    if not _has_column(bind, "patients", "eeg_studio_profile_json"):
        with op.batch_alter_table("patients") as batch:
            batch.add_column(sa.Column("eeg_studio_profile_json", sa.Text(), nullable=True))

    if not _has_table(bind, "eeg_studio_profile_revisions"):
        op.create_table(
            "eeg_studio_profile_revisions",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("patient_id", sa.String(36), sa.ForeignKey("patients.id", ondelete="CASCADE"), nullable=False),
            sa.Column("snapshot_json", sa.Text(), nullable=False),
            sa.Column("editor_id", sa.String(64), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
        op.create_index(
            "ix_eeg_studio_profile_revisions_patient_id",
            "eeg_studio_profile_revisions",
            ["patient_id"],
        )

    if not _has_table(bind, "eeg_studio_recordings"):
        op.create_table(
            "eeg_studio_recordings",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("patient_id", sa.String(36), sa.ForeignKey("patients.id", ondelete="CASCADE"), nullable=False),
            sa.Column("clinician_id", sa.String(64), nullable=False),
            sa.Column("recorded_at", sa.DateTime(), nullable=False),
            sa.Column("operator_name", sa.String(255), nullable=True),
            sa.Column("equipment", sa.String(120), nullable=True),
            sa.Column("sample_rate_hz", sa.Float(), nullable=True),
            sa.Column("calibration_file_ref", sa.String(512), nullable=True),
            sa.Column("cap_model", sa.String(120), nullable=True),
            sa.Column("impedance_log_json", sa.Text(), nullable=True),
            sa.Column("raw_storage_key", sa.String(1024), nullable=False),
            sa.Column("duration_sec", sa.Float(), nullable=False, server_default="0"),
            sa.Column("metadata_json", sa.Text(), nullable=False, server_default="{}"),
            sa.Column("search_blob", sa.Text(), nullable=True),
            sa.Column("deleted_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
        op.create_index(
            "ix_eegsr_patient_recorded",
            "eeg_studio_recordings",
            ["patient_id", "recorded_at"],
        )
        op.create_index(
            "ix_eegsr_clinician",
            "eeg_studio_recordings",
            ["clinician_id"],
        )

    if not _has_table(bind, "eeg_studio_derivatives"):
        op.create_table(
            "eeg_studio_derivatives",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column(
                "recording_id",
                sa.String(36),
                sa.ForeignKey("eeg_studio_recordings.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("kind", sa.String(40), nullable=False),
            sa.Column("storage_key", sa.String(1024), nullable=False),
            sa.Column("metadata_json", sa.Text(), nullable=False, server_default="{}"),
            sa.Column("deleted_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
        op.create_index(
            "ix_eegsd_recording_kind",
            "eeg_studio_derivatives",
            ["recording_id", "kind"],
        )


def downgrade() -> None:
    bind = op.get_bind()
    if _has_table(bind, "eeg_studio_derivatives"):
        op.drop_table("eeg_studio_derivatives")
    if _has_table(bind, "eeg_studio_recordings"):
        op.drop_table("eeg_studio_recordings")
    if _has_table(bind, "eeg_studio_profile_revisions"):
        op.drop_table("eeg_studio_profile_revisions")
    if _has_column(bind, "patients", "eeg_studio_profile_json"):
        with op.batch_alter_table("patients") as batch:
            batch.drop_column("eeg_studio_profile_json")
