"""Clinician Wellness Hub launch-audit (2026-05-01) — clinician triage columns.

Bidirectional counterpart to 069_wellness_checkins (which added the
patient-side wellness_checkins table). This migration extends that
table with clinician-triage columns so the new
``apps/api/app/routers/clinician_wellness_router.py`` can record the
clinician's review state on each check-in without inventing a parallel
table:

* ``clinician_status``     — open / acknowledged / escalated / resolved
* ``clinician_actor_id``   — actor id of the clinician who acted last
* ``clinician_acted_at``   — UTC timestamp of the last clinician action
* ``clinician_note``       — clinician's resolution / acknowledge note
* ``adverse_event_id``     — pointer to AE Hub draft created on escalate

The patient-side write contract (POST /api/v1/wellness/checkins) does
not touch any of these columns, so the patient surface keeps its
contract intact. Cross-clinic IDOR enforcement remains the router's job
(via patient → clinician → user.clinic_id resolution).

Design contract
---------------
* Additive only — six new columns with defaults that mean
  "open / no clinician has touched this yet".
* Cross-dialect — stdlib SQLAlchemy types only, runs against SQLite test
  harness and Postgres production identically.
* Defensive — ``upgrade`` checks for column existence before adding
  (idempotent across rerun / partial migrations); ``downgrade`` drops
  in reverse order.

Revision ID: 073_clinician_wellness_triage
Revises: 072_care_team_coverage
Create Date: 2026-05-01
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


# ── Alembic identifiers ──────────────────────────────────────────────────────

revision = "073_clinician_wellness_triage"
down_revision = "072_care_team_coverage"
branch_labels = None
depends_on = None


_TABLE = "wellness_checkins"

_COLUMNS_TO_ADD: list[tuple[str, sa.Column]] = [
    (
        "clinician_status",
        sa.Column(
            "clinician_status",
            sa.String(20),
            nullable=False,
            server_default="open",
        ),
    ),
    (
        "clinician_actor_id",
        sa.Column("clinician_actor_id", sa.String(64), nullable=True),
    ),
    (
        "clinician_acted_at",
        sa.Column("clinician_acted_at", sa.DateTime(), nullable=True),
    ),
    (
        "clinician_note",
        sa.Column("clinician_note", sa.Text(), nullable=True),
    ),
    (
        "adverse_event_id",
        sa.Column("adverse_event_id", sa.String(36), nullable=True),
    ),
]


def _existing_columns(bind: sa.engine.Engine, table_name: str) -> set[str]:
    insp = sa.inspect(bind)
    if table_name not in insp.get_table_names():
        return set()
    return {col["name"] for col in insp.get_columns(table_name)}


# ── Upgrade ──────────────────────────────────────────────────────────────────


def upgrade() -> None:
    bind = op.get_bind()
    existing = _existing_columns(bind, _TABLE)
    if not existing:
        # wellness_checkins missing entirely — 069 must run first. No-op
        # so a fresh database run-through stays consistent.
        return

    for name, column in _COLUMNS_TO_ADD:
        if name in existing:
            continue
        op.add_column(_TABLE, column)

    # Index clinician_status so the triage queue list query stays cheap.
    insp = sa.inspect(bind)
    idx_names = {ix["name"] for ix in insp.get_indexes(_TABLE)}
    if "ix_wellness_checkins_clinician_status" not in idx_names:
        op.create_index(
            "ix_wellness_checkins_clinician_status",
            _TABLE,
            ["clinician_status"],
        )


# ── Downgrade ────────────────────────────────────────────────────────────────


def downgrade() -> None:
    bind = op.get_bind()
    existing = _existing_columns(bind, _TABLE)
    if not existing:
        return

    insp = sa.inspect(bind)
    idx_names = {ix["name"] for ix in insp.get_indexes(_TABLE)}
    if "ix_wellness_checkins_clinician_status" in idx_names:
        op.drop_index(
            "ix_wellness_checkins_clinician_status",
            table_name=_TABLE,
        )

    for name, _column in reversed(_COLUMNS_TO_ADD):
        if name in existing:
            op.drop_column(_TABLE, name)
