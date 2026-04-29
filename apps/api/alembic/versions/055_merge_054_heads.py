"""Merge the two parallel 054-tier merge nodes.

Both `054_merge_053_heads` and `c0b935c5df54` were authored independently
to resolve the same 053 split. They each landed on main and re-introduced
the multi-head condition. This empty node collapses them.
"""

from __future__ import annotations

revision = "055_merge_054_heads"
down_revision = ("054_merge_053_heads", "c0b935c5df54")
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
