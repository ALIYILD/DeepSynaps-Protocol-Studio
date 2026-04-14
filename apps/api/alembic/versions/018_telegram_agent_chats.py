"""Telegram pending links and user chat bindings for AI agent bots

Revision ID: 018_telegram_agent_chats
Revises: 017_patient_home_program_task_completions
Create Date: 2026-04-13
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "018_telegram_agent_chats"
down_revision = "017_patient_home_program_task_completions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "telegram_pending_links",
        sa.Column("code", sa.String(length=8), primary_key=True, nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False, index=True),
        sa.Column("user_role", sa.String(length=32), nullable=False),
        sa.Column("bot_kind", sa.String(length=16), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_tg_pending_expires", "telegram_pending_links", ["expires_at"])
    op.create_table(
        "telegram_user_chats",
        sa.Column("id", sa.String(length=36), primary_key=True, nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False, index=True),
        sa.Column("chat_id", sa.String(length=32), nullable=False),
        sa.Column("bot_kind", sa.String(length=16), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("user_id", "bot_kind", name="uq_tg_user_bot_kind"),
    )


def downgrade() -> None:
    op.drop_table("telegram_user_chats")
    op.drop_table("telegram_pending_links")
