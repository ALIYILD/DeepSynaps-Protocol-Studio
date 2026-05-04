from __future__ import annotations

import pytest

from deepsynaps_safety_engine import (
    ALLOWLISTED_OPENCLAW_SKILLS,
    GovernedSkillOutput,
    SkillCitation,
    assert_governed_skill_output,
    wrap_openclaw_skill_output,
)
from app.services.curated_clinical_skills_layer import govern_openclaw_use_case_output


def test_patient_facing_outputs_do_not_imply_diagnosis_or_treatment_guarantee() -> None:
    with pytest.raises(ValueError, match="Patient-facing safe copy cannot imply diagnosis"):
        wrap_openclaw_skill_output(
            source_skill_name="patiently-ai",
            evidence_level="NOT_APPLICABLE",
            clinical_claim_type="patient_education",
            content="You have major depression and this treatment will definitely work for you.",
            patient_facing_safe_copy_allowed=True,
        )


def test_off_label_neuromodulation_suggestions_are_flagged() -> None:
    wrapped = wrap_openclaw_skill_output(
        source_skill_name="clinical-reports",
        evidence_level="EV-C",
        clinical_claim_type="protocol_recommendation",
        content=(
            "Consider off-label tDCS as an investigational adjunct for this "
            "neuromodulation protocol draft."
        ),
        citations=[
            SkillCitation(
                title="Sham-controlled tDCS pilot",
                url="https://pubmed.ncbi.nlm.nih.gov/12345678/",
                source_type="pubmed",
            )
        ],
    )

    assert wrapped.off_label_risk_flag is True
    assert any("Off-label neuromodulation content detected" in warning for warning in wrapped.warnings)


def test_protocol_claims_require_citations() -> None:
    with pytest.raises(ValueError, match="Protocol claims require citations"):
        wrap_openclaw_skill_output(
            source_skill_name="clinical-reports",
            evidence_level="EV-B",
            clinical_claim_type="protocol_recommendation",
            content="Draft rTMS protocol summary without citations.",
        )


def test_clinician_review_is_always_required() -> None:
    wrapped = wrap_openclaw_skill_output(
        source_skill_name="pubmed-search",
        evidence_level="NOT_APPLICABLE",
        clinical_claim_type="literature_evidence_summary",
        content="Three recent neuromodulation papers were retrieved for clinician review.",
    )

    assert wrapped.requires_clinician_review is True

    with pytest.raises(ValueError, match="Clinician review is mandatory"):
        GovernedSkillOutput(
            source_skill_name="pubmed-search",
            evidence_level="NOT_APPLICABLE",
            clinical_claim_type="literature_evidence_summary",
            off_label_risk_flag=False,
            requires_clinician_review=False,
            patient_facing_safe_copy_allowed=False,
            citations=[],
            content="Attempt to disable clinician review.",
        )


def test_no_skill_can_bypass_the_safety_engine() -> None:
    with pytest.raises(ValueError, match="missing the required safety-engine wrapper metadata"):
        assert_governed_skill_output(
            {
                "source_skill_name": "pubmed-search",
                "content": "Raw output without wrapper metadata.",
            }
        )

    wrapped = wrap_openclaw_skill_output(
        source_skill_name="pubmed-search",
        evidence_level="NOT_APPLICABLE",
        clinical_claim_type="literature_evidence_summary",
        content="Wrapped evidence lookup output.",
    )

    validated = assert_governed_skill_output(wrapped.model_dump())
    assert validated.source_skill_name == "pubmed-search"


def test_allowlist_contains_curated_patient_safe_skill() -> None:
    patiently = ALLOWLISTED_OPENCLAW_SKILLS["patiently-ai"]
    assert patiently.patient_facing_default_allowed is True


def test_use_case_wrapper_blocks_unapproved_skill_pairing() -> None:
    with pytest.raises(ValueError, match="not approved for curated use case"):
        govern_openclaw_use_case_output(
            use_case_id="patient-handbooks",
            source_skill_name="pubmed-search",
            evidence_level="NOT_APPLICABLE",
            clinical_claim_type="patient_education",
            content="Evidence summary mismatch.",
        )


def test_use_case_wrapper_enforces_native_only_boundary() -> None:
    with pytest.raises(ValueError, match="native-only"):
        govern_openclaw_use_case_output(
            use_case_id="fhir-integration",
            source_skill_name="pubmed-search",
            evidence_level="NOT_APPLICABLE",
            clinical_claim_type="fhir_transform",
            content="Attempt to route FHIR through external skill.",
        )


def test_use_case_wrapper_allows_reviewed_pairing() -> None:
    wrapped = govern_openclaw_use_case_output(
        use_case_id="patient-handbooks",
        source_skill_name="patiently-ai",
        evidence_level="NOT_APPLICABLE",
        clinical_claim_type="patient_education",
        content="This letter says your clinician recommended follow-up in two weeks.",
        patient_facing_safe_copy_allowed=True,
    )
    assert wrapped.source_skill_name == "patiently-ai"
    assert wrapped.patient_facing_safe_copy_allowed is True
