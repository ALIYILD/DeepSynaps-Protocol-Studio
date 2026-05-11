"""Research-use consent capture (Slice B — Data Console pipeline).

Adds the ``research_consents`` table — the source-of-truth ledger for
"may this patient's de-identified data be used for research?". The
table is the only place this flag lives; we deliberately do NOT stash
it on ``patients`` so the grant/revoke transcript is preserved.

Design contract
---------------
* Additive only — one new table, nothing else touched.
* SQLite-safe — ``op.create_table`` with stdlib SQLAlchemy types.
* FK on ``patient_id`` (CASCADE) so patient delete drops the ledger.
* FK on ``clinic_id`` (CASCADE) — denormalised so Slice C can filter
  by clinic without joining patients → users → clinics.
* Partial unique index ``ix_research_consents_active_per_patient`` on
  ``(patient_id) WHERE revoked_at IS NULL`` — at most one active grant
  per patient at any time. SQLite + Postgres both honour
  ``sqlite_where`` / ``postgresql_where`` for filtered indexes.

Revision ID: 102_research_consent
Revises: 101_merge_multiple_heads
Create Date: 2026-05-11
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "102_research_consent"
down_revision = "101_merge_multiple_heads"
branch_labels = None
depends_on = None


def _has_table(bind: sa.engine.Engine, table_name: str) -> bool:
    insp = sa.inspect(bind)
    return table_name in insp.get_table_names()


def _has_index(bind: sa.engine.Engine, table_name: str, index_name: str) -> bool:
    insp = sa.inspect(bind)
    try:
        return any(ix["name"] == index_name for ix in insp.get_indexes(table_name))
    except Exception:
        return False


def upgrade() -> None:
    bind = op.get_bind()

    if not _has_table(bind, "research_consents"):
        op.create_table(
            "research_consents",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column(
                "patient_id",
                sa.String(36),
                sa.ForeignKey("patients.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "clinic_id",
                sa.String(64),
                sa.ForeignKey("clinics.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "granted",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("0"),
            ),
            sa.Column("granted_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("granted_by_actor_id", sa.String(64), nullable=True),
            sa.Column("granted_by_role", sa.String(32), nullable=True),
            sa.Column(
                "scope",
                sa.String(64),
                nullable=False,
                server_default="anonymized_research",
            ),
            sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("revoked_by_actor_id", sa.String(64), nullable=True),
            sa.Column("revoked_by_role", sa.String(32), nullable=True),
            sa.Column("revocation_reason", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        )

    if not _has_index(bind, "research_consents", "ix_research_consents_patient_id"):
        op.create_index(
            "ix_research_consents_patient_id",
            "research_consents",
            ["patient_id"],
        )
    if not _has_index(bind, "research_consents", "ix_research_consents_clinic_id"):
        op.create_index(
            "ix_research_consents_clinic_id",
            "research_consents",
            ["clinic_id"],
        )

    # Partial unique index: at most one ACTIVE (revoked_at IS NULL) row
    # per patient. Honoured by SQLite and Postgres; degrades to a plain
    # unique index on other dialects (we do not target any).
    if not _has_index(
        bind, "research_consents", "ix_research_consents_active_per_patient"
    ):
        op.create_index(
            "ix_research_consents_active_per_patient",
            "research_consents",
            ["patient_id"],
            unique=True,
            sqlite_where=sa.text("revoked_at IS NULL"),
            postgresql_where=sa.text("revoked_at IS NULL"),
        )


def downgrade() -> None:
    bind = op.get_bind()
    if not _has_table(bind, "research_consents"):
        return
    for ix in (
        "ix_research_consents_active_per_patient",
        "ix_research_consents_clinic_id",
        "ix_research_consents_patient_id",
    ):
        try:
            op.drop_index(ix, table_name="research_consents")
        except Exception:  # pragma: no cover — defensive across dialects
            pass
    op.drop_table("research_consents")
