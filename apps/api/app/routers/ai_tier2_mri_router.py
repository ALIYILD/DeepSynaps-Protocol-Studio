"""Tier 2 MRI router — segmentation pipeline orchestrator (stub).

Endpoints:

- GET  /api/v1/ai/mri/health         — runtime + pipeline health (any auth)
- GET  /api/v1/ai/mri/pipelines      — pipeline registry (any auth)
- POST /api/v1/ai/mri/jobs           — submit a segmentation job (clinician+)
- GET  /api/v1/ai/mri/jobs/{job_id}  — read job status (clinician+)
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict

from app.auth import AuthenticatedActor, get_authenticated_actor, require_minimum_role
from app.services.ai.tier2_mri import (
    MRI_DISCLAIMER,
    MriHealthResponse,
    MriJobRequest,
    MriJobResponse,
    get_pipeline,
    list_pipelines,
)
from app.services.ai.tier2_mri.pipeline_registry import MriPipelineMeta

router = APIRouter(prefix="/api/v1/ai/mri", tags=["ai-tier2-mri"])


# core-schema-exempt: router-local response shape; the canonical envelopes
# are in app.services.ai.tier2_mri.schemas.
class MriPipelinesResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    items: list[MriPipelineMeta]
    total: int


@router.get("/health", response_model=MriHealthResponse)
def get_mri_health(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> MriHealthResponse:
    """Runtime health. Any authenticated role may probe."""
    return get_pipeline().health()


@router.get("/pipelines", response_model=MriPipelinesResponse)
def get_mri_pipelines(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> MriPipelinesResponse:
    """Pipeline registry. Returns metadata only — never binary bytes."""
    items = list_pipelines()
    return MriPipelinesResponse(items=items, total=len(items))


@router.post("/jobs", response_model=MriJobResponse)
def post_mri_job(
    request: MriJobRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> MriJobResponse:
    """Submit a single segmentation job. Clinician-or-above required.

    Stub mode: returns ``stub: True, status: 'stub', stage: 'queued'``
    with a fresh UUID. No real processing is started.
    """
    require_minimum_role(actor, "clinician")
    response = get_pipeline().submit(request)
    if not response.disclaimer:
        response = response.model_copy(update={"disclaimer": MRI_DISCLAIMER})
    return response


@router.get("/jobs/{job_id}", response_model=MriJobResponse)
def get_mri_job(
    job_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> MriJobResponse:
    """Read job status. Clinician-or-above required.

    Stub mode: returns ``stub: True, status: 'stub', stage: 'queued'``
    for any ``job_id`` (no persistence yet).
    """
    require_minimum_role(actor, "clinician")
    response = get_pipeline().get_status(job_id)
    if not response.disclaimer:
        response = response.model_copy(update={"disclaimer": MRI_DISCLAIMER})
    return response
