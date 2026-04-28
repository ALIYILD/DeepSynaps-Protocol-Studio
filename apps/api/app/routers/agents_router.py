"""Agent Marketplace API — list and run installable AI agents.

Endpoints:

* ``GET  /api/v1/agents``                  — list agents visible to the actor.
* ``POST /api/v1/agents/{agent_id}/run``    — run one turn against an agent.
* ``GET  /api/v1/agents/runs``              — clinic-scoped run history.
* ``GET  /api/v1/agents/ops/runs``          — cross-clinic run history (super-admin).
* ``GET  /api/v1/agents/ops/abuse-signals`` — abuse-rate signals (super-admin).

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
* ``GET /ops/*`` requires admin role AND ``actor.clinic_id is None`` — only
  cross-clinic super-admins see the global ops view.
"""
from __future__ import annotations

import json as _json
import statistics
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.auth import (
    AuthenticatedActor,
    get_authenticated_actor,
    require_minimum_role,
)
from app.database import get_db_session
from app.errors import ApiServiceError
from app.limiter import limiter
from app.persistence.models import (
    AgentPromptOverride,
    AgentRunAudit,
    ClinicMonthlyCostCap,
)
from app.services.agents import cost_cap as cost_cap_service
from app.services.agents import runner
from app.services.agents import sla as sla_service
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
    # Phase 2.5 — when present, this run is a clinician confirmation of a
    # previously-issued ``pending_tool_call``. The runner looks up the call
    # in :mod:`app.services.agents.pending_calls` and executes it via the
    # tool dispatcher instead of going to the LLM. Reject by sending
    # ``message="reject"`` with the same id.
    confirmed_tool_call_id: str | None = None


class PendingToolCallOut(BaseModel):
    """One pending tool call awaiting clinician confirmation.

    Mirrors the in-memory ``_PendingCall`` but stamps the ISO ``expires_at``
    that the UI uses to render the countdown. The clinician approves by
    POSTing a follow-up ``/run`` carrying ``confirmed_tool_call_id`` set
    to ``call_id``.
    """

    call_id: str
    tool_id: str
    args: dict[str, Any]
    summary: str
    expires_at: str  # ISO-8601 UTC


class ToolCallResultOut(BaseModel):
    """Outcome envelope returned after a confirmed write executed."""

    tool_id: str
    ok: bool
    result_preview: str
    audit_id: str | None = None


class AgentRunResponse(BaseModel):
    agent_id: str
    reply: str
    schema_id: str
    safety_footer: str
    # Phase 2 / ToolBroker — tool ids the runner pre-fetched and folded
    # into the live <context> block. Empty list when no live context was
    # attached. Useful for the UI tag "Grounded in: …".
    context_used: list[str] = Field(default_factory=list)
    # Phase 2.5 — at most one of these is set. ``pending_tool_call`` on
    # the first call when the LLM requested a write; ``tool_call_executed``
    # on the confirmation call after the dispatcher ran.
    pending_tool_call: PendingToolCallOut | None = None
    tool_call_executed: ToolCallResultOut | None = None
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
        confirmed_tool_call_id=payload.confirmed_tool_call_id,
    )

    pending_raw = result.get("pending_tool_call")
    executed_raw = result.get("tool_call_executed")

    return AgentRunResponse(
        agent_id=result["agent_id"],
        reply=result.get("reply", ""),
        schema_id=result["schema_id"],
        safety_footer=result["safety_footer"],
        context_used=list(result.get("context_used", []) or []),
        pending_tool_call=(
            PendingToolCallOut(**pending_raw) if pending_raw else None
        ),
        tool_call_executed=(
            ToolCallResultOut(**executed_raw) if executed_raw else None
        ),
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


# ---------------------------------------------------------------------------
# GET /api/v1/agents/ops/runs — cross-clinic super-admin audit history
# ---------------------------------------------------------------------------


class OpsRunOut(BaseModel):
    """One row of the cross-clinic ops audit projection.

    Mirrors :class:`AgentRunOut` but always carries ``clinic_id`` because
    the whole point of the ops view is to spot cross-tenant patterns.
    """

    id: str
    created_at: str  # ISO-8601 UTC
    actor_id: str | None
    clinic_id: str | None
    agent_id: str
    message_preview: str
    reply_preview: str
    context_used: list[str] = Field(default_factory=list)
    latency_ms: int | None = None
    ok: bool
    error_code: str | None = None


class OpsRunsResponse(BaseModel):
    runs: list[OpsRunOut]


def _require_super_admin(actor: AuthenticatedActor) -> None:
    """Both ops endpoints share this gate: admin role + no clinic binding.

    A clinic-scoped admin (``actor.clinic_id is not None``) gets 403 here
    even though they pass the role check — they should be using the
    tenant-scoped ``/runs`` endpoint instead.
    """
    require_minimum_role(actor, "admin")
    if actor.clinic_id is not None:
        raise ApiServiceError(
            code="ops_admin_required",
            message="Cross-clinic ops requires a super-admin actor.",
            warnings=["This endpoint is reserved for platform operators."],
            status_code=403,
        )


@router.get("/ops/runs", response_model=OpsRunsResponse)
def ops_list_runs(
    limit: int = Query(50, ge=1, le=500),
    agent_id: str | None = Query(None),
    clinic_id: str | None = Query(None),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> OpsRunsResponse:
    """Return recent agent runs across all clinics (super-admin only).

    Parameters
    ----------
    limit
        Maximum rows to return. ``[1, 500]`` — clamped by FastAPI.
    agent_id
        Optional filter on ``AgentRunAudit.agent_id``.
    clinic_id
        Optional filter on ``AgentRunAudit.clinic_id``. Useful when ops
        wants to drill into one tenant after spotting a hot pair on the
        ``/ops/abuse-signals`` view.

    Visibility
    ----------
    Caller must be ``role="admin"`` AND ``actor.clinic_id is None``. Any
    clinic-bound admin gets ``403 ops_admin_required`` so the cross-tenant
    surface stays opt-in.
    """
    _require_super_admin(actor)

    q = db.query(AgentRunAudit)
    if agent_id is not None:
        q = q.filter(AgentRunAudit.agent_id == agent_id)
    if clinic_id is not None:
        q = q.filter(AgentRunAudit.clinic_id == clinic_id)

    rows = q.order_by(AgentRunAudit.created_at.desc()).limit(limit).all()

    runs: list[OpsRunOut] = []
    for row in rows:
        ts = row.created_at
        if ts is not None and ts.tzinfo is None:
            iso_ts = ts.isoformat() + "Z"
        else:
            iso_ts = ts.isoformat() if ts is not None else ""
        runs.append(
            OpsRunOut(
                id=row.id,
                created_at=iso_ts,
                actor_id=row.actor_id,
                clinic_id=row.clinic_id,
                agent_id=row.agent_id,
                message_preview=row.message_preview or "",
                reply_preview=row.reply_preview or "",
                context_used=_decode_context_used(row.context_used_json),
                latency_ms=row.latency_ms,
                ok=bool(row.ok),
                error_code=row.error_code,
            )
        )
    return OpsRunsResponse(runs=runs)


# ---------------------------------------------------------------------------
# GET /api/v1/agents/ops/abuse-signals — flag noisy clinic+agent pairs
# ---------------------------------------------------------------------------


class AbuseSignal(BaseModel):
    """One (clinic_id, agent_id) pair whose run rate is well above the median.

    ``severity`` is bucketed for fast UI rendering:

    * ``"low"``  — > 5x the cross-pair median (the spec's flag threshold).
    * ``"med"``  — > 7.5x the median.
    * ``"high"`` — >= 10x the median.

    ``p_above_median`` is the multiplicative factor (``runs_count / median``)
    rounded to one decimal so the UI can show "12.0x median" without doing
    its own math.
    """

    clinic_id: str | None
    agent_id: str
    runs_count: int
    p_above_median: float
    severity: str  # "low" | "med" | "high"


class AbuseSignalsResponse(BaseModel):
    window_minutes: int
    median_runs_per_pair: float
    signals: list[AbuseSignal]


@router.get("/ops/abuse-signals", response_model=AbuseSignalsResponse)
def ops_abuse_signals(
    window_minutes: int = Query(60, ge=1, le=1440),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AbuseSignalsResponse:
    """Flag (clinic, agent) pairs whose run rate is far above the cohort.

    Algorithm
    ---------
    1. Bucket ``AgentRunAudit`` rows in the last ``window_minutes`` by
       ``(clinic_id, agent_id)``.
    2. Compute the median ``runs_count`` across all pairs.
    3. Any pair with ``runs_count > 5 * median`` is flagged. Severity:

       * ``>= 10x``  -> ``"high"``
       * ``> 7.5x``  -> ``"med"``
       * ``> 5x``    -> ``"low"``

    Returns an empty ``signals`` list when the audit table is empty in the
    window or all pairs are quiet (no row exceeds 5x the median). The
    ``median_runs_per_pair`` is surfaced so the UI can show the baseline.
    """
    _require_super_admin(actor)

    cutoff = datetime.now(timezone.utc) - timedelta(minutes=window_minutes)
    # SQLite stores naive datetimes; strip tz for the comparison so the
    # filter works regardless of backend.
    cutoff_naive = cutoff.replace(tzinfo=None)

    rows = (
        db.query(
            AgentRunAudit.clinic_id,
            AgentRunAudit.agent_id,
            func.count(AgentRunAudit.id).label("runs_count"),
        )
        .filter(AgentRunAudit.created_at >= cutoff_naive)
        .group_by(AgentRunAudit.clinic_id, AgentRunAudit.agent_id)
        .all()
    )

    if not rows:
        return AbuseSignalsResponse(
            window_minutes=window_minutes,
            median_runs_per_pair=0.0,
            signals=[],
        )

    counts = [int(r.runs_count) for r in rows]
    median = float(statistics.median(counts))

    signals: list[AbuseSignal] = []
    if median > 0:
        for r in rows:
            n = int(r.runs_count)
            ratio = n / median
            if ratio <= 5.0:
                continue
            severity = "high" if ratio >= 10.0 else ("med" if ratio > 7.5 else "low")
            signals.append(
                AbuseSignal(
                    clinic_id=r.clinic_id,
                    agent_id=r.agent_id,
                    runs_count=n,
                    p_above_median=round(ratio, 1),
                    severity=severity,
                )
            )

    # Highest ratio first so the UI can show "worst first" without sorting.
    signals.sort(key=lambda s: s.p_above_median, reverse=True)

    return AbuseSignalsResponse(
        window_minutes=window_minutes,
        median_runs_per_pair=median,
        signals=signals,
    )


# ---------------------------------------------------------------------------
# Phase 10 — GET /api/v1/agents/ops/sla — per-agent SLA rollup
# ---------------------------------------------------------------------------


class AgentSlaRow(BaseModel):
    """One per-agent rollup row over the requested SLA window."""

    agent_id: str
    runs: int
    errors: int
    error_rate: float  # 0..1
    p50_ms: int | None
    p95_ms: int | None
    avg_cost_pence: float


class AgentSlaResponse(BaseModel):
    since_hours: int
    rollup: list[AgentSlaRow]


@router.get("/ops/sla", response_model=AgentSlaResponse)
def ops_per_agent_sla(
    since_hours: int = Query(24, ge=1, le=168),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AgentSlaResponse:
    """Return a per-agent SLA rollup over the last ``since_hours`` hours.

    Visibility
    ----------
    Super-admin only — same gate as ``/ops/runs`` and ``/ops/abuse-signals``.

    Window
    ------
    ``since_hours`` is clamped to ``[1, 168]`` (one week max). FastAPI
    returns a 422 for out-of-range values without hitting the helper.

    Shape
    -----
    The response is sorted by ``runs`` descending so the busiest agents
    sit at the top of the dashboard. Latency percentiles use the
    nearest-rank method on the in-process latency list (cross-dialect —
    no Postgres ``percentile_cont`` so the same path works on SQLite).
    """
    _require_super_admin(actor)

    rollup = sla_service.per_agent_sla(db, since_hours=since_hours)
    return AgentSlaResponse(
        since_hours=int(since_hours),
        rollup=[AgentSlaRow(**row) for row in rollup],
    )


# ---------------------------------------------------------------------------
# Phase 7 — admin prompt-override endpoints
# ---------------------------------------------------------------------------


class PromptOverrideOut(BaseModel):
    """One :class:`AgentPromptOverride` row, projected for the admin UI."""

    id: str
    agent_id: str
    clinic_id: str | None
    system_prompt: str
    version: int
    enabled: bool
    created_at: str  # ISO-8601 UTC
    created_by: str | None


class PromptOverrideListResponse(BaseModel):
    overrides: list[PromptOverrideOut]


class PromptOverrideCreateRequest(BaseModel):
    """Body for ``POST /admin/prompt-overrides``.

    ``clinic_id=None`` creates a *global* override (applies to every
    clinic that doesn't have its own override). A non-null ``clinic_id``
    is clinic-scoped and wins over the global row at resolve time.
    """

    agent_id: str = Field(..., min_length=1, max_length=64)
    clinic_id: str | None = Field(default=None, max_length=64)
    system_prompt: str = Field(..., min_length=1, max_length=20_000)
    enabled: bool = Field(default=True)


def _row_to_override(row: AgentPromptOverride) -> PromptOverrideOut:
    """Project a model row to its public-facing shape."""
    ts = row.created_at
    if ts is not None and ts.tzinfo is None:
        iso_ts = ts.isoformat() + "Z"
    else:
        iso_ts = ts.isoformat() if ts is not None else ""
    return PromptOverrideOut(
        id=row.id,
        agent_id=row.agent_id,
        clinic_id=row.clinic_id,
        system_prompt=row.system_prompt,
        version=int(row.version or 1),
        enabled=bool(row.enabled),
        created_at=iso_ts,
        created_by=row.created_by,
    )


@router.get(
    "/admin/prompt-overrides",
    response_model=PromptOverrideListResponse,
)
def list_prompt_overrides(
    agent_id: str | None = Query(None, max_length=64),
    clinic_id: str | None = Query(None, max_length=64),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> PromptOverrideListResponse:
    """Admin-only — list prompt overrides, optionally filtered.

    Filters
    -------
    ``agent_id``
        Narrow to a single agent.
    ``clinic_id``
        Narrow to a single clinic. Pass ``"__global__"`` to filter to
        global overrides (``clinic_id IS NULL``); any other string is a
        literal match on the column.
    """
    require_minimum_role(actor, "admin")

    q = db.query(AgentPromptOverride)
    if agent_id is not None:
        q = q.filter(AgentPromptOverride.agent_id == agent_id)
    if clinic_id is not None:
        if clinic_id == "__global__":
            q = q.filter(AgentPromptOverride.clinic_id.is_(None))
        else:
            q = q.filter(AgentPromptOverride.clinic_id == clinic_id)

    rows = (
        q.order_by(
            AgentPromptOverride.agent_id.asc(),
            AgentPromptOverride.created_at.desc(),
        )
        .all()
    )
    return PromptOverrideListResponse(
        overrides=[_row_to_override(r) for r in rows]
    )


@router.post(
    "/admin/prompt-overrides",
    response_model=PromptOverrideOut,
)
@limiter.limit("10/minute")
def create_prompt_override(
    request: Request,
    payload: PromptOverrideCreateRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> PromptOverrideOut:
    """Admin-only — create a new override row, version-stamped.

    The new row's ``version`` is ``max(existing.version) + 1`` for the
    same ``(agent_id, clinic_id)`` pair, so a chronological listing
    naturally surfaces the active row at the top. Creating a fresh row
    rather than updating in place is deliberate — it preserves prompt
    history and lets us roll back by re-enabling an older row.
    """
    require_minimum_role(actor, "admin")

    if payload.agent_id not in AGENT_REGISTRY:
        raise ApiServiceError(
            code="agent_not_found",
            message=f"No agent is registered with id '{payload.agent_id}'.",
            status_code=404,
        )

    # Bump version off the highest existing for this (agent, clinic) pair.
    q = db.query(AgentPromptOverride).filter(
        AgentPromptOverride.agent_id == payload.agent_id
    )
    if payload.clinic_id is None:
        q = q.filter(AgentPromptOverride.clinic_id.is_(None))
    else:
        q = q.filter(AgentPromptOverride.clinic_id == payload.clinic_id)
    last = q.order_by(AgentPromptOverride.version.desc()).first()
    next_version = (int(last.version) + 1) if last is not None else 1

    row = AgentPromptOverride(
        agent_id=payload.agent_id,
        clinic_id=payload.clinic_id,
        system_prompt=payload.system_prompt,
        version=next_version,
        enabled=bool(payload.enabled),
        created_by=actor.actor_id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _row_to_override(row)


@router.delete(
    "/admin/prompt-overrides/{override_id}",
    response_model=PromptOverrideOut,
)
@limiter.limit("10/minute")
def delete_prompt_override(
    request: Request,
    override_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> PromptOverrideOut:
    """Admin-only — soft-delete by flipping ``enabled`` to ``False``.

    The row is left in the table so the audit trail of who edited what
    survives. The runner's prompt resolver skips disabled rows so the
    LLM falls back to the registry default (or to a still-enabled row
    of a different scope) on the next invocation.
    """
    require_minimum_role(actor, "admin")

    row = (
        db.query(AgentPromptOverride)
        .filter(AgentPromptOverride.id == override_id)
        .first()
    )
    if row is None:
        raise ApiServiceError(
            code="prompt_override_not_found",
            message=f"No prompt override with id '{override_id}'.",
            status_code=404,
        )
    row.enabled = False
    db.commit()
    db.refresh(row)
    return _row_to_override(row)


# ---------------------------------------------------------------------------
# Phase 9 — per-clinic monthly cost cap admin endpoints
# ---------------------------------------------------------------------------


class CostCapOut(BaseModel):
    """One-clinic cost-cap projection for the admin UI.

    ``cap_pence == 0`` means the cap is disabled; ``spend_pence_mtd`` is
    surfaced unconditionally so the admin tile can display the running
    total even when no cap is configured.
    """

    cap_pence: int
    spend_pence_mtd: int
    currency: str = "GBP"


class CostCapUpdateRequest(BaseModel):
    """Body for ``PUT /admin/cost-cap``.

    ``cap_pence`` is a non-negative integer in pence. ``0`` disables the
    cap (allow all); any positive value enforces the monthly ceiling.
    Pydantic's ``ge=0`` constraint produces a 422 on negative input.
    """

    cap_pence: int = Field(..., ge=0)


def _require_clinic_admin(actor: AuthenticatedActor) -> str:
    """Admin-or-above with a clinic scope. Returns the actor's clinic_id."""
    require_minimum_role(actor, "admin")
    if actor.clinic_id is None:
        raise ApiServiceError(
            code="clinic_scope_required",
            message="This endpoint requires a clinic-scoped admin actor.",
            status_code=403,
        )
    return actor.clinic_id


@router.get("/admin/cost-cap", response_model=CostCapOut)
def get_cost_cap(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> CostCapOut:
    """Admin-only — return the calling clinic's cost cap + MTD spend."""
    clinic_id = _require_clinic_admin(actor)
    cap = cost_cap_service.get_cap_pence(db, clinic_id)
    spend = cost_cap_service.month_to_date_spend_pence(db, clinic_id)
    return CostCapOut(
        cap_pence=int(cap or 0),
        spend_pence_mtd=spend,
    )


@router.put("/admin/cost-cap", response_model=CostCapOut)
@limiter.limit("10/minute")
def upsert_cost_cap(
    request: Request,
    payload: CostCapUpdateRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> CostCapOut:
    """Admin-only — set the calling clinic's monthly cost cap.

    ``cap_pence == 0`` disables enforcement (allow all). The row is
    upserted in place so an admin tile rendering the cap always sees a
    deterministic single row.
    """
    clinic_id = _require_clinic_admin(actor)

    row = (
        db.query(ClinicMonthlyCostCap)
        .filter(ClinicMonthlyCostCap.clinic_id == clinic_id)
        .first()
    )
    if row is None:
        row = ClinicMonthlyCostCap(
            clinic_id=clinic_id,
            cap_pence=int(payload.cap_pence),
            updated_by_id=actor.actor_id,
        )
        db.add(row)
    else:
        row.cap_pence = int(payload.cap_pence)
        row.updated_by_id = actor.actor_id
    db.commit()
    db.refresh(row)

    spend = cost_cap_service.month_to_date_spend_pence(db, clinic_id)
    return CostCapOut(
        cap_pence=int(row.cap_pence or 0),
        spend_pence_mtd=spend,
    )


__all__ = ["router"]
