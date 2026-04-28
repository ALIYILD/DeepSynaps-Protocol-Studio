"""Merge migration: reconcile 048_agent_run_audit + 048_qeeg_clinical_workbench heads.

Two migrations were authored in parallel sessions, both naming themselves
revision ``048`` and both pointing back to ``047_pipeline_failure_reason``.
Alembic refuses ``upgrade head`` while two heads exist; this revision
merges them into a single ``049`` head with no schema changes of its own.
"""
from __future__ import annotations

revision = "049_merge_048_heads"
down_revision = ("048_agent_run_audit", "048_qeeg_clinical_workbench")
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
