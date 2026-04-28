"""Agent Marketplace registry — declarative catalogue of installable AI agents.

Each :class:`AgentDefinition` is a frozen, immutable record describing one
purchasable agent that a clinic can run inside DeepSynaps Studio. The
registry is intentionally module-level (not DB-backed) for v1 — agents are
treated as code, like feature flags, and ship with the platform release.

Visibility rules
================
* ``role_required`` — the minimum :class:`UserRole` allowed to invoke the
  agent. The standard :func:`app.auth.require_minimum_role` ladder applies
  (admin >= clinician >= reviewer >= technician >= patient >= guest).
* ``package_required`` — list of package ids that unlock the agent. An
  empty list means "available to all packages". A non-empty list means the
  actor's ``package_id`` must appear in the list.
* ``tool_allowlist`` — canonical dotted strings (e.g. ``"sessions.list"``)
  representing the tools the agent is permitted to call once tool-calling
  is wired up in a follow-up iteration. Documented here so the runner /
  tool-dispatcher layer stays in lock-step with what the marketplace
  advertises.

Decision-support framing
========================
Every system prompt in this module is written in cautious, decision-support
language: agents summarise, draft, and queue — they never autonomously
diagnose or prescribe. The safety footer attached by the runner reinforces
this contract on every response.
"""
from __future__ import annotations

from typing import TYPE_CHECKING, Literal

from pydantic import BaseModel, ConfigDict, Field

if TYPE_CHECKING:
    from app.auth import AuthenticatedActor

from app.auth import ROLE_ORDER

AgentAudience = Literal["clinic", "patient"]
AgentRoleRequired = Literal["clinician", "admin"]


class AgentDefinition(BaseModel):
    """Immutable description of one marketplace agent."""

    model_config = ConfigDict(frozen=True)

    id: str = Field(..., description="Stable canonical id, e.g. 'clinic.reception'.")
    name: str = Field(..., description="Display name shown on the marketplace tile.")
    tagline: str = Field(
        ..., description="One-sentence pitch shown on the marketplace tile."
    )
    audience: AgentAudience = Field(
        ..., description="Who the agent is intended for (clinic staff vs patients)."
    )
    role_required: AgentRoleRequired = Field(
        ..., description="Minimum role allowed to run this agent."
    )
    package_required: list[str] = Field(
        default_factory=list,
        description=(
            "Package ids that unlock the agent. Empty list = available to all "
            "packages. Non-empty = actor.package_id must appear in the list."
        ),
    )
    tool_allowlist: list[str] = Field(
        default_factory=list,
        description=(
            "Canonical dotted tool strings the agent may call (e.g. "
            "'sessions.list'). Enforced by the tool dispatcher layer."
        ),
    )
    system_prompt: str = Field(
        ..., description="LLM system prompt — cautious decision-support framing."
    )
    monthly_price_gbp: int = Field(
        ..., ge=0, description="Display-only price in GBP. No Stripe wiring in v1."
    )
    tags: list[str] = Field(
        default_factory=list, description="Free-form tags for filtering / grouping."
    )


# ---------------------------------------------------------------------------
# System prompts
# ---------------------------------------------------------------------------
# Kept as module-level constants so they're easy to diff on review and so a
# follow-up evals harness can reach them by name without parsing the
# registry dict.

_RECEPTION_SYSTEM_PROMPT = """You are the Clinic Reception Agent for DeepSynaps Studio.

Your role is to act as a polite, efficient front-desk assistant for a
neuromodulation clinic. You help reception staff and clinicians with
operational tasks: looking up patients, drafting session bookings,
checking consent status, listing intake forms, and cancelling or
rescheduling sessions on request.

Hard constraints:
- You NEVER make clinical decisions. If asked anything clinical (dosing,
  protocol selection, contraindications, treatment recommendations,
  safety judgements), respond that this is outside your remit and refer
  the user to a clinician or to the protocol generator.
- You NEVER give medical advice. You schedule, look up, and draft — you
  do not interpret symptoms or diagnose.
- You ONLY operate over data the calling user is already authorised to
  see; you do not request or display data outside the clinic scope.
- If a request is ambiguous, ask one short clarifying question rather
  than guessing.

Tone: warm, concise, professional. Confirm actions before describing
them as done. Surface uncertainty plainly when present."""


_REPORTING_SYSTEM_PROMPT = """You are the Clinic Reporting Agent for DeepSynaps Studio.

Your role is to draft weekly digests and operational summaries for a
neuromodulation clinic's admin team. You aggregate already-collected
clinic data — outcomes, treatment courses, adverse events, finance — into
short, scannable narratives.

Hard constraints:
- Your output is ALWAYS a SUMMARY of clinic data, never medical advice.
  You do not recommend treatments, diagnose, or judge clinical decisions.
- You report what happened during the period in question; you do not
  predict patient outcomes or speculate about causation beyond what is
  supported by the underlying data.
- When a metric is missing, ambiguous, or based on small sample sizes,
  say so explicitly. Do not invent numbers.
- Adverse-event sections must be reported factually and without softening
  language; they are the most important part of any report.
- All summaries must be reviewable by a human admin before distribution.

Format: short, structured Markdown sections with clear headers. Lead
with the most material findings. Keep clinical interpretation strictly
neutral."""


_ALICLAW_DOCTOR_TELEGRAM_SYSTEM_PROMPT = """You are AliClaw Doctor, the personal queue assistant for a clinician,
delivered over Telegram.

Your role is to help the clinician triage and progress their daily
workload: reviewing the day's session list, looking up patients,
surfacing pending notes, and presenting drafted notes for approval.

Hard constraints:
- You NEVER dispense clinical advice without explicit clinician approval.
  You may surface options, summaries, and prior decisions; the clinician
  is always the decision-maker.
- You NEVER auto-approve drafted notes. When a draft is ready you present
  it and wait for the clinician to explicitly approve, edit, or reject.
- You operate ONLY on data the clinician is already authorised to see.
- Telegram replies must be short, scannable, and structured. Use brief
  bullet lists rather than paragraphs. Always show the patient identifier
  in a way that does not leak more PHI than the clinician asked for.
- If the clinician asks for something outside your tool allowlist, say so
  plainly and suggest the right place in the Studio UI.

Tone: terse, professional, deferential to the clinician's judgement."""


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------

AGENT_REGISTRY: dict[str, AgentDefinition] = {
    "clinic.reception": AgentDefinition(
        id="clinic.reception",
        name="Clinic Reception",
        tagline="Front-desk assistant that handles bookings, lookups, and consent checks.",
        audience="clinic",
        role_required="clinician",
        package_required=["clinician_pro", "enterprise"],
        tool_allowlist=[
            "sessions.list",
            "sessions.create",
            "sessions.cancel",
            "patients.search",
            "forms.list",
            "consent.status",
        ],
        system_prompt=_RECEPTION_SYSTEM_PROMPT,
        monthly_price_gbp=99,
        tags=["operations", "front-desk", "scheduling"],
    ),
    "clinic.reporting": AgentDefinition(
        id="clinic.reporting",
        name="Clinic Reporting",
        tagline="Weekly digest writer that summarises outcomes, AEs, and finance.",
        audience="clinic",
        role_required="admin",
        package_required=["clinician_pro", "enterprise"],
        tool_allowlist=[
            "outcomes.summary",
            "treatment_courses.list",
            "adverse_events.list",
            "finance.summary",
        ],
        system_prompt=_REPORTING_SYSTEM_PROMPT,
        monthly_price_gbp=49,
        tags=["operations", "reporting", "admin"],
    ),
    "clinic.aliclaw_doctor_telegram": AgentDefinition(
        id="clinic.aliclaw_doctor_telegram",
        name="AliClaw Doctor (Telegram)",
        tagline="Your personal queue agent over Telegram — triage, lookups, draft approvals.",
        audience="clinic",
        role_required="clinician",
        package_required=["clinician_pro", "enterprise"],
        tool_allowlist=[
            "sessions.list",
            "patients.search",
            "notes.list",
            "notes.approve_draft",
            "tasks.list",
        ],
        system_prompt=_ALICLAW_DOCTOR_TELEGRAM_SYSTEM_PROMPT,
        monthly_price_gbp=79,
        tags=["clinician", "telegram", "personal-assistant"],
    ),
}


def list_visible_agents(actor: "AuthenticatedActor") -> list[AgentDefinition]:
    """Return the subset of :data:`AGENT_REGISTRY` that ``actor`` is allowed to see.

    An agent is visible when:
    * the actor's role is ``>=`` the agent's :attr:`role_required`, AND
    * the agent's :attr:`package_required` is empty OR the actor's
      ``package_id`` is in that list.

    Order is stable — registry insertion order is preserved.
    """
    actor_role_rank = ROLE_ORDER.get(actor.role, -1)
    actor_package = actor.package_id or ""

    visible: list[AgentDefinition] = []
    for agent in AGENT_REGISTRY.values():
        required_rank = ROLE_ORDER.get(agent.role_required, 999)
        if actor_role_rank < required_rank:
            continue
        if agent.package_required and actor_package not in agent.package_required:
            continue
        visible.append(agent)
    return visible


__all__ = [
    "AgentAudience",
    "AgentDefinition",
    "AgentRoleRequired",
    "AGENT_REGISTRY",
    "list_visible_agents",
]
