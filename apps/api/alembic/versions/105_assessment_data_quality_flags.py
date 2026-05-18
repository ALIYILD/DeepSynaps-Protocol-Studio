"""Add data_quality_flags JSONB column to assessment_records

Revision ID: 105_assessment_data_quality_flags
Revises: e1007921ea57
Create Date: 2026-05-18 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "105_assessment_data_quality_flags"
down_revision: Union[str, None] = "e1007921ea57"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "assessment_records",
        sa.Column(
            "data_quality_flags",
            sa.JSON(),
            nullable=True,
            server_default=sa.text("'[]'"),
        ),
    )


def downgrade() -> None:
    op.drop_column("assessment_records", "data_quality_flags")
