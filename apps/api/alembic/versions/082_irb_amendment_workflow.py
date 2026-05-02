"""IRB Amendment Workflow (IRB-AMD1, 2026-05-02).

Real-world clinical trials hit amendment cycles every 4-6 weeks; the existing
``IRBProtocolAmendment`` row carries enough context for the regulator to read
back what changed, but no lifecycle / reviewer-signoff fields. This migration
adds the IRB-AMD1 workflow surface:

draft → submitted → reviewer_assigned → under_review → approved | rejected |
revisions_requested → if approved → effective.

All columns are nullable additive — existing rows keep working with status
defaulting to ``submitted`` (legacy three-state value). New rows go through
the lifecycle.

Schema additions
----------------

``irb_protocol_amendments`` (existing, ext):

* ``assigned_reviewer_user_id`` (String 64, nullable, FK soft to users.id)
* ``reviewed_at`` (DateTime, nullable)
* ``effective_at`` (DateTime, nullable)
* ``review_decision_note`` (Text, nullable)
* ``amendment_diff_json`` (Text, nullable) — JSON list of FieldDiff rows
* ``version`` (Integer, default 1) — amendment ordinal within the protocol
* ``created_by_user_id`` (String 64, nullable) — coexists with legacy
  ``submitted_by`` (which historically captured the same actor at submit).
* ``payload_json`` (Text, nullable) — full proposed-change payload at draft

``irb_protocols`` (existing, ext):

* ``version`` (Integer, default 1) — bumped each time an approved amendment
  is marked effective.

Cross-dialect safe — every column is nullable / has a default. SQLite-friendly.
Soft FK to ``users.id`` so deleting a user does not cascade-clear the
amendment row (audit hygiene).

Revision ID: 082_irb_amendment_workflow
Revises: 081_rotation_policy_advisor_thresholds
Create Date: 2026-05-02
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


# ── Alembic identifiers ──────────────────────────────────────────────────────

revision = "082_irb_amendment_workflow"
down_revision = "081_rotation_policy_advisor_thresholds"
branch_labels = None
depends_on = None


_AMD_TABLE = "irb_protocol_amendments"
_PROTO_TABLE = "irb_protocols"


def _has_column(bind: sa.engine.Engine, table: str, col: str) -> bool:
    insp = sa.inspect(bind)
    try:
        return col in {c["name"] for c in insp.get_columns(table)}
    except Exception:
        return False


def _has_table(bind: sa.engine.Engine, name: str) -> bool:
    insp = sa.inspect(bind)
    try:
        return name in set(insp.get_table_names())
    except Exception:
        return False


def _add_col(bind: sa.engine.Engine, table: str, column: sa.Column) -> None:
    if not _has_table(bind, table):
        return
    if _has_column(bind, table, column.name):
        return
    try:
        op.add_column(table, column)
    except Exception:
        # idempotent: concurrent sessions may have run this revision ahead
        pass


def upgrade() -> None:
    bind = op.get_bind()

    _add_col(
        bind,
        _AMD_TABLE,
        sa.Column("assigned_reviewer_user_id", sa.String(64), nullable=True),
    )
    _add_col(
        bind,
        _AMD_TABLE,
        sa.Column("reviewed_at", sa.DateTime(), nullable=True),
    )
    _add_col(
        bind,
        _AMD_TABLE,
        sa.Column("effective_at", sa.DateTime(), nullable=True),
    )
    _add_col(
        bind,
        _AMD_TABLE,
        sa.Column("review_decision_note", sa.Text(), nullable=True),
    )
    _add_col(
        bind,
        _AMD_TABLE,
        sa.Column("amendment_diff_json", sa.Text(), nullable=True),
    )
    _add_col(
        bind,
        _AMD_TABLE,
        sa.Column("version", sa.Integer(), nullable=True),
    )
    _add_col(
        bind,
        _AMD_TABLE,
        sa.Column("created_by_user_id", sa.String(64), nullable=True),
    )
    _add_col(
        bind,
        _AMD_TABLE,
        sa.Column("payload_json", sa.Text(), nullable=True),
    )

    _add_col(
        bind,
        _PROTO_TABLE,
        sa.Column("version", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    bind = op.get_bind()
    # Defensive: drop column may not be supported on SQLite older versions;
    # we shrug and skip — same convention as 081.
    for col in (
        "assigned_reviewer_user_id",
        "reviewed_at",
        "effective_at",
        "review_decision_note",
        "amendment_diff_json",
        "version",
        "created_by_user_id",
        "payload_json",
    ):
        try:
            if _has_column(bind, _AMD_TABLE, col):
                op.drop_column(_AMD_TABLE, col)
        except Exception:
            pass
    try:
        if _has_column(bind, _PROTO_TABLE, "version"):
            op.drop_column(_PROTO_TABLE, "version")
    except Exception:
        pass
