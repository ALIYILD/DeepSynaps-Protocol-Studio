"""Merge heads: 081_risk_analyzer_formulation + 088_merge_heads_labs_and_phenotyping_nutrition

Revision ID: 089_merge_heads_risk_analyzer
Revises: 081_risk_analyzer_formulation, 088_merge_heads_labs_and_phenotyping_nutrition
Create Date: 2026-05-02 18:30:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "089_merge_heads_risk_analyzer"
down_revision: Union[str, None] = (
    "081_risk_analyzer_formulation",
    "088_merge_heads_labs_and_phenotyping_nutrition",
)
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
