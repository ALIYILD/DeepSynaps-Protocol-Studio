"""Merge the two parallel 061-tier heads.

Two migrations were authored independently against
``060_qeeg_analysis_medication_confounds`` and re-introduced the multi-head condition:

* ``061_add_room_and_device_resources`` — RoomResource / DeviceResource tables.
* ``061_composite_indexes`` — Composite indexes for query performance.

This empty node collapses them.
"""
from __future__ import annotations

revision = "062_merge_061_heads"
down_revision = ("061_add_room_and_device_resources", "061_composite_indexes")
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
