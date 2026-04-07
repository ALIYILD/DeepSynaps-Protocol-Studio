from deepsynaps_core_schema import (
    ClinicianHandbookPlan,
    ConditionProfile,
    DeviceProfile,
    HandbookSection,
    ModalityProfile,
    ProtocolPlan,
    SessionStep,
    SessionStructure,
)
from deepsynaps_safety_engine import CompatibilityResult


def build_session_structure(
    condition: ConditionProfile,
    modality: ModalityProfile,
    device: DeviceProfile,
    phenotype: str,
) -> SessionStructure:
    return SessionStructure(
        total_sessions=6,
        sessions_per_week=2,
        session_duration_minutes=45,
        steps=[
            SessionStep(
                order=1,
                title="Pre-session safety review",
                detail=(
                    f"Confirm contraindications and review phenotype '{phenotype}' before "
                    f"starting {modality.name} on {device.name}."
                ),
            ),
            SessionStep(
                order=2,
                title="Device setup",
                detail=(
                    f"Prepare {device.name} according to the {modality.name} workflow and "
                    "document operator settings."
                ),
            ),
            SessionStep(
                order=3,
                title="Therapy delivery",
                detail=(
                    f"Deliver the planned {modality.name} session for {condition.name} using "
                    "the canonical internal protocol scaffold."
                ),
            ),
            SessionStep(
                order=4,
                title="Monitoring and closeout",
                detail="Record tolerability, observed response, and post-session follow-up notes.",
            ),
        ],
    )


def build_protocol_plan(
    condition: ConditionProfile,
    modality: ModalityProfile,
    device: DeviceProfile,
    phenotype: str,
    compatibility: CompatibilityResult,
) -> ProtocolPlan:
    session_structure = build_session_structure(condition, modality, device, phenotype)
    support_basis = [
        f"Condition registry: {condition.slug}",
        f"Modality registry: {modality.slug}",
        f"Device registry: {device.slug}",
    ]
    safety_notes = [
        *modality.safety_notes,
        "TODO: add parameterized stimulation safety thresholds once clinical rules are finalized.",
    ]
    monitoring = [
        "Track pre-session baseline symptoms and functional observations.",
        "Monitor tolerability during treatment delivery.",
        "Capture post-session response and any escalation triggers.",
    ]
    contraindications = [
        *condition.contraindications,
        "TODO: add modality-specific contraindication depth beyond registry placeholders.",
    ]

    return ProtocolPlan(
        title=f"{condition.name} {modality.name} protocol plan",
        condition_slug=condition.slug,
        modality_slug=modality.slug,
        device_slug=device.slug,
        phenotype=phenotype,
        summary=(
            f"Deterministic protocol plan for {condition.name} using {modality.name} on "
            f"{device.name}, generated from registry records without LLM composition."
        ),
        support_basis=support_basis,
        safety_notes=safety_notes,
        monitoring=monitoring,
        contraindications=contraindications,
        session_structure=session_structure,
        checks=list(compatibility.reasons),
    )


def build_clinician_handbook_plan(
    condition: ConditionProfile,
    modality: ModalityProfile,
    device: DeviceProfile,
    phenotype: str,
) -> ClinicianHandbookPlan:
    session_structure = build_session_structure(condition, modality, device, phenotype)
    support_basis = [
        f"Condition phenotype reference: {phenotype}",
        f"Treatment family: {modality.treatment_family}",
        f"Device manufacturer: {device.manufacturer}",
    ]
    safety_notes = [
        *modality.safety_notes,
        "TODO: add device-specific safety escalation matrices.",
    ]
    monitoring = [
        "Review response trends across the planned session series.",
        "Document clinician observations consistently after each session.",
        "Flag adverse signals for internal review before continuing treatment.",
    ]
    contraindications = [
        *condition.contraindications,
        "TODO: expand contraindication guidance with clinician-facing workflow branching.",
    ]

    return ClinicianHandbookPlan(
        title=f"{condition.name} clinician handbook plan",
        audience="clinician",
        summary=(
            f"Deterministic clinician handbook plan for {condition.name}, {modality.name}, "
            f"and {device.name}. Content remains registry-driven until a dedicated "
            "composition service is introduced."
        ),
        support_basis=support_basis,
        safety_notes=safety_notes,
        monitoring=monitoring,
        contraindications=contraindications,
        session_structure=session_structure,
        sections=[
            HandbookSection(
                title="Eligibility and intake framing",
                bullets=[
                    f"Confirm the selected condition is {condition.name}.",
                    f"Use phenotype note '{phenotype}' when documenting the case context.",
                    "Verify the request remains within supported registry combinations.",
                ],
            ),
            HandbookSection(
                title="Safety and contraindication review",
                bullets=safety_notes + contraindications,
            ),
            HandbookSection(
                title="Monitoring workflow",
                bullets=monitoring,
            ),
            HandbookSection(
                title="Session delivery structure",
                bullets=[step.detail for step in session_structure.steps],
            ),
        ],
    )
