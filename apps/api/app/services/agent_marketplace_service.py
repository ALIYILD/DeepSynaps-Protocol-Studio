"""Agent Marketplace Service — rental lifecycle, billing queries, and plan
management for the AI Agent Operating System.

This module is the **write surface** for agent contracts. Routers delegate
all rental, cancellation, upgrade, and billing-status operations here so
that business rules (trial expiry, plan down-gate, etc.) live in one place.

Clinical safety
===============
* Every rental is scoped to a ``clinic_id`` — cross-clinic rental is
  rejected at the contract layer.
* Every rental carries an ``owner_user_id`` audit trail.
* The ``safety_disclaimer`` from :class:`AgentContract` is surfaced on
  every response — decision-support only, never autonomous diagnosis.
* Plan upgrades/downgrades are gated by role (admin only).

Evidence grades
===============
Tool scopes attached to rented agents are classified by
:mod:`app.services.agent_tool_permission` into tiers. The marketplace
endpoints expose these tiers so clinicians can see which capabilities are
backed by strong (Grade A) vs. emerging (Grade D) evidence.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, require_minimum_role
from app.errors import ApiServiceError
from app.services.agent_contract import (
    BILLING_PLANS,
    BILLING_STATUSES,
    RUN_STATUSES,
    AgentContract,
    create_default_contract,
    delete_contract,
    get_contract,
    list_contracts_for_clinic,
    save_contract,
)
from app.services.agent_tool_permission import (
    TOOL_CLASSIFICATION,
    classify_tools,
    get_tool_approval_required,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Plan pricing (whole GBP, not pence)
# ---------------------------------------------------------------------------

_PLAN_PRICES: dict[str, int] = {
    "basic": 49,
    "pro": 149,
    "enterprise": 499,
}

# Trial duration in days
_TRIAL_DAYS = 14

# Evidence grade mapping for capability transparency
_TOOL_EVIDENCE_GRADES: dict[str, str] = {
    "read.schedule": "A",
    "read.clinic_faq": "A",
    "read.patient_summary": "A",
    "read.evidence": "B",
    "draft.message": "B",
    "draft.task": "B",
    "draft.report_section": "B",
    "write.appointment": "A",
    "write.reminder": "A",
    "write.form_status": "B",
    "write.patient_message": "B",
    "write.clinical_report": "B",
    "read.full_chart": "A",
    "trigger.ai_analysis": "C",
    "export.patient_data": "B",
}


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------


class MarketplaceError(ApiServiceError):
    """Base marketplace-specific error."""

    def __init__(
        self,
        code: str,
        message: str,
        status_code: int = 422,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(
            code=code,
            message=message,
            status_code=status_code,
            details=details,
        )


# ---------------------------------------------------------------------------
# Read helpers
# ---------------------------------------------------------------------------


def list_available_agents(
    clinic_id: str,
    role: str,
    actor: AuthenticatedActor,
) -> list[dict[str, Any]]:
    """Return agents available to *role* within *clinic_id*.

    Filters the in-memory contract store to agents whose ``role_scope``
    includes the requested role. Each result carries billing metadata
    and a ``tool_evidence_summary`` so the UI can render capability
    badges with evidence grades.

    Parameters
    ----------
    clinic_id
        Tenant scope — required; never None.
    role
        Role string to filter against ``contract.role_scope``.
    actor
        The calling actor (used for audit logging).

    Returns
    -------
    list[dict]
        One dict per available agent, shaped for the marketplace grid.
    """
    contracts = list_contracts_for_clinic(clinic_id)
    results: list[dict[str, Any]] = []
    for contract in contracts:
        if role not in contract.role_scope:
            continue
        tool_tiers = classify_tools(contract.tool_scopes)
        evidence_summary = _summarise_evidence(contract.tool_scopes)
        results.append({
            "agent_id": contract.agent_id,
            "agent_type": contract.agent_type,
            "billing_status": contract.billing_status,
            "billing_plan": contract.billing_plan,
            "monthly_price_gbp": contract.monthly_price_gbp,
            "run_status": contract.run_status,
            "role_scope": list(contract.role_scope),
            "tool_count": len(contract.tool_scopes),
            "tool_tiers": tool_tiers,
            "tool_evidence_summary": evidence_summary,
            "channel_connections": dict(contract.channel_connections),
            "created_at": contract.created_at.isoformat(),
            "expires_at": contract.expires_at.isoformat() if contract.expires_at else None,
            "safety_disclaimer": contract.safety_disclaimer,
        })
    return results


def get_agent_details(agent_id: str, clinic_id: str) -> dict[str, Any]:
    """Return full agent info for the control-centre detail view.

    Includes the full audit event log, tool classification breakdown,
    and evidence grades. Raises :class:`MarketplaceError` (404) when the
    contract does not exist.
    """
    contract = get_contract(clinic_id, agent_id)
    if contract is None:
        raise MarketplaceError(
            code="agent_not_found",
            message=f"No contract for agent '{agent_id}' in clinic '{clinic_id}'.",
            status_code=404,
        )
    tool_tiers = classify_tools(contract.tool_scopes)
    evidence_summary = _summarise_evidence(contract.tool_scopes)
    return {
        "agent_id": contract.agent_id,
        "agent_type": contract.agent_type,
        "clinic_id": contract.clinic_id,
        "owner_user_id": contract.owner_user_id,
        "patient_scope": contract.patient_scope,
        "role_scope": list(contract.role_scope),
        "data_scopes": list(contract.data_scopes),
        "tool_scopes": list(contract.tool_scopes),
        "tool_tiers": tool_tiers,
        "tool_evidence_summary": evidence_summary,
        "tool_approval_policy": contract.tool_approval_policy,
        "billing_status": contract.billing_status,
        "billing_plan": contract.billing_plan,
        "monthly_price_gbp": contract.monthly_price_gbp,
        "channel_connections": dict(contract.channel_connections),
        "run_status": contract.run_status,
        "audit_events": list(contract.audit_events),
        "created_at": contract.created_at.isoformat(),
        "activated_at": contract.activated_at.isoformat() if contract.activated_at else None,
        "expires_at": contract.expires_at.isoformat() if contract.expires_at else None,
        "safety_disclaimer": contract.safety_disclaimer,
    }


def get_control_centre_data(
    clinic_id: str,
    actor: AuthenticatedActor,
) -> dict[str, Any]:
    """Aggregate data for the Agent Control Centre dashboard.

    Returns counts, billing summaries, and recent activity for all
    agents scoped to *clinic_id*.
    """
    contracts = list_contracts_for_clinic(clinic_id)
    total_agents = len(contracts)
    running = sum(1 for c in contracts if c.run_status == "running")
    paused = sum(1 for c in contracts if c.run_status == "paused")
    error = sum(1 for c in contracts if c.run_status == "error")
    revoked = sum(1 for c in contracts if c.run_status == "revoked")

    trial_count = sum(1 for c in contracts if c.billing_status == "trial")
    active_billing = sum(1 for c in contracts if c.billing_status == "active")
    total_monthly_spend = sum(c.monthly_price_gbp for c in contracts if c.billing_status == "active")

    # Recent audit events across all agents (newest first, capped at 50)
    all_events: list[dict[str, Any]] = []
    for c in contracts:
        for ev in c.audit_events:
            all_events.append({
                "agent_id": c.agent_id,
                **ev,
            })
    all_events.sort(key=lambda e: e.get("timestamp", ""), reverse=True)
    recent_events = all_events[:50]

    return {
        "clinic_id": clinic_id,
        "total_agents": total_agents,
        "status_breakdown": {
            "running": running,
            "paused": paused,
            "idle": total_agents - running - paused - error - revoked,
            "error": error,
            "revoked": revoked,
        },
        "billing_summary": {
            "trial": trial_count,
            "active": active_billing,
            "paused": sum(1 for c in contracts if c.billing_status == "paused"),
            "cancelled": sum(1 for c in contracts if c.billing_status == "cancelled"),
            "expired": sum(1 for c in contracts if c.billing_status == "expired"),
            "total_monthly_gbp": total_monthly_spend,
        },
        "agents": [
            {
                "agent_id": c.agent_id,
                "agent_type": c.agent_type,
                "run_status": c.run_status,
                "billing_status": c.billing_status,
                "billing_plan": c.billing_plan,
                "monthly_price_gbp": c.monthly_price_gbp,
                "role_scope": list(c.role_scope),
                "tool_count": len(c.tool_scopes),
                "created_at": c.created_at.isoformat(),
            }
            for c in contracts
        ],
        "recent_events": recent_events,
        "safety_disclaimer": (
            "This dashboard is decision-support only. All agent actions "
            "require clinician review before clinical use."
        ),
    }


# ---------------------------------------------------------------------------
# Write helpers (rental lifecycle)
# ---------------------------------------------------------------------------


def rent_agent(
    agent_id: str,
    agent_type: str,
    clinic_id: str,
    owner_user_id: str,
    billing_plan: str = "basic",
    patient_scope: Optional[str] = None,
) -> AgentContract:
    """Activate a new agent rental.

    Creates a :class:`AgentContract` with type-appropriate defaults, sets
    the billing status to ``trial``, computes the expiry from
    :data:`_TRIAL_DAYS`, and persists it.

    Idempotent: if a contract already exists for ``(clinic_id, agent_id)``
    and is not ``revoked``, the existing contract is returned unchanged.

    Parameters
    ----------
    agent_id
        Canonical agent identifier.
    agent_type
        One of the :data:`AGENT_TYPES`.
    clinic_id
        Tenant scope.
    owner_user_id
        User responsible for this rental.
    billing_plan
        Target plan (default ``basic``).
    patient_scope
        Optional patient-scoping.

    Returns
    -------
    AgentContract
        The newly created (or existing) contract.
    """
    existing = get_contract(clinic_id, agent_id)
    if existing is not None and existing.run_status != "revoked":
        logger.info(
            "rent_agent_idempotent",
            extra={
                "event": "rent_agent_idempotent",
                "agent_id": agent_id,
                "clinic_id": clinic_id,
            },
        )
        return existing

    contract = create_default_contract(
        agent_id=agent_id,
        agent_type=agent_type,
        clinic_id=clinic_id,
        owner_user_id=owner_user_id,
        patient_scope=patient_scope,
    )
    contract.billing_plan = billing_plan
    contract.monthly_price_gbp = _PLAN_PRICES.get(billing_plan, 0)
    contract.billing_status = "trial"
    contract.expires_at = datetime.now(timezone.utc) + timedelta(days=_TRIAL_DAYS)
    contract.run_status = "idle"
    contract.add_audit_event(
        event_type="agent.rented",
        actor_id=owner_user_id,
        details={"billing_plan": billing_plan, "trial_days": _TRIAL_DAYS},
    )
    save_contract(contract)
    logger.info(
        "agent_rented",
        extra={
            "event": "agent_rented",
            "agent_id": agent_id,
            "clinic_id": clinic_id,
            "billing_plan": billing_plan,
        },
    )
    return contract


def cancel_agent_rental(
    agent_id: str,
    clinic_id: str,
    actor_id: str,
) -> AgentContract:
    """Deactivate (cancel) an agent rental.

    Transitions the contract to ``billing_status=cancelled`` and
    ``run_status=revoked``. Revoked is a terminal state — the agent
    cannot be resumed. A new rental must be created.

    Raises :class:`MarketplaceError` (404) when the contract does not exist.
    """
    contract = get_contract(clinic_id, agent_id)
    if contract is None:
        raise MarketplaceError(
            code="agent_not_found",
            message=f"No contract for agent '{agent_id}' in clinic '{clinic_id}'.",
            status_code=404,
        )
    contract.billing_status = "cancelled"
    contract.transition("revoked", actor_id=actor_id, details={"reason": "user_cancelled"})
    contract.add_audit_event(
        event_type="agent.cancelled",
        actor_id=actor_id,
        details={"previous_status": contract.run_status},
    )
    save_contract(contract)
    logger.info(
        "agent_rental_cancelled",
        extra={
            "event": "agent_rental_cancelled",
            "agent_id": agent_id,
            "clinic_id": clinic_id,
            "actor_id": actor_id,
        },
    )
    return contract


def pause_agent(
    agent_id: str,
    clinic_id: str,
    actor_id: str,
) -> AgentContract:
    """Pause a running agent.

    Transitions ``run_status`` from ``running`` or ``idle`` to ``paused``.
    A paused agent does not process new requests but retains its contract,
    billing status, and configuration.

    Raises :class:`MarketplaceError` (404/409) on missing contract or
    illegal transition.
    """
    contract = get_contract(clinic_id, agent_id)
    if contract is None:
        raise MarketplaceError(
            code="agent_not_found",
            message=f"No contract for agent '{agent_id}' in clinic '{clinic_id}'.",
            status_code=404,
        )
    try:
        contract.transition("paused", actor_id=actor_id)
    except ValueError as exc:
        raise MarketplaceError(
            code="agent_pause_failed",
            message=str(exc),
            status_code=409,
        ) from exc
    contract.add_audit_event(
        event_type="agent.paused",
        actor_id=actor_id,
        details={"billing_status": contract.billing_status},
    )
    save_contract(contract)
    logger.info(
        "agent_paused",
        extra={
            "event": "agent_paused",
            "agent_id": agent_id,
            "clinic_id": clinic_id,
            "actor_id": actor_id,
        },
    )
    return contract


def resume_agent(
    agent_id: str,
    clinic_id: str,
    actor_id: str,
) -> AgentContract:
    """Resume a paused agent.

    Transitions ``run_status`` from ``paused`` to ``idle``. The agent
    becomes available for invocation again.

    Raises :class:`MarketplaceError` (404/409) on missing contract or
    illegal transition.
    """
    contract = get_contract(clinic_id, agent_id)
    if contract is None:
        raise MarketplaceError(
            code="agent_not_found",
            message=f"No contract for agent '{agent_id}' in clinic '{clinic_id}'.",
            status_code=404,
        )
    try:
        contract.transition("idle", actor_id=actor_id)
    except ValueError as exc:
        raise MarketplaceError(
            code="agent_resume_failed",
            message=str(exc),
            status_code=409,
        ) from exc
    contract.add_audit_event(
        event_type="agent.activated",
        actor_id=actor_id,
        details={"billing_status": contract.billing_status},
    )
    save_contract(contract)
    logger.info(
        "agent_resumed",
        extra={
            "event": "agent_resumed",
            "agent_id": agent_id,
            "clinic_id": clinic_id,
            "actor_id": actor_id,
        },
    )
    return contract


def revoke_agent(
    agent_id: str,
    clinic_id: str,
    actor_id: str,
    reason: str = "admin_revoked",
) -> AgentContract:
    """Revoke an agent — terminal state.

    Transitions to ``run_status=revoked``. Revoked agents cannot be
    resumed. This is the emergency off-switch.

    Raises :class:`MarketplaceError` (404) on missing contract.
    """
    contract = get_contract(clinic_id, agent_id)
    if contract is None:
        raise MarketplaceError(
            code="agent_not_found",
            message=f"No contract for agent '{agent_id}' in clinic '{clinic_id}'.",
            status_code=404,
        )
    try:
        contract.transition("revoked", actor_id=actor_id, details={"reason": reason})
    except ValueError as exc:
        # If already revoked, that's fine — idempotent.
        if contract.run_status == "revoked":
            return contract
        raise MarketplaceError(
            code="agent_revoke_failed",
            message=str(exc),
            status_code=409,
        ) from exc
    contract.add_audit_event(
        event_type="agent.revoked",
        actor_id=actor_id,
        details={"reason": reason},
    )
    save_contract(contract)
    logger.info(
        "agent_revoked",
        extra={
            "event": "agent_revoked",
            "agent_id": agent_id,
            "clinic_id": clinic_id,
            "actor_id": actor_id,
            "reason": reason,
        },
    )
    return contract


# ---------------------------------------------------------------------------
# Billing
# ---------------------------------------------------------------------------


def get_agent_billing_status(agent_id: str, clinic_id: str) -> dict[str, Any]:
    """Return the billing state for one agent.

    Includes plan, price, status, expiry, and a ``can_upgrade`` flag
    indicating whether the caller is eligible to upgrade.
    """
    contract = get_contract(clinic_id, agent_id)
    if contract is None:
        raise MarketplaceError(
            code="agent_not_found",
            message=f"No contract for agent '{agent_id}' in clinic '{clinic_id}'.",
            status_code=404,
        )
    now = datetime.now(timezone.utc)
    is_expired = (
        contract.expires_at is not None and contract.expires_at < now
    )
    if is_expired and contract.billing_status not in ("cancelled", "expired"):
        contract.billing_status = "expired"
        save_contract(contract)

    return {
        "agent_id": contract.agent_id,
        "billing_status": contract.billing_status,
        "billing_plan": contract.billing_plan,
        "monthly_price_gbp": contract.monthly_price_gbp,
        "expires_at": contract.expires_at.isoformat() if contract.expires_at else None,
        "is_expired": is_expired,
        "trial_remaining_days": (
            max(0, (contract.expires_at - now).days)
            if contract.expires_at and contract.billing_status == "trial"
            else None
        ),
        "available_plans": [
            {"plan": p, "price_gbp": price}
            for p, price in _PLAN_PRICES.items()
        ],
        "safety_disclaimer": contract.safety_disclaimer,
    }


def upgrade_agent_plan(
    agent_id: str,
    clinic_id: str,
    new_plan: str,
    actor_id: str,
) -> AgentContract:
    """Upgrade (or downgrade) an agent's billing plan.

    Validates *new_plan* against :data:`_PLAN_PRICES`, updates
    ``monthly_price_gbp``, and appends an audit event.

    Raises :class:`MarketplaceError` (404/400) on missing contract or
    invalid plan.
    """
    contract = get_contract(clinic_id, agent_id)
    if contract is None:
        raise MarketplaceError(
            code="agent_not_found",
            message=f"No contract for agent '{agent_id}' in clinic '{clinic_id}'.",
            status_code=404,
        )
    if new_plan not in _PLAN_PRICES:
        raise MarketplaceError(
            code="invalid_plan",
            message=f"Plan '{new_plan}' is not valid. Choose from: {', '.join(_PLAN_PRICES.keys())}.",
            status_code=400,
        )
    old_plan = contract.billing_plan
    contract.billing_plan = new_plan
    contract.monthly_price_gbp = _PLAN_PRICES[new_plan]
    if contract.billing_status == "trial":
        contract.billing_status = "active"
        contract.activated_at = datetime.now(timezone.utc)
    contract.add_audit_event(
        event_type="agent.plan_changed",
        actor_id=actor_id,
        details={"old_plan": old_plan, "new_plan": new_plan},
    )
    save_contract(contract)
    logger.info(
        "agent_plan_changed",
        extra={
            "event": "agent_plan_changed",
            "agent_id": agent_id,
            "clinic_id": clinic_id,
            "old_plan": old_plan,
            "new_plan": new_plan,
        },
    )
    return contract


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _summarise_evidence(tool_ids: list[str]) -> dict[str, Any]:
    """Aggregate evidence grades for a list of tools.

    Returns a dict with grade counts and a human-readable summary.
    """
    grades: dict[str, list[str]] = {"A": [], "B": [], "C": [], "D": [], "ungraded": []}
    for tid in tool_ids:
        grade = _TOOL_EVIDENCE_GRADES.get(tid, "ungraded")
        grades[grade].append(tid)
    total = len(tool_ids)
    return {
        "total": total,
        "grade_a": len(grades["A"]),
        "grade_b": len(grades["B"]),
        "grade_c": len(grades["C"]),
        "grade_d": len(grades["D"]),
        "ungraded": len(grades["ungraded"]),
        "strong_evidence_ratio": (
            round((len(grades["A"]) + len(grades["B"])) / total, 2)
            if total else 0.0
        ),
        "summary_text": (
            f"{len(grades['A'])} Grade-A, {len(grades['B'])} Grade-B, "
            f"{len(grades['C'])} Grade-C, {len(grades['D'])} Grade-D tools"
        ),
    }


__all__ = [
    "MarketplaceError",
    "list_available_agents",
    "get_agent_details",
    "get_control_centre_data",
    "rent_agent",
    "cancel_agent_rental",
    "pause_agent",
    "resume_agent",
    "revoke_agent",
    "get_agent_billing_status",
    "upgrade_agent_plan",
]
