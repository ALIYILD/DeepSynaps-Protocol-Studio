"""merge multi-head state (104_add_rehab_wellness_complementary_tables + d1e2f3a4b5c6)

Revision ID: e1007921ea57
Revises: 104_add_rehab_wellness_complementary_tables, d1e2f3a4b5c6
Create Date: 2026-05-16 09:09:12.188612

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'e1007921ea57'
down_revision: Union[str, None] = ('104_add_rehab_wellness_complementary_tables', 'd1e2f3a4b5c6')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    pass

def downgrade() -> None:
    pass
