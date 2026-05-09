"""Tests for deepsynaps_core.agent_bus.

Pin two safety invariants:
  1. No write without a clinician-accept event (mutations require a
     preceding clinician_review event).
  2. Every retrieval is logged in payload.sources for board-defensible
     audit trails.

Plus the goal-routing heuristic for picking the right Dr. agent.
"""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

from deepsynaps_core.agent_bus import (
    ActionKind,
    AgentAction,
    AgentContext,
    AgentRole,
    OpenClawBus,
)
from deepsynaps_core.timeline import EventKind, PatientEvent


def _ctx(patient_id: str = "p-1") -> AgentContext:
    return AgentContext(
        patient_id=patient_id,
        now_utc=datetime.now(timezone.utc),
        summary_md="A summary.",
    )


class _StubAgent:
    """Lightweight Agent for routing tests — returns a fixed action."""

    def __init__(self, role: AgentRole) -> None:
        self.role = role

    def run(self, ctx: AgentContext, goal: str) -> AgentAction:
        return AgentAction(role=self.role, kind=ActionKind.summarize, content={"goal": goal})


# ───────────────────────────── enum surface ────────────────────────────────


class TestEnumSurface:
    def test_agent_roles(self) -> None:
        assert AgentRole.insight_dr.value == "insight_dr"
        assert AgentRole.crisis_dr.value == "crisis_dr"
        assert AgentRole.protocol_dr.value == "protocol_dr"

    def test_action_kinds(self) -> None:
        assert ActionKind.summarize.value == "summarize"
        assert ActionKind.draft_note.value == "draft_note"
        assert ActionKind.mutation.value == "mutation"


# ───────────────────────────── _pick_role heuristic ────────────────────────


@pytest.mark.parametrize(
    "goal,expected_role",
    [
        ("Patient has suicidal ideation, please assess.", AgentRole.crisis_dr),
        ("Crisis triage red tier", AgentRole.crisis_dr),
        ("Retune iTBS protocol parameters", AgentRole.protocol_dr),
        ("Generate SOAP note from visit", AgentRole.scribe_dr),
        ("Schedule next visit", AgentRole.scheduler_dr),
        ("Refill medication for patient", AgentRole.scheduler_dr),
        ("Cite recent literature on rTMS in MDD", AgentRole.research_dr),
        ("Find a paper on theta burst stimulation", AgentRole.research_dr),
        ("Send a coaching nudge to the patient", AgentRole.coach_dr),
        ("Patient message about adherence", AgentRole.coach_dr),
        ("Summarize qEEG findings", AgentRole.insight_dr),  # default
        ("Random unrelated goal", AgentRole.insight_dr),    # default fallback
    ],
)
def test_pick_role(goal: str, expected_role: AgentRole) -> None:
    bus = OpenClawBus(context_builder=lambda pid: _ctx(pid))
    assert bus._pick_role(goal, _ctx()) is expected_role


# ───────────────────────────── route + register ────────────────────────────


class TestRoute:
    def test_route_calls_picked_agent(self) -> None:
        bus = OpenClawBus(context_builder=lambda pid: _ctx(pid))
        bus.register(_StubAgent(AgentRole.insight_dr))
        action = bus.route("p-1", "summarize qEEG findings")
        assert action.role is AgentRole.insight_dr

    def test_route_raises_when_agent_not_registered(self) -> None:
        bus = OpenClawBus(context_builder=lambda pid: _ctx(pid))
        # No agents registered → routing to insight_dr (the default) fails.
        with pytest.raises(RuntimeError, match="not registered"):
            bus.route("p-1", "summarize")

    def test_register_idempotent_per_role(self) -> None:
        bus = OpenClawBus(context_builder=lambda pid: _ctx(pid))
        bus.register(_StubAgent(AgentRole.insight_dr))
        bus.register(_StubAgent(AgentRole.insight_dr))  # second register replaces
        action = bus.route("p-1", "summarize")
        assert action.role is AgentRole.insight_dr


# ───────────────────────────── execute (safety gate) ───────────────────────


class TestExecuteSafetyGate:
    def test_summarize_emits_agent_draft_when_review_required(self) -> None:
        bus = OpenClawBus(context_builder=lambda pid: _ctx(pid))
        action = AgentAction(
            role=AgentRole.insight_dr,
            kind=ActionKind.summarize,
            content={"summary": "x"},
            requires_clinician_review=True,
        )
        ev = bus.execute(action)
        assert isinstance(ev, PatientEvent)
        assert ev.kind is EventKind.agent_draft
        assert ev.payload["role"] == "insight_dr"

    def test_summarize_emits_agent_action_when_review_not_required(self) -> None:
        bus = OpenClawBus(context_builder=lambda pid: _ctx(pid))
        action = AgentAction(
            role=AgentRole.research_dr,
            kind=ActionKind.retrieve,
            content={"hits": []},
            requires_clinician_review=False,
            sources=["pmid:1"],
        )
        ev = bus.execute(action)
        assert ev.kind is EventKind.agent_action
        assert ev.payload["sources"] == ["pmid:1"]

    def test_mutation_without_clinician_review_rejected(self) -> None:
        bus = OpenClawBus(context_builder=lambda pid: _ctx(pid))
        action = AgentAction(
            role=AgentRole.protocol_dr,
            kind=ActionKind.mutation,
            content={"new_freq": "10Hz"},
        )
        with pytest.raises(PermissionError, match="Mutations require a clinician_review event"):
            bus.execute(action)

    def test_mutation_with_wrong_event_kind_rejected(self) -> None:
        bus = OpenClawBus(context_builder=lambda pid: _ctx(pid))
        action = AgentAction(
            role=AgentRole.protocol_dr,
            kind=ActionKind.mutation,
            content={},
        )
        wrong_event = PatientEvent(
            patient_id="p-1",
            kind=EventKind.agent_draft,  # NOT clinician_review
            source="other",
        )
        with pytest.raises(PermissionError):
            bus.execute(action, accept_event=wrong_event)

    def test_mutation_with_clinician_review_accepted(self) -> None:
        bus = OpenClawBus(context_builder=lambda pid: _ctx(pid))
        action = AgentAction(
            role=AgentRole.protocol_dr,
            kind=ActionKind.mutation,
            content={"new_freq": "10Hz"},
            requires_clinician_review=False,
        )
        accept = PatientEvent(
            patient_id="p-1",
            kind=EventKind.clinician_review,
            source="clinician",
        )
        ev = bus.execute(action, accept_event=accept)
        assert ev.kind is EventKind.agent_action

    def test_execute_records_action_kind_in_payload(self) -> None:
        bus = OpenClawBus(context_builder=lambda pid: _ctx(pid))
        action = AgentAction(
            role=AgentRole.insight_dr,
            kind=ActionKind.summarize,
            content={"a": 1},
        )
        ev = bus.execute(action)
        assert ev.payload["action_kind"] == "summarize"
        assert ev.payload["content"] == {"a": 1}


# ───────────────────────────── AgentAction model ───────────────────────────


class TestAgentAction:
    def test_minimal_construction_defaults(self) -> None:
        action = AgentAction()
        assert action.role is AgentRole.insight_dr
        assert action.kind is ActionKind.summarize
        assert action.requires_clinician_review is True
        assert action.t_utc.tzinfo is timezone.utc
        assert action.action_id is not None
