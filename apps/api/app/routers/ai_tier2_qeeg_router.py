"""Tier 2 qEEG router — GPU/CPU inference adapter (EEGNet + BIOT, stub).

Endpoints:

- GET  /api/v1/ai/qeeg/health   — runtime + model health (any auth)
- GET  /api/v1/ai/qeeg/models   — model registry (any auth)
- POST /api/v1/ai/qeeg/infer    — run a single inference (clinician+)

This adapter sits BELOW the existing ``qeeg_ai_router``; once the
follow-up PR wires real ONNX Runtime weights, ``qeeg_ai_router`` can
delegate to this adapter for the low-level inference call.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict

from app.auth import AuthenticatedActor, get_authenticated_actor, require_minimum_role
from app.services.ai.tier2_qeeg import (
    QEEG_DISCLAIMER,
    QeegHealthResponse,
    QeegInferenceRequest,
    QeegInferenceResponse,
    get_runner,
    list_models,
)
from app.services.ai.tier2_qeeg.model_registry import QeegModelMeta

router = APIRouter(prefix="/api/v1/ai/qeeg", tags=["ai-tier2-qeeg"])


# core-schema-exempt: router-local response shape; the canonical envelopes
# are in app.services.ai.tier2_qeeg.schemas.
class QeegModelsResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    items: list[QeegModelMeta]
    total: int


@router.get("/health", response_model=QeegHealthResponse)
def get_qeeg_health(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> QeegHealthResponse:
    """Runtime health. Any authenticated role may probe."""
    return get_runner().health()


@router.get("/models", response_model=QeegModelsResponse)
def get_qeeg_models(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> QeegModelsResponse:
    """Model registry. Returns metadata only — never weight bytes."""
    items = list_models()
    return QeegModelsResponse(items=items, total=len(items))


@router.post("/infer", response_model=QeegInferenceResponse)
def post_qeeg_infer(
    request: QeegInferenceRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> QeegInferenceResponse:
    """Run a single inference. Clinician-or-above role required.

    Stub mode: returns ``stub: True, predictions: None`` with the
    canonical disclaimer. Real ONNX execution lands in a follow-up PR.
    """
    require_minimum_role(actor, "clinician")
    response = get_runner().run(request)
    if not response.disclaimer:
        response = response.model_copy(update={"disclaimer": QEEG_DISCLAIMER})
    return response
