"""Convert TEXT embedding columns to native pgvector(200) + add HNSW indices.

Purpose
-------
Migration 038 / 039 shipped the ``embedding_json`` TEXT columns on the
``qeeg_analyses``, ``mri_analyses``, and ``kg_entities`` tables (plus
``papers`` in the sibling 87k-paper literature DB, when that table is
co-located). Migration 040 then enabled the ``pgvector`` extension on
Postgres (best-effort — managed hosts may require operator-level
privileges, so 040 logs a warning and continues on failure).

This migration (041) is the *follow-up* that lifts those JSON-text
blobs into native ``vector(200)`` columns with HNSW indices so
similarity search is fast and dialect-correct.

Design contract
---------------
* **Additive only.** The existing ``embedding_json`` TEXT columns stay
  in place. We add a sibling ``embedding`` column of type
  ``vector(200)`` (Postgres only). Application code can read either
  during the transition window.
* **Postgres-only bulk.** On SQLite (the test env) this migration is a
  complete no-op: it logs and returns before any DDL is issued. The
  ``embedding_json`` TEXT path continues to work on SQLite.
* **Safe on extension-missing hosts.** If ``pg_extension`` does not
  list ``vector`` after the safety-net ``CREATE EXTENSION`` attempt,
  the migration logs CRITICAL + returns without raising. Downstream
  code still boots against the TEXT columns; the operator can enable
  the extension out-of-band and re-run alembic upgrade.
* **Per-table try/except on backfill.** A malformed ``embedding_json``
  row (e.g. half-written during a crash) must not abort the whole
  migration — we log a per-table warning and move on.
* **HNSW indices use ``vector_cosine_ops``** — matches the reference
  SQL in ``packages/mri-pipeline/medrag_extensions/04_migration_mri.sql``.

Downgrade
---------
Drops the HNSW indices + the new ``embedding`` columns but leaves the
original ``embedding_json`` TEXT columns intact and does NOT drop the
pgvector extension (other components depend on it).

Revision ID: 041_pgvector_native_columns
Revises: 040_pgvector_mri_seed
Create Date: 2026-04-24
"""
from __future__ import annotations

import logging

import sqlalchemy as sa
from alembic import op


# ── Alembic identifiers ──────────────────────────────────────────────────────

revision = "041_pgvector_native_columns"
down_revision = "040_pgvector_mri_seed"
branch_labels = None
depends_on = None

log = logging.getLogger(__name__)


# ── Tables to migrate ────────────────────────────────────────────────────────
#
# Each tuple: (table_name, source_text_col, target_vector_col, index_name,
# optional_dependency). The ``optional_dependency`` flag indicates whether
# we must check ``has_table`` before touching the table — ``papers`` is
# defined by the sibling 87k-paper ingest and may not exist on every
# deployment.

_TARGETS: tuple[tuple[str, str, str, str, bool], ...] = (
    ("qeeg_analyses", "embedding_json", "embedding",
     "idx_qeeg_analyses_embedding_hnsw", False),
    ("mri_analyses", "embedding_json", "embedding",
     "idx_mri_analyses_embedding_hnsw", False),
    ("kg_entities", "embedding_json", "embedding",
     "idx_kg_entities_embedding_hnsw", False),
    ("papers", "embedding_json", "embedding",
     "idx_papers_embedding_hnsw", True),
)


def _has_table(bind, table_name: str) -> bool:
    """Return True if ``table_name`` exists on the bound connection.

    Uses ``sa.inspect(bind).has_table(...)`` because the pre-2.0
    ``bind.dialect.has_table(bind, ...)`` call is deprecated / removed
    in modern SQLAlchemy.

    Parameters
    ----------
    bind : sqlalchemy.engine.Connection
        Live alembic migration connection.
    table_name : str
        Name of the table to look for.

    Returns
    -------
    bool
    """
    try:
        return sa.inspect(bind).has_table(table_name)
    except Exception as exc:  # noqa: BLE001 — defensive, don't abort on introspection hiccups
        log.warning("has_table(%s) failed: %s", table_name, exc)
        return False


def _has_column(bind, table_name: str, column_name: str) -> bool:
    """Return True if ``table_name`` already exposes ``column_name``.

    Used so the migration is idempotent: a re-run after a partial
    failure must not try to ADD a column that was added on the prior
    attempt.
    """
    try:
        cols = sa.inspect(bind).get_columns(table_name)
    except Exception as exc:  # noqa: BLE001
        log.warning("get_columns(%s) failed: %s", table_name, exc)
        return False
    return any(c["name"] == column_name for c in cols)


def upgrade() -> None:
    """Apply the pgvector column lift + HNSW indices (Postgres only).

    Notes
    -----
    * Early-returns on SQLite and on pgvector-missing Postgres.
    * Each step is individually guarded — per-table failures log a
      warning rather than abort the whole migration.
    """
    bind = op.get_bind()
    dialect = bind.dialect.name
    log.info("041 running on dialect=%s", dialect)

    if dialect != "postgresql":
        log.info("041 skipped (SQLite)")
        return

    # ── Safety-net: extension creation ────────────────────────────────────
    # 040 already attempts this. Re-run here because:
    # (a) 040 may have failed on a non-superuser host and the operator
    #     has since enabled it out-of-band; in that case this call is a
    #     no-op thanks to IF NOT EXISTS.
    # (b) A fresh DB bootstrapped against this chain needs the extension
    #     either way.
    try:
        op.execute("CREATE EXTENSION IF NOT EXISTS vector")
        log.info("pgvector extension ensured")
    except Exception as exc:  # noqa: BLE001
        log.warning(
            "CREATE EXTENSION vector failed — will verify presence next: %s",
            exc,
        )

    # ── Verify the extension is actually loaded ───────────────────────────
    # If it isn't, we cannot CREATE the ``vector`` column type. Log
    # CRITICAL and bail so the app still boots against TEXT columns.
    try:
        result = bind.execute(
            sa.text("SELECT 1 FROM pg_extension WHERE extname = 'vector'")
        )
        row = result.fetchone()
    except Exception as exc:  # noqa: BLE001
        log.critical(
            "pg_extension probe failed — aborting 041; enable pgvector "
            "out-of-band and re-run. Underlying error: %s",
            exc,
        )
        return

    if row is None:
        log.critical(
            "pgvector missing — aborting 041; enable extension out-of-band "
            "and re-run"
        )
        return

    # ── Per-table: add column, backfill, add HNSW index ───────────────────
    for table, src_col, vec_col, idx_name, optional in _TARGETS:
        if optional and not _has_table(bind, table):
            log.info("table %s not present — skipping", table)
            continue

        # 1. Add sibling column. vector(200) via raw SQL so we don't need
        # to import pgvector.sqlalchemy inside the migration (keeps the
        # migration importable even when the Python pkg is missing).
        if _has_column(bind, table, vec_col):
            log.info(
                "%s.%s already present — skipping ADD COLUMN",
                table, vec_col,
            )
        else:
            try:
                op.execute(
                    sa.text(
                        f'ALTER TABLE "{table}" '
                        f'ADD COLUMN "{vec_col}" vector(200) NULL'
                    )
                )
                log.info("added %s.%s vector(200)", table, vec_col)
            except Exception as exc:  # noqa: BLE001
                log.warning(
                    "ADD COLUMN %s.%s failed — skipping backfill + index: %s",
                    table, vec_col, exc,
                )
                continue

        # 2. Backfill from embedding_json. embedding_json is a JSON list
        # of floats; cast via jsonb -> text -> vector. Rows with
        # malformed JSON will throw — we tolerate that per-table.
        try:
            bind.execute(
                sa.text(
                    f'UPDATE "{table}" '
                    f'SET "{vec_col}" = ("{src_col}"::jsonb)::text::vector '
                    f'WHERE "{src_col}" IS NOT NULL '
                    f'  AND "{vec_col}" IS NULL'
                )
            )
            log.info("backfilled %s.%s from %s", table, vec_col, src_col)
        except Exception as exc:  # noqa: BLE001
            log.warning(
                "backfill %s.%s from %s skipped (some rows may carry "
                "malformed JSON): %s",
                table, vec_col, src_col, exc,
            )

        # 3. HNSW cosine index — idempotent via IF NOT EXISTS.
        try:
            op.execute(
                sa.text(
                    f'CREATE INDEX IF NOT EXISTS "{idx_name}" '
                    f'ON "{table}" USING hnsw '
                    f'("{vec_col}" vector_cosine_ops)'
                )
            )
            log.info("HNSW index %s ensured", idx_name)
        except Exception as exc:  # noqa: BLE001
            log.warning("HNSW index %s creation skipped: %s", idx_name, exc)

    log.info("041 complete")


def downgrade() -> None:
    """Drop the HNSW indices + the new ``embedding`` columns.

    Leaves the ``embedding_json`` TEXT columns intact and does NOT drop
    the pgvector extension — other stack components (literature 87k
    corpus, e.g.) may still rely on it.

    SQLite is a no-op (upgrade was a no-op too).
    """
    bind = op.get_bind()
    dialect = bind.dialect.name
    log.info("041 downgrade on dialect=%s", dialect)

    if dialect != "postgresql":
        log.info("041 downgrade skipped (SQLite)")
        return

    for table, _src_col, vec_col, idx_name, optional in _TARGETS:
        if optional and not _has_table(bind, table):
            log.info("table %s not present — skipping downgrade", table)
            continue

        try:
            op.execute(sa.text(f'DROP INDEX IF EXISTS "{idx_name}"'))
            log.info("dropped index %s", idx_name)
        except Exception as exc:  # noqa: BLE001
            log.warning("drop_index %s skipped: %s", idx_name, exc)

        try:
            op.execute(
                sa.text(f'ALTER TABLE "{table}" DROP COLUMN IF EXISTS "{vec_col}"')
            )
            log.info("dropped column %s.%s", table, vec_col)
        except Exception as exc:  # noqa: BLE001
            log.warning("drop_column %s.%s skipped: %s", table, vec_col, exc)
