"""add analysis annotations table.

This migration is chained after the patient event contract branch so
annotations land on the consolidated mainline before outcome events.

Revision ID: 042_annotations
Revises: 042_patient_event_contract
Create Date: 2026-04-24 19:30:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "042_annotations"
down_revision = "042_patient_event_contract"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "analysis_annotations",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("patient_id", sa.String(length=36), nullable=False),
        sa.Column("clinician_id", sa.String(length=64), nullable=False),
        sa.Column("target_type", sa.String(length=20), nullable=False),
        sa.Column("target_id", sa.String(length=64), nullable=False),
        sa.Column("title", sa.String(length=160), nullable=True),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("anchor_label", sa.String(length=120), nullable=True),
        sa.Column("anchor_data_json", sa.Text(), nullable=True),
        sa.Column("visibility", sa.String(length=20), nullable=False, server_default="clinical"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["patient_id"], ["patients.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_analysis_annotations_patient_id", "analysis_annotations", ["patient_id"], unique=False)
    op.create_index("ix_analysis_annotations_clinician_id", "analysis_annotations", ["clinician_id"], unique=False)
    op.create_index("ix_analysis_annotations_target_type", "analysis_annotations", ["target_type"], unique=False)
    op.create_index("ix_analysis_annotations_target_id", "analysis_annotations", ["target_id"], unique=False)
    op.create_index("ix_analysis_annotations_created_at", "analysis_annotations", ["created_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_analysis_annotations_created_at", table_name="analysis_annotations")
    op.drop_index("ix_analysis_annotations_target_id", table_name="analysis_annotations")
    op.drop_index("ix_analysis_annotations_target_type", table_name="analysis_annotations")
    op.drop_index("ix_analysis_annotations_clinician_id", table_name="analysis_annotations")
    op.drop_index("ix_analysis_annotations_patient_id", table_name="analysis_annotations")
    op.drop_table("analysis_annotations")
