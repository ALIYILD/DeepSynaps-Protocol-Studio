"""Merge heads: 084_merge_heads_movement_and_reviewer_sla + 084_qeeg_report_annotations

Revision ID: 085_merge_heads_qeeg_annotations_and_movement_sla
Revises: 084_merge_heads_movement_and_reviewer_sla, 084_qeeg_report_annotations
Create Date: 2026-05-02 15:10:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "085_merge_heads_qeeg_annotations_and_movement_sla"
down_revision: Union[str, None] = (
    "084_merge_heads_movement_and_reviewer_sla",
    "084_qeeg_report_annotations",
)
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
