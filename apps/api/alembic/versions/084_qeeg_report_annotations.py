"""qEEG Brain Map Report Annotations (QEEG-ANN1, 2026-05-02).

Sidecar annotation system for qEEG Brain Map reports. Lets clinicians
attach margin notes / region tags / flag-typed findings to specific
sections of a Brain Map report WITHOUT mutating the canonical
``QEEGBrainMapReport`` contract (apps/api/app/services/qeeg_report_template.py).

Why sidecar (and not a column on ``qeeg_ai_reports``)
-----------------------------------------------------

The Brain Map report payload is a regulator-credible artifact —
every consumer (PDF exporter, web viewer, downstream summary) reads
the SAME shape via the canonical template. Inline annotations would:

* mix clinician-authored prose into the AI/template-derived report
  payload (audit-trail nightmare),
* force every consumer to evolve its schema simultaneously,
* break the cleavage between "what the report says" and "what the
  clinician thinks of what the report says".

Annotations live in a sibling table joined at render time by
``(patient_id, report_id, section_path)``.

This migration adds ONE table:

* ``qeeg_report_annotations`` — one row per annotation. Carries
  ``clinic_id``, ``patient_id`` (FK to patients with ON DELETE
  CASCADE), ``report_id``, ``section_path``, ``annotation_kind``
  ({margin_note, region_tag, flag}), optional ``flag_type``
  ({clinically_significant, evidence_gap, discuss_next_session,
  patient_question}; required when kind=flag), ``body`` (Text),
  ``created_by_user_id``, optional ``resolved_at`` /
  ``resolved_by_user_id`` / ``resolution_note``, and standard
  ``created_at`` / ``updated_at`` timestamps.

Indices
-------

* ``ix_qeeg_report_annotations_clinic_patient_report`` —
  (clinic_id, patient_id, report_id). Powers the per-report sidebar
  fetch and the per-clinic admin view.
* ``ix_qeeg_report_annotations_report_section`` —
  (report_id, section_path). Powers the section-level marker
  rendering (which sections of THIS report carry annotations?).
* ``ix_qeeg_report_annotations_created_by`` — (created_by_user_id).
  Powers the per-author "my annotations" view.

Why additive (no destructive changes)
-------------------------------------

The table is net-new; nothing is renamed or dropped. The Brain Map
PDF/web rendering paths keep working unchanged because the new table
is consumed only by the QEEG-ANN1 router (no cross-coupling).

Cross-dialect safe — every column is a plain string / text /
datetime. SQLite-friendly. Soft FK to ``users.id`` / ``clinics.id``
via the ``created_by_user_id`` / ``resolved_by_user_id`` /
``clinic_id`` columns (no ON DELETE CASCADE so historic annotations
survive user deletion — audit hygiene, same convention as IRB-AMD4
calibration thresholds).

Idempotent helpers (``_has_table``) per IRB-AMD1 #446 precedent —
concurrent sessions may have run this revision ahead of us; this
guard keeps the migration idempotent so re-runs after
``alembic upgrade head`` are safe.

Revision ID: 084_qeeg_report_annotations
Revises: 083_reviewer_sla_calibration_thresholds, 083_movement_analyzer_tables
Create Date: 2026-05-02

Multi-head merge note
---------------------

Two parallel 083 heads existed on ``origin/main`` when this PR was
opened (``083_reviewer_sla_calibration_thresholds`` from IRB-AMD4 and
``083_movement_analyzer_tables`` from the movement analyzer surface).
``deepsynaps-alembic-auto-merge-normal`` memory captures that the
expected resolution for multi-head states caused by concurrent
sessions is an empty / additive merge here. This migration BOTH adds
the new ``qeeg_report_annotations`` table AND resolves the
multi-head condition, since the two upstream branches are independent
and only need to be joined.
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


# ── Alembic identifiers ──────────────────────────────────────────────────────

revision = "084_qeeg_report_annotations"
down_revision = (
    "083_reviewer_sla_calibration_thresholds",
    "083_movement_analyzer_tables",
)
branch_labels = None
depends_on = None


TABLE_NAME = "qeeg_report_annotations"
INDEX_CLINIC_PATIENT_REPORT = "ix_qeeg_report_annotations_clinic_patient_report"
INDEX_REPORT_SECTION = "ix_qeeg_report_annotations_report_section"
INDEX_CREATED_BY = "ix_qeeg_report_annotations_created_by"


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
            sa.Column("clinic_id", sa.String(64), nullable=True, index=True),
            sa.Column(
                "patient_id",
                sa.String(36),
                # Soft FK constraint — Postgres enforces, SQLite ignores
                # the ON DELETE CASCADE clause but the application layer
                # still routes deletes through the patient cascade chain.
                sa.ForeignKey("patients.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("report_id", sa.String(128), nullable=False),
            sa.Column("section_path", sa.String(256), nullable=False),
            sa.Column("annotation_kind", sa.String(32), nullable=False),
            sa.Column("flag_type", sa.String(64), nullable=True),
            sa.Column("body", sa.Text(), nullable=False),
            sa.Column("created_by_user_id", sa.String(64), nullable=False),
            sa.Column("resolved_at", sa.DateTime(), nullable=True),
            sa.Column("resolved_by_user_id", sa.String(64), nullable=True),
            sa.Column("resolution_note", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )

    # Indices — created separately so we can guard each independently
    # against the same "concurrent session ran ahead of us" race.
    if not _has_index(bind, TABLE_NAME, INDEX_CLINIC_PATIENT_REPORT):
        op.create_index(
            INDEX_CLINIC_PATIENT_REPORT,
            TABLE_NAME,
            ["clinic_id", "patient_id", "report_id"],
        )
    if not _has_index(bind, TABLE_NAME, INDEX_REPORT_SECTION):
        op.create_index(
            INDEX_REPORT_SECTION,
            TABLE_NAME,
            ["report_id", "section_path"],
        )
    if not _has_index(bind, TABLE_NAME, INDEX_CREATED_BY):
        op.create_index(
            INDEX_CREATED_BY,
            TABLE_NAME,
            ["created_by_user_id"],
        )


def downgrade() -> None:
    bind = op.get_bind()
    if not _has_table(bind, TABLE_NAME):
        return
    for idx in (
        INDEX_CLINIC_PATIENT_REPORT,
        INDEX_REPORT_SECTION,
        INDEX_CREATED_BY,
    ):
        try:
            op.drop_index(idx, table_name=TABLE_NAME)
        except Exception:
            pass
    try:
        op.drop_table(TABLE_NAME)
    except Exception:
        pass
