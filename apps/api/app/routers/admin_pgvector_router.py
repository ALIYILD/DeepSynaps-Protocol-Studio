"""Admin-only pgvector status endpoint.

Surface health / presence data for the native ``vector(200)`` columns
landed by migration 041. Used by operators to verify that a freshly-
deployed cluster has the extension enabled + the HNSW indices built.

Auth
----
Gated to ``admin`` via :func:`app.auth.require_minimum_role`. Never
exposed to guest / patient / clinician.
"""
from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, get_authenticated_actor, require_minimum_role
from app.database import get_db_session
from app.services.pgvector_bridge import check_pgvector_enabled


_log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])


# ── Response schema ──────────────────────────────────────────────────────────


class PgVectorCounts(BaseModel):
    """Per-table row counts for embedding presence."""

    qeeg_analyses_with_embedding: int
    mri_analyses_with_embedding: int
    papers_with_embedding: int
    kg_entities_with_embedding: int


class PgVectorStatusResponse(BaseModel):
    """Response envelope for ``GET /api/v1/admin/pgvector/status``."""

    enabled: bool
    version: str | None
    backend: str  # "postgresql" | "sqlite" | "unknown"
    counts: PgVectorCounts


# ── Helpers ──────────────────────────────────────────────────────────────────


_COUNT_TABLES: tuple[tuple[str, str], ...] = (
    ("qeeg_analyses", "qeeg_analyses_with_embedding"),
    ("mri_analyses", "mri_analyses_with_embedding"),
    ("papers", "papers_with_embedding"),
    ("kg_entities", "kg_entities_with_embedding"),
)

# Allowlist of table names that ``_count_with_embedding`` may
# interpolate into raw SQL via f-string. Pre-fix the helper accepted
# any ``table: str`` input — safe today because every call site
# passes a literal from ``_COUNT_TABLES``, but a future caller that
# forwarded user input would create a SQL-injection sink. The
# allowlist below is the load-bearing static guard.
_PGVECTOR_TABLE_ALLOWLIST = frozenset(t for t, _ in _COUNT_TABLES)


def _table_exists(session: Session, table: str) -> bool:
    """Return True if ``table`` exists on the bound engine.

    The ``papers`` table lives in the sibling 87k-literature DB and may
    not be present on every deployment, so we tolerate its absence
    rather than 500-ing on the status endpoint.
    """
    from sqlalchemy import inspect as sa_inspect

    try:
        return sa_inspect(session.get_bind()).has_table(table)
    except Exception as exc:  # noqa: BLE001
        _log.warning("has_table(%s) probe failed: %s", table, exc)
        return False


def _count_with_embedding(
    session: Session, table: str, *, backend: str
) -> int:
    """Count rows where embedding data is present.

    Parameters
    ----------
    session : sqlalchemy.orm.Session
    table : str
    backend : str
        Dialect name from :func:`check_pgvector_enabled`. When Postgres
        we count ``embedding IS NOT NULL`` (the native ``vector``
        column). Otherwise we fall back to
        ``embedding_json IS NOT NULL AND embedding_json != ''`` so
        SQLite deployments still return a meaningful number.

    Returns
    -------
    int
        Zero on any error (logged WARNING).
    """
    # Defense-in-depth: refuse any table name not in the static
    # allowlist. Today every call site passes a literal from
    # ``_COUNT_TABLES`` so this is a no-op, but it locks the
    # contract so a future caller that forwards user input cannot
    # turn the f-string interpolation below into SQL injection.
    if table not in _PGVECTOR_TABLE_ALLOWLIST:
        _log.warning(
            "rejecting pgvector count on non-allowlisted table %r", table
        )
        return 0

    if not _table_exists(session, table):
        return 0

    if backend == "postgresql":
        sql = text(
            f'SELECT COUNT(*) FROM "{table}" WHERE "embedding" IS NOT NULL'
        )
    else:
        sql = text(
            f'SELECT COUNT(*) FROM "{table}" '
            f"WHERE embedding_json IS NOT NULL AND embedding_json != ''"
        )

    try:
        value = session.execute(sql).scalar()
        return int(value or 0)
    except Exception as exc:  # noqa: BLE001
        # On Postgres this can trigger if 041 hasn't been applied yet
        # (no ``embedding`` column). Fall back to the TEXT column shape
        # in that case so the endpoint still returns a useful number.
        _log.info(
            "count with embedding on %s failed (%s); retrying via embedding_json",
            table, exc,
        )
        try:
            fallback = text(
                f'SELECT COUNT(*) FROM "{table}" '
                f"WHERE embedding_json IS NOT NULL AND embedding_json != ''"
            )
            value = session.execute(fallback).scalar()
            return int(value or 0)
        except Exception as exc2:  # noqa: BLE001
            _log.warning("fallback count on %s failed: %s", table, exc2)
            return 0


# ── Endpoint ─────────────────────────────────────────────────────────────────


@router.get("/pgvector/status", response_model=PgVectorStatusResponse)
async def pgvector_status(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> PgVectorStatusResponse:
    """Return pgvector extension status + per-table embedding row counts.

    Parameters
    ----------
    actor : AuthenticatedActor
        FastAPI-injected; must hold ``admin`` role.
    session : sqlalchemy.orm.Session
        FastAPI-injected DB session.

    Returns
    -------
    PgVectorStatusResponse
        See the pydantic model for the exact shape.

    Raises
    ------
    ApiServiceError
        ``403 insufficient_role`` when the caller is below admin.
    """
    require_minimum_role(actor, "admin")

    status = await check_pgvector_enabled(session)
    backend = status.get("backend", "unknown")

    counts_raw: dict[str, Any] = {
        out_key: _count_with_embedding(session, table, backend=backend)
        for table, out_key in _COUNT_TABLES
    }

    return PgVectorStatusResponse(
        enabled=bool(status.get("enabled", False)),
        version=status.get("version"),
        backend=backend,
        counts=PgVectorCounts(**counts_raw),
    )
