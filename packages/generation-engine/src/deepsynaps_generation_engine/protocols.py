from __future__ import annotations

import re

from deepsynaps_core_schema import (
    ClinicianHandbookPlan,
    ConditionProfile,
    DeviceProfile,
    HandbookDocument,
    HandbookSection,
    ModalityProfile,
    ProtocolPlan,
    SessionStep,
    SessionStructure,
)
from deepsynaps_render_engine import (
    REPORT_GENERATOR_VERSION_DEFAULT,
    CitationRef,
    InterpretationItem,
    ReportPayload,
    ReportSection,
    SuggestedAction,
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


# ---------------------------------------------------------------------------
# Structured report payload builder
# ---------------------------------------------------------------------------

def _handbook_lines_or_placeholder(lines: list[str], *, empty_message: str) -> list[str]:
    cleaned = [str(x).strip() for x in lines if str(x).strip()]
    return cleaned if cleaned else [empty_message]


def build_report_payload_from_handbook_document(
    doc: HandbookDocument,
    *,
    patient_id: str | None = None,
    report_id: str | None = None,
    audience: str = "both",
) -> ReportPayload:
    """Map a server-built :class:`HandbookDocument` into a versioned
    :class:`ReportPayload` for HTML/PDF/reporting surfaces.

    The handbook already separates eligibility, workflow, safety, and escalation
    into lists; this function mirrors those into report sections while keeping
    the observed / interpretation / suggested-action contract used elsewhere.
    """
    audience_norm = audience if audience in ("clinician", "patient", "both") else "both"

    kind_label = {
        "clinician_handbook": "Clinician handbook",
        "patient_guide": "Patient guide",
        "technician_sop": "Technician SOP",
    }.get(doc.document_type, str(doc.document_type))

    overview_lines = _handbook_lines_or_placeholder(
        [doc.overview] if doc.overview else [],
        empty_message="No overview text returned by the handbook generator.",
    )

    eligibility_obs = _handbook_lines_or_placeholder(
        doc.eligibility,
        empty_message="No eligibility bullets returned — confirm population against source protocol.",
    )
    setup_obs = _handbook_lines_or_placeholder(
        doc.setup,
        empty_message="No setup steps returned — document device and montage during clinician review.",
    )
    workflow_obs = _handbook_lines_or_placeholder(
        doc.session_workflow,
        empty_message="No session workflow lines returned — define timing and monitoring before use.",
    )
    safety_obs = _handbook_lines_or_placeholder(
        doc.safety,
        empty_message="No safety lines returned — re-run contraindication screening manually.",
    )
    trouble_obs = _handbook_lines_or_placeholder(
        doc.troubleshooting,
        empty_message="No troubleshooting rows returned — record issues per clinic SOP.",
    )
    escalation_obs = _handbook_lines_or_placeholder(
        doc.escalation,
        empty_message="No escalation rows returned — define escalation before patient contact.",
    )
    ref_obs = _handbook_lines_or_placeholder(
        doc.references,
        empty_message="No reference pointers attached — verify literature independently.",
    )

    citations: list[CitationRef] = []
    for idx, ref in enumerate(doc.references[:32]):
        raw = (ref or "").strip()
        if not raw:
            continue
        lower = raw.lower()
        citations.append(
            CitationRef(
                citation_id=f"H{idx + 1}",
                title=raw[:220] + ("..." if len(raw) > 220 else ""),
                raw_text=raw,
                url=raw if lower.startswith(("http://", "https://")) else None,
                status="unverified",
            )
        )

    sections: list[ReportSection] = [
        ReportSection(
            section_id="handbook-overview",
            title=f"{kind_label} — overview",
            observed=overview_lines,
            interpretations=[
                InterpretationItem(
                    text=(
                        "Content is assembled from imported registry and clinical dataset fields; "
                        "it does not add independent GRADE-style review unless separately documented."
                    ),
                    evidence_strength="Evidence pending",
                )
            ],
            suggested_actions=[
                SuggestedAction(
                    text="Cross-check every narrative bullet against primary literature and site policy.",
                    rationale="Registry-derived handbook text is decision-support, not authorization to treat.",
                )
            ],
            cautions=["Treat as draft until reviewed and signed through your governance process."],
            limitations=["This assembly path does not score individual claims."],
        ),
        ReportSection(
            section_id="handbook-eligibility",
            title="Patient selection & eligibility",
            observed=eligibility_obs,
            interpretations=[
                InterpretationItem(text=item, evidence_strength="Evidence pending") for item in eligibility_obs
            ],
            suggested_actions=[
                SuggestedAction(
                    text="Confirm eligibility against the active chart and inclusion criteria.",
                    rationale=item,
                )
                for item in eligibility_obs[:5]
            ],
        ),
        ReportSection(
            section_id="handbook-setup",
            title="Assessment & setup",
            observed=setup_obs,
            interpretations=[],
            suggested_actions=[
                SuggestedAction(text=f"Execute setup step: {item[:280]}", rationale=item, requires_clinician_review=True)
                for item in setup_obs
                if item != "No setup steps returned — document device and montage during clinician review."
            ],
        ),
        ReportSection(
            section_id="handbook-session-workflow",
            title="Session workflow",
            observed=workflow_obs,
            interpretations=[],
            suggested_actions=[
                SuggestedAction(
                    text=f"Apply workflow item: {item[:240]}",
                    rationale="Derived from imported protocol row or governance placeholder.",
                    requires_clinician_review=True,
                )
                for item in workflow_obs
                if "No session workflow" not in item
            ],
        ),
        ReportSection(
            section_id="handbook-safety",
            title="Safety, contraindications & monitoring",
            observed=safety_obs,
            interpretations=[],
            suggested_actions=[
                SuggestedAction(
                    text="Review safety item with patient and device-specific checklist.",
                    rationale=item,
                )
                for item in safety_obs
                if "No safety lines" not in item
            ],
            cautions=list(safety_obs) if safety_obs else [],
        ),
        ReportSection(
            section_id="handbook-troubleshooting",
            title="Troubleshooting",
            observed=trouble_obs,
            interpretations=[],
            suggested_actions=[
                SuggestedAction(text=item, requires_clinician_review=True)
                for item in trouble_obs
                if "No troubleshooting" not in item
            ],
        ),
        ReportSection(
            section_id="handbook-escalation",
            title="Escalation pathways",
            observed=escalation_obs,
            interpretations=[],
            suggested_actions=[
                SuggestedAction(text=item, requires_clinician_review=True)
                for item in escalation_obs
                if "No escalation" not in item
            ],
        ),
        ReportSection(
            section_id="handbook-references",
            title="Source pointers",
            observed=ref_obs,
            interpretations=[],
            suggested_actions=[
                SuggestedAction(
                    text="Resolve each pointer to a primary citation before citing externally.",
                    requires_clinician_review=True,
                )
            ],
        ),
    ]

    summary = doc.overview.strip() if doc.overview.strip() else (
        f"{kind_label} structured report derived from handbook generator output."
    )

    return ReportPayload(
        generator_version=REPORT_GENERATOR_VERSION_DEFAULT,
        report_id=report_id,
        patient_id=patient_id,
        title=doc.title,
        audience=audience_norm,  # type: ignore[arg-type]
        summary=summary,
        sections=sections,
        citations=citations,
        global_cautions=[
            "Handbook generator output is draft decision-support and must be reviewed before clinical reliance.",
        ],
        global_limitations=[
            "Sections mirror generator fields only; they do not substitute for patient-specific assessment.",
        ],
    )


def build_report_payload_from_protocol(
    protocol_plan: ProtocolPlan,
    handbook_plan: ClinicianHandbookPlan | None = None,
    *,
    patient_id: str | None = None,
    report_id: str | None = None,
    audience: str = "both",
) -> ReportPayload:
    """Convert a deterministic ``ProtocolPlan`` (+ optional handbook) into the
    versioned ``ReportPayload`` consumed by the render engine.

    This is the bridge between the existing protocol-generation flow and the
    new structured-report surface. Observed/interpretation/action separation
    is preserved:

    * ``Observed findings`` — protocol parameters (modality, device, session
      structure) are presented as observed facts about the proposed plan.
    * ``Model interpretation`` — the deterministic ``support_basis`` strings
      drive interpretation items, each labelled ``Evidence pending`` because
      registry-derived plans do not carry a per-claim grade by default.
    * ``Suggested actions`` — the session structure becomes a concrete
      schedule suggestion; safety + monitoring become decision-support items.

    No fabrication: when the protocol carries no contraindication or
    monitoring data we render explicit empty-state messages.
    """
    audience_norm = audience if audience in ("clinician", "patient", "both") else "both"

    observed = [
        f"Condition: {protocol_plan.condition_slug}",
        f"Modality: {protocol_plan.modality_slug}",
        f"Device: {protocol_plan.device_slug}",
        f"Phenotype: {protocol_plan.phenotype}",
        f"Total sessions: {protocol_plan.session_structure.total_sessions}",
        f"Sessions per week: {protocol_plan.session_structure.sessions_per_week}",
        f"Session duration: {protocol_plan.session_structure.session_duration_minutes} min",
    ]

    interpretations = [
        InterpretationItem(
            text=basis,
            evidence_strength="Evidence pending",
            evidence_refs=[],
        )
        for basis in protocol_plan.support_basis
    ]

    suggested_actions = [
        SuggestedAction(
            text=f"Step {step.order}: {step.title}",
            rationale=step.detail,
            requires_clinician_review=True,
        )
        for step in protocol_plan.session_structure.steps
    ]

    plan_section = ReportSection(
        section_id="protocol-plan",
        title="Proposed protocol plan",
        observed=observed,
        interpretations=interpretations,
        suggested_actions=suggested_actions,
        confidence=None,
        cautions=list(protocol_plan.safety_notes),
        limitations=list(protocol_plan.checks),
        evidence_refs=[],
    )

    safety_section = ReportSection(
        section_id="safety",
        title="Safety, monitoring & contraindications",
        observed=list(protocol_plan.contraindications),
        interpretations=[],
        suggested_actions=[
            SuggestedAction(
                text=item,
                requires_clinician_review=True,
            )
            for item in protocol_plan.monitoring
        ],
        confidence=None,
        cautions=list(protocol_plan.safety_notes),
        limitations=[],
        evidence_refs=[],
    )

    sections: list[ReportSection] = [plan_section, safety_section]

    if handbook_plan is not None:
        for hb in handbook_plan.sections:
            sections.append(
                ReportSection(
                    section_id=f"handbook-{hb.title.lower().replace(' ', '-')[:40]}",
                    title=hb.title,
                    observed=list(hb.bullets),
                )
            )

    return ReportPayload(
        generator_version=REPORT_GENERATOR_VERSION_DEFAULT,
        report_id=report_id,
        patient_id=patient_id,
        title=protocol_plan.title,
        audience=audience_norm,  # type: ignore[arg-type]
        summary=protocol_plan.summary,
        sections=sections,
        citations=[],
        global_cautions=[],
        global_limitations=[],
    )
