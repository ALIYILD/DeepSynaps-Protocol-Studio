"""Merge agent_configs branch back into main head.

Restored ``100_agent_configs`` (see sibling file) re-introduced a divergent
head off ``b5278dd39fee`` after the original file was removed from the
source tree while production was still stamped at it. This empty merge
folds it into the consent/retention head ``a1b2c3d4e5f6`` so the tree has
exactly one head again and ``alembic upgrade head`` resolves deterministically.

No DDL — this is a pure DAG reconciliation.

Revision ID: d8e7f6a5b4c3
Revises: 100_agent_configs, a1b2c3d4e5f6
Create Date: 2026-05-14
"""
from __future__ import annotations

from typing import Sequence, Union

# pylint: disable=unused-import
from alembic import op  # noqa: F401
import sqlalchemy as sa  # noqa: F401


revision: str = "d8e7f6a5b4c3"
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
