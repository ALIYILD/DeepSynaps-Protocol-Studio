"""Merge mri-analysis demo-mode and qeeg release heads to unblock alembic upgrade.

Origin/main has two migrations that both declare ``093_qeeg_105_jobs_audit_cache``
as their down_revision:

  - ``094_add_mri_analysis_demo_mode`` (added the ``mri_analyses.demo_mode`` column)
  - ``094_merge_qeeg_release_heads``   (a merge of 089 and 093 qEEG heads)

Result on a fresh DB: ``alembic upgrade head`` fails with "Multiple head
revisions are present for given argument 'head'", and the Fly release
command exits 255 — the API can't deploy.

This migration is the documented resolution for multi-head states (per
memory ``deepsynaps-alembic-auto-merge-normal.md``): a no-op merge whose
``down_revision`` is the tuple of the two competing heads.

Revision ID: 095_merge_mri_demo_and_qeeg_heads
Revises: 094_add_mri_analysis_demo_mode, 094_merge_qeeg_release_heads
Create Date: 2026-05-07
"""

from __future__ import annotations

from typing import Sequence, Union


revision: str = "095_merge_mri_demo_and_qeeg_heads"
down_revision: Union[str, Sequence[str], None] = (
    "094_add_mri_analysis_demo_mode",
    "094_merge_qeeg_release_heads",
)
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
