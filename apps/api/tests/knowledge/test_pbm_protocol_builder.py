"""
Test Suite for PBM Protocol Builder
====================================
Comprehensive unit and integration tests covering:
  • Protocol generation for all supported conditions
  • Dose calculation (physics checks, safety limits, edge cases)
  • Device recommendation (budget filtering, compatibility scoring)
  • Contraindication screening
  • Age-group and skin-type modifiers
  • Eye safety warnings
  • Batch processing
  • Error handling

Run with:  python -m pytest test_pbm_protocol_builder.py -v
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

# Ensure the module under test is importable
sys.path.insert(0, str(Path(__file__).parent))

import pytest

from pbm_protocol_builder import (
    AgeGroup,
    DEVICE_CATALOGUE,
    EYE_SAFETY_WARNINGS,
    MAX_DOSE_PER_SESSION_J_CM2,
    MAX_POWER_DENSITY_MW_CM2,
    PROTOCOL_LIBRARY,
    Severity,
    SkinType,
    batch_build_protocols,
    build_protocol,
    calculate_dose,
    check_contraindications,
    device_recommendation,
    protocol_summary,
    _apply_age_modifier,
    _apply_severity_modifier,
    _classify_age,
    _match_condition,
    _near_wavelength,
    _skin_type_power_cap,
    _transmittance_for_sex,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def base_adult_patient():
    """A minimal valid adult patient profile."""
    return {
        "condition": "depression",
        "age": 45,
        "severity": "moderate",
        "sex": "female",
        "skin_type": "II",
    }


@pytest.fixture
def base_pediatric_patient():
    """A minimal valid pediatric patient profile."""
    return {
        "condition": "adhd",
        "age": 12,
        "severity": "moderate",
        "sex": "male",
        "skin_type": "III",
    }


@pytest.fixture
def base_geriatric_patient():
    """A minimal valid geriatric patient profile."""
    return {
        "condition": "cognitive_decline",
        "age": 78,
        "severity": "moderate",
        "sex": "female",
        "skin_type": "IV",
    }


# ---------------------------------------------------------------------------
# calculate_dose
# ---------------------------------------------------------------------------


class TestCalculateDose:
    """Tests for calculate_dose() physics and safety checks."""

    def test_basic_calculation(self):
        """Standard 810 nm, 250 mW/cm² × 20 min → ~75 J/cm² @ 4 cm²."""
        result = calculate_dose(810, 250.0, 20.0)
        assert result["wavelength_nm"] == 810
        assert result["power_density_mw_cm2"] == 250.0
        assert result["treatment_time_min"] == 20.0
        # dose = 250 mW/cm² × 1200 s / 1000 / 4 cm² = 75 J/cm²
        assert result["dose_j_cm2"] == 75.0
        assert result["within_safety_limits"] is True
        assert result["confidence"] == "high"

    def test_1064nm_calculation(self):
        """1064 nm falls in optical window map."""
        result = calculate_dose(1064, 100.0, 20.0)
        assert result["wavelength_nm"] == 1064
        assert result["dose_j_cm2"] == 30.0  # 100 × 1200 / 1000 / 4
        assert result["optical_efficacy"] == 0.70

    def test_unusual_wavelength_warning(self):
        """A wavelength not in the efficacy map should emit a warning."""
        result = calculate_dose(500, 100.0, 10.0)
        assert len(result["safety_warnings"]) >= 1
        assert "outside" in result["safety_warnings"][0].lower()
        assert result["optical_efficacy"] == 0.0
        assert result["confidence"] == "moderate"

    def test_exceeds_power_ceiling(self):
        """Power density above 500 mW/cm² should trip safety flag."""
        result = calculate_dose(810, 600.0, 10.0)
        assert result["within_safety_limits"] is False
        assert any("exceeds hard ceiling" in w for w in result["safety_warnings"])

    def test_exceeds_dose_ceiling(self):
        """Dose above 60 J/cm² should trip safety flag."""
        result = calculate_dose(810, 500.0, 60.0)  # 500 × 3600 / 1000 / 4 = 450 J/cm²
        assert result["within_safety_limits"] is False
        assert any("exceeds per-session" in w for w in result["safety_warnings"])

    def test_spot_area_override(self):
        """Using a 1 cm² spot area should quadruple dose vs 4 cm²."""
        r1 = calculate_dose(810, 100.0, 10.0, spot_area_cm2=4.0)
        r2 = calculate_dose(810, 100.0, 10.0, spot_area_cm2=1.0)
        assert r2["dose_j_cm2"] == 4 * r1["dose_j_cm2"]

    @pytest.mark.parametrize("bad_wavelength", [0, -10])
    def test_invalid_wavelength(self, bad_wavelength):
        with pytest.raises(ValueError, match="Wavelength must be positive"):
            calculate_dose(bad_wavelength, 100.0, 10.0)

    def test_invalid_power(self):
        with pytest.raises(ValueError, match="Power density must be positive"):
            calculate_dose(810, 0, 10.0)

    def test_invalid_time(self):
        with pytest.raises(ValueError, match="Time must be positive"):
            calculate_dose(810, 100.0, -5.0)

    def test_invalid_spot_area(self):
        with pytest.raises(ValueError, match="Spot area must be positive"):
            calculate_dose(810, 100.0, 10.0, spot_area_cm2=0)


# ---------------------------------------------------------------------------
# build_protocol
# ---------------------------------------------------------------------------


class TestBuildProtocol:
    """Tests for build_protocol() with various patient profiles."""

    def test_depression_moderate_adult(self, base_adult_patient):
        """Full protocol generation for a typical adult depression case."""
        proto = build_protocol(base_adult_patient)
        assert proto["modality"] == "PBM"
        p = proto["protocol"]
        assert p["wavelength_nm"] == 810
        assert p["sites"] == ["F3", "F4", "Cz"]
        assert p["sessions_total"] == 30
        assert p["frequency"] == "3x_week_x10_weeks"
        assert proto["generated_for"]["age_group"] == "adult"
        assert not proto["age_adjustments"]["modifier_applied"]
        assert "Schiffer_2009" in proto["evidence"]
        assert "Cassano_2018" in proto["evidence"]
        assert len(proto["eye_safety"]) == 5

    def test_pediatric_adhd(self, base_pediatric_patient):
        """Pediatric ADHD — dose should be reduced 60 %."""
        proto = build_protocol(base_pediatric_patient)
        assert proto["generated_for"]["age_group"] == "pediatric"
        assert proto["age_adjustments"]["modifier_applied"] is True
        # Base ADHD: 100 mW/cm² × 15 min → 60 % = 60 mW/cm² × 9 min
        assert proto["protocol"]["power_density_mw_cm2"] == 60.0
        assert proto["protocol"]["treatment_time_min"] == 9.0
        assert proto["protocol"]["sites"] == ["F3", "F4"]

    def test_geriatric_cognitive_decline(self, base_geriatric_patient):
        """Geriatric cognitive decline — dose reduced 85 %."""
        proto = build_protocol(base_geriatric_patient)
        assert proto["generated_for"]["age_group"] == "geriatric"
        assert proto["age_adjustments"]["modifier_applied"] is True
        # Base: 250 mW/cm² × 20 min → 85 % = 212.5 mW/cm² × 17 min
        assert proto["protocol"]["power_density_mw_cm2"] == 212.5
        assert proto["protocol"]["treatment_time_min"] == 17.0

    def test_mild_vs_severe(self):
        """Mild depression should have lower parameters than severe."""
        mild = build_protocol({
            "condition": "depression", "age": 40, "severity": "mild"
        })
        sevr = build_protocol({
            "condition": "depression", "age": 40, "severity": "severe"
        })
        assert mild["protocol"]["power_density_mw_cm2"] < sevr["protocol"]["power_density_mw_cm2"]
        assert mild["protocol"]["treatment_time_min"] <= sevr["protocol"]["treatment_time_min"]

    def test_skin_type_dark_caps_power(self):
        """Fitzpatrick V/VI should cap power density."""
        patient_v = {"condition": "depression", "age": 40, "skin_type": "V"}
        patient_vi = {"condition": "depression", "age": 40, "skin_type": "VI"}
        proto_v = build_protocol(patient_v)
        proto_vi = build_protocol(patient_vi)
        assert proto_v["protocol"]["power_density_mw_cm2"] <= 200
        assert proto_vi["protocol"]["power_density_mw_cm2"] <= 150
        assert proto_vi["skin_type_adjustments"]["power_density_capped"] is True

    def test_prior_sessions_reduction(self):
        """Prior completed sessions reduce sessions_remaining."""
        patient = {"condition": "depression", "age": 40, "prior_sessions": 10}
        proto = build_protocol(patient)
        assert proto["protocol"]["sessions_remaining"] == 20

    def test_pain_site_customisation(self):
        """Chronic pain protocol should accept a pain_location override."""
        patient = {
            "condition": "chronic_pain", "age": 50,
            "pain_location": "C5", "severity": "moderate",
        }
        proto = build_protocol(patient)
        assert proto["protocol"]["sites"] == ["C5"]

    def test_stroke_lesion_customisation(self):
        """Stroke protocol should accept a lesion_location override."""
        patient = {
            "condition": "stroke", "age": 65,
            "lesion_location": "F4", "severity": "moderate",
        }
        proto = build_protocol(patient)
        assert proto["protocol"]["sites"] == ["F4"]

    def test_missing_condition_raises(self):
        with pytest.raises(ValueError, match="must contain 'condition'"):
            build_protocol({"age": 40})

    def test_missing_age_raises(self):
        with pytest.raises(ValueError, match="must contain 'age'"):
            build_protocol({"condition": "depression"})

    def test_invalid_age_type(self):
        with pytest.raises(ValueError, match="Age must be an integer"):
            build_protocol({"condition": "depression", "age": "old"})

    def test_unsupported_condition(self):
        with pytest.raises(ValueError, match="not supported"):
            build_protocol({"condition": "lupus", "age": 40})

    def test_all_conditions_supported(self):
        """Every entry in PROTOCOL_LIBRARY must be reachable via build_protocol."""
        for proto in PROTOCOL_LIBRARY:
            patient = {"condition": proto.condition, "age": 40, "severity": "moderate"}
            result = build_protocol(patient)
            assert result["protocol"]["wavelength_nm"] == proto.wavelength_nm

    def test_contraindication_absolute_blocks(self):
        """Patient with pregnancy should flag absolute contraindication."""
        patient = {
            "condition": "depression", "age": 30,
            "conditions": ["pregnancy"],
        }
        proto = build_protocol(patient)
        assert proto["absolute_contraindications_present"] is True
        flags = [c["flag"] for c in proto["contraindications"]]
        assert "pregnancy" in flags

    def test_expected_outcomes_present(self):
        proto = build_protocol({"condition": "depression", "age": 40})
        eo = proto.get("expected_outcomes", {})
        assert "primary_endpoint" in eo
        assert "estimated_response_rate" in eo

    def test_monitoring_recommendations_present(self):
        proto = build_protocol({"condition": "depression", "age": 40})
        assert len(proto["monitoring"]) >= 3

    def test_dose_calculation_embedded(self):
        """build_protocol should embed a full dose_calculation block."""
        proto = build_protocol({"condition": "depression", "age": 40})
        dc = proto["dose_calculation"]
        assert "dose_j_cm2" in dc
        assert "total_energy_j" in dc
        assert "within_safety_limits" in dc

    def test_sex_field_accepted(self):
        for sex_val in ["male", "female", "other"]:
            proto = build_protocol({
                "condition": "depression", "age": 40, "sex": sex_val
            })
            assert proto["generated_for"]["sex"] == sex_val


# ---------------------------------------------------------------------------
# device_recommendation
# ---------------------------------------------------------------------------


class TestDeviceRecommendation:
    """Tests for device_recommendation()."""

    @pytest.fixture
    def depression_protocol(self):
        return build_protocol({"condition": "depression", "age": 45})

    def test_budget_filtering(self, depression_protocol):
        """Devices above budget must not appear."""
        recs = device_recommendation(depression_protocol, budget=500.0)
        for r in recs:
            assert r["price_usd"] <= 500.0

    def test_returns_sorted_by_score(self, depression_protocol):
        recs = device_recommendation(depression_protocol, budget=10000.0)
        scores = [r["score"] for r in recs]
        assert scores == sorted(scores, reverse=True)

    def test_compatibility_flag(self, depression_protocol):
        recs = device_recommendation(depression_protocol, budget=10000.0)
        # At least one device should be compatible
        assert any(r["compatible"] for r in recs)

    def test_empty_result_high_budget(self):
        """Even with very high budget we should get results."""
        proto = build_protocol({"condition": "depression", "age": 40})
        recs = device_recommendation(proto, budget=1_000_000.0)
        assert len(recs) == len(DEVICE_CATALOGUE)

    def test_zero_budget_raises(self):
        proto = build_protocol({"condition": "depression", "age": 40})
        with pytest.raises(ValueError, match="non-negative"):
            device_recommendation(proto, budget=-100.0)

    def test_appropriate_device_for_multisite(self):
        """TBI (multi-site) should prefer helmet over pad."""
        proto = build_protocol({"condition": "tbi", "age": 40})
        recs = device_recommendation(proto, budget=10000.0)
        top = recs[0]
        assert top["helmet_type"] in ("helmet", "cap")

    def test_contains_fda_info(self, depression_protocol):
        recs = device_recommendation(depression_protocol, budget=10000.0)
        for r in recs:
            assert "fda_clearance" in r


# ---------------------------------------------------------------------------
# check_contraindications
# ---------------------------------------------------------------------------


class TestCheckContraindications:
    """Tests for check_contraindications()."""

    def test_no_contraindications_clean_patient(self):
        patient = {"conditions": [], "medications": [], "history": []}
        flags = check_contraindications(patient)
        assert flags == []

    def test_pregnancy_detected(self):
        patient = {"conditions": ["pregnancy"]}
        flags = check_contraindications(patient)
        assert any(f["flag"] == "pregnancy" for f in flags)
        assert any(f["level"] == "absolute" for f in flags)

    def test_photosensitive_epilepsy(self):
        patient = {"conditions": ["photosensitive epilepsy"]}
        flags = check_contraindications(patient)
        assert any(f["flag"] == "photosensitive_epilepsy" for f in flags)
        assert any(f["level"] == "absolute" for f in flags)

    def test_brain_tumor_relative(self):
        patient = {"conditions": ["brain tumor", "glioblastoma"]}
        flags = check_contraindications(patient)
        tumor_flags = [f for f in flags if "malignancy" in f["flag"]]
        assert len(tumor_flags) > 0
        assert all(f["level"] == "relative" for f in tumor_flags)

    def test_photosensitising_medication(self):
        patient = {"medications": ["Doxycycline 100mg", "Amiodarone"]}
        flags = check_contraindications(patient)
        med_flags = [f for f in flags if "photosensitising_medication" in f["flag"]]
        assert len(med_flags) >= 2

    def test_thyroid_precaution(self):
        patient = {"conditions": ["hypothyroidism"]}
        flags = check_contraindications(patient)
        assert any(f["flag"] == "thyroid_disease" for f in flags)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


class TestInternalHelpers:
    """Unit tests for private helper functions."""

    @pytest.mark.parametrize("age,expected", [
        (5, AgeGroup.PEDIATRIC),
        (10, AgeGroup.PEDIATRIC),
        (17, AgeGroup.PEDIATRIC),
        (18, AgeGroup.ADULT),
        (45, AgeGroup.ADULT),
        (64, AgeGroup.ADULT),
        (65, AgeGroup.GERIATRIC),
        (80, AgeGroup.GERIATRIC),
    ])
    def test_classify_age(self, age, expected):
        assert _classify_age(age) is expected

    def test_match_condition_direct(self):
        proto = _match_condition("depression")
        assert proto is not None
        assert proto.condition == "depression"

    def test_match_condition_synonym_tbi(self):
        for synonym in ["tbi", "concussion", "traumatic_brain_injury", "mtbi"]:
            proto = _match_condition(synonym)
            assert proto is not None, f"Failed for {synonym}"
            assert proto.condition == "tbi_concussion"

    def test_match_condition_synonym_cognitive(self):
        for synonym in ["mci", "dementia", "alzheimer"]:
            proto = _match_condition(synonym)
            assert proto is not None
            assert proto.condition == "cognitive_decline"

    def test_match_condition_not_found(self):
        assert _match_condition("totally_unknown_condition_12345") is None

    def test_apply_severity_modifier_mild(self):
        proto = _match_condition("depression")
        assert proto is not None
        mod = _apply_severity_modifier(proto, Severity("mild"))
        assert mod["power_density_mw_cm2"] == 150.0
        assert mod["treatment_time_min"] == 15.0

    def test_apply_severity_modifier_severe(self):
        proto = _match_condition("depression")
        assert proto is not None
        mod = _apply_severity_modifier(proto, Severity("severe"))
        assert mod["power_density_mw_cm2"] == 300.0
        assert mod["treatment_time_min"] == 25.0

    def test_apply_age_modifier_pediatric(self):
        params = {"power_density_mw_cm2": 100.0, "treatment_time_min": 20.0}
        mod = _apply_age_modifier(AgeGroup.PEDIATRIC, params)
        assert mod["power_density_mw_cm2"] == 60.0   # 100 × 0.60
        assert mod["treatment_time_min"] == 12.0     # 20 × 0.60

    def test_apply_age_modifier_geriatric(self):
        params = {"power_density_mw_cm2": 200.0, "treatment_time_min": 20.0}
        mod = _apply_age_modifier(AgeGroup.GERIATRIC, params)
        assert mod["power_density_mw_cm2"] == 170.0  # 200 × 0.85
        assert mod["treatment_time_min"] == 17.0     # 20 × 0.85

    def test_apply_age_modifier_adult_no_change(self):
        params = {"power_density_mw_cm2": 250.0, "treatment_time_min": 20.0}
        mod = _apply_age_modifier(AgeGroup.ADULT, params)
        assert mod["power_density_mw_cm2"] == 250.0
        assert mod["treatment_time_min"] == 20.0

    def test_skin_type_power_cap_dark_skin(self):
        assert _skin_type_power_cap(SkinType.VI, 300.0) == 150.0
        assert _skin_type_power_cap(SkinType.V, 300.0) == 200.0
        assert _skin_type_power_cap(SkinType.IV, 500.0) == 300.0

    def test_skin_type_power_cap_light_skin_unlimited(self):
        assert _skin_type_power_cap(SkinType.I, 450.0) == 450.0
        assert _skin_type_power_cap(SkinType.II, 500.0) == 500.0

    def test_transmittance_for_sex(self):
        assert _transmittance_for_sex(None) == 0.04
        from pbm_protocol_builder import Sex
        assert _transmittance_for_sex(Sex.FEMALE) == 0.045
        assert _transmittance_for_sex(Sex.MALE) == 0.035

    def test_near_wavelength(self):
        assert _near_wavelength(810, (800, 820), tolerance=50) is True
        assert _near_wavelength(810, (900, 950), tolerance=50) is False


# ---------------------------------------------------------------------------
# protocol_summary
# ---------------------------------------------------------------------------


class TestProtocolSummary:
    """Tests for the human-readable summary renderer."""

    def test_summary_contains_key_sections(self):
        proto = build_protocol({"condition": "depression", "age": 45})
        summary = protocol_summary(proto)
        assert "PBM PROTOCOL SUMMARY" in summary
        assert "Stimulation Parameters" in summary
        assert "Eye Safety" in summary
        assert "Expected Outcomes" in summary

    def test_summary_with_contraindications(self):
        proto = build_protocol({
            "condition": "depression", "age": 30,
            "conditions": ["pregnancy"],
        })
        summary = protocol_summary(proto)
        assert "CONTRAINDICATION" in summary.upper()


# ---------------------------------------------------------------------------
# batch_build_protocols
# ---------------------------------------------------------------------------


class TestBatchBuildProtocols:
    """Tests for batch_build_protocols()."""

    def test_batch_success(self):
        patients = [
            {"condition": "depression", "age": 40},
            {"condition": "adhd", "age": 12},
            {"condition": "cognitive_decline", "age": 75},
        ]
        results = batch_build_protocols(patients)
        assert len(results) == 3
        for r in results:
            assert "error" not in r

    def test_batch_with_one_failure(self):
        patients = [
            {"condition": "depression", "age": 40},
            {"condition": "unknown_xyz", "age": 40},  # will fail
            {"condition": "adhd", "age": 12},
        ]
        results = batch_build_protocols(patients)
        assert len(results) == 3
        assert "error" not in results[0]
        assert "error" in results[1]
        assert "not supported" in results[1]["error"]
        assert "error" not in results[2]

    def test_batch_empty_list(self):
        assert batch_build_protocols([]) == []


# ---------------------------------------------------------------------------
# End-to-end integration tests
# ---------------------------------------------------------------------------


class TestIntegration:
    """End-to-end workflows mirroring real clinical usage."""

    def test_full_workflow_depression(self):
        """Depression patient: protocol → dose check → device recommendation."""
        patient = {
            "condition": "depression",
            "age": 52,
            "severity": "moderate",
            "sex": "female",
            "skin_type": "II",
            "conditions": [],
            "medications": ["Sertraline 50mg"],
        }
        proto = build_protocol(patient)
        assert not proto["absolute_contraindications_present"]
        assert proto["protocol"]["wavelength_nm"] == 810

        devices = device_recommendation(proto, budget=5000.0)
        assert len(devices) > 0
        # At least one compatible device should exist in the budget
        compatible = [d for d in devices if d["compatible"]]
        assert len(compatible) > 0
        # Top device should be compatible (sorted by compatibility first)
        assert devices[0]["compatible"] is True
        assert devices[0]["price_usd"] <= 5000.0

        # Verify dose is within limits
        dc = proto["dose_calculation"]
        assert dc["within_safety_limits"] is True

    def test_full_workflow_tbi(self):
        """TBI patient with multiple sites — needs helmet device."""
        patient = {
            "condition": "tbi_concussion",
            "age": 28,
            "severity": "moderate",
            "sex": "male",
            "skin_type": "III",
        }
        proto = build_protocol(patient)
        assert len(proto["protocol"]["sites"]) > 2  # multi-site

        devices = device_recommendation(proto, budget=10000.0)
        compatible = [d for d in devices if d["compatible"]]
        assert len(compatible) > 0
        assert compatible[0]["helmet_type"] in ("helmet", "cap")

    def test_full_workflow_pediatric_asd(self):
        """ASD child — reduced dose, different schedule."""
        patient = {
            "condition": "asd",
            "age": 8,
            "severity": "moderate",
            "sex": "male",
            "skin_type": "III",
        }
        proto = build_protocol(patient)
        assert proto["generated_for"]["age_group"] == "pediatric"
        assert proto["protocol"]["sessions_total"] == 18
        assert proto["protocol"]["frequency"] == "2x_week_x9_weeks"
        # Dose should be reduced
        assert proto["protocol"]["power_density_mw_cm2"] < 100.0

    def test_patient_with_multiple_contraindications(self):
        """Complex patient with several flags."""
        patient = {
            "condition": "depression",
            "age": 35,
            "conditions": ["hypothyroidism", "brain tumor"],
            "medications": ["Doxycycline"],
        }
        proto = build_protocol(patient)
        flags = proto["contraindications"]
        flag_names = {f["flag"] for f in flags}
        assert "thyroid_disease" in flag_names
        assert "primary_malignancy_brain" in flag_names
        assert any("photosensitising" in f["flag"] for f in flags)
        # brain tumor is relative, not absolute
        assert proto["absolute_contraindications_present"] is False


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
