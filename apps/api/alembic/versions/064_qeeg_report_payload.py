"""add report_payload + report_payload_schema_version to qeeg_ai_reports

Phase 0 of the QEEG Brain Map go-live: persist the canonical
QEEGBrainMapReport JSON contract on each AI report row.

Revision ID: 064_qeeg_report_payload
Revises: 063_add_deeptwin_persistence
Create Date: 2026-04-30
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "064_qeeg_report_payload"
down_revision = "063_add_deeptwin_persistence"
branch_labels = None
depends_on = None


def _has_column(bind, table: str, column: str) -> bool:
    inspector = sa.inspect(bind)
    if table not in inspector.get_table_names():
        return False
    cols = {c["name"] for c in inspector.get_columns(table)}
    return column in cols


def upgrade() -> None:
    bind = op.get_bind()

    if not _has_column(bind, "qeeg_ai_reports", "report_payload"):
        op.add_column(
            "qeeg_ai_reports",
            sa.Column("report_payload", sa.Text(), nullable=True),
        )
    if not _has_column(bind, "qeeg_ai_reports", "report_payload_schema_version"):
        op.add_column(
            "qeeg_ai_reports",
            sa.Column("report_payload_schema_version", sa.String(16), nullable=True),
        )


def downgrade() -> None:
    bind = op.get_bind()

    if _has_column(bind, "qeeg_ai_reports", "report_payload_schema_version"):
        op.drop_column("qeeg_ai_reports", "report_payload_schema_version")
    if _has_column(bind, "qeeg_ai_reports", "report_payload"):
        op.drop_column("qeeg_ai_reports", "report_payload")
