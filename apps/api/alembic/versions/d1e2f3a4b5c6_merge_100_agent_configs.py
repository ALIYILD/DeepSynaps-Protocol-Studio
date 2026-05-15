"""Merge ``100_agent_configs`` with current head.

The ``100_agent_configs`` revision was previously applied to the production
database from a pre-merge build, but its migration file was never landed on
``main``. The file has been restored verbatim from the deployed image; this
empty merge bridges it back to the current single head so ``alembic heads``
returns one revision and future deploys can stamp cleanly.

Revision ID: d1e2f3a4b5c6
Revises: 100_agent_configs, a1b2c3d4e5f6
Create Date: 2026-05-14
"""
from __future__ import annotations

from typing import Sequence, Union

revision: str = "d1e2f3a4b5c6"
down_revision: Union[str, Sequence[str], None] = ("100_agent_configs", "a1b2c3d4e5f6")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
