"""Unit tests for ``app.services.pgvector_bridge``.

All four tests run against the SQLite test harness, so they cover the
graceful-fallback contracts. Postgres-specific paths (the actual
``<=>`` ANN operator) are covered by out-of-band integration tests
outside this suite.
"""
from __future__ import annotations

import asyncio

from app.database import SessionLocal
from app.services import pgvector_bridge
from app.services.pgvector_bridge import (
    HAS_PGVECTOR_RUNTIME,
    _build_filter_clause,
    check_pgvector_enabled,
    cosine_similar,
    cosine_similar_sync,
)


def _run_async(coro):
    """Drive an async coroutine synchronously without pytest-asyncio.

    Builds a fresh event loop per call so no cross-test state leaks.
    """
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


def test_check_pgvector_enabled_on_sqlite_returns_disabled_shape() -> None:
    """On SQLite the probe must report disabled + the ``sqlite`` backend."""
    session = SessionLocal()
    try:
        result = _run_async(check_pgvector_enabled(session))
    finally:
        session.close()

    assert result["enabled"] is False
    assert result["backend"] == "sqlite"
    assert result["version"] is None


def test_cosine_similar_returns_empty_on_sqlite() -> None:
    """The ANN helper must degrade to ``[]`` on non-Postgres backends."""
    session = SessionLocal()
    try:
        rows = _run_async(
            cosine_similar(
                table="qeeg_analyses",
                column="embedding",
                query_embedding=[0.1] * 200,
                k=5,
                db_session=session,
            )
        )
    finally:
        session.close()

    assert rows == []


def test_cosine_similar_sync_returns_empty_on_sqlite() -> None:
    """Sync ANN must match async: empty on SQLite without raising."""
    session = SessionLocal()
    try:
        rows = cosine_similar_sync(
            table="qeeg_analyses",
            column="embedding",
            query_embedding=[0.1] * 200,
            k=5,
            db_session=session,
        )
    finally:
        session.close()

    assert rows == []


def test_has_pgvector_runtime_reflects_import_guard() -> None:
    """The module-level flag must agree with a fresh import probe."""
    try:
        import pgvector  # type: ignore[import-not-found]  # noqa: F401

        expected = True
    except ImportError:
        expected = False

    assert isinstance(HAS_PGVECTOR_RUNTIME, bool)
    assert HAS_PGVECTOR_RUNTIME is expected
    assert pgvector_bridge.HAS_PGVECTOR_RUNTIME is expected


def test_build_filter_clause_applies_filters_safely() -> None:
    """Identifier-whitelisted filters bind correctly; bad keys are dropped."""
    fragment, binds = _build_filter_clause(
        {"patient_id": "p-42", "state": "done", "bad col; DROP": "x"}
    )
    assert fragment.startswith(" AND ")
    assert '"patient_id" = :f_patient_id' in fragment
    assert '"state" = :f_state' in fragment
    assert "DROP" not in fragment
    assert binds == {"f_patient_id": "p-42", "f_state": "done"}
