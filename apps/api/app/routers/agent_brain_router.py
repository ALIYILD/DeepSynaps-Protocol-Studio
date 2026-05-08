"""Clinical Agent Brain router — uniform entry point for AI surfaces.

Endpoints:

- GET  /api/v1/agent-brain/status     — service + per-provider health
- GET  /api/v1/agent-brain/providers  — provider manifests
- POST /api/v1/agent-brain/query      — call a provider, role-gated, optionally audited
- POST /api/v1/agent-brain/memory     — append a non-PHI operational note (gated; off by default)

The router enforces `allowed_roles` BEFORE delegating to the provider, and
writes an audit event for providers whose manifest declares `requires_audit`.
"""
from __future__ import annotations

import logging
from typing import Any, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, get_authenticated_actor
from app.database import get_db_session
from app.errors import ApiServiceError
from app.services.agent_brain.audit import record_query
from app.services.agent_brain.registry import (
    MVP_PROVIDER_NAMES,
    list_provider_manifests,
    get_provider,
    overall_status,
)
from app.services.agent_brain.safety import (
    FORBIDDEN_AUTONOMOUS_PHRASES,
    denied_response,
    looks_like_phi,
    safe_fallback,
)
from app.services.agent_brain.schemas import (
    ProviderManifest,
    ProviderQuery,
    ProviderResponse,
)

router = APIRouter(prefix="/api/v1/agent-brain", tags=["agent-brain"])

_log = logging.getLogger(__name__)


class StatusResponse(BaseModel):
    model_config = ConfigDict(extra="allow")
    service: str
    version: str
    providers_total: int
    providers_configured: int
    providers_mvp: list[str]
    safety_mode: str
    providers: list[dict[str, Any]]


class ProvidersResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    items: list[ProviderManifest]
    total: int
    mvp: list[str] = Field(default_factory=lambda: list(MVP_PROVIDER_NAMES))


class MemoryWriteRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    note: str
    tags: list[str] = Field(default_factory=list)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _scan_for_forbidden(response: ProviderResponse) -> ProviderResponse:
    """Defense-in-depth: scan the answer string for forbidden autonomous-claim
    phrases. If one is detected, suppress the answer and add a safety flag.

    This is paranoid — providers in this MVP are deterministic and do not
    generate free text, so this guard only fires on bugs or future LLM-backed
    providers that slipped a forbidden phrase past their own filters.
    """
    answer_lower = (response.answer or "").lower()
    if any(phrase in answer_lower for phrase in FORBIDDEN_AUTONOMOUS_PHRASES):
        return response.model_copy(
            update={
                "answer": (
                    "Provider response was suppressed because it contained a "
                    "forbidden autonomous-claim phrase. Clinician review is "
                    "required."
                ),
                "safety_flags": list(response.safety_flags) + ["forbidden_phrase_suppressed"],
                "requires_clinician_review": True,
                "patient_facing_allowed": False,
            }
        )
    return response


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/status", response_model=StatusResponse)
def get_status(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> StatusResponse:
    """Service + per-provider health. No PHI; safe for any authenticated role.
    Anonymous (`guest`) actors also see this — useful for environment probes.
    """
    payload = overall_status()
    return StatusResponse(**payload)  # type: ignore[arg-type]


@router.get("/providers", response_model=ProvidersResponse)
def get_providers(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> ProvidersResponse:
    """Provider manifests. Frontend pages introspect this to render an honest
    "which providers are wired" UI."""
    manifests = list_provider_manifests()
    return ProvidersResponse(items=manifests, total=len(manifests))


@router.post("/query", response_model=ProviderResponse)
def post_query(
    request: ProviderQuery,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> ProviderResponse:
    """Dispatch a query to a named provider after role + audit checks."""
    provider = get_provider(request.provider)
    if provider is None:
        return safe_fallback(
            provider=request.provider,
            query=request.query,
            status="error",
            answer=f"Unknown provider: '{request.provider}'.",
            safety_flags=["unknown_provider"],
            missing_requirements=["provider_not_in_registry"],
        )

    manifest = provider.manifest()

    if actor.role not in manifest.allowed_roles:
        return denied_response(
            provider=request.provider,
            query=request.query,
            reason=(
                f"role '{actor.role}' is not in allowed_roles "
                f"({', '.join(manifest.allowed_roles)})"
            ),
        )

    audit_event_id: Optional[str] = None
    if manifest.requires_audit:
        audit_event_id = record_query(
            session=session,
            actor_id=actor.actor_id,
            actor_role=actor.role,
            provider_name=request.provider,
            target_id=request.patient_id or request.condition or "agent-brain",
            note=(request.query or "")[:240],
        )

    try:
        response = provider.query(
            request,
            actor_id=actor.actor_id,
            actor_role=actor.role,
            session=session,
        )
    except ApiServiceError:
        raise
    except Exception as exc:
        _log.exception("agent_brain_provider_failed: %s", request.provider)
        response = safe_fallback(
            provider=request.provider,
            query=request.query,
            status="error",
            answer=f"Provider '{request.provider}' raised {type(exc).__name__}.",
            safety_flags=["provider_exception"],
            missing_requirements=[type(exc).__name__],
        )

    response = _scan_for_forbidden(response)

    if audit_event_id is not None:
        response = response.model_copy(update={"audit_event_id": audit_event_id})

    return response


@router.post("/memory", response_model=ProviderResponse)
def post_memory(
    request: MemoryWriteRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> ProviderResponse:
    """Append an operational note to agent memory. Gated:

    - `agent_memory` provider must be `configured` (env flag).
    - actor role must be in `agent_memory.allowed_roles` (clinician/admin/supervisor).
    - payload is rejected if it contains PHI-shaped keys.
    """
    provider = get_provider("agent_memory")
    if provider is None:
        return safe_fallback(
            provider="agent_memory",
            query=request.note,
            status="not_configured",
            missing_requirements=["agent_memory_not_in_registry"],
        )

    manifest = provider.manifest()

    if actor.role not in manifest.allowed_roles:
        return denied_response(
            provider="agent_memory",
            query=request.note,
            reason=(
                f"role '{actor.role}' cannot write agent memory; "
                f"allowed: {', '.join(manifest.allowed_roles)}"
            ),
        )

    payload = request.model_dump()
    if looks_like_phi(payload):
        return safe_fallback(
            provider="agent_memory",
            query=request.note,
            status="denied",
            answer="Refusing to store note: payload looks like PHI.",
            safety_flags=["phi_payload_rejected"],
            missing_requirements=["phi_in_payload"],
        )

    # Record audit BEFORE the write so even a failed write is traceable.
    audit_event_id = record_query(
        session=session,
        actor_id=actor.actor_id,
        actor_role=actor.role,
        provider_name="agent_memory",
        target_id="agent-brain",
        note=f"write_note: {request.note[:200]}",
    )

    response = provider.write_note(  # type: ignore[attr-defined]
        note=request.note,
        tags=list(request.tags),
        actor_id=actor.actor_id,
        actor_role=actor.role,
    )
    response = _scan_for_forbidden(response)
    return response.model_copy(update={"audit_event_id": audit_event_id})
