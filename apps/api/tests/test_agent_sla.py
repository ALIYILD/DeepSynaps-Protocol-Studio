"""Tests for the per-agent SLA rollup helper + endpoint (Phase 10).

Covers:

* :func:`per_agent_sla` returns an empty list when ``agent_run_audit`` is
  empty or the window excludes every row.
* p50/p95 are computed in Python from the per-agent latency list, error
  rate is errors/runs, and ``avg_cost_pence`` averages over the window.
* ``GET /api/v1/agents/ops/sla`` is super-admin only — clinic-bound
  admins and clinicians get 403.
* ``since_hours`` is clamped to ``[1, 168]`` — outside the range returns
  422 without invoking the helper.
* Happy-path returns ``{"since_hours": ..., "rollup": [...]}`` shape.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.auth import AuthenticatedActor, get_authenticated_actor
from app.database import SessionLocal
from app.main import app
from app.persistence.models import AgentRunAudit
from app.services.agents.sla import per_agent_sla


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


@pytest.fixture
def super_admin_actor() -> AuthenticatedActor:
    """Platform-level admin not bound to any clinic — the only shape that
    passes the ``_require_super_admin`` gate on the ops endpoints."""
    return AuthenticatedActor(
        actor_id="actor-super-admin",
        display_name="Super Admin",
        role="admin",  # type: ignore[arg-type]
        package_id="enterprise",
        clinic_id=None,
    )


@pytest.fixture
def super_admin_client(super_admin_actor: AuthenticatedActor):
    app.dependency_overrides[get_authenticated_actor] = lambda: super_admin_actor
    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.pop(get_authenticated_actor, None)


def _seed_audit_row(
    *,
    db,
    agent_id: str = "clinic.reception",
    actor_id: str | None = "actor-clinician-demo",
    clinic_id: str | None = "clinic-demo-default",
    ok: bool = True,
    latency_ms: int | None = 100,
    cost_pence: int | None = 5,
    error_code: str | None = None,
    created_at: datetime | None = None,
) -> AgentRunAudit:
    row = AgentRunAudit(
        actor_id=actor_id,
        clinic_id=clinic_id,
        agent_id=agent_id,
        message_preview="m",
        reply_preview="r",
        latency_ms=latency_ms,
        ok=ok,
        error_code=error_code,
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


def test_per_agent_sla_empty_when_no_rows(db_session) -> None:
    assert per_agent_sla(db_session, since_hours=24) == []


def test_per_agent_sla_three_ok_rows_percentile_and_zero_error_rate(
    db_session,
) -> None:
    """Latencies [100, 200, 300] all OK → p50≈200, p95≈300, error_rate=0."""
    for ms in (100, 200, 300):
        _seed_audit_row(
            db=db_session, agent_id="clinic.reporting", latency_ms=ms, ok=True
        )

    rollup = per_agent_sla(db_session, since_hours=24)
    assert len(rollup) == 1
    row = rollup[0]
    assert row["agent_id"] == "clinic.reporting"
    assert row["runs"] == 3
    assert row["errors"] == 0
    assert row["error_rate"] == 0.0
    # Nearest-rank: ceil(0.5*3)=2 → 200; ceil(0.95*3)=3 → 300.
    assert row["p50_ms"] == 200
    assert row["p95_ms"] == 300


def test_per_agent_sla_mixed_ok_rows_error_rate(db_session) -> None:
    """4 rows: 1 ok + 3 failures → error_rate = 0.75."""
    _seed_audit_row(db=db_session, agent_id="clinic.reception", ok=True)
    _seed_audit_row(
        db=db_session, agent_id="clinic.reception", ok=False, error_code="boom"
    )
    _seed_audit_row(
        db=db_session, agent_id="clinic.reception", ok=False, error_code="boom"
    )
    _seed_audit_row(
        db=db_session, agent_id="clinic.reception", ok=False, error_code="boom"
    )

    rollup = per_agent_sla(db_session, since_hours=24)
    assert len(rollup) == 1
    row = rollup[0]
    assert row["runs"] == 4
    assert row["errors"] == 3
    assert row["error_rate"] == pytest.approx(0.75)


def test_per_agent_sla_excludes_rows_outside_window(db_session) -> None:
    """Old rows are filtered out by the ``since_hours`` cutoff."""
    long_ago = datetime.now(timezone.utc) - timedelta(hours=48)
    # Two ancient rows on agent A — outside 24h window.
    for _ in range(2):
        _seed_audit_row(
            db=db_session, agent_id="clinic.old", created_at=long_ago
        )
    # One fresh row on agent B — inside the window.
    _seed_audit_row(db=db_session, agent_id="clinic.fresh")

    rollup = per_agent_sla(db_session, since_hours=24)
    agent_ids = {r["agent_id"] for r in rollup}
    assert agent_ids == {"clinic.fresh"}
    assert rollup[0]["runs"] == 1


def test_per_agent_sla_avg_cost_pence_handles_nulls(db_session) -> None:
    """Null ``cost_pence`` is treated as 0 — average over runs, not over
    non-null rows, so legacy rows don't pull the mean up artificially."""
    _seed_audit_row(db=db_session, agent_id="clinic.cost", cost_pence=10)
    _seed_audit_row(db=db_session, agent_id="clinic.cost", cost_pence=20)
    _seed_audit_row(db=db_session, agent_id="clinic.cost", cost_pence=None)

    rollup = per_agent_sla(db_session, since_hours=24)
    assert len(rollup) == 1
    # (10 + 20 + 0) / 3 = 10.0
    assert rollup[0]["avg_cost_pence"] == pytest.approx(10.0)


def test_per_agent_sla_sorted_by_runs_desc(db_session) -> None:
    for _ in range(3):
        _seed_audit_row(db=db_session, agent_id="clinic.busy")
    _seed_audit_row(db=db_session, agent_id="clinic.quiet")

    rollup = per_agent_sla(db_session, since_hours=24)
    assert [r["agent_id"] for r in rollup] == ["clinic.busy", "clinic.quiet"]


# ---------------------------------------------------------------------------
# Endpoint-level tests — auth gating + clamp + happy path
# ---------------------------------------------------------------------------


def test_sla_endpoint_rejects_clinician(
    client: TestClient, auth_headers: dict[str, dict[str, str]]
) -> None:
    resp = client.get("/api/v1/agents/ops/sla", headers=auth_headers["clinician"])
    assert resp.status_code == 403, resp.text


def test_sla_endpoint_rejects_clinic_scoped_admin(
    client: TestClient, auth_headers: dict[str, dict[str, str]]
) -> None:
    resp = client.get("/api/v1/agents/ops/sla", headers=auth_headers["admin"])
    assert resp.status_code == 403, resp.text


def test_sla_endpoint_rejects_unauthenticated(client: TestClient) -> None:
    resp = client.get("/api/v1/agents/ops/sla")
    assert resp.status_code in (401, 403)


def test_sla_endpoint_rejects_since_hours_above_max(
    super_admin_client: TestClient,
) -> None:
    resp = super_admin_client.get("/api/v1/agents/ops/sla?since_hours=200")
    assert resp.status_code == 422


def test_sla_endpoint_rejects_since_hours_below_min(
    super_admin_client: TestClient,
) -> None:
    resp = super_admin_client.get("/api/v1/agents/ops/sla?since_hours=0")
    assert resp.status_code == 422


def test_sla_endpoint_returns_empty_rollup_when_no_rows(
    super_admin_client: TestClient,
) -> None:
    resp = super_admin_client.get("/api/v1/agents/ops/sla")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body == {"since_hours": 24, "rollup": []}


def test_sla_endpoint_happy_path_shape(
    super_admin_client: TestClient, db_session
) -> None:
    """Seed a few rows and confirm the endpoint surfaces the rollup shape."""
    for ms in (100, 200, 300):
        _seed_audit_row(
            db=db_session,
            agent_id="clinic.reporting",
            latency_ms=ms,
            ok=True,
            cost_pence=4,
        )
    _seed_audit_row(
        db=db_session,
        agent_id="clinic.reception",
        latency_ms=50,
        ok=False,
        error_code="boom",
        cost_pence=2,
    )

    resp = super_admin_client.get("/api/v1/agents/ops/sla?since_hours=24")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["since_hours"] == 24
    rollup = body["rollup"]
    assert isinstance(rollup, list)
    assert len(rollup) == 2
    # Ordered by runs DESC — reporting (3) before reception (1).
    assert rollup[0]["agent_id"] == "clinic.reporting"
    assert rollup[0]["runs"] == 3
    assert rollup[0]["errors"] == 0
    assert rollup[0]["error_rate"] == 0.0
    assert rollup[0]["p50_ms"] == 200
    assert rollup[0]["p95_ms"] == 300
    assert rollup[1]["agent_id"] == "clinic.reception"
    assert rollup[1]["runs"] == 1
    assert rollup[1]["errors"] == 1
    assert rollup[1]["error_rate"] == 1.0
    # Required keys present on each row.
    for row in rollup:
        for key in (
            "agent_id",
            "runs",
            "errors",
            "error_rate",
            "p50_ms",
            "p95_ms",
            "avg_cost_pence",
        ):
            assert key in row, f"missing field {key!r}"
