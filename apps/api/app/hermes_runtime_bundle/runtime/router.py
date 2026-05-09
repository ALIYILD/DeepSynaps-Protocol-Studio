from __future__ import annotations

from typing import Any

from .audit import append_audit_event, make_audit_event
from .boards import HermesBoardStore
from .schema import base_task, compact_text, compact_multiline


DIRECT_AGENT_ROUTES = {
    "alislave-ai": ("personal", "alislave-ai", "AliSlave AI intake routes to the personal board."),
    "openclaw-personal": ("personal", "alislave-ai", "OpenClaw personal intake routes to the personal board."),
    "perfflux-hq": ("perfflux", "perfflux-hq", "Perfflux HQ intake routes to the company board."),
    "openclaw-perfflux": ("perfflux", "perfflux-hq", "OpenClaw PerfFlux intake routes to the company board."),
    "hermes": ("deepsynaps", "coordinator", "Hermes intake routes to the DeepSynaps execution board."),
    "paperclip": ("governance", "paperclip-governance-bridge", "Paperclip intake routes to governance."),
}

KEYWORD_RULES = (
    (
        "deepsynaps",
        "coordinator",
        (
            "deepsynaps",
            "sozo",
            "protocol",
            "qeeg",
            "mri",
            "deeptwin",
            "clinical dashboard",
            "studio",
        ),
        "DeepSynaps-related keywords routed the task to product execution.",
    ),
    (
        "perfflux",
        "perfflux-hq",
        (
            "perfflux",
            "gpu",
            "nvidia",
            "cluster",
            "cost",
            "optimization",
            "neurorouter",
        ),
        "PerfFlux/GPU keywords routed the task to the company board.",
    ),
    (
        "personal",
        "alislave-ai",
        (
            "personal",
            "admin",
            "family",
            "travel",
            "life",
            "calendar",
            "reminder",
        ),
        "Personal-admin keywords routed the task to AliSlave AI.",
    ),
    (
        "governance",
        "paperclip-governance-bridge",
        (
            "governance",
            "approval",
            "approvals",
            "budget",
            "budgets",
            "agent conflict",
            "conflict",
            "policy",
            "policies",
            "paperclip",
        ),
        "Governance/approval keywords routed the task to Paperclip governance.",
    ),
)


def preview_route(payload: dict[str, Any]) -> dict[str, Any]:
    source_agent = str(payload.get("source_agent_or_bot") or "").strip().lower()
    if source_agent in DIRECT_AGENT_ROUTES:
        board, target_agent, reason = DIRECT_AGENT_ROUTES[source_agent]
        return {
            "target_board": board,
            "target_agent": target_agent,
            "status": "todo",
            "routing_reason": reason,
            "approval_required": board == "governance",
        }

    text = f"{payload.get('title') or ''} {payload.get('raw_summary') or ''} {payload.get('source_channel') or ''}".lower()
    for board, target_agent, keywords, reason in KEYWORD_RULES:
        if any(keyword in text for keyword in keywords):
            return {
                "target_board": board,
                "target_agent": target_agent,
                "status": "todo",
                "routing_reason": reason,
                "approval_required": board == "governance",
            }

    return {
        "target_board": "global-inbox",
        "target_agent": "global-inbox-router",
        "status": "needs_triage",
        "routing_reason": "Routing was unclear, so the task stays in global-inbox for triage.",
        "approval_required": False,
    }


def route_intake_task(store: HermesBoardStore, payload: dict[str, Any]) -> dict[str, Any]:
    source_agent = compact_text(payload.get("source_agent_or_bot") or "unknown", limit=96) or "unknown"
    task = base_task({
        **payload,
        "target_board": "global-inbox",
        "target_agent": "global-inbox-router",
    })
    append_audit_event(
        task,
        make_audit_event(
            "received",
            actor=source_agent,
            detail=compact_multiline(
                f"Received from {payload.get('source')} / {payload.get('source_channel') or source_agent}.",
                limit=300,
            ),
            board="global-inbox",
            target_agent="global-inbox-router",
        ),
    )
    created = store.create_task(task)

    decision = preview_route(created)
    store.append_task_audit(
        created["id"],
        event_type="classified",
        actor="global-inbox-router",
        detail=decision["routing_reason"],
        extra={
            "target_board": decision["target_board"],
            "target_agent": decision["target_agent"],
        },
    )

    if decision["target_board"] == "global-inbox":
        return store.update_task(
            created["id"],
            {
                "status": decision["status"],
                "target_board": "global-inbox",
                "target_agent": "global-inbox-router",
                "routing_reason": decision["routing_reason"],
                "approval_required": decision["approval_required"],
            },
            audit_actor="global-inbox-router",
            audit_event="needs_triage",
            audit_detail="Task remained in global-inbox because the route was unclear.",
        )

    routed = store.move_task(
        created["id"],
        target_board=decision["target_board"],
        target_agent=decision["target_agent"],
        routing_reason=decision["routing_reason"],
        actor="global-inbox-router",
        status=decision["status"],
    )
    if decision["approval_required"]:
        routed = store.update_task(
            created["id"],
            {"approval_required": True},
            audit_actor="paperclip-governance-bridge",
            audit_event="approval_required",
            audit_detail="Governance routing marked this task as approval-required.",
        )
    return routed
