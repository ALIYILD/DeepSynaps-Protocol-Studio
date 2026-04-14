"""Patient home program task completions + feedback

Revision ID: 017_patient_home_program_task_completions
Revises: 016_home_program_server_task_id
Create Date: 2026-04-13
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "017_patient_home_program_task_completions"
down_revision = "016_home_program_server_task_id"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "patient_home_program_task_completions",
        sa.Column("id", sa.String(length=36), primary_key=True, nullable=False),
        sa.Column("server_task_id", sa.String(length=36), nullable=False),
        sa.Column("patient_id", sa.String(length=36), nullable=False),
        sa.Column("clinician_id", sa.String(length=64), nullable=False),
        sa.Column("completed", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        sa.Column("completed_at", sa.DateTime(), nullable=False),
        sa.Column("rating", sa.Integer(), nullable=True),
        sa.Column("difficulty", sa.Integer(), nullable=True),
        sa.Column("feedback_text", sa.Text(), nullable=True),
        sa.Column("feedback_json", sa.Text(), nullable=True, server_default=sa.text("'{}'")),
        sa.Column("media_upload_id", sa.String(length=36), nullable=True),
        sa.ForeignKeyConstraint(["patient_id"], ["patients.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("patient_id", "server_task_id", name="uq_pt_task_completion_patient_server_task"),
    )
    op.create_index(
        "ix_pt_task_completion_server_task_id",
        "patient_home_program_task_completions",
        ["server_task_id"],
    )
    op.create_index(
        "ix_pt_task_completion_patient_id",
        "patient_home_program_task_completions",
        ["patient_id"],
    )
    op.create_index(
        "ix_pt_task_completion_clinician_id",
        "patient_home_program_task_completions",
        ["clinician_id"],
    )
    op.create_index(
        "ix_pt_task_completion_completed_at",
        "patient_home_program_task_completions",
        ["completed_at"],
    )
    op.create_index(
        "ix_pt_task_completion_clinician_patient",
        "patient_home_program_task_completions",
        ["clinician_id", "patient_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_pt_task_completion_clinician_patient", table_name="patient_home_program_task_completions")
    op.drop_index("ix_pt_task_completion_completed_at", table_name="patient_home_program_task_completions")
    op.drop_index("ix_pt_task_completion_clinician_id", table_name="patient_home_program_task_completions")
    op.drop_index("ix_pt_task_completion_patient_id", table_name="patient_home_program_task_completions")
    op.drop_index("ix_pt_task_completion_server_task_id", table_name="patient_home_program_task_completions")
    op.drop_table("patient_home_program_task_completions")
