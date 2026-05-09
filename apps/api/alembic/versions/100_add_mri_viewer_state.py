"""Add MRI viewer state persistence table (DeepDive Phase 2).

Per-user viewer state (slice position, ROI visibility, overlay alpha) for
resumable MRI analysis viewing sessions. New in Phase 2/4 architecture.

Revision ID: 100_add_mri_viewer_state
Revises: 099_widen_audit_event_columns
Create Date: 2026-05-09
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "100_add_mri_viewer_state"
down_revision = "099_widen_audit_event_columns"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "mri_viewer_states",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("analysis_id", sa.String(36), nullable=False),
        sa.Column("user_id", sa.String(64), nullable=False),
        sa.Column("state_json", sa.Text(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["analysis_id"], ["mri_analyses.analysis_id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("analysis_id", "user_id", name="uq_mri_viewer_state"),
    )
    op.create_index(
        "ix_mri_viewer_states_analysis_id",
        "mri_viewer_states",
        ["analysis_id"],
        unique=False,
    )
    op.create_index(
        "ix_mri_viewer_states_user_id",
        "mri_viewer_states",
        ["user_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_mri_viewer_states_user_id", table_name="mri_viewer_states"
    )
    op.drop_index(
        "ix_mri_viewer_states_analysis_id", table_name="mri_viewer_states"
    )
    op.drop_table("mri_viewer_states")
