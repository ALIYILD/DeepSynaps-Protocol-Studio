"""Tests for the per-agent daily token + cost rollup helper + endpoint
(Phase 13).

Covers:

* :func:`per_agent_daily_usage` returns ``[]`` when ``agent_run_audit`` is
  empty.
* Three audit rows for one agent across three different dates → one
  agent block, ``days`` array length == ``since_days``, those three days
  non-zero, others zero.
* Two agents → sorted by total runs DESC.
* Rows older than the window are excluded.
* ``GET /api/v1/agents/usage-chart`` is at least clinician — guests /
  unauthenticated callers get 401/403.
* Clinician-scoped actor only sees their clinic's data.
* ``since_days=200`` → 422 (clamp).
* ``since_days=1`` → returns one-day windows correctly.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.persistence.models import AgentRunAudit
from app.services.agents.usage_chart import per_agent_daily_usage


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def db_session():
    s = SessionLocal()
    try:
        yield s
    finally:
        s.close()


def _seed_audit_row(
    *,
    db,
    agent_id: str = "clinic.reception",
    actor_id: str | None = "actor-clinician-demo",
    clinic_id: str | None = "clinic-demo-default",
    ok: bool = True,
    tokens_in: int | None = 100,
    tokens_out: int | None = 50,
    cost_pence: int | None = 5,
    created_at: datetime | None = None,
) -> AgentRunAudit:
    row = AgentRunAudit(
        actor_id=actor_id,
        clinic_id=clinic_id,
        agent_id=agent_id,
        message_preview="m",
        reply_preview="r",
        latency_ms=10,
        ok=ok,
        tokens_in_used=tokens_in,
        tokens_out_used=tokens_out,
        cost_pence=cost_pence,
    )
    if created_at is not None:
        row.created_at = (
            created_at.replace(tzinfo=None)
            if created_at.tzinfo is not None
            else created_at
        )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


# ---------------------------------------------------------------------------
# Helper-level tests — pure aggregation logic
# ---------------------------------------------------------------------------


def test_per_agent_daily_usage_empty_when_no_rows(db_session) -> None:
    assert per_agent_daily_usage(db_session, since_days=14) == []


def test_per_agent_daily_usage_zero_fills_window(db_session) -> None:
    """Three rows for one agent on three different dates → days array
    has ``since_days`` entries, three non-zero, others zero."""
    now_utc = datetime.now(timezone.utc)
    # Today, 2 days ago, 4 days ago — all inside a 14-day window.
    for offset in (0, 2, 4):
        _seed_audit_row(
            db=db_session,
            agent_id="clinic.reception",
            tokens_in=100,
            tokens_out=50,
            cost_pence=5,
            created_at=now_utc - timedelta(days=offset),
        )

    rollup = per_agent_daily_usage(db_session, since_days=14)
    assert len(rollup) == 1
    block = rollup[0]
    assert block["agent_id"] == "clinic.reception"
    assert len(block["days"]) == 14
    # Oldest first → today is the last entry.
    non_zero = [d for d in block["days"] if d["runs"] > 0]
    assert len(non_zero) == 3
    for d in non_zero:
        assert d["tokens_in"] == 100
        assert d["tokens_out"] == 50
        assert d["cost_pence"] == 5
        assert d["runs"] == 1
    # Every day carries an ISO date string.
    for d in block["days"]:
        assert isinstance(d["date"], str)
        assert len(d["date"]) == 10  # YYYY-MM-DD


def test_per_agent_daily_usage_sorted_by_runs_desc(db_session) -> None:
    """Two agents → sorted by total runs DESC across the window."""
    now_utc = datetime.now(timezone.utc)
    # Busy agent: 3 runs.
    for _ in range(3):
        _seed_audit_row(
            db=db_session, agent_id="clinic.busy", created_at=now_utc
        )
    # Quiet agent: 1 run.
    _seed_audit_row(
        db=db_session, agent_id="clinic.quiet", created_at=now_utc
    )

    rollup = per_agent_daily_usage(db_session, since_days=7)
    assert [b["agent_id"] for b in rollup] == ["clinic.busy", "clinic.quiet"]


def test_per_agent_daily_usage_excludes_rows_outside_window(
    db_session,
) -> None:
    """Rows older than ``since_days`` must be ignored."""
    now_utc = datetime.now(timezone.utc)
    # Way outside the 7-day window.
    _seed_audit_row(
        db=db_session,
        agent_id="clinic.old",
        created_at=now_utc - timedelta(days=30),
    )
    # Inside the window.
    _seed_audit_row(
        db=db_session,
        agent_id="clinic.fresh",
        created_at=now_utc,
    )

    rollup = per_agent_daily_usage(db_session, since_days=7)
    agent_ids = {b["agent_id"] for b in rollup}
    assert agent_ids == {"clinic.fresh"}


def test_per_agent_daily_usage_aggregates_same_day_runs(db_session) -> None:
    """Multiple runs on the same day collapse into one bucket with
    summed token + cost values."""
    now_utc = datetime.now(timezone.utc)
    for _ in range(3):
        _seed_audit_row(
            db=db_session,
            agent_id="clinic.reception",
            tokens_in=10,
            tokens_out=20,
            cost_pence=1,
            created_at=now_utc,
        )

    rollup = per_agent_daily_usage(db_session, since_days=3)
    assert len(rollup) == 1
    days = rollup[0]["days"]
    # Today is the last entry of the window.
    today_cell = days[-1]
    assert today_cell["runs"] == 3
    assert today_cell["tokens_in"] == 30
    assert today_cell["tokens_out"] == 60
    assert today_cell["cost_pence"] == 3


def test_per_agent_daily_usage_handles_null_token_columns(
    db_session,
) -> None:
    """Legacy rows with null tokens / cost_pence default to 0 in the
    rollup so the sparkline never sees ``None``."""
    now_utc = datetime.now(timezone.utc)
    _seed_audit_row(
        db=db_session,
        agent_id="clinic.legacy",
        tokens_in=None,
        tokens_out=None,
        cost_pence=None,
        created_at=now_utc,
    )

    rollup = per_agent_daily_usage(db_session, since_days=3)
    assert len(rollup) == 1
    today = rollup[0]["days"][-1]
    assert today["tokens_in"] == 0
    assert today["tokens_out"] == 0
    assert today["cost_pence"] == 0
    assert today["runs"] == 1


def test_per_agent_daily_usage_since_days_one(db_session) -> None:
    """``since_days=1`` returns a single-day window covering today only."""
    now_utc = datetime.now(timezone.utc)
    _seed_audit_row(
        db=db_session,
        agent_id="clinic.today",
        created_at=now_utc,
    )
    # A row from yesterday should NOT show up.
    _seed_audit_row(
        db=db_session,
        agent_id="clinic.yesterday",
        created_at=now_utc - timedelta(days=1, hours=2),
    )

    rollup = per_agent_daily_usage(db_session, since_days=1)
    agent_ids = {b["agent_id"] for b in rollup}
    assert agent_ids == {"clinic.today"}
    days = rollup[0]["days"]
    assert len(days) == 1
    assert days[0]["runs"] == 1


# ---------------------------------------------------------------------------
# Endpoint-level tests
# ---------------------------------------------------------------------------


def test_usage_chart_endpoint_rejects_unauthenticated(
    client: TestClient,
) -> None:
    resp = client.get("/api/v1/agents/usage-chart")
    assert resp.status_code in (401, 403)


def test_usage_chart_endpoint_rejects_guest(
    client: TestClient, auth_headers: dict[str, dict[str, str]]
) -> None:
    resp = client.get(
        "/api/v1/agents/usage-chart", headers=auth_headers["guest"]
    )
    assert resp.status_code in (401, 403)


def test_usage_chart_endpoint_rejects_since_days_above_max(
    client: TestClient, auth_headers: dict[str, dict[str, str]]
) -> None:
    resp = client.get(
        "/api/v1/agents/usage-chart?since_days=200",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 422


def test_usage_chart_endpoint_rejects_since_days_below_min(
    client: TestClient, auth_headers: dict[str, dict[str, str]]
) -> None:
    resp = client.get(
        "/api/v1/agents/usage-chart?since_days=0",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 422


def test_usage_chart_endpoint_clinician_scoped_to_their_clinic(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
    db_session,
) -> None:
    """Clinician sees their clinic's rows only, not other tenants'."""
    # Two rows for the demo clinic.
    _seed_audit_row(
        db=db_session,
        agent_id="clinic.reception",
        clinic_id="clinic-demo-default",
    )
    _seed_audit_row(
        db=db_session,
        agent_id="clinic.reception",
        clinic_id="clinic-demo-default",
    )
    # One row for a different tenant — must NOT leak.
    _seed_audit_row(
        db=db_session,
        agent_id="clinic.reception",
        actor_id=None,
        clinic_id="clinic-other",
    )

    resp = client.get(
        "/api/v1/agents/usage-chart",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["since_days"] == 14
    assert isinstance(body["agents"], list)
    assert len(body["agents"]) == 1
    block = body["agents"][0]
    assert block["agent_id"] == "clinic.reception"
    assert len(block["days"]) == 14
    # Two demo-clinic rows on today (the seed defaults to "now") → 2 runs
    # in today's bucket; the leaked clinic-other row must NOT count.
    today_cell = block["days"][-1]
    assert today_cell["runs"] == 2


def test_usage_chart_endpoint_empty_when_no_rows(
    client: TestClient, auth_headers: dict[str, dict[str, str]]
) -> None:
    resp = client.get(
        "/api/v1/agents/usage-chart",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body == {"since_days": 14, "agents": []}


def test_usage_chart_endpoint_since_days_one_window(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
    db_session,
) -> None:
    """``since_days=1`` round-trips through the endpoint."""
    now_utc = datetime.now(timezone.utc)
    _seed_audit_row(
        db=db_session,
        agent_id="clinic.reception",
        clinic_id="clinic-demo-default",
        created_at=now_utc,
    )

    resp = client.get(
        "/api/v1/agents/usage-chart?since_days=1",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["since_days"] == 1
    assert len(body["agents"]) == 1
    days = body["agents"][0]["days"]
    assert len(days) == 1
    assert days[0]["runs"] == 1
