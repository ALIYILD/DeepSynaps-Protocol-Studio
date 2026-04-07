from deepsynaps_condition_registry import get_condition_profile
from deepsynaps_core_schema import (
    IntakePreviewRequest,
    IntakePreviewResponse,
    IntakeSummary,
    SupportStatus,
)
from deepsynaps_device_registry import get_device_profile
from deepsynaps_generation_engine import build_clinician_handbook_plan, build_protocol_plan
from deepsynaps_modality_registry import get_modality_profile
from deepsynaps_safety_engine import validate_modality_device

from app.errors import ApiServiceError


def build_intake_preview(payload: IntakePreviewRequest) -> IntakePreviewResponse:
    try:
        condition = get_condition_profile(payload.condition_slug)
        modality = get_modality_profile(payload.modality_slug)
        device = get_device_profile(payload.device_slug)
    except FileNotFoundError as exc:
        raise ApiServiceError(
            code="unsupported_selection",
            message="One or more selected references are not available in the registry.",
            warnings=[str(exc)],
            status_code=404,
        ) from exc

    compatibility = validate_modality_device(modality, device)
    if not compatibility.is_compatible:
        raise ApiServiceError(
            code="unsupported_combination",
            message="The selected modality and device are not supported together.",
            warnings=compatibility.reasons,
        )

    protocol = build_protocol_plan(
        condition,
        modality,
        device,
        payload.phenotype,
        compatibility,
    )
    handbook = build_clinician_handbook_plan(condition, modality, device, payload.phenotype)

    return IntakePreviewResponse(
        intake_summary=IntakeSummary(
            condition_name=condition.name,
            condition_slug=condition.slug,
            phenotype=payload.phenotype,
            modality_name=modality.name,
            modality_slug=modality.slug,
            device_name=device.name,
            device_slug=device.slug,
        ),
        support_status=SupportStatus(
            status="supported",
            message="Selected condition, modality, and device are supported for this scaffold.",
        ),
        warnings=[*condition.contraindications, *modality.safety_notes, *device.notes],
        protocol_plan=protocol,
        clinician_handbook_plan=handbook,
    )
