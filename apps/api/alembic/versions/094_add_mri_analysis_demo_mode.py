"""Add mri_analyses.demo_mode column.

Revision ID: 094_add_mri_analysis_demo_mode
Revises: 093_qeeg_105_jobs_audit_cache
Create Date: 2026-05-07
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "094_add_mri_analysis_demo_mode"
down_revision: Union[str, Sequence[str], None] = "093_qeeg_105_jobs_audit_cache"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "mri_analyses",
        sa.Column("demo_mode", sa.Boolean(), nullable=True, default=False),
    )


def downgrade() -> None:
    op.drop_column("mri_analyses", "demo_mode")
