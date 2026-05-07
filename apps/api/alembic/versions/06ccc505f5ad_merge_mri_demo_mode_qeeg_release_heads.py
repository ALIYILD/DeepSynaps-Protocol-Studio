"""merge mri demo mode + qeeg release heads

Revision ID: 06ccc505f5ad
Revises: 094_add_mri_analysis_demo_mode, 094_merge_qeeg_release_heads
Create Date: 2026-05-07 16:43:55.929757

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '06ccc505f5ad'
down_revision: Union[str, None] = ('094_add_mri_analysis_demo_mode', '094_merge_qeeg_release_heads')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    pass

def downgrade() -> None:
    pass
