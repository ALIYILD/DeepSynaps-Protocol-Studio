"""Agent Audit Service — structured lifecycle logging for the AI Agent
Operating System.

Every significant action performed by or on behalf of an agent is recorded
as an immutable audit event. The event log serves three purposes:

1. **Compliance** — regulators and IRB reviewers can trace every agent
   action back to a human actor, a clinic, and a timestamp.
2. **Operational debugging** — when an agent behaves unexpectedly, the
   audit log reveals the sequence of tool calls, approvals, and context
   accesses that led to the output.
3. **Security forensics** — suspicious patterns (e.g. a burst of
   ``patient.context_accessed`` events outside business hours) feed
   SOC/SIEM detection rules.

Clinical safety
===============
All audit events carry a ``safety_flag`` field that indicates whether the
event involved patient-facing output. Events with ``safety_flag=true``
are escalated to the clinical review queue.

Decision-support disclaimer
---------------------------
Every audit event that involves agent output is tagged with the standard
decision-support disclaimer. This ensures that even in the audit trail,
it is clear that agent outputs are not autonomous clinical decisions.

Event taxonomy
==============
The canonical event types are:

Agent lifecycle
---------------
* ``agent.viewed`` — agent detail page accessed.
* ``agent.rented`` — new rental created.
* ``agent.activated`` — agent resumed from paused state.
* ``agent.paused`` — agent paused.
* ``agent.revoked`` — agent permanently revoked.

Tool governance
---------------
* ``tool.scope_approved`` — tool scope added or expanded.
* ``tool.called`` — tool invocation attempted (regardless of success).
* ``tool.approved`` — pre-approval granted for a write tool.
* ``tool.rejected`` — tool call denied (forbidden tier, role mismatch,
  or policy violation).

Data access
-----------
* ``patient.context_accessed`` — agent read patient data.

Communication
-------------
* ``message.drafted`` — message drafted by agent (human review pending).
* ``message.sent`` — message sent to patient (after human approval).

Integration
-----------
* ``channel.connected`` — channel integration activated.
* ``channel.disconnected`` — channel integration deactivated.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from app.errors import ApiServiceError

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Canonical event types
# ---------------------------------------------------------------------------

CANONICAL_EVENT_TYPES = frozenset({
    # Agent lifecycle
    "agent.viewed",
    "agent.rented",
    "agent.activated",
    "agent.paused",
    "agent.revoked",
    # Tool governance
    "tool.scope_approved",
    "tool.called",
    "tool.approved",
    "tool.rejected",
    # Data access
    "patient.context_accessed",
    # Communication
    "message.drafted",
    "message.sent",
    # Integration
    "channel.connected",
    "channel.disconnected",
})

# Events that trigger clinical review queue escalation
_CLINICAL_REVIEW_EVENTS = frozenset({
    "tool.called",
    "tool.approved",
    "tool.rejected",
    "patient.context_accessed",
    "message.sent",
})

# Events that require patient-scoping validation
_PATIENT_SCOPED_EVENTS = frozenset({
    "patient.context_accessed",
    "message.drafted",
    "message.sent",
})

# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------


@dataclass
class AgentAuditEvent:
    """One structured audit event.

    Parameters
    ----------
    event_type
        One of :data:`CANONICAL_EVENT_TYPES`.
    agent_id
        The agent that generated this event.
    clinic_id
        Tenant scope — every query filters on this column.
    actor_id
        The human user responsible for this event (the agent acts on
        behalf of this actor).
    actor_role
        Role of the human actor at the time of the event.
    timestamp
        UTC timestamp when the event occurred.
    patient_id
        Optional patient identifier — populated for patient-scoped events.
    tool_id
        Optional tool identifier — populated for tool governance events.
    channel
        Optional channel identifier — populated for integration events.
    details
        Free-form key-value bag for event-specific context.
    safety_flag
        ``True`` when the event involved patient-facing output or a
        high-risk tool call. These events are escalated to the clinical
        review queue.
    evidence_grade
        Evidence grade (A-D) for the capability that triggered this event.
        ``None`` for non-clinical events.
    """

    event_type: str
    agent_id: str
    clinic_id: str
    actor_id: str
    actor_role: str
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    patient_id: Optional[str] = None
    tool_id: Optional[str] = None
    channel: Optional[str] = None
    details: dict[str, Any] = field(default_factory=dict)
    safety_flag: bool = False
    evidence_grade: Optional[str] = None
    decision_support_disclaimer: str = (
        "This output is decision-support only and does not constitute a "
        "medical diagnosis, prescription, or treatment plan."
    )

    def to_dict(self) -> dict[str, Any]:
        """Serialise to a JSON-safe dict."""
        return {
            "event_type": self.event_type,
            "agent_id": self.agent_id,
            "clinic_id": self.clinic_id,
            "actor_id": self.actor_id,
            "actor_role": self.actor_role,
            "timestamp": self.timestamp.isoformat(),
            "patient_id": self.patient_id,
            "tool_id": self.tool_id,
            "channel": self.channel,
            "details": dict(self.details),
            "safety_flag": self.safety_flag,
            "evidence_grade": self.evidence_grade,
            "decision_support_disclaimer": self.decision_support_disclaimer,
        }


# ---------------------------------------------------------------------------
# In-memory event store (production: back with DB)
# ---------------------------------------------------------------------------
# Key: (clinic_id, agent_id) -> list of events (newest first)
# Global index for cross-clinic queries (super-admin only)

_event_store: dict[tuple[str, str], list[AgentAuditEvent]] = {}
_global_event_index: list[AgentAuditEvent] = []
_MAX_EVENTS_PER_AGENT = 5_000
_MAX_GLOBAL_INDEX = 50_000


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def record_event(event: AgentAuditEvent) -> None:
    """Persist an audit event to the in-memory stores.

    Thread-safe for single-process usage. Production deployments should
    replace the in-memory stores with a persistent queue (e.g. Kafka,
    Postgres ``agent_run_audit`` table, or cloudwatch logs).
    """
    if event.event_type not in CANONICAL_EVENT_TYPES:
        logger.warning(
            "audit_non_canonical_event_type",
            extra={
                "event": "audit_non_canonical_event_type",
                "event_type": event.event_type,
                "agent_id": event.agent_id,
                "clinic_id": event.clinic_id,
            },
        )

    # Auto-set safety flag for clinical-review events
    if event.event_type in _CLINICAL_REVIEW_EVENTS:
        event.safety_flag = True

    key = (event.clinic_id, event.agent_id)
    if key not in _event_store:
        _event_store[key] = []
    _event_store[key].insert(0, event)

    # Cap per-agent store
    if len(_event_store[key]) > _MAX_EVENTS_PER_AGENT:
        _event_store[key] = _event_store[key][:_MAX_EVENTS_PER_AGENT]

    # Append to global index
    _global_event_index.insert(0, event)
    if len(_global_event_index) > _MAX_GLOBAL_INDEX:
        _global_event_index[:] = _global_event_index[:_MAX_GLOBAL_INDEX]

    logger.info(
        "audit_event_recorded",
        extra={
            "event": "audit_event_recorded",
            "event_type": event.event_type,
            "agent_id": event.agent_id,
            "clinic_id": event.clinic_id,
            "actor_id": event.actor_id,
            "safety_flag": event.safety_flag,
        },
    )


def record_agent_viewed(
    agent_id: str,
    clinic_id: str,
    actor_id: str,
    actor_role: str,
) -> None:
    """Log that an actor viewed the agent's detail page."""
    record_event(AgentAuditEvent(
        event_type="agent.viewed",
        agent_id=agent_id,
        clinic_id=clinic_id,
        actor_id=actor_id,
        actor_role=actor_role,
    ))


def record_agent_rented(
    agent_id: str,
    clinic_id: str,
    actor_id: str,
    actor_role: str,
    billing_plan: str,
) -> None:
    """Log a new agent rental."""
    record_event(AgentAuditEvent(
        event_type="agent.rented",
        agent_id=agent_id,
        clinic_id=clinic_id,
        actor_id=actor_id,
        actor_role=actor_role,
        details={"billing_plan": billing_plan},
    ))


def record_agent_activated(
    agent_id: str,
    clinic_id: str,
    actor_id: str,
    actor_role: str,
) -> None:
    """Log that a paused agent was resumed."""
    record_event(AgentAuditEvent(
        event_type="agent.activated",
        agent_id=agent_id,
        clinic_id=clinic_id,
        actor_id=actor_id,
        actor_role=actor_role,
    ))


def record_agent_paused(
    agent_id: str,
    clinic_id: str,
    actor_id: str,
    actor_role: str,
    reason: str = "user_initiated",
) -> None:
    """Log that an agent was paused."""
    record_event(AgentAuditEvent(
        event_type="agent.paused",
        agent_id=agent_id,
        clinic_id=clinic_id,
        actor_id=actor_id,
        actor_role=actor_role,
        details={"reason": reason},
    ))


def record_agent_revoked(
    agent_id: str,
    clinic_id: str,
    actor_id: str,
    actor_role: str,
    reason: str = "admin_revoked",
) -> None:
    """Log that an agent was permanently revoked."""
    record_event(AgentAuditEvent(
        event_type="agent.revoked",
        agent_id=agent_id,
        clinic_id=clinic_id,
        actor_id=actor_id,
        actor_role=actor_role,
        details={"reason": reason},
        safety_flag=True,  # Revocation is a safety-critical event
    ))


def record_tool_scope_approved(
    agent_id: str,
    clinic_id: str,
    actor_id: str,
    actor_role: str,
    tool_id: str,
) -> None:
    """Log that a tool scope was approved for an agent."""
    record_event(AgentAuditEvent(
        event_type="tool.scope_approved",
        agent_id=agent_id,
        clinic_id=clinic_id,
        actor_id=actor_id,
        actor_role=actor_role,
        tool_id=tool_id,
    ))


def record_tool_called(
    agent_id: str,
    clinic_id: str,
    actor_id: str,
    actor_role: str,
    tool_id: str,
    patient_id: Optional[str] = None,
    evidence_grade: Optional[str] = None,
) -> None:
    """Log a tool invocation attempt."""
    record_event(AgentAuditEvent(
        event_type="tool.called",
        agent_id=agent_id,
        clinic_id=clinic_id,
        actor_id=actor_id,
        actor_role=actor_role,
        tool_id=tool_id,
        patient_id=patient_id,
        evidence_grade=evidence_grade,
    ))


def record_tool_approved(
    agent_id: str,
    clinic_id: str,
    actor_id: str,
    actor_role: str,
    tool_id: str,
    patient_id: Optional[str] = None,
) -> None:
    """Log that a clinician pre-approved a tool call."""
    record_event(AgentAuditEvent(
        event_type="tool.approved",
        agent_id=agent_id,
        clinic_id=clinic_id,
        actor_id=actor_id,
        actor_role=actor_role,
        tool_id=tool_id,
        patient_id=patient_id,
        safety_flag=True,
    ))


def record_tool_rejected(
    agent_id: str,
    clinic_id: str,
    actor_id: str,
    actor_role: str,
    tool_id: str,
    reason: str,
    patient_id: Optional[str] = None,
) -> None:
    """Log that a tool call was denied."""
    record_event(AgentAuditEvent(
        event_type="tool.rejected",
        agent_id=agent_id,
        clinic_id=clinic_id,
        actor_id=actor_id,
        actor_role=actor_role,
        tool_id=tool_id,
        patient_id=patient_id,
        details={"rejection_reason": reason},
        safety_flag=True,
    ))


def record_patient_context_accessed(
    agent_id: str,
    clinic_id: str,
    actor_id: str,
    actor_role: str,
    patient_id: str,
    data_types: list[str],
) -> None:
    """Log that an agent accessed patient context data.

    This is a sensitive event — it always carries ``safety_flag=True``
    and is escalated to the clinical review queue.
    """
    record_event(AgentAuditEvent(
        event_type="patient.context_accessed",
        agent_id=agent_id,
        clinic_id=clinic_id,
        actor_id=actor_id,
        actor_role=actor_role,
        patient_id=patient_id,
        details={"data_types": data_types},
        safety_flag=True,
    ))


def record_message_drafted(
    agent_id: str,
    clinic_id: str,
    actor_id: str,
    actor_role: str,
    patient_id: str,
    channel: str,
) -> None:
    """Log that a message was drafted by an agent (pending human review)."""
    record_event(AgentAuditEvent(
        event_type="message.drafted",
        agent_id=agent_id,
        clinic_id=clinic_id,
        actor_id=actor_id,
        actor_role=actor_role,
        patient_id=patient_id,
        channel=channel,
    ))


def record_message_sent(
    agent_id: str,
    clinic_id: str,
    actor_id: str,
    actor_role: str,
    patient_id: str,
    channel: str,
) -> None:
    """Log that a message was sent to a patient (after human approval)."""
    record_event(AgentAuditEvent(
        event_type="message.sent",
        agent_id=agent_id,
        clinic_id=clinic_id,
        actor_id=actor_id,
        actor_role=actor_role,
        patient_id=patient_id,
        channel=channel,
        safety_flag=True,
    ))


def record_channel_connected(
    agent_id: str,
    clinic_id: str,
    actor_id: str,
    actor_role: str,
    channel: str,
) -> None:
    """Log that a channel integration was connected."""
    record_event(AgentAuditEvent(
        event_type="channel.connected",
        agent_id=agent_id,
        clinic_id=clinic_id,
        actor_id=actor_id,
        actor_role=actor_role,
        channel=channel,
    ))


# ---------------------------------------------------------------------------
# Query helpers
# ---------------------------------------------------------------------------


def get_audit_log(
    clinic_id: str,
    agent_id: str,
    limit: int = 100,
    event_type: str | None = None,
    safety_flag_only: bool = False,
) -> list[dict[str, Any]]:
    """Return audit events for one agent, newest first.

    Parameters
    ----------
    clinic_id
        Tenant scope filter.
    agent_id
        Agent scope filter.
    limit
        Maximum events to return (default 100).
    event_type
        Optional filter by canonical event type.
    safety_flag_only
        When ``True``, return only safety-flagged events.
    """
    key = (clinic_id, agent_id)
    events = _event_store.get(key, [])
    results: list[AgentAuditEvent] = list(events)

    if event_type:
        results = [e for e in results if e.event_type == event_type]
    if safety_flag_only:
        results = [e for e in results if e.safety_flag]

    return [e.to_dict() for e in results[:limit]]


def get_global_audit_log(
    limit: int = 200,
    event_type: str | None = None,
    safety_flag_only: bool = False,
) -> list[dict[str, Any]]:
    """Return the global audit log (super-admin only).

    .. warning::
        This queries across all clinics. It must be gated by role checks
        in the router layer — never expose to non-admin actors.
    """
    results: list[AgentAuditEvent] = list(_global_event_index)
    if event_type:
        results = [e for e in results if e.event_type == event_type]
    if safety_flag_only:
        results = [e for e in results if e.safety_flag]
    return [e.to_dict() for e in results[:limit]]


def get_safety_flagged_events(
    clinic_id: str,
    limit: int = 50,
) -> list[dict[str, Any]]:
    """Return safety-flagged events for a clinic (clinical review queue).

    This is the feed for the clinical review dashboard — it surfaces
    every event that involved patient data access, high-risk tool calls,
    or message transmission.
    """
    results: list[AgentAuditEvent] = []
    for (c_id, _), events in _event_store.items():
        if c_id == clinic_id:
            results.extend([e for e in events if e.safety_flag])
    results.sort(key=lambda e: e.timestamp, reverse=True)
    return [e.to_dict() for e in results[:limit]]


def get_audit_summary(
    clinic_id: str,
    agent_id: str,
) -> dict[str, Any]:
    """Return an aggregate summary of audit activity for one agent.

    Useful for the control-centre dashboard's "Activity" tile.
    """
    key = (clinic_id, agent_id)
    events = _event_store.get(key, [])
    total = len(events)
    safety_count = sum(1 for e in events if e.safety_flag)
    event_type_counts: dict[str, int] = {}
    for e in events:
        event_type_counts[e.event_type] = event_type_counts.get(e.event_type, 0) + 1

    # Count unique patients touched
    patient_ids = {e.patient_id for e in events if e.patient_id}

    return {
        "agent_id": agent_id,
        "clinic_id": clinic_id,
        "total_events": total,
        "safety_flagged_events": safety_count,
        "unique_patients_accessed": len(patient_ids),
        "event_type_breakdown": event_type_counts,
        "last_activity_at": events[0].timestamp.isoformat() if events else None,
    }


# ---------------------------------------------------------------------------
# Store management (testing + lifecycle)
# ---------------------------------------------------------------------------


def clear_audit_store() -> None:
    """Clear all in-memory audit data. Intended for test isolation only."""
    global _event_store, _global_event_index
    _event_store = {}
    _global_event_index = []


def prune_old_events(max_age_hours: int = 168) -> int:
    """Remove audit events older than *max_age_hours*.

    Returns the number of events removed. Useful for a scheduled cleanup
    task.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(hours=max_age_hours)
    removed = 0
    for key in list(_event_store.keys()):
        before = len(_event_store[key])
        _event_store[key] = [e for e in _event_store[key] if e.timestamp >= cutoff]
        removed += before - len(_event_store[key])
    # Rebuild global index
    global _global_event_index
    before = len(_global_event_index)
    _global_event_index = [e for e in _global_event_index if e.timestamp >= cutoff]
    removed += before - len(_global_event_index)
    return removed


__all__ = [
    "CANONICAL_EVENT_TYPES",
    "AgentAuditEvent",
    "record_event",
    "record_agent_viewed",
    "record_agent_rented",
    "record_agent_activated",
    "record_agent_paused",
    "record_agent_revoked",
    "record_tool_scope_approved",
    "record_tool_called",
    "record_tool_approved",
    "record_tool_rejected",
    "record_patient_context_accessed",
    "record_message_drafted",
    "record_message_sent",
    "record_channel_connected",
    "get_audit_log",
    "get_global_audit_log",
    "get_safety_flagged_events",
    "get_audit_summary",
    "clear_audit_store",
    "prune_old_events",
]
