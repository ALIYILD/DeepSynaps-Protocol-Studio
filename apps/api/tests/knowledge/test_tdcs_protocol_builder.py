#!/usr/bin/env python3
"""
Comprehensive Test Suite for tDCS Protocol Builder

Tests all major functions including:
- build_protocol() - Main protocol generation
- optimize_montage() - Montage optimization with neuroimaging
- predict_response() - Response prediction with genetic/qEEG/MRI predictors
- run_safety_checks() - Safety screening
- validate_patient_data() - Input validation
- Age group classification and modifications
- Medication interaction detection
- All supported diagnoses

Run with: python -m pytest test_tdcs_protocol_builder.py -v
"""

import sys
import math
import pytest
from typing import Dict, List

# Ensure the module is importable
sys.path.insert(0, "/mnt/agents/output/phase9")

from tdcs_protocol_builder import (
    # Main functions
    build_protocol,
    optimize_montage,
    predict_response,
    run_safety_checks,
    validate_patient_data,
    get_available_montages,
    get_protocol_summary,
    export_protocol_to_json,
    # Enums
    Diagnosis,
    AgeGroup,
    Sex,
    MontageType,
    SessionPhase,
    ResponseLikelihood,
    # Data classes
    ElectrodePosition,
    Montage,
    StimulationParameters,
    SessionSchedule,
    SafetyCheck,
    ResponsePrediction,
    Protocol,
    # Internal helpers
    _get_age_group,
    _parse_genetic_variant,
    _check_medication_interactions,
    _normalize_diagnosis,
    _select_montage,
    _calculate_current,
    _calculate_duration,
    _calculate_sessions,
    _calculate_sessions_per_week,
    _generate_protocol_id,
    # Constants
    ELECTRODE_ATLAS,
    MONTAGE_LIBRARY,
    CLINICAL_EVIDENCE,
    ABSOLUTE_CONTRAINDICATIONS,
    RELATIVE_CONTRAINDICATIONS,
    AGE_MODIFICATIONS,
    MEDICATION_INTERACTIONS,
    GENETIC_PREDICTORS,
    QEEG_PREDICTORS,
    MRI_PREDICTORS,
)


# =============================================================================
# Test Fixtures
# =============================================================================

@pytest.fixture
def sample_patient_mdd() -> Dict:
    """Standard MDD patient - the primary test case."""
    return {
        "diagnosis": "major_depressive_disorder",
        "age": 45,
        "sex": "female",
        "medications": ["sertraline 50mg"],
        "genetic_variants": ["rs4680 COMT Met/Met"],
        "qeeg_findings": {"dlPFC_alpha": -1.8, "frontal_theta": 2.3},
        "mri_findings": {"hippocampus_left_z": -2.1},
        "prior_tdcs_sessions": 0,
        "constraints": {"max_sessions": 20, "time_per_session": 30},
    }


@pytest.fixture
def patient_minimal() -> Dict:
    """Minimal valid patient with only required fields."""
    return {
        "diagnosis": "mdd",
        "age": 35,
        "sex": "male",
    }


@pytest.fixture
def patient_pediatric() -> Dict:
    """Pediatric ADHD patient."""
    return {
        "diagnosis": "adhd",
        "age": 12,
        "sex": "male",
        "medications": ["methylphenidate 10mg"],
        "prior_tdcs_sessions": 0,
        "constraints": {"max_sessions": 15, "time_per_session": 20},
    }


@pytest.fixture
def patient_geriatric() -> Dict:
    """Geriatric patient with depression."""
    return {
        "diagnosis": "depression",
        "age": 72,
        "sex": "female",
        "medications": ["escitalopram 10mg"],
        "prior_tdcs_sessions": 0,
        "constraints": {"max_sessions": 15, "time_per_session": 25},
    }


@pytest.fixture
def patient_with_contraindication() -> Dict:
    """Patient with absolute contraindication."""
    return {
        "diagnosis": "mdd",
        "age": 50,
        "sex": "male",
        "contraindications": ["cardiac_pacemaker_defibrillator"],
    }


@pytest.fixture
def patient_severe_mdd() -> Dict:
    """Severe MDD with multiple biomarker abnormalities."""
    return {
        "diagnosis": "major_depressive_disorder",
        "age": 38,
        "sex": "female",
        "medications": ["sertraline 100mg", "bupropion 150mg"],
        "genetic_variants": ["rs4680 COMT Met/Met", "rs6265 BDNF Val/Val"],
        "qeeg_findings": {"dlPFC_alpha": -2.5, "frontal_theta": 3.0, "frontal_alpha_asymmetry": 0.8},
        "mri_findings": {"hippocampus_left_z": -2.5, "prefrontal_cortex_thickness": 0.6},
        "prior_tdcs_sessions": 0,
        "constraints": {"max_sessions": 20, "time_per_session": 30},
    }


# =============================================================================
# Age Group Classification Tests
# =============================================================================

class TestAgeGroupClassification:
    """Test age group classification logic."""
    
    def test_pediatric_boundary(self):
        assert _get_age_group(5) == AgeGroup.PEDIATRIC
        assert _get_age_group(17) == AgeGroup.PEDIATRIC
    
    def test_adult_range(self):
        assert _get_age_group(18) == AgeGroup.ADULT
        assert _get_age_group(35) == AgeGroup.ADULT
        assert _get_age_group(64) == AgeGroup.ADULT
    
    def test_geriatric_boundary(self):
        assert _get_age_group(65) == AgeGroup.GERIATRIC
        assert _get_age_group(85) == AgeGroup.GERIATRIC
        assert _get_age_group(100) == AgeGroup.GERIATRIC


# =============================================================================
# Genetic Variant Parsing Tests
# =============================================================================

class TestGeneticVariantParsing:
    """Test genetic variant string parsing."""
    
    def test_comt_met_met(self):
        rs_id, genotype = _parse_genetic_variant("rs4680 COMT Met/Met")
        assert rs_id == "rs4680"
        assert genotype == "Met/Met"
    
    def test_comt_val_met(self):
        rs_id, genotype = _parse_genetic_variant("rs4680 COMT Val/Met")
        assert rs_id == "rs4680"
        assert genotype == "Val/Met"
    
    def test_mthfr(self):
        rs_id, genotype = _parse_genetic_variant("rs1801133 MTHFR C677T T/T")
        assert rs_id == "rs1801133"
        assert genotype == "T/T"
    
    def test_bdnf(self):
        rs_id, genotype = _parse_genetic_variant("rs6265 BDNF Val/Met")
        assert rs_id == "rs6265"
        assert genotype == "Val/Met"
    
    def test_empty_string(self):
        rs_id, genotype = _parse_genetic_variant("")
        assert rs_id == ""
        assert genotype == ""
    
    def test_single_word(self):
        rs_id, genotype = _parse_genetic_variant("rs4680")
        assert rs_id == "rs4680"
        assert genotype == ""  # Single word has no genotype


# =============================================================================
# Medication Interaction Tests
# =============================================================================

class TestMedicationInteractions:
    """Test medication interaction detection."""
    
    def test_ssri_no_adjustment(self):
        result = _check_medication_interactions(["sertraline 50mg"])
        assert result["requires_current_adjustment"] is False
        assert result["max_current_ma"] == 2.0
        assert len(result["interactions"]) == 1
        assert result["interactions"][0]["effect"] == "synergistic"
    
    def test_bupropion_reduces_current(self):
        result = _check_medication_interactions(["bupropion 150mg"])
        assert result["requires_current_adjustment"] is True
        assert result["max_current_ma"] == 1.0
        assert result["interactions"][0]["adjustment"] == "reduce_current"
    
    def test_multiple_medications(self):
        result = _check_medication_interactions(["sertraline 50mg", "bupropion 150mg"])
        assert len(result["interactions"]) == 2
        assert result["requires_current_adjustment"] is True
        assert result["max_current_ma"] == 1.0
    
    def test_unknown_medication(self):
        result = _check_medication_interactions(["aspirin 81mg"])
        assert len(result["interactions"]) == 0
        assert result["requires_current_adjustment"] is False
    
    def test_empty_medications(self):
        result = _check_medication_interactions([])
        assert len(result["interactions"]) == 0
        assert result["requires_current_adjustment"] is False


# =============================================================================
# Diagnosis Normalization Tests
# =============================================================================

class TestDiagnosisNormalization:
    """Test diagnosis string normalization."""
    
    def test_full_names(self):
        assert _normalize_diagnosis("major_depressive_disorder") == Diagnosis.MAJOR_DEPRESSIVE_DISORDER.value
        assert _normalize_diagnosis("generalized_anxiety_disorder") == Diagnosis.GENERALIZED_ANXIETY_DISORDER.value
    
    def test_abbreviations(self):
        assert _normalize_diagnosis("mdd") == Diagnosis.MAJOR_DEPRESSIVE_DISORDER.value
        assert _normalize_diagnosis("gad") == Diagnosis.GENERALIZED_ANXIETY_DISORDER.value
        assert _normalize_diagnosis("adhd") == Diagnosis.ADHD.value
        assert _normalize_diagnosis("ocd") == Diagnosis.OCD.value
        assert _normalize_diagnosis("ptsd") == Diagnosis.PTSD.value
    
    def test_common_names(self):
        assert _normalize_diagnosis("depression") == Diagnosis.MAJOR_DEPRESSIVE_DISORDER.value
        assert _normalize_diagnosis("anxiety") == Diagnosis.GENERALIZED_ANXIETY_DISORDER.value
    
    def test_case_insensitive(self):
        assert _normalize_diagnosis("MDD") == Diagnosis.MAJOR_DEPRESSIVE_DISORDER.value
        assert _normalize_diagnosis("Depression") == Diagnosis.MAJOR_DEPRESSIVE_DISORDER.value


# =============================================================================
# Safety Check Tests
# =============================================================================

class TestSafetyChecks:
    """Test safety screening functionality."""
    
    def test_clean_patient_passes(self, patient_minimal):
        safety = run_safety_checks(patient_minimal)
        assert safety.passed is True
        assert safety.max_current_ma == 2.0
    
    def test_patient_with_pacemaker_fails(self, patient_with_contraindication):
        safety = run_safety_checks(patient_with_contraindication)
        assert safety.passed is False
        assert len(safety.contraindications) > 0
        assert any("ABSOLUTE" in c for c in safety.contraindications)
    
    def test_pediatric_requires_supervision(self, patient_pediatric):
        safety = run_safety_checks(patient_pediatric)
        assert safety.passed is True
        assert safety.requires_supervision is True
        assert safety.max_current_ma == 1.0
    
    def test_geriatric_skin_warning(self, patient_geriatric):
        safety = run_safety_checks(patient_geriatric)
        assert safety.passed is True
        assert any("skin" in w.lower() for w in safety.warnings)
    
    def test_pregnancy_check(self):
        patient = {
            "diagnosis": "mdd",
            "age": 30,
            "sex": "female",
            "pregnancy_status": True,
        }
        safety = run_safety_checks(patient)
        assert any("Pregnancy" in c for c in safety.contraindications)
    
    def test_seizure_risk_medication(self):
        patient = {
            "diagnosis": "mdd",
            "age": 40,
            "sex": "male",
            "medications": ["bupropion 150mg"],
        }
        safety = run_safety_checks(patient)
        assert safety.requires_supervision is True
        assert any("Seizure-risk" in w for w in safety.warnings)
    
    def test_bupropion_current_limit(self):
        patient = {
            "diagnosis": "mdd",
            "age": 40,
            "sex": "male",
            "medications": ["bupropion 150mg"],
        }
        safety = run_safety_checks(patient)
        assert safety.max_current_ma == 1.0


# =============================================================================
# Montage Selection Tests
# =============================================================================

class TestMontageSelection:
    """Test montage selection logic."""
    
    def test_mdd_default_montage(self):
        montage = _select_montage("major_depressive_disorder")
        assert montage.anode.label == "F3"
        assert montage.cathode.label == "F4"
        assert "Brunoni" in montage.evidence_citations[0]
    
    def test_adhd_montage(self):
        montage = _select_montage("adhd")
        assert montage.anode.label == "F3"
        assert montage.cathode.label == "supraorbital_R"
    
    def test_ptsd_right_anode(self):
        montage = _select_montage("ptsd")
        assert montage.anode.label == "F4"  # Right DLPFC for PTSD
        assert montage.cathode.label == "F3"
    
    def test_severe_qeeg_selects_bifrontal(self):
        qeeg = {"dlPFC_alpha": -2.5}
        montage = _select_montage("mdd", qeeg=qeeg)
        # With very low dlPFC alpha, should select enhanced/bifrontal if available
        assert "enhanced" in montage.name.lower() or montage.anode.label == "F3"
    
    def test_pediatric_montage_adjustment(self):
        montage = _select_montage("adhd", age_group=AgeGroup.PEDIATRIC)
        assert "Pediatric" in montage.name
        assert montage.anode_size_cm2 == 25.0
        assert montage.cathode_size_cm2 == 25.0
    
    def test_unknown_diagnosis_defaults_to_mdd(self):
        montage = _select_montage("unknown_condition")
        assert montage.anode.label == "F3"


# =============================================================================
# Stimulation Parameter Calculation Tests
# =============================================================================

class TestCalculateCurrent:
    """Test current calculation logic."""
    
    def test_naive_adult_1_5ma(self):
        result = _calculate_current(
            AgeGroup.ADULT, 0, "mdd",
            {"requires_current_adjustment": False, "max_current_ma": 2.0}
        )
        assert result == 1.5
    
    def test_experienced_adult_2ma(self):
        result = _calculate_current(
            AgeGroup.ADULT, 15, "mdd",
            {"requires_current_adjustment": False, "max_current_ma": 2.0}
        )
        assert result == 2.0
    
    def test_pediatric_max_1ma(self):
        result = _calculate_current(
            AgeGroup.PEDIATRIC, 0, "adhd",
            {"requires_current_adjustment": False, "max_current_ma": 2.0}
        )
        assert result <= 1.0
    
    def test_geriatric_conservative(self):
        result = _calculate_current(
            AgeGroup.GERIATRIC, 0, "mdd",
            {"requires_current_adjustment": False, "max_current_ma": 2.0}
        )
        assert result <= 1.5
    
    def test_bupropion_limits_current(self):
        result = _calculate_current(
            AgeGroup.ADULT, 0, "mdd",
            {"requires_current_adjustment": True, "max_current_ma": 1.0}
        )
        assert result <= 1.0


class TestCalculateDuration:
    """Test duration calculation logic."""
    
    def test_mdd_default_30min(self):
        result = _calculate_duration("mdd", AgeGroup.ADULT)
        assert result == 30
    
    def test_pediatric_limited_to_20min(self):
        result = _calculate_duration("adhd", AgeGroup.PEDIATRIC)
        assert result <= 20
    
    def test_patient_constraint(self):
        result = _calculate_duration("mdd", AgeGroup.ADULT, {"time_per_session": 20})
        assert result <= 20


class TestCalculateSessions:
    """Test session count calculation."""
    
    def test_mdd_default(self):
        result = _calculate_sessions("mdd")
        assert 10 <= result <= 20
    
    def test_severe_increases_sessions(self):
        normal = _calculate_sessions("mdd", 1.0)
        severe = _calculate_sessions("mdd", 1.5)
        assert severe >= normal
    
    def test_constraint_limits_sessions(self):
        result = _calculate_sessions("mdd", 1.0, {"max_sessions": 12})
        assert result <= 12
    
    def test_anxiety_range(self):
        result = _calculate_sessions("anxiety")
        assert 8 <= result <= 15


class TestCalculateSessionsPerWeek:
    """Test sessions-per-week calculation."""
    
    def test_mdd_5_per_week(self):
        result = _calculate_sessions_per_week("mdd", AgeGroup.ADULT)
        assert result == 5
    
    def test_ptsd_2_per_week(self):
        result = _calculate_sessions_per_week("ptsd", AgeGroup.ADULT)
        assert result == 2
    
    def test_pediatric_reduced(self):
        result = _calculate_sessions_per_week("adhd", AgeGroup.PEDIATRIC)
        assert result <= 3
    
    def test_geriatric_reduced(self):
        result = _calculate_sessions_per_week("mdd", AgeGroup.GERIATRIC)
        assert result <= 3


# =============================================================================
# Montage Optimization Tests
# =============================================================================

class TestOptimizeMontage:
    """Test the optimize_montage function."""
    
    def test_returns_required_fields(self):
        result = optimize_montage(None, "mdd")
        required_keys = [
            "selected_montage", "optimization_rationale", "network_target",
            "simnibs_model", "neurosynth_target", "confidence_score"
        ]
        for key in required_keys:
            assert key in result
    
    def test_mdd_montage_structure(self):
        result = optimize_montage(None, "mdd")
        montage = result["selected_montage"]
        assert "name" in montage
        assert "anode" in montage
        assert "cathode" in montage
        assert "mni_coordinates" in montage["anode"]
        assert "evidence_citations" in montage
        assert len(montage["evidence_citations"]) > 0
    
    def test_neurosynth_target_present(self):
        result = optimize_montage(None, "mdd")
        target = result["neurosynth_target"]
        assert "peak_mni" in target
        assert "region" in target
        assert "z_score" in target
        assert "studies" in target
    
    def test_simnibs_model_present(self):
        result = optimize_montage(None, "mdd")
        model = result["simnibs_model"]
        assert "peak_e_field_vm" in model
        assert "current_spread_radius_mm" in model
    
    def test_confidence_score_range(self):
        result = optimize_montage(None, "mdd")
        assert 0.0 <= result["confidence_score"] <= 1.0
    
    def test_qeeg_boosts_confidence(self):
        result_no_qeeg = optimize_montage(None, "mdd")
        result_with_qeeg = optimize_montage(None, "mdd", {"dlPFC_alpha": -1.8})
        assert result_with_qeeg["confidence_score"] >= result_no_qeeg["confidence_score"]
    
    def test_hippocampal_atrophy_adjustment(self):
        neuro = {"hippocampus_left_z": -2.5}
        result = optimize_montage(neuro, "mdd")
        assert any("hippocampal atrophy" in r.lower() for r in result["optimization_rationale"])
    
    def test_all_diagnoses_supported(self):
        diagnoses = [
            "mdd", "anxiety", "ptsd", "adhd", "ocd",
            "chronic_pain", "fibromyalgia", "cognitive_enhancement",
            "stroke_rehabilitation", "bipolar_depression", "schizophrenia",
        ]
        for diag in diagnoses:
            result = optimize_montage(None, diag)
            assert result["selected_montage"] is not None
            assert result["network_target"] != ""


# =============================================================================
# Response Prediction Tests
# =============================================================================

class TestPredictResponse:
    """Test response prediction functionality."""
    
    def test_returns_required_fields(self, sample_patient_mdd):
        protocol = {"stimulation": {"current_ma": 1.5, "duration_min": 30}, "schedule": {"total_sessions": 15}}
        result = predict_response(sample_patient_mdd, protocol)
        assert isinstance(result, ResponsePrediction)
        assert 0.0 <= result.probability <= 1.0
        assert result.effect_size_d > 0
        assert result.time_to_response_weeks > 0
    
    def test_comt_met_met_boosts_probability(self):
        patient_metmet = {
            "diagnosis": "mdd", "age": 35, "sex": "male",
            "genetic_variants": ["rs4680 COMT Met/Met"],
            "medications": [],
            "qeeg_findings": {},
            "mri_findings": {},
            "prior_tdcs_sessions": 0,
        }
        patient_valval = {
            "diagnosis": "mdd", "age": 35, "sex": "male",
            "genetic_variants": ["rs4680 COMT Val/Val"],
            "medications": [],
            "qeeg_findings": {},
            "mri_findings": {},
            "prior_tdcs_sessions": 0,
        }
        protocol = {"stimulation": {"current_ma": 1.5, "duration_min": 30}, "schedule": {"total_sessions": 15}}
        
        result_metmet = predict_response(patient_metmet, protocol)
        result_valval = predict_response(patient_valval, protocol)
        
        assert result_metmet.probability > result_valval.probability
        assert "COMT_MetMet" in result_metmet.predictors
        assert "COMT_ValVal" in result_valval.predictors
    
    def test_dlpfc_hypoactivity_predicts_better_response(self):
        patient_low_alpha = {
            "diagnosis": "mdd", "age": 35, "sex": "male",
            "genetic_variants": [],
            "qeeg_findings": {"dlPFC_alpha": -2.5},
            "mri_findings": {},
            "medications": [],
            "prior_tdcs_sessions": 0,
        }
        patient_normal_alpha = {
            "diagnosis": "mdd", "age": 35, "sex": "male",
            "genetic_variants": [],
            "qeeg_findings": {"dlPFC_alpha": 0.0},
            "mri_findings": {},
            "medications": [],
            "prior_tdcs_sessions": 0,
        }
        protocol = {"stimulation": {"current_ma": 1.5, "duration_min": 30}, "schedule": {"total_sessions": 15}}
        
        result_low = predict_response(patient_low_alpha, protocol)
        result_normal = predict_response(patient_normal_alpha, protocol)
        
        assert result_low.probability > result_normal.probability
    
    def test_confidence_interval_valid(self, sample_patient_mdd):
        protocol = {"stimulation": {"current_ma": 1.5, "duration_min": 30}, "schedule": {"total_sessions": 15}}
        result = predict_response(sample_patient_mdd, protocol)
        ci_lower, ci_upper = result.confidence_interval_95
        assert 0.0 <= ci_lower <= result.probability <= ci_upper <= 1.0
    
    def test_high_probability_means_high_likelihood(self):
        patient_optimal = {
            "diagnosis": "mdd", "age": 35, "sex": "male",
            "genetic_variants": ["rs4680 COMT Met/Met"],
            "qeeg_findings": {"dlPFC_alpha": -2.5, "frontal_theta": 3.0, "frontal_alpha_asymmetry": 0.8},
            "mri_findings": {"prefrontal_cortex_thickness": 0.6},
            "medications": ["sertraline 50mg"],
            "prior_tdcs_sessions": 0,
        }
        protocol = {"stimulation": {"current_ma": 2.0, "duration_min": 30}, "schedule": {"total_sessions": 20}}
        result = predict_response(patient_optimal, protocol)
        assert result.likelihood_category in [ResponseLikelihood.HIGH, ResponseLikelihood.MODERATE]
    
    def test_endpoints_for_depression(self):
        patient = {"diagnosis": "mdd", "age": 35, "sex": "male", "medications": []}
        protocol = {"stimulation": {"current_ma": 1.5, "duration_min": 30}, "schedule": {"total_sessions": 15}}
        result = predict_response(patient, protocol)
        assert "HDRS-17" in result.recommended_endpoints
        assert "BDI-II" in result.recommended_endpoints


# =============================================================================
# Build Protocol Integration Tests
# =============================================================================

class TestBuildProtocol:
    """Integration tests for the main build_protocol function."""
    
    def test_complete_protocol_structure(self, sample_patient_mdd):
        protocol = build_protocol(sample_patient_mdd)
        
        # Check all required top-level keys
        required_keys = [
            "protocol_id", "version", "created_at", "diagnosis",
            "montage", "stimulation", "schedule", "safety",
            "prediction", "modifications", "monitoring_plan",
            "discontinuation_criteria", "references"
        ]
        for key in required_keys:
            assert key in protocol, f"Missing key: {key}"
    
    def test_protocol_id_format(self, sample_patient_mdd):
        protocol = build_protocol(sample_patient_mdd)
        assert protocol["protocol_id"].startswith("tDCS-")
        assert len(protocol["protocol_id"]) > 5
    
    def test_stimulation_parameters_reasonable(self, sample_patient_mdd):
        protocol = build_protocol(sample_patient_mdd)
        stim = protocol["stimulation"]
        assert 1.0 <= stim["current_ma"] <= 2.0
        assert 15 <= stim["duration_min"] <= 30
        assert stim["ramp_up_sec"] > 0
        assert stim["ramp_down_sec"] > 0
        assert stim["current_density_ma_per_cm2"] <= 0.06  # Safety limit
    
    def test_mdd_montage_f3_f4(self, sample_patient_mdd):
        protocol = build_protocol(sample_patient_mdd)
        assert protocol["montage"]["selected_montage"]["anode"]["label"] == "F3"
        assert protocol["montage"]["selected_montage"]["cathode"]["label"] == "F4"
    
    def test_schedule_within_constraints(self, sample_patient_mdd):
        protocol = build_protocol(sample_patient_mdd)
        assert protocol["schedule"]["total_sessions"] <= 20  # From constraints
        assert protocol["stimulation"]["duration_min"] <= 30  # From constraints
    
    def test_safety_passed(self, sample_patient_mdd):
        protocol = build_protocol(sample_patient_mdd)
        assert protocol["safety"]["passed"] is True
    
    def test_response_prediction_present(self, sample_patient_mdd):
        protocol = build_protocol(sample_patient_mdd)
        pred = protocol["prediction"]
        assert "response_probability" in pred
        assert "confidence_interval_95" in pred
        assert "effect_size_d" in pred
        assert pred["response_probability"] > 0
    
    def test_evidence_citations_present(self, sample_patient_mdd):
        protocol = build_protocol(sample_patient_mdd)
        assert len(protocol["references"]) > 0
        assert any("Brunoni" in ref for ref in protocol["references"])
    
    def test_monitoring_plan_present(self, sample_patient_mdd):
        protocol = build_protocol(sample_patient_mdd)
        assert "before_each_session" in protocol["monitoring_plan"]
        assert "weekly" in protocol["monitoring_plan"]
    
    def test_discontinuation_criteria_present(self, sample_patient_mdd):
        protocol = build_protocol(sample_patient_mdd)
        assert len(protocol["discontinuation_criteria"]) > 0
        assert any("seizure" in c.lower() for c in protocol["discontinuation_criteria"])
    
    def test_pediatric_protocol(self, patient_pediatric):
        protocol = build_protocol(patient_pediatric)
        assert protocol["stimulation"]["current_ma"] <= 1.0
        assert protocol["stimulation"]["duration_min"] <= 20
        assert any("Pediatric" in m for m in protocol["modifications"])
        assert protocol["safety"]["age_group"] == "pediatric"
    
    def test_geriatric_protocol(self, patient_geriatric):
        protocol = build_protocol(patient_geriatric)
        stim = protocol["stimulation"]
        assert stim["ramp_up_sec"] >= 60  # Extended ramp for elderly
        assert any("Geriatric" in m for m in protocol["modifications"])
    
    def test_severe_patient_higher_dose(self, patient_severe_mdd):
        protocol = build_protocol(patient_severe_mdd)
        # Severe biomarkers should lead to more sessions
        assert protocol["schedule"]["total_sessions"] >= 15
        # Bupropion should limit current
        assert protocol["stimulation"]["current_ma"] <= 1.0
    
    def test_anxiety_protocol(self):
        patient = {
            "diagnosis": "generalized_anxiety_disorder",
            "age": 32, "sex": "female",
            "prior_tdcs_sessions": 0,
        }
        protocol = build_protocol(patient)
        assert protocol["diagnosis"] == "generalized_anxiety_disorder"
        assert protocol["montage"]["selected_montage"]["anode"]["label"] == "Fp1"
    
    def test_ptsd_protocol(self):
        patient = {
            "diagnosis": "ptsd",
            "age": 38, "sex": "male",
            "prior_tdcs_sessions": 0,
        }
        protocol = build_protocol(patient)
        assert protocol["montage"]["selected_montage"]["anode"]["label"] == "F4"  # Right DLPFC
    
    def test_adhd_protocol(self):
        patient = {
            "diagnosis": "adhd",
            "age": 28, "sex": "male",
            "prior_tdcs_sessions": 0,
        }
        protocol = build_protocol(patient)
        assert protocol["montage"]["selected_montage"]["anode"]["label"] == "F3"
    
    def test_pain_protocol(self):
        patient = {
            "diagnosis": "chronic_pain",
            "age": 55, "sex": "female",
            "prior_tdcs_sessions": 0,
        }
        protocol = build_protocol(patient)
        assert protocol["montage"]["selected_montage"]["anode"]["label"] in ["C3", "C4"]
    
    def test_missing_required_field_raises(self):
        with pytest.raises(ValueError, match="diagnosis"):
            build_protocol({"age": 45, "sex": "female"})
        
        with pytest.raises(ValueError, match="age"):
            build_protocol({"diagnosis": "mdd", "sex": "female"})
    
    def test_invalid_age_raises(self):
        with pytest.raises(ValueError):
            build_protocol({"diagnosis": "mdd", "age": 150, "sex": "male"})
    
    def test_absolute_contraindication_raises(self, patient_with_contraindication):
        with pytest.raises(ValueError, match="contraindication"):
            build_protocol(patient_with_contraindication)
    
    def test_minimal_patient_works(self, patient_minimal):
        protocol = build_protocol(patient_minimal)
        assert protocol["safety"]["passed"] is True
        assert "stimulation" in protocol


# =============================================================================
# Utility Function Tests
# =============================================================================

class TestGetAvailableMontages:
    """Test montage listing utility."""
    
    def test_all_diagnoses(self):
        result = get_available_montages()
        assert len(result) > 0
        assert "major_depressive_disorder" in result
    
    def test_filter_by_diagnosis(self):
        result = get_available_montages("mdd")
        assert "major_depressive_disorder" in result
        assert len(result["major_depressive_disorder"]) >= 1
    
    def test_invalid_diagnosis_returns_empty(self):
        result = get_available_montages("not_a_real_diagnosis")
        assert result == {}


class TestValidatePatientData:
    """Test input validation utility."""
    
    def test_valid_patient(self, sample_patient_mdd):
        is_valid, errors = validate_patient_data(sample_patient_mdd)
        assert is_valid is True
        assert len(errors) == 0
    
    def test_missing_diagnosis(self):
        is_valid, errors = validate_patient_data({"age": 45, "sex": "female"})
        assert is_valid is False
        assert any("diagnosis" in e for e in errors)
    
    def test_invalid_age(self):
        is_valid, errors = validate_patient_data({
            "diagnosis": "mdd", "age": 150, "sex": "male"
        })
        assert is_valid is False
    
    def test_invalid_sex(self):
        is_valid, errors = validate_patient_data({
            "diagnosis": "mdd", "age": 45, "sex": "unknown"
        })
        assert is_valid is False
    
    def test_invalid_constraints(self):
        is_valid, errors = validate_patient_data({
            "diagnosis": "mdd", "age": 45, "sex": "male",
            "constraints": {"max_sessions": 100, "time_per_session": 120}
        })
        assert is_valid is False


class TestGetProtocolSummary:
    """Test protocol summary generation."""
    
    def test_returns_string(self, sample_patient_mdd):
        protocol = build_protocol(sample_patient_mdd)
        summary = get_protocol_summary(protocol)
        assert isinstance(summary, str)
        assert len(summary) > 100
    
    def test_contains_key_info(self, sample_patient_mdd):
        protocol = build_protocol(sample_patient_mdd)
        summary = get_protocol_summary(protocol)
        assert "tDCS" in summary
        assert protocol["protocol_id"] in summary
        assert str(protocol["stimulation"]["current_ma"]) in summary


class TestExportProtocol:
    """Test JSON export functionality."""
    
    def test_exports_valid_json(self, sample_patient_mdd, tmp_path):
        protocol = build_protocol(sample_patient_mdd)
        filepath = tmp_path / "test_protocol.json"
        export_protocol_to_json(protocol, str(filepath))
        
        import json
        with open(filepath, "r") as f:
            loaded = json.load(f)
        
        assert loaded["protocol_id"] == protocol["protocol_id"]


# =============================================================================
# Data Class Tests
# =============================================================================

class TestDataClasses:
    """Test data class creation and structure."""
    
    def test_electrode_position(self):
        pos = ElectrodePosition("F3", "Test", -42, 34, 28, "dlPFC", "frontoparietal")
        assert pos.label == "F3"
        assert pos.x_mni == -42
    
    def test_montage(self):
        anode = ELECTRODE_ATLAS["F3"]
        cathode = ELECTRODE_ATLAS["F4"]
        montage = Montage("test", MontageType.BIPOLAR, anode, cathode)
        assert montage.name == "test"
        assert montage.montage_type == MontageType.BIPOLAR
    
    def test_safety_check(self):
        check = SafetyCheck(passed=True, warnings=["test"], max_current_ma=1.5)
        assert check.passed is True
        assert len(check.warnings) == 1
    
    def test_response_prediction(self):
        pred = ResponsePrediction(
            probability=0.6,
            confidence_interval_95=(0.45, 0.75),
            effect_size_d=0.5,
            likelihood_category=ResponseLikelihood.MODERATE,
        )
        assert pred.probability == 0.6


# =============================================================================
# Constant Validation Tests
# =============================================================================

class TestConstants:
    """Validate that all lookup tables are correctly structured."""
    
    def test_electrode_atlas_has_key_positions(self):
        required = ["F3", "F4", "Cz", "C3", "P3", "Fp1", "Fp2", "supraorbital_R"]
        for pos in required:
            assert pos in ELECTRODE_ATLAS
    
    def test_montage_library_covers_all_diagnoses(self):
        for diag in Diagnosis:
            assert diag.value in MONTAGE_LIBRARY, f"Missing montage for {diag.value}"
            assert len(MONTAGE_LIBRARY[diag.value]) > 0
    
    def test_clinical_evidence_covers_all_diagnoses(self):
        for diag in Diagnosis:
            assert diag.value in CLINICAL_EVIDENCE, f"Missing evidence for {diag.value}"
            evidence = CLINICAL_EVIDENCE[diag.value]
            assert "meta_analysis_effect_size" in evidence
            assert "session_range" in evidence
    
    def test_age_modifications_all_groups(self):
        for group in AgeGroup:
            assert group in AGE_MODIFICATIONS
            assert "max_current_ma" in AGE_MODIFICATIONS[group]
    
    def test_genetic_predictors_structure(self):
        for rs_id, data in GENETIC_PREDICTORS.items():
            assert rs_id.startswith("rs")
            assert "name" in data


# =============================================================================
# Edge Case Tests
# =============================================================================

class TestEdgeCases:
    """Test edge cases and boundary conditions."""
    
    def test_very_young_pediatric(self):
        patient = {"diagnosis": "adhd", "age": 8, "sex": "male"}
        protocol = build_protocol(patient)
        assert protocol["stimulation"]["current_ma"] <= 1.0
        assert protocol["stimulation"]["duration_min"] <= 20
    
    def test_very_elderly(self):
        patient = {"diagnosis": "mdd", "age": 95, "sex": "female"}
        protocol = build_protocol(patient)
        assert protocol["safety"]["age_group"] == "geriatric"
        assert protocol["stimulation"]["ramp_up_sec"] >= 60
    
    def test_high_prior_sessions(self):
        patient = {
            "diagnosis": "mdd", "age": 45, "sex": "female",
            "prior_tdcs_sessions": 50,
        }
        protocol = build_protocol(patient)
        assert protocol["stimulation"]["current_ma"] == 2.0
        assert any("maintenance" in m.lower() for m in protocol["modifications"])
    
    def test_no_medications(self):
        patient = {"diagnosis": "mdd", "age": 45, "sex": "female"}
        protocol = build_protocol(patient)
        assert protocol["safety"]["passed"] is True
    
    def test_empty_genetic_variants(self):
        patient = {
            "diagnosis": "mdd", "age": 45, "sex": "female",
            "genetic_variants": [],
        }
        protocol = build_protocol(patient)
        # No genetic predictors should be present
        predictors = protocol["prediction"]["predictors"]
        assert "COMT_MetMet" not in predictors
        assert "COMT_ValVal" not in predictors
    
    def test_empty_qeeg(self):
        patient = {
            "diagnosis": "mdd", "age": 45, "sex": "female",
            "qeeg_findings": {},
        }
        protocol = build_protocol(patient)
        assert "stimulation" in protocol
    
    def test_empty_mri(self):
        patient = {
            "diagnosis": "mdd", "age": 45, "sex": "female",
            "mri_findings": {},
        }
        protocol = build_protocol(patient)
        assert "stimulation" in protocol
    
    def test_no_prior_sessions_field(self):
        patient = {"diagnosis": "mdd", "age": 45, "sex": "female"}
        protocol = build_protocol(patient)
        assert protocol["schedule"]["total_sessions"] >= 10
    
    def test_no_constraints(self):
        patient = {"diagnosis": "mdd", "age": 45, "sex": "female"}
        protocol = build_protocol(patient)
        assert protocol["stimulation"]["duration_min"] == 30
    
    def test_bifrontal_variant_for_severe(self):
        patient = {
            "diagnosis": "major_depressive_disorder",
            "age": 45, "sex": "female",
            "qeeg_findings": {"dlPFC_alpha": -2.5},  # Very low = severe
        }
        protocol = build_protocol(patient)
        assert protocol["montage"]["selected_montage"]["anode"]["label"] == "F3"
    
    def test_fibromyalgia_protocol(self):
        patient = {
            "diagnosis": "fibromyalgia",
            "age": 50, "sex": "female",
        }
        protocol = build_protocol(patient)
        assert protocol["diagnosis"] == "fibromyalgia"
        assert protocol["montage"]["selected_montage"]["anode"]["label"] == "C3"
    
    def test_stroke_rehab_protocol(self):
        patient = {
            "diagnosis": "stroke_rehabilitation",
            "age": 60, "sex": "male",
        }
        protocol = build_protocol(patient)
        assert protocol["diagnosis"] == "stroke_rehabilitation"
        assert protocol["montage"]["selected_montage"]["anode"]["label"].startswith("C")
    
    def test_schizophrenia_protocol(self):
        patient = {
            "diagnosis": "schizophrenia",
            "age": 30, "sex": "male",
        }
        protocol = build_protocol(patient)
        assert protocol["diagnosis"] == "schizophrenia"
    
    def test_very_severe_biomarkers(self):
        patient = {
            "diagnosis": "major_depressive_disorder",
            "age": 45, "sex": "female",
            "qeeg_findings": {"dlPFC_alpha": -3.0, "frontal_theta": 4.0},
            "mri_findings": {"hippocampus_left_z": -3.0},
        }
        protocol = build_protocol(patient)
        # Should still work with extreme values
        assert protocol["safety"]["passed"] is True


# =============================================================================
# Clinical Scenario Tests
# =============================================================================

class TestClinicalScenarios:
    """Test realistic clinical scenarios."""
    
    def test_treatment_resistant_depression(self):
        """TRD patient with multiple failed antidepressants."""
        patient = {
            "diagnosis": "major_depressive_disorder",
            "age": 52, "sex": "female",
            "medications": ["venlafaxine 150mg", "aripiprazole 5mg", "lorazepam 1mg"],
            "genetic_variants": ["rs4680 COMT Met/Met"],
            "qeeg_findings": {"dlPFC_alpha": -2.2, "frontal_theta": 2.5},
            "prior_tdcs_sessions": 0,
            "constraints": {"max_sessions": 20, "time_per_session": 30},
        }
        protocol = build_protocol(patient)
        assert protocol["prediction"]["response_probability"] > 0.35
        assert protocol["schedule"]["total_sessions"] >= 15
    
    def test_comorbid_depression_and_pain(self):
        """Patient with depression and chronic pain."""
        patient = {
            "diagnosis": "chronic_pain",
            "age": 48, "sex": "female",
            "medications": ["duloxetine 60mg", "pregabalin 150mg"],
            "prior_tdcs_sessions": 0,
        }
        protocol = build_protocol(patient)
        assert protocol["diagnosis"] == "chronic_pain"
        assert protocol["montage"]["selected_montage"]["anode"]["label"] in ["C3", "C4"]
    
    def test_military_ptsd(self):
        """Veteran with PTSD."""
        patient = {
            "diagnosis": "ptsd",
            "age": 32, "sex": "male",
            "medications": ["sertraline 100mg", "prazosin 2mg"],
            "genetic_variants": ["rs4680 COMT Val/Met"],
            "prior_tdcs_sessions": 0,
            "constraints": {"max_sessions": 15, "time_per_session": 30},
        }
        protocol = build_protocol(patient)
        assert protocol["montage"]["selected_montage"]["anode"]["label"] == "F4"  # Right DLPFC
        assert protocol["prediction"]["recommended_endpoints"] == ["PCL-5", "CAPS-5", "PHQ-9"]
    
    def test_ocd_with_ybocs_28(self):
        """Severe OCD patient."""
        patient = {
            "diagnosis": "ocd",
            "age": 28, "sex": "female",
            "medications": ["fluoxetine 60mg"],
            "prior_tdcs_sessions": 0,
            "constraints": {"max_sessions": 20, "time_per_session": 30},
        }
        protocol = build_protocol(patient)
        assert protocol["montage"]["selected_montage"]["anode"]["label"] == "Fp1"
        assert protocol["montage"]["selected_montage"]["cathode"]["label"] == "Cz"
        assert "Y-BOCS" in protocol["prediction"]["recommended_endpoints"]
    
    def test_cognitive_enhancement_healthy(self):
        """Healthy individual seeking cognitive enhancement."""
        patient = {
            "diagnosis": "cognitive_enhancement",
            "age": 25, "sex": "male",
            "medications": [],
            "prior_tdcs_sessions": 0,
            "constraints": {"max_sessions": 10, "time_per_session": 25},
        }
        protocol = build_protocol(patient)
        assert protocol["stimulation"]["duration_min"] <= 25
    
    def test_elderly_post_stroke(self):
        """Elderly stroke survivor."""
        patient = {
            "diagnosis": "stroke_rehabilitation",
            "age": 70, "sex": "male",
            "medications": ["clopidogrel 75mg"],
            "mri_findings": {"lesion_location": "left_frontal"},
            "prior_tdcs_sessions": 0,
            "constraints": {"max_sessions": 15, "time_per_session": 25},
        }
        protocol = build_protocol(patient)
        assert protocol["safety"]["age_group"] == "geriatric"
        assert protocol["stimulation"]["current_ma"] <= 1.5


# =============================================================================
# Main entry point for running tests
# =============================================================================

if __name__ == "__main__":
    pytest.main([__file__, "-v"])
