"""Shared SQLAlchemy plumbing for the persistence/models package.

Every model module must import ``Base`` from here so all classes share one
declarative metadata. Helpers for the optional pgvector embedding column live
here too (gated on the ``pgvector`` package import — falls back to ``Text``
on SQLite test envs).

Imports are kept broad on purpose: bucket files re-export ``*`` from this
module so the per-class column definitions stay readable without per-file
import boilerplate.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    event,
    text as sa_text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


# ── pgvector guarded import (migration 041) ──────────────────────────────────
#
# The pgvector Python package may not be installed in every environment
# (notably the SQLite-backed test harness). We fall back to a Text column
# when it is missing so the model still loads — the transitional
# ``embedding_json`` TEXT column remains the canonical storage on SQLite.
try:
    from pgvector.sqlalchemy import Vector as _PgVector  # type: ignore[import-not-found]
    _HAS_PGVECTOR = True
except ImportError:  # pragma: no cover — exercised in the SQLite test env
    _PgVector = None  # type: ignore[assignment]
    _HAS_PGVECTOR = False


def _embedding_column() -> Column:
    """Build the native ``embedding`` sibling column for pgvector deployments.

    Returns
    -------
    sqlalchemy.Column
        A ``vector(200)`` column when the ``pgvector`` Python package is
        installed; otherwise a nullable ``Text`` placeholder so the model
        definition still loads under SQLite test envs.

    Notes
    -----
    Used by :class:`QEEGAnalysis`, :class:`MriAnalysis`, and
    :class:`KgEntity`. Populated by migration 041 on Postgres only.
    """
    if _HAS_PGVECTOR:
        return Column(_PgVector(200), nullable=True)
    return Column(Text(), nullable=True)


def _embedding_column_1536() -> Column:
    """Build a ``vector(1536)`` column for OpenAI text-embedding-3-small.

    Used by :class:`DsPaper` (Evidence Citation Validator, migration 045).
    Falls back to ``Text()`` on SQLite / when pgvector is missing.
    """
    if _HAS_PGVECTOR:
        return Column(_PgVector(1536), nullable=True)
    return Column(Text(), nullable=True)


__all__ = [
    "Base",
    "BigInteger",
    "Boolean",
    "CheckConstraint",
    "Column",
    "DateTime",
    "Float",
    "ForeignKey",
    "Index",
    "Integer",
    "Mapped",
    "Optional",
    "String",
    "Text",
    "UniqueConstraint",
    "datetime",
    "event",
    "mapped_column",
    "sa_text",
    "timezone",
    "uuid",
    "_HAS_PGVECTOR",
    "_PgVector",
    "_embedding_column",
    "_embedding_column_1536",
]
