"""Merge parallel 061 heads

Revision ID: beaf9a56faac
Revises: 061_add_room_and_device_resources, 061_composite_indexes
Create Date: 2026-04-30 10:45:01.368166

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'beaf9a56faac'
down_revision: Union[str, None] = ('061_add_room_and_device_resources', '061_composite_indexes')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    pass

def downgrade() -> None:
    pass
