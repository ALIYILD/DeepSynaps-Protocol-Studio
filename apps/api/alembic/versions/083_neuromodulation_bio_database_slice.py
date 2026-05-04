"""Neuromodulation bio database schema slice (BIO-DB1, 2026-05-02).

Adds three additive tables for neuromodulation-relevant biological context:

* ``clinical_catalog_items`` — reference catalog rows covering medications,
  supplements, vitamins, lab tests, and biomarkers.
* ``patient_substances`` — patient-scoped medication / supplement / vitamin
  records, optionally linked to the catalog.
* ``patient_lab_results`` — timestamped lab test and biomarker observations,
  optionally linked to the catalog.

Why additive
------------
The existing ``patient_medications`` table remains untouched so current
routers and tests keep working while the broader bio-database layer is built
out behind it. These tables are net-new and safe to deploy ahead of API
adoption.

Cross-dialect safe: plain strings / floats / booleans / datetimes plus
SQLite-compatible check constraints. Uses soft FK semantics for
``clinician_id`` and hard FK semantics for ``patient_id`` consistent with the
existing clinical models. ``catalog_item_id`` uses ``SET NULL`` to preserve
patient history if a catalog row is retired.

Revision ID: 083_neuromodulation_bio_database_slice
Revises: 082_irb_amendment_workflow
Create Date: 2026-05-02
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "083_neuromodulation_bio_database_slice"
down_revision = "082_irb_amendment_workflow"
branch_labels = None
depends_on = None


def _has_table(bind: sa.engine.Engine, name: str) -> bool:
    insp = sa.inspect(bind)
    try:
        return name in set(insp.get_table_names())
    except Exception:
        return False


def _index_names(bind: sa.engine.Engine, table: str) -> set[str]:
    insp = sa.inspect(bind)
    try:
        return {ix["name"] for ix in insp.get_indexes(table)}
    except Exception:
        return set()


def _has_column(bind: sa.engine.Engine, table: str, col: str) -> bool:
    """True if ``col`` exists on ``table`` (for parallel-branch table-shape drift)."""
    insp = sa.inspect(bind)
    try:
        return any(c["name"] == col for c in insp.get_columns(table))
    except Exception:
        return False


def _create_index_if_all_columns(
    bind: sa.engine.Engine,
    table: str,
    index_name: str,
    columns: list[str],
) -> None:
    """Create index only when the table exists and every indexed column exists.

    Parallel migration ``083_patient_lab_results`` may create ``patient_lab_results``
    with a Labs-analyzer shape (no ``collected_at``, ``catalog_item_id``, etc.).
    This neuromod migration must not index columns that are absent.
    """
    if not _has_table(bind, table):
        return
    if not all(_has_column(bind, table, c) for c in columns):
        return
    existing = _index_names(bind, table)
    if index_name in existing:
        return
    op.create_index(index_name, table, columns)


def upgrade() -> None:
    bind = op.get_bind()

    if not _has_table(bind, "clinical_catalog_items"):
        op.create_table(
            "clinical_catalog_items",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("item_type", sa.String(24), nullable=False),
            sa.Column("slug", sa.String(120), nullable=False),
            sa.Column("display_name", sa.String(255), nullable=False),
            sa.Column("category", sa.String(120), nullable=True),
            sa.Column("aliases_json", sa.Text(), nullable=False, server_default="[]"),
            sa.Column("default_unit", sa.String(40), nullable=True),
            sa.Column("unit_options_json", sa.Text(), nullable=False, server_default="[]"),
            sa.Column("neuromodulation_relevance", sa.Text(), nullable=True),
            sa.Column("evidence_note", sa.Text(), nullable=True),
            sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.CheckConstraint(
                "item_type IN ('medication', 'supplement', 'vitamin', 'lab_test', 'biomarker')",
                name="ck_clinical_catalog_items_item_type",
            ),
            sa.UniqueConstraint(
                "item_type",
                "slug",
                name="uq_clinical_catalog_items_type_slug",
            ),
        )

    catalog_indexes = _index_names(bind, "clinical_catalog_items")
    if "ix_clinical_catalog_items_item_type" not in catalog_indexes:
        op.create_index("ix_clinical_catalog_items_item_type", "clinical_catalog_items", ["item_type"])
    if "ix_clinical_catalog_items_slug" not in catalog_indexes:
        op.create_index("ix_clinical_catalog_items_slug", "clinical_catalog_items", ["slug"])
    if "ix_clinical_catalog_items_active" not in catalog_indexes:
        op.create_index("ix_clinical_catalog_items_active", "clinical_catalog_items", ["active"])
    if "ix_clinical_catalog_items_category" not in catalog_indexes:
        op.create_index("ix_clinical_catalog_items_category", "clinical_catalog_items", ["category"])

    if not _has_table(bind, "patient_substances"):
        op.create_table(
            "patient_substances",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("patient_id", sa.String(36), sa.ForeignKey("patients.id", ondelete="CASCADE"), nullable=False),
            sa.Column("clinician_id", sa.String(64), nullable=False),
            sa.Column(
                "catalog_item_id",
                sa.String(36),
                sa.ForeignKey("clinical_catalog_items.id", ondelete="SET NULL"),
                nullable=True,
            ),
            sa.Column("substance_type", sa.String(24), nullable=False),
            sa.Column("name", sa.String(255), nullable=False),
            sa.Column("generic_name", sa.String(255), nullable=True),
            sa.Column("category", sa.String(120), nullable=True),
            sa.Column("dose", sa.String(80), nullable=True),
            sa.Column("dose_unit", sa.String(40), nullable=True),
            sa.Column("frequency", sa.String(80), nullable=True),
            sa.Column("route", sa.String(60), nullable=True),
            sa.Column("indication", sa.String(255), nullable=True),
            sa.Column("started_at", sa.DateTime(), nullable=True),
            sa.Column("stopped_at", sa.DateTime(), nullable=True),
            sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("source", sa.String(80), nullable=True),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.CheckConstraint(
                "substance_type IN ('medication', 'supplement', 'vitamin')",
                name="ck_patient_substances_substance_type",
            ),
        )

    substance_indexes = _index_names(bind, "patient_substances")
    if "ix_patient_substances_patient_id" not in substance_indexes:
        op.create_index("ix_patient_substances_patient_id", "patient_substances", ["patient_id"])
    if "ix_patient_substances_clinician_id" not in substance_indexes:
        op.create_index("ix_patient_substances_clinician_id", "patient_substances", ["clinician_id"])
    if "ix_patient_substances_substance_type" not in substance_indexes:
        op.create_index("ix_patient_substances_substance_type", "patient_substances", ["substance_type"])
    if "ix_patient_substances_active" not in substance_indexes:
        op.create_index("ix_patient_substances_active", "patient_substances", ["active"])
    if "ix_patient_substances_patient_active" not in substance_indexes:
        op.create_index("ix_patient_substances_patient_active", "patient_substances", ["patient_id", "active"])
    if "ix_patient_substances_clinician_active" not in substance_indexes:
        op.create_index("ix_patient_substances_clinician_active", "patient_substances", ["clinician_id", "active"])
    if "ix_patient_substances_catalog_item_id" not in substance_indexes:
        op.create_index("ix_patient_substances_catalog_item_id", "patient_substances", ["catalog_item_id"])

    if not _has_table(bind, "patient_lab_results"):
        op.create_table(
            "patient_lab_results",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("patient_id", sa.String(36), sa.ForeignKey("patients.id", ondelete="CASCADE"), nullable=False),
            sa.Column("clinician_id", sa.String(64), nullable=False),
            sa.Column(
                "catalog_item_id",
                sa.String(36),
                sa.ForeignKey("clinical_catalog_items.id", ondelete="SET NULL"),
                nullable=True,
            ),
            sa.Column("lab_test_name", sa.String(255), nullable=True),
            sa.Column("biomarker_name", sa.String(255), nullable=True),
            sa.Column("specimen_type", sa.String(80), nullable=True),
            sa.Column("value_text", sa.String(255), nullable=True),
            sa.Column("value_numeric", sa.Float(), nullable=True),
            sa.Column("unit", sa.String(40), nullable=True),
            sa.Column("reference_range_low", sa.Float(), nullable=True),
            sa.Column("reference_range_high", sa.Float(), nullable=True),
            sa.Column("reference_range_text", sa.String(255), nullable=True),
            sa.Column("abnormal_flag", sa.String(20), nullable=True),
            sa.Column("collected_at", sa.DateTime(), nullable=True),
            sa.Column("reported_at", sa.DateTime(), nullable=True),
            sa.Column("source_lab", sa.String(255), nullable=True),
            sa.Column("fasting_state", sa.String(40), nullable=True),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.CheckConstraint(
                "(lab_test_name IS NOT NULL) OR (biomarker_name IS NOT NULL)",
                name="ck_patient_lab_results_named_result",
            ),
        )

    _create_index_if_all_columns(
        bind, "patient_lab_results", "ix_patient_lab_results_patient_id", ["patient_id"]
    )
    _create_index_if_all_columns(
        bind, "patient_lab_results", "ix_patient_lab_results_clinician_id", ["clinician_id"]
    )
    _create_index_if_all_columns(
        bind, "patient_lab_results", "ix_patient_lab_results_collected_at", ["collected_at"]
    )
    _create_index_if_all_columns(
        bind,
        "patient_lab_results",
        "ix_patient_lab_results_patient_collected_at",
        ["patient_id", "collected_at"],
    )
    _create_index_if_all_columns(
        bind,
        "patient_lab_results",
        "ix_patient_lab_results_clinician_collected_at",
        ["clinician_id", "collected_at"],
    )
    _create_index_if_all_columns(
        bind,
        "patient_lab_results",
        "ix_patient_lab_results_catalog_item_id",
        ["catalog_item_id"],
    )
    _create_index_if_all_columns(
        bind,
        "patient_lab_results",
        "ix_patient_lab_results_abnormal_flag",
        ["abnormal_flag"],
    )


def downgrade() -> None:
    bind = op.get_bind()

    for table_name, indexes in (
        (
            "patient_lab_results",
            (
                "ix_patient_lab_results_abnormal_flag",
                "ix_patient_lab_results_catalog_item_id",
                "ix_patient_lab_results_clinician_collected_at",
                "ix_patient_lab_results_collected_at",
                "ix_patient_lab_results_clinician_id",
                "ix_patient_lab_results_patient_collected_at",
                "ix_patient_lab_results_patient_id",
            ),
        ),
        (
            "patient_substances",
            (
                "ix_patient_substances_catalog_item_id",
                "ix_patient_substances_clinician_active",
                "ix_patient_substances_patient_active",
                "ix_patient_substances_active",
                "ix_patient_substances_substance_type",
                "ix_patient_substances_clinician_id",
                "ix_patient_substances_patient_id",
            ),
        ),
        (
            "clinical_catalog_items",
            (
                "ix_clinical_catalog_items_category",
                "ix_clinical_catalog_items_active",
                "ix_clinical_catalog_items_slug",
                "ix_clinical_catalog_items_item_type",
            ),
        ),
    ):
        if not _has_table(bind, table_name):
            continue
        existing_indexes = _index_names(bind, table_name)
        for index_name in indexes:
            if index_name in existing_indexes:
                try:
                    op.drop_index(index_name, table_name=table_name)
                except Exception:
                    pass

    for table_name in ("patient_lab_results", "patient_substances", "clinical_catalog_items"):
        if _has_table(bind, table_name):
            try:
                op.drop_table(table_name)
            except Exception:
                pass
