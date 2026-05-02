"""Merge heads: 085_digital_phenotyping_observations + 085_merge_heads_qeeg_annotations_and_movement_sla

Revision ID: 086_merge_heads_digital_phenotyping_and_qeeg_movement_sla
Revises: 085_digital_phenotyping_observations, 085_merge_heads_qeeg_annotations_and_movement_sla
Create Date: 2026-05-02 16:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "086_merge_heads_digital_phenotyping_and_qeeg_movement_sla"
down_revision: Union[str, None] = (
    "085_digital_phenotyping_observations",
    "085_merge_heads_qeeg_annotations_and_movement_sla",
)
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
