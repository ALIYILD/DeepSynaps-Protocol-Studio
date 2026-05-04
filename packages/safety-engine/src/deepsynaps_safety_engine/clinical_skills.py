from __future__ import annotations

import re
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator, model_validator


SAFETY_ENGINE_WRAPPER_VERSION = "openclaw-clinical-skill-layer-v1"
GOVERNANCE_POLICY_REF = "docs/protocol-evidence-governance-policy.md"

EvidenceLevel = Literal[
    "EV-A",
    "EV-B",
    "EV-C",
    "EV-D",
    "NOT_APPLICABLE",
    "UNVERIFIED",
]
ClinicalClaimType = Literal[
    "literature_evidence_summary",
    "clinical_trial_match",
    "clinical_report_draft",
    "patient_education",
    "imaging_review",
    "fhir_transform",
    "regulatory_wording",
    "biomedical_analytics",
    "protocol_recommendation",
]

_NEUROMODULATION_PATTERN = re.compile(
    r"\b(rtms|itbs|tdcs|ces|tavns|tvns|neurofeedback|pbm|photobiomodulation|tps)\b",
    re.IGNORECASE,
)
_OFF_LABEL_PATTERN = re.compile(
    r"\b(off-label|investigational|outside (?:the )?(?:cleared|approved) indication|not cleared)\b",
    re.IGNORECASE,
)
_AUTONOMOUS_DECISION_PATTERN = re.compile(
    r"\b(i diagnose|we diagnose|prescribe|start the patient on|guarantee(?:d)?|will cure|"
    r"definitive treatment|authorization decision|auto-approve|auto-deny)\b",
    re.IGNORECASE,
)
_PATIENT_COPY_UNSAFE_PATTERN = re.compile(
    r"\b(you have|this means you have|guarantee(?:d)?|will cure|will definitely work)\b",
    re.IGNORECASE,
)


class SkillCitation(BaseModel):
    title: str = ""
    url: str = ""
    source_type: str = ""


class CuratedSkillDefinition(BaseModel):
    source_skill_name: str
    domain: str
    status: Literal["allowlisted", "rejected"]
    license_note: str
    rationale: str
    patient_facing_default_allowed: bool = False
    notes: tuple[str, ...] = ()


def _skill(
    source_skill_name: str,
    domain: str,
    *,
    status: Literal["allowlisted", "rejected"],
    license_note: str,
    rationale: str,
    patient_facing_default_allowed: bool = False,
    notes: tuple[str, ...] = (),
) -> CuratedSkillDefinition:
    return CuratedSkillDefinition(
        source_skill_name=source_skill_name,
        domain=domain,
        status=status,
        license_note=license_note,
        rationale=rationale,
        patient_facing_default_allowed=patient_facing_default_allowed,
        notes=notes,
    )


ALLOWLISTED_OPENCLAW_SKILLS: dict[str, CuratedSkillDefinition] = {
    item.source_skill_name: item
    for item in (
        _skill(
            "pubmed-search",
            "pubmed_biomedical_search",
            status="allowlisted",
            license_note="Uses repository-level MIT context; no conflicting proprietary header observed.",
            rationale="Evidence retrieval only. No patient-specific recommendation logic.",
        ),
        _skill(
            "medical-research-toolkit",
            "biomedical_search",
            status="allowlisted",
            license_note="Uses repository-level MIT context; network/database access must remain read-only.",
            rationale="Useful for evidence intake across PubMed, ClinicalTrials.gov, OpenFDA, and related databases.",
        ),
        _skill(
            "clinicaltrials-database",
            "clinical_trials",
            status="allowlisted",
            license_note="Uses repository-level MIT context; public registry querying only.",
            rationale="Supports structured trial discovery and registry lookups without making enrollment decisions.",
        ),
        _skill(
            "clinical-reports",
            "clinical_report_writing",
            status="allowlisted",
            license_note="Uses repository-level MIT context; outputs must remain drafts only.",
            rationale="Useful for clinician-facing draft report composition when wrapped as non-final copy.",
            notes=("draft_only",),
        ),
        _skill(
            "patiently-ai",
            "patient_explanations",
            status="allowlisted",
            license_note="No conflicting proprietary header observed; patient-safe rules are explicit in the skill text.",
            rationale="Strongest patient-facing guardrails in the reviewed set; explanation-only behavior aligns with DeepSynaps safety goals.",
            patient_facing_default_allowed=True,
        ),
        _skill(
            "medical-imaging-review",
            "imaging_literature_review",
            status="allowlisted",
            license_note="No conflicting proprietary header observed.",
            rationale="Covers literature-review workflows for medical imaging AI, not direct patient diagnosis.",
        ),
        _skill(
            "pydicom",
            "medical_imaging_data",
            status="allowlisted",
            license_note="No conflicting proprietary header observed.",
            rationale="Data handling and de-identification support for DICOM workflows.",
        ),
        _skill(
            "pathml",
            "pathology_image_analysis",
            status="allowlisted",
            license_note="No conflicting proprietary header observed.",
            rationale="Technical pathology image processing support, suitable for research and feature extraction under review.",
        ),
        _skill(
            "histolab",
            "pathology_image_preprocessing",
            status="allowlisted",
            license_note="No conflicting proprietary header observed.",
            rationale="Tile extraction and pathology preprocessing only; no autonomous diagnostic action.",
        ),
        _skill(
            "neurokit2",
            "biosignal_analysis",
            status="allowlisted",
            license_note="No conflicting proprietary header observed.",
            rationale="Useful for qEEG and biosignal analytics when outputs remain observational and reviewed.",
        ),
        _skill(
            "iso-13485-certification",
            "regulatory_governance",
            status="allowlisted",
            license_note="Skill metadata explicitly states MIT license.",
            rationale="Direct fit for ISO 13485 / QMS / EU MDR support without patient-level decision making.",
        ),
        _skill(
            "fda-database",
            "regulatory_governance",
            status="allowlisted",
            license_note="Uses repository-level MIT context; query-only FDA data access.",
            rationale="Supports device/regulatory wording with factual FDA post-market and submission data.",
        ),
        _skill(
            "plotly",
            "biomedical_analytics",
            status="allowlisted",
            license_note="No conflicting proprietary header observed.",
            rationale="Interactive analytics visualization for clinician review and ops reporting.",
        ),
        _skill(
            "seaborn",
            "biomedical_analytics",
            status="allowlisted",
            license_note="No conflicting proprietary header observed.",
            rationale="Static statistical visualization support for cohort and protocol analytics.",
        ),
        _skill(
            "scientific-visualization",
            "biomedical_analytics",
            status="allowlisted",
            license_note="No conflicting proprietary header observed.",
            rationale="Publication-quality figures for evidence packets and internal reports.",
        ),
        _skill(
            "statistical-analysis",
            "biomedical_analytics",
            status="allowlisted",
            license_note="No conflicting proprietary header observed.",
            rationale="Research analytics support for cohort reporting and evidence summaries.",
        ),
        _skill(
            "pyhealth",
            "biomedical_analytics",
            status="allowlisted",
            license_note="No conflicting proprietary header observed.",
            rationale="Healthcare ML toolkit may support retrospective cohort analytics when outputs are non-autonomous and reviewed.",
        ),
    )
}

REJECTED_OPENCLAW_SKILLS: dict[str, CuratedSkillDefinition] = {
    item.source_skill_name: item
    for item in (
        _skill(
            "clinical-decision-support",
            "clinical_decision_support",
            status="rejected",
            license_note="Uses repository-level MIT context, but capability scope is too broad for safe enablement.",
            rationale="Generates treatment recommendation reports and decision algorithms that drift into autonomous clinical guidance.",
        ),
        _skill(
            "prior-auth-review-skill",
            "payer_automation",
            status="rejected",
            license_note="Uses repository-level MIT context, but automation scope is incompatible with DeepSynaps clinical safety boundaries.",
            rationale="Designed to auto-generate authorization decisions, which is an autonomous decision workflow.",
        ),
        _skill(
            "digital-twin-clinical-agent",
            "predictive_clinical_modeling",
            status="rejected",
            license_note="Uses repository-level MIT context, but intended use exceeds DeepSynaps evidence and safety posture.",
            rationale="Simulates treatment response and treatment selection at the individual-patient level.",
        ),
        _skill(
            "trialgpt-matching",
            "clinical_trials",
            status="rejected",
            license_note="Conflicting licensing signals: proprietary header plus MIT metadata.",
            rationale="Patient-level ranking is operationally useful but should not be enabled until legal review and stronger deterministic gates exist.",
        ),
        _skill(
            "trial-eligibility-agent",
            "clinical_trials",
            status="rejected",
            license_note="Proprietary header conflicts with blanket repo-level MIT messaging.",
            rationale="Patient-specific eligibility determinations should remain advisory and DeepSynaps-native if implemented at all.",
        ),
        _skill(
            "ehr-fhir-integration",
            "fhir_integration",
            status="rejected",
            license_note="Proprietary header conflicts with blanket repo-level MIT messaging.",
            rationale="DeepSynaps already has native FHIR export surfaces; this external skill duplicates capability and introduces licensing risk.",
        ),
        _skill(
            "fhir-development",
            "fhir_integration",
            status="rejected",
            license_note="Proprietary header conflicts with blanket repo-level MIT messaging.",
            rationale="Too thin to justify external integration, and licensing is unclear.",
        ),
        _skill(
            "clinical-note-summarization",
            "clinical_report_writing",
            status="rejected",
            license_note="Proprietary header conflicts with blanket repo-level MIT messaging.",
            rationale="Potentially useful, but the combination of note transformation and licensing ambiguity makes it unsuitable for direct enablement.",
        ),
        _skill(
            "clinical-nlp-extractor",
            "clinical_report_writing",
            status="rejected",
            license_note="Proprietary header conflicts with blanket repo-level MIT messaging.",
            rationale="Relevant for structuring notes, but licensing ambiguity and PHI sensitivity argue for native implementations.",
        ),
        _skill(
            "radgpt-radiology-reporter",
            "medical_imaging_review",
            status="rejected",
            license_note="Conflicting licensing signals: proprietary header plus MIT metadata.",
            rationale="Patient-facing radiology explanations with follow-up suggestions need a stricter clinical review chain than this upstream skill provides.",
        ),
        _skill(
            "multimodal-radpath-fusion-agent",
            "medical_imaging_review",
            status="rejected",
            license_note="Uses repository-level MIT context, but risk profile is too high.",
            rationale="Integrated phenotyping can drift toward unsupported diagnosis and predictive treatment selection.",
        ),
        _skill(
            "radiomics-pathomics-fusion-agent",
            "medical_imaging_review",
            status="rejected",
            license_note="Uses repository-level MIT context, but risk profile is too high.",
            rationale="Feature fusion for predictive modeling is outside the approved DeepSynaps clinical-support boundary.",
        ),
        _skill(
            "regulatory-drafter",
            "regulatory_governance",
            status="rejected",
            license_note="Proprietary header conflicts with blanket repo-level MIT messaging.",
            rationale="Useful conceptually, but not safe to vendor or enable until licensing is clarified.",
        ),
        _skill(
            "regulatory-drafting",
            "regulatory_governance",
            status="rejected",
            license_note="Proprietary header conflicts with blanket repo-level MIT messaging.",
            rationale="Thin wrapper around an external workflow with unresolved licensing questions.",
        ),
    )
}


class GovernedSkillOutput(BaseModel):
    source_skill_name: str
    evidence_level: EvidenceLevel
    clinical_claim_type: ClinicalClaimType
    off_label_risk_flag: bool
    requires_clinician_review: bool = True
    patient_facing_safe_copy_allowed: bool = False
    citations: list[SkillCitation] = Field(default_factory=list)
    content: str
    governance_policy_refs: tuple[str, ...] = (GOVERNANCE_POLICY_REF,)
    safety_engine_version: str = SAFETY_ENGINE_WRAPPER_VERSION
    warnings: list[str] = Field(default_factory=list)

    @field_validator("requires_clinician_review")
    @classmethod
    def _clinician_review_cannot_be_disabled(cls, value: bool) -> bool:
        if value is not True:
            raise ValueError("Clinician review is mandatory for all curated external skill outputs.")
        return value

    @model_validator(mode="after")
    def _validate_policy_requirements(self) -> "GovernedSkillOutput":
        if self.source_skill_name not in ALLOWLISTED_OPENCLAW_SKILLS:
            raise ValueError(f"Skill '{self.source_skill_name}' is not in the curated allowlist.")
        definition = ALLOWLISTED_OPENCLAW_SKILLS[self.source_skill_name]
        if self.patient_facing_safe_copy_allowed and not definition.patient_facing_default_allowed:
            raise ValueError(
                f"Skill '{self.source_skill_name}' is not approved for patient-facing safe copy."
            )
        if self.clinical_claim_type == "protocol_recommendation" and not self.citations:
            raise ValueError("Protocol claims require citations under the evidence governance policy.")
        if self.patient_facing_safe_copy_allowed and _PATIENT_COPY_UNSAFE_PATTERN.search(self.content):
            raise ValueError(
                "Patient-facing safe copy cannot imply diagnosis or treatment guarantee."
            )
        if _AUTONOMOUS_DECISION_PATTERN.search(self.content):
            raise ValueError(
                "Curated external skill outputs cannot make diagnoses, prescriptions, "
                "guarantees, or autonomous operational decisions."
            )
        if self.patient_facing_safe_copy_allowed and self.evidence_level == "EV-D":
            raise ValueError("EV-D content cannot be marked safe for patient-facing copy.")
        return self


def get_allowlisted_openclaw_skills() -> tuple[CuratedSkillDefinition, ...]:
    return tuple(ALLOWLISTED_OPENCLAW_SKILLS.values())


def get_rejected_openclaw_skills() -> tuple[CuratedSkillDefinition, ...]:
    return tuple(REJECTED_OPENCLAW_SKILLS.values())


def is_allowlisted_openclaw_skill(source_skill_name: str) -> bool:
    return source_skill_name in ALLOWLISTED_OPENCLAW_SKILLS


def detect_off_label_neuromodulation_risk(
    content: str,
    clinical_claim_type: ClinicalClaimType,
) -> bool:
    if clinical_claim_type != "protocol_recommendation":
        return False
    return bool(_NEUROMODULATION_PATTERN.search(content) and _OFF_LABEL_PATTERN.search(content))


def wrap_openclaw_skill_output(
    *,
    source_skill_name: str,
    evidence_level: EvidenceLevel,
    clinical_claim_type: ClinicalClaimType,
    content: str,
    citations: list[SkillCitation] | None = None,
    patient_facing_safe_copy_allowed: bool | None = None,
    off_label_risk_flag: bool | None = None,
) -> GovernedSkillOutput:
    if source_skill_name not in ALLOWLISTED_OPENCLAW_SKILLS:
        if source_skill_name in REJECTED_OPENCLAW_SKILLS:
            reason = REJECTED_OPENCLAW_SKILLS[source_skill_name].rationale
            raise ValueError(f"Skill '{source_skill_name}' is rejected from the curated layer: {reason}")
        raise ValueError(f"Unknown skill '{source_skill_name}'. Add it to the curated review first.")

    definition = ALLOWLISTED_OPENCLAW_SKILLS[source_skill_name]
    default_patient_copy = definition.patient_facing_default_allowed
    patient_copy_allowed = (
        default_patient_copy
        if patient_facing_safe_copy_allowed is None
        else patient_facing_safe_copy_allowed
    )
    detected_off_label = detect_off_label_neuromodulation_risk(content, clinical_claim_type)
    final_off_label = bool(off_label_risk_flag) or detected_off_label

    warnings: list[str] = []
    if final_off_label:
        warnings.append("Off-label neuromodulation content detected; clinician review and consent workflow required.")
    if clinical_claim_type == "protocol_recommendation":
        warnings.append("Protocol claims remain draft evidence support until clinician review.")
    if not patient_copy_allowed:
        warnings.append("Patient-facing reuse is blocked pending clinician-safe rewrite.")

    return GovernedSkillOutput(
        source_skill_name=source_skill_name,
        evidence_level=evidence_level,
        clinical_claim_type=clinical_claim_type,
        off_label_risk_flag=final_off_label,
        requires_clinician_review=True,
        patient_facing_safe_copy_allowed=patient_copy_allowed,
        citations=citations or [],
        content=content.strip(),
        warnings=warnings,
    )


def assert_governed_skill_output(payload: Any) -> GovernedSkillOutput:
    if isinstance(payload, GovernedSkillOutput):
        return payload
    if not isinstance(payload, dict):
        raise ValueError("External skill output must pass through the DeepSynaps safety-engine wrapper.")
    if payload.get("safety_engine_version") != SAFETY_ENGINE_WRAPPER_VERSION:
        raise ValueError("External skill output is missing the required safety-engine wrapper metadata.")
    return GovernedSkillOutput.model_validate(payload)
