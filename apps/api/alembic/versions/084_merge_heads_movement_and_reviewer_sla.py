"""Merge heads: movement_analyzer_tables + reviewer_sla_calibration_thresholds

Revision ID: 084_merge_heads_movement_and_reviewer_sla
Revises: 083_movement_analyzer_tables, 083_reviewer_sla_calibration_thresholds
Create Date: 2026-05-02 14:35:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "084_merge_heads_movement_and_reviewer_sla"
down_revision: Union[str, None] = (
    "083_movement_analyzer_tables",
    "083_reviewer_sla_calibration_thresholds",
)
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
