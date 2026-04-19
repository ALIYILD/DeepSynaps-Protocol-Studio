"""Clinician-authored home task templates.

Revision ID: 029_home_task_templates
Revises: 028_literature_curation
Create Date: 2026-04-19

Backs the "Templates" tab on the Tasks page
(`pgHomePrograms` in `apps/web/src/pages-clinical-tools.js`).

Replaces the previous `localStorage['ds_home_task_templates']`-only path so
clinician-saved templates survive device switches. The bundled
DEFAULT_TEMPLATES + CONDITION_HOME_TEMPLATES remain read-only starter
content; rows in this table are user-editable. Routes live at
`/api/v1/home-task-templates*` in
`apps/api/app/routers/home_task_templates_router.py`.

Mirrors the document_templates pattern (027_document_templates) for
consistency, but stores the body as a JSON payload (rather than markdown)
because a task template carries multiple structured fields.
"""
from alembic import op
import sqlalchemy as sa


revision = "029_home_task_templates"
down_revision = "028_literature_curation"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "home_task_templates",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("owner_id", sa.String(64), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("payload_json", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index(
        "ix_home_task_templates_owner_id", "home_task_templates", ["owner_id"]
    )
    op.create_index(
        "ix_home_task_templates_owner_updated",
        "home_task_templates",
        ["owner_id", "updated_at"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_home_task_templates_owner_updated", table_name="home_task_templates"
    )
    op.drop_index(
        "ix_home_task_templates_owner_id", table_name="home_task_templates"
    )
    op.drop_table("home_task_templates")
