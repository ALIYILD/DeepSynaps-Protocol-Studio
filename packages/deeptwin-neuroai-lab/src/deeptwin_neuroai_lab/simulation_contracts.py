"""What-if scenario contracts — research framing only, no prescriptive protocols."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from deeptwin_neuroai_lab.risk_flags import assert_safe_language, scan_for_unsafe_clinical_claims
from deeptwin_neuroai_lab.schemas import DeepTwinSafetyMetadata, InterventionPayload, PatientDataEvent


class DeepTwinSimulationRequest(BaseModel):
    model_config = ConfigDict(extra="allow")

    patient_id: str | None = None
    baseline_events: list[PatientDataEvent] = Field(default_factory=list)
    proposed_intervention: InterventionPayload | None = None
    outcome_domains: list[str] = Field(default_factory=list)
    time_horizon_days: int = Field(default=90, ge=1, le=3650)
    evidence_context: str = ""
    clinician_role_required: Literal[True] = True


class DeepTwinSimulationResult(BaseModel):
    model_config = ConfigDict(extra="allow")

    scenario_summary: str
    possible_associations: list[str] = Field(default_factory=list)
    uncertainty_notes: list[str] = Field(default_factory=list)
    evidence_limitations: list[str] = Field(default_factory=list)
    clinician_review_required: Literal[True] = True
    contraindication_flags: list[str] = Field(default_factory=list)
    not_prescriptive_disclaimer: str = (
        "This scenario preview is not prescriptive; it does not change treatment parameters."
    )
    no_parameter_change_recommendation: Literal[True] = True
    safety: DeepTwinSafetyMetadata = Field(default_factory=DeepTwinSafetyMetadata)


def _extreme_intervention_flags(iv: InterventionPayload | None) -> list[str]:
    if iv is None:
        return ["missing_intervention_detail"]
    flags: list[str] = []
    if iv.frequency_hz is not None and (iv.frequency_hz <= 0 or iv.frequency_hz > 200):
        flags.append("frequency_out_of_typical_range_review")
    if iv.duration_minutes is not None and iv.duration_minutes > 180:
        flags.append("long_session_duration_review")
    if iv.off_label:
        flags.append("off_label_context")
    if not iv.clinician_approved:
        flags.append("not_clinician_approved_in_payload")
    return flags


def preview_simulation(req: DeepTwinSimulationRequest) -> DeepTwinSimulationResult:
    """Return a hypothesis-style summary with mandatory disclaimers (deterministic)."""

    assoc = [
        "Temporal co-occurrence between documented sessions and outcome checkpoints "
        "may be explored as an observed association — insufficient evidence for causal conclusion.",
        "Hypothesis for clinician review: align proposed sessions with documented baseline context.",
    ]
    uncertainties = [
        "Evidence quality and follow-up duration affect interpretability.",
        "Confounding variables are not modeled in this preview.",
    ]
    evidence_lim = [
        "No autonomous literature retrieval or citation is performed in this stub.",
    ]
    if req.evidence_context:
        evidence_lim.append("User-supplied evidence_context is not validated here.")

    summary = (
        f"Research-grade scenario preview for patient context '{req.patient_id or 'unspecified'}': "
        "possible associations are listed for clinician review; "
        "this is not a treatment plan."
    )
    assert_safe_language(summary)
    for a in assoc:
        assert_safe_language(a)

    contra = _extreme_intervention_flags(req.proposed_intervention)
    return DeepTwinSimulationResult(
        scenario_summary=summary,
        possible_associations=assoc,
        uncertainty_notes=uncertainties,
        evidence_limitations=evidence_lim,
        clinician_review_required=True,
        contraindication_flags=contra,
        not_prescriptive_disclaimer=(
            "This scenario preview is not prescriptive and cannot replace clinician judgement."
        ),
        no_parameter_change_recommendation=True,
    )


def serialize_simulation_for_audit(result: DeepTwinSimulationResult) -> dict[str, Any]:
    """Flatten for logging — avoid storing raw PHI in payloads upstream."""

    d = result.model_dump(mode="json")
    text_blob = " ".join(
        [
            result.scenario_summary,
            " ".join(result.possible_associations),
            result.not_prescriptive_disclaimer,
        ]
    )
    d["_unsafe_language_scan"] = scan_for_unsafe_clinical_claims(text_blob)
    return d
