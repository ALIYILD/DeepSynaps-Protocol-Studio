"""Tests for the Agent Marketplace ToolBroker (Phase 2).

Covers:

* Every tool id declared by *any* registered agent is present in
  :data:`TOOL_REGISTRY` (no orphan ids slip into a ``tool_allowlist``).
* :func:`broker.fetch_context` returns a dict whose keys are a subset of
  the agent's allowlist *minus* the write-only tools.
* Unknown tool ids are logged as a warning and skipped, never raised.
* The runner integration: when ``actor`` and ``db`` are passed in, the
  user message handed to ``_llm_chat`` contains the
  ``<context source="clinic_live">`` block.
* Write-only tools (``sessions.create``, ``sessions.cancel``,
  ``notes.approve_draft``) are present in the registry but flagged
  ``write_only=True`` and skipped by the broker.
* A handler whose payload exceeds :data:`broker.PER_TOOL_MAX_CHARS` is
  truncated with a ``"truncated": true`` marker.
"""
from __future__ import annotations

import logging

import pytest

from app.auth import AuthenticatedActor
from app.database import SessionLocal
from app.services.agents import broker
from app.services.agents.registry import AGENT_REGISTRY
from app.services.agents.tools.registry import TOOL_REGISTRY


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
def clinician_actor() -> AuthenticatedActor:
    # Mirrors the demo clinician seeded by tests/conftest.py.
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
# Registry shape
# ---------------------------------------------------------------------------


def test_every_agent_tool_id_is_registered() -> None:
    """No agent is allowed to declare a tool id we cannot dispatch."""
    declared: set[str] = set()
    for agent in AGENT_REGISTRY.values():
        declared.update(agent.tool_allowlist)
    missing = declared - set(TOOL_REGISTRY.keys())
    assert not missing, (
        f"Agent allowlist references unregistered tool ids: {sorted(missing)}"
    )


def test_known_write_tools_are_flagged() -> None:
    for tool_id in ("sessions.create", "sessions.cancel", "notes.approve_draft"):
        assert tool_id in TOOL_REGISTRY, f"missing write tool {tool_id!r}"
        tool = TOOL_REGISTRY[tool_id]
        assert tool.write_only is True
        assert tool.handler is None


def test_read_tools_have_handlers() -> None:
    write_only = {"sessions.create", "sessions.cancel", "notes.approve_draft"}
    for tool_id, tool in TOOL_REGISTRY.items():
        if tool_id in write_only:
            continue
        assert tool.handler is not None, (
            f"read-only tool {tool_id!r} must define a handler"
        )


# ---------------------------------------------------------------------------
# fetch_context — happy path + filtering
# ---------------------------------------------------------------------------


def test_fetch_context_for_reception_agent_returns_only_read_tools(
    clinician_actor: AuthenticatedActor, db_session
) -> None:
    agent = AGENT_REGISTRY["clinic.reception"]
    ctx = broker.fetch_context(agent, clinician_actor, db_session)

    expected_keys = {
        t for t in agent.tool_allowlist if not TOOL_REGISTRY[t].write_only
    }
    assert set(ctx.keys()) == expected_keys

    # Write tools must NOT appear.
    for write_tool in ("sessions.create", "sessions.cancel"):
        assert write_tool not in ctx


def test_fetch_context_skips_write_tools_for_aliclaw_agent(
    clinician_actor: AuthenticatedActor, db_session
) -> None:
    agent = AGENT_REGISTRY["clinic.aliclaw_doctor_telegram"]
    ctx = broker.fetch_context(agent, clinician_actor, db_session)
    assert "notes.approve_draft" not in ctx
    # The remaining read tools should all show up.
    assert {"sessions.list", "patients.search", "notes.list", "tasks.list"}.issubset(
        ctx.keys()
    )


def test_fetch_context_for_admin_reporting_agent(
    admin_actor: AuthenticatedActor, db_session
) -> None:
    agent = AGENT_REGISTRY["clinic.reporting"]
    ctx = broker.fetch_context(agent, admin_actor, db_session)
    assert set(ctx.keys()) == {
        "outcomes.summary",
        "treatment_courses.list",
        "adverse_events.list",
        "finance.summary",
    }
    # Each entry should be a JSON-serialisable dict (no exception path
    # leaked from a handler).
    import json as _json

    for tool_id, payload in ctx.items():
        _json.dumps(payload, default=str)
        assert isinstance(payload, dict), f"{tool_id} should return a dict"


# ---------------------------------------------------------------------------
# fetch_context — unknown tool id is logged + skipped
# ---------------------------------------------------------------------------


def test_fetch_context_with_unknown_tool_id_logs_warning_and_continues(
    clinician_actor: AuthenticatedActor,
    db_session,
    caplog: pytest.LogCaptureFixture,
) -> None:
    from app.services.agents.registry import AgentDefinition

    agent = AgentDefinition(
        id="test.synthetic",
        name="Synthetic",
        tagline="t",
        audience="clinic",
        role_required="clinician",
        package_required=[],
        tool_allowlist=["sessions.list", "definitely.not.a.real.tool"],
        system_prompt="x",
        monthly_price_gbp=0,
        tags=[],
    )

    with caplog.at_level(logging.WARNING, logger="app.services.agents.broker"):
        ctx = broker.fetch_context(agent, clinician_actor, db_session)

    # Known tool came back; unknown skipped.
    assert "sessions.list" in ctx
    assert "definitely.not.a.real.tool" not in ctx
    # Warning emitted with the right event tag.
    assert any(
        "agent_tool_unknown" in (rec.message or "")
        or getattr(rec, "event", "") == "agent_tool_unknown"
        for rec in caplog.records
    )


# ---------------------------------------------------------------------------
# fetch_context — handler exception folds into {"error": ...}
# ---------------------------------------------------------------------------


def test_fetch_context_swallows_handler_exception(
    clinician_actor: AuthenticatedActor,
    db_session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def _boom(actor, db):  # pragma: no cover — invoked by broker
        raise RuntimeError("kaboom")

    target_tool = TOOL_REGISTRY["sessions.list"]
    # Pydantic frozen model — patch the field via attribute monkey-patch
    # using the underlying dict so we don't need to mutate the model.
    object.__setattr__(target_tool, "handler", _boom)
    try:
        from app.services.agents.registry import AgentDefinition

        agent = AgentDefinition(
            id="test.bang",
            name="Bang",
            tagline="t",
            audience="clinic",
            role_required="clinician",
            package_required=[],
            tool_allowlist=["sessions.list"],
            system_prompt="x",
            monthly_price_gbp=0,
            tags=[],
        )
        ctx = broker.fetch_context(agent, clinician_actor, db_session)
        assert ctx["sessions.list"] == {"error": "kaboom"}
    finally:
        # Restore the real handler so the rest of the suite is unaffected.
        from app.services.agents.tools.registry import _h_sessions_list

        object.__setattr__(target_tool, "handler", _h_sessions_list)


# ---------------------------------------------------------------------------
# Per-tool truncation
# ---------------------------------------------------------------------------


def test_per_tool_payload_is_truncated_when_oversized() -> None:
    huge = {"items": ["x" * 100 for _ in range(100)]}  # well over 2 KB
    out = broker._truncate_payload("sessions.list", huge)
    assert isinstance(out, dict)
    assert out.get("truncated") is True
    assert out["kept_chars"] == broker.PER_TOOL_MAX_CHARS
    assert out["original_chars"] > broker.PER_TOOL_MAX_CHARS
    assert isinstance(out["head"], str) and len(out["head"]) == broker.PER_TOOL_MAX_CHARS


def test_per_tool_payload_passes_through_when_small() -> None:
    small = {"items": [{"id": "a"}, {"id": "b"}]}
    out = broker._truncate_payload("sessions.list", small)
    assert out is small  # identity — no copy when within budget


# ---------------------------------------------------------------------------
# Runner integration — end-to-end with mocked LLM
# ---------------------------------------------------------------------------


def test_run_agent_embeds_live_context_block_in_user_message(
    clinician_actor: AuthenticatedActor,
    db_session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.services.agents import run_agent
    from app.services.agents.registry import AGENT_REGISTRY

    captured: dict[str, object] = {}

    def _capture(**kwargs):
        captured.update(kwargs)
        return "ok"

    monkeypatch.setattr("app.services.chat_service._llm_chat", _capture)

    result = run_agent(
        AGENT_REGISTRY["clinic.reception"],
        message="Hi, what's on the books?",
        actor=clinician_actor,
        db=db_session,
    )

    user_content = captured["messages"][0]["content"]  # type: ignore[index]
    assert '<context source="clinic_live">' in user_content
    assert "Hi, what's on the books?" in user_content

    # System prompt should carry the "use the live context" footer.
    system = captured["system"]
    assert "live <context>" in system  # the LIVE_CONTEXT_SYSTEM_FOOTER text

    # context_used surfaces the tool ids that were actually pre-fetched.
    assert "sessions.list" in result["context_used"]
    # Write tools never end up in context_used.
    assert "sessions.create" not in result["context_used"]
    assert "sessions.cancel" not in result["context_used"]


def test_run_agent_skips_context_when_db_or_actor_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Backward-compat: callers that don't pass db+actor must still work."""
    from app.services.agents import run_agent
    from app.services.agents.registry import AGENT_REGISTRY

    captured: dict[str, object] = {}

    def _capture(**kwargs):
        captured.update(kwargs)
        return "ok"

    monkeypatch.setattr("app.services.chat_service._llm_chat", _capture)

    result = run_agent(AGENT_REGISTRY["clinic.reception"], message="hello")

    assert result["context_used"] == []
    user_content = captured["messages"][0]["content"]  # type: ignore[index]
    assert '<context source="clinic_live">' not in user_content


# ---------------------------------------------------------------------------
# Patient-side agents (gated) — broker must safely return the
# {"unavailable": True} envelope for every tool, never raise.
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "agent_id",
    [
        "patient.care_companion",
        "patient.adherence",
        "patient.education",
        "patient.crisis",
    ],
)
def test_fetch_context_for_patient_agent_returns_unavailable_envelopes(
    agent_id: str,
    clinician_actor: AuthenticatedActor,
    db_session,
) -> None:
    agent = AGENT_REGISTRY[agent_id]
    ctx = broker.fetch_context(agent, clinician_actor, db_session)

    # Every allowlisted tool should have produced *something*; nothing
    # should have crashed and bubbled up.
    assert set(ctx.keys()) == set(agent.tool_allowlist)
    for tool_id, payload in ctx.items():
        assert isinstance(payload, dict), (
            f"{tool_id} payload should be a dict, got {type(payload)!r}"
        )
        assert payload.get("unavailable") is True, (
            f"{tool_id} must return the unavailable envelope today; "
            f"got {payload!r}"
        )
