"""Per-clinic agent configuration router.

Endpoints:
- GET  /api/v1/agent-config/{agent_id}        — get clinic's config for an agent
- PUT  /api/v1/agent-config/{agent_id}        — upsert clinic's config for an agent
- GET  /api/v1/agent-config/defaults/{agent_id} — get default config from AGENT_REGISTRY
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from app.auth import (
    AuthenticatedActor,
    get_authenticated_actor,
    require_minimum_role,
)
from app.database import get_db_session
from app.errors import ApiServiceError
from app.persistence.models import AgentConfig
from app.services.agents.registry import AGENT_REGISTRY

router = APIRouter(prefix="/api/v1/agent-config", tags=["agent-config"])


# ---------------------------------------------------------------------------
# Request / response schemas
# ---------------------------------------------------------------------------


class ConfigUpsertRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    config: dict


class ConfigResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    agent_id: str
    config: dict
    updated_at: str | None


class DefaultConfigResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    agent_id: str
    config: dict


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/{agent_id}", response_model=ConfigResponse)
def get_agent_config(
    agent_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> ConfigResponse:
    """Get the clinic's config for this agent.

    Returns the persisted config row if one exists; otherwise returns an
    empty config envelope so the UI can always render a settings panel.
    """
    require_minimum_role(actor, "clinician")

    if actor.clinic_id is None:
        # Clinicians without a clinic bound get the empty-default envelope.
        return ConfigResponse(agent_id=agent_id, config={}, updated_at=None)

    row = (
        db.query(AgentConfig)
        .filter(
            AgentConfig.clinic_id == actor.clinic_id,
            AgentConfig.agent_id == agent_id,
        )
        .first()
    )

    if row is None:
        return ConfigResponse(agent_id=agent_id, config={}, updated_at=None)

    return ConfigResponse(
        agent_id=agent_id,
        config=row.config or {},
        updated_at=row.updated_at.isoformat() if row.updated_at is not None else None,
    )


@router.put("/{agent_id}", response_model=ConfigResponse)
def upsert_agent_config(
    agent_id: str,
    payload: ConfigUpsertRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> ConfigResponse:
    """Upsert the clinic's config for this agent.

    Creates a new row if none exists, otherwise updates the existing row.
    Only clinic admins (and above) may write.
    """
    require_minimum_role(actor, "admin")

    if not isinstance(payload.config, dict):
        raise ApiServiceError(
            code="invalid_config",
            message="config must be a JSON object.",
            status_code=422,
        )

    if actor.clinic_id is None:
        raise ApiServiceError(
            code="no_clinic",
            message="Admin is not bound to a clinic.",
            status_code=400,
        )

    row = (
        db.query(AgentConfig)
        .filter(
            AgentConfig.clinic_id == actor.clinic_id,
            AgentConfig.agent_id == agent_id,
        )
        .first()
    )

    if row is None:
        row = AgentConfig(
            clinic_id=actor.clinic_id,
            agent_id=agent_id,
            config=payload.config,
        )
        db.add(row)
    else:
        row.config = payload.config

    db.commit()
    db.refresh(row)

    return ConfigResponse(
        agent_id=agent_id,
        config=row.config or {},
        updated_at=row.updated_at.isoformat() if row.updated_at is not None else None,
    )


@router.get("/defaults/{agent_id}", response_model=DefaultConfigResponse)
def get_default_config(
    agent_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> DefaultConfigResponse:
    """Return the default config from AGENT_REGISTRY for this agent.

    If the agent has no ``default_config`` attribute, returns an empty dict.
    """
    require_minimum_role(actor, "clinician")

    agent = AGENT_REGISTRY.get(agent_id)
    default_config: dict = {}
    if agent is not None:
        default_config = getattr(agent, "default_config", {}) or {}

    return DefaultConfigResponse(agent_id=agent_id, config=default_config)
