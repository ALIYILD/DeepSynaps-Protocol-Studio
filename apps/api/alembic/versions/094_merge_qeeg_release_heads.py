"""Merge remaining qEEG release heads for production deployability.

Revision ID: 094_merge_qeeg_release_heads
Revises: 089_qeeg_evidence_gap_reconciliation, 093_qeeg_105_jobs_audit_cache
Create Date: 2026-05-07
"""

from __future__ import annotations

from typing import Sequence, Union


revision: str = "094_merge_qeeg_release_heads"
down_revision: Union[str, Sequence[str], None] = (
    "089_qeeg_evidence_gap_reconciliation",
    "093_qeeg_105_jobs_audit_cache",
)
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
