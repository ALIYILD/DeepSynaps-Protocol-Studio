"""Admin-configurable AI Practice Agent skills.

Revision ID: 031_agent_skills
Revises: 029_home_task_templates
Create Date: 2026-04-19

Backs the AI Practice Agents page (`pgAgentChat` in
`apps/web/src/pages-agents.js`). Replaces the hard-coded SKILL_CATEGORIES +
CLINICIAN_SKILLS arrays so admins can configure the skill catalogue without
a code change. The bundled CLINICIAN_SKILLS constant is kept in the bundle
as a read-only fallback for offline / API-down scenarios — rows in this
table are the source of truth otherwise.

`run_payload_json` is intentionally free-form (e.g. prompt template +
optional tool calls) so the schema can evolve without future migrations.

Seeds the existing default CLINICIAN_SKILLS rows on first upgrade so the
existing UX is preserved out of the box. The runtime seed in
`app.services.agent_skills_seed.seed_default_agent_skills` covers
non-alembic schema bootstraps (e.g. tests using `Base.metadata.create_all`).
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "031_agent_skills"
down_revision = "029_home_task_templates"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "agent_skills",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("category_id", sa.String(40), nullable=False),
        sa.Column("label", sa.String(120), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("icon", sa.String(16), nullable=False, server_default=""),
        sa.Column("run_payload_json", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_agent_skills_category_id", "agent_skills", ["category_id"])
    op.create_index("ix_agent_skills_sort_order", "agent_skills", ["sort_order"])

    # Seed the bundled CLINICIAN_SKILLS so existing UX is preserved on first
    # boot. Importing the seed module keeps the row definitions in one place
    # (also re-used by the runtime startup hook for non-alembic schemas).
    from app.services.agent_skills_seed import default_agent_skill_rows

    rows = default_agent_skill_rows()
    if rows:
        agent_skills = sa.table(
            "agent_skills",
            sa.column("id", sa.String),
            sa.column("category_id", sa.String),
            sa.column("label", sa.String),
            sa.column("description", sa.Text),
            sa.column("icon", sa.String),
            sa.column("run_payload_json", sa.Text),
            sa.column("enabled", sa.Boolean),
            sa.column("sort_order", sa.Integer),
            sa.column("created_at", sa.DateTime),
            sa.column("updated_at", sa.DateTime),
        )
        op.bulk_insert(agent_skills, rows)


def downgrade() -> None:
    op.drop_index("ix_agent_skills_sort_order", table_name="agent_skills")
    op.drop_index("ix_agent_skills_category_id", table_name="agent_skills")
    op.drop_table("agent_skills")
