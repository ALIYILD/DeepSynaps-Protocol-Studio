"""Merge heads: 086_merge_heads_digital_phenotyping_* + 086_merge_heads_nutrition_*

Revision ID: 087_merge_heads_digital_phenotyping_and_nutrition
Revises: 086_merge_heads_digital_phenotyping_and_qeeg_movement_sla, 086_merge_heads_nutrition_and_qeeg_movement_sla
Create Date: 2026-05-02 16:05:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "087_merge_heads_digital_phenotyping_and_nutrition"
down_revision: Union[str, None] = (
    "086_merge_heads_digital_phenotyping_and_qeeg_movement_sla",
    "086_merge_heads_nutrition_and_qeeg_movement_sla",
)
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
