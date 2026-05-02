"""Merge heads: 085_merge_heads_labs + 087_merge_heads_digital_phenotyping_and_nutrition

Revision ID: 088_merge_heads_labs_and_phenotyping_nutrition
Revises: 085_merge_heads_labs, 087_merge_heads_digital_phenotyping_and_nutrition
Create Date: 2026-05-02 18:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "088_merge_heads_labs_and_phenotyping_nutrition"
down_revision: Union[str, None] = (
    "085_merge_heads_labs",
    "087_merge_heads_digital_phenotyping_and_nutrition",
)
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
