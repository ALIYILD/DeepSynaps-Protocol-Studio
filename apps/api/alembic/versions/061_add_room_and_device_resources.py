"""add room_resources and device_resources tables

Revision ID: 061_add_room_and_device_resources
Revises: 060_qeeg_analysis_medication_confounds
Create Date: 2026-04-30
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "061_add_room_and_device_resources"
down_revision = "060_qeeg_analysis_medication_confounds"
branch_labels = None
depends_on = None


def _has_table(bind, table_name: str) -> bool:
    inspector = sa.inspect(bind)
    return table_name in inspector.get_table_names()


def upgrade() -> None:
    bind = op.get_bind()

    if not _has_table(bind, "room_resources"):
        op.create_table(
            "room_resources",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("clinic_id", sa.String(36), sa.ForeignKey("clinics.id", ondelete="CASCADE"), nullable=False),
            sa.Column("name", sa.String(100), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("modalities", sa.Text(), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default="1"),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_room_resources_clinic_id", "room_resources", ["clinic_id"])

    if not _has_table(bind, "device_resources"):
        op.create_table(
            "device_resources",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("clinic_id", sa.String(36), sa.ForeignKey("clinics.id", ondelete="CASCADE"), nullable=False),
            sa.Column("name", sa.String(100), nullable=False),
            sa.Column("device_type", sa.String(60), nullable=False),
            sa.Column("serial_number", sa.String(100), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default="1"),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_device_resources_clinic_id", "device_resources", ["clinic_id"])


def downgrade() -> None:
    bind = op.get_bind()
    if _has_table(bind, "device_resources"):
        op.drop_table("device_resources")
    if _has_table(bind, "room_resources"):
        op.drop_table("room_resources")
