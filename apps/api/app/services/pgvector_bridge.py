"""pgvector runtime bridge — dialect-aware helpers for native vector queries.

This module is the thin adapter between FastAPI route handlers and the
native ``vector(200)`` columns created by migration 041. It must remain
importable under *every* dialect we support (Postgres in production,
SQLite in the test harness), so every public function degrades
gracefully when pgvector is absent.

Public API
----------
HAS_PGVECTOR_RUNTIME : bool
    True when the ``pgvector`` Python package is importable. Does NOT
    imply the DB extension is enabled — call :func:`check_pgvector_enabled`
    against a live session for that.

check_pgvector_enabled(db_session) -> dict
    Probes ``pg_extension`` for ``vector``. Returns a shape-stable dict
    on every backend so callers don't need dialect branches.

cosine_similar(...) -> list[dict]
    Generic cosine-ANN helper that issues the ``<=>`` distance operator
    provided by pgvector. Returns ``[]`` cleanly on SQLite or when the
    ``embedding`` column is empty.

Notes
-----
* The ``db_session`` parameters are sync SQLAlchemy :class:`Session`
  instances (matching ``app.database.get_db_session``). The helpers are
  declared ``async def`` so they compose with the app's async route
  handlers; actual DB work is sync.
* No ``ApiServiceError`` raised from these helpers — they're meant to
  be library code. Route handlers map results to HTTP-level shapes.
"""
from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session


_log = logging.getLogger(__name__)


# ── Import guard ─────────────────────────────────────────────────────────────
# We only care whether the Python package is importable here; the live
# extension check runs against the session in ``check_pgvector_enabled``.
try:  # pragma: no cover — covered indirectly by the bridge tests
    import pgvector  # type: ignore[import-not-found]  # noqa: F401
    HAS_PGVECTOR_RUNTIME: bool = True
except ImportError:
    HAS_PGVECTOR_RUNTIME = False


def _dialect_name(db_session: Session) -> str:
    """Return the lowercase dialect name for the session's bind.

    Parameters
    ----------
    db_session : sqlalchemy.orm.Session

    Returns
    -------
    str
        Typically ``"postgresql"`` or ``"sqlite"``. Returns ``"unknown"``
        when the bind is missing (defensive; should not happen in the
        normal request lifecycle).
    """
    bind = db_session.get_bind()
    if bind is None:
        return "unknown"
    return bind.dialect.name.lower()


async def check_pgvector_enabled(db_session: Session) -> dict[str, Any]:
    """Probe the live DB for the pgvector extension.

    Parameters
    ----------
    db_session : sqlalchemy.orm.Session
        An open session bound to the application database.

    Returns
    -------
    dict
        Shape::

            {
                "enabled": bool,
                "version": str | None,
                "backend": "postgresql" | "sqlite" | "unknown",
            }

        On SQLite / non-Postgres backends this is always
        ``{"enabled": False, "version": None, "backend": "sqlite"}``
        (or similar) — the function never raises.
    """
    backend = _dialect_name(db_session)

    if backend != "postgresql":
        return {"enabled": False, "version": None, "backend": backend}

    try:
        row = db_session.execute(
            text(
                "SELECT extname, extversion FROM pg_extension "
                "WHERE extname = 'vector'"
            )
        ).fetchone()
    except Exception as exc:  # noqa: BLE001 — defensive; DB might be mid-migration
        _log.warning("pg_extension probe failed: %s", exc)
        return {"enabled": False, "version": None, "backend": backend}

    if row is None:
        return {"enabled": False, "version": None, "backend": backend}

    # Row ordering matches the SELECT column list above.
    version = row[1] if len(row) > 1 else None
    return {"enabled": True, "version": version, "backend": backend}


def _format_vector_literal(values: list[float]) -> str:
    """Format a Python list of floats as a pgvector literal.

    pgvector accepts the string form ``"[0.1,0.2,0.3]"`` when cast to
    ``vector``. This helper keeps the formatting centralised so we
    don't scatter JSON-ish string construction across query sites.

    Parameters
    ----------
    values : list[float]

    Returns
    -------
    str
    """
    return "[" + ",".join(f"{float(v)}" for v in values) + "]"


def _build_filter_clause(
    filters: dict[str, Any] | None,
) -> tuple[str, dict[str, Any]]:
    """Translate a simple dict of equality filters into a WHERE fragment.

    Only supports equality. Nested/range filters are out of scope for
    the v1 helper (they're rare in the current call sites).

    Parameters
    ----------
    filters : dict or None
        Mapping of column name → scalar value. Keys are validated
        against a conservative regex-like whitelist (alnum + underscore)
        to avoid SQL injection, since they interpolate directly into
        the generated SQL.

    Returns
    -------
    tuple[str, dict]
        ``(fragment, bind_params)``. ``fragment`` is either an empty
        string (no filters) or a leading ``" AND ..."`` clause. Bind
        params use an ``f_<col>`` prefix to avoid collision with the
        query-vector / k parameters used by the caller.
    """
    if not filters:
        return "", {}

    fragments: list[str] = []
    bind: dict[str, Any] = {}
    for raw_key, value in filters.items():
        if not raw_key or not all(ch.isalnum() or ch == "_" for ch in raw_key):
            _log.warning("dropping non-identifier filter key: %r", raw_key)
            continue
        param = f"f_{raw_key}"
        fragments.append(f'"{raw_key}" = :{param}')
        bind[param] = value

    if not fragments:
        return "", {}
    return " AND " + " AND ".join(fragments), bind


async def cosine_similar(
    table: str,
    column: str,
    query_embedding: list[float],
    *,
    k: int = 10,
    filters: dict[str, Any] | None = None,
    db_session: Session,
) -> list[dict[str, Any]]:
    """Run a cosine-distance ANN lookup against a pgvector column.

    Parameters
    ----------
    table : str
        Table name (e.g. ``"qeeg_analyses"``). Validated against an
        identifier whitelist before interpolation.
    column : str
        Name of the ``vector(200)`` column. Defaults to ``embedding``
        at the call sites but we keep it parameterised for future
        multi-embedding schemas.
    query_embedding : list[float]
        The query vector, same dimensionality as the column
        (``vector(200)`` in the current schema; the function does not
        enforce length so reshaped vectors remain the caller's job).
    k : int, default 10
        Max rows to return.
    filters : dict, optional
        Flat equality filters on additional columns. Keys are validated
        against an identifier whitelist.
    db_session : sqlalchemy.orm.Session
        Keyword-only. Open session.

    Returns
    -------
    list[dict]
        Each entry::

            {"id": <pk value>, "similarity": float, "distance": float}

        ``similarity`` is ``1 - cosine_distance`` and therefore lies in
        ``[0, 2]`` (bounded by pgvector's ``<=>`` operator semantics).

        Returns ``[]`` when:
          * the backend is not Postgres,
          * ``pgvector`` is not installed on the DB,
          * the table/column rejects identifier validation,
          * the query raises for any reason (logged WARNING).
    """
    # ── Identifier validation — we interpolate these directly. ────────────
    for ident, label in ((table, "table"), (column, "column")):
        if not ident or not all(ch.isalnum() or ch == "_" for ch in ident):
            _log.warning("cosine_similar: invalid %s identifier %r", label, ident)
            return []

    backend = _dialect_name(db_session)
    if backend != "postgresql":
        return []

    # pgvector literal for the query vector.
    q_literal = _format_vector_literal(query_embedding)

    filter_sql, filter_binds = _build_filter_clause(filters)

    # Prefer a stable primary-key discovery via the SQLAlchemy inspector
    # so the helper works across tables with different PK names.
    pk_col = _resolve_pk_column(db_session, table)

    sql = text(
        f'SELECT "{pk_col}" AS id, '
        f'       1 - ("{column}" <=> CAST(:q AS vector)) AS similarity, '
        f'       ("{column}" <=> CAST(:q AS vector)) AS distance '
        f'FROM "{table}" '
        f'WHERE "{column}" IS NOT NULL'
        f'{filter_sql} '
        f'ORDER BY "{column}" <=> CAST(:q AS vector) '
        f'LIMIT :k'
    )

    params: dict[str, Any] = {"q": q_literal, "k": int(k)}
    params.update(filter_binds)

    try:
        rows = db_session.execute(sql, params).mappings().all()
    except Exception as exc:  # noqa: BLE001
        _log.warning("cosine_similar failed on %s.%s: %s", table, column, exc)
        return []

    return [
        {
            "id": r.get("id"),
            "similarity": float(r.get("similarity", 0.0) or 0.0),
            "distance": float(r.get("distance", 0.0) or 0.0),
        }
        for r in rows
    ]


def _resolve_pk_column(db_session: Session, table: str) -> str:
    """Return the primary-key column name for ``table``.

    Falls back to ``"id"`` when introspection fails. The returned value
    is passed through an identifier whitelist on the caller side by way
    of the SQL interpolation — but we still restrict the fallback to a
    safe literal.

    Parameters
    ----------
    db_session : sqlalchemy.orm.Session
    table : str

    Returns
    -------
    str
    """
    from sqlalchemy import inspect as sa_inspect

    try:
        insp = sa_inspect(db_session.get_bind())
        pk = insp.get_pk_constraint(table).get("constrained_columns") or []
        if pk and all(ch.isalnum() or ch == "_" for ch in pk[0]):
            return pk[0]
    except Exception as exc:  # noqa: BLE001
        _log.debug("PK introspection failed for %s: %s", table, exc)
    return "id"
