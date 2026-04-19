"""Home task templates router — CRUD for clinician-authored task templates.

Backs the Templates tab on the Tasks page
(`pgHomePrograms` in `apps/web/src/pages-clinical-tools.js`).

The bundled DEFAULT_TEMPLATES + CONDITION_HOME_TEMPLATES (declared in
`apps/web/src/pages-clinical-tools.js` and `home-program-condition-templates.js`)
remain read-only starter content. Rows persisted here are the clinician's own
overrides + new templates that previously only lived in
`localStorage['ds_home_task_templates']`.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, get_authenticated_actor, require_minimum_role
from app.database import get_db_session
from app.errors import ApiServiceError
from app.persistence.models import HomeTaskTemplate

router = APIRouter(prefix="/api/v1/home-task-templates", tags=["home-task-templates"])


# ── Constants ─────────────────────────────────────────────────────────────────

_NAME_MAX = 255
# Mirrors the document-template body cap (200 KB). Plenty for a task template,
# protects the DB from abuse via the JSON payload field.
_PAYLOAD_MAX = 200_000


# ── Schemas ───────────────────────────────────────────────────────────────────


class HomeTaskTemplateCreate(BaseModel):
    name: str
    payload: dict[str, Any] = {}


class HomeTaskTemplateUpdate(BaseModel):
    name: Optional[str] = None
    payload: Optional[dict[str, Any]] = None


class HomeTaskTemplateOut(BaseModel):
    id: str
    owner_id: str
    name: str
    payload: dict[str, Any]
    created_at: str
    updated_at: str


class HomeTaskTemplateListResponse(BaseModel):
    items: list[HomeTaskTemplateOut]
    total: int


# ── Helpers ───────────────────────────────────────────────────────────────────


def _decode_payload(raw: str | None) -> dict[str, Any]:
    if not raw:
        return {}
    try:
        decoded = json.loads(raw)
    except (TypeError, ValueError):
        return {}
    return decoded if isinstance(decoded, dict) else {}


def _encode_payload(payload: dict[str, Any] | None) -> str:
    return json.dumps(payload or {}, ensure_ascii=False, separators=(",", ":"))


def _record_to_out(record: HomeTaskTemplate) -> HomeTaskTemplateOut:
    return HomeTaskTemplateOut(
        id=record.id,
        owner_id=record.owner_id,
        name=record.name,
        payload=_decode_payload(record.payload_json),
        created_at=record.created_at.isoformat(),
        updated_at=record.updated_at.isoformat(),
    )


def _validate(name: Optional[str], payload: Optional[dict[str, Any]]) -> None:
    if name is not None:
        cleaned = name.strip()
        if not cleaned:
            raise ApiServiceError(
                code="invalid_name",
                message="Template name is required.",
                status_code=422,
            )
        if len(cleaned) > _NAME_MAX:
            raise ApiServiceError(
                code="invalid_name",
                message=f"Template name exceeds {_NAME_MAX} characters.",
                status_code=422,
            )
    if payload is not None:
        encoded = _encode_payload(payload)
        if len(encoded) > _PAYLOAD_MAX:
            raise ApiServiceError(
                code="payload_too_large",
                message=f"Template payload exceeds {_PAYLOAD_MAX} bytes.",
                status_code=422,
            )


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.get("", response_model=HomeTaskTemplateListResponse)
def list_home_task_templates(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> HomeTaskTemplateListResponse:
    """List custom home task templates owned by the authenticated clinician."""
    require_minimum_role(actor, "clinician")
    rows = session.scalars(
        select(HomeTaskTemplate)
        .where(HomeTaskTemplate.owner_id == actor.actor_id)
        .order_by(HomeTaskTemplate.updated_at.desc())
    ).all()
    items = [_record_to_out(r) for r in rows]
    return HomeTaskTemplateListResponse(items=items, total=len(items))


@router.post("", response_model=HomeTaskTemplateOut, status_code=201)
def create_home_task_template(
    body: HomeTaskTemplateCreate,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> HomeTaskTemplateOut:
    """Create a new home task template owned by the caller."""
    require_minimum_role(actor, "clinician")
    _validate(body.name, body.payload)
    record = HomeTaskTemplate(
        owner_id=actor.actor_id,
        name=body.name.strip(),
        payload_json=_encode_payload(body.payload),
    )
    session.add(record)
    session.commit()
    session.refresh(record)
    return _record_to_out(record)


@router.patch("/{template_id}", response_model=HomeTaskTemplateOut)
def update_home_task_template(
    template_id: str,
    body: HomeTaskTemplateUpdate,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> HomeTaskTemplateOut:
    """Update name and/or payload of a template owned by the caller."""
    require_minimum_role(actor, "clinician")
    record = session.scalar(
        select(HomeTaskTemplate).where(
            HomeTaskTemplate.id == template_id,
            HomeTaskTemplate.owner_id == actor.actor_id,
        )
    )
    if record is None:
        raise ApiServiceError(
            code="not_found",
            message="Template not found.",
            status_code=404,
        )
    _validate(body.name, body.payload)
    if body.name is not None:
        record.name = body.name.strip()
    if body.payload is not None:
        record.payload_json = _encode_payload(body.payload)
    record.updated_at = datetime.now(timezone.utc)
    session.commit()
    session.refresh(record)
    return _record_to_out(record)


@router.delete("/{template_id}", status_code=204)
def delete_home_task_template(
    template_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> None:
    """Hard-delete a template owned by the caller."""
    require_minimum_role(actor, "clinician")
    record = session.scalar(
        select(HomeTaskTemplate).where(
            HomeTaskTemplate.id == template_id,
            HomeTaskTemplate.owner_id == actor.actor_id,
        )
    )
    if record is None:
        raise ApiServiceError(
            code="not_found",
            message="Template not found.",
            status_code=404,
        )
    session.delete(record)
    session.commit()
