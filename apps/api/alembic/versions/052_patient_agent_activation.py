"""Phase 8 — DB-backed patient agent activation table.

Phase 7 (PR #221) shipped the patient agent activation flow with a
module-scoped in-memory ``set`` in
``app.services.patient_agent_activation``. The set was threadsafe but
lost on every Fly machine restart — operators had to re-attest after a
deploy. Phase 8 promotes the store to a real DB-backed audit table so
attestations survive restarts and can be reasoned about across
machines.

Design contract
---------------
* Audit-style: soft-delete via ``deactivated_at`` + ``deactivated_by``;
  re-activating a previously-soft-deleted pair creates a *new* row, the
  old row is preserved as evidence.
* Partial unique index on ``(clinic_id, agent_id) WHERE deactivated_at
  IS NULL`` — enforces "at most one active row per pair" without
  blocking soft-delete + reactivate cycles. SQLite (>= 3.8) and Postgres
  both support the partial form via dialect-specific ``*_where`` kwargs;
  the test harness's bundled SQLite is well above 3.8.
* SQLite-safe ``op.create_table`` + ``op.create_index`` — no raw SQL.

Production guardrail still lives in the service layer:
``DEEPSYNAPS_PATIENT_AGENTS_ACTIVATED=1`` env var must also be set or
:func:`is_activated` returns ``False`` even with an active row present.

Revision ID: 052_patient_agent_activation
Revises: 051_phase7_agent_infra
Create Date: 2026-04-28
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


# ── Alembic identifiers ──────────────────────────────────────────────────────

revision = "052_patient_agent_activation"
down_revision = "051_phase7_agent_infra"
branch_labels = None
depends_on = None


# ── Helpers ──────────────────────────────────────────────────────────────────


def _has_table(bind: sa.engine.Engine, table_name: str) -> bool:
    insp = sa.inspect(bind)
    return table_name in insp.get_table_names()


def _has_index(bind: sa.engine.Engine, table_name: str, index_name: str) -> bool:
    insp = sa.inspect(bind)
    if table_name not in insp.get_table_names():
        return False
    return any(ix["name"] == index_name for ix in insp.get_indexes(table_name))


# ── Upgrade ──────────────────────────────────────────────────────────────────


def upgrade() -> None:
    bind = op.get_bind()

    if not _has_table(bind, "patient_agent_activation"):
        op.create_table(
            "patient_agent_activation",
            sa.Column("id", sa.String(64), primary_key=True),
            sa.Column("clinic_id", sa.String(64), nullable=False),
            sa.Column("agent_id", sa.String(128), nullable=False),
            sa.Column("attestation", sa.Text(), nullable=False),
            sa.Column("attested_by", sa.String(64), nullable=False),
            sa.Column("attested_at", sa.DateTime(), nullable=False),
            sa.Column("deactivated_at", sa.DateTime(), nullable=True),
            sa.Column("deactivated_by", sa.String(64), nullable=True),
        )

    if not _has_index(bind, "patient_agent_activation", "ix_patient_agent_activation_clinic_id"):
        op.create_index(
            "ix_patient_agent_activation_clinic_id",
            "patient_agent_activation",
            ["clinic_id"],
        )

    if not _has_index(bind, "patient_agent_activation", "ix_patient_agent_activation_agent_id"):
        op.create_index(
            "ix_patient_agent_activation_agent_id",
            "patient_agent_activation",
            ["agent_id"],
        )

    # Partial unique index — at most one active (clinic_id, agent_id) row.
    # ``sqlite_where`` and ``postgresql_where`` are honoured by the
    # respective dialects; on a third-party dialect the index would still
    # be created but as a plain unique index, which would over-restrict
    # soft-delete + reactivate. We don't currently target any such
    # dialect, so this is acceptable.
    if not _has_index(bind, "patient_agent_activation", "uq_active_pair"):
        op.create_index(
            "uq_active_pair",
            "patient_agent_activation",
            ["clinic_id", "agent_id"],
            unique=True,
            sqlite_where=sa.text("deactivated_at IS NULL"),
            postgresql_where=sa.text("deactivated_at IS NULL"),
        )


# ── Downgrade ────────────────────────────────────────────────────────────────


def downgrade() -> None:
    bind = op.get_bind()

    if _has_table(bind, "patient_agent_activation"):
        for ix in (
            "uq_active_pair",
            "ix_patient_agent_activation_agent_id",
            "ix_patient_agent_activation_clinic_id",
        ):
            try:
                op.drop_index(ix, table_name="patient_agent_activation")
            except Exception:  # pragma: no cover — defensive
                pass
        op.drop_table("patient_agent_activation")
