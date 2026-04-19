"""Literature curation table — per-user verdicts on PubMed papers (mark-relevant / promote / not-relevant)

Revision ID: 028_literature_curation
Revises: 027_document_templates
Create Date: 2026-04-19

Backs the Library "Needs review" tab triage buttons. Keyed on PMID rather than
LiteraturePaper.id because most rows surfaced by literature_watch_cron live in
the snapshot JSON only and have no LiteraturePaper row yet.

Renumbered from 027 → 028 to resolve a parallel-development collision with
027_document_templates.py (both originally branched off 026).
"""
from alembic import op
import sqlalchemy as sa


revision = "028_literature_curation"
down_revision = "027_document_templates"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "literature_curation",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("pmid", sa.String(60), nullable=False),
        sa.Column("user_id", sa.String(64), nullable=False),
        sa.Column("action", sa.String(32), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint("pmid", "user_id", name="uq_literature_curation_pmid_user"),
    )
    op.create_index("ix_literature_curation_pmid", "literature_curation", ["pmid"])
    op.create_index("ix_literature_curation_user_id", "literature_curation", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_literature_curation_user_id", table_name="literature_curation")
    op.drop_index("ix_literature_curation_pmid", table_name="literature_curation")
    op.drop_table("literature_curation")
