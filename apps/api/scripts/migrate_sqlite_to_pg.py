"""One-shot SQLite -> Postgres data copy with parity check.

Cutover tool for moving the DeepSynaps Protocol Studio app database from
per-machine SQLite (``/data/app.db``) to Fly Managed Postgres so the
``app`` / ``qeeg_worker`` / ``stripe_worker`` processes can share state.

Scope: ONLY the FastAPI ``/data/app.db`` (managed by ``apps/api/alembic``).
Sibling stores like ``evidence.db`` are left alone.

Behavior: SQLite opened ``mode=ro``; PG schema must be at head Alembic rev;
each table is truncated then bulk-inserted with PG-driven type coercion;
parity check on counts, PK min/max, and 5 deterministic random rows.

Usage::

    python migrate_sqlite_to_pg.py --sqlite /data/app.db --pg <url> \\
        [--dry-run] [--batch-size 5000] \\
        [--skip-table NAME]... [--only-table NAME]...
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sqlite3
import sys
import time
from collections import defaultdict, deque
from pathlib import Path
from random import Random
from typing import Any, Iterable, Iterator

from sqlalchemy import (
    MetaData,
    Table,
    create_engine,
    inspect,
    select,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY as PG_ARRAY, JSON as PG_JSON, JSONB
from sqlalchemy.engine import Connection, Engine
from sqlalchemy.types import (
    ARRAY,
    BigInteger,
    Boolean,
    Integer,
    JSON,
    SmallInteger,
)


def _parse_alembic_revisions(text_blob: str) -> tuple[str | None, list[str]]:
    """Return (revision, list_of_down_revisions) from a migration file body.

    Uses AST so multiline tuple `down_revision = (\n  "a",\n  "b",\n)`
    parses correctly. Returns (None, []) if the file isn't a migration.
    """
    import ast

    try:
        tree = ast.parse(text_blob)
    except SyntaxError:
        return None, []
    revision: str | None = None
    down: list[str] = []
    for node in tree.body:
        if not isinstance(node, (ast.Assign, ast.AnnAssign)):
            continue
        targets = (
            [t.id for t in node.targets if isinstance(t, ast.Name)]
            if isinstance(node, ast.Assign)
            else ([node.target.id] if isinstance(node.target, ast.Name) else [])
        )
        value = node.value
        if "revision" in targets and isinstance(value, ast.Constant) and isinstance(value.value, str):
            revision = value.value
        if "down_revision" in targets:
            if isinstance(value, ast.Constant) and isinstance(value.value, str):
                down = [value.value]
            elif isinstance(value, (ast.Tuple, ast.List)):
                down = [
                    elt.value
                    for elt in value.elts
                    if isinstance(elt, ast.Constant) and isinstance(elt.value, str)
                ]
    return revision, down


# --- CLI -------------------------------------------------------------------


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--sqlite", required=True, help="Path to source SQLite DB (read-only).")
    parser.add_argument("--pg", required=True, help="Target Postgres SQLAlchemy URL.")
    parser.add_argument("--dry-run", action="store_true", help="Roll back at the end; still verifies parity.")
    parser.add_argument("--batch-size", type=int, default=5000, help="Rows per INSERT batch (default 5000).")
    parser.add_argument("--skip-table", action="append", default=[], help="Table to skip (repeatable).")
    parser.add_argument("--only-table", action="append", default=[], help="If set, only migrate these (repeatable).")
    return parser.parse_args(argv)


# --- Alembic head discovery ------------------------------------------------


def _discover_alembic_head(versions_dir: Path) -> str:
    """Return the single Alembic head revision under ``versions_dir``.

    Aborts loudly on multiple heads -- merge them before cutover.
    """
    revisions: dict[str, str | None] = {}
    referenced: set[str] = set()
    for path in sorted(versions_dir.glob("*.py")):
        text_blob = path.read_text(encoding="utf-8", errors="replace")
        rev, down_ids = _parse_alembic_revisions(text_blob)
        if rev is None:
            continue
        revisions[rev] = down_ids[0] if down_ids else None
        for parent in down_ids:
            referenced.add(parent)

    heads = [rev for rev in revisions if rev not in referenced]
    if not heads:
        raise SystemExit(f"No Alembic head found under {versions_dir}")
    if len(heads) > 1:
        raise SystemExit(
            f"Multiple Alembic heads found ({len(heads)}): {', '.join(sorted(heads))}. "
            "Merge them before running this migration."
        )
    return heads[0]


def _check_alembic_version(pg_conn: Connection, expected: str) -> None:
    actual = pg_conn.execute(text("SELECT version_num FROM alembic_version")).scalar_one_or_none()
    if actual is None:
        raise SystemExit("Postgres has no alembic_version row -- run `alembic upgrade head` first.")
    if actual != expected:
        raise SystemExit(
            f"Alembic version mismatch: PG at {actual!r}, source tree head is {expected!r}. "
            "Run `alembic upgrade head` against the PG target before cutover."
        )


# --- Table discovery + FK ordering -----------------------------------------


_INTERNAL_PG_TABLES = {"alembic_version"}


def _list_sqlite_tables(sqlite_conn: sqlite3.Connection) -> list[str]:
    rows = sqlite_conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    ).fetchall()
    return sorted({r[0] for r in rows} - _INTERNAL_PG_TABLES)


def _list_pg_tables(pg_conn: Connection) -> list[str]:
    rows = pg_conn.execute(
        text(
            "SELECT table_name FROM information_schema.tables "
            "WHERE table_schema='public' AND table_type='BASE TABLE'"
        )
    ).all()
    return sorted({r[0] for r in rows} - _INTERNAL_PG_TABLES)


def _fk_edges(pg_conn: Connection, tables: set[str]) -> dict[str, set[str]]:
    """``edges[child] = {parents}`` -- every FK pointing at another in-scope table."""
    sql = text(
        """
        SELECT cl_child.relname AS child, cl_parent.relname AS parent
        FROM pg_constraint c
        JOIN pg_class cl_child  ON cl_child.oid  = c.conrelid
        JOIN pg_class cl_parent ON cl_parent.oid = c.confrelid
        JOIN pg_namespace n ON n.oid = cl_child.relnamespace
        WHERE c.contype = 'f' AND n.nspname = 'public'
        """
    )
    edges: dict[str, set[str]] = defaultdict(set)
    for child, parent in pg_conn.execute(sql):
        if child == parent:
            continue  # self-FK -- handle via session_replication_role inside table copy
        if child in tables and parent in tables:
            edges[child].add(parent)
    return edges


def _topo_sort(tables: list[str], edges: dict[str, set[str]]) -> tuple[list[str], list[str]]:
    """Kahn's algorithm. Cyclic tables are returned separately so the caller
    can defer them behind ``session_replication_role = 'replica'``."""
    indeg: dict[str, int] = {t: 0 for t in tables}
    fwd: dict[str, set[str]] = defaultdict(set)
    for child, parents in edges.items():
        for parent in parents:
            fwd[parent].add(child)
            indeg[child] = indeg.get(child, 0) + 1

    queue: deque[str] = deque(sorted(t for t, d in indeg.items() if d == 0))
    ordered: list[str] = []
    while queue:
        node = queue.popleft()
        ordered.append(node)
        for child in sorted(fwd.get(node, ())):
            indeg[child] -= 1
            if indeg[child] == 0:
                queue.append(child)

    cyclic = [t for t in tables if t not in ordered]
    return ordered, cyclic


# --- Type coercion (driven by the PG reflected column type) ----------------


def _is_array(col_type: Any) -> bool:
    return isinstance(col_type, (ARRAY, PG_ARRAY))


def _is_json(col_type: Any) -> bool:
    return isinstance(col_type, (JSON, PG_JSON, JSONB))


def _is_bool(col_type: Any) -> bool:
    return isinstance(col_type, Boolean)


def _is_integer(col_type: Any) -> bool:
    return isinstance(col_type, (Integer, BigInteger, SmallInteger))


def _coerce_value(value: Any, col_type: Any) -> Any:
    if value is None:
        return None
    if _is_bool(col_type):
        # SQLite stores bools as 0/1 ints; sometimes legacy data is "0"/"1"/"true"/"false".
        if isinstance(value, bool):
            return value
        if isinstance(value, (int, float)):
            return bool(int(value))
        if isinstance(value, str):
            v = value.strip().lower()
            if v in {"1", "true", "t", "yes", "y"}:
                return True
            if v in {"0", "false", "f", "no", "n", ""}:
                return False
        return bool(value)
    if _is_json(col_type):
        if isinstance(value, (dict, list)):
            return value
        if isinstance(value, str):
            stripped = value.strip()
            if not stripped:
                return None
            try:
                return json.loads(stripped)
            except json.JSONDecodeError:
                # Legacy free-text rows: keep them as a JSON string rather than blowing up.
                return stripped
        return value
    if _is_array(col_type):
        if isinstance(value, (list, tuple)):
            return list(value)
        if isinstance(value, str):
            stripped = value.strip()
            if not stripped:
                return None
            try:
                parsed = json.loads(stripped)
            except json.JSONDecodeError:
                return [stripped]
            return parsed if isinstance(parsed, list) else [parsed]
        return value
    return value


# --- Per-table copy --------------------------------------------------------


def _stream_sqlite_rows(
    sqlite_conn: sqlite3.Connection, table: str, columns: list[str], batch_size: int
) -> Iterator[list[dict[str, Any]]]:
    quoted = ", ".join(f'"{c}"' for c in columns)
    cur = sqlite_conn.execute(f'SELECT {quoted} FROM "{table}"')
    cur.arraysize = batch_size
    while True:
        rows = cur.fetchmany(batch_size)
        if not rows:
            return
        yield [dict(zip(columns, r)) for r in rows]


def _coerce_batch(batch: list[dict[str, Any]], pg_table: Table) -> list[dict[str, Any]]:
    coerced: list[dict[str, Any]] = []
    col_types = {c.name: c.type for c in pg_table.columns}
    for row in batch:
        coerced.append({name: _coerce_value(row.get(name), ctype) for name, ctype in col_types.items()})
    return coerced


def _truncate_table(pg_conn: Connection, table: str) -> None:
    pg_conn.execute(text(f'TRUNCATE TABLE "{table}" RESTART IDENTITY CASCADE'))
    leftover = pg_conn.execute(text(f'SELECT COUNT(*) FROM "{table}"')).scalar_one()
    if leftover:
        raise RuntimeError(f"TRUNCATE on {table} left {leftover} rows -- aborting")


def _reset_sequences(pg_conn: Connection, pg_table: Table) -> None:
    """Bump every owning sequence on integer PK columns to ``MAX(col)``."""
    for col in pg_table.primary_key.columns:
        if not _is_integer(col.type):
            continue
        seq_sql = text(
            "SELECT pg_get_serial_sequence(:tab, :col)"
        )
        seq_name = pg_conn.execute(seq_sql, {"tab": pg_table.name, "col": col.name}).scalar_one_or_none()
        if not seq_name:
            continue
        pg_conn.execute(
            text(
                f"SELECT setval(:seq, COALESCE((SELECT MAX(\"{col.name}\") FROM \"{pg_table.name}\"), 0) + 1, false)"
            ),
            {"seq": seq_name},
        )


def _copy_table(
    sqlite_conn: sqlite3.Connection,
    pg_conn: Connection,
    pg_table: Table,
    batch_size: int,
) -> tuple[int, float]:
    """Copy a single table. Returns ``(rows_copied, elapsed_seconds)``."""
    start = time.perf_counter()
    table = pg_table.name

    sqlite_cols = {r[1] for r in sqlite_conn.execute(f'PRAGMA table_info("{table}")')}
    pg_cols = [c.name for c in pg_table.columns]
    intersect_cols = [c for c in pg_cols if c in sqlite_cols]
    missing_in_sqlite = [c for c in pg_cols if c not in sqlite_cols]
    if missing_in_sqlite:
        # Column added in PG-only migrations; rely on column DEFAULT / NULL.
        print(f"  note: PG-only columns left to defaults: {', '.join(missing_in_sqlite)}")

    expected = sqlite_conn.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0]
    _truncate_table(pg_conn, table)

    if expected == 0:
        elapsed = time.perf_counter() - start
        return 0, elapsed

    insert_stmt = pg_table.insert()
    copied = 0
    for batch in _stream_sqlite_rows(sqlite_conn, table, intersect_cols, batch_size):
        coerced = _coerce_batch(batch, pg_table)
        pg_conn.execute(insert_stmt, coerced)
        copied += len(coerced)

    _reset_sequences(pg_conn, pg_table)

    if copied != expected:
        raise RuntimeError(f"Row count drift for {table}: copied={copied} expected={expected}")

    return copied, time.perf_counter() - start


# --- Parity check ----------------------------------------------------------


def _seeded_random(table: str) -> Random:
    digest = hashlib.sha256(table.encode("utf-8")).digest()
    seed = int.from_bytes(digest[:8], "big")
    return Random(seed)


def _single_pk_column(pg_table: Table) -> Any | None:
    cols = list(pg_table.primary_key.columns)
    if len(cols) != 1:
        return None
    return cols[0]


def _normalize_for_compare(value: Any, col_type: Any) -> Any:
    """Bring SQLite + PG values into a comparable form (booleans, JSON, arrays)."""
    if value is None:
        return None
    if _is_bool(col_type):
        if isinstance(value, bool):
            return value
        if isinstance(value, (int, float)):
            return bool(int(value))
        if isinstance(value, str):
            return value.strip().lower() in {"1", "true", "t", "yes", "y"}
        return bool(value)
    if _is_json(col_type):
        if isinstance(value, str):
            stripped = value.strip()
            if not stripped:
                return None
            try:
                return json.loads(stripped)
            except json.JSONDecodeError:
                return stripped
        return value
    if _is_array(col_type):
        if isinstance(value, str):
            stripped = value.strip()
            if not stripped:
                return None
            try:
                parsed = json.loads(stripped)
            except json.JSONDecodeError:
                return [stripped]
            return parsed if isinstance(parsed, list) else [parsed]
        if isinstance(value, tuple):
            return list(value)
        return value
    return value


def _verify_table(
    sqlite_conn: sqlite3.Connection,
    pg_conn: Connection,
    pg_table: Table,
    sample_size: int = 5,
) -> list[str]:
    """Return a list of mismatch messages (empty if parity holds)."""
    issues: list[str] = []
    table = pg_table.name

    sqlite_count = sqlite_conn.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0]
    pg_count = pg_conn.execute(text(f'SELECT COUNT(*) FROM "{table}"')).scalar_one()
    if sqlite_count != pg_count:
        issues.append(f"row count mismatch: sqlite={sqlite_count} pg={pg_count}")
        return issues  # no point checking further if counts disagree

    pk = _single_pk_column(pg_table)
    if pk is not None and _is_integer(pk.type) and sqlite_count:
        s_min, s_max = sqlite_conn.execute(
            f'SELECT MIN("{pk.name}"), MAX("{pk.name}") FROM "{table}"'
        ).fetchone()
        p_min, p_max = pg_conn.execute(
            text(f'SELECT MIN("{pk.name}") AS lo, MAX("{pk.name}") AS hi FROM "{table}"')
        ).one()
        if s_min != p_min or s_max != p_max:
            issues.append(f"PK min/max drift: sqlite=({s_min},{s_max}) pg=({p_min},{p_max})")

    if pk is not None and sqlite_count:
        all_pks = [r[0] for r in sqlite_conn.execute(f'SELECT "{pk.name}" FROM "{table}"')]
        rng = _seeded_random(table)
        sample = rng.sample(all_pks, min(sample_size, len(all_pks)))
        sqlite_cols = {r[1] for r in sqlite_conn.execute(f'PRAGMA table_info("{table}")')}
        compare_cols = [c for c in pg_table.columns if c.name in sqlite_cols]
        col_names = [c.name for c in compare_cols]
        sql_quoted = ", ".join(f'"{c}"' for c in col_names)
        for pk_value in sample:
            srow = sqlite_conn.execute(
                f'SELECT {sql_quoted} FROM "{table}" WHERE "{pk.name}" = ?', (pk_value,)
            ).fetchone()
            prow = pg_conn.execute(
                text(f'SELECT {sql_quoted} FROM "{table}" WHERE "{pk.name}" = :pk'),
                {"pk": pk_value},
            ).one_or_none()
            if srow is None or prow is None:
                issues.append(f"row missing on one side for pk={pk_value!r}")
                continue
            for col, sval, pval in zip(compare_cols, srow, prow):
                norm_s = _normalize_for_compare(sval, col.type)
                norm_p = _normalize_for_compare(pval, col.type)
                if norm_s != norm_p:
                    issues.append(
                        f"col {col.name} drift @ pk={pk_value!r}: "
                        f"sqlite={norm_s!r} pg={norm_p!r}"
                    )

    return issues


# --- Driver ----------------------------------------------------------------


def _open_sqlite(path: str) -> sqlite3.Connection:
    p = Path(path)
    if not p.is_file():
        raise SystemExit(f"SQLite file not found: {path}")
    uri = f"file:{p.resolve().as_posix()}?mode=ro"
    return sqlite3.connect(uri, uri=True)


def _select_tables(
    sqlite_tables: list[str],
    pg_tables: list[str],
    only: Iterable[str],
    skip: Iterable[str],
) -> list[str]:
    skip_set = {t for t in skip if t}
    only_set = {t for t in only if t}
    sqlite_set = set(sqlite_tables)
    pg_set = set(pg_tables)
    # Apply --skip-table to BOTH sides before drift comparison so a deliberately
    # skipped table (e.g. patient_vectors with pgvector absent) doesn't trip the
    # ABORT below.
    sqlite_set -= skip_set
    pg_set -= skip_set
    sqlite_only = sorted(sqlite_set - pg_set)
    pg_only = sorted(pg_set - sqlite_set)
    intersect = sorted(sqlite_set & pg_set)

    print(f"SQLite tables: {len(sqlite_set)}  PG tables: {len(pg_set)}  intersect: {len(intersect)}")
    if pg_only:
        print(f"  PG-only (will be left empty): {', '.join(pg_only)}")
    if sqlite_only:
        raise SystemExit(
            "ABORT: SQLite has tables that don't exist in PG: "
            f"{', '.join(sqlite_only)}. Bring the PG schema up to date first."
        )

    selected = list(intersect)
    if only_set:
        bad = only_set - set(selected)
        if bad:
            raise SystemExit(f"--only-table not found: {', '.join(sorted(bad))}")
        selected = [t for t in selected if t in only_set]
    if skip_set:
        selected = [t for t in selected if t not in skip_set]
    return selected


def _resolve_versions_dir() -> Path:
    return Path(__file__).resolve().parents[1] / "alembic" / "versions"


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    versions_dir = _resolve_versions_dir()
    expected_head = _discover_alembic_head(versions_dir)
    print(f"Alembic head from {versions_dir}: {expected_head}")

    sqlite_conn = _open_sqlite(args.sqlite)
    sqlite_conn.row_factory = sqlite3.Row
    pg_engine: Engine = create_engine(args.pg, future=True)

    with pg_engine.connect() as pg_conn:
        _check_alembic_version(pg_conn, expected_head)

        sqlite_tables = _list_sqlite_tables(sqlite_conn)
        pg_tables = _list_pg_tables(pg_conn)
        selected = _select_tables(sqlite_tables, pg_tables, args.only_table, args.skip_table)

        edges = _fk_edges(pg_conn, set(selected))
        ordered, cyclic = _topo_sort(selected, edges)
        if cyclic:
            print(f"FK cycles -> deferred via session_replication_role: {', '.join(cyclic)}")

        metadata = MetaData()
        # Reflect every selected table once, up front (cheap, single round-trip per table).
        reflected: dict[str, Table] = {}
        for name in selected:
            reflected[name] = Table(name, metadata, autoload_with=pg_conn)

        outer = pg_conn.begin()
        per_table_results: list[tuple[str, int, float]] = []
        try:
            print(f"\nCopy phase ({'DRY RUN' if args.dry_run else 'COMMIT'}):")
            with pg_conn.begin_nested():
                pg_conn.execute(text("SET CONSTRAINTS ALL DEFERRED"))
            # Defer FK checks for cyclic tables; for ordered ones we still trust the topo order.
            if cyclic:
                pg_conn.execute(text("SET session_replication_role = 'replica'"))

            for table in ordered + cyclic:
                pg_table = reflected[table]
                with pg_conn.begin_nested():
                    rows, elapsed = _copy_table(sqlite_conn, pg_conn, pg_table, args.batch_size)
                expected = sqlite_conn.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0]
                per_table_results.append((table, rows, elapsed))
                print(f"  {table}: copied {rows}/{expected} rows in {elapsed:.2f}s")

            if cyclic:
                pg_conn.execute(text("SET session_replication_role = 'origin'"))

            # Parity check still runs inside the same transaction so dry-runs verify.
            print("\nParity phase:")
            mismatches: list[tuple[str, list[str]]] = []
            for table in ordered + cyclic:
                pg_table = reflected[table]
                issues = _verify_table(sqlite_conn, pg_conn, pg_table)
                if issues:
                    mismatches.append((table, issues))
                    print(f"  MISMATCH {table}:")
                    for msg in issues:
                        print(f"    - {msg}")
                else:
                    count = pg_conn.execute(text(f'SELECT COUNT(*) FROM "{table}"')).scalar_one()
                    print(f"  OK {table}: {count} rows")

            if mismatches:
                outer.rollback()
                raise SystemExit(f"\nABORT: {len(mismatches)} table(s) failed parity. Transaction rolled back.")

            if args.dry_run:
                outer.rollback()
                print("\nDRY RUN complete -- transaction rolled back, no data committed.")
            else:
                outer.commit()
                print("\nCOMMIT complete.")
        except Exception:
            outer.rollback()
            raise

    sqlite_conn.close()
    pg_engine.dispose()

    total_rows = sum(rows for _, rows, _ in per_table_results)
    total_secs = sum(elapsed for _, _, elapsed in per_table_results)
    print(f"\nTotal: {total_rows} rows across {len(per_table_results)} tables in {total_secs:.2f}s")
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
