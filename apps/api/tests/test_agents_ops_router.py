"""Tests for the cross-clinic ops endpoints (Phase 6).

Covers:

* ``GET /api/v1/agents/ops/runs`` is restricted to super-admins
  (``role="admin"`` AND ``actor.clinic_id is None``); clinic-scoped
  admins, clinicians, guests and unauthenticated callers all 403/401.
* The endpoint returns the cross-clinic projection — every row carries
  its source ``clinic_id`` and rows are not filtered to any one tenant.
* ``agent_id`` and ``clinic_id`` query filters narrow correctly.
* ``GET /api/v1/agents/ops/abuse-signals`` aggregates per
  ``(clinic_id, agent_id)`` pair and flags ratios above 5x the median.
* ``limit`` is clamped to ``[1, 500]``.
"""
from __future__ import annotations

import json as _json
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.auth import AuthenticatedActor, get_authenticated_actor
from app.database import SessionLocal
from app.main import app
from app.persistence.models import AgentRunAudit, Clinic, User


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
    """A platform-level admin who is NOT bound to any single clinic.

    The ops endpoints check ``actor.clinic_id is None`` strictly — this
    is the only actor shape that is allowed through.
    """
    return AuthenticatedActor(
        actor_id="actor-super-admin",
        display_name="Super Admin",
        role="admin",  # type: ignore[arg-type]
        package_id="enterprise",
        clinic_id=None,
    )


@pytest.fixture
def super_admin_client(super_admin_actor: AuthenticatedActor):
    """A TestClient whose ``get_authenticated_actor`` is overridden to
    return a super-admin (clinic_id=None).

    The conftest seeds an ``actor-admin-demo`` row with clinic_id set, and
    the demo-token loader lifts that clinic_id off the User row, so we
    can't get a clinic_id=None admin via the demo bearer header. The
    override is the cleanest route.
    """
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
    context_used: list[str] | None = None,
    latency_ms: int = 25,
    message: str = "hello",
    reply: str = "world",
    error_code: str | None = None,
    created_at: datetime | None = None,
) -> AgentRunAudit:
    row = AgentRunAudit(
        actor_id=actor_id,
        clinic_id=clinic_id,
        agent_id=agent_id,
        message_preview=message,
        reply_preview=reply,
        context_used_json=_json.dumps(context_used) if context_used else None,
        latency_ms=latency_ms,
        ok=ok,
        error_code=error_code,
    )
    if created_at is not None:
        # SQLite uses naive datetimes; strip tz for compatibility.
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
# Auth gating — both endpoints share ``_require_super_admin``
# ---------------------------------------------------------------------------


def test_ops_runs_rejects_clinic_scoped_admin(
    client: TestClient, auth_headers: dict[str, dict[str, str]]
) -> None:
    """``admin-demo-token`` resolves to a clinic-bound admin (conftest seeds
    a clinic_id on its User row). That actor must NOT see the ops view."""
    resp = client.get("/api/v1/agents/ops/runs", headers=auth_headers["admin"])
    assert resp.status_code == 403, resp.text
    body = resp.json()
    # Project ApiServiceError shape — error code surfaced for the UI.
    assert "ops_admin_required" in resp.text or body.get("detail", {}).get(
        "code"
    ) == "ops_admin_required"


def test_ops_runs_rejects_clinician(
    client: TestClient, auth_headers: dict[str, dict[str, str]]
) -> None:
    resp = client.get(
        "/api/v1/agents/ops/runs", headers=auth_headers["clinician"]
    )
    assert resp.status_code == 403, resp.text


def test_ops_runs_rejects_guest(
    client: TestClient, auth_headers: dict[str, dict[str, str]]
) -> None:
    resp = client.get("/api/v1/agents/ops/runs", headers=auth_headers["guest"])
    assert resp.status_code in (401, 403)


def test_ops_runs_rejects_unauthenticated(client: TestClient) -> None:
    resp = client.get("/api/v1/agents/ops/runs")
    assert resp.status_code in (401, 403)


def test_ops_abuse_signals_rejects_clinic_scoped_admin(
    client: TestClient, auth_headers: dict[str, dict[str, str]]
) -> None:
    resp = client.get(
        "/api/v1/agents/ops/abuse-signals", headers=auth_headers["admin"]
    )
    assert resp.status_code == 403, resp.text


def test_ops_abuse_signals_rejects_clinician(
    client: TestClient, auth_headers: dict[str, dict[str, str]]
) -> None:
    resp = client.get(
        "/api/v1/agents/ops/abuse-signals", headers=auth_headers["clinician"]
    )
    assert resp.status_code == 403, resp.text


def test_ops_abuse_signals_rejects_unauthenticated(client: TestClient) -> None:
    resp = client.get("/api/v1/agents/ops/abuse-signals")
    assert resp.status_code in (401, 403)


# ---------------------------------------------------------------------------
# /ops/runs — happy path & filters
# ---------------------------------------------------------------------------


def test_ops_runs_returns_empty_when_no_audit_rows(
    super_admin_client: TestClient,
) -> None:
    resp = super_admin_client.get("/api/v1/agents/ops/runs")
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"runs": []}


def test_ops_runs_returns_rows_across_all_clinics(
    super_admin_client: TestClient, db_session
) -> None:
    """Seed 5 rows across 3 clinics; super-admin sees all 5."""
    # Make sure the auxiliary Clinic rows exist (FKs are not enforced on
    # AgentRunAudit.clinic_id but it keeps the test scenario realistic).
    for cid in ("clinic-a", "clinic-b", "clinic-c"):
        if db_session.query(Clinic).filter_by(id=cid).first() is None:
            db_session.add(Clinic(id=cid, name=cid))
    db_session.commit()

    _seed_audit_row(db=db_session, agent_id="clinic.reception", clinic_id="clinic-a")
    _seed_audit_row(db=db_session, agent_id="clinic.reception", clinic_id="clinic-a")
    _seed_audit_row(
        db=db_session, agent_id="clinic.drclaw_telegram", clinic_id="clinic-b"
    )
    _seed_audit_row(db=db_session, agent_id="clinic.reporting", clinic_id="clinic-c")
    _seed_audit_row(db=db_session, agent_id="clinic.reception", clinic_id="clinic-c")

    resp = super_admin_client.get("/api/v1/agents/ops/runs")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "runs" in body
    runs = body["runs"]
    assert len(runs) == 5
    # Every row carries clinic_id (the whole point of the ops surface).
    for r in runs:
        assert "clinic_id" in r
        assert r["clinic_id"] in {"clinic-a", "clinic-b", "clinic-c"}
    seen = {r["clinic_id"] for r in runs}
    assert seen == {"clinic-a", "clinic-b", "clinic-c"}


def test_ops_runs_filters_by_clinic_id(
    super_admin_client: TestClient, db_session
) -> None:
    _seed_audit_row(db=db_session, clinic_id="clinic-a", agent_id="clinic.reception")
    _seed_audit_row(db=db_session, clinic_id="clinic-a", agent_id="clinic.reception")
    _seed_audit_row(db=db_session, clinic_id="clinic-b", agent_id="clinic.reception")

    resp = super_admin_client.get("/api/v1/agents/ops/runs?clinic_id=clinic-a")
    assert resp.status_code == 200, resp.text
    runs = resp.json()["runs"]
    assert len(runs) == 2
    assert {r["clinic_id"] for r in runs} == {"clinic-a"}


def test_ops_runs_filters_by_agent_id(
    super_admin_client: TestClient, db_session
) -> None:
    _seed_audit_row(db=db_session, agent_id="clinic.reception", clinic_id="clinic-a")
    _seed_audit_row(
        db=db_session, agent_id="clinic.drclaw_telegram", clinic_id="clinic-a"
    )
    _seed_audit_row(db=db_session, agent_id="clinic.reception", clinic_id="clinic-b")

    resp = super_admin_client.get(
        "/api/v1/agents/ops/runs?agent_id=clinic.reception"
    )
    assert resp.status_code == 200, resp.text
    runs = resp.json()["runs"]
    assert len(runs) == 2
    assert all(r["agent_id"] == "clinic.reception" for r in runs)


def test_ops_runs_combines_filters(
    super_admin_client: TestClient, db_session
) -> None:
    _seed_audit_row(db=db_session, agent_id="clinic.reception", clinic_id="clinic-a")
    _seed_audit_row(
        db=db_session, agent_id="clinic.drclaw_telegram", clinic_id="clinic-a"
    )
    _seed_audit_row(db=db_session, agent_id="clinic.reception", clinic_id="clinic-b")

    resp = super_admin_client.get(
        "/api/v1/agents/ops/runs?agent_id=clinic.reception&clinic_id=clinic-b"
    )
    assert resp.status_code == 200, resp.text
    runs = resp.json()["runs"]
    assert len(runs) == 1
    assert runs[0]["clinic_id"] == "clinic-b"
    assert runs[0]["agent_id"] == "clinic.reception"


def test_ops_runs_orders_newest_first(
    super_admin_client: TestClient, db_session
) -> None:
    import time as _t

    first = _seed_audit_row(db=db_session, agent_id="clinic.reception")
    _t.sleep(0.01)
    second = _seed_audit_row(db=db_session, agent_id="clinic.drclaw_telegram")

    resp = super_admin_client.get("/api/v1/agents/ops/runs")
    assert resp.status_code == 200
    ids = [r["id"] for r in resp.json()["runs"]]
    assert ids == [second.id, first.id]


def test_ops_runs_clamps_oversized_limit(
    super_admin_client: TestClient, db_session
) -> None:
    """Spec: limit clamped at 500 — FastAPI Query(le=500) returns 422 on
    over-large requests, and accepts the upper bound itself."""
    for _ in range(3):
        _seed_audit_row(db=db_session)

    resp_too_high = super_admin_client.get("/api/v1/agents/ops/runs?limit=501")
    assert resp_too_high.status_code == 422

    resp_at_max = super_admin_client.get("/api/v1/agents/ops/runs?limit=500")
    assert resp_at_max.status_code == 200
    assert len(resp_at_max.json()["runs"]) == 3


def test_ops_runs_row_shape_includes_required_fields(
    super_admin_client: TestClient, db_session
) -> None:
    _seed_audit_row(
        db=db_session,
        agent_id="clinic.reception",
        clinic_id="clinic-a",
        context_used=["sessions.list"],
    )
    resp = super_admin_client.get("/api/v1/agents/ops/runs")
    assert resp.status_code == 200
    runs = resp.json()["runs"]
    assert len(runs) == 1
    sample = runs[0]
    for required_field in (
        "id",
        "created_at",
        "actor_id",
        "clinic_id",
        "agent_id",
        "message_preview",
        "reply_preview",
        "context_used",
        "latency_ms",
        "ok",
        "error_code",
    ):
        assert required_field in sample, f"missing field {required_field!r}"
    assert sample["context_used"] == ["sessions.list"]


# ---------------------------------------------------------------------------
# /ops/abuse-signals — quiet vs noisy clinics
# ---------------------------------------------------------------------------


def test_abuse_signals_returns_empty_when_no_rows(
    super_admin_client: TestClient,
) -> None:
    resp = super_admin_client.get("/api/v1/agents/ops/abuse-signals")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["signals"] == []
    assert body["median_runs_per_pair"] == 0.0


def test_abuse_signals_quiet_pairs_flag_nothing(
    super_admin_client: TestClient, db_session
) -> None:
    """Three clinics, each with a single run on the same agent — perfectly
    flat distribution, every pair is at the median, nothing should be flagged."""
    for cid in ("clinic-a", "clinic-b", "clinic-c"):
        _seed_audit_row(
            db=db_session, clinic_id=cid, agent_id="clinic.reception"
        )

    resp = super_admin_client.get("/api/v1/agents/ops/abuse-signals")
    assert resp.status_code == 200
    body = resp.json()
    assert body["signals"] == []
    assert body["median_runs_per_pair"] == 1.0


def test_abuse_signals_flags_high_severity_when_10x_median(
    super_admin_client: TestClient, db_session
) -> None:
    """One pair at 10 runs while the rest sit at 1 → 10x the median = high."""
    # Five quiet pairs, each with 1 run on different agents/clinics.
    for i in range(5):
        _seed_audit_row(
            db=db_session,
            clinic_id=f"clinic-quiet-{i}",
            agent_id="clinic.reception",
        )
    # One noisy pair with 10 runs.
    for _ in range(10):
        _seed_audit_row(
            db=db_session,
            clinic_id="clinic-noisy",
            agent_id="clinic.reporting",
        )

    resp = super_admin_client.get("/api/v1/agents/ops/abuse-signals")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["median_runs_per_pair"] == 1.0
    assert len(body["signals"]) == 1
    sig = body["signals"][0]
    assert sig["clinic_id"] == "clinic-noisy"
    assert sig["agent_id"] == "clinic.reporting"
    assert sig["runs_count"] == 10
    assert sig["severity"] == "high"
    assert sig["p_above_median"] >= 10.0


def test_abuse_signals_window_minutes_excludes_old_rows(
    super_admin_client: TestClient, db_session
) -> None:
    """Rows older than the window should not be aggregated."""
    old = datetime.now(timezone.utc) - timedelta(hours=12)
    # 20 ancient rows in clinic-a — outside the default 60-minute window.
    for _ in range(20):
        _seed_audit_row(
            db=db_session,
            clinic_id="clinic-a",
            agent_id="clinic.reception",
            created_at=old,
        )
    # 1 fresh row in clinic-b.
    _seed_audit_row(
        db=db_session, clinic_id="clinic-b", agent_id="clinic.reception"
    )

    resp = super_admin_client.get(
        "/api/v1/agents/ops/abuse-signals?window_minutes=60"
    )
    assert resp.status_code == 200
    body = resp.json()
    # Only the fresh row counts → median is 1, nothing above 5x it.
    assert body["median_runs_per_pair"] == 1.0
    assert body["signals"] == []


def test_abuse_signals_window_minutes_clamped(
    super_admin_client: TestClient,
) -> None:
    # Spec: window_minutes ∈ [1, 1440] (FastAPI enforces).
    resp = super_admin_client.get(
        "/api/v1/agents/ops/abuse-signals?window_minutes=0"
    )
    assert resp.status_code == 422
    resp = super_admin_client.get(
        "/api/v1/agents/ops/abuse-signals?window_minutes=2000"
    )
    assert resp.status_code == 422
