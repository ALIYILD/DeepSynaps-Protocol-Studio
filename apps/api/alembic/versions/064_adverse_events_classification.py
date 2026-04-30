"""adverse_events: classification, expectedness, escalation, MedDRA, demo

Revision ID: 064_adverse_events_classification
Revises: 063_add_deeptwin_persistence
Create Date: 2026-04-30

Adds the launch-audit columns to ``adverse_events``:

  - body_system          str(20)  index   — MedDRA SOC subset
  - expectedness         str(20)  index   — expected | unexpected | unknown
  - expectedness_source  str(20)
  - is_serious           bool     index   — derived SAE flag
  - sae_criteria         str(255)
  - reportable           bool     index   — regulator-reportable flag
  - relatedness          str(20)          — not_related | unlikely | possible | probable | definite
  - reviewed_at          datetime
  - reviewed_by          str(64)
  - signed_at            datetime
  - signed_by            str(64)
  - escalated_at         datetime
  - escalated_by         str(64)
  - escalation_target    str(60)          — IRB | FDA | MHRA | …
  - escalation_note      text
  - meddra_pt            str(120)
  - meddra_soc           str(120)
  - is_demo              bool     index

All columns are nullable / default-safe so existing rows survive untouched.
The migration is idempotent — re-running on a partially-migrated DB skips
columns that are already present (relevant in the concurrent-session worktree
deploy reality of this repo).
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "064_adverse_events_classification"
down_revision = "063_add_deeptwin_persistence"
branch_labels = None
depends_on = None


_TABLE = "adverse_events"


def _existing_columns(bind) -> set[str]:
    inspector = sa.inspect(bind)
    if _TABLE not in inspector.get_table_names():
        return set()
    return {c["name"] for c in inspector.get_columns(_TABLE)}


def _existing_indexes(bind) -> set[str]:
    inspector = sa.inspect(bind)
    if _TABLE not in inspector.get_table_names():
        return set()
    return {idx["name"] for idx in inspector.get_indexes(_TABLE)}


def upgrade() -> None:
    bind = op.get_bind()
    cols = _existing_columns(bind)

    def add(col_name: str, column: sa.Column) -> None:
        if col_name in cols:
            return
        op.add_column(_TABLE, column)

    add("body_system", sa.Column("body_system", sa.String(20), nullable=True))
    add("expectedness", sa.Column("expectedness", sa.String(20), nullable=True))
    add("expectedness_source", sa.Column("expectedness_source", sa.String(20), nullable=True))
    add(
        "is_serious",
        sa.Column("is_serious", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    add("sae_criteria", sa.Column("sae_criteria", sa.String(255), nullable=True))
    add(
        "reportable",
        sa.Column("reportable", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    add("relatedness", sa.Column("relatedness", sa.String(20), nullable=True))
    add("reviewed_at", sa.Column("reviewed_at", sa.DateTime(), nullable=True))
    add("reviewed_by", sa.Column("reviewed_by", sa.String(64), nullable=True))
    add("signed_at", sa.Column("signed_at", sa.DateTime(), nullable=True))
    add("signed_by", sa.Column("signed_by", sa.String(64), nullable=True))
    add("escalated_at", sa.Column("escalated_at", sa.DateTime(), nullable=True))
    add("escalated_by", sa.Column("escalated_by", sa.String(64), nullable=True))
    add("escalation_target", sa.Column("escalation_target", sa.String(60), nullable=True))
    add("escalation_note", sa.Column("escalation_note", sa.Text(), nullable=True))
    add("meddra_pt", sa.Column("meddra_pt", sa.String(120), nullable=True))
    add("meddra_soc", sa.Column("meddra_soc", sa.String(120), nullable=True))
    add(
        "is_demo",
        sa.Column("is_demo", sa.Boolean(), nullable=False, server_default=sa.false()),
    )

    # Indexes guarded against re-run.
    idx_names = _existing_indexes(bind)

    def idx(name: str, columns: list[str]) -> None:
        if name in idx_names:
            return
        op.create_index(name, _TABLE, columns)

    idx("ix_adverse_events_body_system", ["body_system"])
    idx("ix_adverse_events_expectedness", ["expectedness"])
    idx("ix_adverse_events_is_serious", ["is_serious"])
    idx("ix_adverse_events_reportable", ["reportable"])
    idx("ix_adverse_events_is_demo", ["is_demo"])


def downgrade() -> None:
    bind = op.get_bind()
    idx_names = _existing_indexes(bind)
    for name in (
        "ix_adverse_events_body_system",
        "ix_adverse_events_expectedness",
        "ix_adverse_events_is_serious",
        "ix_adverse_events_reportable",
        "ix_adverse_events_is_demo",
    ):
        if name in idx_names:
            op.drop_index(name, table_name=_TABLE)

    cols = _existing_columns(bind)
    for col in (
        "is_demo",
        "meddra_soc",
        "meddra_pt",
        "escalation_note",
        "escalation_target",
        "escalated_by",
        "escalated_at",
        "signed_by",
        "signed_at",
        "reviewed_by",
        "reviewed_at",
        "relatedness",
        "reportable",
        "sae_criteria",
        "is_serious",
        "expectedness_source",
        "expectedness",
        "body_system",
    ):
        if col in cols:
            op.drop_column(_TABLE, col)
