"""sales inquiries table

Revision ID: 019_sales_inquiries
Revises: 018_telegram_agent_chats
Create Date: 2026-04-14
"""

from alembic import op
import sqlalchemy as sa


revision = "019_sales_inquiries"
down_revision = "018_telegram_agent_chats"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "sales_inquiries",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("name", sa.String(length=160), nullable=True),
        sa.Column("email", sa.String(length=320), nullable=True),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("source", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_sales_inquiries_email", "sales_inquiries", ["email"])
    op.create_index("ix_sales_inquiries_created_at", "sales_inquiries", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_sales_inquiries_created_at", table_name="sales_inquiries")
    op.drop_index("ix_sales_inquiries_email", table_name="sales_inquiries")
    op.drop_table("sales_inquiries")

