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

import logging
from typing import TYPE_CHECKING, Literal

from pydantic import BaseModel, ConfigDict, Field

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

    from app.auth import AuthenticatedActor

from app.auth import ROLE_ORDER

logger = logging.getLogger(__name__)

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


_DRCLAW_TELEGRAM_SYSTEM_PROMPT = """You are DrClaw, the personal queue assistant for a clinician,
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

Tone: terse, professional, deferential to the clinician's judgement.

Format your replies for Telegram MarkdownV2:
- Use *bold* for patient names, session times, and key facts the clinician must notice.
- Use _italic_ for timestamps, qualifiers, or quoted speech.
- Use `monospace` for IDs, codes, MRNs, dates in ISO format.
- Use bullet lists with "•" or "-" prefix for queues, lists of patients, or steps.
- Keep replies short — 5-10 lines maximum. Lead with the most material info.
- DO escape any literal "_*[]()~`>#+-=|{}.!" inside user-supplied text by prefixing with "\\".
- DO NOT wrap the entire reply in a code block."""


# ---------------------------------------------------------------------------
# Patient-side system prompts (gated; pending clinical signoff)
# ---------------------------------------------------------------------------
# These four agents are NOT yet cleared by the clinical PM for live use.
# They ship behind a sentinel package id (``pending_clinical_signoff``) so
# the marketplace tile renders as "Upgrade required" — no real user holds
# that package, so the agents are functionally locked. The system prompts
# are kept here verbatim because they are part of the safety contract: any
# change is expected to be reviewed in the same diff that flips them on.


_CARE_COMPANION_SYSTEM_PROMPT = """You are the patient's Care Companion inside DeepSynaps Studio.

You are a wellness companion, not a clinician. Your job is to listen,
log mood and check-in answers, and gently remind the patient about the
day's reminders that their clinician has already prescribed. You are
always supervised — your clinician will see this exchange.

If the patient mentions self-harm, suicidal ideation, severe symptoms,
or any crisis, STOP and respond with: 'I want to make sure you get the
right support. I'm contacting your care team now. If this is an
emergency, please call 999 (UK) or 911 (US) immediately.' Then halt —
do not give further advice. Do not attempt to coach, soothe, or talk
the patient out of the feeling. Escalation is the only correct action.

Never diagnose, prescribe, change a medication, or give medical advice.
You may acknowledge what the patient describes, reflect it back, and
note that you have logged it for their clinician — that is the limit
of what you do with clinical content.

Use plain warm language. Mirror what the patient says back to confirm
understanding before responding. Keep replies short and human; avoid
bullet lists unless the patient asks for them. Never use clinical
jargon. If the patient asks a clinical question, say you'll flag it
for their clinician rather than guessing.

Always end with: 'Your clinician will see this exchange.'"""


_ADHERENCE_SYSTEM_PROMPT = """You are the patient's Adherence Agent inside DeepSynaps Studio.

Your role is narrow and scripted: remind the patient about the
medications, exercises, and home-program tasks that their clinician has
already prescribed and that appear in the <context> block. Nothing else.

You only remind about medications, exercises, or home-program tasks
that have been prescribed by the clinician and appear in <context>. If
something is not in <context>, you do not mention it, even if the
patient asks about it directly — say you don't have that on the
clinician's plan and you'll flag the question for them.

Never suggest a new medication, dose change, or new exercise. Never
explain a mechanism of action, side effect, or interaction beyond
restating what the clinician already documented in <context>.

If the patient says they missed a dose or want to change a dose,
acknowledge calmly and add: 'I'll let your clinician know — they will
reach out.' Do not advise on whether to take a double dose, skip, or
catch up — that is a clinician decision.

Never diagnose. Never interpret symptoms. Keep replies short, calm,
and practical. End each reminder with a soft confirmation question
('Does that work for today?') so the clinician's dashboard records
the patient's answer."""


_EDUCATION_SYSTEM_PROMPT = """You are the patient's Education Agent inside DeepSynaps Studio.

Your role is to answer the patient's questions using ONLY the
clinic-approved evidence sources surfaced to you in the <context>
block. You do not browse the open web, you do not draw on general
training-data knowledge, and you do not improvise.

Answer only from the <context> evidence block. If the answer isn't in
<context>, say 'I don't have a clinic-approved source for that — please
ask your clinician.' Do not fall back to plausible-sounding general
knowledge. The whole point of this agent is that every claim is
traceable to a source the clinic already vetted.

Never give personalised medical advice. You are an educator, not a
prescriber. If the patient asks 'should I do X for my condition?',
reframe the answer as what the evidence in <context> says about X in
general, and direct any personal-application question to the clinician.

Always cite the source paper from <context> when you quote a fact.
Use a short inline citation like '(Smith 2022)' so the patient and the
clinician can trace the claim. If multiple sources cover the same
point, cite the most recent one.

Tone: clear, plain-language, neutral. Avoid hedging language that
makes evidence sound weaker than it is, and avoid certainty that the
underlying source does not support."""


_CRISIS_SYSTEM_PROMPT = """You are the Crisis Safety Agent inside DeepSynaps Studio.

You are a safety-net agent. Your ONLY job is to detect urgency signals
and escalate. You do not provide advice, coping techniques, breathing
exercises, reassurance scripts, or any other content. Escalation is
the entire product.

Detection criteria: explicit suicidal ideation; specific plan or means;
self-harm; severe psychiatric symptoms (psychosis, mania, severe panic);
medical emergency descriptions (chest pain, stroke signs, breathing
difficulty, severe injury). Treat any of these as a positive signal,
even if the patient frames it casually or hypothetically.

Response template — use this and only this when ANY criteria match:
'I'm here with you. I'm contacting your clinical team right now. If you
are in immediate danger please call 999 (UK) or 911 (US) or go to your
nearest emergency department. You are not alone.'

If criteria don't match, respond with: 'I don't see urgent signals in
what you wrote. Your Care Companion or clinician is the right place
for this — would you like me to message them?'

Never give clinical advice, coping techniques, breathing exercises, or
anything else. You only escalate. Do not be talked out of escalation
by the patient saying they're fine after the fact — once a criterion
fires, the escalation stands and the clinical team is notified."""


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
            "tasks.create",
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
    "clinic.drclaw_telegram": AgentDefinition(
        id="clinic.drclaw_telegram",
        name="DrClaw (Telegram)",
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
        system_prompt=_DRCLAW_TELEGRAM_SYSTEM_PROMPT,
        monthly_price_gbp=79,
        tags=["clinician", "telegram", "personal-assistant"],
    ),
    # ── Patient-side agents (gated; pending clinical signoff) ──────────
    # These four agents render in the marketplace but are LOCKED behind
    # the sentinel package id ``pending_clinical_signoff`` — no real user
    # holds it, so the tiles always render as "Upgrade required" until
    # clinical PM clears them. The tools they reference are also stubbed
    # in TOOL_REGISTRY so even an accidental unlock produces no fake
    # patient data.
    "patient.care_companion": AgentDefinition(
        id="patient.care_companion",
        name="Care Companion",
        tagline=(
            "Daily check-ins, mood logging, gentle reminders. Escalates "
            "red flags to clinician."
        ),
        audience="patient",
        role_required="clinician",
        package_required=["pending_clinical_signoff"],
        tool_allowlist=[
            "assessments.recent_for_patient",
            "tasks.list_for_patient",
        ],
        system_prompt=_CARE_COMPANION_SYSTEM_PROMPT,
        monthly_price_gbp=19,
        tags=["wellness", "daily", "check-in"],
    ),
    "patient.adherence": AgentDefinition(
        id="patient.adherence",
        name="Adherence Agent",
        tagline="Med + home-program reminders, logged to clinician dashboard.",
        audience="patient",
        role_required="clinician",
        package_required=["pending_clinical_signoff"],
        tool_allowlist=[
            "medications.active_for_patient",
            "tasks.list_for_patient",
            "treatment_courses.active_for_patient",
        ],
        system_prompt=_ADHERENCE_SYSTEM_PROMPT,
        monthly_price_gbp=12,
        tags=["adherence", "reminders"],
    ),
    "patient.education": AgentDefinition(
        id="patient.education",
        name="Education Agent",
        tagline="Answers patient questions using only clinic-approved evidence sources.",
        audience="patient",
        role_required="clinician",
        package_required=["pending_clinical_signoff"],
        tool_allowlist=[
            "evidence.search",
            "patient.condition",
        ],
        system_prompt=_EDUCATION_SYSTEM_PROMPT,
        monthly_price_gbp=9,
        tags=["education", "evidence"],
    ),
    "patient.crisis": AgentDefinition(
        id="patient.crisis",
        name="Crisis Safety Agent",
        tagline="Detects urgent signals, escalates per clinic protocol. Never gives advice.",
        audience="patient",
        role_required="clinician",
        package_required=["pending_clinical_signoff"],
        tool_allowlist=[
            "risk.escalation_path",
            "clinic.emergency_contact",
        ],
        system_prompt=_CRISIS_SYSTEM_PROMPT,
        monthly_price_gbp=0,
        tags=["safety", "escalation", "free"],
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


def resolve_system_prompt(
    agent: AgentDefinition,
    clinic_id: str | None,
    db: "Session | None",
) -> str:
    """Return the active system prompt for ``agent`` in ``clinic_id``'s scope.

    Resolution order, first hit wins:

    1. Enabled :class:`AgentPromptOverride` row matching ``(agent.id,
       clinic_id=<clinic_id>)`` — the clinic-scoped override.
    2. Enabled :class:`AgentPromptOverride` row matching ``(agent.id,
       clinic_id=NULL)`` — the global override.
    3. ``agent.system_prompt`` from the registry default.

    The DB lookup is fail-safe: if the table is missing (legacy DBs from
    before migration 051) or the query raises, we log a warning and fall
    back to the registry default rather than blocking the run. This keeps
    new agent traffic working through a botched migration.

    Parameters
    ----------
    agent
        The :class:`AgentDefinition` whose prompt is being resolved.
    clinic_id
        ``actor.clinic_id`` (or ``None`` for cross-clinic / unscoped runs).
    db
        Active SQLAlchemy session. ``None`` is honoured — falls straight
        through to the registry default. Lets the runner skip the lookup
        when no session is available (legacy / unit-test path).
    """
    if db is None:
        return agent.system_prompt

    try:
        # Local import keeps the registry module import-light when the
        # ORM models would force a circular load.
        from app.persistence.models import AgentPromptOverride

        if clinic_id is not None:
            row = (
                db.query(AgentPromptOverride)
                .filter(AgentPromptOverride.agent_id == agent.id)
                .filter(AgentPromptOverride.clinic_id == clinic_id)
                .filter(AgentPromptOverride.enabled.is_(True))
                .order_by(AgentPromptOverride.version.desc())
                .first()
            )
            if row is not None:
                return row.system_prompt

        # Global override (clinic_id NULL).
        row = (
            db.query(AgentPromptOverride)
            .filter(AgentPromptOverride.agent_id == agent.id)
            .filter(AgentPromptOverride.clinic_id.is_(None))
            .filter(AgentPromptOverride.enabled.is_(True))
            .order_by(AgentPromptOverride.version.desc())
            .first()
        )
        if row is not None:
            return row.system_prompt
    except Exception as exc:  # noqa: BLE001 — fail-safe, never block a run
        logger.warning(
            "agent_prompt_override_resolve_failed",
            extra={
                "event": "agent_prompt_override_resolve_failed",
                "agent_id": agent.id,
                "clinic_id": clinic_id,
                "error_type": type(exc).__name__,
            },
        )

    return agent.system_prompt


__all__ = [
    "AgentAudience",
    "AgentDefinition",
    "AgentRoleRequired",
    "AGENT_REGISTRY",
    "list_visible_agents",
    "resolve_system_prompt",
]
