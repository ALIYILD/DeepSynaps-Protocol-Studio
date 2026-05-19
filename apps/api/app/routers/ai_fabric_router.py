from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends

from app.auth import AuthenticatedActor, get_authenticated_actor, require_minimum_role
from app.errors import ApiServiceError
from app.services.ai_fabric import (
    AIGovernance,
    AIHealthChecker,
    AIInferenceRequest,
    AIInferenceResponse,
    AIModelCapability,
    AIModelDescriptor,
    AIModelTier,
    AIProviderFactory,
    get_registry,
)

router = APIRouter(prefix="/api/v1/ai-fabric", tags=["ai-fabric"])

_governance = AIGovernance()
_health_checker = AIHealthChecker()
_provider_factory = AIProviderFactory()


def _require_clinician(actor: AuthenticatedActor) -> None:
    require_minimum_role(actor, "clinician")


def _get_descriptor(model_id: str) -> AIModelDescriptor:
    registry = get_registry()
    try:
        return registry.get(model_id)
    except KeyError as exc:
        raise ApiServiceError(
            code="model_not_found",
            message=f"AI Fabric model '{model_id}' was not found.",
            status_code=404,
        ) from exc


def _tier_metadata() -> list[dict[str, str]]:
    return [
        {
            "tier": AIModelTier.EDGE_REALTIME.value,
            "label": "Edge Realtime",
            "description": "Low-latency edge execution for near-device inference.",
        },
        {
            "tier": AIModelTier.GPU_MEDICAL.value,
            "label": "GPU Medical",
            "description": "GPU-backed research and imaging workloads with explicit governance.",
        },
        {
            "tier": AIModelTier.CLOUD_LLM.value,
            "label": "Cloud LLM",
            "description": "Language-model orchestration for grounded synthesis and entity extraction.",
        },
    ]


@router.get("/models", response_model=list[AIModelDescriptor])
def list_models(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> list[AIModelDescriptor]:
    _require_clinician(actor)
    registry = get_registry()
    rows = registry.list()
    for row in rows:
        row.health = _health_checker.check_model(row)
    return rows


@router.get("/models/{model_id}", response_model=AIModelDescriptor)
def get_model(
    model_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> AIModelDescriptor:
    _require_clinician(actor)
    descriptor = _get_descriptor(model_id)
    descriptor.health = _health_checker.check_model(descriptor)
    return descriptor


@router.get("/capabilities")
def list_capabilities(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> list[dict[str, Any]]:
    _require_clinician(actor)
    registry = get_registry()
    capability_map = {
        capability: len(registry.filter(capability=capability))
        for capability in AIModelCapability
    }
    return [
        {
            "capability": capability.value,
            "label": capability.value.replace("_", " ").title(),
            "model_count": capability_map[capability],
        }
        for capability in AIModelCapability
    ]


@router.get("/health")
def list_health(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> list[dict[str, Any]]:
    _require_clinician(actor)
    registry = get_registry()
    return [
        {
            "model_id": descriptor.model_id,
            "name": descriptor.name,
            "health": _health_checker.check_model(descriptor),
        }
        for descriptor in registry.list()
    ]


@router.get("/health/{model_id}")
def get_health(
    model_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    _require_clinician(actor)
    descriptor = _get_descriptor(model_id)
    return {
        "model_id": descriptor.model_id,
        "name": descriptor.name,
        "health": _health_checker.check_model(descriptor),
    }


@router.post("/dry-run", response_model=AIInferenceResponse)
def dry_run_inference(
    body: AIInferenceRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> AIInferenceResponse:
    _require_clinician(actor)
    descriptor = _get_descriptor(body.model_id)
    _governance.validate_request(descriptor, body, allow_disabled=True)
    provider = _provider_factory.create(body.model_id)
    response = provider.dry_run(body)
    safe_output, flags = _governance.enforce_safety_boundaries(response.output)
    response.output = safe_output
    if flags:
        response.warnings.append("Autonomous language guard triggered during safety enforcement.")
        response.provenance.safety_flags.extend(flags)
    return response


@router.get("/tiers")
def list_tiers(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> list[dict[str, str]]:
    _require_clinician(actor)
    return _tier_metadata()


@router.get("/registry/summary")
def registry_summary(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, object]:
    _require_clinician(actor)
    return get_registry().summary()


@router.get("/providers")
def provider_status(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> list[dict[str, str | bool]]:
    _require_clinician(actor)
    return _provider_factory.list_status()
