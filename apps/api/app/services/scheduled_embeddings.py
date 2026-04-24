"""Scheduled MedRAG paper-embedding cycle.

Wraps :func:`scripts.embed_papers.run_embedding` in an async-friendly
entry-point that can be invoked from the existing Celery worker / cron
harness. The routine processes ``max_batches * batch_size`` pending rows
per call — callers schedule it at whatever cadence suits the paper
ingestion rate.

The underlying script is CPU-bound (sentence-transformers encode +
pgvector UPDATE). We therefore push it through ``asyncio.to_thread``
so it does not block the event loop. If
``sentence-transformers`` is not installed, the cycle returns a
well-formed error envelope instead of raising, so the scheduler keeps
running.
"""
from __future__ import annotations

import asyncio
import logging
import os
import sys
import time
from pathlib import Path
from typing import Any

log = logging.getLogger(__name__)


# Make ``scripts/embed_papers.py`` importable regardless of cwd.
_REPO_ROOT = Path(__file__).resolve().parents[4]
_SCRIPTS_DIR = _REPO_ROOT / "scripts"
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))


def _resolve_database_url(db_session: Any | None) -> str | None:
    """Resolve the SQLAlchemy URL to feed to the embedding script.

    Prefers the bound session's engine URL (so we stay inside the same
    database that the caller is already working against), falling back
    to ``DEEPSYNAPS_DATABASE_URL`` from the environment.
    """
    if db_session is not None:
        try:
            bind = getattr(db_session, "bind", None) or getattr(
                db_session, "get_bind", lambda: None
            )()
            if bind is not None and hasattr(bind, "url"):
                return str(bind.url)
        except Exception as exc:  # pragma: no cover - defensive
            log.debug("could not resolve session URL: %s", exc)
    return os.environ.get("DEEPSYNAPS_DATABASE_URL")


def _run_cycle_sync(
    database_url: str, *, batch_size: int, max_batches: int
) -> dict[str, Any]:
    """Synchronous body of :func:`run_embed_papers_cycle`."""
    try:
        import embed_papers  # type: ignore
    except Exception as exc:  # pragma: no cover - path mis-configuration
        log.warning("embed_papers import failed: %s", exc)
        return {
            "embedded": 0,
            "pending": 0,
            "elapsed_sec": 0.0,
            "error": f"embed_papers import failed: {exc}",
        }

    start = time.monotonic()
    try:
        summary = embed_papers.run_embedding(
            database_url=database_url,
            batch_size=batch_size,
            max_batches=max_batches,
            dry_run=False,
        )
    except Exception as exc:  # pragma: no cover - runtime
        log.exception("scheduled embedding cycle crashed: %s", exc)
        return {
            "embedded": 0,
            "pending": 0,
            "elapsed_sec": time.monotonic() - start,
            "error": f"cycle crashed: {exc}",
        }

    envelope: dict[str, Any] = {
        "embedded": int(summary.embedded),
        "pending": max(int(summary.pending_before) - int(summary.embedded), 0),
        "elapsed_sec": float(summary.elapsed_sec),
    }
    if summary.error:
        envelope["error"] = summary.error
    return envelope


async def run_embed_papers_cycle(
    db_session: Any | None,
    *,
    batch_size: int = 64,
    max_batches: int = 10,
) -> dict[str, Any]:
    """Embed up to ``max_batches * batch_size`` pending papers.

    Parameters
    ----------
    db_session : Any or None
        Optional SQLAlchemy session. Used to resolve the database URL;
        the embedding script opens its own engine to manage transactions
        cleanly.
    batch_size : int, optional
        Rows per transaction (default 64).
    max_batches : int, optional
        Cap on the number of batches processed per call (default 10).

    Returns
    -------
    dict
        ``{"embedded": int, "pending": int, "elapsed_sec": float}``.
        An ``error`` key is added when sentence-transformers is missing
        or the script could not be imported.
    """
    database_url = _resolve_database_url(db_session)
    if not database_url:
        return {
            "embedded": 0,
            "pending": 0,
            "elapsed_sec": 0.0,
            "error": "DEEPSYNAPS_DATABASE_URL is not set",
        }

    return await asyncio.to_thread(
        _run_cycle_sync,
        database_url,
        batch_size=batch_size,
        max_batches=max_batches,
    )
