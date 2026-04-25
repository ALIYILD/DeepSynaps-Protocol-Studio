"""Import guards and portability helpers for the evidence package.

Heavy dependencies (pgvector, sentence_transformers) are optional.
Every public boolean is safe to test at import time without triggering
side effects.
"""
from __future__ import annotations

try:
    from pgvector.sqlalchemy import Vector as PgVector  # type: ignore[import-not-found]
    HAS_PGVECTOR: bool = True
except ImportError:  # pragma: no cover
    PgVector = None  # type: ignore[assignment, misc]
    HAS_PGVECTOR = False

try:
    from sentence_transformers import SentenceTransformer  # type: ignore[import-not-found]  # noqa: F401
    HAS_SENTENCE_TRANSFORMERS: bool = True
except ImportError:  # pragma: no cover
    HAS_SENTENCE_TRANSFORMERS = False

__all__ = [
    "HAS_PGVECTOR",
    "HAS_SENTENCE_TRANSFORMERS",
    "PgVector",
]
