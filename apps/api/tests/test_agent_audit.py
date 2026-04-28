"""Tests for the persistent agent-run audit trail (Phase 3).

Covers:

* The ``agent_run_audit`` table is created by ``reset_database()`` (i.e.
  the SQLAlchemy model is registered with ``Base.metadata``) so the
  fixture-driven test harness can write rows immediately.
* :func:`audit.record_run` writes a row with the right previews,
  ``context_used_json``, latency and ``ok`` flag.
* The 200/500-character truncation rule is enforced for the
  ``message_preview`` and ``reply_preview`` columns.
* End-to-end via the runner with a mocked ``_llm_chat`` produces an
  audit row tagged with the actor's clinic id and the agent id.
* Audit failure (mocked DB error) does not break the agent reply.
* ``GET /api/v1/agents/runs`` returns clinician-scoped rows, supports the
  ``agent_id`` filter, clamps oversized ``limit``, and rejects guests.
"""
from __future__ import annotations

import json as _json

import pytest
from fastapi.testclient import TestClient

from app.auth import AuthenticatedActor
from app.database import SessionLocal
from app.persistence.models import AgentRunAudit
from app.services.agents import audit
from app.services.agents import runner as agent_runner
from app.services.agents.registry import AGENT_REGISTRY


# ---------------------------------------------------------------------------
# LLM stub (mirrors test_agents_router.py) — every test in this module
# wants a deterministic reply unless it overrides the patch itself.
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def _stub_llm(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "app.services.chat_service._llm_chat",
        lambda **kwargs: "audit-test reply",
    )


@pytest.fixture
def db_session():
    s = SessionLocal()
    try:
        yield s
    finally:
        s.close()


@pytest.fixture
def clinician_actor() -> AuthenticatedActor:
    return AuthenticatedActor(
        actor_id="actor-clinician-demo",
        display_name="Verified Clinician Demo",
        role="clinician",  # type: ignore[arg-type]
        package_id="clinician_pro",
        clinic_id="clinic-demo-default",
    )


@pytest.fixture
def admin_actor() -> AuthenticatedActor:
    return AuthenticatedActor(
        actor_id="actor-admin-demo",
        display_name="Admin Demo User",
        role="admin",  # type: ignore[arg-type]
        package_id="enterprise",
        clinic_id="clinic-demo-default",
    )


# ---------------------------------------------------------------------------
# Schema / migration sanity
# ---------------------------------------------------------------------------


def test_agent_run_audit_table_is_created(db_session) -> None:
    """``reset_database()`` must register and create the new table."""
    # If the model is registered with Base.metadata, this query succeeds
    # against an empty table rather than raising "no such table".
    rows = db_session.query(AgentRunAudit).all()
    assert rows == []


# ---------------------------------------------------------------------------
# audit.record_run — direct unit tests
# ---------------------------------------------------------------------------


def test_record_run_writes_row_with_expected_fields(
    db_session, clinician_actor: AuthenticatedActor
) -> None:
    row = audit.record_run(
        db=db_session,
        actor=clinician_actor,
        agent_id="clinic.reception",
        message="Book a session for tomorrow.",
        reply="Sure — what time works?",
        context_used=["sessions.list", "patients.search"],
        latency_ms=123,
        ok=True,
    )
    assert row.id  # populated UUID hex
    assert row.created_at is not None
    assert row.actor_id == "actor-clinician-demo"
    assert row.clinic_id == "clinic-demo-default"
    assert row.agent_id == "clinic.reception"
    assert row.message_preview == "Book a session for tomorrow."
    assert row.reply_preview == "Sure — what time works?"
    assert row.latency_ms == 123
    assert row.ok is True
    assert row.error_code is None
    assert _json.loads(row.context_used_json) == [
        "sessions.list",
        "patients.search",
    ]


def test_record_run_truncates_message_over_200_chars(
    db_session, clinician_actor: AuthenticatedActor
) -> None:
    long_msg = "a" * 350
    row = audit.record_run(
        db=db_session,
        actor=clinician_actor,
        agent_id="clinic.reception",
        message=long_msg,
        reply="ok",
        context_used=None,
        latency_ms=10,
        ok=True,
    )
    # 200 chars + trailing ellipsis sentinel ('…')
    assert len(row.message_preview) == 201
    assert row.message_preview.endswith("…")
    assert row.message_preview[:200] == "a" * 200


def test_record_run_truncates_reply_over_500_chars(
    db_session, clinician_actor: AuthenticatedActor
) -> None:
    long_reply = "z" * 900
    row = audit.record_run(
        db=db_session,
        actor=clinician_actor,
        agent_id="clinic.reception",
        message="hi",
        reply=long_reply,
        context_used=None,
        latency_ms=10,
        ok=True,
    )
    # 500 chars + trailing ellipsis sentinel ('…')
    assert len(row.reply_preview) == 501
    assert row.reply_preview.endswith("…")
    assert row.reply_preview[:500] == "z" * 500


def test_record_run_with_none_actor_writes_nullable_columns(
    db_session,
) -> None:
    row = audit.record_run(
        db=db_session,
        actor=None,
        agent_id="clinic.reception",
        message="ping",
        reply="pong",
        context_used=[],
        latency_ms=5,
        ok=True,
    )
    assert row.actor_id is None
    assert row.clinic_id is None
    assert row.context_used_json is None  # empty list -> NULL


def test_record_run_records_error_code(
    db_session, clinician_actor: AuthenticatedActor
) -> None:
    row = audit.record_run(
        db=db_session,
        actor=clinician_actor,
        agent_id="clinic.reception",
        message="x",
        reply="",
        context_used=[],
        latency_ms=42,
        ok=False,
        error_code="llm_call_failed",
    )
    assert row.ok is False
    assert row.error_code == "llm_call_failed"


# ---------------------------------------------------------------------------
# Runner integration — end-to-end with mocked LLM
# ---------------------------------------------------------------------------


def test_runner_creates_audit_row_on_success(
    db_session, clinician_actor: AuthenticatedActor
) -> None:
    before = db_session.query(AgentRunAudit).count()
    result = agent_runner.run_agent(
        AGENT_REGISTRY["clinic.reception"],
        message="Hi there",
        actor=clinician_actor,
        db=db_session,
    )
    assert result["reply"] == "audit-test reply"

    rows = (
        db_session.query(AgentRunAudit)
        .order_by(AgentRunAudit.created_at.desc())
        .all()
    )
    assert len(rows) == before + 1
    row = rows[0]
    assert row.agent_id == "clinic.reception"
    assert row.actor_id == "actor-clinician-demo"
    assert row.clinic_id == "clinic-demo-default"
    assert row.message_preview == "Hi there"
    assert row.reply_preview == "audit-test reply"
    assert row.ok is True
    assert row.error_code is None
    assert row.latency_ms is not None and row.latency_ms >= 0


def test_runner_creates_audit_row_on_llm_failure(
    db_session,
    clinician_actor: AuthenticatedActor,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def _boom(**_kwargs):
        raise RuntimeError("upstream is sad")

    monkeypatch.setattr("app.services.chat_service._llm_chat", _boom)

    result = agent_runner.run_agent(
        AGENT_REGISTRY["clinic.reception"],
        message="boom please",
        actor=clinician_actor,
        db=db_session,
    )
    assert result["error"] == "llm_call_failed"
    assert result["reply"] == ""

    row = (
        db_session.query(AgentRunAudit)
        .order_by(AgentRunAudit.created_at.desc())
        .first()
    )
    assert row is not None
    assert row.ok is False
    assert row.error_code == "llm_call_failed"
    assert row.message_preview == "boom please"


def test_runner_audit_failure_does_not_break_run(
    db_session,
    clinician_actor: AuthenticatedActor,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """If the audit insert blows up the user still gets their reply."""

    def _bad_record(**_kwargs):
        raise RuntimeError("DB exploded")

    monkeypatch.setattr(
        "app.services.agents.audit.record_run", _bad_record
    )

    result = agent_runner.run_agent(
        AGENT_REGISTRY["clinic.reception"],
        message="still works",
        actor=clinician_actor,
        db=db_session,
    )
    # Reply must still be returned even though audit blew up.
    assert result["reply"] == "audit-test reply"
    assert "error" not in result


# ---------------------------------------------------------------------------
# GET /api/v1/agents/runs — endpoint behaviour
# ---------------------------------------------------------------------------


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
) -> AgentRunAudit:
    """Insert an audit row directly to keep these tests independent of
    the runner integration above (already covered)."""
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
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def test_runs_endpoint_returns_clinic_scoped_rows_only(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
    db_session,
) -> None:
    # Two rows in clinic-demo-default + one in another tenant.
    _seed_audit_row(db=db_session, agent_id="clinic.reception")
    _seed_audit_row(db=db_session, agent_id="clinic.aliclaw_doctor_telegram")
    _seed_audit_row(
        db=db_session,
        agent_id="clinic.reception",
        actor_id=None,
        clinic_id="clinic-other",
    )

    resp = client.get(
        "/api/v1/agents/runs", headers=auth_headers["clinician"]
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "runs" in body
    runs = body["runs"]
    # Only the two demo-clinic rows must be returned.
    assert len(runs) == 2
    assert {r["agent_id"] for r in runs} == {
        "clinic.reception",
        "clinic.aliclaw_doctor_telegram",
    }
    # Each row carries the documented projection.
    sample = runs[0]
    for required_field in (
        "id",
        "created_at",
        "actor_id",
        "agent_id",
        "message_preview",
        "reply_preview",
        "context_used",
        "latency_ms",
        "ok",
        "error_code",
    ):
        assert required_field in sample, f"missing field {required_field!r}"


def test_runs_endpoint_filters_by_agent_id(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
    db_session,
) -> None:
    _seed_audit_row(db=db_session, agent_id="clinic.reception")
    _seed_audit_row(db=db_session, agent_id="clinic.aliclaw_doctor_telegram")

    resp = client.get(
        "/api/v1/agents/runs?agent_id=clinic.reception",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200, resp.text
    runs = resp.json()["runs"]
    assert len(runs) == 1
    assert runs[0]["agent_id"] == "clinic.reception"


def test_runs_endpoint_clamps_oversized_limit(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
    db_session,
) -> None:
    # Seed three rows so we can verify the response shape; the clamp is
    # enforced by FastAPI's Query(le=200) — anything above 200 is a 422.
    for _ in range(3):
        _seed_audit_row(db=db_session)

    # Asking for 500 must NOT 200 with 500 rows; the docstring clamps to
    # [1, 200], so FastAPI returns 422 on out-of-range. Either contract
    # is acceptable per the spec ("clamp to 200") — both prevent the
    # caller from pulling more than 200 rows in one go.
    resp_too_high = client.get(
        "/api/v1/agents/runs?limit=500",
        headers=auth_headers["clinician"],
    )
    assert resp_too_high.status_code == 422

    # Sanity check: limit at the upper bound works.
    resp_ok = client.get(
        "/api/v1/agents/runs?limit=200",
        headers=auth_headers["clinician"],
    )
    assert resp_ok.status_code == 200
    assert len(resp_ok.json()["runs"]) == 3  # only seeded 3 — capped at min(3,200)


def test_runs_endpoint_orders_newest_first(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
    db_session,
) -> None:
    import time as _t

    first = _seed_audit_row(db=db_session, agent_id="clinic.reception")
    _t.sleep(0.01)  # ensure created_at differs even on coarse clocks
    second = _seed_audit_row(
        db=db_session, agent_id="clinic.aliclaw_doctor_telegram"
    )

    resp = client.get(
        "/api/v1/agents/runs", headers=auth_headers["clinician"]
    )
    assert resp.status_code == 200, resp.text
    ids = [r["id"] for r in resp.json()["runs"]]
    assert ids == [second.id, first.id]


def test_runs_endpoint_returns_decoded_context_used_list(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
    db_session,
) -> None:
    _seed_audit_row(
        db=db_session,
        context_used=["sessions.list", "patients.search"],
    )
    resp = client.get(
        "/api/v1/agents/runs", headers=auth_headers["clinician"]
    )
    assert resp.status_code == 200
    runs = resp.json()["runs"]
    assert runs[0]["context_used"] == [
        "sessions.list",
        "patients.search",
    ]


def test_runs_endpoint_rejects_guest(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
) -> None:
    resp = client.get(
        "/api/v1/agents/runs", headers=auth_headers["guest"]
    )
    assert resp.status_code in (401, 403)


def test_runs_endpoint_rejects_unauthenticated(
    client: TestClient,
) -> None:
    resp = client.get("/api/v1/agents/runs")
    assert resp.status_code in (401, 403)


def test_runs_endpoint_admin_sees_clinic_rows(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
    db_session,
) -> None:
    """Spec: 'admins see their clinic's runs too' — same scope as
    clinicians for this endpoint."""
    _seed_audit_row(db=db_session, agent_id="clinic.reception")
    resp = client.get(
        "/api/v1/agents/runs", headers=auth_headers["admin"]
    )
    assert resp.status_code == 200, resp.text
    runs = resp.json()["runs"]
    assert len(runs) == 1
    assert runs[0]["agent_id"] == "clinic.reception"
