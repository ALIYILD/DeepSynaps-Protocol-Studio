"""Canonical Agent Contract — the single source of truth for agent identity,
permissions, billing, and lifecycle within the DeepSynaps AI Agent Operating
System.

Every deployed agent (whether clinic-facing, patient-facing, or internal)
must have a valid :class:`AgentContract`. The contract is the authorisation
boundary: no contract == no execution context. This ensures that every agent
action is traceable to a clinic, an owner, and a billing plan.

Design principles
=================
* **Immutable audit trail** — every lifecycle transition appends to
  ``audit_events`` rather than mutating in place.
* **Clinic-scoped** — every query is filtered by ``clinic_id`` to prevent
  cross-tenant leakage.
* **Decision-support only** — the contract carries a ``safety_disclaimer``
  that is surfaced on every agent response. Autonomous diagnosis,
  prescription, or emergency triage are forbidden tiers.
* **Evidence-graded** — tool permissions are classified by evidence grade
  (A-D) so clinicians can see at a glance which agent capabilities are
  backed by strong evidence vs. experimental.

Clinical safety
===============
The ``tool_approval_policy`` field enforces the human-in-the-loop gate:
* ``auto`` — read-only tools execute without approval (schedule queries,
  FAQ lookups).
* ``pre_approve`` — medium/high-risk writes require explicit clinician
  confirmation before execution (appointment booking, report drafting,
  patient messaging).
* ``post_review`` — actions execute but are flagged for review within 24h.
* Autonomous diagnosis, prescription, emergency triage, and treatment
  changes are **never** permitted regardless of policy.
"""
from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Literal, Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

AGENT_TYPES = Literal[
    "receptionist",
    "doctor",
    "patient",
    "research",
    "report",
    "evidence",
    "scheduling",
    "billing",
    "custom",
]

BILLING_STATUSES = Literal[
    "trial",
    "active",
    "paused",
    "cancelled",
    "expired",
]

BILLING_PLANS = Literal[
    "basic",
    "pro",
    "enterprise",
]

TOOL_APPROVAL_POLICIES = Literal[
    "auto",
    "pre_approve",
    "post_review",
]

RUN_STATUSES = Literal[
    "idle",
    "running",
    "paused",
    "error",
    "revoked",
]

# Clinical safety disclaimer — appended to every agent response.
_DECISION_SUPPORT_DISCLAIMER = (
    "This output is decision-support only and does not constitute a "
    "medical diagnosis, prescription, or treatment plan. A qualified "
    "clinician must review all recommendations before clinical action."
)

# Forbidden autonomous actions — these are blocked at the tool-permission
# layer regardless of role or approval policy.
_FORBIDDEN_TOOLS: frozenset[str] = frozenset({
    "diagnose",
    "prescribe",
    "triage_emergency",
    "change_treatment",
})


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------


@dataclass
class AgentContract:
    """Canonical contract governing one agent deployment.

    Parameters
    ----------
    agent_id
        Stable canonical identifier, e.g. ``"clinic.reception"``.
    agent_type
        Functional category — determines which tool-scopes and data-scopes
        are available by default.
    clinic_id
        Tenant boundary — every query filters on this column.
    owner_user_id
        The user who created / is responsible for this agent deployment.
    patient_scope
        When set, the agent is restricted to a single patient's data.
        ``None`` means clinic-wide access (subject to role_scope).
    role_scope
        List of role strings that may invoke this agent. The standard
        :func:`app.auth.require_minimum_role` ladder applies.
    data_scopes
        Dotted data identifiers the agent may read (e.g.
        ``"patient.summary"``, ``"schedule"``).
    tool_scopes
        Canonical tool identifiers the agent may call. Each tool is
        classified by :mod:`app.services.agent_tool_permission` into a
        risk tier that determines approval behaviour.
    tool_approval_policy
        How write-tool calls are gated: ``auto`` | ``pre_approve`` |
        ``post_review``.
    billing_status
        Current billing state: ``trial`` | ``active`` | ``paused`` |
        ``cancelled`` | ``expired``.
    billing_plan
        Pricing tier: ``basic`` | ``pro`` | ``enterprise``.
    monthly_price_gbp
        Display price in whole GBP (not pence). No Stripe wiring in v1.
    channel_connections
        Active channel integrations: ``{"telegram": bool, "email": bool,
        "sms": bool, "phone": bool}``.
    run_status
        Runtime state: ``idle`` | ``running`` | ``paused`` | ``error`` |
        ``revoked``.
    audit_events
        Append-only log of lifecycle transitions. Each event is a dict
        with ``event_type``, ``timestamp``, ``actor_id``, and ``details``.
    created_at
        UTC timestamp when the contract was first created.
    activated_at
        UTC timestamp when the contract transitioned from ``trial`` to
        ``active`` (or when explicitly activated). ``None`` until first
        activation.
    expires_at
        UTC timestamp when the trial or subscription expires. ``None``
        for perpetual (enterprise) contracts.
    """

    agent_id: str
    agent_type: str  # receptionist | doctor | patient | research | report | evidence | scheduling | billing | custom
    clinic_id: str
    owner_user_id: str
    patient_scope: Optional[str] = None
    role_scope: list[str] = field(default_factory=lambda: ["clinician", "admin"])
    data_scopes: list[str] = field(default_factory=list)
    tool_scopes: list[str] = field(default_factory=list)
    tool_approval_policy: str = "pre_approve"  # auto | pre_approve | post_review
    billing_status: str = "trial"  # trial | active | paused | cancelled | expired
    billing_plan: str = "basic"  # basic | pro | enterprise
    monthly_price_gbp: int = 0
    channel_connections: dict[str, bool] = field(default_factory=lambda: {
        "telegram": False,
        "email": False,
        "sms": False,
        "phone": False,
    })
    run_status: str = "idle"  # idle | running | paused | error | revoked
    audit_events: list[dict[str, Any]] = field(default_factory=list)
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    activated_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None

    # ------------------------------------------------------------------
    # Safety
    # ------------------------------------------------------------------

    @property
    def safety_disclaimer(self) -> str:
        """The decision-support disclaimer appended to every response."""
        return _DECISION_SUPPORT_DISCLAIMER

    @property
    def is_autonomous_forbidden(self) -> bool:
        """Always ``True`` — autonomous clinical action is never permitted."""
        return True

    # ------------------------------------------------------------------
    # Lifecycle helpers
    # ------------------------------------------------------------------

    def transition(self, new_status: str, actor_id: str, details: dict[str, Any] | None = None) -> None:
        """Append a lifecycle transition event and update ``run_status``.

        Validates that the transition is legal. Raises :class:`ValueError`
        on illegal transitions.
        """
        legal = _LEGAL_TRANSITIONS.get(self.run_status, set())
        if new_status not in legal:
            raise ValueError(
                f"Illegal transition: {self.run_status} -> {new_status}. "
                f"Legal targets: {legal}"
            )
        old_status = self.run_status
        self.run_status = new_status
        self.audit_events.append({
            "event_type": "agent.status_changed",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "actor_id": actor_id,
            "old_status": old_status,
            "new_status": new_status,
            "details": details or {},
        })
        logger.info(
            "agent_contract_transition",
            extra={
                "event": "agent_contract_transition",
                "agent_id": self.agent_id,
                "clinic_id": self.clinic_id,
                "old_status": old_status,
                "new_status": new_status,
                "actor_id": actor_id,
            },
        )

    def add_audit_event(
        self,
        event_type: str,
        actor_id: str,
        details: dict[str, Any] | None = None,
    ) -> None:
        """Append an arbitrary audit event to the contract's event log."""
        self.audit_events.append({
            "event_type": event_type,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "actor_id": actor_id,
            "details": details or {},
        })

    def to_dict(self) -> dict[str, Any]:
        """Serialise the contract to a JSON-safe dict."""
        return {
            "agent_id": self.agent_id,
            "agent_type": self.agent_type,
            "clinic_id": self.clinic_id,
            "owner_user_id": self.owner_user_id,
            "patient_scope": self.patient_scope,
            "role_scope": list(self.role_scope),
            "data_scopes": list(self.data_scopes),
            "tool_scopes": list(self.tool_scopes),
            "tool_approval_policy": self.tool_approval_policy,
            "billing_status": self.billing_status,
            "billing_plan": self.billing_plan,
            "monthly_price_gbp": self.monthly_price_gbp,
            "channel_connections": dict(self.channel_connections),
            "run_status": self.run_status,
            "audit_events": list(self.audit_events),
            "created_at": self.created_at.isoformat(),
            "activated_at": self.activated_at.isoformat() if self.activated_at else None,
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
            "safety_disclaimer": self.safety_disclaimer,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "AgentContract":
        """Rehydrate a contract from a dict (e.g. DB JSON column)."""
        return cls(
            agent_id=data["agent_id"],
            agent_type=data["agent_type"],
            clinic_id=data["clinic_id"],
            owner_user_id=data["owner_user_id"],
            patient_scope=data.get("patient_scope"),
            role_scope=list(data.get("role_scope", ["clinician", "admin"])),
            data_scopes=list(data.get("data_scopes", [])),
            tool_scopes=list(data.get("tool_scopes", [])),
            tool_approval_policy=data.get("tool_approval_policy", "pre_approve"),
            billing_status=data.get("billing_status", "trial"),
            billing_plan=data.get("billing_plan", "basic"),
            monthly_price_gbp=int(data.get("monthly_price_gbp", 0)),
            channel_connections=dict(
                data.get("channel_connections", {
                    "telegram": False,
                    "email": False,
                    "sms": False,
                    "phone": False,
                })
            ),
            run_status=data.get("run_status", "idle"),
            audit_events=list(data.get("audit_events", [])),
            created_at=datetime.fromisoformat(data["created_at"]) if "created_at" in data else datetime.now(timezone.utc),
            activated_at=datetime.fromisoformat(data["activated_at"]) if data.get("activated_at") else None,
            expires_at=datetime.fromisoformat(data["expires_at"]) if data.get("expires_at") else None,
        )


# ---------------------------------------------------------------------------
# Legal state-machine transitions
# ---------------------------------------------------------------------------

_LEGAL_TRANSITIONS: dict[str, set[str]] = {
    "idle": {"running", "paused", "error", "revoked"},
    "running": {"idle", "paused", "error", "revoked"},
    "paused": {"idle", "running", "error", "revoked"},
    "error": {"idle", "paused", "revoked"},
    "revoked": set(),  # Terminal — must create a new contract.
}


# ---------------------------------------------------------------------------
# In-memory contract store (clinic-scoped)
# ---------------------------------------------------------------------------
# Production deployments should back this with a proper DB table.
# The dict key is ``(clinic_id, agent_id)`` to prevent cross-clinic
# collision.

_contract_store: dict[tuple[str, str], AgentContract] = {}


def get_contract(clinic_id: str, agent_id: str) -> AgentContract | None:
    """Look up a contract by its composite key. Returns ``None`` on miss."""
    return _contract_store.get((clinic_id, agent_id))


def save_contract(contract: AgentContract) -> None:
    """Persist (create or update) a contract in the store."""
    _contract_store[(contract.clinic_id, contract.agent_id)] = contract


def list_contracts_for_clinic(clinic_id: str) -> list[AgentContract]:
    """Return all contracts scoped to *clinic_id*, ordered by ``created_at`` DESC."""
    results = [
        c for (c_clinic_id, _), c in _contract_store.items()
        if c_clinic_id == clinic_id
    ]
    results.sort(key=lambda c: c.created_at, reverse=True)
    return results


def delete_contract(clinic_id: str, agent_id: str) -> bool:
    """Remove a contract from the store. Returns ``True`` if a row was removed."""
    key = (clinic_id, agent_id)
    if key in _contract_store:
        del _contract_store[key]
        return True
    return False


# ---------------------------------------------------------------------------
# Default scope templates by agent type
# ---------------------------------------------------------------------------

DEFAULT_DATA_SCOPES: dict[str, list[str]] = {
    "receptionist": ["schedule", "clinic_faq", "patient.check_in"],
    "doctor": ["patient.summary", "evidence", "schedule", "clinical_report"],
    "patient": ["patient.own_record", "schedule.own_appointments", "wellness"],
    "research": ["evidence", "clinical_trial", "literature", "anonymized_cohort"],
    "report": ["patient.summary", "clinical_report", "evidence", "schedule"],
    "evidence": ["evidence", "literature", "clinical_trial"],
    "scheduling": ["schedule", "patient.summary", "clinic_faq"],
    "billing": ["invoice", "payment", "patient.summary"],
    "custom": [],
}

DEFAULT_TOOL_SCOPES: dict[str, list[str]] = {
    "receptionist": [
        "read.schedule",
        "read.clinic_faq",
        "read.patient_summary",
        "draft.message",
        "write.appointment",
        "write.reminder",
    ],
    "doctor": [
        "read.patient_summary",
        "read.evidence",
        "read.schedule",
        "read.full_chart",
        "draft.report_section",
        "draft.message",
        "write.clinical_report",
        "trigger.ai_analysis",
    ],
    "patient": [
        "read.clinic_faq",
        "read.schedule",
        "draft.message",
        "write.form_status",
    ],
    "research": [
        "read.evidence",
        "draft.task",
        "export.patient_data",
    ],
    "report": [
        "read.patient_summary",
        "read.evidence",
        "draft.report_section",
        "write.clinical_report",
    ],
    "evidence": [
        "read.evidence",
        "read.full_chart",
        "trigger.ai_analysis",
    ],
    "scheduling": [
        "read.schedule",
        "read.patient_summary",
        "write.appointment",
        "write.reminder",
    ],
    "billing": [
        "read.schedule",
        "read.patient_summary",
        "draft.message",
    ],
    "custom": [],
}

DEFAULT_ROLE_SCOPES: dict[str, list[str]] = {
    "receptionist": ["clinician", "admin", "technician"],
    "doctor": ["clinician", "admin"],
    "patient": ["patient", "clinician", "admin"],
    "research": ["clinician", "admin"],
    "report": ["clinician", "admin"],
    "evidence": ["clinician", "admin"],
    "scheduling": ["clinician", "admin", "technician"],
    "billing": ["admin"],
    "custom": ["clinician", "admin"],
}


def create_default_contract(
    agent_id: str,
    agent_type: str,
    clinic_id: str,
    owner_user_id: str,
    patient_scope: Optional[str] = None,
) -> AgentContract:
    """Factory: create a contract with type-appropriate defaults.

    Uses :data:`DEFAULT_DATA_SCOPES`, :data:`DEFAULT_TOOL_SCOPES`, and
    :data:`DEFAULT_ROLE_SCOPES` to pre-populate the contract. The caller
    can mutate the returned contract before calling :func:`save_contract`.
    """
    contract = AgentContract(
        agent_id=agent_id,
        agent_type=agent_type,
        clinic_id=clinic_id,
        owner_user_id=owner_user_id,
        patient_scope=patient_scope,
        role_scope=list(DEFAULT_ROLE_SCOPES.get(agent_type, ["clinician", "admin"])),
        data_scopes=list(DEFAULT_DATA_SCOPES.get(agent_type, [])),
        tool_scopes=list(DEFAULT_TOOL_SCOPES.get(agent_type, [])),
    )
    return contract


__all__ = [
    "AgentContract",
    "AGENT_TYPES",
    "BILLING_STATUSES",
    "BILLING_PLANS",
    "TOOL_APPROVAL_POLICIES",
    "RUN_STATUSES",
    "DEFAULT_DATA_SCOPES",
    "DEFAULT_TOOL_SCOPES",
    "DEFAULT_ROLE_SCOPES",
    "create_default_contract",
    "get_contract",
    "save_contract",
    "list_contracts_for_clinic",
    "delete_contract",
]
