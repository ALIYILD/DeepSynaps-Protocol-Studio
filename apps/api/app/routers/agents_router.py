"""Agent Marketplace API — list and run installable AI agents.

Endpoints:

* ``GET  /api/v1/agents``               — list agents visible to the actor.
* ``POST /api/v1/agents/{agent_id}/run`` — run one turn against an agent.

Decision-support framing only — every response carries the safety footer
``"decision-support, not autonomous diagnosis"`` and is meant for review by
a human clinician or admin before being acted on.

Auth + entitlement gates
========================
* All endpoints require an authenticated actor.
* ``GET /`` filters by role + package via :func:`list_visible_agents`; it
  intentionally returns ``200 {"agents": []}`` for an authenticated actor
  who is not entitled to any agent (rather than 403) so the marketplace
  can render an empty-state UI.
* ``POST /{agent_id}/run`` enforces the agent's :attr:`role_required` and
  :attr:`package_required` strictly — 403 on mismatch — and 404 when the
  ``agent_id`` is unknown.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field

from app.auth import (
    AuthenticatedActor,
    get_authenticated_actor,
    require_minimum_role,
)
from app.errors import ApiServiceError
from app.limiter import limiter
from app.services.agents import audit, runner
from app.services.agents.registry import (
    AGENT_REGISTRY,
    AgentAudience,
    AgentRoleRequired,
    list_visible_agents,
)

router = APIRouter(prefix="/api/v1/agents", tags=["agents"])


# ---------------------------------------------------------------------------
# Pydantic schemas (kept inline per project convention)
# ---------------------------------------------------------------------------


class AgentListItem(BaseModel):
    """Marketplace tile shape — mirrors :class:`AgentDefinition` minus the
    system prompt (which is implementation detail and never leaks to clients)."""

    id: str
    name: str
    tagline: str
    audience: AgentAudience
    role_required: AgentRoleRequired
    package_required: list[str]
    tool_allowlist: list[str]
    monthly_price_gbp: int
    tags: list[str]


class AgentListResponse(BaseModel):
    agents: list[AgentListItem]


class AgentRunRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=runner.MAX_MESSAGE_CHARS)
    context: dict[str, Any] | None = None


class AgentRunResponse(BaseModel):
    agent_id: str
    reply: str
    schema_id: str
    safety_footer: str
    error: str | None = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _to_list_item(agent_def) -> AgentListItem:
    """Project an :class:`AgentDefinition` to its public-facing tile shape."""
    return AgentListItem(
        id=agent_def.id,
        name=agent_def.name,
        tagline=agent_def.tagline,
        audience=agent_def.audience,
        role_required=agent_def.role_required,
        package_required=list(agent_def.package_required),
        tool_allowlist=list(agent_def.tool_allowlist),
        monthly_price_gbp=agent_def.monthly_price_gbp,
        tags=list(agent_def.tags),
    )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.get("/", response_model=AgentListResponse)
def list_agents(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> AgentListResponse:
    """Return all marketplace agents the calling actor is entitled to see."""
    visible = list_visible_agents(actor)
    return AgentListResponse(agents=[_to_list_item(a) for a in visible])


@router.post("/{agent_id}/run", response_model=AgentRunResponse)
@limiter.limit("10/minute")
def run_agent_endpoint(
    request: Request,
    agent_id: str,
    payload: AgentRunRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> AgentRunResponse:
    """Execute one turn of the requested agent on behalf of the actor."""
    agent_def = AGENT_REGISTRY.get(agent_id)
    if agent_def is None:
        raise ApiServiceError(
            code="agent_not_found",
            message=f"No agent is registered with id '{agent_id}'.",
            status_code=404,
        )

    # Role gate — uses the standard role hierarchy ladder.
    require_minimum_role(actor, agent_def.role_required)

    # Package gate — empty list means "available to all packages".
    if agent_def.package_required and (
        actor.package_id not in agent_def.package_required
    ):
        raise ApiServiceError(
            code="agent_package_required",
            message=(
                f"Agent '{agent_id}' requires one of the following packages: "
                f"{', '.join(agent_def.package_required)}."
            ),
            warnings=["Upgrade your package to unlock this agent."],
            status_code=403,
        )

    result = runner.run_agent(
        agent_def, message=payload.message, context=payload.context
    )

    ok = bool(result.get("reply")) and not result.get("error")
    audit.record_run(
        actor_id=actor.actor_id,
        agent_id=agent_def.id,
        message_preview=payload.message,
        reply_preview=str(result.get("reply", "")),
        ok=ok,
    )

    return AgentRunResponse(
        agent_id=result["agent_id"],
        reply=result.get("reply", ""),
        schema_id=result["schema_id"],
        safety_footer=result["safety_footer"],
        error=result.get("error"),
    )


__all__ = ["router"]
