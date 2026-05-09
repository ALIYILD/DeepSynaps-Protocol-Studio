"""Tests for services/agents/cost_cap.py — per-clinic monthly cost-cap helpers.

Covers:
* get_cap_pence returns None when no row is configured.
* get_cap_pence returns 0 for a row with cap_pence == 0 (disabled sentinel).
* get_cap_pence returns the configured positive cap in pence.
* month_to_date_spend_pence returns 0 when no audit rows exist.
* month_to_date_spend_pence sums only rows from the current calendar month.
* month_to_date_spend_pence excludes rows from a prior month.
* check_cap returns (True, 0, 0) when no cap row is configured.
* check_cap returns (True, spend, 0) when cap is the disabled-sentinel 0.
* check_cap returns (True, spend, cap) when spend is below cap.
* check_cap returns (False, spend, cap) when spend meets or exceeds cap.
* Clinical safety: spend at exact cap boundary triggers refusal.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.persistence.models import AgentRunAudit, ClinicMonthlyCostCap
from app.services.agents.cost_cap import check_cap, get_cap_pence, month_to_date_spend_pence


# ── Helpers ───────────────────────────────────────────────────────────────────

_CLINIC_A = "clinic-cost-cap-test-a"
_CLINIC_B = "clinic-cost-cap-test-b"
_CLINIC_NONE = "clinic-cost-cap-test-no-row"


def _now_utc() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _add_cap(db: Session, clinic_id: str, cap: int) -> None:
    db.query(ClinicMonthlyCostCap).filter(
        ClinicMonthlyCostCap.clinic_id == clinic_id
    ).delete()
    db.add(ClinicMonthlyCostCap(clinic_id=clinic_id, cap_pence=cap))
    db.commit()


def _add_audit(db: Session, clinic_id: str, cost: int, created_at: datetime) -> None:
    db.add(
        AgentRunAudit(
            clinic_id=clinic_id,
            agent_id="agent-x",
            actor_id=None,
            ok=True,
            cost_pence=cost,
            created_at=created_at,
        )
    )
    db.commit()


# ── Fixtures ──────────────────────────────────────────────────────────────────


@pytest.fixture
def db() -> Session:  # type: ignore[override]
    s = SessionLocal()
    try:
        yield s
    finally:
        # Best-effort cleanup so each test run is isolated.
        for cid in (_CLINIC_A, _CLINIC_B, _CLINIC_NONE):
            s.query(ClinicMonthlyCostCap).filter(
                ClinicMonthlyCostCap.clinic_id == cid
            ).delete()
            s.query(AgentRunAudit).filter(AgentRunAudit.clinic_id == cid).delete()
        s.commit()
        s.close()


# ── get_cap_pence tests ───────────────────────────────────────────────────────


def test_get_cap_pence_no_row_returns_none(db: Session) -> None:
    assert get_cap_pence(db, _CLINIC_NONE) is None


def test_get_cap_pence_disabled_sentinel(db: Session) -> None:
    _add_cap(db, _CLINIC_A, 0)
    assert get_cap_pence(db, _CLINIC_A) == 0


def test_get_cap_pence_positive(db: Session) -> None:
    _add_cap(db, _CLINIC_A, 5000)
    assert get_cap_pence(db, _CLINIC_A) == 5000


# ── month_to_date_spend_pence tests ──────────────────────────────────────────


def test_spend_empty(db: Session) -> None:
    assert month_to_date_spend_pence(db, _CLINIC_NONE) == 0


def test_spend_sums_current_month(db: Session) -> None:
    now = _now_utc()
    _add_audit(db, _CLINIC_B, 100, now)
    _add_audit(db, _CLINIC_B, 250, now)
    assert month_to_date_spend_pence(db, _CLINIC_B) == 350


def test_spend_excludes_prior_month(db: Session) -> None:
    now = _now_utc()
    last_month = now - timedelta(days=32)
    _add_audit(db, _CLINIC_B, 9999, last_month)   # should be excluded
    _add_audit(db, _CLINIC_B, 100, now)
    assert month_to_date_spend_pence(db, _CLINIC_B) == 100


# ── check_cap tests ───────────────────────────────────────────────────────────


def test_check_cap_no_row(db: Session) -> None:
    ok, spend, cap = check_cap(db, _CLINIC_NONE)
    assert ok is True
    assert cap == 0


def test_check_cap_disabled_sentinel(db: Session) -> None:
    _add_cap(db, _CLINIC_A, 0)
    ok, spend, cap = check_cap(db, _CLINIC_A)
    assert ok is True
    assert cap == 0


def test_check_cap_below_cap(db: Session) -> None:
    _add_cap(db, _CLINIC_A, 10_000)
    _add_audit(db, _CLINIC_A, 4_999, _now_utc())
    ok, spend, cap = check_cap(db, _CLINIC_A)
    assert ok is True
    assert spend == 4_999
    assert cap == 10_000


def test_check_cap_at_exact_boundary_refuses(db: Session) -> None:
    """Clinical safety: spend == cap must block the run."""
    _add_cap(db, _CLINIC_A, 1_000)
    _add_audit(db, _CLINIC_A, 1_000, _now_utc())
    ok, spend, cap = check_cap(db, _CLINIC_A)
    assert ok is False, "Spend at exact cap boundary must refuse the run"
    assert spend == 1_000
    assert cap == 1_000


def test_check_cap_over_cap_refuses(db: Session) -> None:
    _add_cap(db, _CLINIC_A, 500)
    _add_audit(db, _CLINIC_A, 600, _now_utc())
    ok, spend, cap = check_cap(db, _CLINIC_A)
    assert ok is False
