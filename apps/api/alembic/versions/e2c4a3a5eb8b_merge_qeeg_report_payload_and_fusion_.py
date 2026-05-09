"""Merge qeeg_report_payload and fusion_deeptwin merge heads

Revision ID: e2c4a3a5eb8b
Revises: 906b9b89a619, 064_qeeg_report_payload
Create Date: 2026-04-30 10:17:44.479534

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'e2c4a3a5eb8b'
down_revision: Union[str, None] = ('906b9b89a619', '064_qeeg_report_payload')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    pass

def downgrade() -> None:
    pass
