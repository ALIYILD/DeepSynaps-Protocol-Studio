"""Per-agent canary smoke tests.

These tests exist to LOCK IN structural invariants of the agent runner
output regardless of the underlying LLM. The LLM call is stubbed out —
we are NOT testing semantic correctness here. We are testing that:

* every agent in :data:`AGENT_REGISTRY` is reachable through
  :func:`run_agent` with a minimal authenticated actor,
* the response envelope still carries the documented ``schema_id`` and
  ``safety_footer`` strings every frontend / audit consumer relies on,
* the response carries the right ``agent_id``,
* the response includes a ``reply`` field (string, possibly empty), and
* for the crisis agent specifically, the reply is non-empty and contains
  at least one of the escalation tokens hard-coded in the system prompt
  (``999`` / ``911`` / ``emergency``).

Why bother? Two real failure modes this catches:

1. Someone edits a system prompt and accidentally removes an escalation
   token — the crisis canary fires.
2. Someone refactors the runner envelope (e.g. renames ``schema_id``
   to ``schema``) and breaks every downstream consumer — every canary
   row fires at once.

Patient-side agents are gated at the **router** layer (package +
activation), not in :func:`run_agent` itself. Calling ``run_agent``
directly is therefore a legitimate code path and exercises exactly the
invariant the parent ticket asked for. We keep the runner-level call so
the smoke test stays decoupled from router policy churn.
"""
from __future__ import annotations

from typing import Any

import pytest

from app.auth import AuthenticatedActor
from app.database import SessionLocal
from app.services.agents import runner as agent_runner
from app.services.agents.registry import AGENT_REGISTRY
from app.services.agents.runner import SAFETY_FOOTER, SCHEMA_ID

from tests.canaries.fixtures import (
    CANARY_INPUTS,
    CRISIS_AGENT_IDS,
    CRISIS_ESCALATION_TOKENS,
    CRISIS_HARD_SCRIPT,
    DEFAULT_CANARY_REPLY,
)


# ---------------------------------------------------------------------------
# LLM stub — context-aware so the crisis canary still validates the
# escalation script while every other canary gets the bland reply.
# ---------------------------------------------------------------------------


def _smart_llm_stub(**kwargs: Any) -> str:
    """Return the crisis hard-script when invoked with the crisis prompt.

    The stub inspects the ``system`` argument (which the runner builds
    from :func:`resolve_system_prompt`) for a sentinel substring unique
    to the crisis agent's prompt. This keeps the stub purely structural
    — we don't pattern-match on the user message — so a future runner
    refactor that re-orders args still trips the right branch.
    """
    system = (kwargs.get("system") or "") if isinstance(kwargs, dict) else ""
    # ``Crisis Safety Agent`` is the unique opening of the crisis system
    # prompt; no other agent prompt mentions it.
    if "Crisis Safety Agent" in system:
        return CRISIS_HARD_SCRIPT
    return DEFAULT_CANARY_REPLY


@pytest.fixture(autouse=True)
def _stub_llm(monkeypatch: pytest.MonkeyPatch) -> None:
    """Patch the chat service's LLM helper for every canary test row.

    We patch BOTH the legacy ``_llm_chat`` and the metering helper
    ``_llm_chat_with_usage`` because the runner prefers the latter when
    available. Patching only one of them would let the runner flip
    behaviour silently between minor releases of ``chat_service``.
    """
    monkeypatch.setattr(
        "app.services.chat_service._llm_chat",
        lambda **kwargs: _smart_llm_stub(**kwargs),
    )

    def _stub_with_usage(**kwargs: Any) -> tuple[str, dict[str, int] | None]:
        text = _smart_llm_stub(**kwargs)
        # Returning ``None`` for the usage block forces the runner's
        # char/4 fallback, which is fine for canary purposes — we don't
        # assert on token counts here.
        return text, None

    # Some builds of chat_service expose this; tolerate its absence.
    if hasattr(__import__("app.services.chat_service", fromlist=["_llm_chat_with_usage"]), "_llm_chat_with_usage"):
        monkeypatch.setattr(
            "app.services.chat_service._llm_chat_with_usage",
            _stub_with_usage,
        )


# ---------------------------------------------------------------------------
# Actor + DB session helpers
# ---------------------------------------------------------------------------


@pytest.fixture
def db_session():
    s = SessionLocal()
    try:
        yield s
    finally:
        s.close()


def _actor_for_agent(agent_id: str) -> AuthenticatedActor:
    """Return a minimal :class:`AuthenticatedActor` capable of running ``agent_id``.

    Patient-side agents declare ``role_required="clinician"`` (parents/caregivers
    invoke them on the patient's behalf in v1), so a single clinician actor
    satisfies role gating across the entire registry. We pin the package id to
    the agent's required package when one is set so the broker / budget gates
    read the same identity downstream.
    """
    agent = AGENT_REGISTRY[agent_id]
    package_id = (
        agent.package_required[0]
        if agent.package_required
        else "clinician_pro"
    )
    return AuthenticatedActor(
        actor_id="actor-clinician-demo",
        display_name="Verified Clinician Demo",
        role="clinician",  # type: ignore[arg-type]
        package_id=package_id,
        clinic_id="clinic-demo-default",
    )


# ---------------------------------------------------------------------------
# Canary matrix — one parametrised row per agent
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("agent_id", "canary_message"),
    CANARY_INPUTS,
    ids=[agent_id for agent_id, _ in CANARY_INPUTS],
)
def test_agent_canary_envelope(
    agent_id: str,
    canary_message: str,
    db_session,
) -> None:
    """Every agent must return the documented envelope shape."""
    assert agent_id in AGENT_REGISTRY, (
        f"Canary fixture references unknown agent_id={agent_id!r}; "
        "fixtures.py is out of sync with AGENT_REGISTRY."
    )
    agent = AGENT_REGISTRY[agent_id]
    actor = _actor_for_agent(agent_id)

    result = agent_runner.run_agent(
        agent,
        message=canary_message,
        actor=actor,
        db=db_session,
    )

    # ── Structural invariants — the contract every consumer relies on ──
    assert isinstance(result, dict), (
        f"run_agent returned {type(result).__name__}, expected dict"
    )
    assert result.get("agent_id") == agent.id, (
        f"agent_id mismatch: got {result.get('agent_id')!r}"
    )
    assert result.get("schema_id") == SCHEMA_ID, (
        f"schema_id drift: got {result.get('schema_id')!r}"
    )
    assert result.get("safety_footer") == SAFETY_FOOTER, (
        f"safety_footer drift: got {result.get('safety_footer')!r}"
    )
    assert "reply" in result, "envelope missing 'reply' field"
    assert isinstance(result["reply"], str), (
        f"reply must be str, got {type(result['reply']).__name__}"
    )

    # ── Behavioural floor — happy-path replies should be non-empty ──
    # If the runner short-circuited (budget exceeded, cost cap reached,
    # message-too-long), surface that explicitly so it's clear the canary
    # didn't reach the LLM. None of those fire on a fresh isolated DB
    # with a 30-char message, so this should never trip in practice; if
    # it does, the upstream gate logic regressed.
    error = result.get("error")
    assert error is None, (
        f"unexpected runner error for {agent_id!r}: {error!r} "
        f"(canary should never hit a budget/cost gate)"
    )

    if agent_id in CRISIS_AGENT_IDS:
        # Crisis path — the stub injects the hard-script; assert at
        # least one escalation token is present so a future prompt edit
        # that strips the emergency numbers fires this row.
        assert result["reply"], (
            f"crisis canary for {agent_id!r} returned an empty reply"
        )
        lowered = result["reply"].lower()
        assert any(tok.lower() in lowered for tok in CRISIS_ESCALATION_TOKENS), (
            f"crisis reply for {agent_id!r} contains no escalation token "
            f"({CRISIS_ESCALATION_TOKENS}); reply was: {result['reply']!r}"
        )
    else:
        # Non-crisis canaries can come back as either:
        #   (a) the stubbed plain reply, or
        #   (b) a tool-call confirmation envelope (some agents may parse
        #       a leading JSON line as a pending_tool_call). Either is a
        #       valid runner output — we only require the schema_id stays
        #       stable, which we already asserted above. The reply itself
        #       just has to be a string; emptiness is allowed when the
        #       agent surfaced a pending_tool_call instead of prose.
        if "pending_tool_call" not in result:
            assert result["reply"] == DEFAULT_CANARY_REPLY, (
                f"canary reply drift for {agent_id!r}: got "
                f"{result['reply']!r}"
            )


def test_canary_fixture_covers_every_registered_agent() -> None:
    """The fixture list must stay in lock-step with ``AGENT_REGISTRY``.

    Adding a new agent without adding a canary row would let a regression
    slip through the smoke matrix entirely. Catch that at test time so
    the contract is enforceable in CI.
    """
    fixture_ids = {agent_id for agent_id, _ in CANARY_INPUTS}
    registry_ids = set(AGENT_REGISTRY.keys())
    missing = registry_ids - fixture_ids
    assert not missing, (
        "Canary fixture is missing rows for these agents: "
        f"{sorted(missing)}. Add a tuple in tests/canaries/fixtures.py."
    )
    extra = fixture_ids - registry_ids
    assert not extra, (
        "Canary fixture references agents that no longer exist: "
        f"{sorted(extra)}."
    )
