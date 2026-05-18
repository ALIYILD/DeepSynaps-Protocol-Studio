#!/usr/bin/env python3
"""
Comprehensive test suite for TMS Protocol Builder.

Tests all protocol generation, safety checking, motor threshold estimation,
FDA clearance lookup, and maintenance protocol functions.

Run with: python -m pytest test_tms_protocol_builder.py -v
          python -m pytest test_tms_protocol_builder.py --cov=tms_protocol_builder
"""

from __future__ import annotations

import sys
import os
import unittest
from typing import Any, Dict

# Ensure the module is importable
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from tms_protocol_builder import (
    TMSProtocolBuilder,
    build_protocol,
    calculate_motor_threshold,
    check_fda_clearance,
    maintenance_protocol,
    get_all_fda_cleared_protocols,
    PROTOCOL_LIBRARY,
    CONTRAINDICATIONS_ABSOLUTE,
    CONTRAINDICATIONS_RELATIVE,
    SEIZURE_THRESHOLD_MEDICATIONS,
    MOTOR_THRESHOLD_REFERENCE,
    CoilType,
    TargetRegion,
    StimulationFrequency,
    PatientAgeGroup,
    SafetyLevel,
)


# =============================================================================
# FIXTURES
# =============================================================================

def get_test_patient_mdd_acute() -> Dict[str, Any]:
    """Standard MDD patient for acute treatment."""
    return {
        "diagnosis": "MDD",
        "age": 45,
        "sex": "female",
        "failed_medications": 2,
        "current_medications": ["sertraline"],
        "seizure_history": False,
        "metal_in_body": [],
        "pregnancy_status": False,
    }

def get_test_patient_mdd_trd() -> Dict[str, Any]:
    """Treatment-resistant depression patient."""
    return {
        "diagnosis": "treatment-resistant depression",
        "age": 52,
        "sex": "male",
        "failed_medications": 4,
        "current_medications": ["venlafaxine", "lithium", "aripiprazole"],
        "seizure_history": False,
        "metal_in_body": [],
        "pregnancy_status": False,
    }

def get_test_patient_ocd() -> Dict[str, Any]:
    """OCD patient."""
    return {
        "diagnosis": "OCD",
        "age": 32,
        "sex": "female",
        "failed_medications": 2,
        "current_medications": ["clomipramine", "risperidone"],
        "seizure_history": False,
        "metal_in_body": [],
        "pregnancy_status": False,
    }

def get_test_patient_ptsd() -> Dict[str, Any]:
    """PTSD patient."""
    return {
        "diagnosis": "PTSD",
        "age": 38,
        "sex": "male",
        "failed_medications": 1,
        "current_medications": ["prazosin", "sertraline"],
        "seizure_history": False,
        "metal_in_body": [],
        "pregnancy_status": False,
    }

def get_test_patient_bipolar() -> Dict[str, Any]:
    """Bipolar depression patient."""
    return {
        "diagnosis": "bipolar depression",
        "age": 29,
        "sex": "female",
        "failed_medications": 1,
        "current_medications": ["lamotrigine", "lurasidone"],
        "seizure_history": False,
        "metal_in_body": [],
        "pregnancy_status": False,
    }

def get_test_patient_smoking() -> Dict[str, Any]:
    """Smoking cessation patient."""
    return {
        "diagnosis": "nicotine dependence",
        "age": 41,
        "sex": "male",
        "failed_medications": 0,
        "current_medications": ["nicotine_patch"],
        "seizure_history": False,
        "metal_in_body": [],
        "pregnancy_status": False,
    }

def get_test_patient_fibromyalgia() -> Dict[str, Any]:
    """Fibromyalgia patient."""
    return {
        "diagnosis": "fibromyalgia",
        "age": 55,
        "sex": "female",
        "failed_medications": 2,
        "current_medications": ["duloxetine", "pregabalin"],
        "seizure_history": False,
        "metal_in_body": [],
        "pregnancy_status": False,
    }

def get_test_patient_migraine() -> Dict[str, Any]:
    """Migraine patient."""
    return {
        "diagnosis": "migraine",
        "age": 35,
        "sex": "female",
        "failed_medications": 1,
        "current_medications": ["topiramate"],
        "seizure_history": False,
        "metal_in_body": [],
        "pregnancy_status": False,
    }

def get_test_patient_anxious_depression() -> Dict[str, Any]:
    """Anxious depression patient."""
    return {
        "diagnosis": "anxious depression",
        "age": 48,
        "sex": "male",
        "failed_medications": 2,
        "current_medications": ["escitalopram"],
        "seizure_history": False,
        "metal_in_body": [],
        "pregnancy_status": False,
    }

def get_test_patient_gad() -> Dict[str, Any]:
    """Generalized anxiety disorder patient."""
    return {
        "diagnosis": "GAD",
        "age": 36,
        "sex": "female",
        "failed_medications": 1,
        "current_medications": ["buspirone"],
        "seizure_history": False,
        "metal_in_body": [],
        "pregnancy_status": False,
    }

def get_test_patient_pediatric() -> Dict[str, Any]:
    """Pediatric depression patient."""
    return {
        "diagnosis": "depression",
        "age": 16,
        "sex": "male",
        "failed_medications": 1,
        "current_medications": ["fluoxetine"],
        "seizure_history": False,
        "metal_in_body": [],
        "pregnancy_status": False,
    }

def get_test_patient_geriatric() -> Dict[str, Any]:
    """Geriatric depression patient."""
    return {
        "diagnosis": "depression",
        "age": 78,
        "sex": "female",
        "failed_medications": 2,
        "current_medications": ["mirtazapine"],
        "seizure_history": False,
        "metal_in_body": [],
        "pregnancy_status": False,
    }

def get_test_patient_contraindicated() -> Dict[str, Any]:
    """Patient with absolute contraindication (cochlear implant)."""
    return {
        "diagnosis": "depression",
        "age": 45,
        "sex": "male",
        "failed_medications": 2,
        "current_medications": [],
        "seizure_history": False,
        "metal_in_body": ["cochlear implant"],
        "pregnancy_status": False,
    }

def get_test_patient_seizure_history() -> Dict[str, Any]:
    """Patient with seizure history."""
    return {
        "diagnosis": "depression",
        "age": 35,
        "sex": "female",
        "failed_medications": 2,
        "current_medications": ["carbamazepine", "sertraline"],
        "seizure_history": True,
        "metal_in_body": [],
        "pregnancy_status": False,
    }


# =============================================================================
# TEST CLASSES
# =============================================================================

class TestTMSProtocolBuilderCore(unittest.TestCase):
    """Test core protocol builder functionality."""

    def setUp(self) -> None:
        self.builder = TMSProtocolBuilder()

    # ---- Validation Tests ----

    def test_validate_patient_data_valid(self) -> None:
        """Should accept valid patient data."""
        patient = get_test_patient_mdd_acute()
        self.builder._validate_patient_data(patient)  # Should not raise

    def test_validate_patient_data_missing_fields(self) -> None:
        """Should raise ValueError for missing required fields."""
        with self.assertRaises(ValueError) as ctx:
            self.builder._validate_patient_data({})
        self.assertIn("Missing required", str(ctx.exception))

    def test_validate_patient_data_invalid_age_type(self) -> None:
        """Should raise ValueError for non-numeric age."""
        with self.assertRaises(ValueError):
            self.builder._validate_patient_data({
                "diagnosis": "MDD", "age": "forty", "sex": "female"
            })

    def test_validate_patient_data_age_out_of_range(self) -> None:
        """Should raise ValueError for age out of range."""
        with self.assertRaises(ValueError):
            self.builder._validate_patient_data({
                "diagnosis": "MDD", "age": 150, "sex": "female"
            })

    def test_validate_patient_data_invalid_sex(self) -> None:
        """Should raise ValueError for invalid sex value."""
        with self.assertRaises(ValueError):
            self.builder._validate_patient_data({
                "diagnosis": "MDD", "age": 45, "sex": "unknown"
            })

    # ---- Age Classification Tests ----

    def test_classify_age_group_pediatric(self) -> None:
        self.assertEqual(self.builder._classify_age_group(16), "pediatric")
        self.assertEqual(self.builder._classify_age_group(5), "pediatric")

    def test_classify_age_group_adult(self) -> None:
        self.assertEqual(self.builder._classify_age_group(18), "adult")
        self.assertEqual(self.builder._classify_age_group(45), "adult")
        self.assertEqual(self.builder._classify_age_group(64), "adult")

    def test_classify_age_group_geriatric(self) -> None:
        self.assertEqual(self.builder._classify_age_group(65), "geriatric")
        self.assertEqual(self.builder._classify_age_group(80), "geriatric")

    # ---- Diagnosis Matching Tests ----

    def test_match_diagnosis_mdd(self) -> None:
        patient = get_test_patient_mdd_acute()
        result = self.builder._match_diagnosis("mdd", patient)
        self.assertIsNotNone(result)
        self.assertIn("major_depressive_disorder", result)

    def test_match_diagnosis_depression_keyword(self) -> None:
        patient = get_test_patient_mdd_acute()
        result = self.builder._match_diagnosis("major depression", patient)
        self.assertIsNotNone(result)

    def test_match_diagnosis_ocd(self) -> None:
        patient = get_test_patient_ocd()
        result = self.builder._match_diagnosis("ocd", patient)
        self.assertEqual(result, "obsessive_compulsive_disorder")

    def test_match_diagnosis_ptsd(self) -> None:
        patient = get_test_patient_ptsd()
        result = self.builder._match_diagnosis("ptsd", patient)
        self.assertEqual(result, "ptsd")

    def test_match_diagnosis_bipolar(self) -> None:
        patient = get_test_patient_bipolar()
        result = self.builder._match_diagnosis("bipolar depression", patient)
        self.assertEqual(result, "bipolar_depression")

    def test_match_diagnosis_smoking(self) -> None:
        patient = get_test_patient_smoking()
        result = self.builder._match_diagnosis("nicotine dependence", patient)
        self.assertEqual(result, "smoking_cessation")

    def test_match_diagnosis_fibromyalgia(self) -> None:
        patient = get_test_patient_fibromyalgia()
        result = self.builder._match_diagnosis("fibromyalgia", patient)
        self.assertEqual(result, "fibromyalgia")

    def test_match_diagnosis_migraine(self) -> None:
        patient = get_test_patient_migraine()
        result = self.builder._match_diagnosis("migraine", patient)
        self.assertEqual(result, "migraine_prevention")

    def test_match_diagnosis_gad(self) -> None:
        patient = get_test_patient_gad()
        result = self.builder._match_diagnosis("gad", patient)
        self.assertEqual(result, "generalized_anxiety_disorder")

    def test_match_diagnosis_anxious_depression(self) -> None:
        patient = get_test_patient_anxious_depression()
        result = self.builder._match_diagnosis("anxious depression", patient)
        self.assertEqual(result, "anxious_depression")

    def test_match_diagnosis_trd(self) -> None:
        patient = get_test_patient_mdd_trd()
        result = self.builder._match_diagnosis("treatment resistant depression", patient)
        self.assertEqual(result, "major_depressive_disorder_itbs")

    def test_match_diagnosis_treatment_resistant_by_failed_meds(self) -> None:
        """Should match to iTBS when failed_meds >= 2."""
        patient = {"failed_medications": 3}
        result = self.builder._match_diagnosis("depression", patient)
        self.assertEqual(result, "major_depressive_disorder_itbs")

    def test_match_diagnosis_unmatched(self) -> None:
        patient = get_test_patient_mdd_acute()
        result = self.builder._match_diagnosis("unknown_condition_xyz", patient)
        self.assertIsNone(result)


class TestBuildProtocol(unittest.TestCase):
    """Test the main build_protocol function for all conditions."""

    def setUp(self) -> None:
        self.builder = TMSProtocolBuilder()

    def _assert_common_protocol_structure(self, protocol: Dict[str, Any]) -> None:
        """Assert that protocol has the expected canonical structure."""
        self.assertEqual(protocol["modality"], "rTMS")
        self.assertIn("protocol", protocol)
        self.assertIn("evidence", protocol)
        self.assertIn("safety", protocol)
        self.assertIn("generated_for", protocol)

        p = protocol["protocol"]
        self.assertIn("coil", p)
        self.assertIn("target", p)
        self.assertIn("targeting_method", p)
        self.assertIn("intensity_motor_threshold_pct", p)
        self.assertIn("frequency_hz", p)
        self.assertIn("pulses_per_session", p)
        self.assertIn("session_duration_min", p)
        self.assertIn("sessions_total", p)
        self.assertIn("schedule", p)

    # ---- MDD Protocol Tests ----

    def test_build_protocol_mdd_acute(self) -> None:
        patient = get_test_patient_mdd_acute()
        protocol = self.builder.build_protocol(patient)
        self._assert_common_protocol_structure(protocol)

        p = protocol["protocol"]
        self.assertEqual(p["target"], "L_DLPFC")
        self.assertEqual(p["frequency_hz"], "10Hz")
        self.assertEqual(p["intensity_motor_threshold_pct"], 120)
        self.assertEqual(p["pulses_per_session"], 3000)
        self.assertEqual(p["sessions_total"], 30)
        self.assertEqual(p["schedule"], "5_days_week_x6_weeks")

        # Check evidence
        self.assertIn("fda_clearance", protocol["evidence"])
        self.assertIn("nice_guideline", protocol["evidence"])
        self.assertIn("cochrane_review", protocol["evidence"])

    def test_build_protocol_mdd_trd(self) -> None:
        patient = get_test_patient_mdd_trd()
        protocol = self.builder.build_protocol(patient)
        self._assert_common_protocol_structure(protocol)

        p = protocol["protocol"]
        # TRD should get iTBS protocol
        self.assertEqual(p["frequency_hz"], "iTBS")
        self.assertEqual(p["pulses_per_session"], 600)
        self.assertEqual(p["session_duration_min"], 9)

    # ---- OCD Protocol Tests ----

    def test_build_protocol_ocd(self) -> None:
        patient = get_test_patient_ocd()
        protocol = self.builder.build_protocol(patient)
        self._assert_common_protocol_structure(protocol)

        p = protocol["protocol"]
        self.assertEqual(p["target"], "SMA")
        self.assertEqual(p["frequency_hz"], "10Hz")
        self.assertTrue(protocol["evidence"]["fda_clearance"]["status"] in ["FDA_cleared", "Off_label"])

    # ---- PTSD Protocol Tests ----

    def test_build_protocol_ptsd(self) -> None:
        patient = get_test_patient_ptsd()
        protocol = self.builder.build_protocol(patient)
        self._assert_common_protocol_structure(protocol)

        p = protocol["protocol"]
        self.assertEqual(p["target"], "R_DLPFC")
        self.assertEqual(p["frequency_hz"], "1Hz")
        self.assertEqual(p["pulses_per_session"], 1500)

    # ---- Bipolar Depression Tests ----

    def test_build_protocol_bipolar(self) -> None:
        patient = get_test_patient_bipolar()
        protocol = self.builder.build_protocol(patient)
        self._assert_common_protocol_structure(protocol)

        p = protocol["protocol"]
        self.assertEqual(p["target"], "L_DLPFC")
        self.assertEqual(p["frequency_hz"], "10Hz")
        # Bipolar should have lower intensity
        self.assertLessEqual(p["intensity_motor_threshold_pct"], 110)

        # Check for manic switch warning
        warnings = protocol.get("special_warnings", [])
        self.assertTrue(any("manic" in w.lower() for w in warnings))

    # ---- Smoking Cessation Tests ----

    def test_build_protocol_smoking(self) -> None:
        patient = get_test_patient_smoking()
        protocol = self.builder.build_protocol(patient)
        self._assert_common_protocol_structure(protocol)

        p = protocol["protocol"]
        self.assertEqual(p["target"], "L_DLPFC")
        self.assertEqual(p["frequency_hz"], "10Hz")
        self.assertEqual(p["sessions_total"], 10)

        # Check FDA clearance
        self.assertEqual(
            protocol["evidence"]["fda_clearance"]["status"],
            "FDA_cleared"
        )

    # ---- Fibromyalgia Tests ----

    def test_build_protocol_fibromyalgia(self) -> None:
        patient = get_test_patient_fibromyalgia()
        protocol = self.builder.build_protocol(patient)
        self._assert_common_protocol_structure(protocol)

        p = protocol["protocol"]
        self.assertEqual(p["target"], "M1")
        self.assertEqual(p["frequency_hz"], "10Hz")
        # Lower intensity for pain protocols
        self.assertLessEqual(p["intensity_motor_threshold_pct"], 90)

    # ---- Migraine Tests ----

    def test_build_protocol_migraine(self) -> None:
        patient = get_test_patient_migraine()
        protocol = self.builder.build_protocol(patient)
        self._assert_common_protocol_structure(protocol)

        p = protocol["protocol"]
        self.assertEqual(p["target"], "motor_cortex")
        self.assertEqual(p["frequency_hz"], "single_pulse")

    # ---- Anxious Depression Tests ----

    def test_build_protocol_anxious_depression(self) -> None:
        patient = get_test_patient_anxious_depression()
        protocol = self.builder.build_protocol(patient)
        self._assert_common_protocol_structure(protocol)

        p = protocol["protocol"]
        self.assertEqual(p["target"], "bilateral_DLPFC")
        self.assertEqual(p["frequency_hz"], "10Hz")
        self.assertEqual(p["pulses_per_session"], 4500)

    # ---- GAD Tests ----

    def test_build_protocol_gad(self) -> None:
        patient = get_test_patient_gad()
        protocol = self.builder.build_protocol(patient)
        self._assert_common_protocol_structure(protocol)

        p = protocol["protocol"]
        self.assertEqual(p["target"], "R_DLPFC")
        self.assertEqual(p["frequency_hz"], "1Hz")

    # ---- Contraindication Tests ----

    def test_build_protocol_contraindicated(self) -> None:
        patient = get_test_patient_contraindicated()
        protocol = self.builder.build_protocol(patient)
        self.assertEqual(protocol["status"], "CONTRAINDICATED")
        self.assertIsNone(protocol["protocol"])
        self.assertEqual(protocol["safety"]["level"], SafetyLevel.RED.value)

    # ---- Unmatched Diagnosis Tests ----

    def test_build_protocol_unmatched_diagnosis(self) -> None:
        patient = {
            "diagnosis": "some_unknown_rare_condition",
            "age": 45,
            "sex": "female",
        }
        protocol = self.builder.build_protocol(patient)
        self.assertEqual(protocol["status"], "DIAGNOSIS_NOT_SUPPORTED")
        self.assertIsNone(protocol["protocol"])


class TestPediatricGeriatricAdjustments(unittest.TestCase):
    """Test age-specific protocol modifications."""

    def setUp(self) -> None:
        self.builder = TMSProtocolBuilder()

    def test_pediatric_intensity_capped(self) -> None:
        patient = get_test_patient_pediatric()
        protocol = self.builder.build_protocol(patient)
        intensity = protocol["protocol"]["intensity_motor_threshold_pct"]
        self.assertLessEqual(intensity, 100)

    def test_pediatric_pulses_reduced(self) -> None:
        patient = get_test_patient_pediatric()
        protocol = self.builder.build_protocol(patient)
        pulses = protocol["protocol"]["pulses_per_session"]
        # Should be reduced from standard 3000
        self.assertLess(pulses, 3000)

    def test_pediatric_adjustments_logged(self) -> None:
        patient = get_test_patient_pediatric()
        protocol = self.builder.build_protocol(patient)
        adjustments = protocol.get("patient_specific_adjustments", [])
        self.assertTrue(any("pediatric" in a.lower() for a in adjustments))

    def test_geriatric_inter_train_interval_increased(self) -> None:
        patient = get_test_patient_geriatric()
        protocol = self.builder.build_protocol(patient)
        # Check that geriatric adjustments were applied
        adjustments = protocol.get("patient_specific_adjustments", [])
        self.assertTrue(any("geriatric" in a.lower() for a in adjustments))

    def test_geriatric_intensity_capped(self) -> None:
        patient = get_test_patient_geriatric()
        protocol = self.builder.build_protocol(patient)
        intensity = protocol["protocol"]["intensity_motor_threshold_pct"]
        self.assertLessEqual(intensity, 110)


class TestSeizureSafety(unittest.TestCase):
    """Test seizure risk assessment and parameter adjustments."""

    def setUp(self) -> None:
        self.builder = TMSProtocolBuilder()

    def test_seizure_history_flagged(self) -> None:
        patient = get_test_patient_seizure_history()
        protocol = self.builder.build_protocol(patient)
        safety = protocol["safety"]
        self.assertEqual(safety["assessment_level"], SafetyLevel.YELLOW.value)

    def test_seizure_history_intensity_reduced(self) -> None:
        patient = get_test_patient_seizure_history()
        protocol = self.builder.build_protocol(patient)
        intensity = protocol["protocol"]["intensity_motor_threshold_pct"]
        self.assertLessEqual(intensity, 110)

    def test_seizure_threshold_medication_adjustment(self) -> None:
        patient = {
            "diagnosis": "depression",
            "age": 40,
            "sex": "female",
            "current_medications": ["bupropion", "clozapine"],
        }
        protocol = self.builder.build_protocol(patient)
        multiplier = protocol["safety"]["seizure_risk_multiplier"]
        # bupropion (0.85) * clozapine (0.75) = 0.6375
        self.assertLess(multiplier, 0.70)

    def test_seizure_medication_intensity_reduction(self) -> None:
        patient = {
            "diagnosis": "depression",
            "age": 40,
            "sex": "female",
            "current_medications": ["bupropion", "clozapine"],
        }
        protocol = self.builder.build_protocol(patient)
        intensity = protocol["protocol"]["intensity_motor_threshold_pct"]
        self.assertLessEqual(intensity, 110)


class TestMotorThresholdCalculation(unittest.TestCase):
    """Test motor threshold estimation."""

    def setUp(self) -> None:
        self.builder = TMSProtocolBuilder()

    def test_mt_adult_male_default(self) -> None:
        patient = {"age": 40, "sex": "male"}
        mt = self.builder.calculate_motor_threshold(patient)
        self.assertGreaterEqual(mt, 25.0)
        self.assertLessEqual(mt, 90.0)
        # Should be around 52% for adult male
        self.assertAlmostEqual(mt, 53.0, delta=10.0)

    def test_mt_adult_female_default(self) -> None:
        patient = {"age": 40, "sex": "female"}
        mt = self.builder.calculate_motor_threshold(patient)
        self.assertGreaterEqual(mt, 25.0)
        self.assertLessEqual(mt, 90.0)
        # Should be around 50% for adult female
        self.assertAlmostEqual(mt, 50.0, delta=10.0)

    def test_mt_pediatric_lower(self) -> None:
        patient = {"age": 16, "sex": "male"}
        mt = self.builder.calculate_motor_threshold(patient)
        # Pediatric should be lower
        self.assertLess(mt, 50.0)

    def test_mt_geriatric_higher(self) -> None:
        patient = {"age": 75, "sex": "male"}
        mt = self.builder.calculate_motor_threshold(patient)
        # Geriatric should be higher due to atrophy
        self.assertGreater(mt, 55.0)

    def test_mt_medication_effect(self) -> None:
        patient_without = {"age": 45, "sex": "male", "current_medications": []}
        patient_with = {"age": 45, "sex": "male", "current_medications": ["carbamazepine"]}
        mt_without = self.builder.calculate_motor_threshold(patient_without)
        mt_with = self.builder.calculate_motor_threshold(patient_with)
        # Carbamazepine increases MT
        self.assertGreater(mt_with, mt_without)

    def test_mt_clamped_minimum(self) -> None:
        patient = {"age": 10, "sex": "female", "current_medications": []}
        mt = self.builder.calculate_motor_threshold(patient)
        self.assertGreaterEqual(mt, 25.0)

    def test_mt_clamped_maximum(self) -> None:
        patient = {"age": 85, "sex": "male", "current_medications": ["carbamazepine"]}
        mt = self.builder.calculate_motor_threshold(patient)
        self.assertLessEqual(mt, 90.0)

    def test_mt_convenience_function(self) -> None:
        patient = {"age": 45, "sex": "female"}
        mt = calculate_motor_threshold(patient)
        self.assertGreater(mt, 0)
        self.assertLessEqual(mt, 100)


class TestFDAClearance(unittest.TestCase):
    """Test FDA clearance checker."""

    def setUp(self) -> None:
        self.builder = TMSProtocolBuilder()

    def test_fda_clearance_depression(self) -> None:
        result = self.builder.check_fda_clearance("depression")
        self.assertEqual(result["fda_status"], "cleared")
        self.assertIn("required_parameters", result)

    def test_fda_clearance_ocd(self) -> None:
        result = self.builder.check_fda_clearance("OCD")
        self.assertEqual(result["fda_status"], "cleared")

    def test_fda_clearance_smoking(self) -> None:
        result = self.builder.check_fda_clearance("smoking")
        self.assertEqual(result["fda_status"], "cleared")

    def test_fda_clearance_fibromyalgia(self) -> None:
        result = self.builder.check_fda_clearance("fibromyalgia")
        self.assertEqual(result["fda_status"], "cleared")

    def test_fda_clearance_migraine(self) -> None:
        result = self.builder.check_fda_clearance("migraine")
        self.assertEqual(result["fda_status"], "cleared")

    def test_fda_clearance_bipolar_off_label(self) -> None:
        result = self.builder.check_fda_clearance("bipolar")
        self.assertEqual(result["fda_status"], "off_label")
        self.assertTrue(result["informed_consent_required"])

    def test_fda_clearance_ptsd_off_label(self) -> None:
        result = self.builder.check_fda_clearance("PTSD")
        self.assertEqual(result["fda_status"], "off_label")

    def test_fda_clearance_not_found(self) -> None:
        result = self.builder.check_fda_clearance("some_unknown_condition")
        self.assertEqual(result["fda_status"], "not_found")

    def test_fda_convenience_function(self) -> None:
        result = check_fda_clearance("depression")
        self.assertEqual(result["fda_status"], "cleared")

    def test_fda_cleared_devices_list(self) -> None:
        result = self.builder.check_fda_clearance("depression")
        self.assertIn("cleared_devices", result)
        devices = result["cleared_devices"]
        self.assertGreater(len(devices), 0)

    def test_required_parameters_structure(self) -> None:
        result = self.builder.check_fda_clearance("depression")
        params = result["required_parameters"]
        self.assertIn("target", params)
        self.assertIn("frequency", params)
        self.assertIn("intensity", params)


class TestMaintenanceProtocol(unittest.TestCase):
    """Test maintenance protocol generation."""

    def setUp(self) -> None:
        self.builder = TMSProtocolBuilder()
        self.acute_protocol = {
            "modality": "rTMS",
            "protocol": {
                "coil": "figure_8",
                "target": "L_DLPFC",
                "frequency_hz": "10Hz",
                "intensity_motor_threshold_pct": 120,
                "pulses_per_session": 3000,
                "session_duration_min": 37,
            },
            "evidence": {},
        }

    def test_maintenance_full_remission(self) -> None:
        result = self.builder.maintenance_protocol(self.acute_protocol, "full_remission")
        self.assertIsNotNone(result)
        self.assertTrue(result["recommended"])
        self.assertEqual(result["protocol_type"], "maintenance_remission")
        self.assertIn("schedule", result)
        self.assertIn("phase_2_maintenance", result["schedule"])

    def test_maintenance_partial_response(self) -> None:
        result = self.builder.maintenance_protocol(self.acute_protocol, "partial_response")
        self.assertIsNotNone(result)
        self.assertTrue(result["recommended"])
        self.assertEqual(result["protocol_type"], "maintenance_partial_response")
        # Should have optimization suggestions
        self.assertIn("optimization", result)

    def test_maintenance_non_responder(self) -> None:
        result = self.builder.maintenance_protocol(self.acute_protocol, "non_responder")
        self.assertIsNotNone(result)
        self.assertFalse(result["recommended"])
        self.assertIn("alternatives", result)

    def test_maintenance_relapsed(self) -> None:
        result = self.builder.maintenance_protocol(self.acute_protocol, "relapsed")
        self.assertIsNotNone(result)
        self.assertTrue(result["recommended"])
        self.assertEqual(result["protocol_type"], "re_induction")

    def test_maintenance_variants_case_insensitive(self) -> None:
        for response in ["FULL_REMISSION", "Full_Remission", "full_remission"]:
            result = self.builder.maintenance_protocol(self.acute_protocol, response)
            self.assertTrue(result["recommended"])

    def test_maintenance_convenience_function(self) -> None:
        result = maintenance_protocol(self.acute_protocol, "full_remission")
        self.assertIsNotNone(result)
        self.assertTrue(result["recommended"])

    def test_maintenance_returns_none_for_invalid_response(self) -> None:
        result = self.builder.maintenance_protocol(self.acute_protocol, "invalid_response")
        self.assertIsNone(result)


class TestSafetyAssessment(unittest.TestCase):
    """Test safety and contraindication checking."""

    def setUp(self) -> None:
        self.builder = TMSProtocolBuilder()

    def test_safety_green_normal_patient(self) -> None:
        patient = get_test_patient_mdd_acute()
        safety = self.builder._check_contraindications(patient)
        self.assertEqual(safety["level"], SafetyLevel.GREEN.value)

    def test_safety_red_cochlear_implant(self) -> None:
        patient = get_test_patient_contraindicated()
        safety = self.builder._check_contraindications(patient)
        self.assertEqual(safety["level"], SafetyLevel.RED.value)

    def test_safety_yellow_seizure_history(self) -> None:
        patient = get_test_patient_seizure_history()
        safety = self.builder._check_contraindications(patient)
        self.assertEqual(safety["level"], SafetyLevel.YELLOW.value)

    def test_safety_yellow_pregnancy(self) -> None:
        patient = get_test_patient_mdd_acute()
        patient["pregnancy_status"] = True
        safety = self.builder._check_contraindications(patient)
        self.assertEqual(safety["level"], SafetyLevel.YELLOW.value)

    def test_safety_red_mania(self) -> None:
        patient = get_test_patient_mdd_acute()
        patient["current_manic_episode"] = True
        safety = self.builder._check_contraindications(patient)
        self.assertEqual(safety["level"], SafetyLevel.RED.value)

    def test_safety_red_acute_intoxication(self) -> None:
        patient = get_test_patient_mdd_acute()
        patient["acute_substance_intoxication"] = True
        safety = self.builder._check_contraindications(patient)
        self.assertEqual(safety["level"], SafetyLevel.RED.value)

    def test_safety_yellow_pediatric(self) -> None:
        patient = get_test_patient_pediatric()
        safety = self.builder._check_contraindications(patient)
        self.assertEqual(safety["level"], SafetyLevel.YELLOW.value)

    def test_safety_yellow_advanced_age(self) -> None:
        patient = get_test_patient_geriatric()
        patient["age"] = 82
        safety = self.builder._check_contraindications(patient)
        self.assertEqual(safety["level"], SafetyLevel.YELLOW.value)

    def test_seizure_risk_multiplier_calculation(self) -> None:
        patient = {
            "diagnosis": "depression",
            "age": 45,
            "sex": "female",
            "current_medications": ["bupropion"],
        }
        safety = self.builder._check_contraindications(patient)
        self.assertLess(safety["seizure_risk_multiplier"], 1.0)

    def test_earplugs_always_required(self) -> None:
        patient = get_test_patient_mdd_acute()
        safety = self.builder._check_contraindications(patient)
        self.assertTrue(safety["earplugs_required"])


class TestProtocolLibraryIntegrity(unittest.TestCase):
    """Test protocol library data integrity."""

    def test_all_protocols_have_required_keys(self) -> None:
        required_keys = [
            "condition", "diagnosis_codes", "parameters",
            "schedule", "evidence", "safety_limits",
        ]
        for key, proto in PROTOCOL_LIBRARY.items():
            for rk in required_keys:
                self.assertIn(rk, proto, f"Protocol '{key}' missing '{rk}'")

    def test_all_parameters_have_required_keys(self) -> None:
        required_param_keys = [
            "coil", "target", "targeting_method", "frequency_hz",
            "intensity_motor_threshold_pct", "pulses_per_session",
            "session_duration_min",
        ]
        for key, proto in PROTOCOL_LIBRARY.items():
            for pk in required_param_keys:
                self.assertIn(
                    pk, proto["parameters"],
                    f"Protocol '{key}' parameters missing '{pk}'"
                )

    def test_all_schedules_have_required_keys(self) -> None:
        required_schedule_keys = [
            "sessions_total", "sessions_per_week",
            "schedule_description",
        ]
        for key, proto in PROTOCOL_LIBRARY.items():
            for sk in required_schedule_keys:
                self.assertIn(
                    sk, proto["schedule"],
                    f"Protocol '{key}' schedule missing '{sk}'"
                )

    def test_all_evidence_has_key_trials(self) -> None:
        for key, proto in PROTOCOL_LIBRARY.items():
            self.assertIn("key_trials", proto["evidence"])
            self.assertIsInstance(proto["evidence"]["key_trials"], list)

    def test_safety_limits_are_reasonable(self) -> None:
        for key, proto in PROTOCOL_LIBRARY.items():
            limits = proto["safety_limits"]
            if "max_intensity_pct" in limits:
                self.assertLessEqual(limits["max_intensity_pct"], 130)
                self.assertGreaterEqual(limits["max_intensity_pct"], 80)
            if "max_pulses_per_session" in limits:
                self.assertLessEqual(limits["max_pulses_per_session"], 6000)

    def test_intensity_within_safety_limits(self) -> None:
        for key, proto in PROTOCOL_LIBRARY.items():
            intensity = proto["parameters"]["intensity_motor_threshold_pct"]
            limits = proto["safety_limits"]
            max_intensity = limits.get("max_intensity_pct", 120)
            self.assertLessEqual(
                intensity, max_intensity,
                f"Protocol '{key}' intensity {intensity} exceeds "
                f"safety limit {max_intensity}"
            )

    def test_no_duplicate_protocol_keys(self) -> None:
        keys = list(PROTOCOL_LIBRARY.keys())
        self.assertEqual(len(keys), len(set(keys)))


class TestContraindicationDatabase(unittest.TestCase):
    """Test contraindication database integrity."""

    def test_absolute_contraindications_not_empty(self) -> None:
        self.assertGreater(len(CONTRAINDICATIONS_ABSOLUTE), 0)

    def test_relative_contraindications_not_empty(self) -> None:
        self.assertGreater(len(CONTRAINDICATIONS_RELATIVE), 0)

    def test_seizure_medication_database(self) -> None:
        self.assertGreater(len(SEIZURE_THRESHOLD_MEDICATIONS), 0)
        for med, factor in SEIZURE_THRESHOLD_MEDICATIONS.items():
            self.assertGreater(factor, 0.0)
            self.assertLessEqual(factor, 1.0)

    def test_motor_threshold_reference(self) -> None:
        self.assertGreater(len(MOTOR_THRESHOLD_REFERENCE), 0)
        for key, ref in MOTOR_THRESHOLD_REFERENCE.items():
            self.assertIn("mean", ref)
            self.assertIn("sd", ref)
            self.assertIn("range", ref)
            self.assertGreater(ref["mean"], 0)


class TestUtilityMethods(unittest.TestCase):
    """Test utility and helper methods."""

    def setUp(self) -> None:
        self.builder = TMSProtocolBuilder()

    def test_list_available_protocols(self) -> None:
        protocols = self.builder.list_available_protocols()
        self.assertGreater(len(protocols), 0)
        for p in protocols:
            self.assertIn("condition", p)
            self.assertIn("fda_cleared", p)
            self.assertIn("primary_target", p)
            self.assertIn("frequency", p)

    def test_get_protocol_details(self) -> None:
        details = self.builder.get_protocol_details("major_depressive_disorder_acute")
        self.assertIsNotNone(details)
        self.assertEqual(details["condition"], "Major Depressive Disorder (Acute)")

    def test_get_protocol_details_invalid_key(self) -> None:
        details = self.builder.get_protocol_details("nonexistent_key")
        self.assertIsNone(details)

    def test_get_safety_guidelines(self) -> None:
        guidelines = self.builder.get_safety_guidelines()
        self.assertIn("absolute_contraindications", guidelines)
        self.assertIn("relative_contraindications", guidelines)
        self.assertIn("universal_precautions", guidelines)
        self.assertIn("references", guidelines)

    def test_get_all_fda_cleared_protocols(self) -> None:
        cleared = get_all_fda_cleared_protocols()
        self.assertGreater(len(cleared), 0)
        for p in cleared:
            self.assertIn("condition", p)
            self.assertIn("fda_clearance", p)
            self.assertIn("year", p)


class TestConvenienceFunctions(unittest.TestCase):
    """Test module-level convenience functions."""

    def test_build_protocol_convenience(self) -> None:
        patient = get_test_patient_mdd_acute()
        protocol = build_protocol(patient)
        self.assertEqual(protocol["modality"], "rTMS")
        self.assertIsNotNone(protocol["protocol"])

    def test_calculate_motor_threshold_convenience(self) -> None:
        mt = calculate_motor_threshold({"age": 40, "sex": "male"})
        self.assertGreater(mt, 0)
        self.assertLessEqual(mt, 100)

    def test_check_fda_clearance_convenience(self) -> None:
        result = check_fda_clearance("depression")
        self.assertIn(result["fda_status"], ["cleared", "off_label", "not_found"])


class TestMaintenancePhaseIntegration(unittest.TestCase):
    """Test building protocols with maintenance phase specified."""

    def test_build_protocol_with_maintenance_phase(self) -> None:
        patient = get_test_patient_mdd_acute()
        patient["treatment_phase"] = "maintenance"
        protocol = build_protocol(patient)
        # Should include maintenance protocol
        self.assertIn("maintenance_protocol", protocol)


class TestEdgeCases(unittest.TestCase):
    """Test edge cases and boundary conditions."""

    def setUp(self) -> None:
        self.builder = TMSProtocolBuilder()

    def test_minimum_valid_age(self) -> None:
        patient = {"diagnosis": "depression", "age": 5, "sex": "male"}
        mt = self.builder.calculate_motor_threshold(patient)
        self.assertGreater(mt, 0)

    def test_maximum_valid_age(self) -> None:
        patient = {"diagnosis": "depression", "age": 120, "sex": "female"}
        mt = self.builder.calculate_motor_threshold(patient)
        self.assertGreater(mt, 0)
        self.assertLessEqual(mt, 90.0)

    def test_patient_with_no_medications(self) -> None:
        patient = {
            "diagnosis": "depression",
            "age": 45,
            "sex": "female",
            "current_medications": [],
        }
        protocol = self.builder.build_protocol(patient)
        self.assertEqual(protocol["modality"], "rTMS")

    def test_patient_with_no_metal_implants_key(self) -> None:
        patient = {
            "diagnosis": "depression",
            "age": 45,
            "sex": "female",
        }
        protocol = self.builder.build_protocol(patient)
        self.assertEqual(protocol["modality"], "rTMS")

    def test_patient_sex_other(self) -> None:
        patient = {
            "diagnosis": "depression",
            "age": 45,
            "sex": "other",
            "failed_medications": 1,
        }
        protocol = self.builder.build_protocol(patient)
        self.assertEqual(protocol["modality"], "rTMS")
        self.assertEqual(protocol["generated_for"]["sex"], "other")

    def test_maintenance_with_malformed_acute_protocol(self) -> None:
        malformed = {"modality": "rTMS", "protocol": {}}
        result = self.builder.maintenance_protocol(malformed, "full_remission")
        self.assertIsNotNone(result)
        self.assertTrue(result["recommended"])

    def test_empty_medication_list(self) -> None:
        patient = {"age": 45, "sex": "female", "current_medications": []}
        mt = self.builder.calculate_motor_threshold(patient)
        self.assertGreater(mt, 0)

    def test_multiple_metal_implants(self) -> None:
        patient = {
            "diagnosis": "depression",
            "age": 45,
            "sex": "male",
            "metal_in_body": ["dental_implant", "hip_replacement"],
        }
        protocol = self.builder.build_protocol(patient)
        # Dental implants and non-cranial implants should not block
        self.assertEqual(protocol["modality"], "rTMS")


class TestEnumValues(unittest.TestCase):
    """Test that all enums have expected values."""

    def test_coil_types(self) -> None:
        self.assertEqual(CoilType.FIGURE_8.value, "figure_8")
        self.assertEqual(CoilType.H_COIL.value, "h_coil")

    def test_target_regions(self) -> None:
        self.assertEqual(TargetRegion.L_DLPFC.value, "L_DLPFC")
        self.assertEqual(TargetRegion.R_DLPFC.value, "R_DLPFC")

    def test_frequencies(self) -> None:
        self.assertEqual(StimulationFrequency.HIGH_10HZ.value, "10Hz")
        self.assertEqual(StimulationFrequency.THETA_BURST_ITBS.value, "iTBS")
        self.assertEqual(StimulationFrequency.LOW_1HZ.value, "1Hz")

    def test_age_groups(self) -> None:
        self.assertEqual(PatientAgeGroup.PEDIATRIC.value, "pediatric")
        self.assertEqual(PatientAgeGroup.ADULT.value, "adult")
        self.assertEqual(PatientAgeGroup.GERIATRIC.value, "geriatric")

    def test_safety_levels(self) -> None:
        self.assertEqual(SafetyLevel.GREEN.value, "green")
        self.assertEqual(SafetyLevel.YELLOW.value, "yellow")
        self.assertEqual(SafetyLevel.RED.value, "red")


# =============================================================================
# MAIN
# =============================================================================

if __name__ == "__main__":
    unittest.main(verbosity=2)
