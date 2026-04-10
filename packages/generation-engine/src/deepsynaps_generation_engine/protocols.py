from __future__ import annotations

import re

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


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _parse_int(text: str, default: int) -> int:
    """Extract the first integer from a potentially verbose text field.

    Examples
    --------
    "20-30 sessions over 4-6 weeks" -> 20
    "5 (daily weekday)"             -> 5
    "37.5 minutes"                  -> 37
    """
    m = re.search(r'\d+', str(text))
    return int(m.group()) if m else default


def _modality_defaults(modality_slug: str) -> tuple[int, int, int]:
    """Return (total_sessions, sessions_per_week, session_duration_minutes)
    defaults keyed by modality slug when no CSV protocol row is available."""
    defaults: dict[str, tuple[int, int, int]] = {
        "rtms": (25, 5, 38),
        "itbs": (25, 5, 5),
        "tdcs": (20, 5, 30),
        "ces": (30, 7, 20),
        "tavns": (12, 5, 30),
        "neurofeedback": (30, 2, 45),
        "tps": (6, 1, 30),
        "pbm": (12, 3, 20),
    }
    return defaults.get(modality_slug.lower(), (20, 3, 40))


# ---------------------------------------------------------------------------
# Session structure builder
# ---------------------------------------------------------------------------

def build_session_structure(
    condition: ConditionProfile,
    modality: ModalityProfile,
    device: DeviceProfile,
    phenotype: str,
    protocol_params: dict | None = None,
) -> SessionStructure:
    """Build a SessionStructure populated from real CSV protocol parameters
    when available, or from sensible per-modality defaults when not.

    Parameters
    ----------
    condition, modality, device:
        Registry profiles used for descriptive text in session steps.
    phenotype:
        Free-text phenotype string from the intake request.
    protocol_params:
        Optional dict returned by
        ``protocol_registry.build_course_structure_from_protocol()``.
        When provided its values override all defaults.
    """
    if protocol_params:
        total = _parse_int(str(protocol_params.get("total_sessions", 20)), default=20)
        per_week = _parse_int(str(protocol_params.get("sessions_per_week", 5)), default=5)
        duration = _parse_int(str(protocol_params.get("session_duration_minutes", 40)), default=40)
        freq = str(protocol_params.get("frequency_hz", "")).strip()
        intensity = str(protocol_params.get("intensity", "")).strip()
        coil = str(protocol_params.get("coil_placement", "")).strip()
        target = str(protocol_params.get("target_region", "")).strip()
        monitoring = str(protocol_params.get("monitoring_requirements", "")).strip()
    else:
        total, per_week, duration = _modality_defaults(modality.slug)
        freq = intensity = coil = target = monitoring = ""

    # Build device-setup detail line from available parameters
    setup_parts: list[str] = [f"Set up {device.name}."]
    if coil:
        setup_parts.append(f"Coil/electrode placement: {coil}.")
    if freq:
        setup_parts.append(f"Frequency: {freq} Hz.")
    if intensity:
        setup_parts.append(f"Intensity: {intensity}.")

    # Build post-session detail from monitoring requirements or generic text
    if monitoring:
        post_detail = f"Record tolerance, outcome, and any adverse events. Monitoring: {monitoring}"
    else:
        post_detail = "Record tolerability, observed response, and post-session follow-up notes."

    steps = [
        SessionStep(
            order=1,
            title="Pre-session safety review",
            detail=(
                f"Review contraindications for {condition.name}. Confirm patient screened "
                f"for {modality.name} contraindications. Phenotype context: '{phenotype}'."
            ),
        ),
        SessionStep(
            order=2,
            title="Device setup and calibration",
            detail=" ".join(setup_parts),
        ),
        SessionStep(
            order=3,
            title="Treatment delivery",
            detail=(
                f"Deliver {modality.name} to {target or 'target region'} for {duration} minutes. "
                "Monitor patient throughout."
            ),
        ),
        SessionStep(
            order=4,
            title="Post-session assessment",
            detail=post_detail,
        ),
    ]

    return SessionStructure(
        total_sessions=total,
        sessions_per_week=per_week,
        session_duration_minutes=duration,
        steps=steps,
    )


# ---------------------------------------------------------------------------
# Protocol plan builder
# ---------------------------------------------------------------------------

def build_protocol_plan(
    condition: ConditionProfile,
    modality: ModalityProfile,
    device: DeviceProfile,
    phenotype: str,
    compatibility: CompatibilityResult,
    protocol_params: dict | None = None,
) -> ProtocolPlan:
    """Build a ProtocolPlan, enriched with real CSV parameters when available.

    Parameters
    ----------
    protocol_params:
        Optional dict from ``protocol_registry.build_course_structure_from_protocol()``.
    """
    session_structure = build_session_structure(
        condition, modality, device, phenotype, protocol_params
    )

    support_basis = [
        f"Condition registry: {condition.slug}",
        f"Modality registry: {modality.slug}",
        f"Device registry: {device.slug}",
    ]

    # Safety notes — no placeholder TODOs
    safety_notes = list(modality.safety_notes)
    if protocol_params:
        escalation = str(protocol_params.get("escalation_rules", "")).strip()
        if escalation:
            safety_notes.append(f"Escalation rule: {escalation}")
        monitoring_req = str(protocol_params.get("monitoring_requirements", "")).strip()
        if monitoring_req:
            safety_notes.append(f"Monitoring: {monitoring_req}")
        adverse = str(protocol_params.get("adverse_event_monitoring", "")).strip()
        if adverse:
            safety_notes.append(f"Adverse event monitoring: {adverse}")

    monitoring = [
        "Track pre-session baseline symptoms and functional observations.",
        "Monitor tolerability during treatment delivery.",
        "Capture post-session response and any escalation triggers.",
    ]

    # Contraindications — no placeholder TODOs
    contraindications = list(condition.contraindications)
    if protocol_params:
        adverse = str(protocol_params.get("adverse_event_monitoring", "")).strip()
        if adverse and adverse not in contraindications:
            contraindications.append(adverse)

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


# ---------------------------------------------------------------------------
# Clinician handbook plan builder
# ---------------------------------------------------------------------------

def build_clinician_handbook_plan(
    condition: ConditionProfile,
    modality: ModalityProfile,
    device: DeviceProfile,
    phenotype: str,
    protocol_params: dict | None = None,
) -> ClinicianHandbookPlan:
    """Build a ClinicianHandbookPlan, enriched with real CSV parameters when available."""
    session_structure = build_session_structure(
        condition, modality, device, phenotype, protocol_params
    )

    support_basis = [
        f"Condition phenotype reference: {phenotype}",
        f"Treatment family: {modality.treatment_family}",
        f"Device manufacturer: {device.manufacturer}",
    ]

    # Safety notes — no placeholder TODOs
    safety_notes = list(modality.safety_notes)
    if protocol_params:
        escalation = str(protocol_params.get("escalation_rules", "")).strip()
        if escalation:
            safety_notes.append(f"Escalation rule: {escalation}")
        adverse = str(protocol_params.get("adverse_event_monitoring", "")).strip()
        if adverse:
            safety_notes.append(f"Adverse event monitoring: {adverse}")

    monitoring = [
        "Review response trends across the planned session series.",
        "Document clinician observations consistently after each session.",
        "Flag adverse signals for internal review before continuing treatment.",
    ]

    # Contraindications — no placeholder TODOs
    contraindications = list(condition.contraindications)
    if protocol_params:
        adverse = str(protocol_params.get("adverse_event_monitoring", "")).strip()
        if adverse and adverse not in contraindications:
            contraindications.append(adverse)

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
