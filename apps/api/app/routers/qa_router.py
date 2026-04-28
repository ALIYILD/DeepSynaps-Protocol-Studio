"""QA scoring API router for DeepSynaps Studio."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.auth import AuthenticatedActor, get_authenticated_actor, require_minimum_role
from app.limiter import limiter
from deepsynaps_qa.audit import emit_audit_record
from deepsynaps_qa.demotion import apply_demotion, should_demote
from deepsynaps_qa.engine import QAEngine
from deepsynaps_qa.models import (
    Artifact,
    DemotionEvent,
    QAAuditEntry,
    QAResult,
)
from deepsynaps_qa.specs import SPEC_REGISTRY, get_spec, list_specs

router = APIRouter(prefix="/api/v1/qa", tags=["qa"])

_engine = QAEngine()


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------

class QARunRequest(BaseModel):
    """Request body for POST /api/v1/qa/run."""

    artifact: Artifact
    spec_id: str = Field(
        ..., description="Spec ID, e.g. 'spec:qeeg_narrative_v1'"
    )
    operator: str = Field(default="", description="User or service account ID")


class QARunResponse(BaseModel):
    """Response body for POST /api/v1/qa/run."""

    result: QAResult
    audit_entry: QAAuditEntry
    demotion: DemotionEvent | None = None


class SpecListItem(BaseModel):
    spec_id: str
    artifact_type: str
    required_sections: list[str]
    citation_floor: int


class SpecListResponse(BaseModel):
    specs: list[SpecListItem]


class CheckListItem(BaseModel):
    category: str
    class_name: str


class CheckListResponse(BaseModel):
    checks: list[CheckListItem]


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/run", response_model=QARunResponse)
@limiter.limit("30/minute")
def qa_run(
    payload: QARunRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> QARunResponse:
    """Run QA on an artifact and return score, verdict, and audit record."""
    require_minimum_role(actor, "clinician")
    spec = get_spec(payload.spec_id)
    if spec is None:
        raise HTTPException(
            status_code=422,
            detail=f"Unknown spec ID '{payload.spec_id}'. "
            f"Available: {', '.join(SPEC_REGISTRY.keys())}",
        )

    result = _engine.run(payload.artifact, spec)
    audit_entry = emit_audit_record(result, operator=payload.operator)

    # Check for auto-demotion
    demotion = None
    demote, trigger = should_demote(result)
    if demote:
        demotion = apply_demotion(
            artifact_id=payload.artifact.artifact_id,
            trigger=trigger,
            qa_run_id=result.run_id,
            operator=payload.operator,
        )

    return QARunResponse(
        result=result,
        audit_entry=audit_entry,
        demotion=demotion,
    )


@router.get("/specs", response_model=SpecListResponse)
def qa_specs(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> SpecListResponse:
    """List all available QA specs."""
    require_minimum_role(actor, "clinician")
    items = []
    for s in list_specs():
        items.append(
            SpecListItem(
                spec_id=s.spec_id,
                artifact_type=s.artifact_type.value,
                required_sections=s.required_sections,
                citation_floor=s.citation_floor,
            )
        )
    return SpecListResponse(specs=items)


@router.get("/checks", response_model=CheckListResponse)
def qa_checks(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> CheckListResponse:
    """List all registered check classes."""
    require_minimum_role(actor, "clinician")
    from deepsynaps_qa.checks import CheckRegistry, _ensure_checks_imported

    _ensure_checks_imported()
    items = []
    for cat, classes in sorted(CheckRegistry.all_checks().items()):
        for cls in classes:
            items.append(CheckListItem(category=cat, class_name=cls.__name__))
    return CheckListResponse(checks=items)
