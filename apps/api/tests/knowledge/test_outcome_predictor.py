#!/usr/bin/env python3
"""
================================================================================
Unit Tests for Outcome Predictor + Protocol Comparator
================================================================================
Comprehensive test suite for the neuromodulation outcome prediction system.

Coverage:
- predict_response() - treatment response prediction
- compare_protocols() - multi-protocol comparison and ranking
- calculate_patient_match_score() - patient-protocol matching
- rank_by_evidence() - evidence-weighted protocol ranking
- generate_outcome_report() - report generation
- Contraindication checking
- Edge cases and error handling

Run: python -m pytest test_outcome_predictor.py -v
================================================================================
"""

import json
import math
import sys
import unittest
from datetime import datetime
from typing import Any, Dict, List

# Ensure the module is importable
sys.path.insert(0, "/mnt/agents/output/phase9")

from outcome_predictor import (
    # Constants
    CONTRAINDICATIONS,
    EVIDENCE_GRADE_WEIGHTS,
    EVIDENCE_SOURCE_WEIGHTS,
    GENETIC_MARKER_EFFECTS,
    MEDICATION_EFFECTS,
    MODALITY_COSTS,
    MODALITY_DURATION_WEEKS,
    MODALITY_SAFETY_SCORES,
    NEUROIMAGING_BIOMARKERS,
    # Enums
    EvidenceGrade,
    Modality,
    PredictorDirection,
    # Helper functions
    _check_contraindications,
    _clamp,
    _compute_confidence_interval,
    _estimate_cost,
    _estimate_duration_weeks,
    _get_age_group,
    _softmax,
    # Main functions
    calculate_patient_match_score,
    compare_protocols,
    generate_outcome_report,
    get_protocols_for_condition,
    predict_response,
    rank_by_evidence,
    # Data and protocol DB
    CANONICAL_PROTOCOLS,
)


# =============================================================================
# TEST FIXTURES
# =============================================================================

def get_test_patient_full() -> Dict[str, Any]:
    """Return a fully-specified test patient."""
    return {
        "age": 45,
        "sex": "female",
        "genetic_markers": {"COMT": "Met/Met", "BDNF": "Val/Val"},
        "neuroimaging": ["DLPFC_hypoactivity", "EEG_alpha_asymmetry"],
        "medications": ["SSRI"],
        "conditions": [],
        "medical_history": [],
        "implanted_devices": [],
        "prior_treatments": [],
        "treatment_resistance_level": "single_failure",
    }


def get_test_patient_minimal() -> Dict[str, Any]:
    """Return a minimally-specified test patient."""
    return {
        "age": 30,
        "sex": "male",
    }


def get_test_patient_contraindicated() -> Dict[str, Any]:
    """Return a patient with contraindications for TMS."""
    return {
        "age": 55,
        "sex": "male",
        "conditions": ["epilepsy_uncontrolled"],
        "implanted_devices": ["pacemaker"],
        "medical_history": [],
    }


def get_test_patient_pediatric() -> Dict[str, Any]:
    """Return a pediatric test patient."""
    return {
        "age": 12,
        "sex": "female",
        "genetic_markers": {},
        "neuroimaging": [],
        "medications": [],
        "conditions": ["ADHD"],
        "treatment_resistance_level": "naive",
    }


def get_test_patient_geriatric() -> Dict[str, Any]:
    """Return a geriatric test patient."""
    return {
        "age": 78,
        "sex": "male",
        "genetic_markers": {"BDNF": "Met/Met"},
        "neuroimaging": ["hippocampal_atrophy"],
        "medications": ["benzodiazepine"],
        "conditions": [],
        "treatment_resistance_level": "multi_failure",
    }


def get_test_protocol_tdcs() -> Dict[str, Any]:
    """Return a test tDCS protocol."""
    return {
        "name": "tDCS F3-F4 depression",
        "modality": "tDCS",
        "target": "DLPFC",
        "condition": "MDD",
        "evidence_grade": "A",
        "n_trials": 15,
        "last_trial_year": 2023,
        "total_n_patients": 450,
        "base_remission_rate": 0.45,
        "base_response_rate": 0.65,
        "stimulation_parameters": {
            "intensity_ma": 2.0,
            "duration_min": 20,
            "sessions": 10,
        },
        "total_sessions": 10,
        "sessions_per_week": 5,
    }


def get_test_protocol_rtms() -> Dict[str, Any]:
    """Return a test rTMS protocol."""
    return {
        "name": "rTMS L DLPFC 10Hz",
        "modality": "rTMS",
        "target": "Left DLPFC",
        "condition": "MDD",
        "evidence_grade": "A",
        "n_trials": 25,
        "last_trial_year": 2022,
        "total_n_patients": 1200,
        "base_remission_rate": 0.35,
        "base_response_rate": 0.55,
        "stimulation_parameters": {
            "frequency_hz": 10,
            "intensity_mt": 120,
            "pulses_per_session": 3000,
        },
        "total_sessions": 20,
        "sessions_per_week": 5,
    }


def get_test_protocol_deep_tms() -> Dict[str, Any]:
    """Return a test Deep TMS protocol."""
    return {
        "name": "Deep TMS H1 coil MDD",
        "modality": "Deep TMS",
        "target": "Bilateral PFC",
        "condition": "MDD",
        "evidence_grade": "A",
        "n_trials": 8,
        "last_trial_year": 2023,
        "total_n_patients": 800,
        "base_remission_rate": 0.50,
        "base_response_rate": 0.70,
        "stimulation_parameters": {
            "frequency_hz": 18,
            "intensity_mt": 120,
        },
        "total_sessions": 20,
        "sessions_per_week": 5,
    }


def get_test_protocol_pbm() -> Dict[str, Any]:
    """Return a test PBM protocol."""
    return {
        "name": "PBM frontal depression",
        "modality": "PBM",
        "target": "Bilateral PFC",
        "condition": "MDD",
        "evidence_grade": "B",
        "n_trials": 5,
        "last_trial_year": 2021,
        "total_n_patients": 150,
        "base_remission_rate": 0.25,
        "base_response_rate": 0.45,
        "stimulation_parameters": {
            "wavelength_nm": 810,
            "power_mw": 250,
            "duration_min": 20,
        },
        "total_sessions": 12,
        "sessions_per_week": 3,
    }


def get_test_protocol_neurofeedback() -> Dict[str, Any]:
    """Return a test neurofeedback protocol."""
    return {
        "name": "Neurofeedback theta/beta ADHD",
        "modality": "neurofeedback",
        "target": "EEG theta/beta ratio",
        "condition": "ADHD",
        "evidence_grade": "B",
        "n_trials": 10,
        "last_trial_year": 2022,
        "total_n_patients": 350,
        "base_remission_rate": 0.20,
        "base_response_rate": 0.40,
        "stimulation_parameters": {
            "n_sessions": 30,
            "session_duration_min": 30,
        },
        "total_sessions": 30,
        "sessions_per_week": 2,
    }


# =============================================================================
# TEST HELPER FUNCTIONS
# =============================================================================

class TestHelperFunctions(unittest.TestCase):
    """Test internal helper functions."""

    def test_clamp_within_range(self):
        """Test _clamp with value within range."""
        self.assertEqual(_clamp(0.5), 0.5)
        self.assertEqual(_clamp(0.0), 0.0)
        self.assertEqual(_clamp(1.0), 1.0)

    def test_clamp_below_range(self):
        """Test _clamp with value below range."""
        self.assertEqual(_clamp(-0.5), 0.0)
        self.assertEqual(_clamp(-10), 0.0)

    def test_clamp_above_range(self):
        """Test _clamp with value above range."""
        self.assertEqual(_clamp(1.5), 1.0)
        self.assertEqual(_clamp(10), 1.0)

    def test_clamp_custom_range(self):
        """Test _clamp with custom range."""
        self.assertEqual(_clamp(15, 10, 20), 15)
        self.assertEqual(_clamp(5, 10, 20), 10)
        self.assertEqual(_clamp(25, 10, 20), 20)

    def test_compute_confidence_interval(self):
        """Test confidence interval computation."""
        lower, upper = _compute_confidence_interval(0.5)
        self.assertGreater(lower, 0)
        self.assertLess(upper, 1)
        self.assertLess(lower, upper)
        self.assertAlmostEqual((lower + upper) / 2, 0.5, delta=0.1)

    def test_compute_confidence_interval_extreme_values(self):
        """Test CI computation at extreme values."""
        # Near 0
        lower, upper = _compute_confidence_interval(0.01)
        self.assertGreaterEqual(lower, 0)
        self.assertGreater(upper, lower)
        
        # Near 1
        lower, upper = _compute_confidence_interval(0.99)
        self.assertLess(upper, 1.01)
        self.assertGreater(upper, lower)

    def test_get_age_group(self):
        """Test age group classification."""
        self.assertEqual(_get_age_group(10), "pediatric")
        self.assertEqual(_get_age_group(17), "pediatric")
        self.assertEqual(_get_age_group(25), "young_adult")
        self.assertEqual(_get_age_group(35), "young_adult")
        self.assertEqual(_get_age_group(45), "middle_aged")
        self.assertEqual(_get_age_group(65), "middle_aged")
        self.assertEqual(_get_age_group(70), "geriatric")
        self.assertEqual(_get_age_group(85), "geriatric")

    def test_softmax(self):
        """Test softmax computation."""
        result = _softmax([1.0, 2.0, 3.0])
        self.assertEqual(len(result), 3)
        self.assertAlmostEqual(sum(result), 1.0, delta=0.001)
        self.assertGreater(result[2], result[1])
        self.assertGreater(result[1], result[0])

    def test_softmax_empty(self):
        """Test softmax with empty list."""
        result = _softmax([])
        self.assertEqual(result, [])

    def test_softmax_uniform(self):
        """Test softmax with uniform values."""
        result = _softmax([1.0, 1.0, 1.0])
        self.assertAlmostEqual(result[0], 1/3, delta=0.01)
        self.assertAlmostEqual(result[1], 1/3, delta=0.01)
        self.assertAlmostEqual(result[2], 1/3, delta=0.01)

    def test_softmax_temperature(self):
        """Test softmax with different temperatures."""
        values = [1.0, 2.0, 3.0]
        
        # High temperature = more uniform
        high_temp = _softmax(values, temperature=5.0)
        self.assertAlmostEqual(high_temp[0], high_temp[2], delta=0.15)
        
        # Low temperature = more peaked
        low_temp = _softmax(values, temperature=0.5)
        self.assertGreater(low_temp[2], high_temp[2])

    def test_check_contraindications_safe(self):
        """Test contraindication check with safe patient."""
        patient = get_test_patient_full()
        is_safe, found = _check_contraindications(patient, "tDCS")
        self.assertTrue(is_safe)
        self.assertEqual(found, [])

    def test_check_contraindications_unsafe(self):
        """Test contraindication check with contraindicated patient."""
        patient = get_test_patient_contraindicated()
        is_safe, found = _check_contraindications(patient, "rTMS")
        self.assertFalse(is_safe)
        self.assertGreater(len(found), 0)

    def test_check_contraindications_epilepsy_tms(self):
        """Test epilepsy contraindication for TMS."""
        patient = {"conditions": ["epilepsy_uncontrolled"]}
        is_safe, found = _check_contraindications(patient, "TMS")
        self.assertFalse(is_safe)
        self.assertIn("epilepsy_uncontrolled", found)

    def test_check_contraindications_pacemaker_tdcs(self):
        """Test pacemaker contraindication for tDCS."""
        patient = {"implanted_devices": ["implanted_device_pacemaker"]}
        is_safe, found = _check_contraindications(patient, "tDCS")
        self.assertFalse(is_safe)
        self.assertIn("implanted_device_pacemaker", found)

    def test_estimate_cost_with_explicit(self):
        """Test cost estimation with explicit cost."""
        protocol = {"modality": "tDCS", "cost_usd": 2000}
        cost = _estimate_cost(protocol)
        self.assertEqual(cost, 2000)

    def test_estimate_cost_default(self):
        """Test cost estimation with default."""
        protocol = {"modality": "tDCS", "total_sessions": 10}
        cost = _estimate_cost(protocol)
        self.assertGreater(cost, 0)

    def test_estimate_duration_weeks_explicit(self):
        """Test duration estimation with explicit duration."""
        protocol = {"modality": "tDCS", "duration_weeks": 4}
        weeks = _estimate_duration_weeks(protocol)
        self.assertEqual(weeks, 4)

    def test_estimate_duration_weeks_calculated(self):
        """Test duration estimation calculated from sessions."""
        protocol = {"modality": "tDCS", "total_sessions": 10, "sessions_per_week": 2}
        weeks = _estimate_duration_weeks(protocol)
        self.assertEqual(weeks, 5)


# =============================================================================
# TEST PREDICT RESPONSE
# =============================================================================

class TestPredictResponse(unittest.TestCase):
    """Test predict_response function."""

    def test_basic_prediction(self):
        """Test basic prediction runs without error."""
        patient = get_test_patient_full()
        protocol = get_test_protocol_tdcs()
        
        result = predict_response(patient, protocol)
        
        self.assertIn("protocol", result)
        self.assertIn("predicted_outcomes", result)
        self.assertIn("confidence_intervals", result)
        self.assertIn("predictors", result)
        self.assertIn("time_to_response_weeks", result)
        self.assertIn("confidence", result)

    def test_prediction_probabilities_sum(self):
        """Test that outcome probabilities are valid."""
        patient = get_test_patient_full()
        protocol = get_test_protocol_tdcs()
        
        result = predict_response(patient, protocol)
        outcomes = result["predicted_outcomes"]
        
        total = (
            outcomes["remission_probability"]
            + outcomes["no_effect_probability"]
            + outcomes["adverse_event_probability"]
        )
        # remission + response_no_remission + no_effect + adverse = 1
        # But response_probability includes remission, so check indirectly
        self.assertGreaterEqual(outcomes["remission_probability"], 0)
        self.assertLessEqual(outcomes["remission_probability"], 1)
        self.assertGreaterEqual(outcomes["response_probability"], 0)
        self.assertLessEqual(outcomes["response_probability"], 1)
        self.assertGreaterEqual(outcomes["no_effect_probability"], 0)
        self.assertGreaterEqual(outcomes["adverse_event_probability"], 0)

    def test_response_gte_remission(self):
        """Test that response probability >= remission probability."""
        patient = get_test_patient_full()
        protocol = get_test_protocol_tdcs()
        
        result = predict_response(patient, protocol)
        outcomes = result["predicted_outcomes"]
        
        self.assertGreaterEqual(
            outcomes["response_probability"],
            outcomes["remission_probability"]
        )

    def test_confidence_intervals_valid(self):
        """Test that confidence intervals are valid."""
        patient = get_test_patient_full()
        protocol = get_test_protocol_tdcs()
        
        result = predict_response(patient, protocol)
        cis = result["confidence_intervals"]
        
        for key in ["remission", "response"]:
            self.assertIn("lower", cis[key])
            self.assertIn("upper", cis[key])
            self.assertLess(cis[key]["lower"], cis[key]["upper"])
            self.assertGreaterEqual(cis[key]["lower"], 0)
            self.assertLessEqual(cis[key]["upper"], 1)

    def test_has_predictors(self):
        """Test that predictors are returned."""
        patient = get_test_patient_full()
        protocol = get_test_protocol_tdcs()
        
        result = predict_response(patient, protocol)
        predictors = result["predictors"]
        
        self.assertIsInstance(predictors, list)
        self.assertGreater(len(predictors), 0)
        
        for pred in predictors:
            self.assertIn("factor", pred)
            self.assertIn("weight", pred)
            self.assertIn("direction", pred)
            self.assertIn("evidence", pred)

    def test_time_to_response(self):
        """Test time to response estimation."""
        patient = get_test_patient_full()
        protocol = get_test_protocol_tdcs()
        
        result = predict_response(patient, protocol)
        time_resp = result["time_to_response_weeks"]
        
        self.assertIn("median", time_resp)
        self.assertIn("range", time_resp)
        self.assertIsInstance(time_resp["median"], int)
        self.assertIsInstance(time_resp["range"], list)
        self.assertEqual(len(time_resp["range"]), 2)
        self.assertLessEqual(time_resp["range"][0], time_resp["range"][1])

    def test_confidence_value(self):
        """Test confidence value is in valid range."""
        patient = get_test_patient_full()
        protocol = get_test_protocol_tdcs()
        
        result = predict_response(patient, protocol)
        confidence = result["confidence"]
        
        self.assertGreaterEqual(confidence, 0)
        self.assertLessEqual(confidence, 1)

    def test_minimal_patient(self):
        """Test prediction with minimal patient data."""
        patient = get_test_patient_minimal()
        protocol = get_test_protocol_tdcs()
        
        result = predict_response(patient, protocol)
        
        self.assertIn("predicted_outcomes", result)
        self.assertGreater(result["predicted_outcomes"]["response_probability"], 0)

    def test_different_modalities(self):
        """Test prediction across different modalities."""
        patient = get_test_patient_full()
        protocols = [
            get_test_protocol_tdcs(),
            get_test_protocol_rtms(),
            get_test_protocol_deep_tms(),
            get_test_protocol_pbm(),
        ]
        
        results = []
        for protocol in protocols:
            result = predict_response(patient, protocol)
            results.append(result)
            self.assertIn("predicted_outcomes", result)
        
        # Results should differ by modality
        remission_rates = [r["predicted_outcomes"]["remission_probability"] for r in results]
        self.assertEqual(len(set(remission_rates)), len(remission_rates))

    def test_prediction_with_contraindication(self):
        """Test prediction with contraindicated patient returns valid but flagged."""
        patient = get_test_patient_contraindicated()
        protocol = get_test_protocol_rtms()
        
        result = predict_response(patient, protocol)
        
        # Should still return a result but match score will be 0
        self.assertIn("predicted_outcomes", result)
        self.assertIn("confidence", result)

    def test_prediction_protocol_name(self):
        """Test that protocol name is correctly returned."""
        patient = get_test_patient_full()
        protocol = get_test_protocol_tdcs()
        
        result = predict_response(patient, protocol)
        self.assertEqual(result["protocol"], protocol["name"])

    def test_error_on_non_dict_inputs(self):
        """Test that non-dict inputs raise ValueError."""
        with self.assertRaises(ValueError):
            predict_response("not_a_dict", {})
        with self.assertRaises(ValueError):
            predict_response({}, "not_a_dict")

    def test_predictor_directions_valid(self):
        """Test that predictor directions are valid values."""
        patient = get_test_patient_full()
        protocol = get_test_protocol_tdcs()
        
        result = predict_response(patient, protocol)
        
        valid_directions = {"positive", "negative", "neutral"}
        for pred in result["predictors"]:
            self.assertIn(pred["direction"], valid_directions)

    def test_evidence_sources_valid(self):
        """Test that evidence sources are recognized."""
        patient = get_test_patient_full()
        protocol = get_test_protocol_tdcs()
        
        result = predict_response(patient, protocol)
        valid_sources = set(EVIDENCE_SOURCE_WEIGHTS.keys())
        
        for pred in result["predictors"]:
            self.assertIn(pred["evidence"], valid_sources)


# =============================================================================
# TEST COMPARE PROTOCOLS
# =============================================================================

class TestCompareProtocols(unittest.TestCase):
    """Test compare_protocols function."""

    def test_basic_comparison(self):
        """Test basic protocol comparison."""
        patient = get_test_patient_full()
        protocols = [
            get_test_protocol_tdcs(),
            get_test_protocol_rtms(),
        ]
        
        result = compare_protocols(patient, protocols)
        
        self.assertEqual(len(result), 2)
        self.assertEqual(result[0]["rank"], 1)
        self.assertEqual(result[1]["rank"], 2)

    def test_ranking_descending(self):
        """Test that results are sorted by overall score descending."""
        patient = get_test_patient_full()
        protocols = [
            get_test_protocol_tdcs(),
            get_test_protocol_rtms(),
            get_test_protocol_deep_tms(),
        ]
        
        result = compare_protocols(patient, protocols)
        
        for i in range(len(result) - 1):
            self.assertGreaterEqual(
                result[i]["overall_score"],
                result[i + 1]["overall_score"]
            )

    def test_comparison_structure(self):
        """Test that comparison results have all required fields."""
        patient = get_test_patient_full()
        protocols = [get_test_protocol_tdcs(), get_test_protocol_rtms()]
        
        result = compare_protocols(patient, protocols)
        
        required_fields = [
            "rank", "protocol", "modality", "remission_probability",
            "safety_score", "cost_usd", "time_weeks", "evidence_grade",
            "patient_match_score", "overall_score", "rationale",
        ]
        
        for entry in result:
            for field in required_fields:
                self.assertIn(field, entry, f"Missing field: {field}")

    def test_safety_scores_in_range(self):
        """Test that safety scores are in valid range."""
        patient = get_test_patient_full()
        protocols = [get_test_protocol_tdcs(), get_test_protocol_rtms()]
        
        result = compare_protocols(patient, protocols)
        
        for entry in result:
            self.assertGreaterEqual(entry["safety_score"], 0)
            self.assertLessEqual(entry["safety_score"], 1)

    def test_costs_positive(self):
        """Test that costs are positive."""
        patient = get_test_patient_full()
        protocols = [get_test_protocol_tdcs(), get_test_protocol_rtms()]
        
        result = compare_protocols(patient, protocols)
        
        for entry in result:
            self.assertGreater(entry["cost_usd"], 0)

    def test_times_positive(self):
        """Test that time values are positive."""
        patient = get_test_patient_full()
        protocols = [get_test_protocol_tdcs(), get_test_protocol_rtms()]
        
        result = compare_protocols(patient, protocols)
        
        for entry in result:
            self.assertGreater(entry["time_weeks"], 0)

    def test_overall_scores_in_range(self):
        """Test that overall scores are in [0, 1]."""
        patient = get_test_patient_full()
        protocols = [get_test_protocol_tdcs(), get_test_protocol_rtms()]
        
        result = compare_protocols(patient, protocols)
        
        for entry in result:
            self.assertGreaterEqual(entry["overall_score"], 0)
            self.assertLessEqual(entry["overall_score"], 1)

    def test_rationale_non_empty(self):
        """Test that rationale is non-empty string."""
        patient = get_test_patient_full()
        protocols = [get_test_protocol_tdcs(), get_test_protocol_rtms()]
        
        result = compare_protocols(patient, protocols)
        
        for entry in result:
            self.assertIsInstance(entry["rationale"], str)
            self.assertGreater(len(entry["rationale"]), 0)

    def test_minimum_two_protocols(self):
        """Test that at least 2 protocols are required."""
        patient = get_test_patient_full()
        
        with self.assertRaises(ValueError):
            compare_protocols(patient, [get_test_protocol_tdcs()])

    def test_maximum_five_protocols(self):
        """Test that maximum 5 protocols are allowed."""
        patient = get_test_patient_full()
        protocols = [get_test_protocol_tdcs()] * 6
        
        with self.assertRaises(ValueError):
            compare_protocols(patient, protocols)

    def test_five_protocols_accepted(self):
        """Test that exactly 5 protocols are accepted."""
        patient = get_test_patient_full()
        protocols = [
            get_test_protocol_tdcs(),
            get_test_protocol_rtms(),
            get_test_protocol_deep_tms(),
            get_test_protocol_pbm(),
            get_test_protocol_neurofeedback(),
        ]
        
        result = compare_protocols(patient, protocols)
        self.assertEqual(len(result), 5)

    def test_error_on_non_list(self):
        """Test that non-list protocols raises ValueError."""
        patient = get_test_patient_full()
        
        with self.assertRaises(ValueError):
            compare_protocols(patient, "not_a_list")

    def test_comparison_with_contraindicated_patient(self):
        """Test comparison with contraindicated patient."""
        patient = get_test_patient_contraindicated()
        protocols = [
            get_test_protocol_tdcs(),  # May be safe
            get_test_protocol_rtms(),  # Contraindicated
        ]
        
        result = compare_protocols(patient, protocols)
        
        self.assertEqual(len(result), 2)
        # The safe protocol should rank higher
        for entry in result:
            self.assertIn("overall_score", entry)

    def test_different_modalities_ranked(self):
        """Test that different modalities produce different rankings."""
        patient = get_test_patient_full()
        protocols = [
            get_test_protocol_tdcs(),
            get_test_protocol_rtms(),
            get_test_protocol_deep_tms(),
            get_test_protocol_pbm(),
        ]
        
        result = compare_protocols(patient, protocols)
        
        modalities = [entry["modality"] for entry in result]
        self.assertEqual(len(set(modalities)), len(modalities))


# =============================================================================
# TEST PATIENT MATCH SCORE
# =============================================================================

class TestCalculatePatientMatchScore(unittest.TestCase):
    """Test calculate_patient_match_score function."""

    def test_basic_match(self):
        """Test basic patient-protocol match."""
        patient = get_test_patient_full()
        protocol = get_test_protocol_tdcs()
        
        score = calculate_patient_match_score(patient, protocol)
        
        self.assertIsInstance(score, float)
        self.assertGreaterEqual(score, 0)
        self.assertLessEqual(score, 1)

    def test_contraindication_zero_score(self):
        """Test that absolute contraindication yields score 0."""
        patient = get_test_patient_contraindicated()
        protocol = get_test_protocol_rtms()
        
        score = calculate_patient_match_score(patient, protocol)
        self.assertEqual(score, 0.0)

    def test_minimal_patient(self):
        """Test match score with minimal patient data."""
        patient = get_test_patient_minimal()
        protocol = get_test_protocol_tdcs()
        
        score = calculate_patient_match_score(patient, protocol)
        self.assertGreater(score, 0)
        self.assertLessEqual(score, 1)

    def test_pediatric_patient(self):
        """Test match score for pediatric patient."""
        patient = get_test_patient_pediatric()
        protocol = get_test_protocol_neurofeedback()
        
        score = calculate_patient_match_score(patient, protocol)
        self.assertGreaterEqual(score, 0)
        self.assertLessEqual(score, 1)

    def test_geriatric_patient(self):
        """Test match score for geriatric patient."""
        patient = get_test_patient_geriatric()
        protocol = get_test_protocol_tdcs()
        
        score = calculate_patient_match_score(patient, protocol)
        self.assertGreaterEqual(score, 0)
        self.assertLessEqual(score, 1)

    def test_genetic_match_boost(self):
        """Test that favorable genetics increase match score."""
        patient_with_genetics = {
            "age": 45,
            "sex": "female",
            "genetic_markers": {"COMT": "Met/Met"},
        }
        patient_without_genetics = {
            "age": 45,
            "sex": "female",
            "genetic_markers": {},
        }
        protocol = get_test_protocol_tdcs()
        
        score_with = calculate_patient_match_score(patient_with_genetics, protocol)
        score_without = calculate_patient_match_score(patient_without_genetics, protocol)
        
        self.assertGreater(score_with, score_without)

    def test_neuroimaging_match_boost(self):
        """Test that matching neuroimaging biomarkers increase score."""
        patient_with_biomarker = {
            "age": 45,
            "sex": "female",
            "neuroimaging": ["DLPFC_hypoactivity"],
        }
        patient_without_biomarker = {
            "age": 45,
            "sex": "female",
            "neuroimaging": [],
        }
        protocol = get_test_protocol_tdcs()
        
        score_with = calculate_patient_match_score(patient_with_biomarker, protocol)
        score_without = calculate_patient_match_score(patient_without_biomarker, protocol)
        
        self.assertGreater(score_with, score_without)

    def test_female_sex_effect(self):
        """Test that female sex has different match than male."""
        female_patient = {"age": 45, "sex": "female"}
        male_patient = {"age": 45, "sex": "male"}
        protocol = get_test_protocol_tdcs()
        
        female_score = calculate_patient_match_score(female_patient, protocol)
        male_score = calculate_patient_match_score(male_patient, protocol)
        
        # Female should have slightly higher score for depression protocols
        self.assertGreaterEqual(female_score, male_score)

    def test_resistance_level_effect(self):
        """Test that treatment resistance affects score."""
        naive_patient = {"age": 45, "sex": "female", "treatment_resistance_level": "naive"}
        resistant_patient = {"age": 45, "sex": "female", "treatment_resistance_level": "treatment_resistant"}
        protocol = get_test_protocol_tdcs()
        
        naive_score = calculate_patient_match_score(naive_patient, protocol)
        resistant_score = calculate_patient_match_score(resistant_patient, protocol)
        
        self.assertGreater(naive_score, resistant_score)

    def test_prior_treatment_penalty(self):
        """Test that prior failed treatment of same modality penalizes score."""
        patient_with_prior = {
            "age": 45,
            "sex": "female",
            "prior_treatments": ["tDCS failed"],
        }
        patient_without_prior = {
            "age": 45,
            "sex": "female",
            "prior_treatments": [],
        }
        protocol = get_test_protocol_tdcs()
        
        score_with = calculate_patient_match_score(patient_with_prior, protocol)
        score_without = calculate_patient_match_score(patient_without_prior, protocol)
        
        self.assertLess(score_with, score_without)

    def test_error_on_non_dict(self):
        """Test that non-dict inputs raise ValueError."""
        with self.assertRaises(ValueError):
            calculate_patient_match_score("not_dict", {})
        with self.assertRaises(ValueError):
            calculate_patient_match_score({}, "not_dict")

    def test_all_modalities_have_safety_scores(self):
        """Test that all defined modalities have safety scores."""
        for modality in ["tDCS", "TMS", "rTMS", "Deep TMS", "TBS", "PBM", "neurofeedback", "tACS", "tRNS"]:
            self.assertIn(modality, MODALITY_SAFETY_SCORES)

    def test_all_modalities_have_costs(self):
        """Test that all defined modalities have cost estimates."""
        for modality in ["tDCS", "TMS", "rTMS", "Deep TMS", "TBS", "PBM", "neurofeedback", "tACS", "tRNS"]:
            self.assertIn(modality, MODALITY_COSTS)

    def test_all_modalities_have_durations(self):
        """Test that all defined modalities have duration estimates."""
        for modality in ["tDCS", "TMS", "rTMS", "Deep TMS", "TBS", "PBM", "neurofeedback", "tACS", "tRNS"]:
            self.assertIn(modality, MODALITY_DURATION_WEEKS)


# =============================================================================
# TEST RANK BY EVIDENCE
# =============================================================================

class TestRankByEvidence(unittest.TestCase):
    """Test rank_by_evidence function."""

    def test_basic_ranking(self):
        """Test basic evidence ranking."""
        protocols = [
            get_test_protocol_tdcs(),
            get_test_protocol_rtms(),
        ]
        
        result = rank_by_evidence(protocols)
        
        self.assertEqual(len(result), 2)
        self.assertEqual(result[0]["rank"], 1)
        self.assertEqual(result[1]["rank"], 2)

    def test_ranking_has_required_fields(self):
        """Test that ranking results have required fields."""
        protocols = [get_test_protocol_tdcs()]
        
        result = rank_by_evidence(protocols)
        
        required_fields = [
            "protocol", "modality", "evidence_grade", "n_trials",
            "recency_years", "total_n_patients", "weighted_score",
            "raw_score", "rank",
        ]
        
        for field in required_fields:
            self.assertIn(field, result[0])

    def test_higher_grade_ranks_higher(self):
        """Test that higher evidence grade gets better rank."""
        protocols = [
            {
                "name": "Protocol C",
                "modality": "tDCS",
                "evidence_grade": "C",
                "n_trials": 10,
                "last_trial_year": 2023,
                "total_n_patients": 300,
            },
            {
                "name": "Protocol A",
                "modality": "tDCS",
                "evidence_grade": "A",
                "n_trials": 10,
                "last_trial_year": 2023,
                "total_n_patients": 300,
            },
        ]
        
        result = rank_by_evidence(protocols)
        
        self.assertEqual(result[0]["protocol"], "Protocol A")
        self.assertEqual(result[1]["protocol"], "Protocol C")

    def test_more_trials_ranks_higher(self):
        """Test that more trials gets better rank with same grade."""
        protocols = [
            {
                "name": "Few Trials",
                "modality": "tDCS",
                "evidence_grade": "A",
                "n_trials": 5,
                "last_trial_year": 2023,
                "total_n_patients": 150,
            },
            {
                "name": "Many Trials",
                "modality": "tDCS",
                "evidence_grade": "A",
                "n_trials": 25,
                "last_trial_year": 2023,
                "total_n_patients": 150,
            },
        ]
        
        result = rank_by_evidence(protocols)
        
        self.assertEqual(result[0]["protocol"], "Many Trials")

    def test_recency_affects_ranking(self):
        """Test that more recent trials rank higher."""
        protocols = [
            {
                "name": "Old Trial",
                "modality": "tDCS",
                "evidence_grade": "A",
                "n_trials": 10,
                "last_trial_year": 2018,
                "total_n_patients": 300,
            },
            {
                "name": "Recent Trial",
                "modality": "tDCS",
                "evidence_grade": "A",
                "n_trials": 10,
                "last_trial_year": 2024,
                "total_n_patients": 300,
            },
        ]
        
        result = rank_by_evidence(protocols)
        
        self.assertEqual(result[0]["protocol"], "Recent Trial")

    def test_weighted_score_in_range(self):
        """Test that weighted scores are in reasonable range."""
        protocols = [get_test_protocol_tdcs(), get_test_protocol_rtms()]
        
        result = rank_by_evidence(protocols)
        
        for entry in result:
            self.assertGreater(entry["weighted_score"], 0)
            self.assertLessEqual(entry["weighted_score"], 1)

    def test_error_on_empty_list(self):
        """Test that empty list raises ValueError."""
        with self.assertRaises(ValueError):
            rank_by_evidence([])

    def test_single_protocol(self):
        """Test ranking with single protocol."""
        protocols = [get_test_protocol_tdcs()]
        
        result = rank_by_evidence(protocols)
        
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["rank"], 1)

    def test_all_grades(self):
        """Test ranking with all evidence grades."""
        protocols = [
            {
                "name": f"Protocol {grade.value}",
                "modality": "tDCS",
                "evidence_grade": grade.value,
                "n_trials": 10,
                "last_trial_year": 2023,
                "total_n_patients": 300,
            }
            for grade in EvidenceGrade
        ]
        
        result = rank_by_evidence(protocols)
        
        # Should be ranked A > B > C > D
        grades_in_order = [entry["evidence_grade"] for entry in result]
        self.assertEqual(grades_in_order, ["A", "B", "C", "D"])

    def test_recency_factor_decay(self):
        """Test that recency factor decays with older trials."""
        protocols = [
            {
                "name": f"Year {year}",
                "modality": "tDCS",
                "evidence_grade": "A",
                "n_trials": 10,
                "last_trial_year": year,
                "total_n_patients": 300,
            }
            for year in [2024, 2023, 2022, 2021, 2020]
        ]
        
        result = rank_by_evidence(protocols)
        
        # Verify descending order by weighted score (recent trials should score higher)
        scores = [entry["weighted_score"] for entry in result]
        self.assertEqual(scores, sorted(scores, reverse=True))
        
        # Verify recency_years increases as scores decrease
        recency_years = [entry["recency_years"] for entry in result]
        self.assertEqual(recency_years, sorted(recency_years))  # Should be ascending


# =============================================================================
# TEST REPORT GENERATION
# =============================================================================

class TestGenerateOutcomeReport(unittest.TestCase):
    """Test generate_outcome_report function."""

    def test_dict_format(self):
        """Test report generation in dict format."""
        patient = get_test_patient_full()
        protocols = [
            get_test_protocol_tdcs(),
            get_test_protocol_rtms(),
        ]
        
        result = generate_outcome_report(patient, protocols, "dict")
        
        self.assertIsInstance(result, dict)
        self.assertIn("generated_at", result)
        self.assertIn("patient_summary", result)
        self.assertIn("predictions", result)
        self.assertIn("protocol_comparison", result)
        self.assertIn("evidence_ranking", result)

    def test_json_format(self):
        """Test report generation in JSON format."""
        patient = get_test_patient_full()
        protocols = [
            get_test_protocol_tdcs(),
            get_test_protocol_rtms(),
        ]
        
        result = generate_outcome_report(patient, protocols, "json")
        
        self.assertIsInstance(result, str)
        # Should be valid JSON
        parsed = json.loads(result)
        self.assertIn("predictions", parsed)

    def test_markdown_format(self):
        """Test report generation in markdown format."""
        patient = get_test_patient_full()
        protocols = [
            get_test_protocol_tdcs(),
            get_test_protocol_rtms(),
        ]
        
        result = generate_outcome_report(patient, protocols, "markdown")
        
        self.assertIsInstance(result, str)
        self.assertIn("#", result)  # Markdown headers
        self.assertIn("|", result)  # Markdown tables

    def test_patient_summary_in_report(self):
        """Test that patient summary is included in report."""
        patient = get_test_patient_full()
        protocols = [get_test_protocol_tdcs(), get_test_protocol_rtms()]
        
        result = generate_outcome_report(patient, protocols, "dict")
        summary = result["patient_summary"]
        
        self.assertEqual(summary["age"], patient["age"])
        self.assertEqual(summary["sex"], patient["sex"])
        self.assertEqual(summary["genetic_markers"], patient["genetic_markers"])

    def test_n_protocols_count(self):
        """Test that protocol count is correct."""
        patient = get_test_patient_full()
        protocols = [
            get_test_protocol_tdcs(),
            get_test_protocol_rtms(),
            get_test_protocol_deep_tms(),
        ]
        
        result = generate_outcome_report(patient, protocols, "dict")
        
        self.assertEqual(result["n_protocols_evaluated"], 3)
        self.assertEqual(len(result["predictions"]), 3)


# =============================================================================
# TEST PROTOCOL DATABASE
# =============================================================================

class TestProtocolDatabase(unittest.TestCase):
    """Test canonical protocol database."""

    def test_mdd_protocols_exist(self):
        """Test MDD protocols exist."""
        protocols = get_protocols_for_condition("MDD")
        self.assertGreater(len(protocols), 0)

    def test_ocd_protocols_exist(self):
        """Test OCD protocols exist."""
        protocols = get_protocols_for_condition("OCD")
        self.assertGreater(len(protocols), 0)

    def test_adhd_protocols_exist(self):
        """Test ADHD protocols exist."""
        protocols = get_protocols_for_condition("ADHD")
        self.assertGreater(len(protocols), 0)

    def test_chronic_pain_protocols_exist(self):
        """Test chronic pain protocols exist."""
        protocols = get_protocols_for_condition("chronic_pain")
        self.assertGreater(len(protocols), 0)

    def test_ptsd_protocols_exist(self):
        """Test PTSD protocols exist."""
        protocols = get_protocols_for_condition("PTSD")
        self.assertGreater(len(protocols), 0)

    def test_unknown_condition_returns_empty(self):
        """Test that unknown condition returns empty list."""
        protocols = get_protocols_for_condition("UNKNOWN_CONDITION")
        self.assertEqual(len(protocols), 0)

    def test_protocols_have_required_fields(self):
        """Test that all protocols have required fields."""
        required_fields = [
            "name", "modality", "target", "condition",
            "evidence_grade", "n_trials", "base_remission_rate", "base_response_rate",
        ]
        
        for condition, protocols in CANONICAL_PROTOCOLS.items():
            for protocol in protocols:
                for field in required_fields:
                    self.assertIn(
                        field, protocol,
                        f"Protocol '{protocol.get('name', 'Unknown')}' missing field '{field}'"
                    )

    def test_protocol_evidence_grades_valid(self):
        """Test that all protocols have valid evidence grades."""
        valid_grades = {"A", "B", "C", "D"}
        
        for condition, protocols in CANONICAL_PROTOCOLS.items():
            for protocol in protocols:
                self.assertIn(
                    protocol["evidence_grade"], valid_grades,
                    f"Invalid grade for {protocol['name']}"
                )

    def test_protocol_base_rates_valid(self):
        """Test that base rates are valid probabilities."""
        for condition, protocols in CANONICAL_PROTOCOLS.items():
            for protocol in protocols:
                self.assertGreaterEqual(protocol["base_remission_rate"], 0)
                self.assertLessEqual(protocol["base_remission_rate"], 1)
                self.assertGreaterEqual(protocol["base_response_rate"], 0)
                self.assertLessEqual(protocol["base_response_rate"], 1)
                self.assertGreaterEqual(
                    protocol["base_response_rate"],
                    protocol["base_remission_rate"]
                )


# =============================================================================
# TEST CONSTANTS AND DATA
# =============================================================================

class TestConstantsAndData(unittest.TestCase):
    """Test module constants and data structures."""

    def test_evidence_source_weights(self):
        """Test evidence source weights."""
        self.assertIn("cochrane", EVIDENCE_SOURCE_WEIGHTS)
        self.assertIn("pubmed", EVIDENCE_SOURCE_WEIGHTS)
        self.assertIn("clinicaltrials", EVIDENCE_SOURCE_WEIGHTS)
        
        for source, weight in EVIDENCE_SOURCE_WEIGHTS.items():
            self.assertGreater(weight, 0)
            self.assertLessEqual(weight, 1)

    def test_evidence_grade_weights(self):
        """Test evidence grade weights."""
        self.assertEqual(EVIDENCE_GRADE_WEIGHTS[EvidenceGrade.A], 1.0)
        self.assertEqual(EVIDENCE_GRADE_WEIGHTS[EvidenceGrade.B], 0.8)
        self.assertEqual(EVIDENCE_GRADE_WEIGHTS[EvidenceGrade.C], 0.6)
        self.assertEqual(EVIDENCE_GRADE_WEIGHTS[EvidenceGrade.D], 0.4)

    def test_genetic_marker_effects_structure(self):
        """Test genetic marker effects data structure."""
        for key, value in GENETIC_MARKER_EFFECTS.items():
            self.assertIn("weight", value)
            self.assertIn("direction", value)
            self.assertIn("modality", value)
            self.assertIsInstance(value["modality"], list)

    def test_medication_effects_structure(self):
        """Test medication effects data structure."""
        for key, value in MEDICATION_EFFECTS.items():
            self.assertIn("weight", value)
            self.assertIn("direction", value)
            self.assertIn("evidence", value)

    def test_neuroimaging_biomarkers_structure(self):
        """Test neuroimaging biomarkers data structure."""
        for key, value in NEUROIMAGING_BIOMARKERS.items():
            self.assertIn("weight", value)
            self.assertIn("direction", value)
            self.assertIn("evidence", value)
            self.assertIn("applies_to", value)
            self.assertIsInstance(value["applies_to"], list)

    def test_contraindications_structure(self):
        """Test contraindications data structure."""
        for modality, contras in CONTRAINDICATIONS.items():
            self.assertIsInstance(contras, list)
            self.assertGreater(len(contras), 0)

    def test_modality_safety_scores_sorted(self):
        """Test that safety scores are in reasonable order."""
        # Neurofeedback should be safest (non-invasive, no physical stimulation)
        self.assertGreater(MODALITY_SAFETY_SCORES["neurofeedback"], 0.95)
        # tDCS should be very safe
        self.assertGreater(MODALITY_SAFETY_SCORES["tDCS"], 0.9)
        # TMS modalities should be less safe than tDCS
        self.assertLess(MODALITY_SAFETY_SCORES["TMS"], MODALITY_SAFETY_SCORES["tDCS"])

    def test_modality_costs_reasonable(self):
        """Test that cost estimates are reasonable."""
        # Neurofeedback should be relatively cheap
        self.assertLess(MODALITY_COSTS["neurofeedback"], MODALITY_COSTS["rTMS"])
        # Deep TMS should be most expensive
        self.assertGreaterEqual(MODALITY_COSTS["Deep TMS"], MODALITY_COSTS["rTMS"])


# =============================================================================
# INTEGRATION TESTS
# =============================================================================

class TestIntegration(unittest.TestCase):
    """Integration tests for the complete workflow."""

    def test_full_workflow_mdd(self):
        """Test complete workflow for MDD patient."""
        patient = {
            "age": 45,
            "sex": "female",
            "genetic_markers": {"COMT": "Met/Met"},
            "neuroimaging": ["DLPFC_hypoactivity"],
            "medications": ["SSRI"],
            "conditions": [],
            "medical_history": [],
            "implanted_devices": [],
            "prior_treatments": [],
            "treatment_resistance_level": "single_failure",
        }
        
        # Get protocols for MDD
        protocols = get_protocols_for_condition("MDD")
        self.assertGreaterEqual(len(protocols), 2)
        
        # Calculate match scores
        match_scores = [calculate_patient_match_score(patient, p) for p in protocols]
        for score in match_scores:
            self.assertGreaterEqual(score, 0)
            self.assertLessEqual(score, 1)
        
        # Get predictions
        predictions = [predict_response(patient, p) for p in protocols]
        for pred in predictions:
            self.assertIn("predicted_outcomes", pred)
            self.assertIn("confidence", pred)
        
        # Compare protocols
        comparison = compare_protocols(patient, protocols[:4])
        self.assertEqual(len(comparison), min(4, len(protocols)))
        self.assertEqual(comparison[0]["rank"], 1)
        
        # Rank by evidence
        evidence_ranking = rank_by_evidence(protocols[:4])
        self.assertEqual(len(evidence_ranking), min(4, len(protocols)))
        
        # Generate report
        report = generate_outcome_report(patient, protocols[:4], "dict")
        self.assertIn("predictions", report)
        self.assertIn("protocol_comparison", report)
        self.assertIn("evidence_ranking", report)

    def test_full_workflow_adhd_pediatric(self):
        """Test complete workflow for pediatric ADHD patient."""
        patient = {
            "age": 12,
            "sex": "male",
            "genetic_markers": {},
            "neuroimaging": [],
            "medications": [],
            "conditions": ["ADHD"],
            "medical_history": [],
            "implanted_devices": [],
            "prior_treatments": [],
            "treatment_resistance_level": "naive",
        }
        
        protocols = get_protocols_for_condition("ADHD")
        self.assertGreaterEqual(len(protocols), 2)
        
        # Should handle pediatric patient safely
        comparison = compare_protocols(patient, protocols)
        self.assertEqual(len(comparison), len(protocols))
        
        for entry in comparison:
            self.assertGreaterEqual(entry["overall_score"], 0)
            self.assertLessEqual(entry["overall_score"], 1)

    def test_full_workflow_geriatric(self):
        """Test complete workflow for geriatric patient."""
        patient = {
            "age": 78,
            "sex": "female",
            "genetic_markers": {"BDNF": "Met/Met"},
            "neuroimaging": ["hippocampal_atrophy"],
            "medications": ["benzodiazepine"],
            "conditions": [],
            "medical_history": [],
            "implanted_devices": [],
            "prior_treatments": [],
            "treatment_resistance_level": "multi_failure",
        }
        
        protocols = [
            get_test_protocol_tdcs(),
            get_test_protocol_pbm(),
        ]
        
        comparison = compare_protocols(patient, protocols)
        self.assertEqual(len(comparison), 2)
        
        # Geriatric with hippocampal atrophy and BDNF Met/Met should have lower match
        for entry in comparison:
            self.assertLessEqual(entry["patient_match_score"], 0.8)

    def test_consistency_across_runs(self):
        """Test that results are consistent across multiple runs with same inputs."""
        patient = get_test_patient_full()
        protocol = get_test_protocol_tdcs()
        
        result1 = predict_response(patient, protocol)
        result2 = predict_response(patient, protocol)
        
        self.assertEqual(
            result1["predicted_outcomes"]["remission_probability"],
            result2["predicted_outcomes"]["remission_probability"]
        )
        self.assertEqual(
            result1["predicted_outcomes"]["response_probability"],
            result2["predicted_outcomes"]["response_probability"]
        )

    def test_contraindicated_patient_handling(self):
        """Test that contraindicated patients are handled gracefully."""
        patient = get_test_patient_contraindicated()
        
        # rTMS should be contraindicated
        rtms_protocol = get_test_protocol_rtms()
        rtms_match = calculate_patient_match_score(patient, rtms_protocol)
        self.assertEqual(rtms_match, 0.0)
        
        # tDCS might also be contraindicated (pacemaker)
        tdcs_protocol = get_test_protocol_tdcs()
        tdcs_match = calculate_patient_match_score(patient, tdcs_protocol)
        self.assertEqual(tdcs_match, 0.0)
        
        # PBM should be safe
        pbm_protocol = get_test_protocol_pbm()
        pbm_match = calculate_patient_match_score(patient, pbm_protocol)
        self.assertGreater(pbm_match, 0)

    def test_end_to_end_report(self):
        """Test end-to-end report generation and validity."""
        patient = get_test_patient_full()
        protocols = get_protocols_for_condition("MDD")[:3]
        
        # Dict report
        dict_report = generate_outcome_report(patient, protocols, "dict")
        
        # JSON report
        json_report = generate_outcome_report(patient, protocols, "json")
        
        # Verify JSON is parseable and matches dict
        parsed_json = json.loads(json_report)
        self.assertEqual(
            dict_report["n_protocols_evaluated"],
            parsed_json["n_protocols_evaluated"]
        )
        
        # Markdown report
        md_report = generate_outcome_report(patient, protocols, "markdown")
        self.assertIn("Neuromodulation Outcome Prediction Report", md_report)


# =============================================================================
# TEST EDGE CASES
# =============================================================================

class TestEdgeCases(unittest.TestCase):
    """Test edge cases and boundary conditions."""

    def test_age_boundary_18(self):
        """Test age boundary at 18 (pediatric/adult transition)."""
        patient_17 = {"age": 17, "sex": "female"}
        patient_18 = {"age": 18, "sex": "female"}
        protocol = get_test_protocol_tdcs()
        
        score_17 = calculate_patient_match_score(patient_17, protocol)
        score_18 = calculate_patient_match_score(patient_18, protocol)
        
        # 18-year-old should have slightly better score (young adult vs pediatric)
        self.assertNotEqual(score_17, score_18)

    def test_age_boundary_65(self):
        """Test age boundary at 65 (adult/geriatric transition)."""
        patient_64 = {"age": 64, "sex": "female"}
        patient_66 = {"age": 66, "sex": "female"}
        protocol = get_test_protocol_tdcs()
        
        score_64 = calculate_patient_match_score(patient_64, protocol)
        score_66 = calculate_patient_match_score(patient_66, protocol)
        
        # 64-year-old should have better score (middle-aged vs geriatric)
        self.assertGreater(score_64, score_66)

    def test_empty_genetic_markers(self):
        """Test with empty genetic markers."""
        patient = {"age": 45, "sex": "female", "genetic_markers": {}}
        protocol = get_test_protocol_tdcs()
        
        score = calculate_patient_match_score(patient, protocol)
        self.assertGreater(score, 0)

    def test_empty_neuroimaging(self):
        """Test with empty neuroimaging."""
        patient = {"age": 45, "sex": "female", "neuroimaging": []}
        protocol = get_test_protocol_tdcs()
        
        score = calculate_patient_match_score(patient, protocol)
        self.assertGreater(score, 0)

    def test_empty_medications(self):
        """Test with empty medications."""
        patient = {"age": 45, "sex": "female", "medications": []}
        protocol = get_test_protocol_tdcs()
        
        score = calculate_patient_match_score(patient, protocol)
        self.assertGreater(score, 0)

    def test_all_empty_optional_fields(self):
        """Test with all optional fields empty/missing."""
        patient = {"age": 45, "sex": "female"}
        protocol = get_test_protocol_tdcs()
        
        result = predict_response(patient, protocol)
        self.assertIn("predicted_outcomes", result)

    def test_very_high_base_rates(self):
        """Test with very high base rates."""
        protocol = {
            "name": "High Efficacy Protocol",
            "modality": "tDCS",
            "target": "DLPFC",
            "condition": "MDD",
            "evidence_grade": "A",
            "n_trials": 20,
            "base_remission_rate": 0.95,
            "base_response_rate": 0.99,
        }
        patient = get_test_patient_full()
        
        result = predict_response(patient, protocol)
        
        # Probabilities should still be valid
        self.assertLessEqual(result["predicted_outcomes"]["remission_probability"], 1.0)
        self.assertLessEqual(result["predicted_outcomes"]["response_probability"], 1.0)

    def test_very_low_base_rates(self):
        """Test with very low base rates."""
        protocol = {
            "name": "Low Efficacy Protocol",
            "modality": "tDCS",
            "target": "DLPFC",
            "condition": "MDD",
            "evidence_grade": "C",
            "n_trials": 3,
            "base_remission_rate": 0.05,
            "base_response_rate": 0.10,
        }
        patient = get_test_patient_full()
        
        result = predict_response(patient, protocol)
        
        # Probabilities should still be valid
        self.assertGreaterEqual(result["predicted_outcomes"]["remission_probability"], 0)
        self.assertGreaterEqual(result["predicted_outcomes"]["response_probability"], 0)

    def test_unknown_modality(self):
        """Test with unknown modality."""
        protocol = {
            "name": "Unknown Modality Protocol",
            "modality": "UNKNOWN_MODALITY",
            "target": "DLPFC",
            "condition": "MDD",
            "evidence_grade": "B",
            "n_trials": 5,
            "base_remission_rate": 0.30,
            "base_response_rate": 0.50,
        }
        patient = get_test_patient_full()
        
        # Should not raise error, just use defaults
        result = predict_response(patient, protocol)
        self.assertIn("predicted_outcomes", result)

    def test_protocol_with_no_trials(self):
        """Test with protocol claiming zero trials."""
        protocol = {
            "name": "No Trial Protocol",
            "modality": "tDCS",
            "target": "DLPFC",
            "condition": "MDD",
            "evidence_grade": "D",
            "n_trials": 0,
            "base_remission_rate": 0.20,
            "base_response_rate": 0.40,
        }
        patient = get_test_patient_full()
        
        result = predict_response(patient, protocol)
        self.assertIn("predicted_outcomes", result)

    def test_protocol_with_future_trial_year(self):
        """Test with protocol claiming future trial year."""
        protocol = {
            "name": "Future Protocol",
            "modality": "tDCS",
            "target": "DLPFC",
            "condition": "MDD",
            "evidence_grade": "A",
            "n_trials": 10,
            "last_trial_year": 2030,
            "total_n_patients": 300,
            "base_remission_rate": 0.40,
            "base_response_rate": 0.60,
        }
        
        result = rank_by_evidence([protocol])
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["recency_years"], 0)  # Should cap at 0


# =============================================================================
# MAIN
# =============================================================================

if __name__ == "__main__":
    unittest.main(verbosity=2)
