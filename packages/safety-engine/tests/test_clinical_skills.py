"""Tests for deepsynaps_safety_engine.clinical_skills.

Locks the contract for the OpenClaw curated-skill safety wrapper:
  - Allowlist / rejected-list integrity
  - GovernedSkillOutput validators (clinician review mandatory, autonomous
    decision content rejected, patient-facing copy rules, citation
    requirements)
  - wrap_openclaw_skill_output happy / rejected / unknown-skill paths
  - assert_governed_skill_output passthrough vs dict-with-version vs reject
  - detect_off_label_neuromodulation_risk
"""

from __future__ import annotations

import pytest

from deepsynaps_safety_engine import (
    ALLOWLISTED_OPENCLAW_SKILLS,
    GOVERNANCE_POLICY_REF,
    REJECTED_OPENCLAW_SKILLS,
    SAFETY_ENGINE_WRAPPER_VERSION,
    CuratedSkillDefinition,
    GovernedSkillOutput,
    SkillCitation,
    assert_governed_skill_output,
    detect_off_label_neuromodulation_risk,
    get_allowlisted_openclaw_skills,
    get_rejected_openclaw_skills,
    is_allowlisted_openclaw_skill,
    wrap_openclaw_skill_output,
)


# ───────────────────────────── registry shape ──────────────────────────────


class TestSkillRegistries:
    def test_allowlist_is_non_empty(self) -> None:
        assert ALLOWLISTED_OPENCLAW_SKILLS

    def test_rejected_list_is_non_empty(self) -> None:
        assert REJECTED_OPENCLAW_SKILLS

    def test_allowlist_and_rejected_are_disjoint(self) -> None:
        assert not set(ALLOWLISTED_OPENCLAW_SKILLS).intersection(REJECTED_OPENCLAW_SKILLS)

    def test_get_allowlisted_returns_tuple(self) -> None:
        result = get_allowlisted_openclaw_skills()
        assert isinstance(result, tuple)
        assert all(isinstance(s, CuratedSkillDefinition) for s in result)
        assert len(result) == len(ALLOWLISTED_OPENCLAW_SKILLS)

    def test_get_rejected_returns_tuple(self) -> None:
        result = get_rejected_openclaw_skills()
        assert isinstance(result, tuple)
        assert all(isinstance(s, CuratedSkillDefinition) for s in result)
        assert len(result) == len(REJECTED_OPENCLAW_SKILLS)

    def test_is_allowlisted_true_for_allowlisted(self) -> None:
        # Pubmed-search is allowlisted by curation; pin it as a stable anchor.
        assert is_allowlisted_openclaw_skill("pubmed-search") is True

    def test_is_allowlisted_false_for_unknown(self) -> None:
        assert is_allowlisted_openclaw_skill("totally-made-up-skill") is False

    def test_is_allowlisted_false_for_rejected(self) -> None:
        # clinical-decision-support is on the rejected list.
        assert is_allowlisted_openclaw_skill("clinical-decision-support") is False

    def test_known_rejected_anchor_skills_present(self) -> None:
        # These are explicitly rejected for clinical-safety reasons. If any of
        # them flip back onto the allowlist, that needs a deliberate review —
        # this assertion catches accidental flips.
        for rejected in (
            "clinical-decision-support",
            "prior-auth-review-skill",
            "digital-twin-clinical-agent",
            "trial-eligibility-agent",
        ):
            assert rejected in REJECTED_OPENCLAW_SKILLS, f"{rejected} fell off the rejected list"

    def test_curated_skill_definition_fields(self) -> None:
        sample = next(iter(ALLOWLISTED_OPENCLAW_SKILLS.values()))
        assert sample.source_skill_name
        assert sample.domain
        assert sample.status == "allowlisted"
        assert sample.license_note
        assert sample.rationale
        assert isinstance(sample.notes, tuple)


# ───────────────────────────── detect_off_label ────────────────────────────


class TestDetectOffLabelNeuromodulationRisk:
    def test_protocol_with_neuromod_and_off_label_returns_true(self) -> None:
        content = "Use rTMS off-label for fibromyalgia in non-cleared protocol."
        assert detect_off_label_neuromodulation_risk(content, "protocol_recommendation") is True

    def test_non_protocol_claim_returns_false_even_when_patterns_match(self) -> None:
        content = "Use rTMS off-label for fibromyalgia."
        assert detect_off_label_neuromodulation_risk(content, "literature_evidence_summary") is False

    def test_protocol_with_only_neuromod_returns_false(self) -> None:
        content = "Standard rTMS for major depressive disorder."
        assert detect_off_label_neuromodulation_risk(content, "protocol_recommendation") is False

    def test_protocol_with_only_off_label_returns_false(self) -> None:
        content = "An off-label use of medication X."
        assert detect_off_label_neuromodulation_risk(content, "protocol_recommendation") is False

    def test_case_insensitive_match(self) -> None:
        content = "TDCS used Off-Label in this case."
        assert detect_off_label_neuromodulation_risk(content, "protocol_recommendation") is True


# ───────────────────────────── wrap_openclaw_skill_output ──────────────────


class TestWrapOpenclawSkillOutput:
    def test_happy_path_returns_governed_output(self) -> None:
        out = wrap_openclaw_skill_output(
            source_skill_name="pubmed-search",
            evidence_level="EV-B",
            clinical_claim_type="literature_evidence_summary",
            content="Recent meta-analyses cover rTMS for treatment-resistant depression.",
            citations=[SkillCitation(title="rTMS MA", url="https://example.org/ma", source_type="meta-analysis")],
        )
        assert isinstance(out, GovernedSkillOutput)
        assert out.source_skill_name == "pubmed-search"
        assert out.requires_clinician_review is True
        assert out.safety_engine_version == SAFETY_ENGINE_WRAPPER_VERSION
        assert GOVERNANCE_POLICY_REF in out.governance_policy_refs

    def test_rejected_skill_raises_with_reason(self) -> None:
        with pytest.raises(ValueError, match="rejected from the curated layer"):
            wrap_openclaw_skill_output(
                source_skill_name="clinical-decision-support",
                evidence_level="EV-B",
                clinical_claim_type="literature_evidence_summary",
                content="anything",
            )

    def test_unknown_skill_raises(self) -> None:
        with pytest.raises(ValueError, match="Unknown skill"):
            wrap_openclaw_skill_output(
                source_skill_name="totally-made-up-skill",
                evidence_level="EV-B",
                clinical_claim_type="literature_evidence_summary",
                content="anything",
            )

    def test_off_label_neuromod_protocol_emits_warning(self) -> None:
        out = wrap_openclaw_skill_output(
            source_skill_name="patiently-ai",  # patient-facing default-allowed
            evidence_level="EV-B",
            clinical_claim_type="protocol_recommendation",
            content="A draft mentioning rTMS used off-label for migraine.",
            citations=[SkillCitation(title="cite", url="https://x", source_type="case-series")],
        )
        assert out.off_label_risk_flag is True
        assert any("Off-label neuromodulation" in w for w in out.warnings)

    def test_protocol_recommendation_always_emits_draft_warning(self) -> None:
        out = wrap_openclaw_skill_output(
            source_skill_name="clinical-reports",
            evidence_level="EV-A",
            clinical_claim_type="protocol_recommendation",
            content="Standard MDD rTMS course.",
            citations=[SkillCitation(title="trial", url="https://x", source_type="rct")],
        )
        assert any("draft evidence support" in w for w in out.warnings)

    def test_patient_copy_blocked_by_default_emits_warning(self) -> None:
        # clinical-reports is allowlisted but NOT patient-facing default.
        out = wrap_openclaw_skill_output(
            source_skill_name="clinical-reports",
            evidence_level="EV-B",
            clinical_claim_type="literature_evidence_summary",
            content="A summary.",
        )
        assert out.patient_facing_safe_copy_allowed is False
        assert any("Patient-facing reuse is blocked" in w for w in out.warnings)

    def test_patient_facing_default_allowed_for_curated_patient_skill(self) -> None:
        # patiently-ai is the explicit patient-facing default-allowed skill.
        out = wrap_openclaw_skill_output(
            source_skill_name="patiently-ai",
            evidence_level="EV-B",
            clinical_claim_type="patient_education",
            content="A gentle, neutral education paragraph.",
        )
        assert out.patient_facing_safe_copy_allowed is True

    def test_explicit_patient_copy_request_on_non_patient_skill_rejected(self) -> None:
        # Asking for patient-facing on a non-patient-facing skill must fail
        # the model validator.
        with pytest.raises(ValueError, match="not approved for patient-facing"):
            wrap_openclaw_skill_output(
                source_skill_name="clinical-reports",
                evidence_level="EV-B",
                clinical_claim_type="literature_evidence_summary",
                content="A summary.",
                patient_facing_safe_copy_allowed=True,
            )

    def test_trims_content_whitespace(self) -> None:
        out = wrap_openclaw_skill_output(
            source_skill_name="pubmed-search",
            evidence_level="EV-B",
            clinical_claim_type="literature_evidence_summary",
            content="   leading + trailing   \n",
        )
        assert out.content == "leading + trailing"


# ───────────────────────────── GovernedSkillOutput model ────────────────────


class TestGovernedSkillOutputValidators:
    """Validators are the load-bearing safety boundary — exhaustive coverage."""

    def _base_kwargs(self) -> dict:
        return dict(
            source_skill_name="pubmed-search",
            evidence_level="EV-B",
            clinical_claim_type="literature_evidence_summary",
            off_label_risk_flag=False,
            requires_clinician_review=True,
            patient_facing_safe_copy_allowed=False,
            content="A neutral evidence summary.",
        )

    def test_minimal_valid_construction(self) -> None:
        gso = GovernedSkillOutput(**self._base_kwargs())
        assert gso.requires_clinician_review is True
        assert gso.governance_policy_refs == (GOVERNANCE_POLICY_REF,)

    def test_clinician_review_cannot_be_disabled(self) -> None:
        kwargs = self._base_kwargs()
        kwargs["requires_clinician_review"] = False
        with pytest.raises(ValueError, match="Clinician review is mandatory"):
            GovernedSkillOutput(**kwargs)

    def test_unknown_skill_rejected_at_model_validation(self) -> None:
        kwargs = self._base_kwargs()
        kwargs["source_skill_name"] = "totally-made-up-skill"
        with pytest.raises(ValueError, match="not in the curated allowlist"):
            GovernedSkillOutput(**kwargs)

    def test_patient_facing_blocked_for_non_patient_skill(self) -> None:
        kwargs = self._base_kwargs()
        kwargs["source_skill_name"] = "pubmed-search"
        kwargs["patient_facing_safe_copy_allowed"] = True
        with pytest.raises(ValueError, match="not approved for patient-facing"):
            GovernedSkillOutput(**kwargs)

    def test_protocol_recommendation_requires_citations(self) -> None:
        kwargs = self._base_kwargs()
        kwargs["source_skill_name"] = "clinical-reports"
        kwargs["clinical_claim_type"] = "protocol_recommendation"
        kwargs["citations"] = []
        with pytest.raises(ValueError, match="citations under the evidence governance policy"):
            GovernedSkillOutput(**kwargs)

    def test_protocol_recommendation_with_citations_passes(self) -> None:
        kwargs = self._base_kwargs()
        kwargs["source_skill_name"] = "clinical-reports"
        kwargs["clinical_claim_type"] = "protocol_recommendation"
        kwargs["citations"] = [SkillCitation(title="t", url="u", source_type="s")]
        gso = GovernedSkillOutput(**kwargs)
        assert len(gso.citations) == 1

    def test_unsafe_patient_copy_rejected(self) -> None:
        # patient-facing AND content asserts diagnosis → blocked.
        kwargs = self._base_kwargs()
        kwargs["source_skill_name"] = "patiently-ai"
        kwargs["clinical_claim_type"] = "patient_education"
        kwargs["patient_facing_safe_copy_allowed"] = True
        kwargs["content"] = "You have major depression and this will cure it."
        with pytest.raises(ValueError, match="cannot imply diagnosis or treatment guarantee"):
            GovernedSkillOutput(**kwargs)

    def test_autonomous_decision_phrase_blocked(self) -> None:
        kwargs = self._base_kwargs()
        kwargs["content"] = "We diagnose major depressive disorder and prescribe rTMS."
        with pytest.raises(ValueError, match="cannot make diagnoses, prescriptions"):
            GovernedSkillOutput(**kwargs)

    def test_ev_d_blocked_for_patient_facing(self) -> None:
        kwargs = self._base_kwargs()
        kwargs["source_skill_name"] = "patiently-ai"
        kwargs["evidence_level"] = "EV-D"
        kwargs["patient_facing_safe_copy_allowed"] = True
        kwargs["content"] = "A neutral paragraph."
        with pytest.raises(ValueError, match="EV-D content cannot be marked safe"):
            GovernedSkillOutput(**kwargs)

    def test_warnings_default_empty(self) -> None:
        gso = GovernedSkillOutput(**self._base_kwargs())
        assert gso.warnings == []

    def test_safety_engine_version_baked_in(self) -> None:
        gso = GovernedSkillOutput(**self._base_kwargs())
        assert gso.safety_engine_version == SAFETY_ENGINE_WRAPPER_VERSION


# ───────────────────────────── assert_governed_skill_output ─────────────────


class TestAssertGovernedSkillOutput:
    def test_passthrough_when_already_governed(self) -> None:
        original = GovernedSkillOutput(
            source_skill_name="pubmed-search",
            evidence_level="EV-B",
            clinical_claim_type="literature_evidence_summary",
            off_label_risk_flag=False,
            requires_clinician_review=True,
            patient_facing_safe_copy_allowed=False,
            content="A summary.",
        )
        assert assert_governed_skill_output(original) is original

    def test_dict_with_version_revives(self) -> None:
        gso = GovernedSkillOutput(
            source_skill_name="pubmed-search",
            evidence_level="EV-B",
            clinical_claim_type="literature_evidence_summary",
            off_label_risk_flag=False,
            requires_clinician_review=True,
            patient_facing_safe_copy_allowed=False,
            content="A summary.",
        )
        revived = assert_governed_skill_output(gso.model_dump())
        assert isinstance(revived, GovernedSkillOutput)
        assert revived.source_skill_name == "pubmed-search"

    def test_dict_missing_version_rejected(self) -> None:
        payload = {
            "source_skill_name": "pubmed-search",
            "evidence_level": "EV-B",
            "clinical_claim_type": "literature_evidence_summary",
            "off_label_risk_flag": False,
            "patient_facing_safe_copy_allowed": False,
            "content": "A summary.",
            # safety_engine_version omitted on purpose
        }
        with pytest.raises(ValueError, match="missing the required safety-engine wrapper metadata"):
            assert_governed_skill_output(payload)

    def test_dict_with_wrong_version_rejected(self) -> None:
        payload = {
            "source_skill_name": "pubmed-search",
            "evidence_level": "EV-B",
            "clinical_claim_type": "literature_evidence_summary",
            "off_label_risk_flag": False,
            "patient_facing_safe_copy_allowed": False,
            "content": "A summary.",
            "safety_engine_version": "openclaw-clinical-skill-layer-v0",
        }
        with pytest.raises(ValueError, match="missing the required safety-engine wrapper metadata"):
            assert_governed_skill_output(payload)

    def test_non_dict_non_governed_rejected(self) -> None:
        with pytest.raises(ValueError, match="must pass through the DeepSynaps safety-engine wrapper"):
            assert_governed_skill_output("plain string output")

    def test_list_rejected(self) -> None:
        with pytest.raises(ValueError, match="must pass through the DeepSynaps safety-engine wrapper"):
            assert_governed_skill_output(["a", "b"])
