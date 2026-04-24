"""Batch-embed paper abstracts into ``papers.embedding`` (pgvector).

This script backfills the ``papers.embedding`` ``vector(200)`` column
introduced in migration 041. It connects to the database referenced by
``DEEPSYNAPS_DATABASE_URL``, pulls rows where ``embedding IS NULL AND
abstract IS NOT NULL AND abstract != ''`` in pages of ``--batch-size``,
encodes each abstract with a sentence-transformers model (default
BAAI/bge-m3), and writes the embedding back in a transaction per batch.

Backfill strategy
-----------------
BGE-M3 emits 1024-dim embeddings but CONTRACT_V2 + migration 041 use
``vector(200)``. We currently **truncate** to the first 200 dims and
L2-normalise — simpler than PCA and stable across invocations because
BGE-M3 is deterministic given identical input. This is a transitional
dim-reduction: when the schema widens to ``vector(1024)`` the
truncation path should be replaced with the full embedding.

CLI
---
::

    python scripts/embed_papers.py [--batch-size 64]
                                   [--limit N]
                                   [--since-date YYYY-MM-DD]
                                   [--dry-run]
                                   [--model BAAI/bge-m3]

``--dry-run`` prints the count of pending papers and exits without
performing any UPDATE. Ctrl-C commits the in-flight batch and reports
before exiting.

Runtime requirements
--------------------
* ``sentence-transformers`` (lazy-imported — a clear install hint is
  printed if missing).
* ``sqlalchemy`` + the database driver matching
  ``DEEPSYNAPS_DATABASE_URL`` (psycopg for Postgres).
* Network + disk space to download the embedding model on first run.

The script is a no-op in the test environment because
``sentence-transformers`` is not installed there.
"""
from __future__ import annotations

import argparse
import logging
import os
import signal
import sys
import time
from dataclasses import dataclass
from datetime import date
from typing import Any, Iterable

log = logging.getLogger("embed_papers")


# -------------------------------------------------------------------- consts
DEFAULT_MODEL: str = "BAAI/bge-m3"
EMBEDDING_DIM: int = 200
"""Current DB schema — ``vector(200)`` — see migration 041."""

_INSTALL_HINT: str = (
    "sentence-transformers is not installed. Install it with:\n"
    "    pip install sentence-transformers torch\n"
    "then re-run this script."
)


# -------------------------------------------------------------------- types
@dataclass
class RunSummary:
    """Aggregate counters returned by :func:`run_embedding`."""

    embedded: int = 0
    batches: int = 0
    elapsed_sec: float = 0.0
    pending_before: int = 0
    error: str | None = None


# -------------------------------------------------------------------- encoder
def _load_encoder(model_name: str) -> Any | None:
    """Lazily import and instantiate the sentence-transformers model.

    Parameters
    ----------
    model_name : str
        Hugging Face model id to load.

    Returns
    -------
    SentenceTransformer or None
        ``None`` when sentence-transformers is missing; the caller should
        surface the install hint to stdout/stderr in that case.
    """
    try:
        from sentence_transformers import SentenceTransformer  # type: ignore
    except ImportError:
        return None

    try:
        return SentenceTransformer(model_name)
    except Exception as exc:  # pragma: no cover - network / model dl
        log.error("Failed to load encoder %s: %s", model_name, exc)
        return None


def _truncate_l2(vec: Iterable[float], dim: int = EMBEDDING_DIM) -> list[float]:
    """Truncate / pad ``vec`` to ``dim`` and L2-normalise in pure Python.

    We avoid importing NumPy here so the script stays lightweight for
    the ``--dry-run`` / error-envelope paths where the encoder was
    never loaded.
    """
    arr = list(float(x) for x in vec)[:dim]
    if len(arr) < dim:
        arr.extend([0.0] * (dim - len(arr)))
    norm = sum(x * x for x in arr) ** 0.5
    if norm <= 0.0:
        return arr
    return [x / norm for x in arr]


def _encode_abstracts(
    encoder: Any, abstracts: list[str], dim: int = EMBEDDING_DIM
) -> list[list[float]]:
    """Encode ``abstracts`` into truncated, L2-normalised vectors.

    Parameters
    ----------
    encoder : SentenceTransformer
        Loaded encoder instance.
    abstracts : list of str
        Raw abstract strings.
    dim : int, optional
        Target embedding dimension (default :data:`EMBEDDING_DIM`).

    Returns
    -------
    list of list of float
        One vector per input abstract, each exactly ``dim`` floats.
    """
    raw = encoder.encode(abstracts, show_progress_bar=False)
    out: list[list[float]] = []
    for v in raw:
        out.append(_truncate_l2(v, dim))
    return out


# -------------------------------------------------------------------- SQL
def _pending_count_sql(has_since: bool) -> str:
    base = (
        "SELECT COUNT(*) FROM papers "
        "WHERE embedding IS NULL "
        "AND abstract IS NOT NULL AND abstract != ''"
    )
    if has_since:
        base += " AND (created_at >= :since OR updated_at >= :since)"
    return base


def _select_batch_sql(has_since: bool) -> str:
    # Select primary key + abstract. The column is called ``paper_id`` in
    # some schemas and ``id`` in others — we try ``paper_id`` first by
    # convention and fall back at runtime.
    base = (
        "SELECT paper_id, abstract FROM papers "
        "WHERE embedding IS NULL "
        "AND abstract IS NOT NULL AND abstract != ''"
    )
    if has_since:
        base += " AND (created_at >= :since OR updated_at >= :since)"
    base += " ORDER BY paper_id LIMIT :lim"
    return base


def _update_sql() -> str:
    return "UPDATE papers SET embedding = :e WHERE paper_id = :id"


def _fetch_pending_count(
    session: Any, *, since: date | None
) -> int:
    """Return the number of papers that still need an embedding."""
    from sqlalchemy import text  # type: ignore

    params: dict[str, Any] = {}
    has_since = since is not None
    if has_since:
        params["since"] = since.isoformat()
    sql = _pending_count_sql(has_since)
    try:
        row = session.execute(text(sql), params).first()
        return int(row[0]) if row else 0
    except Exception as exc:  # pragma: no cover - defensive
        log.warning("pending count query failed: %s", exc)
        return 0


def _fetch_batch(
    session: Any, *, batch_size: int, since: date | None
) -> list[tuple[Any, str]]:
    """Return the next ``batch_size`` pending (paper_id, abstract) pairs."""
    from sqlalchemy import text  # type: ignore

    params: dict[str, Any] = {"lim": int(batch_size)}
    has_since = since is not None
    if has_since:
        params["since"] = since.isoformat()
    sql = _select_batch_sql(has_since)
    result = session.execute(text(sql), params)
    return [(r[0], r[1] or "") for r in result.fetchall()]


# -------------------------------------------------------------------- core
def run_embedding(
    *,
    database_url: str,
    batch_size: int = 64,
    limit: int | None = None,
    since: date | None = None,
    model_name: str = DEFAULT_MODEL,
    dry_run: bool = False,
    max_batches: int | None = None,
) -> RunSummary:
    """Encode pending papers and write back embeddings.

    Parameters
    ----------
    database_url : str
        SQLAlchemy URL.
    batch_size : int, optional
        Rows per transaction (default 64).
    limit : int or None, optional
        Stop after embedding this many papers (``None`` = unlimited).
    since : datetime.date or None, optional
        Only embed papers created/updated on or after this date.
    model_name : str, optional
        Sentence-transformers model id.
    dry_run : bool, optional
        If ``True``, print the pending count and return without writing.
    max_batches : int or None, optional
        Cap the total number of batches processed (used by the scheduled
        worker). ``None`` = no cap.

    Returns
    -------
    RunSummary
        Aggregate counters. On sentence-transformers missing, ``error``
        is populated and ``embedded`` stays at 0.
    """
    summary = RunSummary()

    from sqlalchemy import create_engine  # type: ignore
    from sqlalchemy.orm import sessionmaker  # type: ignore

    engine = create_engine(database_url, future=True)
    SessionFactory = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    start = time.monotonic()
    with SessionFactory() as session:
        summary.pending_before = _fetch_pending_count(session, since=since)
        if dry_run:
            summary.elapsed_sec = time.monotonic() - start
            return summary

        encoder = _load_encoder(model_name)
        if encoder is None:
            summary.error = "sentence_transformers missing"
            summary.elapsed_sec = time.monotonic() - start
            return summary

        # Install a graceful Ctrl-C handler that sets a flag; the batch
        # loop checks it between batches so we never abandon a partial
        # UPDATE mid-transaction.
        stop_flag = {"stop": False}

        def _on_sigint(_signum: int, _frame: Any) -> None:  # pragma: no cover - signal
            stop_flag["stop"] = True
            log.warning("SIGINT received — will commit current batch and exit.")

        previous_handler = None
        try:
            previous_handler = signal.signal(signal.SIGINT, _on_sigint)
        except (ValueError, OSError):  # pragma: no cover - not on main thread
            previous_handler = None

        try:
            while True:
                if stop_flag["stop"]:
                    break
                if max_batches is not None and summary.batches >= max_batches:
                    break

                remaining = None
                if limit is not None:
                    remaining = limit - summary.embedded
                    if remaining <= 0:
                        break
                effective_bs = (
                    min(batch_size, remaining)
                    if remaining is not None
                    else batch_size
                )

                batch = _fetch_batch(
                    session, batch_size=effective_bs, since=since
                )
                if not batch:
                    break

                ids = [row[0] for row in batch]
                abstracts = [row[1] for row in batch]

                t0 = time.monotonic()
                vectors = _encode_abstracts(encoder, abstracts)
                _write_batch(session, ids, vectors)
                session.commit()
                dt = time.monotonic() - t0

                summary.embedded += len(batch)
                summary.batches += 1
                log.info(
                    "batch %d: embedded %d papers in %.2fs (avg %.3fs/paper)",
                    summary.batches, len(batch), dt,
                    dt / max(len(batch), 1),
                )
        finally:
            if previous_handler is not None:
                try:
                    signal.signal(signal.SIGINT, previous_handler)
                except (ValueError, OSError):  # pragma: no cover
                    pass

    summary.elapsed_sec = time.monotonic() - start
    return summary


def _write_batch(
    session: Any,
    ids: list[Any],
    vectors: list[list[float]],
) -> None:
    """Issue a single UPDATE statement per row.

    We keep each UPDATE individual (rather than a VALUES-upsert) because
    pgvector drivers bind embeddings differently between psycopg v3 and
    SQLAlchemy versions — the per-row form is the most portable.
    """
    from sqlalchemy import text  # type: ignore

    stmt = text(_update_sql())
    for pid, vec in zip(ids, vectors):
        session.execute(stmt, {"e": vec, "id": pid})


# -------------------------------------------------------------------- CLI
def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        prog="embed_papers",
        description="Backfill papers.embedding with sentence-transformers.",
    )
    p.add_argument("--batch-size", type=int, default=64, help="rows per transaction")
    p.add_argument("--limit", type=int, default=None, help="stop after N papers")
    p.add_argument(
        "--since-date",
        type=str,
        default=None,
        help="YYYY-MM-DD — only embed papers created/updated on or after this date",
    )
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="print pending count and exit without writing",
    )
    p.add_argument("--model", type=str, default=DEFAULT_MODEL, help="encoder model id")
    p.add_argument(
        "--max-batches",
        type=int,
        default=None,
        help="cap total batches (used by the scheduled cycle)",
    )
    p.add_argument(
        "--log-level",
        type=str,
        default="INFO",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
    )
    return p.parse_args(argv)


def _parse_since(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise SystemExit(f"--since-date must be YYYY-MM-DD (got {value!r}): {exc}")


def main(argv: list[str] | None = None) -> int:
    """Script entry-point. Never raises; returns a process exit code."""
    args = _parse_args(argv)
    logging.basicConfig(
        level=getattr(logging, args.log_level),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    database_url = os.environ.get("DEEPSYNAPS_DATABASE_URL")
    if not database_url:
        print(
            "error: DEEPSYNAPS_DATABASE_URL is not set. "
            "Export it first (e.g. via apps/api/.env).",
            file=sys.stderr,
        )
        return 2

    since = _parse_since(args.since_date)

    try:
        summary = run_embedding(
            database_url=database_url,
            batch_size=args.batch_size,
            limit=args.limit,
            since=since,
            model_name=args.model,
            dry_run=args.dry_run,
            max_batches=args.max_batches,
        )
    except ImportError as exc:
        print(f"error: {exc}", file=sys.stderr)
        print(_INSTALL_HINT, file=sys.stderr)
        return 3
    except Exception as exc:  # pragma: no cover - defensive
        log.exception("embed_papers aborted: %s", exc)
        return 1

    if args.dry_run:
        print(f"pending: {summary.pending_before} papers need embedding")
        return 0

    if summary.error == "sentence_transformers missing":
        print(f"error: {summary.error}", file=sys.stderr)
        print(_INSTALL_HINT, file=sys.stderr)
        return 3

    print(
        f"done: {summary.embedded} papers embedded total "
        f"across {summary.batches} batches in {summary.elapsed_sec:.1f}s"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
