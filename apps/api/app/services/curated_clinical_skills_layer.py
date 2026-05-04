"""Curated DeepSynaps clinical skills layer built from reviewed OpenClaw skills.

This module is the runtime-facing bridge between:

- the safety-engine's reviewed external-skill allowlist, and
- concrete DeepSynaps product use-cases such as protocol generation,
  patient handbooks, analytics, and governance support.

The module does NOT execute third-party skills directly. Instead it defines
which reviewed skills may support which DeepSynaps use-cases and provides a
single helper that forces wrapped output through the safety engine.
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from deepsynaps_safety_engine import (
    ClinicalClaimType,
    EvidenceLevel,
    GovernedSkillOutput,
    SkillCitation,
    is_allowlisted_openclaw_skill,
    wrap_openclaw_skill_output,
)


ExecutionMode = Literal["governed_external_wrapper", "native_only"]


class CuratedLayerUseCase(BaseModel):
    id: str
    label: str
    summary: str
    execution_mode: ExecutionMode
    allowed_source_skills: tuple[str, ...] = ()
    native_backing_services: tuple[str, ...] = ()
    supported_claim_types: tuple[ClinicalClaimType, ...] = ()
    patient_facing_possible: bool = False
    requires_citations: bool = False
    notes: tuple[str, ...] = ()


CURATED_CLINICAL_SKILLS_LAYER: dict[str, CuratedLayerUseCase] = {
    row.id: row
    for row in (
        CuratedLayerUseCase(
            id="protocol-generation",
            label="Evidence-backed protocol generation",
            summary=(
                "Draft neuromodulation protocol evidence support using DeepSynaps-native "
                "research services plus curated literature/trial retrieval helpers."
            ),
            execution_mode="governed_external_wrapper",
            allowed_source_skills=(
                "pubmed-search",
                "medical-research-toolkit",
                "clinicaltrials-database",
                "clinical-reports",
            ),
            native_backing_services=(
                "app.services.neuromodulation_research",
                "app.services.protocol_registry",
                "deepsynaps_generation_engine.protocols",
            ),
            supported_claim_types=("protocol_recommendation", "literature_evidence_summary"),
            patient_facing_possible=False,
            requires_citations=True,
            notes=(
                "Protocol outputs are drafts only.",
                "Off-label neuromodulation content must remain flagged.",
            ),
        ),
        CuratedLayerUseCase(
            id="patient-handbooks",
            label="Patient handbooks and safe explanations",
            summary=(
                "Generate patient-safe explanatory drafts and handbook support text with "
                "strict non-diagnostic language."
            ),
            execution_mode="governed_external_wrapper",
            allowed_source_skills=("patiently-ai", "clinical-reports"),
            native_backing_services=(
                "deepsynaps_generation_engine.protocols",
                "app.services.preview",
            ),
            supported_claim_types=("patient_education", "clinical_report_draft"),
            patient_facing_possible=True,
            requires_citations=False,
            notes=(
                "Only `patiently-ai` may default to patient-facing safe copy.",
                "Any clinical-report draft still requires clinician-safe rewrite before export.",
            ),
        ),
        CuratedLayerUseCase(
            id="clinical-reports",
            label="Clinical reports and clinician draft narratives",
            summary=(
                "Draft clinician-facing reports with evidence tags and mandatory review."
            ),
            execution_mode="governed_external_wrapper",
            allowed_source_skills=("clinical-reports", "pubmed-search"),
            native_backing_services=(
                "deepsynaps_render_engine",
                "app.services.qeeg_claim_governance",
                "app.services.media_analysis_service",
            ),
            supported_claim_types=("clinical_report_draft", "literature_evidence_summary"),
            patient_facing_possible=False,
            requires_citations=False,
            notes=("Draft only; not a signed clinical report.",),
        ),
        CuratedLayerUseCase(
            id="patient-analytics",
            label="Patient analytics and biomedical visualization",
            summary=(
                "Produce observational cohort analytics and visual summaries for clinician review."
            ),
            execution_mode="governed_external_wrapper",
            allowed_source_skills=(
                "plotly",
                "seaborn",
                "scientific-visualization",
                "statistical-analysis",
                "pyhealth",
                "neurokit2",
            ),
            native_backing_services=(
                "app.services.risk_evidence_map",
                "packages.qeeg-pipeline",
                "apps.web.pages-patient-analytics",
            ),
            supported_claim_types=("biomedical_analytics",),
            patient_facing_possible=False,
            requires_citations=False,
            notes=("Outputs must remain observational and non-prescriptive.",),
        ),
        CuratedLayerUseCase(
            id="medical-imaging-review",
            label="Medical imaging and pathology review support",
            summary=(
                "Support research-grade imaging review, DICOM handling, and pathology preprocessing."
            ),
            execution_mode="governed_external_wrapper",
            allowed_source_skills=(
                "medical-imaging-review",
                "pydicom",
                "pathml",
                "histolab",
                "neurokit2",
            ),
            native_backing_services=(
                "app.services.mri_claim_governance",
                "app.services.fusion_safety_service",
                "packages.mri-pipeline",
            ),
            supported_claim_types=("imaging_review", "biomedical_analytics"),
            patient_facing_possible=False,
            requires_citations=False,
            notes=("Research and clinician-review support only; no autonomous diagnosis.",),
        ),
        CuratedLayerUseCase(
            id="fhir-integration",
            label="FHIR integration",
            summary=(
                "Keep FHIR workflows on native DeepSynaps services rather than external OpenClaw skills."
            ),
            execution_mode="native_only",
            allowed_source_skills=(),
            native_backing_services=(
                "app.services.fhir_export",
                "app.services.mri_export_governance",
            ),
            supported_claim_types=("fhir_transform",),
            patient_facing_possible=False,
            requires_citations=False,
            notes=(
                "External FHIR skills were rejected due licensing ambiguity and duplicate capability.",
            ),
        ),
        CuratedLayerUseCase(
            id="regulatory-governance",
            label="Regulatory, QMS, and governance support",
            summary=(
                "Draft regulated wording and governance support using reviewed ISO/FDA-oriented skills."
            ),
            execution_mode="governed_external_wrapper",
            allowed_source_skills=("iso-13485-certification", "fda-database"),
            native_backing_services=(
                "docs/protocol-evidence-governance-policy.md",
                "app.services.registries",
            ),
            supported_claim_types=("regulatory_wording",),
            patient_facing_possible=False,
            requires_citations=False,
            notes=("Regulatory status must not be conflated with efficacy.",),
        ),
    )
}


def list_curated_clinical_layer_use_cases() -> tuple[CuratedLayerUseCase, ...]:
    return tuple(CURATED_CLINICAL_SKILLS_LAYER.values())


def get_curated_clinical_layer_use_case(use_case_id: str) -> CuratedLayerUseCase:
    try:
        return CURATED_CLINICAL_SKILLS_LAYER[use_case_id]
    except KeyError as exc:
        raise ValueError(f"Unknown curated clinical skills use case: {use_case_id}") from exc


def govern_openclaw_use_case_output(
    *,
    use_case_id: str,
    source_skill_name: str,
    evidence_level: EvidenceLevel,
    clinical_claim_type: ClinicalClaimType,
    content: str,
    citations: list[SkillCitation] | None = None,
    patient_facing_safe_copy_allowed: bool | None = None,
    off_label_risk_flag: bool | None = None,
) -> GovernedSkillOutput:
    """Validate a reviewed skill against a DeepSynaps use-case and wrap output."""
    use_case = get_curated_clinical_layer_use_case(use_case_id)
    if use_case.execution_mode != "governed_external_wrapper":
        raise ValueError(
            f"Use case '{use_case_id}' is native-only and does not permit external skill wrapping."
        )
    if source_skill_name not in use_case.allowed_source_skills:
        raise ValueError(
            f"Skill '{source_skill_name}' is not approved for curated use case '{use_case_id}'."
        )
    if not is_allowlisted_openclaw_skill(source_skill_name):
        raise ValueError(
            f"Skill '{source_skill_name}' is not present in the reviewed OpenClaw allowlist."
        )
    if clinical_claim_type not in use_case.supported_claim_types:
        raise ValueError(
            f"Claim type '{clinical_claim_type}' is not supported for curated use case '{use_case_id}'."
        )
    if use_case.requires_citations and not citations:
        raise ValueError(
            f"Curated use case '{use_case_id}' requires citations before wrapping output."
        )
    return wrap_openclaw_skill_output(
        source_skill_name=source_skill_name,
        evidence_level=evidence_level,
        clinical_claim_type=clinical_claim_type,
        content=content,
        citations=citations,
        patient_facing_safe_copy_allowed=patient_facing_safe_copy_allowed,
        off_label_risk_flag=off_label_risk_flag,
    )
