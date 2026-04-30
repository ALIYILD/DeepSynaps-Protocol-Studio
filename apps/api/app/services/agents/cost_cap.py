"""Phase 9 — per-clinic monthly cost cap helpers.

Pure read functions. The runner uses :func:`check_cap` to short-circuit
the LLM call whenever a clinic has burned through its month-to-date
budget; the admin router uses :func:`get_cap_pence` and
:func:`month_to_date_spend_pence` to render the cap admin tile.

Cap semantics
-------------
* ``cap_pence is None``  — no row in :class:`ClinicMonthlyCostCap`,
  enforcement disabled.
* ``cap_pence == 0``     — explicit "disabled" sentinel. The operator
  has flipped the cap off without deleting the row (so the audit trail
  of who set what survives). Treated identically to ``None`` by
  :func:`check_cap`.
* ``cap_pence > 0``      — enforced. Run is refused when
  ``spend_pence >= cap_pence``.

Why month-to-date
-----------------
The window matches :class:`PackageTokenBudget`'s monthly anchor (Phase 7)
so an operator looking at one budget tile sees the same number as the
other. UTC-anchored so a clinic spanning multiple time zones still gets
exactly one cap window per calendar month.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import TYPE_CHECKING

from sqlalchemy import func

from app.persistence.models import AgentRunAudit, ClinicMonthlyCostCap

if TYPE_CHECKING:
    from sqlalchemy.orm import Session


__all__ = [
    "get_cap_pence",
    "month_to_date_spend_pence",
    "check_cap",
]


def _start_of_current_month_utc() -> datetime:
    """First instant of the current calendar month, naive UTC.

    Mirrors :func:`runner._month_window_start` so the two budget views
    (per-package and per-clinic) align on the same window.
    """
    now = datetime.now(timezone.utc)
    return datetime(now.year, now.month, 1)


def get_cap_pence(db: "Session", clinic_id: str) -> int | None:
    """Return the configured cap in pence for ``clinic_id``, or ``None``.

    ``None`` means no row is configured — caller should treat this as
    "no cap, allow all". A row with ``cap_pence == 0`` is returned as
    ``0`` and treated as "disabled" by :func:`check_cap`.
    """
    row = (
        db.query(ClinicMonthlyCostCap)
        .filter(ClinicMonthlyCostCap.clinic_id == clinic_id)
        .first()
    )
    if row is None:
        return None
    return int(row.cap_pence or 0)


def month_to_date_spend_pence(db: "Session", clinic_id: str) -> int:
    """Sum :class:`AgentRunAudit.cost_pence` for ``clinic_id`` this month.

    Returns ``0`` when the clinic has no audit rows in the window. Uses
    ``COALESCE(SUM(...), 0)`` so an empty result set is handled at the
    SQL layer rather than in Python.
    """
    window_start = _start_of_current_month_utc()
    total = (
        db.query(func.coalesce(func.sum(AgentRunAudit.cost_pence), 0))
        .filter(AgentRunAudit.clinic_id == clinic_id)
        .filter(AgentRunAudit.created_at >= window_start)
        .scalar()
    )
    return int(total or 0)


def check_cap(db: "Session", clinic_id: str) -> tuple[bool, int, int]:
    """Return ``(ok, spend_pence, cap_pence)`` for the cap pre-check.

    ``ok`` is ``False`` only when a positive cap is set AND the
    month-to-date spend has reached or exceeded it. The runner uses
    this contract to short-circuit before the LLM call.

    The returned ``cap_pence`` is ``0`` when no row is configured; the
    caller should treat ``cap_pence in (None, 0)`` as "disabled" when
    rendering the admin UI.
    """
    cap = get_cap_pence(db, clinic_id)
    spend = month_to_date_spend_pence(db, clinic_id)
    if cap is None or cap <= 0:
        return True, spend, 0
    return spend < cap, spend, cap
