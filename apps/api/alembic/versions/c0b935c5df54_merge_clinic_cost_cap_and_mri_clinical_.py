"""merge clinic_cost_cap and mri_clinical_workbench

Revision ID: c0b935c5df54
Revises: 053_clinic_cost_cap, 053_mri_clinical_workbench
Create Date: 2026-04-28 17:26:06.288561

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'c0b935c5df54'
down_revision: Union[str, None] = ('053_clinic_cost_cap', '053_mri_clinical_workbench')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    pass

def downgrade() -> None:
    pass
