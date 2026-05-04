"""Merge parallel Alembic heads: EEG studio database (091) and 061 merge (beaf9a56faac).

Unifies the migration DAG so ``alembic upgrade head`` resolves to a single tip.

Revision ID: 092_merge_eeg_studio_and_parallel_heads
Revises: 091_eeg_studio_database, beaf9a56faac
Create Date: 2026-05-04
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op

revision: str = "092_merge_eeg_studio_and_parallel_heads"
down_revision: Union[str, Sequence[str], None] = (
    "091_eeg_studio_database",
    "beaf9a56faac",
)
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
