"""Custom document templates owned by clinicians.

Revision ID: 027_document_templates
Revises: 026_assessments_golive
Create Date: 2026-04-19

Backs the "+ New Template" button in the Documents Hub
(`apps/web/src/pages-clinical-hubs.js` → `pgDocumentsHubNew`, Templates tab).
The bundled DOCUMENT_TEMPLATES in `apps/web/src/documents-templates.js`
remain read-only starter content; rows in this table are user-editable.
Routes live at `/api/v1/documents/templates*` in
`apps/api/app/routers/documents_router.py`.
"""
from alembic import op
import sqlalchemy as sa


revision = "027_document_templates"
down_revision = "026_assessments_golive"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "document_templates",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("owner_id", sa.String(64), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("doc_type", sa.String(40), nullable=False, server_default="letter"),
        sa.Column("body_markdown", sa.Text(), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index(
        "ix_document_templates_owner_id", "document_templates", ["owner_id"]
    )
    op.create_index(
        "ix_document_templates_owner_updated",
        "document_templates",
        ["owner_id", "updated_at"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_document_templates_owner_updated", table_name="document_templates"
    )
    op.drop_index("ix_document_templates_owner_id", table_name="document_templates")
    op.drop_table("document_templates")
