"""Patient marketplace — items catalog and orders.

Revision ID: 032_marketplace
Revises: 031_agent_skills
Create Date: 2026-04-23
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "032_marketplace"
down_revision = "031_agent_skills"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "marketplace_items",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("kind", sa.String(20), nullable=False, server_default="product"),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("provider", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("price", sa.Float(), nullable=True),
        sa.Column("price_unit", sa.String(30), nullable=True),
        sa.Column("external_url", sa.String(512), nullable=True),
        sa.Column("image_url", sa.String(512), nullable=True),
        sa.Column("tags_json", sa.Text(), nullable=True),
        sa.Column("clinical", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column("featured", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        sa.Column("created_by_clinician_id", sa.String(64), nullable=True, index=True),
        sa.Column("created_by_professional_name", sa.String(255), nullable=True),
        sa.Column("icon", sa.String(10), nullable=True),
        sa.Column("tone", sa.String(20), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.CheckConstraint("kind IN ('service','device','software')", name="ck_marketplace_items_kind"),
    )
    op.create_table(
        "marketplace_orders",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("patient_id", sa.String(36), sa.ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("item_id", sa.String(36), sa.ForeignKey("marketplace_items.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="requested"),
        sa.Column("patient_notes", sa.Text(), nullable=True),
        sa.Column("clinician_notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.CheckConstraint("status IN ('requested','approved','declined','fulfilled','cancelled')", name="ck_marketplace_orders_status"),
    )


def downgrade() -> None:
    op.drop_table("marketplace_orders")
    op.drop_table("marketplace_items")
