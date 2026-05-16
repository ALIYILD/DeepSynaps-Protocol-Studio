"""UTC timestamp utilities — timezone-aware, deprecation-safe.

Replaces deprecated ``datetime.utcnow()`` and ``datetime.utcfromtimestamp()``
with timezone-aware equivalents per PEP 615 / Python 3.11+.

All backend timestamps are UTC. No local timezone conversion.
"""

from datetime import datetime, timezone, timedelta
from typing import Optional, Union


def utc_now() -> datetime:
    """Return timezone-aware UTC datetime.

    Replaces deprecated ``datetime.utcnow()`` which returns a naive datetime.
    The returned datetime has ``tzinfo=timezone.utc``.
    """
    return datetime.now(timezone.utc)


def utc_iso() -> str:
    """Return current UTC timestamp as ISO 8601 string with timezone offset."""
    return utc_now().isoformat()


def utc_from_timestamp(timestamp: float) -> datetime:
    """Return timezone-aware UTC datetime from a Unix timestamp.

    Replaces deprecated ``datetime.utcfromtimestamp()``.
    """
    return datetime.fromtimestamp(timestamp, timezone.utc)


def naive_utc_now() -> datetime:
    """Return naive UTC datetime (no timezone info) for DB compatibility.

    Use ONLY when the database column stores naive datetimes and changing
    the column type would require a migration. This helper is a bridge
    for existing schema v1 columns.

    Prefer ``utc_now()`` for all new code.
    """
    return datetime.utcnow()


def to_naive(dt: datetime) -> datetime:
    """Convert a timezone-aware datetime to naive UTC.

    Use at DB boundaries where the column expects naive datetimes.
    If already naive, returns as-is.
    """
    if dt.tzinfo is None:
        return dt
    return dt.replace(tzinfo=None)


def to_aware(dt: datetime) -> datetime:
    """Convert a naive datetime to timezone-aware UTC.

    Assumes naive datetimes are already in UTC (our convention).
    If already aware, returns as-is.
    """
    if dt.tzinfo is not None:
        return dt
    return dt.replace(tzinfo=timezone.utc)
