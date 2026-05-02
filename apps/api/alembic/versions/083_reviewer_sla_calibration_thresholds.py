"""Reviewer SLA Calibration Thresholds (IRB-AMD4, 2026-05-02).

Closes section I rec from the IRB Amendment Reviewer Workload Outcome
Tracker (IRB-AMD3, #451):

* IRB-AMD2 (#447) emits ``irb_reviewer_sla.queue_breach_detected``
  rows when a reviewer falls behind.
* IRB-AMD3 (#451) pairs each breach with the same reviewer's NEXT
  ``irb.amendment_decided_*`` row and computes a per-reviewer
  ``calibration_score = (within_sla - still_pending) / max(total -
  pending, 1)``.
* THIS migration adds the durable calibration-floor table the
  IRB-AMD4 Reviewer SLA Calibration Threshold Tuning Advisor reads
  on each call so admins can adopt a "below this score, auto-reassign
  away from this reviewer" floor without a code-and-deploy cycle.

This migration adds ONE table:

* ``reviewer_sla_calibration_thresholds`` — one row per ``(clinic_id,
  threshold_key)``. Carries ``threshold_value`` (Float), an
  ``auto_reassign_enabled`` boolean (recommend-only vs hard-gate),
  optional ``adopted_by_user_id`` for provenance, optional
  ``justification`` (10-500 chars per the adopt API), and standard
  ``created_at`` / ``updated_at`` timestamps.

Why additive (no destructive changes)
-------------------------------------
The table is net-new; nothing is renamed or dropped. IRB-AMD3 keeps
working unchanged because the new table is consumed only by the
IRB-AMD4 advisor router (no cross-coupling). Defaults are absent —
a missing row means "no calibration floor adopted yet".

Cross-dialect safe — every column is a plain string / float / boolean.
SQLite-friendly. Soft FK to ``users.id`` / ``clinics.id`` so deleting
a user/clinic does not cascade-clear historic threshold rows (audit
hygiene — same convention as CSAHP6 / DCRO3 rows).

Idempotent helpers (``_has_table``) per IRB-AMD1 #446 precedent —
concurrent sessions may have run this revision ahead of us; this
guard keeps the migration idempotent so re-runs after
``alembic upgrade head`` are safe.

Revision ID: 083_reviewer_sla_calibration_thresholds
Revises: 082_irb_amendment_workflow
Create Date: 2026-05-02
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


# ── Alembic identifiers ──────────────────────────────────────────────────────

revision = "083_reviewer_sla_calibration_thresholds"
down_revision = "082_irb_amendment_workflow"
branch_labels = None
depends_on = None


TABLE_NAME = "reviewer_sla_calibration_thresholds"
INDEX_NAME = "ix_reviewer_sla_calibration_thresholds_clinic_id"


def _has_table(bind: sa.engine.Engine, name: str) -> bool:
    insp = sa.inspect(bind)
    try:
        return name in set(insp.get_table_names())
    except Exception:
        return False


def _has_index(bind: sa.engine.Engine, table: str, index: str) -> bool:
    insp = sa.inspect(bind)
    try:
        return index in {i["name"] for i in insp.get_indexes(table)}
    except Exception:
        return False


def upgrade() -> None:
    bind = op.get_bind()

    # Defensive: only create when the table is not already present.
    # Concurrent sessions may have run this revision ahead of us; this
    # guard keeps the migration idempotent so re-runs after
    # ``alembic upgrade head`` are safe.
    if _has_table(bind, TABLE_NAME):
        return

    op.create_table(
        TABLE_NAME,
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column(
            "clinic_id",
            sa.String(64),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "threshold_key",
            sa.String(64),
            nullable=False,
        ),
        sa.Column(
            "threshold_value",
            sa.Float(),
            nullable=False,
        ),
        sa.Column(
            "auto_reassign_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column(
            "adopted_by_user_id",
            sa.String(64),
            nullable=True,
        ),
        sa.Column(
            "justification",
            sa.Text(),
            nullable=True,
        ),
        sa.Column("created_at", sa.String(64), nullable=False),
        sa.Column("updated_at", sa.String(64), nullable=False),
        sa.UniqueConstraint(
            "clinic_id",
            "threshold_key",
            name="uq_reviewer_sla_calibration_thresholds_clinic_key",
        ),
    )


def downgrade() -> None:
    bind = op.get_bind()
    if not _has_table(bind, TABLE_NAME):
        return
    try:
        op.drop_table(TABLE_NAME)
    except Exception:
        pass
