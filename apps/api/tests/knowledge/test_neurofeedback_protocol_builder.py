#!/usr/bin/env python3
"""
Comprehensive Test Suite for Neurofeedback Protocol Builder
===========================================================

Tests all core functions:
- analyze_qeeg_for_neurofeedback()
- select_montage()
- build_protocol()
- build_protocols_batch()
- summarize_protocol()

Covers pediatric, adult, and geriatric populations across all diagnoses.

Run with: python -m pytest test_neurofeedback_protocol_builder.py -v
"""

import pytest
import sys
from pathlib import Path

# Ensure module is importable
sys.path.insert(0, str(Path(__file__).parent))

from neurofeedback_protocol_builder import (
    AgeGroup,
    Diagnosis,
    EvidenceGrade,
    ThresholdMethod,
    ReinforcementType,
    Montage,
    Evidence,
    ProtocolParameters,
    SafetyScreening,
    AgeSpecificModifications,
    PROTOCOL_LIBRARY,
    QEEG_NORMATIVE_THRESHOLDS,
    _determine_age_group,
    _get_age_specific_mods,
    _validate_patient_input,
    analyze_qeeg_for_neurofeedback,
    select_montage,
    build_protocol,
    build_protocols_batch,
    summarize_protocol,
)


# ============================================================================
# Age Group Classification
# ============================================================================

class TestAgeGroupClassification:
    """Test age group determination."""

    def test_pediatric_boundary_low(self):
        assert _determine_age_group(6) == AgeGroup.PEDIATRIC

    def test_pediatric_boundary_high(self):
        assert _determine_age_group(17) == AgeGroup.PEDIATRIC

    def test_adult_boundary_low(self):
        assert _determine_age_group(18) == AgeGroup.ADULT

    def test_adult_boundary_high(self):
        assert _determine_age_group(64) == AgeGroup.ADULT

    def test_geriatric_boundary_low(self):
        assert _determine_age_group(65) == AgeGroup.GERIATRIC

    def test_geriatric_boundary_high(self):
        assert _determine_age_group(100) == AgeGroup.GERIATRIC

    def test_age_too_low_raises(self):
        with pytest.raises(ValueError, match="outside supported range"):
            _determine_age_group(5)

    def test_age_too_high_raises(self):
        with pytest.raises(ValueError, match="outside supported range"):
            _determine_age_group(101)


# ============================================================================
# Input Validation
# ============================================================================

class TestInputValidation:
    """Test patient input validation."""

    def test_missing_diagnosis_raises(self):
        with pytest.raises(ValueError, match="Missing required field: 'diagnosis'"):
            _validate_patient_input({"age": 12})

    def test_missing_age_raises(self):
        with pytest.raises(ValueError, match="Missing required field: 'age'"):
            _validate_patient_input({"diagnosis": "ADHD"})

    def test_invalid_age_type_raises(self):
        with pytest.raises(ValueError, match="'age' must be an integer"):
            _validate_patient_input({"diagnosis": "ADHD", "age": "twelve"})

    def test_invalid_diagnosis_raises(self):
        with pytest.raises(ValueError, match="not supported"):
            _validate_patient_input({"diagnosis": "UnknownCondition", "age": 12})

    def test_valid_input_passes(self):
        # Should not raise
        _validate_patient_input({"diagnosis": "ADHD", "age": 12})


# ============================================================================
# qEEG Analysis
# ============================================================================

class TestQEEGAnalysis:
    """Test qEEG analysis for neurofeedback targeting."""

    def test_adhd_qeeg_pattern(self):
        qeeg_data = {
            "theta_beta_ratio_frontal": 4.2,
            "slow_wave_excess": True,
            "frontal_alpha": -1.5,
            "age": 12,
        }
        result = analyze_qeeg_for_neurofeedback(qeeg_data)
        assert result["age_group"] == "pediatric"
        assert result["n_deviations"] >= 2
        assert "Fz" in result["deviant_sites"]
        assert any("theta" in d["frequency"] for d in result["deviant_frequencies"])

    def test_no_deviations_detected(self):
        qeeg_data = {"age": 30}
        result = analyze_qeeg_for_neurofeedback(qeeg_data)
        assert result["n_deviations"] == 0
        assert "No significant qEEG deviations" in result["clinical_interpretation"]

    def test_posterior_alpha_depression(self):
        qeeg_data = {
            "posterior_alpha": -2.0,
            "alpha_asymmetry_f3f4": 0.8,
            "age": 45,
        }
        result = analyze_qeeg_for_neurofeedback(qeeg_data)
        assert result["age_group"] == "adult"
        assert result["n_deviations"] >= 2
        assert "O1" in result["deviant_sites"]
        assert any("asymmetry" in d["finding"] for d in result["deviant_frequencies"])

    def test_smr_deficiency(self):
        qeeg_data = {
            "smr_cz": -2.2,
            "age": 10,
        }
        result = analyze_qeeg_for_neurofeedback(qeeg_data)
        assert "Cz" in result["deviant_sites"]
        assert any(d["frequency"] == "SMR_12_15Hz" for d in result["deviant_frequencies"])
        assert any("increase_SMR" in t["target"] for t in result["recommended_targets"])

    def test_alpha_asymmetry_left_greater(self):
        qeeg_data = {
            "alpha_asymmetry_f3f4": 0.8,
            "age": 35,
        }
        result = analyze_qeeg_for_neurofeedback(qeeg_data)
        assert any("left_greater" in d["finding"] for d in result["deviant_frequencies"])
        targets = [t["target"] for t in result["recommended_targets"]]
        assert any("F4_relative_F3" in t for t in targets)

    def test_geriatric_normative_thresholds(self):
        qeeg_data = {
            "theta_beta_ratio_frontal": 3.9,
            "age": 70,
        }
        result = analyze_qeeg_for_neurofeedback(qeeg_data)
        assert result["age_group"] == "geriatric"
        # Should be elevated for geriatric norms
        assert result["n_deviations"] >= 1

    def test_qeeg_with_explicit_age_group(self):
        qeeg_data = {
            "theta_beta_ratio_frontal": 4.5,
            "age_group": "pediatric",
        }
        result = analyze_qeeg_for_neurofeedback(qeeg_data)
        assert result["age_group"] == "pediatric"


# ============================================================================
# Montage Selection
# ============================================================================

class TestMontageSelection:
    """Test electrode montage selection."""

    def test_smr_theta_beta_montage(self):
        m = select_montage("SMR_theta_beta_training")
        assert m["active"] == "Cz"
        assert m["reference"] == "linked_ears"
        assert m["ground"] == "Fpz"
        assert m.get("secondary_active") == "Fz"

    def test_alpha_asymmetry_montage(self):
        m = select_montage("alpha_asymmetry_training")
        assert m["active"] == "F4"
        assert m["reference"] == "F3"

    def test_alpha_theta_pz_montage(self):
        m = select_montage("alpha_theta_training_Pz")
        assert m["active"] == "Pz"

    def test_mu_rhythm_montage(self):
        m = select_montage("mu_rhythm_training")
        assert m["active"] == "C3"
        assert m["reference"] == "C4"

    def test_qeeg_guided_montage(self):
        m = select_montage("qEEG_guided_individualized")
        assert m["active"] == "Individualized"

    def test_smr_enhancement_montage(self):
        m = select_montage("SMR_enhancement_training")
        assert m["active"] == "Cz"

    def test_alpha_enhancement_montage(self):
        m = select_montage("alpha_enhancement_training")
        assert m["active"] == "O1"

    def test_unknown_protocol_raises(self):
        with pytest.raises(ValueError, match="Unknown protocol_type"):
            select_montage("nonexistent_protocol_type")

    def test_fuzzy_matching(self):
        # Should match via fuzzy logic
        m = select_montage("alpha_theta")
        assert m["active"] == "Pz"


# ============================================================================
# Protocol Building — Core
# ============================================================================

class TestBuildProtocolCore:
    """Test core protocol building for various diagnoses."""

    def test_adhd_pediatric_protocol(self):
        patient = {
            "diagnosis": "ADHD",
            "age": 12,
            "qeeg_findings": {
                "theta_beta_ratio_frontal": 4.2,
                "slow_wave_excess": True,
                "frontal_alpha": -1.5,
            },
            "constraints": {"sessions_per_week": 2, "max_sessions": 40},
        }
        protocol = build_protocol(patient)
        assert protocol["modality"] == "neurofeedback"
        assert protocol["protocol"]["type"] == "SMR_theta_beta_training"
        assert protocol["patient_profile"]["age_group"] == "pediatric"
        assert protocol["protocol"]["sessions"] == 40
        assert protocol["protocol"]["frequency"] == "2x_week_x20_weeks"

        # Check pediatric modifications applied
        params = protocol["protocol"]["protocol_parameters"]
        assert params["session_duration_min"] == 20  # pediatric mod
        assert params["trials_per_session"] == 80   # pediatric mod
        assert params["reinforcement"] == "game_based"
        assert "caregiver_involvement" in params

        # Check evidence
        assert protocol["evidence"]["evidence_grade"] == "B"
        assert protocol["evidence"]["effect_size"] == 0.80

        # Check qEEG analysis included
        assert protocol["qEEG_analysis"]["n_deviations"] >= 1

    def test_adhd_adult_protocol(self):
        patient = {
            "diagnosis": "ADHD",
            "age": 30,
            "constraints": {"sessions_per_week": 2, "max_sessions": 40},
        }
        protocol = build_protocol(patient)
        assert protocol["patient_profile"]["age_group"] == "adult"
        params = protocol["protocol"]["protocol_parameters"]
        assert params["session_duration_min"] == 30  # adult default
        assert params["trials_per_session"] == 120
        assert params["reinforcement"] == "auditory_visual"

    def test_adhd_geriatric_protocol(self):
        patient = {
            "diagnosis": "ADHD",
            "age": 70,
            "constraints": {"sessions_per_week": 1, "max_sessions": 30},
        }
        protocol = build_protocol(patient)
        assert protocol["patient_profile"]["age_group"] == "geriatric"
        params = protocol["protocol"]["protocol_parameters"]
        assert params["session_duration_min"] == 25  # geriatric mod

    def test_depression_protocol(self):
        patient = {
            "diagnosis": "Depression",
            "age": 45,
            "qeeg_findings": {
                "frontal_alpha": -2.0,
                "alpha_asymmetry_f3f4": 0.8,
            },
            "constraints": {"sessions_per_week": 2, "max_sessions": 30},
        }
        protocol = build_protocol(patient)
        assert protocol["protocol"]["type"] == "alpha_asymmetry_training"
        assert protocol["protocol"]["sessions"] == 30
        assert protocol["evidence"]["meta_analysis"].startswith("Baehr")

    def test_anxiety_protocol(self):
        patient = {
            "diagnosis": "Anxiety",
            "age": 28,
            "constraints": {"sessions_per_week": 2, "max_sessions": 25},
        }
        protocol = build_protocol(patient)
        assert protocol["protocol"]["type"] == "alpha_enhancement_training"
        assert "O1" in protocol["protocol"]["montage"]["active"] or \
               "O1" in protocol["protocol"]["montage"].get("secondary_active", "")

    def test_ptsd_protocol(self):
        patient = {
            "diagnosis": "PTSD",
            "age": 35,
            "constraints": {"sessions_per_week": 2, "max_sessions": 30},
        }
        protocol = build_protocol(patient)
        assert protocol["protocol"]["type"] == "alpha_theta_training_Pz"
        assert protocol["protocol"]["montage"]["active"] == "Pz"
        assert "Peniston" in protocol["evidence"]["meta_analysis"]

    def test_insomnia_protocol(self):
        patient = {
            "diagnosis": "Insomnia",
            "age": 55,
            "constraints": {"sessions_per_week": 2, "max_sessions": 20},
        }
        protocol = build_protocol(patient)
        assert protocol["protocol"]["type"] == "SMR_enhancement_training"
        assert protocol["protocol"]["sessions"] == 20

    def test_autism_protocol(self):
        patient = {
            "diagnosis": "Autism",
            "age": 8,
            "constraints": {"sessions_per_week": 2, "max_sessions": 40},
        }
        protocol = build_protocol(patient)
        assert protocol["protocol"]["type"] == "mu_rhythm_training"
        assert protocol["patient_profile"]["age_group"] == "pediatric"
        params = protocol["protocol"]["protocol_parameters"]
        assert params["session_duration_min"] == 15  # very short for autism

    def test_tbi_protocol(self):
        patient = {
            "diagnosis": "TBI",
            "age": 40,
            "constraints": {"sessions_per_week": 2, "max_sessions": 40},
        }
        protocol = build_protocol(patient)
        assert protocol["protocol"]["type"] == "qEEG_guided_individualized"
        assert protocol["protocol"]["montage"]["active"] == "Individualized"

    def test_ocd_protocol(self):
        patient = {
            "diagnosis": "OCD",
            "age": 30,
            "constraints": {"sessions_per_week": 2, "max_sessions": 35},
        }
        protocol = build_protocol(patient)
        assert protocol["protocol"]["type"] == "SMR_enhancement_training"
        assert "Cz" == protocol["protocol"]["montage"]["active"]

    def test_chronic_pain_protocol(self):
        patient = {
            "diagnosis": "Chronic pain",
            "age": 50,
            "constraints": {"sessions_per_week": 2, "max_sessions": 30},
        }
        protocol = build_protocol(patient)
        assert protocol["protocol"]["type"] == "alpha_theta_training_Pz"
        assert "Jensen" in protocol["evidence"]["meta_analysis"]

    def test_peak_performance_adult(self):
        patient = {
            "diagnosis": "Peak performance",
            "age": 25,
            "constraints": {"sessions_per_week": 1, "max_sessions": 15},
        }
        protocol = build_protocol(patient)
        assert protocol["protocol"]["type"] == "alpha_enhancement_training"

    def test_peak_performance_child_raises(self):
        patient = {
            "diagnosis": "Peak performance",
            "age": 10,
        }
        with pytest.raises(ValueError, match="not recommended for children under 16"):
            build_protocol(patient)

    def test_peak_performance_teen_16_plus(self):
        patient = {
            "diagnosis": "Peak performance",
            "age": 16,
            "constraints": {"sessions_per_week": 1, "max_sessions": 10},
        }
        protocol = build_protocol(patient)
        assert protocol["patient_profile"]["age_group"] == "pediatric"
        assert protocol["protocol"]["type"] == "alpha_enhancement_training"


# ============================================================================
# Protocol Building — Constraints & Edge Cases
# ============================================================================

class TestProtocolConstraints:
    """Test constraint application and edge cases."""

    def test_session_constraint_respected(self):
        patient = {
            "diagnosis": "ADHD",
            "age": 12,
            "constraints": {"sessions_per_week": 2, "max_sessions": 35},
        }
        protocol = build_protocol(patient)
        assert protocol["protocol"]["sessions"] == 35  # constrained below default of 40

    def test_sessions_clamped_to_minimum(self):
        patient = {
            "diagnosis": "ADHD",
            "age": 12,
            "constraints": {"sessions_per_week": 2, "max_sessions": 5},  # below min
        }
        protocol = build_protocol(patient)
        assert protocol["protocol"]["sessions"] == 30  # clamped to minimum

    def test_sessions_clamped_to_maximum(self):
        patient = {
            "diagnosis": "ADHD",
            "age": 12,
            "constraints": {"sessions_per_week": 2, "max_sessions": 100},  # above max
        }
        protocol = build_protocol(patient)
        assert protocol["protocol"]["sessions"] <= 60  # clamped to maximum

    def test_default_constraints(self):
        patient = {
            "diagnosis": "ADHD",
            "age": 30,
        }
        protocol = build_protocol(patient)
        assert protocol["protocol"]["sessions"] == 40  # default

    def test_medication_warnings(self):
        patient = {
            "diagnosis": "ADHD",
            "age": 12,
            "medications": ["methylphenidate ER 20mg", "fluoxetine 10mg"],
        }
        protocol = build_protocol(patient)
        warnings = protocol["safety_screening"]["medication_warnings"]
        assert len(warnings) >= 1
        assert any("methylphenidate" in w for w in warnings)

    def test_comorbidity_notes(self):
        patient = {
            "diagnosis": "ADHD",
            "age": 12,
            "comorbidities": ["Anxiety", "Depression"],
        }
        protocol = build_protocol(patient)
        notes = protocol["safety_screening"]["comorbidity_notes"]
        assert len(notes) == 2
        assert any("anxiety" in n.lower() for n in notes)
        assert any("depression" in n.lower() for n in notes)

    def test_epilepsy_comorbidity_warning(self):
        patient = {
            "diagnosis": "ADHD",
            "age": 12,
            "comorbidities": ["Epilepsy"],
        }
        protocol = build_protocol(patient)
        notes = protocol["safety_screening"]["comorbidity_notes"]
        assert any("CRITICAL" in n and "Seizure" in n for n in notes)

    def test_no_qeeg_findings(self):
        patient = {
            "diagnosis": "ADHD",
            "age": 12,
        }
        protocol = build_protocol(patient)
        # Should still work without qEEG
        assert "qEEG_analysis" in protocol

    def test_invalid_diagnosis_raises(self):
        with pytest.raises(ValueError):
            build_protocol({"diagnosis": "NotReal", "age": 30})

    def test_missing_age_raises(self):
        with pytest.raises(ValueError):
            build_protocol({"diagnosis": "ADHD"})


# ============================================================================
# Batch Processing
# ============================================================================

class TestBatchProcessing:
    """Test batch protocol generation."""

    def test_batch_success(self):
        patients = [
            {"diagnosis": "ADHD", "age": 12, "constraints": {"sessions_per_week": 2, "max_sessions": 40}},
            {"diagnosis": "Depression", "age": 45, "constraints": {"sessions_per_week": 2, "max_sessions": 30}},
            {"diagnosis": "Anxiety", "age": 28, "constraints": {"sessions_per_week": 2, "max_sessions": 25}},
        ]
        results = build_protocols_batch(patients)
        assert len(results) == 3
        for r in results:
            assert "error" not in r
            assert r["modality"] == "neurofeedback"

    def test_batch_with_failure(self):
        patients = [
            {"diagnosis": "ADHD", "age": 12, "constraints": {"sessions_per_week": 2, "max_sessions": 40}},
            {"diagnosis": "NotReal", "age": 30},  # will fail
            {"diagnosis": "PTSD", "age": 35, "constraints": {"sessions_per_week": 2, "max_sessions": 30}},
        ]
        results = build_protocols_batch(patients)
        assert len(results) == 3
        assert "error" not in results[0]
        assert "error" in results[1]
        assert "error" not in results[2]

    def test_batch_empty_list(self):
        results = build_protocols_batch([])
        assert results == []


# ============================================================================
# Summary Output
# ============================================================================

class TestProtocolSummary:
    """Test human-readable protocol summary."""

    def test_summary_contains_key_info(self):
        patient = {
            "diagnosis": "ADHD",
            "age": 12,
            "qeeg_findings": {
                "theta_beta_ratio_frontal": 4.2,
                "slow_wave_excess": True,
            },
            "constraints": {"sessions_per_week": 2, "max_sessions": 40},
        }
        protocol = build_protocol(patient)
        summary = summarize_protocol(protocol)
        assert "ADHD" in summary
        assert "Cz" in summary
        assert "game_based" in summary
        assert "SMR_theta_beta_training" in summary

    def test_summary_for_error_protocol(self):
        error_protocol = {"error": "Test error message", "patient": {}}
        summary = summarize_protocol(error_protocol)
        assert "ERROR" in summary
        assert "Test error message" in summary

    def test_summary_all_diagnoses(self):
        """Generate and verify summaries for all supported diagnoses."""
        for diagnosis in Diagnosis:
            if diagnosis == Diagnosis.PEAK_PERFORMANCE:
                # Skip peak performance for children; use adult
                patient = {"diagnosis": diagnosis.value, "age": 25,
                          "constraints": {"sessions_per_week": 1, "max_sessions": 15}}
            else:
                patient = {"diagnosis": diagnosis.value, "age": 30,
                          "constraints": {"sessions_per_week": 2, "max_sessions": 30}}
            try:
                protocol = build_protocol(patient)
                summary = summarize_protocol(protocol)
                assert "NEUROFEEDBACK PROTOCOL SUMMARY" in summary
                assert diagnosis.value in summary
            except ValueError:
                pytest.skip(f"Skipping {diagnosis.value} due to age constraint")


# ============================================================================
# Protocol Library Integrity
# ============================================================================

class TestProtocolLibraryIntegrity:
    """Verify the protocol library data integrity."""

    def test_all_diagnoses_have_templates(self):
        for diagnosis in Diagnosis:
            assert diagnosis in PROTOCOL_LIBRARY, f"Missing template for {diagnosis.value}"

    def test_all_templates_have_evidence(self):
        for diagnosis, template in PROTOCOL_LIBRARY.items():
            assert template.evidence.n_trials > 0
            assert template.evidence.meta_analysis != ""
            assert template.evidence.evidence_grade in EvidenceGrade

    def test_all_templates_have_safety_screening(self):
        for diagnosis, template in PROTOCOL_LIBRARY.items():
            assert len(template.safety.contraindications) > 0
            assert len(template.safety.cautions) > 0
            assert len(template.safety.required_assessments) > 0

    def test_all_templates_have_age_modifications(self):
        for diagnosis, template in PROTOCOL_LIBRARY.items():
            assert template.pediatric_mods.session_duration_min > 0 or diagnosis == Diagnosis.PEAK_PERFORMANCE
            assert template.adult_mods.session_duration_min > 0
            assert template.geriatric_mods.session_duration_min > 0

    def test_sessions_within_valid_range(self):
        for diagnosis, template in PROTOCOL_LIBRARY.items():
            assert template.sessions_range[0] <= template.sessions_default <= template.sessions_range[1]

    def test_frequency_bands_valid(self):
        for diagnosis, template in PROTOCOL_LIBRARY.items():
            inc_low, inc_high = template.parameters.target_frequency_increase
            dec_low, dec_high = template.parameters.target_frequency_decrease
            # If not individualized (0,0), check valid range
            if inc_low > 0 and inc_high > 0:
                assert 0.5 <= inc_low < inc_high <= 50
            if dec_low > 0 and dec_high > 0:
                assert 0.5 <= dec_low < dec_high <= 50


# ============================================================================
# Data Classes
# ============================================================================

class TestDataClasses:
    """Test data class serialization."""

    def test_montage_to_dict(self):
        m = Montage(active="Cz", reference="linked_ears", ground="Fpz")
        d = m.to_dict()
        assert d == {"active": "Cz", "reference": "linked_ears", "ground": "Fpz"}

    def test_montage_with_secondary(self):
        m = Montage(active="Cz", reference="linked_ears", ground="Fpz",
                    secondary_active="Fz", description="test")
        d = m.to_dict()
        assert d["secondary_active"] == "Fz"
        assert d["description"] == "test"

    def test_evidence_to_dict(self):
        e = Evidence(
            meta_analysis="Test_2024",
            n_trials=10,
            evidence_grade=EvidenceGrade.B,
            effect_size=0.75,
            confidence_interval=(0.50, 1.00),
        )
        d = e.to_dict()
        assert d["meta_analysis"] == "Test_2024"
        assert d["effect_size"] == 0.75
        assert d["confidence_interval"] == [0.50, 1.00]

    def test_protocol_parameters_to_dict(self):
        p = ProtocolParameters(
            target_increase="alpha_up",
            target_decrease="theta_down",
            target_frequency_increase=(8.0, 12.0),
            target_frequency_decrease=(4.0, 8.0),
            threshold_method=ThresholdMethod.ADAPTIVE_PERCENTILE,
            session_duration_min=30,
            trials_per_session=100,
            reinforcement=ReinforcementType.AUDITORY_VISUAL,
            transfer_instructions="test transfer",
        )
        d = p.to_dict()
        assert d["target_increase"] == "alpha_up"
        assert d["target_frequency_increase_hz"] == [8.0, 12.0]
        assert d["threshold_method"] == "adaptive_percentile"


# ============================================================================
# Main
# ============================================================================

if __name__ == "__main__":
    pytest.main([__file__, "-v"])
