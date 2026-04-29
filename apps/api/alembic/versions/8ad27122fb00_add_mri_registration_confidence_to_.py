"""add_mri_registration_confidence_to_fusion_case

Revision ID: 8ad27122fb00
Revises: 058_qeeg_raw_workbench
Create Date: 2026-04-29 11:09:06.455951

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '8ad27122fb00'
down_revision: Union[str, None] = '058_qeeg_raw_workbench'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    op.add_column(
        "fusion_cases",
        sa.Column("mri_registration_confidence", sa.String(16), nullable=True),
    )

def downgrade() -> None:
    op.drop_column("fusion_cases", "mri_registration_confidence")
