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
from deepsynaps_safety_engine import (
    apply_governance_rules,
    check_contraindications,
    validate_modality_device,
)

from app.errors import ApiServiceError
from app.services.protocol_registry import (
    build_course_structure_from_protocol,
    get_protocol_by_ids,
)
from app.services.registries import _load_conditions, _load_modalities


def _find_condition_id(condition_slug: str) -> str | None:
    """Return Condition_ID for a registry slug by matching the slug prefix."""
    slug_lower = condition_slug.lower().replace("-", " ")
    for row in _load_conditions():
        name_key = row.get("Condition_Name", "").lower().replace("-", " ")
        cid = row.get("Condition_ID", "")
        # Match by slug or by first-word prefix
        if slug_lower in name_key or name_key.startswith(slug_lower.split()[0]):
            return cid
    return None


def _find_modality_id(modality_slug: str) -> str | None:
    """Return Modality_ID for a registry slug."""
    slug_lower = modality_slug.lower()
    for row in _load_modalities():
        mod_name = row.get("Modality_Name", "").lower()
        mod_id_raw = row.get("Modality_ID", "")
        # Match slug against the modality name token or ID
        if slug_lower in mod_name or mod_name.startswith(slug_lower):
            return mod_id_raw
    return None


def _get_condition_contraindications(condition_slug: str) -> str:
    """Return the raw Contraindication_Alerts string for a condition slug."""
    slug_lower = condition_slug.lower().replace("-", " ")
    for row in _load_conditions():
        name_key = row.get("Condition_Name", "").lower().replace("-", " ")
        if slug_lower in name_key or name_key.startswith(slug_lower.split()[0]):
            return row.get("Contraindication_Alerts", "")
    return ""


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

    # --- Protocol registry lookup (CSV-driven parameters) ---
    condition_id = _find_condition_id(payload.condition_slug)
    modality_id = _find_modality_id(payload.modality_slug)
    protocol_params: dict | None = None
    if condition_id and modality_id:
        raw_protocol = get_protocol_by_ids(condition_id, modality_id)
        if raw_protocol is not None:
            protocol_params = build_course_structure_from_protocol(raw_protocol)

    # --- Contraindication check ---
    raw_contraindications = _get_condition_contraindications(payload.condition_slug)
    contraindication_warnings = check_contraindications(
        raw_contraindications, payload.modality_slug
    )

    # --- Governance rules ---
    on_label = protocol_params.get("on_label", True) if protocol_params else True
    evidence_grade = protocol_params.get("evidence_grade", "EV-A") if protocol_params else "EV-A"
    # Intake preview has no actor role — use "clinician" as conservative default
    governance_warnings = apply_governance_rules(
        on_label=on_label,
        evidence_grade=evidence_grade,
        actor_role="clinician",
    )

    protocol = build_protocol_plan(
        condition,
        modality,
        device,
        payload.phenotype,
        compatibility,
        protocol_params,
    )
    handbook = build_clinician_handbook_plan(
        condition, modality, device, payload.phenotype, protocol_params
    )

    all_warnings = [
        *condition.contraindications,
        *modality.safety_notes,
        *device.notes,
        *contraindication_warnings,
        *governance_warnings,
    ]

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
        warnings=all_warnings,
        protocol_plan=protocol,
        clinician_handbook_plan=handbook,
    )
