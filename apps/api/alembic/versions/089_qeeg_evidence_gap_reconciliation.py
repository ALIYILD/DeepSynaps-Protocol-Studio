"""qEEG Evidence Gap Reconciliation Report (QEEG-ANN3, 2026-05-02).

Per-clinic governance table that lets a clinic prove which of the five
FDA-questioned findings (per ``deepsynaps-qeeg-evidence-gaps`` memory)
have been addressed before clinical-facing release. One row per
``(clinic_id, gap_id)``; default state is ``still_active`` until the
clinic admin transitions to ``removed_from_report``,
``disclaimer_added``, or ``under_review``. Each transition emits an
audit row under ``target_type='qeeg_evidence_gap_reconciliation'``.

Why a new table (and not a column on a clinic-scoped settings row)
-----------------------------------------------------------------

The reconciliation decision needs:

* one row per (clinic, gap) — the unique constraint enforces this,
* a justification + decided_by + decided_at audit trail per row,
* a soft ref back to QEEG-ANN1 ``qeeg_report_annotations.id`` rows
  that informed the decision (CSV in ``related_annotation_ids``).

That's all governance metadata — orthogonal to any clinic-settings
table — so a dedicated table keeps the cross-coupling clean.

This migration adds ONE table:

* ``qeeg_evidence_gap_reconciliations`` — one row per
  ``(clinic_id, gap_id)``. Carries ``status`` (one of the four
  reconciliation states), optional ``justification`` (10..2000 chars
  when status != still_active), optional ``decided_by_user_id`` /
  ``decided_at`` (set only when transitioning out of still_active),
  optional ``related_annotation_ids`` (CSV of QEEGReportAnnotation
  IDs), and standard ``created_at`` / ``updated_at`` timestamps.

Indices
-------

* ``ix_qeeg_evidence_gap_reconciliations_clinic_gap`` — unique on
  (clinic_id, gap_id). Powers ``get_or_create_reconciliation`` and
  enforces one-row-per-(clinic,gap).
* ``ix_qeeg_evidence_gap_reconciliations_clinic_status`` —
  (clinic_id, status). Powers the per-clinic release-readiness query
  (counts of gaps in each status).

Why additive (no destructive changes)
-------------------------------------

The table is net-new; nothing is renamed or dropped. The QEEG-ANN1
sidecar annotations and QEEG-ANN2 outcome tracker keep working
unchanged because the new table is consumed only by the QEEG-ANN3
router (no cross-coupling).

Cross-dialect safe — every column is a plain string / text /
datetime. SQLite-friendly.

Idempotent helpers (``_has_table``) per IRB-AMD1 #446 precedent —
concurrent sessions may have run this revision ahead of us; this
guard keeps the migration idempotent so re-runs after
``alembic upgrade head`` are safe.

Revision ID: 089_qeeg_evidence_gap_reconciliation
Revises: 088_merge_heads_labs_and_phenotyping_nutrition
Create Date: 2026-05-02
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


# ── Alembic identifiers ──────────────────────────────────────────────────────

revision = "089_qeeg_evidence_gap_reconciliation"
down_revision = "088_merge_heads_labs_and_phenotyping_nutrition"
branch_labels = None
depends_on = None


TABLE_NAME = "qeeg_evidence_gap_reconciliations"
INDEX_CLINIC_GAP = "ix_qeeg_evidence_gap_reconciliations_clinic_gap"
INDEX_CLINIC_STATUS = "ix_qeeg_evidence_gap_reconciliations_clinic_status"
UNIQUE_CONSTRAINT = "uq_qeeg_evidence_gap_reconciliations_clinic_gap"


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
    if not _has_table(bind, TABLE_NAME):
        op.create_table(
            TABLE_NAME,
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("clinic_id", sa.String(64), nullable=False),
            sa.Column("gap_id", sa.String(64), nullable=False),
            sa.Column(
                "status",
                sa.String(32),
                nullable=False,
                server_default="still_active",
            ),
            sa.Column("justification", sa.Text(), nullable=True),
            sa.Column("decided_by_user_id", sa.String(64), nullable=True),
            sa.Column("decided_at", sa.DateTime(), nullable=True),
            sa.Column("related_annotation_ids", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.UniqueConstraint(
                "clinic_id", "gap_id", name=UNIQUE_CONSTRAINT
            ),
        )

    # Indices — created separately so we can guard each independently
    # against the same "concurrent session ran ahead of us" race.
    if not _has_index(bind, TABLE_NAME, INDEX_CLINIC_GAP):
        try:
            op.create_index(
                INDEX_CLINIC_GAP,
                TABLE_NAME,
                ["clinic_id", "gap_id"],
                unique=False,
            )
        except Exception:
            # Some dialects auto-create an index for the unique
            # constraint; ignore if name collides.
            pass
    if not _has_index(bind, TABLE_NAME, INDEX_CLINIC_STATUS):
        op.create_index(
            INDEX_CLINIC_STATUS,
            TABLE_NAME,
            ["clinic_id", "status"],
            unique=False,
        )


def downgrade() -> None:
    bind = op.get_bind()
    if not _has_table(bind, TABLE_NAME):
        return
    for idx in (INDEX_CLINIC_GAP, INDEX_CLINIC_STATUS):
        try:
            op.drop_index(idx, table_name=TABLE_NAME)
        except Exception:
            pass
    try:
        op.drop_table(TABLE_NAME)
    except Exception:
        pass
