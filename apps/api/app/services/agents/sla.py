"""Per-agent SLA aggregation helpers (Phase 10).

Powers the super-admin "Per-agent SLA" dashboard. Reads :class:`AgentRunAudit`
rows from the last N hours, buckets them by ``agent_id``, and returns a
roll-up: total runs, error rate, p50/p95 latency, and average cost in pence.

Cross-dialect by design — the percentile math runs in Python rather than
relying on Postgres ``percentile_cont``, so the helper works against the
SQLite test backend and the Postgres production backend without branching.
"""
from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone
from typing import TYPE_CHECKING, Any

from app.persistence.models import AgentRunAudit

if TYPE_CHECKING:
    from sqlalchemy.orm import Session


def _percentile(sorted_values: list[int], pct: float) -> int | None:
    """Nearest-rank percentile over a pre-sorted list of ints.

    ``pct`` is 0..1 (e.g. 0.5 → median, 0.95 → 95th). Returns ``None`` for
    an empty list. Uses the nearest-rank method because it gives stable
    integer-ms answers on tiny sample sizes (n=1, n=2), which is the
    common case in tests and during a quiet hour in production.
    """
    n = len(sorted_values)
    if n == 0:
        return None
    if n == 1:
        return int(sorted_values[0])
    # Nearest-rank: rank = ceil(p * n), 1-based — clamp to [1, n].
    rank = max(1, min(n, int(math.ceil(pct * n))))
    return int(sorted_values[rank - 1])


def per_agent_sla(db: "Session", *, since_hours: int = 24) -> list[dict[str, Any]]:
    """Per ``agent_id`` rollup over the last ``since_hours`` hours.

    Returns a list of dicts shaped like::

        {
            "agent_id": str,
            "runs": int,
            "errors": int,
            "error_rate": float,         # errors/runs, 0..1; 0 if runs==0
            "p50_ms": int | None,
            "p95_ms": int | None,
            "avg_cost_pence": float,
        }

    sorted by ``runs`` DESC. Rows older than the window are excluded.
    Latency percentiles are computed in Python over the per-agent list of
    ``latency_ms`` values, ignoring nulls. ``avg_cost_pence`` treats null
    ``cost_pence`` as 0 so legacy rows written before the cost column
    landed don't skew the mean.
    """
    cutoff_utc = datetime.now(timezone.utc) - timedelta(hours=int(since_hours))
    # SQLite stores naive datetimes; strip tz so the comparison works on
    # both backends. Postgres tz-aware columns coerce cleanly either way.
    cutoff_naive = cutoff_utc.replace(tzinfo=None)

    rows = (
        db.query(AgentRunAudit)
        .filter(AgentRunAudit.created_at >= cutoff_naive)
        .all()
    )

    # Bucket by agent_id.
    buckets: dict[str, dict[str, Any]] = {}
    for row in rows:
        agent_id = str(row.agent_id or "")
        if not agent_id:
            continue
        b = buckets.setdefault(
            agent_id,
            {
                "agent_id": agent_id,
                "runs": 0,
                "errors": 0,
                "latencies": [],
                "cost_total": 0,
            },
        )
        b["runs"] += 1
        if not bool(row.ok):
            b["errors"] += 1
        if row.latency_ms is not None:
            try:
                b["latencies"].append(int(row.latency_ms))
            except (TypeError, ValueError):
                pass
        b["cost_total"] += int(row.cost_pence or 0)

    rollup: list[dict[str, Any]] = []
    for agent_id, b in buckets.items():
        runs = int(b["runs"])
        errors = int(b["errors"])
        latencies = sorted(b["latencies"])
        rollup.append(
            {
                "agent_id": agent_id,
                "runs": runs,
                "errors": errors,
                "error_rate": (errors / runs) if runs else 0.0,
                "p50_ms": _percentile(latencies, 0.5),
                "p95_ms": _percentile(latencies, 0.95),
                "avg_cost_pence": (b["cost_total"] / runs) if runs else 0.0,
            }
        )

    rollup.sort(key=lambda r: r["runs"], reverse=True)
    return rollup


__all__ = ["per_agent_sla"]
