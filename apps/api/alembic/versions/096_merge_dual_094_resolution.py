"""Merge the two competing 094-resolution migrations.

History (this morning):

  - ``094_add_mri_analysis_demo_mode``  (down_revision: 093_qeeg_105_jobs_audit_cache)
  - ``094_merge_qeeg_release_heads``    (down_revision: 089 + 093)

Two merge migrations were authored by separate concurrent Cursor sessions to
resolve the resulting multi-head state:

  - ``06ccc505f5ad_merge_mri_demo_mode_qeeg_release_heads`` (PR #556)
      down_revision: (094_add_mri_analysis_demo_mode, 094_merge_qeeg_release_heads)
  - ``095_merge_mri_demo_and_qeeg_heads`` (PR #557)
      down_revision: (094_add_mri_analysis_demo_mode, 094_merge_qeeg_release_heads)

Both joined the same two 094 heads, so after both landed on main alembic has
two heads AGAIN: ``06ccc505f5ad`` and ``095_merge_mri_demo_and_qeeg_heads``.
Next ``alembic upgrade head`` fails with "Multiple head revisions are present"
and the Fly release_command exits 255.

This migration is the documented resolution for multi-head states (per memory
``deepsynaps-alembic-auto-merge-normal.md``): a no-op merge whose
``down_revision`` is the tuple of the two competing merge migrations.

Revision ID: 096_merge_dual_094_resolution
Revises: 06ccc505f5ad, 095_merge_mri_demo_and_qeeg_heads
Create Date: 2026-05-07
"""

from __future__ import annotations

from typing import Sequence, Union


revision: str = "096_merge_dual_094_resolution"
down_revision: Union[str, Sequence[str], None] = (
    "06ccc505f5ad",
    "095_merge_mri_demo_and_qeeg_heads",
)
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
