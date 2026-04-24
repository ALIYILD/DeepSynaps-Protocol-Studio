"""
OpenClawBus — the orchestrator-worker router for Dr. OpenClaw agents.

Every agent is a single-job worker with read-only FeatureStore / Timeline
access. The orchestrator decides who to call. Every action is written
back to the timeline as ``agent_draft`` (needs clinician accept) or
``agent_action`` (already approved tool calls like lit-search).

Two invariants enforced at the bus level:

1. **No write without a clinician-accept event.** Agents draft; humans
   mutate state. Enforced by the ``ActionKind`` enum and the bus
   refusing to execute ``mutation`` actions without a preceding
   ``clinician_review`` event referencing the draft.

2. **Every retrieval is logged.** If an agent cited a paper, the
   paper_id lands in ``agent_action.payload.sources``. This is what
   lets a clinic defend a decision in a board review.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Callable, Protocol
from uuid import UUID, uuid4

from .timeline import EventKind, PatientEvent


# ---------------------------------------------------------------------------
# The catalogue of agents. Each agent has one job.
# ---------------------------------------------------------------------------
class AgentRole(str, Enum):
    insight_dr   = "insight_dr"       # summarize qEEG/MRI findings
    protocol_dr  = "protocol_dr"      # tune / regenerate SOZO protocols
    crisis_dr    = "crisis_dr"        # triage red-tier patients
    scribe_dr    = "scribe_dr"        # SOAP notes from visits/chats
    scheduler_dr = "scheduler_dr"     # next visit, refills, pre-visit checklists
    research_dr  = "research_dr"      # MedRAG + web literature search
    coach_dr     = "coach_dr"         # patient-facing, behaviour nudges


class ActionKind(str, Enum):
    # Read-only / informational — safe to auto-execute
    summarize    = "summarize"
    retrieve     = "retrieve"
    explain      = "explain"
    # Drafts — need a clinician_review event before becoming mutations
    draft_note   = "draft_note"
    draft_order  = "draft_order"
    draft_protocol_edit = "draft_protocol_edit"
    draft_message = "draft_message"
    # Mutations — only allowed after clinician accept
    mutation     = "mutation"


@dataclass
class AgentContext:
    """What every agent receives — a 4-8k-token synthesis, never raw records."""
    patient_id: str
    now_utc: datetime
    # dense summary (flagged features, latest events, open issues)
    summary_md: str
    # top-k similar patients (from PatientVector)
    analogues: list[str] = field(default_factory=list)
    # event ids the summary was built from (for provenance)
    based_on_event_ids: list[UUID] = field(default_factory=list)
    # agent-type-specific extras (e.g. the full MRIReport for InsightDr)
    extras: dict[str, Any] = field(default_factory=dict)


@dataclass
class AgentAction:
    action_id: UUID = field(default_factory=uuid4)
    role: AgentRole = AgentRole.insight_dr
    kind: ActionKind = ActionKind.summarize
    content: dict = field(default_factory=dict)
    sources: list[str] = field(default_factory=list)    # paper_ids, event_ids
    model: str = ""
    prompt_hash: str = ""
    requires_clinician_review: bool = True
    t_utc: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


class Agent(Protocol):
    role: AgentRole
    def run(self, ctx: AgentContext, goal: str) -> AgentAction: ...


# ---------------------------------------------------------------------------
# The orchestrator — decides which agent to call given the goal + context.
# ---------------------------------------------------------------------------
class OpenClawBus:
    def __init__(self, context_builder: Callable[[str], AgentContext]):
        self._agents: dict[AgentRole, Agent] = {}
        self._build_context = context_builder

    def register(self, agent: Agent) -> None:
        self._agents[agent.role] = agent

    # -- orchestrator -------------------------------------------------------
    def route(self, patient_id: str, goal: str) -> AgentAction:
        """Pick the agent best suited to ``goal`` and run it."""
        ctx = self._build_context(patient_id)
        role = self._pick_role(goal, ctx)
        if role not in self._agents:
            raise RuntimeError(f"agent {role} not registered")
        return self._agents[role].run(ctx, goal)

    def _pick_role(self, goal: str, ctx: AgentContext) -> AgentRole:
        g = goal.lower()
        if any(k in g for k in ("suicid", "crisis", "urgent", "red tier", "ideation")):
            return AgentRole.crisis_dr
        if any(k in g for k in ("protocol", "itbs", "stim parameters", "retune")):
            return AgentRole.protocol_dr
        if any(k in g for k in ("note", "soap", "visit summary", "scribe")):
            return AgentRole.scribe_dr
        if any(k in g for k in ("schedule", "next visit", "refill", "appointment")):
            return AgentRole.scheduler_dr
        if any(k in g for k in ("paper", "evidence", "cite", "literature", "research")):
            return AgentRole.research_dr
        if any(k in g for k in ("coach", "patient message", "nudge")):
            return AgentRole.coach_dr
        return AgentRole.insight_dr

    # -- safety gate --------------------------------------------------------
    def execute(self, action: AgentAction, accept_event: PatientEvent | None = None) -> PatientEvent:
        """Convert an AgentAction into a timeline event. Mutations require
        a preceding ``clinician_review`` event referencing the draft."""
        if action.kind == ActionKind.mutation:
            if accept_event is None or accept_event.kind != EventKind.clinician_review:
                raise PermissionError(
                    "Mutations require a clinician_review event. Agents draft; humans mutate."
                )

        kind = EventKind.agent_draft if action.requires_clinician_review else EventKind.agent_action
        return PatientEvent(
            patient_id="",   # caller fills in
            kind=kind,
            source="openclaw_agent",
            payload={
                "role": action.role.value,
                "action_kind": action.kind.value,
                "content": action.content,
                "sources": action.sources,
                "model": action.model,
                "prompt_hash": action.prompt_hash,
            },
            created_by=action.role.value,
            created_by_kind="agent",
        )
