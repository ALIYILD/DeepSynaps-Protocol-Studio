"""Merge fusion_workbench and deeptwin_persistence heads

Revision ID: 906b9b89a619
Revises: 054_fusion_workbench, 063_add_deeptwin_persistence
Create Date: 2026-04-30 10:15:37.884940

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '906b9b89a619'
down_revision: Union[str, None] = ('054_fusion_workbench', '063_add_deeptwin_persistence')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    pass

def downgrade() -> None:
    pass
