"""Tests for Phase 7 — per-package agent token / cost budgets.

Covers:

* The new audit columns (``tokens_in_used``, ``tokens_out_used``,
  ``cost_pence``) are written by :func:`audit.record_run` and end up
  populated when the runner finishes a turn end-to-end.
* The pre-LLM budget gate in :func:`runner.run_agent` short-circuits
  with ``error="budget_exceeded"`` when any of the three caps is at /
  above its configured value, and the LLM is NOT invoked in that case.
* Different packages get different caps — switching the actor's
  ``package_id`` flips which budget row applies.
* Actors holding an unknown ``package_id`` fall back to the ``free``
  tier (the most-restrictive default) instead of escaping the gate.
* The 051 migration applies cleanly: the three default budget rows are
  seeded and the audit columns exist on the table.
"""
from __future__ import annotations

import pytest
from sqlalchemy import inspect

from app.auth import AuthenticatedActor
from app.database import SessionLocal
from app.persistence.models import AgentRunAudit, PackageTokenBudget
from app.services.agents import audit, runner as agent_runner
from app.services.agents.registry import AGENT_REGISTRY


# ---------------------------------------------------------------------------
# LLM stub — we want a deterministic reply across these tests, plus the
# ability to assert "the LLM was NOT called" when the budget gate fires.
# ---------------------------------------------------------------------------


@pytest.fixture
def llm_calls(monkeypatch: pytest.MonkeyPatch):
    """Patch ``_llm_chat`` and capture invocations.

    Yields a list that the test can inspect. Returning a deterministic
    string keeps the rest of the runner happy; the call list is the
    contract the budget tests assert against.
    """
    captured: list[dict] = []

    def _capture(**kwargs):
        captured.append(kwargs)
        return "budget-test reply"

    monkeypatch.setattr("app.services.chat_service._llm_chat", _capture)
    yield captured


@pytest.fixture(autouse=True)
def _seed_default_package_budgets():
    """Re-seed the three default ``PackageTokenBudget`` rows.

    The conftest's ``isolated_database`` fixture wipes every table via
    :func:`reset_database(fast=True)` before each test. The model's
    ``after_create`` event seeds these rows only on table creation,
    which happens just once per pytest session — so without this
    fixture every budget test except the first would run against an
    empty ``package_token_budget`` table and the gate would silently
    disable itself (the pre-check returns ``None`` when no budget is
    configured).

    Idempotent: existing rows are skipped so re-running on an already-
    seeded session is a no-op. Tests that need to assert the empty-
    budget branch (``test_no_budget_rows_means_no_gate``) explicitly
    delete the rows back out after this fixture has run.
    """
    from datetime import datetime, timezone

    s = SessionLocal()
    try:
        existing = {r.package_id for r in s.query(PackageTokenBudget).all()}
        defaults = (
            ("free", 50_000, 10_000, 500),
            ("clinician_pro", 1_000_000, 200_000, 5_000),
            ("enterprise", 5_000_000, 1_000_000, 20_000),
        )
        now = datetime.now(timezone.utc)
        for pkg_id, ti, to, cp in defaults:
            if pkg_id in existing:
                continue
            s.add(
                PackageTokenBudget(
                    id=f"pkg_budget_{pkg_id}",
                    package_id=pkg_id,
                    monthly_tokens_in_cap=ti,
                    monthly_tokens_out_cap=to,
                    monthly_cost_pence_cap=cp,
                    created_at=now,
                    updated_at=now,
                )
            )
        s.commit()
    except Exception:
        s.rollback()
    finally:
        s.close()


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


# ---------------------------------------------------------------------------
# Migration / schema sanity
# ---------------------------------------------------------------------------


def test_phase7_migration_applies_cleanly(db_session) -> None:
    """The new columns + budget rows are present after reset_database()."""
    insp = inspect(db_session.bind)
    audit_cols = {c["name"] for c in insp.get_columns("agent_run_audit")}
    assert {"tokens_in_used", "tokens_out_used", "cost_pence"}.issubset(audit_cols)

    # Three default rows seeded by the migration (free, clinician_pro, enterprise).
    rows = db_session.query(PackageTokenBudget).all()
    by_pkg = {r.package_id: r for r in rows}
    assert {"free", "clinician_pro", "enterprise"}.issubset(by_pkg.keys())

    # Spec values
    assert by_pkg["free"].monthly_tokens_in_cap == 50_000
    assert by_pkg["free"].monthly_tokens_out_cap == 10_000
    assert by_pkg["free"].monthly_cost_pence_cap == 500

    assert by_pkg["clinician_pro"].monthly_tokens_in_cap == 1_000_000
    assert by_pkg["clinician_pro"].monthly_tokens_out_cap == 200_000
    assert by_pkg["clinician_pro"].monthly_cost_pence_cap == 5_000

    assert by_pkg["enterprise"].monthly_tokens_in_cap == 5_000_000
    assert by_pkg["enterprise"].monthly_tokens_out_cap == 1_000_000
    assert by_pkg["enterprise"].monthly_cost_pence_cap == 20_000


# ---------------------------------------------------------------------------
# audit.record_run — token + cost columns populated
# ---------------------------------------------------------------------------


def test_record_run_writes_token_and_cost_columns(
    db_session, clinician_actor: AuthenticatedActor
) -> None:
    row = audit.record_run(
        db=db_session,
        actor=clinician_actor,
        agent_id="clinic.reception",
        message="hi",
        reply="hello",
        context_used=None,
        latency_ms=10,
        ok=True,
        tokens_in=2000,
        tokens_out=500,
    )
    assert row.tokens_in_used == 2000
    assert row.tokens_out_used == 500
    # cost = 2000 * 0.001 + 500 * 0.003 = 2.0 + 1.5 = 3.5 → int(3.5) = 3
    assert row.cost_pence == 3


def test_record_run_default_zero_when_metering_omitted(
    db_session, clinician_actor: AuthenticatedActor
) -> None:
    """Older callers that don't pass tokens land at 0/0/0 instead of NULL."""
    row = audit.record_run(
        db=db_session,
        actor=clinician_actor,
        agent_id="clinic.reception",
        message="x",
        reply="y",
        context_used=None,
        latency_ms=1,
        ok=True,
    )
    assert row.tokens_in_used == 0
    assert row.tokens_out_used == 0
    assert row.cost_pence == 0


def test_compute_cost_pence_basic_math() -> None:
    # 1000 input @ 0.001 = 1.0 pence; 100 output @ 0.003 = 0.3 pence; floor = 1.
    assert audit.compute_cost_pence(1000, 100) == 1
    # Negative values clamp to 0.
    assert audit.compute_cost_pence(-5, -10) == 0
    # Large input: int truncation.
    assert audit.compute_cost_pence(1_000_000, 0) == 1000


# ---------------------------------------------------------------------------
# Runner — end-to-end token capture
# ---------------------------------------------------------------------------


def test_runner_writes_token_counts_to_audit_row(
    db_session,
    clinician_actor: AuthenticatedActor,
    llm_calls: list[dict],
) -> None:
    """A successful run lands a row whose token columns are populated."""
    result = agent_runner.run_agent(
        AGENT_REGISTRY["clinic.reception"],
        message="A reasonably long message to bump the token estimate above 1.",
        actor=clinician_actor,
        db=db_session,
    )
    assert result["reply"] == "budget-test reply"
    row = (
        db_session.query(AgentRunAudit)
        .order_by(AgentRunAudit.created_at.desc())
        .first()
    )
    assert row is not None
    assert (row.tokens_in_used or 0) > 0
    assert (row.tokens_out_used or 0) > 0
    # cost should follow from the price card; never below 0.
    assert (row.cost_pence or 0) >= 0


# ---------------------------------------------------------------------------
# Budget pre-check — over-cap clinic short-circuits without calling LLM
# ---------------------------------------------------------------------------


def _seed_audit_burn(
    db_session,
    *,
    clinic_id: str,
    tokens_in: int,
    tokens_out: int,
    cost_pence: int,
) -> None:
    """Insert one synthetic burn row.

    ``actor_id`` is left NULL — that column FKs to ``users.id`` with
    ``ondelete="SET NULL"`` so a NULL value never trips the constraint
    and the row still aggregates against the clinic-scoped budget gate.
    """
    row = AgentRunAudit(
        actor_id=None,
        clinic_id=clinic_id,
        agent_id="clinic.reception",
        message_preview="seed",
        reply_preview="seed",
        latency_ms=1,
        ok=True,
        tokens_in_used=tokens_in,
        tokens_out_used=tokens_out,
        cost_pence=cost_pence,
    )
    db_session.add(row)
    db_session.commit()


def test_budget_gate_blocks_over_cap_clinic(
    db_session,
    clinician_actor: AuthenticatedActor,
    llm_calls: list[dict],
) -> None:
    """clinician_pro: 1M / 200k / £50 — burn the input cap and verify
    the runner refuses without invoking the LLM."""
    _seed_audit_burn(
        db_session,
        clinic_id="clinic-demo-default",
        tokens_in=1_000_001,  # over the cap
        tokens_out=0,
        cost_pence=0,
    )

    result = agent_runner.run_agent(
        AGENT_REGISTRY["clinic.reception"],
        message="Can you book a session?",
        actor=clinician_actor,
        db=db_session,
    )

    assert result["error"] == "budget_exceeded"
    assert result["reply"] == ""
    budget = result["budget"]
    assert "tokens_in" in budget["exceeded"]
    assert budget["package_id"] == "clinician_pro"
    assert budget["tokens_in_cap"] == 1_000_000
    # LLM must NOT have been called.
    assert llm_calls == []

    # The block itself is audited so the abuse-signals view picks it up.
    blocked_rows = (
        db_session.query(AgentRunAudit)
        .filter(AgentRunAudit.error_code == "budget_exceeded")
        .all()
    )
    assert len(blocked_rows) == 1


def test_budget_gate_blocks_on_cost_cap(
    db_session,
    clinician_actor: AuthenticatedActor,
    llm_calls: list[dict],
) -> None:
    """The cost cap is independent — small token numbers but huge cost
    seeded directly trips the gate."""
    _seed_audit_burn(
        db_session,
        clinic_id="clinic-demo-default",
        tokens_in=10,
        tokens_out=10,
        cost_pence=6_000,  # > clinician_pro's 5000 cap
    )
    result = agent_runner.run_agent(
        AGENT_REGISTRY["clinic.reception"],
        message="hi",
        actor=clinician_actor,
        db=db_session,
    )
    assert result["error"] == "budget_exceeded"
    assert "cost_pence" in result["budget"]["exceeded"]
    assert llm_calls == []


def test_budget_gate_does_not_block_under_cap(
    db_session,
    clinician_actor: AuthenticatedActor,
    llm_calls: list[dict],
) -> None:
    """Under cap → run completes normally, LLM is invoked once."""
    _seed_audit_burn(
        db_session,
        clinic_id="clinic-demo-default",
        tokens_in=1,
        tokens_out=1,
        cost_pence=1,
    )
    result = agent_runner.run_agent(
        AGENT_REGISTRY["clinic.reception"],
        message="hi",
        actor=clinician_actor,
        db=db_session,
    )
    assert result["reply"] == "budget-test reply"
    assert "error" not in result
    assert len(llm_calls) == 1


# ---------------------------------------------------------------------------
# Different packages get different caps
# ---------------------------------------------------------------------------


def test_enterprise_actor_clears_a_burn_that_blocks_clinician_pro(
    db_session,
    llm_calls: list[dict],
) -> None:
    """Same clinic, same burn — only the package cap differs."""
    enterprise_actor = AuthenticatedActor(
        actor_id="actor-admin-demo",
        display_name="Admin Demo User",
        role="admin",  # type: ignore[arg-type]
        package_id="enterprise",
        clinic_id="clinic-demo-default",
    )

    # Burn 1.5M input — over clinician_pro (1M) but under enterprise (5M).
    _seed_audit_burn(
        db_session,
        clinic_id="clinic-demo-default",
        tokens_in=1_500_000,
        tokens_out=0,
        cost_pence=0,
    )

    # clinician_pro actor: blocked.
    clinician = AuthenticatedActor(
        actor_id="actor-clinician-demo",
        display_name="Verified Clinician Demo",
        role="clinician",  # type: ignore[arg-type]
        package_id="clinician_pro",
        clinic_id="clinic-demo-default",
    )
    blocked = agent_runner.run_agent(
        AGENT_REGISTRY["clinic.reception"],
        message="hi",
        actor=clinician,
        db=db_session,
    )
    assert blocked["error"] == "budget_exceeded"

    # enterprise actor: passes through and the LLM stub fires.
    ok = agent_runner.run_agent(
        AGENT_REGISTRY["clinic.reception"],
        message="hi",
        actor=enterprise_actor,
        db=db_session,
    )
    assert "error" not in ok
    # exactly one LLM call (the enterprise one).
    assert len(llm_calls) == 1


# ---------------------------------------------------------------------------
# Unknown package falls back to free tier (most-restrictive)
# ---------------------------------------------------------------------------


def test_unknown_package_falls_back_to_free_tier(
    db_session,
    llm_calls: list[dict],
) -> None:
    weird = AuthenticatedActor(
        actor_id="actor-clinician-demo",
        display_name="Demo Clinician",
        role="clinician",  # type: ignore[arg-type]
        package_id="some_unknown_pkg_id",
        clinic_id="clinic-demo-default",
    )
    # Burn just over the free cap (50_000 tokens_in) but well under
    # clinician_pro's 1M cap. The pre-check must still trip.
    _seed_audit_burn(
        db_session,
        clinic_id="clinic-demo-default",
        tokens_in=50_001,
        tokens_out=0,
        cost_pence=0,
    )
    result = agent_runner.run_agent(
        AGENT_REGISTRY["clinic.reception"],
        message="hi",
        actor=weird,
        db=db_session,
    )
    assert result["error"] == "budget_exceeded"
    # Resolved to the free row, not the unknown one.
    assert result["budget"]["package_id"] == "free"
    assert llm_calls == []


# ---------------------------------------------------------------------------
# When no PackageTokenBudget row exists at all the gate is permissive
# ---------------------------------------------------------------------------


def test_no_budget_rows_means_no_gate(
    db_session,
    clinician_actor: AuthenticatedActor,
    llm_calls: list[dict],
) -> None:
    """If the operator wipes all budget rows, the runner stays permissive
    rather than blocking every clinic. Spec: ``return None`` from the
    pre-check."""
    db_session.query(PackageTokenBudget).delete()
    db_session.commit()

    _seed_audit_burn(
        db_session,
        clinic_id="clinic-demo-default",
        tokens_in=10_000_000,
        tokens_out=0,
        cost_pence=0,
    )
    result = agent_runner.run_agent(
        AGENT_REGISTRY["clinic.reception"],
        message="hi",
        actor=clinician_actor,
        db=db_session,
    )
    assert "error" not in result
    assert len(llm_calls) == 1


# ---------------------------------------------------------------------------
# Phase 8 — provider-vs-estimate metering source
# ---------------------------------------------------------------------------


def test_runner_uses_real_provider_usage_when_available(
    db_session,
    clinician_actor: AuthenticatedActor,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """When ``_llm_chat_with_usage`` reports real numbers the audit row
    persists those numbers verbatim — no char/4 fudge."""

    def _stub_with_usage(**kwargs):
        return (
            "real-provider reply",
            {
                "input_tokens": 123,
                "output_tokens": 45,
                "model": "z-ai/glm-4.5-air:free",
                "provider": "openrouter",
            },
        )

    monkeypatch.setattr(
        "app.services.chat_service._llm_chat_with_usage", _stub_with_usage
    )

    result = agent_runner.run_agent(
        AGENT_REGISTRY["clinic.reception"],
        message="A long-ish message that would otherwise produce an estimate.",
        actor=clinician_actor,
        db=db_session,
    )
    assert result["reply"] == "real-provider reply"

    row = (
        db_session.query(AgentRunAudit)
        .order_by(AgentRunAudit.created_at.desc())
        .first()
    )
    assert row is not None
    # Provider-reported tokens land on the audit row exactly, not as an
    # estimate based on character count.
    assert row.tokens_in_used == 123
    assert row.tokens_out_used == 45
    # cost = 123 * 0.001 + 45 * 0.003 = 0.123 + 0.135 = 0.258 → int(0.258) = 0
    assert row.cost_pence == 0


def test_runner_falls_back_to_char4_estimate_when_no_usage(
    db_session,
    clinician_actor: AuthenticatedActor,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """When the upstream returns no usage block the runner falls back to
    char/4. Audit token columns must match that fallback exactly."""
    reply_text = "This is the assistant's reply about a treatment course."

    def _stub_no_usage(**kwargs):
        return reply_text, None

    monkeypatch.setattr(
        "app.services.chat_service._llm_chat_with_usage", _stub_no_usage
    )

    user_msg = "Tell me about the patient's last session please."
    result = agent_runner.run_agent(
        AGENT_REGISTRY["clinic.reception"],
        message=user_msg,
        actor=clinician_actor,
        db=db_session,
    )
    assert result["reply"] == reply_text

    row = (
        db_session.query(AgentRunAudit)
        .order_by(AgentRunAudit.created_at.desc())
        .first()
    )
    assert row is not None
    # tokens_out should be exactly len(reply)//4 per the runner's fallback.
    expected_out = max(1, len(reply_text) // 4)
    assert row.tokens_out_used == expected_out
    # tokens_in is the rendered prompt char count // 4 — non-zero, and
    # bigger than what a single user_msg//4 would give (system prompt is
    # included in the prompt char count).
    assert row.tokens_in_used > 0
    assert row.tokens_in_used >= max(1, len(user_msg) // 4)


def test_runner_emits_metered_source_log_line(
    db_session,
    clinician_actor: AuthenticatedActor,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """The Phase-8 ``agent_run_metered`` log line fires on every successful
    run, carrying ``source=provider`` when real numbers were captured and
    ``source=estimated`` otherwise."""
    import logging as _logging

    # --- provider-reported usage path -----------------------------------
    def _stub_with_usage(**kwargs):
        return ("ok", {
            "input_tokens": 7,
            "output_tokens": 9,
            "model": "z-ai/glm-4.5-air:free",
            "provider": "openrouter",
        })

    monkeypatch.setattr(
        "app.services.chat_service._llm_chat_with_usage", _stub_with_usage
    )
    caplog.clear()
    with caplog.at_level(_logging.INFO, logger="app.services.agents.runner"):
        agent_runner.run_agent(
            AGENT_REGISTRY["clinic.reception"],
            message="hi",
            actor=clinician_actor,
            db=db_session,
        )
    metered_records = [
        r for r in caplog.records if r.message == "agent_run_metered"
    ]
    assert metered_records, "agent_run_metered log line did not fire"
    assert getattr(metered_records[-1], "source", None) == "provider"
    assert getattr(metered_records[-1], "tokens_in", None) == 7
    assert getattr(metered_records[-1], "tokens_out", None) == 9

    # --- estimated fallback path ----------------------------------------
    def _stub_no_usage(**kwargs):
        return ("estimated reply text", None)

    monkeypatch.setattr(
        "app.services.chat_service._llm_chat_with_usage", _stub_no_usage
    )
    caplog.clear()
    with caplog.at_level(_logging.INFO, logger="app.services.agents.runner"):
        agent_runner.run_agent(
            AGENT_REGISTRY["clinic.reception"],
            message="hi again",
            actor=clinician_actor,
            db=db_session,
        )
    metered_records = [
        r for r in caplog.records if r.message == "agent_run_metered"
    ]
    assert metered_records, "agent_run_metered log line did not fire (fallback)"
    assert getattr(metered_records[-1], "source", None) == "estimated"
