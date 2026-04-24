"""Add outcome_events table.

Revision ID: 043_outcome_events
Revises: 042_annotations
Create Date: 2026-04-24
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "043_outcome_events"
down_revision = "042_annotations"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "outcome_events",
        sa.Column("id", sa.String(length=36), primary_key=True, nullable=False),
        sa.Column("patient_id", sa.String(length=36), nullable=False),
        sa.Column("course_id", sa.String(length=36), nullable=True),
        sa.Column("outcome_id", sa.String(length=36), nullable=True),
        sa.Column("qeeg_analysis_id", sa.String(length=36), nullable=True),
        sa.Column("mri_analysis_id", sa.String(length=36), nullable=True),
        sa.Column("assessment_id", sa.String(length=36), nullable=True),
        sa.Column("event_type", sa.String(length=40), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("severity", sa.String(length=20), nullable=False, server_default="info"),
        sa.Column("source_type", sa.String(length=40), nullable=True),
        sa.Column("source_id", sa.String(length=64), nullable=True),
        sa.Column("payload_json", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("recorded_at", sa.DateTime(), nullable=False),
        sa.Column("clinician_id", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["outcome_id"], ["outcome_series.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_outcome_events_patient_id", "outcome_events", ["patient_id"])
    op.create_index("ix_outcome_events_course_id", "outcome_events", ["course_id"])
    op.create_index("ix_outcome_events_outcome_id", "outcome_events", ["outcome_id"])
    op.create_index("ix_outcome_events_qeeg_analysis_id", "outcome_events", ["qeeg_analysis_id"])
    op.create_index("ix_outcome_events_mri_analysis_id", "outcome_events", ["mri_analysis_id"])
    op.create_index("ix_outcome_events_assessment_id", "outcome_events", ["assessment_id"])
    op.create_index("ix_outcome_events_event_type", "outcome_events", ["event_type"])
    op.create_index("ix_outcome_events_recorded_at", "outcome_events", ["recorded_at"])
    op.create_index("ix_outcome_events_clinician_id", "outcome_events", ["clinician_id"])
    op.create_index("ix_outcome_events_created_at", "outcome_events", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_outcome_events_created_at", table_name="outcome_events")
    op.drop_index("ix_outcome_events_clinician_id", table_name="outcome_events")
    op.drop_index("ix_outcome_events_recorded_at", table_name="outcome_events")
    op.drop_index("ix_outcome_events_event_type", table_name="outcome_events")
    op.drop_index("ix_outcome_events_assessment_id", table_name="outcome_events")
    op.drop_index("ix_outcome_events_mri_analysis_id", table_name="outcome_events")
    op.drop_index("ix_outcome_events_qeeg_analysis_id", table_name="outcome_events")
    op.drop_index("ix_outcome_events_outcome_id", table_name="outcome_events")
    op.drop_index("ix_outcome_events_course_id", table_name="outcome_events")
    op.drop_index("ix_outcome_events_patient_id", table_name="outcome_events")
    op.drop_table("outcome_events")
