"""Agent Tool Permission Service — risk-tier classification and approval
policy enforcement for the AI Agent Operating System.

Every tool that an agent can call is classified into one of four risk
tiers. The classification drives the approval policy:

* **read_only** — auto-approved. Safe queries with no side effects.
* **low_risk** — auto-approved. Drafts and non-binding outputs that a
  human reviews before action.
* **medium_risk** — pre_approve required. Writes that affect operational
  state (appointments, reminders) but not clinical decisions.
* **high_risk** — pre_approve required. Writes that touch patient
  communication, clinical reports, or trigger AI analysis pipelines.
* **forbidden** — never approved. Autonomous diagnosis, prescription,
  emergency triage, and treatment changes are **categorically blocked**
  regardless of role or policy.

Clinical safety
===============
This module is the **authoritative safety boundary** for agent tool
access. No tool call proceeds without passing through
:func:`check_tool_permission`. The forbidden tier exists to enforce
the principle that AI agents are **decision-support only** — they may
summarise, draft, and queue, but they may never autonomously make
clinical decisions.

Evidence grades (A-D) are attached to each tool classification so that
clinicians can see which capabilities are backed by strong evidence and
which are experimental.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Literal, Optional

from app.auth import AuthenticatedActor, ROLE_ORDER
from app.errors import ApiServiceError

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Tool classification registry
# ---------------------------------------------------------------------------
# Each tool is mapped to a risk tier and approval policy. The
# ``evidence_grade`` field indicates the strength of evidence supporting
# the tool's safe operation:
#   A = Systematic review / RCT evidence
#   B = Cohort studies / clinical validation
#   C = Case series / expert consensus
#   D = Experimental / under validation

_TOOL_META: dict[str, dict[str, str]] = {
    # --- Read-only (auto) ---
    "read.schedule": {
        "tier": "read_only",
        "approval": "auto",
        "evidence_grade": "A",
        "description": "Read clinic schedule and availability",
    },
    "read.clinic_faq": {
        "tier": "read_only",
        "approval": "auto",
        "evidence_grade": "A",
        "description": "Query clinic FAQ and policy documents",
    },
    "read.patient_summary": {
        "tier": "read_only",
        "approval": "auto",
        "evidence_grade": "A",
        "description": "Read condensed patient summary",
    },
    "read.evidence": {
        "tier": "read_only",
        "approval": "auto",
        "evidence_grade": "B",
        "description": "Search evidence base and literature",
    },

    # --- Low-risk write (auto) ---
    "draft.message": {
        "tier": "low_risk",
        "approval": "auto",
        "evidence_grade": "B",
        "description": "Draft a message for human review before sending",
    },
    "draft.task": {
        "tier": "low_risk",
        "approval": "auto",
        "evidence_grade": "B",
        "description": "Draft a task or to-do item",
    },
    "draft.report_section": {
        "tier": "low_risk",
        "approval": "auto",
        "evidence_grade": "B",
        "description": "Draft a section of a clinical report",
    },

    # --- Medium-risk write (pre_approve) ---
    "write.appointment": {
        "tier": "medium_risk",
        "approval": "pre_approve",
        "evidence_grade": "A",
        "description": "Book, reschedule, or cancel an appointment",
    },
    "write.reminder": {
        "tier": "medium_risk",
        "approval": "pre_approve",
        "evidence_grade": "A",
        "description": "Send a patient reminder",
    },
    "write.form_status": {
        "tier": "medium_risk",
        "approval": "pre_approve",
        "evidence_grade": "B",
        "description": "Update form or questionnaire status",
    },

    # --- High-risk write (pre_approve) ---
    "write.patient_message": {
        "tier": "high_risk",
        "approval": "pre_approve",
        "evidence_grade": "B",
        "description": "Send a message directly to a patient",
    },
    "write.clinical_report": {
        "tier": "high_risk",
        "approval": "pre_approve",
        "evidence_grade": "B",
        "description": "Write or finalize a clinical report",
    },
    "read.full_chart": {
        "tier": "high_risk",
        "approval": "pre_approve",
        "evidence_grade": "A",
        "description": "Read full patient chart including detailed history",
    },
    "trigger.ai_analysis": {
        "tier": "high_risk",
        "approval": "pre_approve",
        "evidence_grade": "C",
        "description": "Trigger an AI analysis pipeline",
    },
    "export.patient_data": {
        "tier": "high_risk",
        "approval": "pre_approve",
        "evidence_grade": "B",
        "description": "Export patient data (GDPR Article 20)",
    },

    # --- FORBIDDEN autonomous (never) ---
    "diagnose": {
        "tier": "forbidden",
        "approval": "never",
        "evidence_grade": "D",
        "description": "AUTONOMOUS DIAGNOSIS — NEVER PERMITTED",
    },
    "prescribe": {
        "tier": "forbidden",
        "approval": "never",
        "evidence_grade": "D",
        "description": "AUTONOMOUS PRESCRIPTION — NEVER PERMITTED",
    },
    "triage_emergency": {
        "tier": "forbidden",
        "approval": "never",
        "evidence_grade": "D",
        "description": "AUTONOMOUS EMERGENCY TRIAGE — NEVER PERMITTED",
    },
    "change_treatment": {
        "tier": "forbidden",
        "approval": "never",
        "evidence_grade": "D",
        "description": "AUTONOMOUS TREATMENT CHANGE — NEVER PERMITTED",
    },
}

# Public constant for downstream consumers
TOOL_CLASSIFICATION: dict[str, dict[str, str]] = {
    tid: {"tier": meta["tier"], "approval": meta["approval"]}
    for tid, meta in _TOOL_META.items()
}

# Tier ordering for severity comparison (higher = more restrictive)
_TIER_ORDER = {
    "read_only": 0,
    "low_risk": 1,
    "medium_risk": 2,
    "high_risk": 3,
    "forbidden": 4,
}

# Minimum role required to approve each tier
_TIER_MIN_ROLE = {
    "read_only": "technician",
    "low_risk": "technician",
    "medium_risk": "clinician",
    "high_risk": "clinician",
    "forbidden": "admin",  # Still never approved, but admin can override config
}

RiskTier = Literal["read_only", "low_risk", "medium_risk", "high_risk", "forbidden"]
ApprovalPolicy = Literal["auto", "pre_approve", "post_review", "never"]


# ---------------------------------------------------------------------------
# In-memory audit log for tool calls
# ---------------------------------------------------------------------------

_tool_call_audit_log: list[dict[str, Any]] = []
_MAX_AUDIT_LOG_SIZE = 10_000


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def check_tool_permission(
    agent_id: str,
    tool_id: str,
    user_role: str,
) -> bool:
    """Return ``True`` if *user_role* may call *tool_id* on behalf of *agent_id*.

    Permission logic
    ----------------
    1. If the tool is in the **forbidden** tier, always returns ``False``.
       Autonomous diagnosis, prescription, emergency triage, and treatment
       changes are categorically blocked.
    2. If the tool is unknown (not in :data:`_TOOL_META`), returns ``False``
       — deny-by-default for unclassified tools.
    3. If the tool is in the **read_only** or **low_risk** tier, returns
       ``True`` for any authenticated role (technician and above).
    4. If the tool is in the **medium_risk** or **high_risk** tier, returns
       ``True`` only for clinician and above.

    Parameters
    ----------
    agent_id
        The agent attempting the tool call. Used for audit logging.
    tool_id
        Canonical tool identifier (e.g. ``"read.schedule"``).
    user_role
        Role of the human user on whose behalf the agent acts.

    Returns
    -------
    bool
        ``True`` if permission is granted, ``False`` otherwise.
    """
    meta = _TOOL_META.get(tool_id)
    if meta is None:
        logger.warning(
            "tool_permission_unknown_tool",
            extra={
                "event": "tool_permission_unknown_tool",
                "agent_id": agent_id,
                "tool_id": tool_id,
                "user_role": user_role,
            },
        )
        return False

    tier = meta["tier"]

    # Forbidden tier: NEVER permit, regardless of role
    if tier == "forbidden":
        logger.warning(
            "tool_permission_forbidden",
            extra={
                "event": "tool_permission_forbidden",
                "agent_id": agent_id,
                "tool_id": tool_id,
                "user_role": user_role,
            },
        )
        return False

    # Check role meets minimum for the tier
    min_role = _TIER_MIN_ROLE.get(tier, "clinician")
    if ROLE_ORDER.get(user_role, -1) < ROLE_ORDER.get(min_role, 0):
        logger.info(
            "tool_permission_role_denied",
            extra={
                "event": "tool_permission_role_denied",
                "agent_id": agent_id,
                "tool_id": tool_id,
                "user_role": user_role,
                "required_role": min_role,
            },
        )
        return False

    return True


def get_tool_approval_required(tool_id: str) -> dict[str, Any]:
    """Return the approval policy and metadata for *tool_id*.

    Returns a dict with ``tier``, ``approval``, ``evidence_grade``,
    ``description``, and ``requires_human_approval`` (bool).

    For unknown tools, returns a safe deny-by-default response.
    """
    meta = _TOOL_META.get(tool_id)
    if meta is None:
        return {
            "tool_id": tool_id,
            "tier": "unknown",
            "approval": "never",
            "evidence_grade": "D",
            "description": "Unknown tool — access denied by default",
            "requires_human_approval": True,
        }
    return {
        "tool_id": tool_id,
        "tier": meta["tier"],
        "approval": meta["approval"],
        "evidence_grade": meta["evidence_grade"],
        "description": meta["description"],
        "requires_human_approval": meta["approval"] in ("pre_approve", "post_review"),
    }


def classify_tools(tool_ids: list[str]) -> dict[str, list[str]]:
    """Classify a list of tool IDs into their risk tiers.

    Returns a dict mapping each tier to the list of tools in that tier.
    Unknown tools are placed in a special ``unknown`` bucket.
    """
    result: dict[str, list[str]] = {
        "read_only": [],
        "low_risk": [],
        "medium_risk": [],
        "high_risk": [],
        "forbidden": [],
        "unknown": [],
    }
    for tid in tool_ids:
        meta = _TOOL_META.get(tid)
        if meta is None:
            result["unknown"].append(tid)
        else:
            result[meta["tier"]].append(tid)
    return {k: v for k, v in result.items() if v}


def get_tools_for_tier(tier: RiskTier) -> list[dict[str, str]]:
    """Return all tools classified at *tier*, with metadata."""
    return [
        {
            "tool_id": tid,
            "approval": meta["approval"],
            "evidence_grade": meta["evidence_grade"],
            "description": meta["description"],
        }
        for tid, meta in _TOOL_META.items()
        if meta["tier"] == tier
    ]


def get_max_tier_for_tools(tool_ids: list[str]) -> RiskTier | Literal["unknown"]:
    """Return the most restrictive tier among *tool_ids*.

    Useful for UIs that want to display a single severity badge for an
    agent's entire tool set.
    """
    max_severity = -1
    max_tier: RiskTier | Literal["unknown"] = "unknown"
    for tid in tool_ids:
        meta = _TOOL_META.get(tid)
        if meta is None:
            return "unknown"
        tier = meta["tier"]
        severity = _TIER_ORDER[tier]
        if severity > max_severity:
            max_severity = severity
            max_tier = tier
    return max_tier


def audit_tool_call(
    agent_id: str,
    tool_id: str,
    user_id: str,
    user_role: str,
    result: dict[str, Any] | None = None,
) -> None:
    """Log a tool call attempt to the in-memory audit buffer.

    The buffer is capped at :data:`_MAX_AUDIT_LOG_SIZE` entries; when
    full, oldest entries are dropped FIFO. Production deployments should
    flush this buffer to persistent storage (e.g. the ``agent_run_audit``
    table or an external SIEM).

    Parameters
    ----------
    agent_id
        The agent that attempted the tool call.
    tool_id
        The tool that was called.
    user_id
        The human user on whose behalf the agent acted.
    user_role
        Role of the human user.
    result
        Optional result dict (ok, output preview, error).
    """
    global _tool_call_audit_log

    entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "agent_id": agent_id,
        "tool_id": tool_id,
        "user_id": user_id,
        "user_role": user_role,
        "result": result or {},
    }
    _tool_call_audit_log.append(entry)

    if len(_tool_call_audit_log) > _MAX_AUDIT_LOG_SIZE:
        _tool_call_audit_log = _tool_call_audit_log[-_MAX_AUDIT_LOG_SIZE:]

    logger.info(
        "tool_call_audited",
        extra={
            "event": "tool_call_audited",
            "agent_id": agent_id,
            "tool_id": tool_id,
            "user_id": user_id,
            "user_role": user_role,
        },
    )


def get_tool_audit_log(
    agent_id: str | None = None,
    tool_id: str | None = None,
    limit: int = 100,
) -> list[dict[str, Any]]:
    """Query the in-memory tool call audit log.

    Parameters
    ----------
    agent_id
        Optional filter by agent.
    tool_id
        Optional filter by tool.
    limit
        Maximum entries to return (default 100).
    """
    results = list(_tool_call_audit_log)
    if agent_id:
        results = [r for r in results if r["agent_id"] == agent_id]
    if tool_id:
        results = [r for r in results if r["tool_id"] == tool_id]
    results.sort(key=lambda r: r.get("timestamp", ""), reverse=True)
    return results[:limit]


def clear_tool_audit_log() -> None:
    """Clear the in-memory audit log. Intended for test isolation only."""
    global _tool_call_audit_log
    _tool_call_audit_log = []


__all__ = [
    "TOOL_CLASSIFICATION",
    "RiskTier",
    "ApprovalPolicy",
    "check_tool_permission",
    "get_tool_approval_required",
    "classify_tools",
    "get_tools_for_tier",
    "get_max_tier_for_tools",
    "audit_tool_call",
    "get_tool_audit_log",
    "clear_tool_audit_log",
]
