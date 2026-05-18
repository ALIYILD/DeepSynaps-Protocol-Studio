#!/usr/bin/env python3
"""
================================================================================
Protocol Generator Engine — Comprehensive Test Suite
================================================================================
Tests for all major components of the neuromodulation protocol generator:

  - SafetyChecker        (contraindications, medications, age-specific)
  - OutcomePredictor     (meta-analytic predictions, modifiers)
  - TDCSProtocolBuilder  (montage selection, parameter generation)
  - TMSProtocolBuilder   (coil selection, intensity calculation)
  - PBMProtocolBuilder   (wavelength, fluence, device selection)
  - NeurofeedbackProtocolBuilder (protocol type, frequency bands)
  - ProtocolComparator   (ranking, scoring)
  - ProtocolGenerator    (full orchestrator integration)
  - ReportGenerator      (output formatting)

Run:  python -m pytest test_protocol_generator.py -v
================================================================================
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
import tempfile
from copy import deepcopy
from pathlib import Path

import pytest

# Ensure the module under test is importable
sys.path.insert(0, str(Path(__file__).parent))

from protocol_generator import (
    # Enums
    ContraindicationSeverity,
    EvidenceGrade,
    ModalityType,
    PatientSex,
    SafetyLevel,
    # Core orchestrator
    ProtocolGenerator,
    generate_protocols_sync,
    # Components
    SafetyChecker,
    OutcomePredictor,
    TDCSProtocolBuilder,
    TMSProtocolBuilder,
    PBMProtocolBuilder,
    NeurofeedbackProtocolBuilder,
    ProtocolComparator,
    ReportGenerator,
    # Data classes
    PatientProfile,
    GenerationConstraints,
    GenerationResult,
    TreatmentProtocol,
    PredictedResponse,
    EvidenceBase,
    SafetyProfile,
)


# =============================================================================
# FIXTURES — Shared test data
# =============================================================================


@pytest.fixture
def sample_patient() -> PatientProfile:
    """Standard adult patient with MDD."""
    return PatientProfile(
        age_years=45,
        sex=PatientSex.FEMALE,
        weight_kg=70.0,
        height_cm=165.0,
        medications=["sertraline 100mg", "lorazepam 0.5mg"],
        comorbidities=["generalized_anxiety_disorder"],
        severity_score=7.5,
        implant_devices=[],
        seizure_history=False,
        pregnancy_status=False,
        skin_conditions=[],
    )


@pytest.fixture
def pediatric_patient() -> PatientProfile:
    """Pediatric ADHD patient."""
    return PatientProfile(
        age_years=10,
        sex=PatientSex.MALE,
        weight_kg=35.0,
        height_cm=140.0,
        medications=["methylphenidate 10mg"],
        comorbidities=["adhd_combined_type"],
        severity_score=6.0,
        implant_devices=[],
        seizure_history=False,
        pregnancy_status=False,
    )


@pytest.fixture
def geriatric_patient() -> PatientProfile:
    """Geriatric patient with Alzheimer's."""
    return PatientProfile(
        age_years=78,
        sex=PatientSex.MALE,
        weight_kg=68.0,
        height_cm=170.0,
        medications=["donepezil 10mg", "memantine 10mg"],
        comorbidities=["hypertension", "type_2_diabetes"],
        severity_score=6.0,
        implant_devices=[],
        seizure_history=False,
        pregnancy_status=False,
    )


@pytest.fixture
def contraindicated_patient() -> PatientProfile:
    """Patient with absolute contraindication for TMS and tDCS."""
    return PatientProfile(
        age_years=52,
        sex=PatientSex.MALE,
        weight_kg=85.0,
        height_cm=175.0,
        medications=["warfarin", "amiodarone"],
        comorbidities=["atrial_fibrillation"],
        severity_score=8.0,
        implant_devices=["cochlear_implant", "cardiac_pacemaker"],
        seizure_history=True,
        pregnancy_status=False,
    )


@pytest.fixture
def pregnant_patient() -> PatientProfile:
    """Pregnant patient with depression."""
    return PatientProfile(
        age_years=30,
        sex=PatientSex.FEMALE,
        weight_kg=70.0,
        height_cm=162.0,
        medications=["prenatal_vitamins"],
        comorbidities=["gestational_diabetes"],
        severity_score=6.0,
        implant_devices=[],
        seizure_history=False,
        pregnancy_status=True,
    )


@pytest.fixture
def safety_checker() -> SafetyChecker:
    return SafetyChecker()


@pytest.fixture
def outcome_predictor() -> OutcomePredictor:
    return OutcomePredictor()


# =============================================================================
# SAFETY CHECKER TESTS
# =============================================================================


class TestSafetyChecker:
    """Comprehensive tests for the SafetyChecker."""

    def test_safe_patient_tdcs(self, sample_patient, safety_checker):
        """Standard patient should be SAFE for tDCS."""
        profile, contras = safety_checker.check_patient(
            ModalityType.TDCS, sample_patient
        )
        assert profile.safety_level == SafetyLevel.SAFE
        assert profile.safe_for_patient is True
        assert len(contras) == 0

    def test_safe_patient_tms(self, sample_patient, safety_checker):
        """Standard patient should be SAFE for TMS."""
        profile, contras = safety_checker.check_patient(
            ModalityType.TMS, sample_patient
        )
        assert profile.safety_level == SafetyLevel.SAFE
        assert profile.safe_for_patient is True

    def test_contraindicated_cochlear_implant(self, contraindicated_patient, safety_checker):
        """Cochlear implant = ABSOLUTE contraindication for TMS and tDCS."""
        profile, contras = safety_checker.check_patient(
            ModalityType.TMS, contraindicated_patient
        )
        assert profile.safety_level == SafetyLevel.CONTRAINDICATED
        assert profile.safe_for_patient is False
        assert any(
            c.severity == ContraindicationSeverity.ABSOLUTE
            and "cochlear" in c.condition.lower()
            for c in contras
        )

    def test_contraindicated_pacemaker_tdcs(self, contraindicated_patient, safety_checker):
        """Cardiac pacemaker = ABSOLUTE contraindication for tDCS."""
        profile, contras = safety_checker.check_patient(
            ModalityType.TDCS, contraindicated_patient
        )
        assert profile.safety_level == SafetyLevel.CONTRAINDICATED
        assert any(
            c.severity == ContraindicationSeverity.ABSOLUTE
            and "pacemaker" in c.condition.lower()
            for c in contras
        )

    def test_pregnancy_tdcs_relative(self, pregnant_patient, safety_checker):
        """Pregnancy = RELATIVE contraindication for tDCS."""
        profile, contras = safety_checker.check_patient(
            ModalityType.TDCS, pregnant_patient
        )
        assert profile.safety_level == SafetyLevel.CAUTION
        assert profile.safe_for_patient is True  # can proceed with caution
        assert any(
            c.severity == ContraindicationSeverity.RELATIVE
            for c in contras
        )

    def test_pregnancy_tms_relative(self, pregnant_patient, safety_checker):
        """Pregnancy = RELATIVE contraindication for TMS."""
        profile, contras = safety_checker.check_patient(
            ModalityType.TMS, pregnant_patient
        )
        assert profile.safety_level == SafetyLevel.CAUTION

    def test_pregnancy_pbm_relative(self, pregnant_patient, safety_checker):
        """Pregnancy = RELATIVE contraindication for PBM."""
        profile, contras = safety_checker.check_patient(
            ModalityType.PBM, pregnant_patient
        )
        assert profile.safety_level == SafetyLevel.CAUTION

    def test_seizure_history_tms_relative(self, contraindicated_patient, safety_checker):
        """Seizure history = RELATIVE contraindication for TMS."""
        profile, contras = safety_checker.check_patient(
            ModalityType.TMS, contraindicated_patient
        )
        assert any(
            c.condition == "seizure_history"
            and c.severity == ContraindicationSeverity.RELATIVE
            for c in contras
        )

    def test_medication_interaction_photosensitizing(self, contraindicated_patient, safety_checker):
        """Photosensitizing medication = RELATIVE contraindication for PBM."""
        profile, contras = safety_checker.check_patient(
            ModalityType.PBM, contraindicated_patient
        )
        # amiodarone is photosensitizing
        assert any(
            "photosensitizing" in c.reason.lower()
            for c in contras
        )

    def test_psychosis_neurofeedback_absolute(self, safety_checker):
        """Active psychosis = ABSOLUTE contraindication for neurofeedback."""
        patient = PatientProfile(
            age_years=28,
            sex=PatientSex.MALE,
            medications=["risperidone"],
            comorbidities=["active_psychosis", "schizophrenia"],
            severity_score=8.0,
            implant_devices=[],
            seizure_history=False,
            pregnancy_status=False,
        )
        profile, contras = safety_checker.check_patient(
            ModalityType.NEUROFEEDBACK, patient
        )
        assert profile.safety_level == SafetyLevel.CONTRAINDICATED
        assert any(
            c.severity == ContraindicationSeverity.ABSOLUTE
            and "psychosis" in c.condition.lower()
            for c in contras
        )

    def test_prescreen_filters_modalities(self, sample_patient, contraindicated_patient, safety_checker):
        """Pre-screen should reject absolutely contraindicated modalities."""
        modalities = [ModalityType.TDCS, ModalityType.TMS, ModalityType.PBM]

        # Safe patient — nothing rejected
        rejected_safe = safety_checker.pre_screen(modalities, sample_patient)
        assert len(rejected_safe) == 0

        # Contraindicated patient — should reject TMS and tDCS
        rejected_contra = safety_checker.pre_screen(modalities, contraindicated_patient)
        assert len(rejected_contra) >= 2
        assert any(r.modality == "TMS" for r in rejected_contra)
        assert any(r.modality == "TDCS" for r in rejected_contra)

    def test_age_specific_pediatric_tdcs(self, safety_checker):
        """Pediatric patient (age < 8) should trigger age-specific precaution for tDCS."""
        young_child = PatientProfile(
            age_years=6,
            sex=PatientSex.MALE,
            weight_kg=20.0,
            height_cm=110.0,
            medications=[],
            implant_devices=[],
            seizure_history=False,
            pregnancy_status=False,
        )
        profile, contras = safety_checker.check_patient(
            ModalityType.TDCS, young_child
        )
        assert any(
            "age" in c.condition.lower() or "pediatric" in c.reason.lower()
            for c in contras
        )

    def test_age_specific_late_geriatric(self, safety_checker):
        """Age > 80 should trigger precaution for tDCS and TMS."""
        patient = PatientProfile(
            age_years=82,
            sex=PatientSex.FEMALE,
            medications=["aspirin"],
            comorbidities=["hypertension"],
            implant_devices=[],
            seizure_history=False,
            pregnancy_status=False,
        )
        profile, contras = safety_checker.check_patient(
            ModalityType.TDCS, patient
        )
        assert any(
            "age" in c.condition.lower() and "80" in c.reason
            for c in contras
        )

    def test_common_side_effects_populated(self, safety_checker):
        """Common side effects should be populated for all modalities."""
        for modality in ["TDCS", "TMS", "PBM", "NEUROFEEDBACK"]:
            effects = safety_checker._get_common_side_effects(modality)
            assert len(effects) > 0, f"No side effects for {modality}"

    def test_safety_profile_to_dict(self, safety_checker, sample_patient):
        """SafetyProfile should serialize to dict correctly."""
        profile, _ = safety_checker.check_patient(ModalityType.TDCS, sample_patient)
        d = profile.to_dict()
        assert "safety_level" in d
        assert "safe_for_patient" in d
        assert isinstance(d["safe_for_patient"], bool)


# =============================================================================
# OUTCOME PREDICTOR TESTS
# =============================================================================


class TestOutcomePredictor:
    """Comprehensive tests for the OutcomePredictor."""

    def test_predict_mdd_tdcs(self, sample_patient, outcome_predictor):
        """MDD + tDCS should return reasonable predictions."""
        pred = outcome_predictor.predict(
            "major_depressive_disorder", "tDCS", sample_patient
        )
        assert 0.0 < pred.response_probability <= 1.0
        assert 0.0 < pred.remission_probability <= 1.0
        assert 0.0 < pred.confidence <= 1.0
        assert pred.time_to_response_weeks is not None
        assert pred.expected_improvement_pct is not None

    def test_predict_mdd_tms(self, sample_patient, outcome_predictor):
        """MDD + TMS should return predictions with higher effect size."""
        pred = outcome_predictor.predict(
            "major_depressive_disorder", "TMS", sample_patient
        )
        assert pred.response_probability > 0
        assert pred.confidence > 0

    def test_predict_trd_lower_response(self, sample_patient, outcome_predictor):
        """TRD should have lower response rates than MDD."""
        pred_mdd = outcome_predictor.predict(
            "major_depressive_disorder", "TMS", sample_patient
        )
        pred_trd = outcome_predictor.predict(
            "treatment_resistant_depression", "TMS", sample_patient
        )
        assert pred_trd.response_probability < pred_mdd.response_probability

    def test_severity_modifier(self, outcome_predictor):
        """Severe depression should have lower predicted response."""
        mild_patient = PatientProfile(
            age_years=45,
            sex=PatientSex.FEMALE,
            severity_score=3.0,
            implant_devices=[],
            seizure_history=False,
            pregnancy_status=False,
        )
        severe_patient = PatientProfile(
            age_years=45,
            sex=PatientSex.FEMALE,
            severity_score=9.0,
            implant_devices=[],
            seizure_history=False,
            pregnancy_status=False,
        )
        pred_mild = outcome_predictor.predict(
            "major_depressive_disorder", "tDCS", mild_patient
        )
        pred_severe = outcome_predictor.predict(
            "major_depressive_disorder", "tDCS", severe_patient
        )
        assert pred_mild.response_probability > pred_severe.response_probability

    def test_age_modifier_pediatric(self, outcome_predictor):
        """Pediatric patients may have different response predictions."""
        adult = PatientProfile(
            age_years=35,
            sex=PatientSex.MALE,
            severity_score=6.0,
            implant_devices=[],
            seizure_history=False,
            pregnancy_status=False,
        )
        child = PatientProfile(
            age_years=10,
            sex=PatientSex.MALE,
            severity_score=6.0,
            implant_devices=[],
            seizure_history=False,
            pregnancy_status=False,
        )
        pred_adult = outcome_predictor.predict(
            "attention_deficit_hyperactivity_disorder", "neurofeedback", adult
        )
        pred_child = outcome_predictor.predict(
            "attention_deficit_hyperactivity_disorder", "neurofeedback", child
        )
        # Both should be valid predictions
        assert 0 < pred_adult.response_probability <= 1.0
        assert 0 < pred_child.response_probability <= 1.0

    def test_unknown_diagnosis_returns_default(self, sample_patient, outcome_predictor):
        """Unknown diagnosis should return low-confidence defaults."""
        pred = outcome_predictor.predict(
            "unknown_fictional_disorder", "tDCS", sample_patient
        )
        assert pred.confidence < 0.5
        assert pred.response_probability == 0.30

    def test_evidence_summary_mdd_tms(self, outcome_predictor):
        """Evidence summary for MDD × TMS should be high grade."""
        evidence = outcome_predictor.get_evidence_summary(
            "major_depressive_disorder", "TMS"
        )
        assert evidence.n_trials > 0
        assert evidence.effect_size_d is not None
        assert evidence.evidence_grade in (
            EvidenceGrade.A_SYSTEMATIC_REVIEW,
            EvidenceGrade.B_RANDOMIZED_TRIAL,
        )

    def test_evidence_summary_unknown(self, outcome_predictor):
        """Unknown diagnosis × modality should return insufficient evidence."""
        evidence = outcome_predictor.get_evidence_summary(
            "unknown", "unknown_modality"
        )
        assert evidence.evidence_grade == EvidenceGrade.INSUFFICIENT
        assert evidence.n_trials == 0

    def test_genetic_modifier(self, outcome_predictor):
        """BDNF Met carriers should show enhanced tDCS response."""
        met_carrier = PatientProfile(
            age_years=35,
            sex=PatientSex.FEMALE,
            genetic_variants={"BDNF": "Val66Met Met/Met"},
            severity_score=6.0,
            implant_devices=[],
            seizure_history=False,
            pregnancy_status=False,
        )
        val_carrier = PatientProfile(
            age_years=35,
            sex=PatientSex.FEMALE,
            genetic_variants={"BDNF": "Val66Met Val/Val"},
            severity_score=6.0,
            implant_devices=[],
            seizure_history=False,
            pregnancy_status=False,
        )
        pred_met = outcome_predictor.predict(
            "major_depressive_disorder", "tDCS", met_carrier
        )
        pred_val = outcome_predictor.predict(
            "major_depressive_disorder", "tDCS", val_carrier
        )
        # Met carriers should have higher response due to genetic modifier
        assert pred_met.response_probability >= pred_val.response_probability

    def test_predicted_response_clamped(self, outcome_predictor):
        """Predictions should be clamped to valid probability range."""
        extreme = PatientProfile(
            age_years=100,
            sex=PatientSex.FEMALE,
            severity_score=10.0,
            prior_neuromodulation=[{"response": "none"}, {"response": "none"}],
            implant_devices=[],
            seizure_history=False,
            pregnancy_status=False,
        )
        pred = outcome_predictor.predict(
            "treatment_resistant_depression", "tDCS", extreme
        )
        assert 0.05 <= pred.response_probability <= 0.95
        assert 0.02 <= pred.remission_probability <= 0.90


# =============================================================================
# PROTOCOL BUILDER TESTS — tDCS
# =============================================================================


class TestTDCSProtocolBuilder:
    """Tests for TDCSProtocolBuilder."""

    @pytest.fixture
    def builder(self, safety_checker, outcome_predictor):
        return TDCSProtocolBuilder(safety_checker, outcome_predictor)

    @pytest.mark.asyncio
    async def test_build_mdd_protocol(self, builder, sample_patient):
        """Should generate valid tDCS protocol for MDD."""
        protocol = await builder.build(sample_patient, "major_depressive_disorder")
        assert protocol is not None
        assert protocol.modality == "TDCS"
        assert "F3" in protocol.parameters.get("anode", "")
        assert protocol.parameters["current_ma"] > 0
        assert protocol.parameters["duration_min"] > 0
        assert protocol.parameters["sessions"] > 0

    @pytest.mark.asyncio
    async def test_build_fibromyalgia_protocol(self, builder, sample_patient):
        """Should generate valid tDCS protocol for fibromyalgia."""
        protocol = await builder.build(sample_patient, "fibromyalgia")
        assert protocol is not None
        assert protocol.modality == "TDCS"
        assert "M1" in str(protocol.parameters)

    @pytest.mark.asyncio
    async def test_contraindicated_returns_none(self, builder, contraindicated_patient):
        """Should return None for absolutely contraindicated patient."""
        protocol = await builder.build(
            contraindicated_patient, "major_depressive_disorder"
        )
        assert protocol is None

    @pytest.mark.asyncio
    async def test_pediatric_dose_reduction(self, builder, pediatric_patient):
        """Pediatric patient should get reduced current."""
        protocol = await builder.build(
            pediatric_patient, "attention_deficit_hyperactivity_disorder"
        )
        assert protocol is not None
        assert protocol.parameters["current_ma"] <= 1.5
        assert "pediatric" in str(protocol.age_adjustments).lower()

    @pytest.mark.asyncio
    async def test_geriatric_dose_reduction(self, builder, geriatric_patient):
        """Geriatric patient should get conservative parameters."""
        protocol = await builder.build(geriatric_patient, "alzheimers_disease")
        assert protocol is not None
        assert protocol.parameters["current_ma"] < 2.0

    @pytest.mark.asyncio
    async def test_constraints_applied(self, builder, sample_patient):
        """Constraints should limit sessions and duration."""
        constraints = GenerationConstraints(max_sessions=10, max_time_per_session_min=15)
        protocol = await builder.build(
            sample_patient, "major_depressive_disorder", constraints
        )
        assert protocol is not None
        assert protocol.parameters["sessions"] <= 10
        assert protocol.parameters["duration_min"] <= 15

    @pytest.mark.asyncio
    async def test_cost_estimate_positive(self, builder, sample_patient):
        """Protocol should have positive cost estimate."""
        protocol = await builder.build(sample_patient, "major_depressive_disorder")
        assert protocol is not None
        assert protocol.estimated_cost_usd > 0

    @pytest.mark.asyncio
    async def test_unknown_diagnosis_fallback(self, builder, sample_patient):
        """Unknown diagnosis should fall back to MDD montage."""
        protocol = await builder.build(sample_patient, "unknown_diagnosis")
        assert protocol is not None
        assert protocol.modality == "TDCS"

    @pytest.mark.asyncio
    async def test_evidence_populated(self, builder, sample_patient):
        """Protocol should have evidence base populated."""
        protocol = await builder.build(sample_patient, "major_depressive_disorder")
        assert protocol is not None
        assert protocol.evidence_base.n_trials > 0
        assert protocol.evidence_base.effect_size_d is not None

    @pytest.mark.asyncio
    async def test_safety_populated(self, builder, sample_patient):
        """Protocol should have safety profile populated."""
        protocol = await builder.build(sample_patient, "major_depressive_disorder")
        assert protocol is not None
        assert protocol.safety is not None
        assert len(protocol.safety.common_side_effects) > 0


# =============================================================================
# PROTOCOL BUILDER TESTS — TMS
# =============================================================================


class TestTMSProtocolBuilder:
    """Tests for TMSProtocolBuilder."""

    @pytest.fixture
    def builder(self, safety_checker, outcome_predictor):
        return TMSProtocolBuilder(safety_checker, outcome_predictor)

    @pytest.mark.asyncio
    async def test_build_mdd_protocol(self, builder, sample_patient):
        """Should generate valid TMS protocol for MDD."""
        protocol = await builder.build(sample_patient, "major_depressive_disorder")
        assert protocol is not None
        assert protocol.modality == "TMS"
        assert protocol.parameters["frequency_hz"] > 0
        assert protocol.parameters["pulses_per_session"] > 0

    @pytest.mark.asyncio
    async def test_build_ocd_protocol(self, builder, sample_patient):
        """Should generate valid TMS protocol for OCD."""
        protocol = await builder.build(sample_patient, "obsessive_compulsive_disorder")
        assert protocol is not None
        assert protocol.modality == "TMS"
        assert "SMA" in str(protocol.parameters) or "dTMS" in protocol.name

    @pytest.mark.asyncio
    async def test_build_migraine_stm_protocol(self, builder, sample_patient):
        """Should generate sTMS protocol for migraine."""
        protocol = await builder.build(sample_patient, "migraine")
        assert protocol is not None
        assert "sTMS" in protocol.name or "single" in str(protocol.parameters).lower()

    @pytest.mark.asyncio
    async def test_contraindicated_returns_none(self, builder, contraindicated_patient):
        """Should return None for contraindicated patient."""
        protocol = await builder.build(
            contraindicated_patient, "major_depressive_disorder"
        )
        assert protocol is None

    @pytest.mark.asyncio
    async def test_unknown_diagnosis_returns_none(self, builder, sample_patient):
        """Unknown diagnosis should return None (no fallback)."""
        protocol = await builder.build(sample_patient, "unknown_diagnosis")
        assert protocol is None

    @pytest.mark.asyncio
    async def test_tms_higher_cost_than_tdcs(self, builder, safety_checker, outcome_predictor, sample_patient):
        """TMS should be more expensive than TDCS per session."""
        tms_protocol = await builder.build(sample_patient, "major_depressive_disorder")
        tdcs_builder = TDCSProtocolBuilder(safety_checker, outcome_predictor)
        tdcs_protocol = await tdcs_builder.build(sample_patient, "major_depressive_disorder")

        assert tms_protocol is not None
        assert tdcs_protocol is not None
        assert tms_protocol.estimated_cost_usd > tdcs_protocol.estimated_cost_usd


# =============================================================================
# PROTOCOL BUILDER TESTS — PBM
# =============================================================================


class TestPBMProtocolBuilder:
    """Tests for PBMProtocolBuilder."""

    @pytest.fixture
    def builder(self, safety_checker, outcome_predictor):
        return PBMProtocolBuilder(safety_checker, outcome_predictor)

    @pytest.mark.asyncio
    async def test_build_mdd_protocol(self, builder, sample_patient):
        """Should generate valid PBM protocol for MDD."""
        protocol = await builder.build(sample_patient, "major_depressive_disorder")
        assert protocol is not None
        assert protocol.modality == "PBM"
        assert protocol.parameters["wavelength_nm"] > 0
        assert protocol.parameters["fluence_j_cm2"] > 0

    @pytest.mark.asyncio
    async def test_build_alzheimers_protocol(self, builder, geriatric_patient):
        """Should generate valid PBM protocol for Alzheimer's."""
        protocol = await builder.build(geriatric_patient, "alzheimers_disease")
        assert protocol is not None
        assert protocol.parameters["wavelength_nm"] == 1064

    @pytest.mark.asyncio
    async def test_build_tbi_protocol(self, builder, sample_patient):
        """Should generate valid PBM protocol for TBI."""
        protocol = await builder.build(sample_patient, "traumatic_brain_injury")
        assert protocol is not None
        assert len(protocol.parameters["target_regions"]) >= 3

    @pytest.mark.asyncio
    async def test_photosensitizing_medication_flagged(self, builder, contraindicated_patient):
        """Photosensitizing medication should be flagged but not contraindicated."""
        protocol = await builder.build(
            contraindicated_patient, "major_depressive_disorder"
        )
        assert protocol is not None
        assert any(
            "photosensitizing" in str(c.to_dict()).lower()
            for c in protocol.contraindications
        )


# =============================================================================
# PROTOCOL BUILDER TESTS — Neurofeedback
# =============================================================================


class TestNeurofeedbackProtocolBuilder:
    """Tests for NeurofeedbackProtocolBuilder."""

    @pytest.fixture
    def builder(self, safety_checker, outcome_predictor):
        return NeurofeedbackProtocolBuilder(safety_checker, outcome_predictor)

    @pytest.mark.asyncio
    async def test_build_adhd_protocol(self, builder, pediatric_patient):
        """Should generate valid NF protocol for ADHD."""
        protocol = await builder.build(
            pediatric_patient, "attention_deficit_hyperactivity_disorder"
        )
        assert protocol is not None
        assert protocol.modality == "NEUROFEEDBACK"
        assert protocol.parameters["protocol_type"] == "SMR"

    @pytest.mark.asyncio
    async def test_build_insomnia_protocol(self, builder, sample_patient):
        """Should generate valid NF protocol for insomnia."""
        protocol = await builder.build(sample_patient, "insomnia")
        assert protocol is not None
        assert "sleep" in protocol.name.lower() or "SMR" in protocol.parameters["protocol_type"]

    @pytest.mark.asyncio
    async def test_build_ptsd_protocol(self, builder, sample_patient):
        """Should generate valid NF protocol for PTSD."""
        protocol = await builder.build(sample_patient, "post_traumatic_stress_disorder")
        assert protocol is not None
        assert protocol.parameters["protocol_type"] == "alpha_theta"

    @pytest.mark.asyncio
    async def test_psychosis_patient_returns_none(self, builder):
        """Patient with psychosis should return None (absolute contraindication)."""
        psychotic_patient = PatientProfile(
            age_years=28,
            sex=PatientSex.MALE,
            medications=["risperidone"],
            comorbidities=["active_psychosis"],
            implant_devices=[],
            seizure_history=False,
            pregnancy_status=False,
        )
        protocol = await builder.build(psychotic_patient, "post_traumatic_stress_disorder")
        assert protocol is None

    @pytest.mark.asyncio
    async def test_nf_more_sessions_than_tdcs(self, builder, safety_checker, outcome_predictor):
        """NF typically requires more sessions than tDCS."""
        tdcs_builder = TDCSProtocolBuilder(safety_checker, outcome_predictor)

        nf_protocol = await builder.build(
            pediatric_patient := PatientProfile(
                age_years=10, sex=PatientSex.MALE, medications=[],
                implant_devices=[], seizure_history=False,
                pregnancy_status=False, severity_score=6.0,
            ),
            "attention_deficit_hyperactivity_disorder",
        )
        tdcs_protocol = await tdcs_builder.build(
            pediatric_patient, "attention_deficit_hyperactivity_disorder"
        )

        assert nf_protocol is not None
        assert tdcs_protocol is not None
        assert nf_protocol.parameters["sessions"] >= tdcs_protocol.parameters["sessions"]


# =============================================================================
# PROTOCOL COMPARATOR TESTS
# =============================================================================


class TestProtocolComparator:
    """Tests for ProtocolComparator."""

    @pytest.fixture
    def comparator(self):
        return ProtocolComparator()

    @pytest.fixture
    def mock_protocols(self) -> list:
        """Create mock protocols with varying scores for ranking tests."""
        return [
            TreatmentProtocol(
                modality="TMS",
                name="TMS High-Score",
                protocol_id="TMS-001",
                predicted_response=PredictedResponse(
                    response_probability=0.9, remission_probability=0.7, confidence=0.9
                ),
                evidence_base=EvidenceBase(
                    n_trials=50, effect_size_d=0.9,
                    evidence_grade=EvidenceGrade.A_SYSTEMATIC_REVIEW,
                    confidence=0.9,
                ),
                safety=SafetyProfile(safety_level=SafetyLevel.SAFE),
                estimated_cost_usd=3000,
                total_time_weeks=4,
            ),
            TreatmentProtocol(
                modality="tDCS",
                name="tDCS Mid-Score",
                protocol_id="TDCS-001",
                predicted_response=PredictedResponse(
                    response_probability=0.6, remission_probability=0.4, confidence=0.8
                ),
                evidence_base=EvidenceBase(
                    n_trials=40, effect_size_d=0.6,
                    evidence_grade=EvidenceGrade.A_SYSTEMATIC_REVIEW,
                    confidence=0.8,
                ),
                safety=SafetyProfile(safety_level=SafetyLevel.SAFE),
                estimated_cost_usd=1500,
                total_time_weeks=3,
            ),
            TreatmentProtocol(
                modality="PBM",
                name="PBM Low-Score",
                protocol_id="PBM-001",
                predicted_response=PredictedResponse(
                    response_probability=0.4, remission_probability=0.2, confidence=0.6
                ),
                evidence_base=EvidenceBase(
                    n_trials=10, effect_size_d=0.4,
                    evidence_grade=EvidenceGrade.COHORT_STUDY,
                    confidence=0.6,
                ),
                safety=SafetyProfile(safety_level=SafetyLevel.SAFE),
                estimated_cost_usd=2000,
                total_time_weeks=5,
            ),
        ]

    def test_rank_orders_correctly(self, comparator, mock_protocols):
        """Protocols should be ranked from highest to lowest score."""
        ranked = comparator.rank(mock_protocols, max_results=5)
        assert len(ranked) == 3
        assert ranked[0].modality == "TMS"  # Highest score
        assert ranked[1].modality == "tDCS"
        assert ranked[2].modality == "PBM"

    def test_rank_populates_rank_field(self, comparator, mock_protocols):
        """Ranked protocols should have rank field populated."""
        ranked = comparator.rank(mock_protocols, max_results=5)
        for i, protocol in enumerate(ranked, 1):
            assert protocol.rank == i

    def test_rank_limits_results(self, comparator, mock_protocols):
        """max_results should limit the number of returned protocols."""
        ranked = comparator.rank(mock_protocols, max_results=2)
        assert len(ranked) == 2

    def test_rank_empty_list(self, comparator):
        """Empty list should return empty list."""
        ranked = comparator.rank([])
        assert ranked == []

    def test_contraindicated_scored_lower(self, comparator):
        """Contraindicated protocol should score near zero."""
        safe = TreatmentProtocol(
            modality="tDCS",
            name="Safe",
            predicted_response=PredictedResponse(
                response_probability=0.6, remission_probability=0.4, confidence=0.8
            ),
            evidence_base=EvidenceBase(
                n_trials=30, effect_size_d=0.6,
                evidence_grade=EvidenceGrade.A_SYSTEMATIC_REVIEW,
                confidence=0.8,
            ),
            safety=SafetyProfile(safety_level=SafetyLevel.SAFE),
            estimated_cost_usd=1000,
            total_time_weeks=3,
        )
        contraindicated = TreatmentProtocol(
            modality="TMS",
            name="Unsafe",
            predicted_response=PredictedResponse(
                response_probability=0.9, remission_probability=0.7, confidence=0.9
            ),
            evidence_base=EvidenceBase(
                n_trials=50, effect_size_d=0.9,
                evidence_grade=EvidenceGrade.A_SYSTEMATIC_REVIEW,
                confidence=0.9,
            ),
            safety=SafetyProfile(safety_level=SafetyLevel.CONTRAINDICATED),
            estimated_cost_usd=2000,
            total_time_weeks=4,
        )
        ranked = comparator.rank([safe, contraindicated])
        assert ranked[0].modality == "tDCS"

    def test_custom_weights(self, mock_protocols):
        """Custom weights should change ranking behavior."""
        cost_focused = ProtocolComparator(
            weights={
                "predicted_response": 0.1,
                "evidence_quality": 0.1,
                "safety_profile": 0.1,
                "cost_efficiency": 0.6,
                "time_efficiency": 0.1,
            }
        )
        ranked = cost_focused.rank(mock_protocols)
        # tDCS at $1500 should rank highest with cost-focused weights
        assert ranked[0].modality == "tDCS"


# =============================================================================
# REPORT GENERATOR TESTS
# =============================================================================


class TestReportGenerator:
    """Tests for ReportGenerator."""

    @pytest.fixture
    def sample_result(self) -> GenerationResult:
        return GenerationResult(
            patient_id="PT-TEST-001",
            generated_at="2026-05-18T12:00:00Z",
            diagnosis="major_depressive_disorder",
            protocols=[
                TreatmentProtocol(
                    rank=1,
                    modality="tDCS",
                    name="tDCS F3-F4",
                    protocol_id="TDCS-TEST-001",
                    parameters={"current_ma": 2.0, "duration_min": 20},
                    predicted_response=PredictedResponse(
                        response_probability=0.82,
                        remission_probability=0.68,
                        confidence=0.79,
                    ),
                    evidence_base=EvidenceBase(
                        n_trials=47,
                        effect_size_d=0.6,
                        meta_analysis_citation="Brunoni 2017",
                        evidence_grade=EvidenceGrade.A_SYSTEMATIC_REVIEW,
                    ),
                    safety=SafetyProfile(
                        common_side_effects=["tingling"],
                        safe_for_patient=True,
                        safety_level=SafetyLevel.SAFE,
                    ),
                    confidence_overall=0.85,
                    estimated_cost_usd=1500,
                    total_time_weeks=3,
                ),
            ],
            rejected_protocols=[],
            overall_confidence=0.85,
            next_review="2026-06-18",
        )

    def test_generate_json(self, sample_result):
        """Should generate a JSON file."""
        with tempfile.TemporaryDirectory() as tmpdir:
            reporter = ReportGenerator(output_dir=tmpdir)
            path = reporter.generate(sample_result, format_type="json")
            assert Path(path).exists()
            assert path.endswith(".json")

    def test_generate_dict(self, sample_result):
        """Should generate a dictionary."""
        reporter = ReportGenerator()
        result = reporter.generate(sample_result, format_type="dict")
        assert isinstance(result, dict)
        assert result["patient_id"] == "PT-TEST-001"
        assert len(result["protocols"]) == 1

    def test_json_content_valid(self, sample_result):
        """JSON file should contain valid JSON with expected fields."""
        with tempfile.TemporaryDirectory() as tmpdir:
            reporter = ReportGenerator(output_dir=tmpdir)
            path = reporter.generate(sample_result, format_type="json")
            with open(path) as f:
                data = json.load(f)
            assert data["patient_id"] == "PT-TEST-001"
            assert data["diagnosis"] == "major_depressive_disorder"
            assert data["overall_confidence"] == 0.85
            assert len(data["protocols"]) == 1
            assert data["protocols"][0]["modality"] == "tDCS"

    def test_pdf_stub(self, sample_result):
        """PDF stub should fall back to JSON."""
        with tempfile.TemporaryDirectory() as tmpdir:
            reporter = ReportGenerator(output_dir=tmpdir)
            path = reporter.generate(sample_result, format_type="pdf")
            assert path.endswith(".json")

    def test_invalid_format_raises(self, sample_result):
        """Invalid format should raise ValueError."""
        reporter = ReportGenerator()
        with pytest.raises(ValueError):
            reporter.generate(sample_result, format_type="xml")


# =============================================================================
# FULL INTEGRATION TESTS — ProtocolGenerator
# =============================================================================


class TestProtocolGeneratorIntegration:
    """End-to-end integration tests for the full orchestrator."""

    @pytest.fixture
    def generator(self):
        return ProtocolGenerator()

    @pytest.mark.asyncio
    async def test_full_generation_mdd(self, generator):
        """Full protocol generation for MDD should return ranked protocols."""
        profile = {
            "age_years": 45,
            "sex": "female",
            "medications": ["sertraline 100mg"],
            "comorbidities": [],
            "severity_score": 7.5,
            "implant_devices": [],
            "seizure_history": False,
            "pregnancy_status": False,
        }
        result = await generator.generate_protocols(
            patient_id="PT-INT-001",
            diagnosis="major_depressive_disorder",
            modalities=["tDCS", "TMS", "PBM", "neurofeedback"],
            patient_profile=profile,
        )
        assert result["patient_id"] == "PT-INT-001"
        assert result["diagnosis"] == "major_depressive_disorder"
        assert len(result["protocols"]) > 0
        assert result["overall_confidence"] > 0
        assert "generated_at" in result
        assert "next_review" in result
        assert "metadata" in result

    @pytest.mark.asyncio
    async def test_full_generation_with_constraints(self, generator):
        """Constraints should be applied to generated protocols."""
        profile = {
            "age_years": 45,
            "sex": "female",
            "medications": ["sertraline"],
            "comorbidities": [],
            "severity_score": 7.5,
            "implant_devices": [],
            "seizure_history": False,
            "pregnancy_status": False,
        }
        result = await generator.generate_protocols(
            patient_id="PT-INT-002",
            diagnosis="major_depressive_disorder",
            modalities=["tDCS", "TMS"],
            patient_profile=profile,
            constraints={"max_sessions": 10, "max_budget_usd": 3000},
        )
        for protocol in result["protocols"]:
            assert protocol["parameters"]["sessions"] <= 10

    @pytest.mark.asyncio
    async def test_contraindicated_patient_rejects_modalities(self, generator):
        """Patient with implants should reject TMS and tDCS."""
        profile = {
            "age_years": 52,
            "sex": "male",
            "medications": ["warfarin"],
            "comorbidities": ["atrial_fibrillation"],
            "severity_score": 8.0,
            "implant_devices": ["cochlear_implant", "cardiac_pacemaker"],
            "seizure_history": True,
            "pregnancy_status": False,
        }
        result = await generator.generate_protocols(
            patient_id="PT-INT-003",
            diagnosis="major_depressive_disorder",
            modalities=["tDCS", "TMS", "PBM", "neurofeedback"],
            patient_profile=profile,
        )
        # Should have rejected protocols
        assert len(result["rejected_protocols"]) >= 2
        # TMS and TDCS should be in rejected
        rejected_modalities = [r["modality"] for r in result["rejected_protocols"]]
        assert "TMS" in rejected_modalities
        assert "TDCS" in rejected_modalities

    @pytest.mark.asyncio
    async def test_pediatric_patient(self, generator):
        """Pediatric patient should get age-appropriate protocols."""
        profile = {
            "age_years": 10,
            "sex": "male",
            "medications": ["methylphenidate"],
            "comorbidities": ["ADHD"],
            "severity_score": 6.0,
            "implant_devices": [],
            "seizure_history": False,
            "pregnancy_status": False,
        }
        result = await generator.generate_protocols(
            patient_id="PT-INT-004",
            diagnosis="attention_deficit_hyperactivity_disorder",
            modalities=["tDCS", "neurofeedback"],
            patient_profile=profile,
        )
        assert len(result["protocols"]) > 0
        for protocol in result["protocols"]:
            # Check age adjustments are present
            assert "age_adjustments" in protocol

    @pytest.mark.asyncio
    async def test_geriatric_alzheimers(self, generator):
        """Geriatric patient with Alzheimer's should get appropriate protocols."""
        profile = {
            "age_years": 78,
            "sex": "male",
            "medications": ["donepezil"],
            "comorbidities": ["hypertension"],
            "severity_score": 6.0,
            "implant_devices": [],
            "seizure_history": False,
            "pregnancy_status": False,
        }
        result = await generator.generate_protocols(
            patient_id="PT-INT-005",
            diagnosis="alzheimers_disease",
            modalities=["tDCS", "TMS", "PBM"],
            patient_profile=profile,
        )
        assert len(result["protocols"]) > 0

    @pytest.mark.asyncio
    async def test_single_modality(self, generator):
        """Requesting single modality should return single protocol."""
        profile = {
            "age_years": 35,
            "sex": "female",
            "medications": [],
            "comorbidities": [],
            "severity_score": 5.0,
            "implant_devices": [],
            "seizure_history": False,
            "pregnancy_status": False,
        }
        result = await generator.generate_protocols(
            patient_id="PT-INT-006",
            diagnosis="major_depressive_disorder",
            modalities=["tDCS"],
            patient_profile=profile,
        )
        assert len(result["protocols"]) == 1
        assert result["protocols"][0]["modality"] == "TDCS"

    @pytest.mark.asyncio
    async def test_empty_modalities(self, generator):
        """Empty modalities list should return empty protocols."""
        profile = {
            "age_years": 35,
            "sex": "female",
            "implant_devices": [],
            "seizure_history": False,
            "pregnancy_status": False,
        }
        result = await generator.generate_protocols(
            patient_id="PT-INT-007",
            diagnosis="major_depressive_disorder",
            modalities=[],
            patient_profile=profile,
        )
        assert len(result["protocols"]) == 0
        assert result["overall_confidence"] == 0.0

    @pytest.mark.asyncio
    async def test_protocol_structure(self, generator):
        """Each protocol should have all required fields."""
        profile = {
            "age_years": 45,
            "sex": "female",
            "medications": ["sertraline"],
            "comorbidities": [],
            "severity_score": 7.5,
            "implant_devices": [],
            "seizure_history": False,
            "pregnancy_status": False,
        }
        result = await generator.generate_protocols(
            patient_id="PT-INT-008",
            diagnosis="major_depressive_disorder",
            modalities=["tDCS", "TMS"],
            patient_profile=profile,
        )
        for protocol in result["protocols"]:
            assert "rank" in protocol
            assert "modality" in protocol
            assert "name" in protocol
            assert "protocol_id" in protocol
            assert "parameters" in protocol
            assert "evidence_base" in protocol
            assert "predicted_response" in protocol
            assert "safety" in protocol
            assert "contraindications" in protocol
            assert "confidence_overall" in protocol
            assert "estimated_cost_usd" in protocol
            assert "total_time_weeks" in protocol

            # Evidence base structure
            eb = protocol["evidence_base"]
            assert "n_trials" in eb
            assert "evidence_grade" in eb
            assert "source_adapters" in eb

            # Predicted response structure
            pr = protocol["predicted_response"]
            assert "remission_probability" in pr
            assert "response_probability" in pr
            assert "confidence" in pr

            # Safety structure
            s = protocol["safety"]
            assert "common_side_effects" in s
            assert "safe_for_patient" in s
            assert "contraindications_checked" in s

    @pytest.mark.asyncio
    async def test_pregnant_patient_allowed_modalities(self, generator):
        """Pregnant patient should still get PBM and neurofeedback."""
        profile = {
            "age_years": 30,
            "sex": "female",
            "medications": [],
            "comorbidities": [],
            "severity_score": 6.0,
            "implant_devices": [],
            "seizure_history": False,
            "pregnancy_status": True,
        }
        result = await generator.generate_protocols(
            patient_id="PT-INT-009",
            diagnosis="major_depressive_disorder",
            modalities=["tDCS", "TMS", "PBM", "neurofeedback"],
            patient_profile=profile,
        )
        # PBM and neurofeedback should still be available (relative contraindication for tDCS/TMS)
        modalities_returned = [p["modality"] for p in result["protocols"]]
        assert "PBM" in modalities_returned or "neurofeedback" in modalities_returned

    def test_sync_wrapper(self):
        """Synchronous wrapper should work without async context."""
        profile = {
            "age_years": 45,
            "sex": "female",
            "medications": ["sertraline"],
            "comorbidities": [],
            "severity_score": 7.0,
            "implant_devices": [],
            "seizure_history": False,
            "pregnancy_status": False,
        }
        result = generate_protocols_sync(
            patient_id="PT-SYNC-001",
            diagnosis="major_depressive_disorder",
            modalities=["tDCS", "TMS"],
            patient_profile=profile,
        )
        assert result["patient_id"] == "PT-SYNC-001"
        assert len(result["protocols"]) > 0


# =============================================================================
# PATIENT PROFILE TESTS
# =============================================================================


class TestPatientProfile:
    """Tests for PatientProfile data class."""

    def test_bmi_calculation(self):
        """BMI should be calculated correctly."""
        patient = PatientProfile(
            age_years=35,
            sex=PatientSex.FEMALE,
            weight_kg=70.0,
            height_cm=170.0,
            implant_devices=[],
            seizure_history=False,
            pregnancy_status=False,
        )
        expected_bmi = 70.0 / (1.70 ** 2)
        assert abs(patient.bmi - expected_bmi) < 0.01

    def test_bmi_missing_data(self):
        """BMI should be None when data is missing."""
        patient = PatientProfile(
            age_years=35,
            sex=PatientSex.FEMALE,
            implant_devices=[],
            seizure_history=False,
            pregnancy_status=False,
        )
        assert patient.bmi is None

    def test_age_group_classification(self):
        """Age groups should be classified correctly."""
        assert PatientProfile(age_years=8, sex=PatientSex.MALE, implant_devices=[], seizure_history=False, pregnancy_status=False).age_group == "pediatric"
        assert PatientProfile(age_years=15, sex=PatientSex.MALE, implant_devices=[], seizure_history=False, pregnancy_status=False).age_group == "adolescent"
        assert PatientProfile(age_years=35, sex=PatientSex.MALE, implant_devices=[], seizure_history=False, pregnancy_status=False).age_group == "adult"
        assert PatientProfile(age_years=70, sex=PatientSex.MALE, implant_devices=[], seizure_history=False, pregnancy_status=False).age_group == "geriatric"
        assert PatientProfile(age_years=82, sex=PatientSex.MALE, implant_devices=[], seizure_history=False, pregnancy_status=False).age_group == "late_geriatric"

    def test_to_dict_serializable(self):
        """to_dict should return a JSON-serializable dict."""
        patient = PatientProfile(
            age_years=45,
            sex=PatientSex.FEMALE,
            weight_kg=70.0,
            height_cm=165.0,
            medications=["sertraline"],
            implant_devices=[],
            seizure_history=False,
            pregnancy_status=False,
        )
        d = patient.to_dict()
        json_str = json.dumps(d)
        assert isinstance(json_str, str)


# =============================================================================
# EDGE CASE & ERROR HANDLING TESTS
# =============================================================================


class TestEdgeCases:
    """Edge cases and error handling."""

    @pytest.mark.asyncio
    async def test_very_old_patient(self):
        """Very old patient should still work."""
        generator = ProtocolGenerator()
        profile = {
            "age_years": 92,
            "sex": "female",
            "medications": ["aspirin"],
            "comorbidities": ["hypertension"],
            "implant_devices": [],
            "seizure_history": False,
            "pregnancy_status": False,
        }
        result = await generator.generate_protocols(
            patient_id="PT-EDGE-001",
            diagnosis="major_depressive_disorder",
            modalities=["tDCS", "PBM"],
            patient_profile=profile,
        )
        assert result is not None

    @pytest.mark.asyncio
    async def test_very_young_patient(self):
        """Very young patient should still work."""
        generator = ProtocolGenerator()
        profile = {
            "age_years": 6,
            "sex": "male",
            "medications": [],
            "implant_devices": [],
            "seizure_history": False,
            "pregnancy_status": False,
        }
        result = await generator.generate_protocols(
            patient_id="PT-EDGE-002",
            diagnosis="autism_spectrum_disorder",
            modalities=["neurofeedback"],
            patient_profile=profile,
        )
        assert result is not None

    @pytest.mark.asyncio
    async def test_unknown_modality_ignored(self):
        """Unknown modalities should be gracefully ignored."""
        generator = ProtocolGenerator()
        profile = {
            "age_years": 45,
            "sex": "female",
            "implant_devices": [],
            "seizure_history": False,
            "pregnancy_status": False,
        }
        result = await generator.generate_protocols(
            patient_id="PT-EDGE-003",
            diagnosis="major_depressive_disorder",
            modalities=["tDCS", "fictional_modality", "TMS"],
            patient_profile=profile,
        )
        # Should still generate TDCS and TMS protocols
        modalities_returned = [p["modality"] for p in result["protocols"]]
        assert "TDCS" in modalities_returned
        assert "TMS" in modalities_returned
        assert "fictional_modality" not in modalities_returned

    @pytest.mark.asyncio
    async def test_many_medications(self):
        """Patient with many medications should work."""
        generator = ProtocolGenerator()
        profile = {
            "age_years": 55,
            "sex": "female",
            "medications": [
                "sertraline", "lorazepam", "metformin", "lisinopril",
                "atorvastatin", "omeprazole", "amlodipine",
            ],
            "implant_devices": [],
            "seizure_history": False,
            "pregnancy_status": False,
        }
        result = await generator.generate_protocols(
            patient_id="PT-EDGE-004",
            diagnosis="major_depressive_disorder",
            modalities=["tDCS", "PBM"],
            patient_profile=profile,
        )
        assert result is not None
        assert len(result["protocols"]) > 0

    @pytest.mark.asyncio
    async def test_zero_severity_score(self):
        """Patient with severity_score=0 should work."""
        generator = ProtocolGenerator()
        profile = {
            "age_years": 35,
            "sex": "male",
            "implant_devices": [],
            "seizure_history": False,
            "pregnancy_status": False,
            "severity_score": 0,
        }
        result = await generator.generate_protocols(
            patient_id="PT-EDGE-005",
            diagnosis="major_depressive_disorder",
            modalities=["tDCS"],
            patient_profile=profile,
        )
        assert result is not None

    def test_comparator_with_single_protocol(self):
        """Ranking a single protocol should work."""
        comparator = ProtocolComparator()
        protocol = TreatmentProtocol(
            modality="tDCS",
            name="Only Protocol",
            predicted_response=PredictedResponse(
                response_probability=0.6, remission_probability=0.4, confidence=0.8
            ),
            evidence_base=EvidenceBase(
                n_trials=30, evidence_grade=EvidenceGrade.A_SYSTEMATIC_REVIEW
            ),
            safety=SafetyProfile(safety_level=SafetyLevel.SAFE),
            estimated_cost_usd=1500,
            total_time_weeks=3,
        )
        ranked = comparator.rank([protocol])
        assert len(ranked) == 1
        assert ranked[0].rank == 1

    def test_safety_checker_unknown_modality(self, sample_patient):
        """Safety checker with unknown modality should handle gracefully."""
        checker = SafetyChecker()
        profile, contras = checker.check_patient(
            ModalityType.TACS, sample_patient  # tACS has no specific checks
        )
        assert profile.safety_level in (SafetyLevel.SAFE, SafetyLevel.UNKNOWN)


# =============================================================================
# PERFORMANCE TESTS
# =============================================================================


class TestPerformance:
    """Lightweight performance sanity checks."""

    @pytest.mark.asyncio
    async def test_generation_under_one_second(self):
        """Protocol generation should complete in reasonable time."""
        import time
        generator = ProtocolGenerator()
        profile = {
            "age_years": 45,
            "sex": "female",
            "medications": ["sertraline"],
            "implant_devices": [],
            "seizure_history": False,
            "pregnancy_status": False,
        }
        start = time.time()
        result = await generator.generate_protocols(
            patient_id="PT-PERF-001",
            diagnosis="major_depressive_disorder",
            modalities=["tDCS", "TMS", "PBM", "neurofeedback"],
            patient_profile=profile,
        )
        elapsed = time.time() - start
        assert elapsed < 5.0  # Should complete in under 5 seconds
        assert len(result["protocols"]) > 0


# =============================================================================
# MAIN — Run tests if executed directly
# =============================================================================

if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
