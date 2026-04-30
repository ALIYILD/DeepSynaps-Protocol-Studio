"""add medication_confounds to qeeg_analyses

Revision ID: 060_qeeg_analysis_medication_confounds
Revises: 059_evidence_saved_citation_context
Create Date: 2026-04-29
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "060_qeeg_analysis_medication_confounds"
down_revision = "059_evidence_saved_citation_context"
branch_labels = None
depends_on = None


def _has_column(bind, table_name: str, column_name: str) -> bool:
    cols = sa.inspect(bind).get_columns(table_name)
    return any(col["name"] == column_name for col in cols)


def upgrade() -> None:
    bind = op.get_bind()
    if not _has_column(bind, "qeeg_analyses", "medication_confounds"):
        op.add_column(
            "qeeg_analyses",
            sa.Column("medication_confounds", sa.Text(), nullable=True),
        )


def downgrade() -> None:
    bind = op.get_bind()
    if _has_column(bind, "qeeg_analyses", "medication_confounds"):
        op.drop_column("qeeg_analyses", "medication_confounds")
