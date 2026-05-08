"""merge competing 094-tier merge heads

Revision ID: 46fc68d00dcd
Revises: 06ccc505f5ad, 095_merge_mri_demo_and_qeeg_heads
Create Date: 2026-05-07 19:41:53.488801

"""
from typing import Sequence, Union


revision: str = '46fc68d00dcd'
down_revision: Union[str, None] = ('06ccc505f5ad', '095_merge_mri_demo_and_qeeg_heads')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    pass

def downgrade() -> None:
    pass
