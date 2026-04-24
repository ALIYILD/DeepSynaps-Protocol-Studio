"""Add advanced_analyses_json column to qeeg_analyses.

Revision ID: 036_qeeg_advanced_analyses
Revises: 035_qeeg_analysis_pipeline
Create Date: 2026-04-24
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "036_qeeg_advanced_analyses"
down_revision = "035_qeeg_analysis_pipeline"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "qeeg_analyses",
        sa.Column("advanced_analyses_json", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("qeeg_analyses", "advanced_analyses_json")
