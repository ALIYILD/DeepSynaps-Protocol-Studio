"""Merge restored agent_configs branch with current repo head.

This restores a previously deployed Alembic branch rooted at
``100_agent_configs`` and reconciles it with the current repository head
``a1b2c3d4e5f6``. No schema changes happen here; this migration exists
only to make the Alembic graph resolve for both fresh databases and Fly
databases already stamped to the old branch.

Revision ID: 104_merge_agent_configs_lineage
Revises: 100_agent_configs, a1b2c3d4e5f6
Create Date: 2026-05-14
"""
from __future__ import annotations

from typing import Sequence, Union


revision: str = "104_merge_agent_configs_lineage"
down_revision: Union[str, Sequence[str], None] = (
    "100_agent_configs",
    "a1b2c3d4e5f6",
)
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
