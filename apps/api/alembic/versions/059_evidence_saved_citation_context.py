"""add evidence saved citation context columns

Revision ID: 059_evidence_saved_citation_context
Revises: 8ad27122fb00
Create Date: 2026-04-29
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "059_evidence_saved_citation_context"
down_revision = "8ad27122fb00"
branch_labels = None
depends_on = None


def _has_table(bind, table_name: str) -> bool:
    try:
        return table_name in sa.inspect(bind).get_table_names()
    except Exception:
        return False


def _has_column(bind, table_name: str, column_name: str) -> bool:
    try:
        cols = sa.inspect(bind).get_columns(table_name)
        return any(col["name"] == column_name for col in cols)
    except Exception:
        return False


def upgrade() -> None:
    bind = op.get_bind()
    # Defensive: if the parent table was never created on this DB (e.g. a
    # fresh sqlite that hasn't yet run the migration that creates it), skip
    # the column adds. The table will be created by SQLAlchemy create_all
    # on first request and the columns will already be present from the
    # ORM model. This avoids a hard fail on alembic upgrade head when the
    # migration history is sparse.
    if not _has_table(bind, "evidence_saved_citations"):
        return
    for name, length in (
        ("context_kind", 32),
        ("analysis_id", 64),
        ("report_id", 64),
    ):
        if not _has_column(bind, "evidence_saved_citations", name):
            op.add_column("evidence_saved_citations", sa.Column(name, sa.String(length), nullable=True))
            op.create_index(f"ix_evidence_saved_citations_{name}", "evidence_saved_citations", [name], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    if not _has_table(bind, "evidence_saved_citations"):
        return
    for name in ("report_id", "analysis_id", "context_kind"):
        if _has_column(bind, "evidence_saved_citations", name):
            op.drop_index(f"ix_evidence_saved_citations_{name}", table_name="evidence_saved_citations")
            op.drop_column("evidence_saved_citations", name)
