"""Caregiver Consent Grants (2026-05-01) — caregiver_consent_grants + caregiver_consent_revisions.

Closes the caregiver-share loop opened by Patient Digest #376. The
share-caregiver endpoint there records intent + audit but the response
is hard-coded ``delivery_status='queued'`` because there is no durable
grant table to consult — there is no way for the patient to record an
explicit, scoped consent that downstream surfaces (digest / messages /
reports / wearables) can honour.

This migration adds two tables:

* ``caregiver_consent_grants`` — the canonical "patient X consents
  caregiver Y to receive these classes of artefacts" row. One row per
  (patient, caregiver, granted_at). Revocation stamps ``revoked_at`` +
  ``revoked_by_user_id`` + ``revocation_reason`` and the grant row is
  immutable thereafter.
* ``caregiver_consent_revisions`` — append-only revisions: every state
  change (create / scope_edit / revoke) writes one row so the
  regulator transcript is reconstructable.

Why additive (no destructive changes)
-------------------------------------
Both tables are net-new; nothing is renamed or dropped. Patient Digest
#376 keeps working unchanged when no grant exists (delivery_status
stays ``queued``); only when a grant with ``scope.digest=True`` is
present does it flip to ``sent`` honestly.

Cross-dialect safe — every column is nullable text/JSON-as-TEXT or a
plain string PK / FK. Soft FK to ``patients.id`` / ``users.id`` (no ON
DELETE cascade) so deleting a patient or user does not clear the
historic grant transcript. SQLite-friendly.

Revision ID: 076_caregiver_consent_grants
Revises: 075_escalation_policy
Create Date: 2026-05-01
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


# ── Alembic identifiers ──────────────────────────────────────────────────────

revision = "076_caregiver_consent_grants"
down_revision = "075_escalation_policy"
branch_labels = None
depends_on = None


def _has_table(bind: sa.engine.Engine, name: str) -> bool:
    insp = sa.inspect(bind)
    try:
        return name in set(insp.get_table_names())
    except Exception:
        return False


def upgrade() -> None:
    bind = op.get_bind()

    if not _has_table(bind, "caregiver_consent_grants"):
        op.create_table(
            "caregiver_consent_grants",
            sa.Column("id", sa.String(64), primary_key=True),
            sa.Column("patient_id", sa.String(36), nullable=False, index=True),
            sa.Column("caregiver_user_id", sa.String(64), nullable=False, index=True),
            sa.Column("granted_at", sa.String(64), nullable=False),
            sa.Column("granted_by_user_id", sa.String(64), nullable=False, index=True),
            sa.Column("revoked_at", sa.String(64), nullable=True, index=True),
            sa.Column("revoked_by_user_id", sa.String(64), nullable=True),
            sa.Column("revocation_reason", sa.Text(), nullable=True),
            sa.Column("scope", sa.Text(), nullable=True),  # JSON object as TEXT
            sa.Column("note", sa.Text(), nullable=True),
            sa.Column("created_at", sa.String(64), nullable=False),
            sa.Column("updated_at", sa.String(64), nullable=False),
        )

    if not _has_table(bind, "caregiver_consent_revisions"):
        op.create_table(
            "caregiver_consent_revisions",
            sa.Column("id", sa.String(64), primary_key=True),
            sa.Column("grant_id", sa.String(64), nullable=False, index=True),
            sa.Column("patient_id", sa.String(36), nullable=False, index=True),
            sa.Column("caregiver_user_id", sa.String(64), nullable=False, index=True),
            sa.Column("action", sa.String(32), nullable=False),
            sa.Column("scope_before", sa.Text(), nullable=True),
            sa.Column("scope_after", sa.Text(), nullable=True),
            sa.Column("actor_user_id", sa.String(64), nullable=False, index=True),
            sa.Column("reason", sa.Text(), nullable=True),
            sa.Column("created_at", sa.String(64), nullable=False),
        )


def downgrade() -> None:
    bind = op.get_bind()
    for table in (
        "caregiver_consent_revisions",
        "caregiver_consent_grants",
    ):
        if _has_table(bind, table):
            try:
                op.drop_table(table)
            except Exception:
                pass
