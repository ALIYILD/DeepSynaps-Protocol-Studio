"""Rotation Policy Advisor Thresholds (CSAHP6, 2026-05-02).

Closes section I rec from the Rotation Policy Advisor Outcome Tracker
(CSAHP5, #434):

* CSAHP4 (#428) emits heuristic ``advice_cards`` (REFLAG_HIGH,
  MANUAL_REFLAG, AUTH_DOMINANT) from hardcoded thresholds.
* CSAHP5 (#434) measures predictive accuracy per advice code
  (``card_disappeared_pct``).
* THIS migration adds the durable threshold-override table the CSAHP4
  service reads on each call so admins can adopt better thresholds
  via the CSAHP6 Threshold Tuning Console without a code-and-deploy
  cycle. A missing row falls back to the hardcoded default — net-new,
  fully additive, no destructive changes.

This migration adds ONE table:

* ``rotation_policy_advisor_thresholds`` — one row per (clinic,
  advice_code, threshold_key). Carries ``threshold_value`` (Float),
  optional ``adopted_by_user_id`` for provenance, optional
  ``justification`` (10-500 chars per the adopt API), and standard
  ``created_at`` / ``updated_at`` timestamps.

Why additive (no destructive changes)
-------------------------------------
The table is net-new; nothing is renamed or dropped. CSAHP4 keeps
working unchanged when no override row exists; defaults are preserved
in ``app.services.rotation_policy_advisor``.

Cross-dialect safe — every column is a plain string / float / nullable
string. SQLite-friendly. Soft FK to ``users.id`` / ``clinics.id`` so
deleting a user/clinic does not cascade-clear historic threshold rows
(audit hygiene — same convention as CSAHP4 / DCRO3 rows).

Revision ID: 081_rotation_policy_advisor_thresholds
Revises: 080_resolver_coaching_digest_preference
Create Date: 2026-05-02
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


# ── Alembic identifiers ──────────────────────────────────────────────────────

revision = "081_rotation_policy_advisor_thresholds"
# Two heads exist at level 080 (``080_resolver_coaching_digest_preference``
# from DCRO3 and ``080_audio_analyses_table`` from the audio-pipeline split).
# Both descend from ``079_caregiver_preferred_channel``. We merge them in
# this revision so ``alembic heads`` collapses back to one head; per-clinic
# override rows are net-new and unrelated to either parent's schema, so the
# merge is a safe additive merge.
down_revision = (
    "080_resolver_coaching_digest_preference",
    "080_audio_analyses_table",
)
branch_labels = None
depends_on = None


TABLE_NAME = "rotation_policy_advisor_thresholds"


def _has_table(bind: sa.engine.Engine, name: str) -> bool:
    insp = sa.inspect(bind)
    try:
        return name in set(insp.get_table_names())
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
            "advice_code",
            sa.String(64),
            nullable=False,
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
            "advice_code",
            "threshold_key",
            name="uq_rotation_policy_advisor_thresholds_clinic_code_key",
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
