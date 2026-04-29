"""Per-agent daily token + cost rollup helper (Phase 13).

Surfaces the Phase 8 ``agent_run_audit.tokens_in_used`` /
``tokens_out_used`` / ``cost_pence`` metering as a daily-bucketed series
suitable for the Activity-tab sparklines on the marketplace page.

Cross-dialect by design — the bucketing runs in Python over a bounded
window (max 90 days), so the same code path works on the SQLite test
backend and the Postgres production backend without ``func.date()``
gymnastics. ``N`` is small (≤ 90 days × small number of agents) so the
"pull all rows then bucket" approach is simpler than the SQL alternative
and stays readable.

The returned shape is intentionally flat — `{agent_id, days: [...]}`
rather than a sparse map — so the JS sparkline renderer can iterate
without needing to zero-fill on the client side.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import TYPE_CHECKING, Any

from app.persistence.models import AgentRunAudit

if TYPE_CHECKING:
    from sqlalchemy.orm import Session


def _bucket_date(value: datetime | None) -> date | None:
    """Return the UTC calendar day for an ``AgentRunAudit.created_at`` value.

    SQLite stores naive datetimes (treated as UTC by our writer) and
    Postgres stores tz-aware ones. Either way, ``.date()`` collapses to
    the calendar day in the column's stored zone — for our writer that's
    UTC.
    """
    if value is None:
        return None
    return value.date()


def per_agent_daily_usage(
    db: "Session",
    *,
    since_days: int = 14,
    clinic_id: str | None = None,
) -> list[dict[str, Any]]:
    """Per-agent daily rollup over the last ``since_days`` days.

    Returns a list of dicts shaped like::

        [
          {
            "agent_id": "clinic.reception",
            "days": [
              {"date": "2026-04-15", "runs": 12, "tokens_in": 3400,
               "tokens_out": 1800, "cost_pence": 47},
              ...  # exactly ``since_days`` entries, oldest first,
              ...  # zero-filled for empty days
            ],
          },
          ...
        ]

    sorted by ``sum(runs)`` over the window DESC. Rows older than the
    window are excluded. Null ``cost_pence`` / ``tokens_in_used`` /
    ``tokens_out_used`` are coerced to 0 so the sparkline never sees
    ``None``.

    Pass ``clinic_id`` to scope the rollup to one tenant — the endpoint
    uses this to filter clinic-bound clinicians/admins to their own
    rows. ``None`` (the default) returns the cross-tenant view used by
    super-admins and the unit-test helper.
    """
    n = max(1, int(since_days))
    today_utc = datetime.now(timezone.utc).date()
    # Inclusive lower bound: the earliest day shown on the sparkline.
    # ``window`` has exactly ``n`` entries; index 0 is the oldest day,
    # index n-1 is today.
    window: list[date] = [today_utc - timedelta(days=(n - 1 - i)) for i in range(n)]
    earliest = window[0]

    cutoff_dt = datetime.combine(earliest, datetime.min.time())
    q = db.query(AgentRunAudit).filter(AgentRunAudit.created_at >= cutoff_dt)
    if clinic_id is not None:
        q = q.filter(AgentRunAudit.clinic_id == clinic_id)
    rows = q.all()

    # Bucket by (agent_id, date).
    # Shape: { agent_id: { date: {runs, tokens_in, tokens_out, cost_pence} } }
    buckets: dict[str, dict[date, dict[str, int]]] = {}
    for row in rows:
        agent_id = str(row.agent_id or "")
        if not agent_id:
            continue
        d = _bucket_date(row.created_at)
        if d is None or d < earliest or d > today_utc:
            continue
        per_agent = buckets.setdefault(agent_id, {})
        cell = per_agent.setdefault(
            d, {"runs": 0, "tokens_in": 0, "tokens_out": 0, "cost_pence": 0}
        )
        cell["runs"] += 1
        try:
            cell["tokens_in"] += int(row.tokens_in_used or 0)
        except (TypeError, ValueError):
            pass
        try:
            cell["tokens_out"] += int(row.tokens_out_used or 0)
        except (TypeError, ValueError):
            pass
        try:
            cell["cost_pence"] += int(row.cost_pence or 0)
        except (TypeError, ValueError):
            pass

    result: list[dict[str, Any]] = []
    for agent_id, per_day in buckets.items():
        days_out: list[dict[str, Any]] = []
        for d in window:
            cell = per_day.get(d)
            if cell is None:
                days_out.append(
                    {
                        "date": d.isoformat(),
                        "runs": 0,
                        "tokens_in": 0,
                        "tokens_out": 0,
                        "cost_pence": 0,
                    }
                )
            else:
                days_out.append(
                    {
                        "date": d.isoformat(),
                        "runs": int(cell["runs"]),
                        "tokens_in": int(cell["tokens_in"]),
                        "tokens_out": int(cell["tokens_out"]),
                        "cost_pence": int(cell["cost_pence"]),
                    }
                )
        result.append({"agent_id": agent_id, "days": days_out})

    result.sort(
        key=lambda entry: sum(d["runs"] for d in entry["days"]),
        reverse=True,
    )
    return result


__all__ = ["per_agent_daily_usage"]
