from deepsynaps_core_schema import (
    HandbookGenerateRequest,
    HandbookGenerateResponse,
    ProtocolDraftRequest,
    ProtocolDraftResponse,
)
from deepsynaps_safety_engine import apply_governance_rules, check_contraindications

from app.auth import AuthenticatedActor, require_minimum_role
from app.entitlements import require_any_feature
from app.errors import ApiServiceError
from app.packages import Feature
from app.services.clinical_data import (
    generate_handbook_from_clinical_data,
    generate_protocol_draft_from_clinical_data,
)


def generate_protocol_draft(payload: ProtocolDraftRequest, actor: AuthenticatedActor) -> ProtocolDraftResponse:
    # 1. Governance check first — preserves forbidden_off_label code for existing tests
    if payload.off_label and actor.role == "guest":
        raise ApiServiceError(
            code="forbidden_off_label",
            message="Guest users cannot access off-label mode.",
            warnings=["Off-label pathways require independent clinical review."],
            status_code=403,
        )
    # 2. Package entitlement check
    require_any_feature(
        actor.package_id,
        Feature.PROTOCOL_GENERATE,
        Feature.PROTOCOL_GENERATE_LIMITED,
        message="Protocol generation requires Resident / Fellow or higher.",
    )

    # 3. Delegate to the clinical-data–driven generator which already does
    #    protocol lookup, evidence enrichment, and governance-based badge logic.
    response = generate_protocol_draft_from_clinical_data(payload, actor)

    # 4. Apply additional safety-engine contraindication and governance checks.
    #    These augment (not replace) the response already built by clinical_data.
    extra_warnings: list[str] = []

    # Derive on_label and evidence_grade from the response
    on_label = response.approval_status_badge == "approved use"
    evidence_grade_map = {
        "Guideline": "EV-A",
        "Systematic Review": "EV-B",
        "Emerging": "EV-C",
        "Experimental": "EV-D",
    }
    raw_grade = evidence_grade_map.get(response.evidence_grade, response.evidence_grade)

    # Contraindication check — use the condition contraindications already in
    # the response (already parsed by clinical_data), but run through the engine
    # to format them consistently and detect any additional flags.
    if response.contraindications:
        raw_contra_str = "; ".join(response.contraindications)
        contra_items = check_contraindications(raw_contra_str, payload.modality)
        # Only add items not already present in the response to avoid duplication
        for item in contra_items:
            if item not in response.contraindications:
                extra_warnings.append(f"Contraindication flag: {item}")

    # Governance rules
    governance_warnings = apply_governance_rules(
        on_label=on_label,
        evidence_grade=raw_grade,
        actor_role=actor.role,
    )
    extra_warnings.extend(governance_warnings)

    dr = response.device_resolution
    if dr is not None:
        merged_safety = list(dr.safety_checks_applied)
        merged_safety.append("safety_engine_governance")
        merged_safety.append("contraindication_keyword_screen")
        dr = dr.model_copy(
            update={
                "safety_checks_applied": merged_safety,
            }
        )

    if extra_warnings:
        # Append to patient_communication_notes so callers can surface them
        updated_notes = list(response.patient_communication_notes) + extra_warnings
        return ProtocolDraftResponse(
            rationale=response.rationale,
            target_region=response.target_region,
            session_frequency=response.session_frequency,
            duration=response.duration,
            escalation_logic=response.escalation_logic,
            monitoring_plan=response.monitoring_plan,
            contraindications=response.contraindications,
            patient_communication_notes=updated_notes,
            evidence_grade=response.evidence_grade,
            approval_status_badge=response.approval_status_badge,
            off_label_review_required=response.off_label_review_required,
            disclaimers=response.disclaimers,
            device_resolution=dr,
            ranking_factors_applied=response.ranking_factors_applied,
            personalization_inputs_used=response.personalization_inputs_used,
            protocol_ranking_rationale=response.protocol_ranking_rationale,
            structured_rules_applied=response.structured_rules_applied,
            structured_rule_labels_applied=response.structured_rule_labels_applied,
            structured_rule_score_total=response.structured_rule_score_total,
            structured_rule_matches_by_protocol=response.structured_rule_matches_by_protocol,
            personalization_why_selected_debug=response.personalization_why_selected_debug,
        )

    return response.model_copy(update={"device_resolution": dr}) if dr is not None else response


def generate_handbook(payload: HandbookGenerateRequest, actor: AuthenticatedActor) -> HandbookGenerateResponse:
    require_minimum_role(
        actor,
        "clinician",
        warnings=["Handbook generation is reserved for clinician and admin roles."],
    )
    require_any_feature(
        actor.package_id,
        Feature.HANDBOOK_GENERATE_FULL,
        Feature.HANDBOOK_GENERATE_LIMITED,
        message="Handbook generation requires Resident / Fellow or higher.",
    )
    return generate_handbook_from_clinical_data(payload, actor)
