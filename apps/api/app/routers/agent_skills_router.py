"""Agent skills router — admin-configurable AI Practice Agent skill catalogue.

Backs the AI Practice Agents page (`pgAgentChat` in
`apps/web/src/pages-agents.js`). The bundled CLINICIAN_SKILLS constant in
that file is kept as a read-only fallback for offline / API-down scenarios;
rows here are the source of truth otherwise.

Auth model:
- Admins see every row (enabled or not) and may CRUD.
- Clinicians see enabled rows only.
- Anyone below clinician (guest / patient) is denied.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from deepsynaps_core_schema import (
    CuratedClinicalLayerResponse,
    CuratedClinicalLayerUseCaseOut,
    OpenClawCuratedSkillCatalogResponse,
    OpenClawCuratedSkillOut,
    OpenClawWrapperDefaultsOut,
)
from sqlalchemy import select
from sqlalchemy.orm import Session

from deepsynaps_safety_engine import (
    GOVERNANCE_POLICY_REF,
    SAFETY_ENGINE_WRAPPER_VERSION,
    CuratedSkillDefinition,
    get_allowlisted_openclaw_skills,
    get_rejected_openclaw_skills,
)

from app.auth import AuthenticatedActor, get_authenticated_actor, require_minimum_role
from app.database import get_db_session
from app.errors import ApiServiceError
from app.persistence.models import AgentSkill
from app.services.curated_clinical_skills_layer import (
    CuratedLayerUseCase,
    get_curated_clinical_layer_use_case,
    list_curated_clinical_layer_use_cases,
)

router = APIRouter(prefix="/api/v1/agent-skills", tags=["agent-skills"])


# ── Constants ─────────────────────────────────────────────────────────────────

_CATEGORY_ID_MAX = 64
_LABEL_MAX = 120
_CATEGORY_MAX = 40
_ICON_MAX = 16
# Generous cap — a skill's run_payload may eventually carry tool-call schemas
# alongside the prompt. Keep it bounded to protect the DB from abuse.
_PAYLOAD_MAX = 50_000


# ── Schemas ───────────────────────────────────────────────────────────────────


# Pydantic field caps. Pre-fix every str field was uncapped at the
# schema layer (the runtime ``_validate`` helper enforced the label
# cap but only after model parse, and ``description``/``icon`` had
# no cap at all). DoS via megabyte free-text is closed here.
_DESCRIPTION_MAX = 4_000
_ICON_MAX = 200


class AgentSkillCreate(BaseModel):
    category_id: str = Field(..., max_length=_CATEGORY_ID_MAX)
    label: str = Field(..., max_length=_LABEL_MAX)
    description: str = Field(default="", max_length=_DESCRIPTION_MAX)
    icon: str = Field(default="", max_length=_ICON_MAX)
    # ``Field(default_factory=dict)`` so each request body gets a fresh
    # dict; the bare ``= {}`` literal would have shared one mutable
    # object across calls.
    run_payload: dict[str, Any] = Field(default_factory=dict)
    enabled: bool = True
    sort_order: int = 0


class AgentSkillUpdate(BaseModel):
    category_id: Optional[str] = Field(default=None, max_length=_CATEGORY_ID_MAX)
    label: Optional[str] = Field(default=None, max_length=_LABEL_MAX)
    description: Optional[str] = Field(default=None, max_length=_DESCRIPTION_MAX)
    icon: Optional[str] = Field(default=None, max_length=_ICON_MAX)
    run_payload: Optional[dict[str, Any]] = None
    enabled: Optional[bool] = None
    sort_order: Optional[int] = None


class AgentSkillOut(BaseModel):
    id: str
    category_id: str
    label: str
    description: str
    icon: str
    run_payload: dict[str, Any]
    enabled: bool
    sort_order: int
    created_at: str
    updated_at: str


class AgentSkillListResponse(BaseModel):
    items: list[AgentSkillOut]
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


def _record_to_out(record: AgentSkill) -> AgentSkillOut:
    return AgentSkillOut(
        id=record.id,
        category_id=record.category_id,
        label=record.label,
        description=record.description or "",
        icon=record.icon or "",
        run_payload=_decode_payload(record.run_payload_json),
        enabled=bool(record.enabled),
        sort_order=record.sort_order or 0,
        created_at=record.created_at.isoformat(),
        updated_at=record.updated_at.isoformat(),
    )


def _curated_openclaw_skill_to_out(
    definition: CuratedSkillDefinition,
) -> OpenClawCuratedSkillOut:
    return OpenClawCuratedSkillOut(
        source_skill_name=definition.source_skill_name,
        domain=definition.domain,
        status=definition.status,
        license_note=definition.license_note,
        rationale=definition.rationale,
        patient_facing_default_allowed=definition.patient_facing_default_allowed,
        notes=list(definition.notes),
        wrapper_defaults=OpenClawWrapperDefaultsOut(
            requires_clinician_review=True,
            governance_policy_ref=GOVERNANCE_POLICY_REF,
            wrapper_version=SAFETY_ENGINE_WRAPPER_VERSION,
        ),
    )


def _curated_layer_use_case_to_out(
    definition: CuratedLayerUseCase,
) -> CuratedClinicalLayerUseCaseOut:
    return CuratedClinicalLayerUseCaseOut(
        id=definition.id,
        label=definition.label,
        summary=definition.summary,
        execution_mode=definition.execution_mode,
        allowed_source_skills=list(definition.allowed_source_skills),
        native_backing_services=list(definition.native_backing_services),
        supported_claim_types=list(definition.supported_claim_types),
        patient_facing_possible=definition.patient_facing_possible,
        requires_citations=definition.requires_citations,
        notes=list(definition.notes),
        wrapper_defaults=OpenClawWrapperDefaultsOut(
            requires_clinician_review=True,
            governance_policy_ref=GOVERNANCE_POLICY_REF,
            wrapper_version=SAFETY_ENGINE_WRAPPER_VERSION,
        ),
    )


def _validate(
    *,
    label: Optional[str],
    category_id: Optional[str],
    icon: Optional[str],
    payload: Optional[dict[str, Any]],
) -> None:
    if label is not None:
        cleaned = label.strip()
        if not cleaned:
            raise ApiServiceError(code="invalid_label", message="Skill label is required.", status_code=422)
        if len(cleaned) > _LABEL_MAX:
            raise ApiServiceError(code="invalid_label", message=f"Skill label exceeds {_LABEL_MAX} characters.", status_code=422)
    if category_id is not None:
        cleaned = category_id.strip()
        if not cleaned:
            raise ApiServiceError(code="invalid_category", message="Category id is required.", status_code=422)
        if len(cleaned) > _CATEGORY_MAX:
            raise ApiServiceError(code="invalid_category", message=f"Category id exceeds {_CATEGORY_MAX} characters.", status_code=422)
    if icon is not None and len(icon) > _ICON_MAX:
        raise ApiServiceError(code="invalid_icon", message=f"Icon exceeds {_ICON_MAX} characters.", status_code=422)
    if payload is not None:
        encoded = _encode_payload(payload)
        if len(encoded) > _PAYLOAD_MAX:
            raise ApiServiceError(code="payload_too_large", message=f"Run payload exceeds {_PAYLOAD_MAX} bytes.", status_code=422)


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.get("", response_model=AgentSkillListResponse)
def list_agent_skills(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> AgentSkillListResponse:
    """List skills. Admins see all rows; clinicians only see enabled rows."""
    require_minimum_role(actor, "clinician")
    query = select(AgentSkill).order_by(AgentSkill.sort_order.asc(), AgentSkill.label.asc())
    if actor.role != "admin":
        query = query.where(AgentSkill.enabled == True)  # noqa: E712 — SQL boolean
    rows = session.scalars(query).all()
    items = [_record_to_out(r) for r in rows]
    return AgentSkillListResponse(items=items, total=len(items))


@router.get("/openclaw-curated", response_model=OpenClawCuratedSkillCatalogResponse)
def list_curated_openclaw_skills(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> OpenClawCuratedSkillCatalogResponse:
    """List the reviewed OpenClaw skills DeepSynaps may integrate safely.

    This is a read-only registry view backed by the safety engine's curated
    allowlist / reject list. It does not enable runtime execution by itself.
    """
    require_minimum_role(actor, "clinician")
    allowlisted = [
        _curated_openclaw_skill_to_out(row) for row in get_allowlisted_openclaw_skills()
    ]
    rejected = [
        _curated_openclaw_skill_to_out(row) for row in get_rejected_openclaw_skills()
    ]
    return OpenClawCuratedSkillCatalogResponse(
        allowlisted=allowlisted,
        rejected=rejected,
        allowlisted_total=len(allowlisted),
        rejected_total=len(rejected),
    )


@router.get("/openclaw-curated/layer", response_model=CuratedClinicalLayerResponse)
def list_curated_clinical_skill_layer(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> CuratedClinicalLayerResponse:
    """List the DeepSynaps-native curated clinical skill layer use-cases."""
    require_minimum_role(actor, "clinician")
    use_cases = [
        _curated_layer_use_case_to_out(row)
        for row in list_curated_clinical_layer_use_cases()
    ]
    return CuratedClinicalLayerResponse(use_cases=use_cases, total=len(use_cases))


@router.post("", response_model=AgentSkillOut, status_code=201)
def create_agent_skill(
    body: AgentSkillCreate,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> AgentSkillOut:
    """Create a skill. Admin only."""
    require_minimum_role(actor, "admin")
    _validate(label=body.label, category_id=body.category_id, icon=body.icon, payload=body.run_payload)
    record = AgentSkill(
        category_id=body.category_id.strip(),
        label=body.label.strip(),
        description=body.description or "",
        icon=body.icon or "",
        run_payload_json=_encode_payload(body.run_payload),
        enabled=body.enabled,
        sort_order=body.sort_order or 0,
    )
    session.add(record)
    session.commit()
    session.refresh(record)
    return _record_to_out(record)


@router.patch("/{skill_id}", response_model=AgentSkillOut)
def update_agent_skill(
    skill_id: str,
    body: AgentSkillUpdate,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> AgentSkillOut:
    """Update fields on a skill. Admin only."""
    require_minimum_role(actor, "admin")
    record = session.scalar(select(AgentSkill).where(AgentSkill.id == skill_id))
    if record is None:
        raise ApiServiceError(code="not_found", message="Agent skill not found.", status_code=404)
    _validate(label=body.label, category_id=body.category_id, icon=body.icon, payload=body.run_payload)
    if body.category_id is not None:
        record.category_id = body.category_id.strip()
    if body.label is not None:
        record.label = body.label.strip()
    if body.description is not None:
        record.description = body.description
    if body.icon is not None:
        record.icon = body.icon
    if body.run_payload is not None:
        record.run_payload_json = _encode_payload(body.run_payload)
    if body.enabled is not None:
        record.enabled = body.enabled
    if body.sort_order is not None:
        record.sort_order = body.sort_order
    record.updated_at = datetime.now(timezone.utc)
    session.commit()
    session.refresh(record)
    return _record_to_out(record)


@router.delete("/{skill_id}", status_code=204)
def delete_agent_skill(
    skill_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> None:
    """Soft-delete a skill (sets enabled=false). Admin only.

    Soft over hard so the row can be re-enabled and so that any downstream
    references (e.g. usage analytics) remain resolvable.
    """
    require_minimum_role(actor, "admin")
    record = session.scalar(select(AgentSkill).where(AgentSkill.id == skill_id))
    if record is None:
        raise ApiServiceError(code="not_found", message="Agent skill not found.", status_code=404)
    record.enabled = False
    record.updated_at = datetime.now(timezone.utc)
    session.commit()
