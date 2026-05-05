"""[QEEG-Plat] QEEG-105 jobs, audit, definitions cache tables.

Revision ID: 093_qeeg_105_jobs_audit_cache
Revises: 092_merge_eeg_studio_and_parallel_heads
Create Date: 2026-05-05
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "093_qeeg_105_jobs_audit_cache"
down_revision: Union[str, Sequence[str], None] = "092_merge_eeg_studio_and_parallel_heads"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "qeeg_analysis_jobs",
        sa.Column("id", sa.String(length=36), primary_key=True, nullable=False),
        sa.Column(
            "recording_id",
            sa.String(length=36),
            sa.ForeignKey("eeg_studio_recordings.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "patient_id",
            sa.String(length=36),
            sa.ForeignKey("patients.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("analysis_code", sa.String(length=120), nullable=False),
        sa.Column("params_hash", sa.String(length=64), nullable=False),
        sa.Column("params_json", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="queued"),
        sa.Column("priority", sa.String(length=16), nullable=False, server_default="normal"),
        sa.Column("estimated_runtime_sec", sa.Integer(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("result_s3_key", sa.String(length=1024), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column(
            "created_by",
            sa.String(length=36),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index(
        "ix_qeeg_analysis_jobs_recording_code",
        "qeeg_analysis_jobs",
        ["recording_id", "analysis_code"],
    )
    op.create_index(
        "ix_qeeg_analysis_jobs_status_active",
        "qeeg_analysis_jobs",
        ["status"],
        postgresql_where=sa.text("status IN ('queued','running')"),
    )
    op.create_index(
        "ix_qeeg_analysis_jobs_params_hash",
        "qeeg_analysis_jobs",
        ["params_hash"],
    )
    op.create_unique_constraint(
        "uq_qeeg_analysis_jobs_recording_code_params_hash",
        "qeeg_analysis_jobs",
        ["recording_id", "analysis_code", "params_hash"],
    )

    op.create_table(
        "qeeg_analysis_audit",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column(
            "job_id",
            sa.String(length=36),
            sa.ForeignKey("qeeg_analysis_jobs.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "user_id",
            sa.String(length=36),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("action", sa.String(length=24), nullable=False),
        sa.Column("metadata_json", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index("ix_qeeg_analysis_audit_job_id", "qeeg_analysis_audit", ["job_id"])
    op.create_index(
        "ix_qeeg_analysis_audit_user_created",
        "qeeg_analysis_audit",
        ["user_id", "created_at"],
    )

    op.create_table(
        "qeeg_analysis_definitions_cache",
        sa.Column("code", sa.String(length=120), primary_key=True, nullable=False),
        sa.Column("definition_json", sa.Text(), nullable=False),
        sa.Column(
            "last_synced_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )


def downgrade() -> None:
    op.drop_table("qeeg_analysis_definitions_cache")
    op.drop_index("ix_qeeg_analysis_audit_user_created", table_name="qeeg_analysis_audit")
    op.drop_index("ix_qeeg_analysis_audit_job_id", table_name="qeeg_analysis_audit")
    op.drop_table("qeeg_analysis_audit")
    op.drop_constraint(
        "uq_qeeg_analysis_jobs_recording_code_params_hash",
        "qeeg_analysis_jobs",
        type_="unique",
    )
    op.drop_index("ix_qeeg_analysis_jobs_params_hash", table_name="qeeg_analysis_jobs")
    op.drop_index("ix_qeeg_analysis_jobs_status_active", table_name="qeeg_analysis_jobs")
    op.drop_index("ix_qeeg_analysis_jobs_recording_code", table_name="qeeg_analysis_jobs")
    op.drop_table("qeeg_analysis_jobs")

