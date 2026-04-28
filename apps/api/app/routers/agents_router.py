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

import json as _json
from typing import Any

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import (
    AuthenticatedActor,
    get_authenticated_actor,
    require_minimum_role,
)
from app.database import get_db_session
from app.errors import ApiServiceError
from app.limiter import limiter
from app.persistence.models import AgentRunAudit
from app.services.agents import runner
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
    # Phase 2 / ToolBroker — tool ids the runner pre-fetched and folded
    # into the live <context> block. Empty list when no live context was
    # attached. Useful for the UI tag "Grounded in: …".
    context_used: list[str] = Field(default_factory=list)
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
    db: Session = Depends(get_db_session),
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

    # NOTE: the runner now writes the AgentRunAudit row itself (so the
    # latency it captures is the *real* LLM wall-clock, not the response-
    # serialisation tail). No explicit audit.record_run call here.
    result = runner.run_agent(
        agent_def,
        message=payload.message,
        context=payload.context,
        actor=actor,
        db=db,
    )

    return AgentRunResponse(
        agent_id=result["agent_id"],
        reply=result.get("reply", ""),
        schema_id=result["schema_id"],
        safety_footer=result["safety_footer"],
        context_used=list(result.get("context_used", []) or []),
        error=result.get("error"),
    )


# ---------------------------------------------------------------------------
# GET /api/v1/agents/runs — admin / clinician audit history
# ---------------------------------------------------------------------------


class AgentRunOut(BaseModel):
    """One row of the agent run audit, projected for the history view."""

    id: str
    created_at: str  # ISO-8601 UTC
    actor_id: str | None
    agent_id: str
    message_preview: str
    reply_preview: str
    context_used: list[str] = Field(default_factory=list)
    latency_ms: int | None = None
    ok: bool
    error_code: str | None = None


class AgentRunListResponse(BaseModel):
    runs: list[AgentRunOut]


def _decode_context_used(raw: str | None) -> list[str]:
    """Best-effort decode of the JSON ``context_used_json`` column.

    Returns ``[]`` for empty / malformed payloads so the response shape
    stays consistent — the audit log should never crash the history
    endpoint just because one row was written by an older runner version.
    """
    if not raw:
        return []
    try:
        parsed = _json.loads(raw)
    except (TypeError, ValueError):
        return []
    if not isinstance(parsed, list):
        return []
    return [str(x) for x in parsed]


@router.get("/runs", response_model=AgentRunListResponse)
def list_agent_runs(
    request: Request,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
    limit: int = Query(50, ge=1, le=200),
    agent_id: str | None = Query(None),
) -> AgentRunListResponse:
    """Return recent agent runs visible to the calling actor.

    Visibility rules
    ----------------
    * Caller must be at least ``clinician``. Guests / patients get a 403
      via :func:`require_minimum_role`.
    * Rows are filtered to ``actor.clinic_id`` — clinicians and admins
      see only the runs scoped to their tenant. An admin without a
      ``clinic_id`` (cross-clinic super-admin) sees nothing here; the
      cross-tenant view will live behind a separate ops-only endpoint.
    * Optional ``agent_id`` further narrows by agent.
    * ``limit`` is clamped to ``[1, 200]`` (FastAPI ``Query`` enforces).

    Ordered ``created_at DESC`` so the freshest run is at the top.
    """
    require_minimum_role(actor, "clinician")

    q = db.query(AgentRunAudit)
    # A clinic-scoped clinician/admin only sees their own clinic's audit
    # rows. ``actor.clinic_id is None`` (e.g. cross-clinic super-admin or
    # demo accounts not bound to a Clinic) intentionally returns an empty
    # list rather than leaking other tenants' rows.
    q = q.filter(AgentRunAudit.clinic_id == actor.clinic_id)

    if agent_id is not None:
        q = q.filter(AgentRunAudit.agent_id == agent_id)

    rows = q.order_by(AgentRunAudit.created_at.desc()).limit(limit).all()

    runs: list[AgentRunOut] = []
    for row in rows:
        # ``created_at`` is stored without tz info on SQLite; the runner
        # writes UTC, so we surface ISO-8601 + ``Z`` for clarity. On
        # Postgres the column is timezone-aware and isoformat() already
        # carries the offset.
        ts = row.created_at
        if ts is not None and ts.tzinfo is None:
            iso_ts = ts.isoformat() + "Z"
        else:
            iso_ts = ts.isoformat() if ts is not None else ""
        runs.append(
            AgentRunOut(
                id=row.id,
                created_at=iso_ts,
                actor_id=row.actor_id,
                agent_id=row.agent_id,
                message_preview=row.message_preview or "",
                reply_preview=row.reply_preview or "",
                context_used=_decode_context_used(row.context_used_json),
                latency_ms=row.latency_ms,
                ok=bool(row.ok),
                error_code=row.error_code,
            )
        )
    return AgentRunListResponse(runs=runs)


__all__ = ["router"]
