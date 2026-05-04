"""video_assessment_sessions — guided motor video assessments MVP

Revision ID: 081_video_assessment_sessions
Revises: 080_resolver_coaching_digest_preference
Create Date: 2026-05-02

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "081_video_assessment_sessions"
down_revision: Union[str, None] = "080_resolver_coaching_digest_preference"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "video_assessment_sessions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("patient_id", sa.String(length=36), nullable=False),
        sa.Column("encounter_id", sa.String(length=64), nullable=True),
        sa.Column("protocol_name", sa.String(length=128), nullable=False),
        sa.Column("protocol_version", sa.String(length=32), nullable=False),
        sa.Column("overall_status", sa.String(length=32), nullable=False),
        sa.Column("session_json", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["patient_id"], ["patients.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint(
            "overall_status IN ('draft','in_progress','completed','finalized','cancelled')",
            name="ck_va_session_status",
        ),
    )
    op.create_index(
        "ix_video_assessment_sessions_patient_id",
        "video_assessment_sessions",
        ["patient_id"],
    )
    op.create_index(
        "ix_video_assessment_sessions_encounter_id",
        "video_assessment_sessions",
        ["encounter_id"],
    )
def downgrade() -> None:
    op.drop_index("ix_video_assessment_sessions_encounter_id", table_name="video_assessment_sessions")
    op.drop_index("ix_video_assessment_sessions_patient_id", table_name="video_assessment_sessions")
    op.drop_table("video_assessment_sessions")
