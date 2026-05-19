"""Tier 1 MedRAG router — evidence retrieval layer (stub).

Endpoints:

- GET  /api/v1/ai/medrag/health  — service health (any auth role)
- POST /api/v1/ai/medrag/query   — evidence-grounded query (clinician+)

MedRAG sits between the Tier 1 clinical-reasoning LLM and the existing
evidence DB. Downstream callers feed the returned citations into
``ClinicalReasoningRequest.context`` as evidence grounding.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends

from app.auth import AuthenticatedActor, get_authenticated_actor, require_minimum_role
from app.services.ai.tier1_medrag import (
    MEDRAG_DISCLAIMER,
    MedragHealthResponse,
    MedragQueryRequest,
    MedragQueryResponse,
    get_retriever,
)

router = APIRouter(prefix="/api/v1/ai/medrag", tags=["ai-tier1-medrag"])


@router.get("/health", response_model=MedragHealthResponse)
def get_medrag_health(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> MedragHealthResponse:
    """Service health. Any authenticated role may probe."""
    return get_retriever().health()


@router.post("/query", response_model=MedragQueryResponse)
async def post_medrag_query(
    request: MedragQueryRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> MedragQueryResponse:
    """Evidence-grounded retrieval. Clinician-or-above role required.

    Stub mode: returns ``stub: True, answer: None, citations: []`` with
    the canonical disclaimer. Real embedding + DB lookup lands in a
    follow-up PR.
    """
    require_minimum_role(actor, "clinician")
    response = await get_retriever().query(request)
    if not response.disclaimer:
        response = response.model_copy(update={"disclaimer": MEDRAG_DISCLAIMER})
    return response
