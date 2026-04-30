"""Merge heads: adverse_events_classification + qeeg_report_payload

Revision ID: 43055a261739
Revises: 064_adverse_events_classification, 064_qeeg_report_payload
Create Date: 2026-04-30 17:11:41.087197

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '43055a261739'
down_revision: Union[str, None] = ('064_adverse_events_classification', '064_qeeg_report_payload')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    pass

def downgrade() -> None:
    pass
