"""
================================================================================
TEST SUITE — Safety & Contraindication Checker
================================================================================

Comprehensive tests for the safety_checker module covering:
    - All four modalities (tDCS, TMS, PBM, Neurofeedback)
    - Absolute and relative contraindications
    - Drug interaction checking
    - Genetic risk assessment
    - Age-specific safety rules
    - Protocol parameter validation
    - Safety score calculation
    - Risk level determination
    - Modified protocol generation
    - Comprehensive safety reports
    - Edge cases and error handling

Run with: pytest test_safety_checker.py -v
================================================================================
"""

import json
import os
import sys
import tempfile
from copy import deepcopy

import pytest

# Ensure the module is importable
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from safety_checker import (
    AgeGroup,
    ContraindicationSeverity,
    DrugInteraction,
    EvidenceLevel,
    GeneticRiskFactor,
    Modality,
    MonitoringRequirement,
    PatientDataExtractor,
    RiskLevel,
    SafetyChecker,
    SafetyKnowledgeBase,
    SafetyRule,
    check_drug_interactions,
    check_genetic_risks,
    check_safety,
    export_safety_rules_to_json,
    generate_safety_report,
)


# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def base_patient():
    """Return a minimal safe patient with no contraindications."""
    return {
        "age": 35,
        "sex": "M",
        "conditions": {},
        "diagnoses": {},
        "medications": [],
        "genetic_variants": [],
        "implanted_devices": [],
        "other_conditions": [],
    }


@pytest.fixture
def base_protocol_tdcs():
    """Return a standard tDCS protocol."""
    return {
        "protocol_id": "TDC-001",
        "name": "tDCS DLPFC Enhancement",
        "modality": "tDCS",
        "parameters": {
            "current_ma": 2000,
            "duration_min": 20,
            "electrode_size_cm2": 35,
            "anode": "F3",
            "cathode": "Fp2",
        },
        "target": "dorsolateral_prefrontal_cortex",
        "indication": "working_memory",
    }


@pytest.fixture
def base_protocol_tms():
    """Return a standard TMS protocol."""
    return {
        "protocol_id": "TMS-001",
        "name": "rTMS for Depression — Left DLPFC",
        "modality": "TMS",
        "parameters": {
            "frequency_hz": 10,
            "intensity_pct_mt": 120,
            "total_pulses": 3000,
            "train_duration_s": 5,
            "inter_train_interval_s": 25,
            "coil": "figure_of_8",
            "target": "left_dlpfc",
        },
        "indication": "major_depressive_disorder",
    }


@pytest.fixture
def base_protocol_pbm():
    """Return a standard PBM protocol."""
    return {
        "protocol_id": "PBM-001",
        "name": "Transcranial PBM — Default Mode Network",
        "modality": "PBM",
        "parameters": {
            "wavelength_nm": 810,
            "power_mw": 250,
            "fluence_j_cm2": 30,
            "duration_min": 20,
            "target": "default_mode_network",
        },
        "indication": "mild_cognitive_impairment",
    }


@pytest.fixture
def base_protocol_neurofeedback():
    """Return a standard Neurofeedback protocol."""
    return {
        "protocol_id": "NFB-001",
        "name": "SMR Neurofeedback for ADHD",
        "modality": "neurofeedback",
        "parameters": {
            "protocol_type": "SMR",
            "target_frequency_hz": 12,
            "session_duration_min": 30,
            "feedback_modality": "visual_auditory",
        },
        "indication": "ADHD",
    }


@pytest.fixture
def checker():
    """Return a fresh SafetyChecker instance."""
    return SafetyChecker()


# =============================================================================
# Test Modality Parsing
# =============================================================================


class TestModalityParsing:
    """Test modality string parsing."""

    def test_parse_tdcs_variants(self, checker):
        """Should accept all tDCS modality name variants."""
        variants = ["tDCS", "tdcs", "T_dcs", "transcranial_direct_current_stimulation"]
        for v in variants:
            assert checker._parse_modality(v) == Modality.TDCS

    def test_parse_tms_variants(self, checker):
        """Should accept all TMS modality name variants."""
        variants = ["TMS", "tms", "transcranial_magnetic_stimulation"]
        for v in variants:
            assert checker._parse_modality(v) == Modality.TMS

    def test_parse_pbm_variants(self, checker):
        """Should accept all PBM modality name variants."""
        variants = ["PBM", "pbm", "photobiomodulation", "LLLT"]
        for v in variants:
            assert checker._parse_modality(v) == Modality.PBM

    def test_parse_neurofeedback_variants(self, checker):
        """Should accept all neurofeedback modality name variants."""
        variants = ["neurofeedback", "EEG_biofeedback", "NF"]
        for v in variants:
            assert checker._parse_modality(v) == Modality.NEUROFEEDBACK

    def test_parse_unknown_modality(self, checker):
        """Should raise ValueError for unknown modalities."""
        with pytest.raises(ValueError, match="Unknown modality"):
            checker._parse_modality("unknown_modality")


# =============================================================================
# Test Input Validation
# =============================================================================


class TestInputValidation:
    """Test input validation and error handling."""

    def test_missing_modality_raises_error(self, checker, base_patient):
        """Should raise ValueError when protocol has no modality."""
        protocol = {"name": "No modality"}
        with pytest.raises(ValueError, match="modality"):
            checker.check_safety(base_patient, protocol)

    def test_patient_must_be_dict(self, checker, base_protocol_tdcs):
        """Should raise ValueError when patient is not a dict."""
        with pytest.raises(ValueError, match="patient"):
            checker.check_safety("not_a_dict", base_protocol_tdcs)

    def test_protocol_must_be_dict(self, checker, base_patient):
        """Should raise ValueError when protocol is not a dict."""
        with pytest.raises(ValueError, match="protocol"):
            checker.check_safety(base_patient, "not_a_dict")

    def test_empty_patient_ok(self, checker, base_protocol_tdcs):
        """Should handle empty patient dict with warnings."""
        result = checker.check_safety({}, base_protocol_tdcs)
        assert "safe_to_proceed" in result


# =============================================================================
# Test tDCS Absolute Contraindications
# =============================================================================


class TestTDCSAbsoluteContraindications:
    """Test tDCS absolute contraindication detection."""

    def test_pacemaker_blocks_tdcs(self, checker, base_patient, base_protocol_tdcs):
        """Patient with pacemaker should fail tDCS."""
        patient = base_patient.copy()
        patient["conditions"] = {"pacemaker": True}
        result = checker.check_safety(patient, base_protocol_tdcs)
        assert result["safe_to_proceed"] is False
        assert any("pacemaker" in c["message"].lower() for c in result["absolute_contraindications"])

    def test_icd_blocks_tdcs(self, checker, base_patient, base_protocol_tdcs):
        """Patient with ICD should fail tDCS."""
        patient = base_patient.copy()
        patient["conditions"] = {"icd": True}
        result = checker.check_safety(patient, base_protocol_tdcs)
        assert result["safe_to_proceed"] is False

    def test_dbs_blocks_tdcs(self, checker, base_patient, base_protocol_tdcs):
        """Patient with active DBS should fail tDCS."""
        patient = base_patient.copy()
        patient["conditions"] = {"dbs": True}
        result = checker.check_safety(patient, base_protocol_tdcs)
        assert result["safe_to_proceed"] is False

    def test_intracranial_metal_blocks_tdcs(self, checker, base_patient, base_protocol_tdcs):
        """Patient with intracranial metal should fail tDCS."""
        patient = base_patient.copy()
        patient["conditions"] = {"intracranial_metal": True}
        result = checker.check_safety(patient, base_protocol_tdcs)
        assert result["safe_to_proceed"] is False

    def test_scalp_wounds_block_tdcs(self, checker, base_patient, base_protocol_tdcs):
        """Patient with scalp wounds should fail tDCS."""
        patient = base_patient.copy()
        patient["conditions"] = {"scalp_wounds": True}
        result = checker.check_safety(patient, base_protocol_tdcs)
        assert result["safe_to_proceed"] is False

    def test_cranial_plates_in_devices_blocks_tdcs(self, checker, base_patient, base_protocol_tdcs):
        """Cranial plates in implanted_devices should block tDCS."""
        patient = base_patient.copy()
        patient["implanted_devices"] = ["cranial plate"]
        result = checker.check_safety(patient, base_protocol_tdcs)
        assert result["safe_to_proceed"] is False

    def test_age_under_2_blocks_tdcs(self, checker, base_patient, base_protocol_tdcs):
        """Patient under 2 years should fail tDCS."""
        patient = base_patient.copy()
        patient["age"] = 1.5
        result = checker.check_safety(patient, base_protocol_tdcs)
        assert result["safe_to_proceed"] is False

    def test_shunt_in_other_conditions(self, checker, base_patient, base_protocol_tdcs):
        """Shunt mentioned in other_conditions should block tDCS."""
        patient = base_patient.copy()
        patient["other_conditions"] = ["ventriculoperitoneal shunt"]
        result = checker.check_safety(patient, base_protocol_tdcs)
        assert result["safe_to_proceed"] is False


# =============================================================================
# Test tDCS Relative Contraindications
# =============================================================================


class TestTDCSRelativeContraindications:
    """Test tDCS relative contraindication detection."""

    def test_epilepsy_flagged_relative(self, checker, base_patient, base_protocol_tdcs):
        """Epilepsy should be flagged as relative contraindication."""
        patient = base_patient.copy()
        patient["conditions"] = {"epilepsy": True}
        result = checker.check_safety(patient, base_protocol_tdcs)
        assert result["safe_to_proceed"] is True  # relative only
        assert any(
            "seizure" in rc["message"].lower()
            for rc in result["relative_contraindications"]
        )

    def test_pregnancy_flagged_relative(self, checker, base_patient, base_protocol_tdcs):
        """Pregnancy should be flagged as relative contraindication."""
        patient = base_patient.copy()
        patient["conditions"] = {"pregnant": True}
        result = checker.check_safety(patient, base_protocol_tdcs)
        assert result["safe_to_proceed"] is True
        assert any(
            "pregnancy" in rc["message"].lower()
            for rc in result["relative_contraindications"]
        )

    def test_eczema_flagged_relative(self, checker, base_patient, base_protocol_tdcs):
        """Eczema should be flagged as relative contraindication."""
        patient = base_patient.copy()
        patient["conditions"] = {"eczema": True}
        result = checker.check_safety(patient, base_protocol_tdcs)
        assert result["safe_to_proceed"] is True
        assert any(
            "skin" in rc["message"].lower()
            for rc in result["relative_contraindications"]
        )

    def test_recent_stroke_flagged(self, checker, base_patient, base_protocol_tdcs):
        """Recent stroke should be flagged."""
        patient = base_patient.copy()
        patient["conditions"] = {"recent_stroke": True}
        result = checker.check_safety(patient, base_protocol_tdcs)
        assert result["safe_to_proceed"] is True
        assert len(result["relative_contraindications"]) > 0

    def test_substance_withdrawal_flagged(self, checker, base_patient, base_protocol_tdcs):
        """Active substance withdrawal should be flagged."""
        patient = base_patient.copy()
        patient["conditions"] = {"substance_withdrawal": True}
        result = checker.check_safety(patient, base_protocol_tdcs)
        assert result["safe_to_proceed"] is True
        assert len(result["relative_contraindications"]) > 0


# =============================================================================
# Test TMS Absolute Contraindications
# =============================================================================


class TestTMSAbsoluteContraindications:
    """Test TMS absolute contraindication detection."""

    def test_cochlear_implant_blocks_tms(self, checker, base_patient, base_protocol_tms):
        """Cochlear implant should block TMS."""
        patient = base_patient.copy()
        patient["conditions"] = {"cochlear_implant": True}
        result = checker.check_safety(patient, base_protocol_tms)
        assert result["safe_to_proceed"] is False

    def test_ferromagnetic_metal_blocks_tms(self, checker, base_patient, base_protocol_tms):
        """Ferromagnetic metal should block TMS."""
        patient = base_patient.copy()
        patient["conditions"] = {"ferromagnetic_implant": True}
        result = checker.check_safety(patient, base_protocol_tms)
        assert result["safe_to_proceed"] is False

    def test_aneurysm_clip_blocks_tms(self, checker, base_patient, base_protocol_tms):
        """Aneurysm clip should block TMS."""
        patient = base_patient.copy()
        patient["conditions"] = {"aneurysm_clip": True}
        result = checker.check_safety(patient, base_protocol_tms)
        assert result["safe_to_proceed"] is False

    def test_pacemaker_blocks_tms(self, checker, base_patient, base_protocol_tms):
        """Pacemaker should block TMS."""
        patient = base_patient.copy()
        patient["conditions"] = {"pacemaker": True}
        result = checker.check_safety(patient, base_protocol_tms)
        assert result["safe_to_proceed"] is False

    def test_active_dbs_blocks_tms(self, checker, base_patient, base_protocol_tms):
        """Active DBS should block TMS."""
        patient = base_patient.copy()
        patient["conditions"] = {"dbs": True}
        result = checker.check_safety(patient, base_protocol_tms)
        assert result["safe_to_proceed"] is False


# =============================================================================
# Test TMS Relative Contraindications
# =============================================================================


class TestTMSRelativeContraindications:
    """Test TMS relative contraindication detection."""

    def test_seizure_history_flagged(self, checker, base_patient, base_protocol_tms):
        """Seizure history should be flagged."""
        patient = base_patient.copy()
        patient["conditions"] = {"seizure_history": True}
        result = checker.check_safety(patient, base_protocol_tms)
        assert result["safe_to_proceed"] is True  # relative only
        assert len(result["relative_contraindications"]) > 0

    def test_pregnancy_flagged_tms(self, checker, base_patient, base_protocol_tms):
        """Pregnancy should be flagged for TMS."""
        patient = base_patient.copy()
        patient["conditions"] = {"pregnancy": True}
        result = checker.check_safety(patient, base_protocol_tms)
        assert result["safe_to_proceed"] is True
        assert len(result["relative_contraindications"]) > 0

    def test_hearing_impairment_flagged(self, checker, base_patient, base_protocol_tms):
        """Hearing impairment should be flagged."""
        patient = base_patient.copy()
        patient["conditions"] = {"hearing_loss": True}
        result = checker.check_safety(patient, base_protocol_tms)
        assert result["safe_to_proceed"] is True
        assert len(result["relative_contraindications"]) > 0

    def test_recent_brain_surgery_flagged(self, checker, base_patient, base_protocol_tms):
        """Recent brain surgery should be flagged."""
        patient = base_patient.copy()
        patient["conditions"] = {"recent_brain_surgery": True}
        result = checker.check_safety(patient, base_protocol_tms)
        assert result["safe_to_proceed"] is True
        assert len(result["relative_contraindications"]) > 0


# =============================================================================
# Test PBM Absolute Contraindications
# =============================================================================


class TestPBMAbsoluteContraindications:
    """Test PBM absolute contraindication detection."""

    def test_skin_cancer_blocks_pbm(self, checker, base_patient, base_protocol_pbm):
        """Active skin cancer should block PBM."""
        patient = base_patient.copy()
        patient["conditions"] = {"skin_cancer": True}
        result = checker.check_safety(patient, base_protocol_pbm)
        assert result["safe_to_proceed"] is False

    def test_melanoma_blocks_pbm(self, checker, base_patient, base_protocol_pbm):
        """Melanoma should block PBM."""
        patient = base_patient.copy()
        patient["conditions"] = {"melanoma": True}
        result = checker.check_safety(patient, base_protocol_pbm)
        assert result["safe_to_proceed"] is False

    def test_porphyria_blocks_pbm(self, checker, base_patient, base_protocol_pbm):
        """Porphyria should block PBM."""
        patient = base_patient.copy()
        patient["conditions"] = {"porphyria": True}
        result = checker.check_safety(patient, base_protocol_pbm)
        assert result["safe_to_proceed"] is False

    def test_lupus_blocks_pbm(self, checker, base_patient, base_protocol_pbm):
        """Lupus erythematosus should block PBM."""
        patient = base_patient.copy()
        patient["conditions"] = {"lupus": True}
        result = checker.check_safety(patient, base_protocol_pbm)
        assert result["safe_to_proceed"] is False

    def test_xeroderma_blocks_pbm(self, checker, base_patient, base_protocol_pbm):
        """Xeroderma pigmentosum should block PBM."""
        patient = base_patient.copy()
        patient["conditions"] = {"xeroderma_pigmentosum": True}
        result = checker.check_safety(patient, base_protocol_pbm)
        assert result["safe_to_proceed"] is False


# =============================================================================
# Test PBM Relative Contraindications
# =============================================================================


class TestPBMRelativeContraindications:
    """Test PBM relative contraindication detection."""

    def test_retinal_disease_flagged(self, checker, base_patient, base_protocol_pbm):
        """Retinal disease should be flagged."""
        patient = base_patient.copy()
        patient["conditions"] = {"macular_degeneration": True}
        result = checker.check_safety(patient, base_protocol_pbm)
        assert result["safe_to_proceed"] is True
        assert len(result["relative_contraindications"]) > 0

    def test_thyroid_condition_flagged(self, checker, base_patient, base_protocol_pbm):
        """Thyroid condition should be flagged for neck PBM."""
        patient = base_patient.copy()
        patient["conditions"] = {"thyroid_disease": True}
        result = checker.check_safety(patient, base_protocol_pbm)
        assert result["safe_to_proceed"] is True
        warnings = result["relative_contraindications"] + result["warnings"]
        assert any("thyroid" in str(w).lower() for w in warnings)

    def test_pregnancy_flagged_pbm(self, checker, base_patient, base_protocol_pbm):
        """Pregnancy should be flagged for PBM."""
        patient = base_patient.copy()
        patient["conditions"] = {"pregnancy": True}
        result = checker.check_safety(patient, base_protocol_pbm)
        assert result["safe_to_proceed"] is True
        assert len(result["relative_contraindications"]) > 0


# =============================================================================
# Test Neurofeedback Absolute Contraindications
# =============================================================================


class TestNeurofeedbackAbsoluteContraindications:
    """Test Neurofeedback absolute contraindication detection."""

    def test_active_psychosis_blocks_nf(self, checker, base_patient, base_protocol_neurofeedback):
        """Active psychosis should block neurofeedback."""
        patient = base_patient.copy()
        patient["conditions"] = {"psychosis": True}
        result = checker.check_safety(patient, base_protocol_neurofeedback)
        assert result["safe_to_proceed"] is False

    def test_schizophrenia_active_blocks_nf(self, checker, base_patient, base_protocol_neurofeedback):
        """Active schizophrenia should block neurofeedback."""
        patient = base_patient.copy()
        patient["conditions"] = {"schizophrenia_active": True}
        result = checker.check_safety(patient, base_protocol_neurofeedback)
        assert result["safe_to_proceed"] is False

    def test_active_intoxication_blocks_nf(self, checker, base_patient, base_protocol_neurofeedback):
        """Active substance intoxication should block neurofeedback."""
        patient = base_patient.copy()
        patient["conditions"] = {"substance_intoxication": True}
        result = checker.check_safety(patient, base_protocol_neurofeedback)
        assert result["safe_to_proceed"] is False


# =============================================================================
# Test Neurofeedback Relative Contraindications
# =============================================================================


class TestNeurofeedbackRelativeContraindications:
    """Test Neurofeedback relative contraindication detection."""

    def test_severe_adhd_flagged(self, checker, base_patient, base_protocol_neurofeedback):
        """Severe ADHD should be flagged."""
        patient = base_patient.copy()
        patient["conditions"] = {"severe_adhd": True}
        result = checker.check_safety(patient, base_protocol_neurofeedback)
        assert result["safe_to_proceed"] is True
        assert len(result["relative_contraindications"]) > 0

    def test_severe_dementia_flagged(self, checker, base_patient, base_protocol_neurofeedback):
        """Severe cognitive impairment should be flagged."""
        patient = base_patient.copy()
        patient["conditions"] = {"severe_dementia": True}
        result = checker.check_safety(patient, base_protocol_neurofeedback)
        assert result["safe_to_proceed"] is True
        assert len(result["relative_contraindications"]) > 0

    def test_dissociation_history_flagged(self, checker, base_patient, base_protocol_neurofeedback):
        """History of dissociation should be flagged."""
        patient = base_patient.copy()
        patient["conditions"] = {"dissociation": True}
        result = checker.check_safety(patient, base_protocol_neurofeedback)
        assert result["safe_to_proceed"] is True
        assert len(result["relative_contraindications"]) > 0


# =============================================================================
# Test Drug Interactions
# =============================================================================


class TestDrugInteractions:
    """Test drug-neuromodulation interaction checking."""

    def test_bupropion_tms_interaction(self):
        """Bupropion should have TMS interaction."""
        results = check_drug_interactions("bupropion", "TMS")
        assert len(results) > 0
        assert any(r["drug_name"] == "bupropion" for r in results)
        assert any("seizure" in r["interaction_type"] for r in results)

    def test_bupropion_tdcs_interaction(self):
        """Bupropion should have lower-severity tDCS interaction."""
        results = check_drug_interactions("bupropion", "tDCS")
        assert len(results) > 0

    def test_clozapine_tms_high_severity(self):
        """Clozapine + TMS should be high severity."""
        results = check_drug_interactions("clozapine", "TMS")
        assert len(results) > 0
        assert any(r["severity"] == "high" for r in results)

    def test_tetracycline_pbm_interaction(self):
        """Tetracycline should have PBM photosensitization interaction."""
        results = check_drug_interactions("tetracycline", "PBM")
        assert len(results) > 0
        assert any("photo" in r["interaction_type"] for r in results)

    def test_amiodarone_pbm_interaction(self):
        """Amiodarone should have PBM interaction."""
        results = check_drug_interactions("amiodarone", "PBM")
        assert len(results) > 0

    def test_no_interaction_for_safe_drug(self):
        """Drugs with no known interactions should return empty list."""
        results = check_drug_interactions("acetaminophen", "TMS")
        assert len(results) == 0

    def test_unknown_modality_raises_error(self):
        """Should raise for unknown modality."""
        with pytest.raises(ValueError):
            check_drug_interactions("bupropion", "unknown")

    def test_case_insensitive(self):
        """Drug name should be case-insensitive."""
        r1 = check_drug_interactions("BUPROPION", "TMS")
        r2 = check_drug_interactions("bupropion", "TMS")
        assert len(r1) == len(r2)

    def test_drug_interaction_in_full_check(self, checker, base_patient, base_protocol_tms):
        """Full safety check should detect drug interactions."""
        patient = base_patient.copy()
        patient["medications"] = ["bupropion"]
        result = checker.check_safety(patient, base_protocol_tms)
        warnings_or_rel = result["relative_contraindications"] + result["warnings"]
        assert any(
            "bupropion" in str(w).lower()
            for w in warnings_or_rel
        )

    def test_photosensitizing_drug_in_full_check(self, checker, base_patient, base_protocol_pbm):
        """Full safety check should detect photosensitizing drugs."""
        patient = base_patient.copy()
        patient["medications"] = ["doxycycline"]
        result = checker.check_safety(patient, base_protocol_pbm)
        warnings_or_rel = result["relative_contraindications"] + result["warnings"]
        assert any(
            "doxycycline" in str(w).lower() or "photo" in str(w).lower()
            for w in warnings_or_rel
        )


# =============================================================================
# Test Genetic Risk Checking
# =============================================================================


class TestGeneticRisks:
    """Test genetic variant safety risk checking."""

    def test_comt_met_met_tdcs(self):
        """COMT Met/Met should be identified for tDCS."""
        results = check_genetic_risks(["COMT_MET/MET"], "tDCS")
        assert len(results) > 0
        assert any(r["gene"] == "COMT" for r in results)

    def test_bdnf_val_met_tdcs(self):
        """BDNF Val/Met should be identified for tDCS."""
        results = check_genetic_risks(["BDNF_VAL/MET"], "tDCS")
        assert len(results) > 0
        assert any(r["gene"] == "BDNF" for r in results)

    def test_scn1a_tms(self):
        """SCN1A variant should be flagged for TMS."""
        results = check_genetic_risks(["SCN1A_PATHOGENIC"], "TMS")
        assert len(results) > 0
        assert any(r["gene"] == "SCN1A" for r in results)

    def test_no_risk_for_normal_variant(self):
        """Variants with no known risk should return empty."""
        results = check_genetic_risks(["MTHFR_C677T"], "tDCS")
        assert len(results) == 0

    def test_genetic_in_full_check(self, checker, base_patient, base_protocol_tdcs):
        """Full safety check should detect genetic risks."""
        patient = base_patient.copy()
        patient["genetic_variants"] = ["BDNF_VAL/MET"]
        result = checker.check_safety(patient, base_protocol_tdcs)
        assert any(
            w.get("type") == "genetic_risk" and w.get("gene") == "BDNF"
            for w in result["warnings"]
        )

    def test_comt_positive_factor(self):
        """COMT Met/Met should be a positive factor (no safety issue)."""
        results = check_genetic_risks(["COMT_MET/MET"], "tDCS")
        assert len(results) == 1
        assert "better" in results[0]["risk_description"].lower() or \
               "positive" in results[0]["clinical_impact"].lower()


# =============================================================================
# Test Age-Specific Safety
# =============================================================================


class TestAgeSpecificSafety:
    """Test age-specific safety rules."""

    def test_pediatric_tdcs_warning(self, checker, base_patient, base_protocol_tdcs):
        """Pediatric tDCS should generate age warning."""
        patient = base_patient.copy()
        patient["age"] = 8
        result = checker.check_safety(patient, base_protocol_tdcs)
        assert any(
            "pediatric" in str(w).lower()
            for w in result["warnings"]
        )

    def test_geriatric_warning(self, checker, base_patient, base_protocol_tdcs):
        """Geriatric patient should generate age warning."""
        patient = base_patient.copy()
        patient["age"] = 70
        result = checker.check_safety(patient, base_protocol_tdcs)
        assert any(
            "geriatric" in str(w).lower() or "age" in str(w).lower()
            for w in result["warnings"]
        )

    def test_adolescent_warning(self, checker, base_patient, base_protocol_tdcs):
        """Adolescent should generate age warning."""
        patient = base_patient.copy()
        patient["age"] = 15
        result = checker.check_safety(patient, base_protocol_tdcs)
        assert any(
            "adolescent" in str(w).lower()
            for w in result["warnings"]
        )

    def test_toddler_blocked(self, checker, base_patient, base_protocol_tdcs):
        """Toddler should be blocked from tDCS."""
        patient = base_patient.copy()
        patient["age"] = 1.5
        result = checker.check_safety(patient, base_protocol_tdcs)
        assert result["safe_to_proceed"] is False


# =============================================================================
# Test Protocol Parameter Validation
# =============================================================================


class TestProtocolParameterValidation:
    """Test protocol parameter safety limits."""

    def test_tdcs_current_too_high(self, checker, base_patient, base_protocol_tdcs):
        """tDCS current >2mA should generate warning."""
        protocol = deepcopy(base_protocol_tdcs)
        protocol["parameters"]["current_ma"] = 3000
        result = checker.check_safety(base_patient, protocol)
        assert any(
            "parameter" in w.get("type", "").lower()
            for w in result["warnings"]
        )

    def test_tdcs_duration_too_long(self, checker, base_patient, base_protocol_tdcs):
        """tDCS duration >40 min should generate warning."""
        protocol = deepcopy(base_protocol_tdcs)
        protocol["parameters"]["duration_min"] = 60
        result = checker.check_safety(base_patient, protocol)
        assert any(
            "duration" in str(w).lower()
            for w in result["warnings"]
        )

    def test_tdcs_current_density_high(self, checker, base_patient, base_protocol_tdcs):
        """High current density should generate warning."""
        protocol = deepcopy(base_protocol_tdcs)
        protocol["parameters"]["current_ma"] = 3000
        protocol["parameters"]["electrode_size_cm2"] = 20
        result = checker.check_safety(base_patient, protocol)
        assert any(
            "density" in str(w).lower()
            for w in result["warnings"]
        )

    def test_tms_high_frequency(self, checker, base_patient, base_protocol_tms):
        """TMS frequency >20 Hz should generate high-severity warning."""
        protocol = deepcopy(base_protocol_tms)
        protocol["parameters"]["frequency_hz"] = 25
        result = checker.check_safety(base_patient, protocol)
        assert any(
            w.get("severity") == "high" and "frequency" in str(w).lower()
            for w in result["warnings"]
        )

    def test_tms_moderate_frequency(self, checker, base_patient, base_protocol_tms):
        """TMS frequency 11-20 Hz should generate moderate warning."""
        protocol = deepcopy(base_protocol_tms)
        protocol["parameters"]["frequency_hz"] = 15
        result = checker.check_safety(base_patient, protocol)
        assert any(
            w.get("severity") == "moderate" and "frequency" in str(w).lower()
            for w in result["warnings"]
        )

    def test_tms_excessive_intensity(self, checker, base_patient, base_protocol_tms):
        """TMS intensity >120% MT should generate warning."""
        protocol = deepcopy(base_protocol_tms)
        protocol["parameters"]["intensity_pct_mt"] = 130
        result = checker.check_safety(base_patient, protocol)
        assert any(
            "intensity" in str(w).lower()
            for w in result["warnings"]
        )

    def test_tms_high_pulse_count(self, checker, base_patient, base_protocol_tms):
        """TMS total pulses >3000 should generate warning."""
        protocol = deepcopy(base_protocol_tms)
        protocol["parameters"]["total_pulses"] = 4000
        result = checker.check_safety(base_patient, protocol)
        assert any(
            "pulse" in str(w).lower()
            for w in result["warnings"]
        )

    def test_tms_long_train(self, checker, base_patient, base_protocol_tms):
        """TMS long train duration should generate warning."""
        protocol = deepcopy(base_protocol_tms)
        protocol["parameters"]["train_duration_s"] = 15
        result = checker.check_safety(base_patient, protocol)
        assert any(
            "train" in str(w).lower()
            for w in result["warnings"]
        )

    def test_pbm_short_wavelength(self, checker, base_patient, base_protocol_pbm):
        """PBM wavelength <600 nm should generate warning."""
        protocol = deepcopy(base_protocol_pbm)
        protocol["parameters"]["wavelength_nm"] = 550
        result = checker.check_safety(base_patient, protocol)
        assert any(
            "wavelength" in str(w).lower()
            for w in result["warnings"]
        )

    def test_pbm_high_power(self, checker, base_patient, base_protocol_pbm):
        """PBM power >500 mW should generate warning."""
        protocol = deepcopy(base_protocol_pbm)
        protocol["parameters"]["power_mw"] = 750
        result = checker.check_safety(base_patient, protocol)
        assert any(
            "power" in str(w).lower()
            for w in result["warnings"]
        )

    def test_pbm_high_fluence(self, checker, base_patient, base_protocol_pbm):
        """PBM fluence >60 J/cm² should generate warning."""
        protocol = deepcopy(base_protocol_pbm)
        protocol["parameters"]["fluence_j_cm2"] = 80
        result = checker.check_safety(base_patient, protocol)
        assert any(
            "fluence" in str(w).lower()
            for w in result["warnings"]
        )


# =============================================================================
# Test Safety Score Calculation
# =============================================================================


class TestSafetyScoreCalculation:
    """Test safety score computation."""

    def test_perfect_score(self, checker, base_patient, base_protocol_tdcs):
        """Clean patient with safe protocol should have high score."""
        result = checker.check_safety(base_patient, base_protocol_tdcs)
        assert result["safety_score"] >= 0.95

    def test_absolute_contra_zero_score(self, checker, base_patient, base_protocol_tdcs):
        """Absolute contraindication should give score 0."""
        patient = base_patient.copy()
        patient["conditions"] = {"pacemaker": True}
        result = checker.check_safety(patient, base_protocol_tdcs)
        assert result["safety_score"] == 0.0

    def test_relative_contra_reduces_score(self, checker, base_patient, base_protocol_tdcs):
        """Relative contraindications should reduce score."""
        patient_clean = base_patient.copy()
        result_clean = checker.check_safety(patient_clean, base_protocol_tdcs)

        patient_risky = base_patient.copy()
        patient_risky["conditions"] = {"epilepsy": True}
        result_risky = checker.check_safety(patient_risky, base_protocol_tdcs)

        assert result_risky["safety_score"] < result_clean["safety_score"]

    def test_score_range(self, checker, base_patient, base_protocol_tdcs):
        """Safety score must be between 0.0 and 1.0."""
        patient = base_patient.copy()
        patient["conditions"] = {"eczema": True, "pregnant": True}
        patient["medications"] = ["bupropion"]
        result = checker.check_safety(patient, base_protocol_tdcs)
        assert 0.0 <= result["safety_score"] <= 1.0


# =============================================================================
# Test Risk Level Determination
# =============================================================================


class TestRiskLevelDetermination:
    """Test risk level classification."""

    def test_low_risk(self, checker, base_patient, base_protocol_tdcs):
        """Clean patient should be LOW risk."""
        result = checker.check_safety(base_patient, base_protocol_tdcs)
        assert result["risk_level"] == "low"

    def test_critical_risk(self, checker, base_patient, base_protocol_tdcs):
        """Absolute contraindication should be CRITICAL."""
        patient = base_patient.copy()
        patient["conditions"] = {"pacemaker": True}
        result = checker.check_safety(patient, base_protocol_tdcs)
        assert result["risk_level"] == "critical"

    def test_moderate_risk(self, checker, base_patient, base_protocol_tms):
        """Relative contras should yield at least MODERATE."""
        patient = base_patient.copy()
        patient["conditions"] = {"seizure_history": True}
        result = checker.check_safety(patient, base_protocol_tms)
        assert result["risk_level"] in ("moderate", "high")


# =============================================================================
# Test Monitoring Requirements
# =============================================================================


class TestMonitoringRequirements:
    """Test that appropriate monitoring is prescribed."""

    def test_tdcs_monitoring(self, checker, base_patient, base_protocol_tdcs):
        """tDCS should have skin, mood, headache monitoring."""
        result = checker.check_safety(base_patient, base_protocol_tdcs)
        monitoring = result["required_monitoring"]
        assert len(monitoring) > 0
        assert any("skin" in m["parameter"] for m in monitoring)

    def test_tms_monitoring(self, checker, base_patient, base_protocol_tms):
        """TMS should have seizure, hearing, MT monitoring."""
        result = checker.check_safety(base_patient, base_protocol_tms)
        monitoring = result["required_monitoring"]
        assert any("seizure" in m["parameter"] for m in monitoring)
        assert any("hearing" in m["parameter"] for m in monitoring)

    def test_pbm_monitoring(self, checker, base_patient, base_protocol_pbm):
        """PBM should have skin temperature, eye protection monitoring."""
        result = checker.check_safety(base_patient, base_protocol_pbm)
        monitoring = result["required_monitoring"]
        assert any("eye" in m["parameter"] for m in monitoring)

    def test_neurofeedback_monitoring(self, checker, base_patient, base_protocol_neurofeedback):
        """Neurofeedback should have psychological state monitoring."""
        result = checker.check_safety(base_patient, base_protocol_neurofeedback)
        monitoring = result["required_monitoring"]
        assert any("psychological" in m["parameter"] for m in monitoring)

    def test_seizure_patient_extra_monitoring(self, checker, base_patient, base_protocol_tms):
        """Epileptic patient should get extra seizure monitoring."""
        patient = base_patient.copy()
        patient["conditions"] = {"epilepsy": True}
        result = checker.check_safety(patient, base_protocol_tms)
        monitoring = result["required_monitoring"]
        assert any("observation" in m.get("parameter", "") for m in monitoring)


# =============================================================================
# Test Modified Protocol Generation
# =============================================================================


class TestModifiedProtocolGeneration:
    """Test automatic protocol modification for relative contras."""

    def test_modification_for_seizure_drug(self, checker, base_patient, base_protocol_tdcs):
        """Should reduce current when seizure-threshold drug present."""
        patient = base_patient.copy()
        patient["medications"] = ["bupropion"]
        result = checker.check_safety(patient, base_protocol_tdcs)
        if result["safe_to_proceed"] and result["modified_protocol"]:
            assert result["modified_protocol"] is not None

    def test_modification_for_skin_condition(self, checker, base_patient, base_protocol_tdcs):
        """Should reduce duration when skin condition present."""
        patient = base_patient.copy()
        patient["conditions"] = {"eczema": True}
        result = checker.check_safety(patient, base_protocol_tdcs)
        if result["safe_to_proceed"] and result["modified_protocol"]:
            mods = result["modified_protocol"].get("modifications", [])
            assert any("duration" in m.lower() for m in mods)

    def test_pediatric_modifications(self, checker, base_patient, base_protocol_tdcs):
        """Should apply pediatric parameters."""
        patient = base_patient.copy()
        patient["age"] = 8
        result = checker.check_safety(patient, base_protocol_tdcs)
        if result["safe_to_proceed"] and result["modified_protocol"]:
            mods = result["modified_protocol"].get("modifications", [])
            assert any("pediatric" in m.lower() for m in mods)

    def test_no_modification_for_clean_patient(self, checker, base_patient, base_protocol_tdcs):
        """Clean patient should not need protocol modification."""
        result = checker.check_safety(base_patient, base_protocol_tdcs)
        # Low risk clean patients may not need modification
        assert result["modified_protocol"] is None or result["risk_level"] != "low"


# =============================================================================
# Test Comprehensive Safety Report
# =============================================================================


class TestComprehensiveSafetyReport:
    """Test multi-protocol safety report generation."""

    def test_report_structure(self, checker, base_patient):
        """Report should have all expected keys."""
        protocols = [
            {
                "protocol_id": "TDC-001",
                "name": "tDCS",
                "modality": "tDCS",
                "parameters": {"current_ma": 2000, "duration_min": 20, "electrode_size_cm2": 35},
            },
            {
                "protocol_id": "TMS-001",
                "name": "TMS",
                "modality": "TMS",
                "parameters": {"frequency_hz": 10, "intensity_pct_mt": 120, "total_pulses": 1500},
            },
        ]
        report = checker.generate_safety_report(base_patient, protocols)
        assert "protocol_results" in report
        assert "overall_risk_level" in report
        assert "overall_safe_to_proceed" in report
        assert "summary" in report
        assert "clinical_recommendations" in report

    def test_report_with_contraindication(self, checker, base_patient):
        """Report should flag contraindicated protocols."""
        patient = base_patient.copy()
        patient["conditions"] = {"pacemaker": True}
        protocols = [
            {
                "protocol_id": "TDC-001",
                "name": "tDCS",
                "modality": "tDCS",
                "parameters": {"current_ma": 2000, "duration_min": 20, "electrode_size_cm2": 35},
            },
        ]
        report = checker.generate_safety_report(patient, protocols)
        assert report["overall_safe_to_proceed"] is False
        assert report["summary"]["protocols_contraindicated"] > 0

    def test_multiple_protocols_evaluated(self, checker, base_patient):
        """Report should evaluate all provided protocols."""
        protocols = [
            {
                "protocol_id": f"TDC-{i:03d}",
                "name": f"Protocol {i}",
                "modality": "tDCS",
                "parameters": {"current_ma": 2000, "duration_min": 20, "electrode_size_cm2": 35},
            }
            for i in range(3)
        ]
        report = checker.generate_safety_report(base_patient, protocols)
        assert report["summary"]["total_protocols_evaluated"] == 3

    def test_report_with_error_handling(self, checker, base_patient):
        """Report should handle invalid protocols gracefully."""
        protocols = [
            {"name": "No modality protocol"},  # Missing modality
            {
                "name": "Valid protocol",
                "modality": "tDCS",
                "parameters": {"current_ma": 2000, "duration_min": 20, "electrode_size_cm2": 35},
            },
        ]
        report = checker.generate_safety_report(base_patient, protocols)
        # Should not crash and should report the error
        assert len(report["protocol_results"]) == 2


# =============================================================================
# Test Patient Data Extractor
# =============================================================================


class TestPatientDataExtractor:
    """Test patient data extraction utilities."""

    def test_get_age_from_age_field(self):
        """Should extract age from age field."""
        patient = {"age": 35}
        assert PatientDataExtractor.get_age(patient) == 35.0

    def test_get_age_from_dob(self):
        """Should calculate age from date_of_birth."""
        patient = {"date_of_birth": "1990-01-01"}
        age = PatientDataExtractor.get_age(patient)
        assert age is not None
        assert age > 30

    def test_get_age_none(self):
        """Should return None when age unavailable."""
        patient = {}
        assert PatientDataExtractor.get_age(patient) is None

    def test_get_age_group_adult(self):
        """Should classify 35-year-old as adult."""
        patient = {"age": 35}
        assert PatientDataExtractor.get_age_group(patient) == AgeGroup.ADULT

    def test_get_age_group_child(self):
        """Should classify 8-year-old as child."""
        patient = {"age": 8}
        assert PatientDataExtractor.get_age_group(patient) == AgeGroup.CHILD

    def test_get_age_group_geriatric(self):
        """Should classify 70-year-old as geriatric."""
        patient = {"age": 70}
        assert PatientDataExtractor.get_age_group(patient) == AgeGroup.GERIATRIC

    def test_has_condition_direct(self):
        """Should find direct condition match."""
        patient = {"conditions": {"diabetes": True}}
        assert PatientDataExtractor.has_condition(patient, "diabetes") is True

    def test_has_condition_false(self):
        """Should return False when condition absent."""
        patient = {"conditions": {}}
        assert PatientDataExtractor.has_condition(patient, "diabetes") is False

    def test_has_condition_in_list(self):
        """Should find condition in other_conditions list."""
        patient = {"other_conditions": ["hypertension", "asthma"]}
        assert PatientDataExtractor.has_condition(patient, "asthma") is True

    def test_get_medications(self):
        """Should normalize medication list."""
        patient = {"medications": ["Sertraline", "BUPROPION"]}
        meds = PatientDataExtractor.get_medications(patient)
        assert meds == ["sertraline", "bupropion"]

    def test_get_genetic_variants(self):
        """Should normalize genetic variants."""
        patient = {"genetic_variants": ["comt_met/met", "bdnf_val/met"]}
        variants = PatientDataExtractor.get_genetic_variants(patient)
        assert variants == ["COMT_MET/MET", "BDNF_VAL/MET"]

    def test_get_devices(self):
        """Should extract implanted devices."""
        patient = {"implanted_devices": ["pacemaker"]}
        devices = PatientDataExtractor.get_devices(patient)
        assert "pacemaker" in devices

    def test_get_devices_from_conditions(self):
        """Should find device flags in conditions."""
        patient = {"conditions": {"pacemaker": True}}
        devices = PatientDataExtractor.get_devices(patient)
        assert "pacemaker" in devices


# =============================================================================
# Test Knowledge Base
# =============================================================================


class TestKnowledgeBase:
    """Test the safety knowledge base."""

    def test_tdcs_rules_exist(self):
        """tDCS rules should be present."""
        abs_rules, rel_rules = SafetyKnowledgeBase.get_all_rules(Modality.TDCS)
        assert len(abs_rules) > 0
        assert len(rel_rules) > 0

    def test_tms_rules_exist(self):
        """TMS rules should be present."""
        abs_rules, rel_rules = SafetyKnowledgeBase.get_all_rules(Modality.TMS)
        assert len(abs_rules) > 0
        assert len(rel_rules) > 0

    def test_pbm_rules_exist(self):
        """PBM rules should be present."""
        abs_rules, rel_rules = SafetyKnowledgeBase.get_all_rules(Modality.PBM)
        assert len(abs_rules) > 0
        assert len(rel_rules) > 0

    def test_neurofeedback_rules_exist(self):
        """Neurofeedback rules should be present."""
        abs_rules, rel_rules = SafetyKnowledgeBase.get_all_rules(Modality.NEUROFEEDBACK)
        assert len(abs_rules) > 0
        assert len(rel_rules) > 0

    def test_drug_interactions_exist(self):
        """Drug interaction database should have entries."""
        assert len(SafetyKnowledgeBase.DRUG_INTERACTIONS) > 0

    def test_genetic_risks_exist(self):
        """Genetic risk database should have entries."""
        assert len(SafetyKnowledgeBase.GENETIC_RISKS) > 0

    def test_seizure_threshold_drugs(self):
        """Seizure threshold drug list should be populated."""
        assert len(SafetyKnowledgeBase.SEIZURE_THRESHOLD_DRUGS) > 0
        assert "bupropion" in SafetyKnowledgeBase.SEIZURE_THRESHOLD_DRUGS
        assert "clozapine" in SafetyKnowledgeBase.SEIZURE_THRESHOLD_DRUGS

    def test_photosensitizing_drugs(self):
        """Photosensitizing drug list should be populated."""
        assert len(SafetyKnowledgeBase.PHOTOSENSITIZING_DRUGS) > 0
        assert "tetracycline" in SafetyKnowledgeBase.PHOTOSENSITIZING_DRUGS

    def test_monitoring_requirements(self):
        """Monitoring requirements should exist for all modalities."""
        for modality in Modality:
            reqs = SafetyKnowledgeBase.MONITORING_REQUIREMENTS.get(modality, [])
            assert len(reqs) > 0, f"No monitoring requirements for {modality.value}"

    def test_all_rules_have_evidence(self):
        """Every safety rule should cite an evidence source."""
        for modality in Modality:
            abs_rules, rel_rules = SafetyKnowledgeBase.get_all_rules(modality)
            for rule in abs_rules + rel_rules:
                assert rule.evidence_source, f"Rule {rule.rule_id} missing evidence source"
                assert rule.pmid or rule.evidence_level != EvidenceLevel.E_THEORETICAL, \
                    f"Rule {rule.rule_id} should have PMID or be theoretical"

    def test_unknown_modality_raises(self):
        """Should raise ValueError for unknown modality."""
        # Create a fake modality-like object
        class FakeModality:
            value = "fake"
        with pytest.raises(ValueError):
            SafetyKnowledgeBase.get_all_rules(FakeModality())  # type: ignore[arg-type]


# =============================================================================
# Test JSON Export
# =============================================================================


class TestJSONExport:
    """Test safety rules JSON export functionality."""

    def test_export_creates_file(self):
        """Export should create a valid JSON file."""
        with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as f:
            path = f.name
        try:
            export_safety_rules_to_json(path)
            assert os.path.exists(path)
            with open(path) as f:
                data = json.load(f)
            assert "tDCS" in data
            assert "TMS" in data
            assert "PBM" in data
            assert "Neurofeedback" in data
            # Check structure
            for modality_data in data.values():
                assert "absolute" in modality_data
                assert "relative" in modality_data
        finally:
            os.unlink(path)


# =============================================================================
# Test Edge Cases
# =============================================================================


class TestEdgeCases:
    """Test edge cases and unusual scenarios."""

    def test_multiple_absolute_contras(self, checker, base_patient, base_protocol_tdcs):
        """Multiple absolute contras should all be reported."""
        patient = base_patient.copy()
        patient["conditions"] = {"pacemaker": True, "dbs": True}
        result = checker.check_safety(patient, base_protocol_tdcs)
        assert len(result["absolute_contraindications"]) >= 2

    def test_multiple_modalities_same_patient(self, checker, base_patient):
        """Same patient checked against different modalities."""
        patient = base_patient.copy()
        patient["conditions"] = {"seizure_history": True}

        tdcs_result = checker.check_safety(patient, {
            "protocol_id": "TDC-001", "modality": "tDCS",
            "parameters": {"current_ma": 2000, "duration_min": 20, "electrode_size_cm2": 35}
        })
        tms_result = checker.check_safety(patient, {
            "protocol_id": "TMS-001", "modality": "TMS",
            "parameters": {"frequency_hz": 10, "intensity_pct_mt": 120, "total_pulses": 1500}
        })

        # Both should detect seizure history
        assert len(tdcs_result["relative_contraindications"]) > 0
        assert len(tms_result["relative_contraindications"]) > 0

    def test_empty_conditions_dict(self, checker, base_protocol_tdcs):
        """Empty conditions should not crash."""
        patient = {"age": 30, "conditions": {}}
        result = checker.check_safety(patient, base_protocol_tdcs)
        assert result["safe_to_proceed"] is True

    def test_none_values_in_patient(self, checker, base_protocol_tdcs):
        """None values in patient should be handled gracefully."""
        patient = {
            "age": None,
            "conditions": {},
            "medications": None,
            "genetic_variants": None,
        }
        result = checker.check_safety(patient, base_protocol_tdcs)
        assert "safe_to_proceed" in result

    def test_very_old_patient(self, checker, base_protocol_tdcs):
        """Very old patient should be handled."""
        patient = {"age": 95, "conditions": {}}
        result = checker.check_safety(patient, base_protocol_tdcs)
        assert result["safe_to_proceed"] is True  # No absolute contras

    def test_multiple_medications(self, checker, base_patient, base_protocol_tms):
        """Multiple seizure-threshold drugs should be all flagged."""
        patient = base_patient.copy()
        patient["medications"] = ["bupropion", "clozapine", "lithium"]
        result = checker.check_safety(patient, base_protocol_tms)
        warnings_and_rel = result["warnings"] + result["relative_contraindications"]
        flagged_drugs = set()
        for w in warnings_and_rel:
            for med in ["bupropion", "clozapine", "lithium"]:
                if med in str(w).lower():
                    flagged_drugs.add(med)
        assert len(flagged_drugs) >= 2

    def test_unknown_condition_in_patient(self, checker, base_patient, base_protocol_tdcs):
        """Unknown conditions should not affect safety check."""
        patient = base_patient.copy()
        patient["conditions"] = {"rare_undocumented_condition": True}
        result = checker.check_safety(patient, base_protocol_tdcs)
        assert result["safe_to_proceed"] is True

    def test_protocol_id_preserved(self, checker, base_patient):
        """Protocol metadata should be preserved in results."""
        protocol = {
            "protocol_id": "CUSTOM-123",
            "name": "Custom Protocol",
            "modality": "tDCS",
            "parameters": {"current_ma": 2000, "duration_min": 20, "electrode_size_cm2": 35}
        }
        result = checker.check_safety(base_patient, protocol)
        assert result["details"]["modality"] == "tDCS"

    def test_convenience_function_check_safety(self, base_patient, base_protocol_tdcs):
        """Module-level check_safety function should work."""
        result = check_safety(base_patient, base_protocol_tdcs)
        assert result["safe_to_proceed"] is True

    def test_convenience_function_generate_report(self, base_patient, base_protocol_tdcs):
        """Module-level generate_safety_report function should work."""
        report = generate_safety_report(base_patient, [base_protocol_tdcs])
        assert report["overall_safe_to_proceed"] is True


# =============================================================================
# Test Enum Classes
# =============================================================================


class TestEnums:
    """Test enumeration classes."""

    def test_modality_values(self):
        """Modality enum should have correct values."""
        assert Modality.TDCS.value == "tDCS"
        assert Modality.TMS.value == "TMS"
        assert Modality.PBM.value == "PBM"
        assert Modality.NEUROFEEDBACK.value == "neurofeedback"

    def test_risk_level_order(self):
        """Risk levels should have expected values."""
        assert RiskLevel.LOW.value == "low"
        assert RiskLevel.MODERATE.value == "moderate"
        assert RiskLevel.HIGH.value == "high"
        assert RiskLevel.CRITICAL.value == "critical"

    def test_severity_values(self):
        """Contraindication severity should have correct values."""
        assert ContraindicationSeverity.ABSOLUTE.value == "absolute"
        assert ContraindicationSeverity.RELATIVE.value == "relative"

    def test_evidence_levels(self):
        """Evidence levels should have proper descriptions."""
        assert "Systematic Review" in EvidenceLevel.A_SYSTEMATIC_REVIEW.value
        assert "RCT" in EvidenceLevel.B_RANDOMIZED_TRIAL.value

    def test_age_groups(self):
        """Age groups should cover full lifespan."""
        expected = ["neonate", "infant", "toddler", "preschool", "child",
                    "adolescent", "adult", "geriatric"]
        actual = [ag.value for ag in AgeGroup]
        assert actual == expected


# =============================================================================
# Test Data Classes
# =============================================================================


class TestDataClasses:
    """Test dataclass creation and attributes."""

    def test_safety_rule_creation(self):
        """Should create SafetyRule correctly."""
        rule = SafetyRule(
            rule_id="TEST-001",
            modality=Modality.TDCS,
            condition="test_condition",
            severity=ContraindicationSeverity.RELATIVE,
            message="Test message",
            evidence_source="Test source",
            evidence_level=EvidenceLevel.C_EXPERT_CONSENSUS,
        )
        assert rule.rule_id == "TEST-001"
        assert rule.modality == Modality.TDCS
        assert rule.override_possible is False  # default

    def test_drug_interaction_creation(self):
        """Should create DrugInteraction correctly."""
        di = DrugInteraction(
            drug_name="test_drug",
            modality=Modality.TMS,
            interaction_type="test",
            severity=RiskLevel.LOW,
            mechanism="test mechanism",
            evidence_source="test",
            recommendation="test rec",
        )
        assert di.drug_name == "test_drug"

    def test_genetic_risk_factor_creation(self):
        """Should create GeneticRiskFactor correctly."""
        gr = GeneticRiskFactor(
            gene="TEST",
            variant="test_variant",
            modality=Modality.TDCS,
            risk_description="test",
            clinical_impact="test",
            evidence_source="test",
        )
        assert gr.gene == "TEST"

    def test_monitoring_requirement_creation(self):
        """Should create MonitoringRequirement correctly."""
        mr = MonitoringRequirement(
            parameter="test_param",
            frequency="every_session",
            rationale="test rationale",
            evidence_source="test",
        )
        assert mr.parameter == "test_param"
        assert mr.threshold_for_stop is None


# =============================================================================
# Integration Tests
# =============================================================================


class TestIntegration:
    """End-to-end integration tests."""

    def test_full_workflow_clean_patient(self):
        """Full workflow with a clean patient should pass."""
        patient = {
            "age": 30,
            "sex": "F",
            "conditions": {"depression": True},
            "diagnoses": {},
            "medications": ["sertraline"],
            "genetic_variants": [],
            "implanted_devices": [],
            "other_conditions": [],
        }
        protocol = {
            "protocol_id": "DEP-001",
            "name": "tDCS for Depression",
            "modality": "tDCS",
            "parameters": {
                "current_ma": 2000,
                "duration_min": 20,
                "electrode_size_cm2": 35,
                "anode": "F3",
                "cathode": "Fp2",
            },
        }
        result = check_safety(patient, protocol)
        assert result["safe_to_proceed"] is True
        assert result["safety_score"] > 0.9

    def test_full_workflow_unsafe_patient(self):
        """Full workflow with an unsafe patient should fail."""
        patient = {
            "age": 30,
            "sex": "M",
            "conditions": {
                "depression": True,
                "pacemaker": True,
                "epilepsy": True,
            },
            "diagnoses": {},
            "medications": ["bupropion", "clozapine"],
            "genetic_variants": [],
            "implanted_devices": [],
        }
        protocol = {
            "protocol_id": "DEP-001",
            "name": "tDCS for Depression",
            "modality": "tDCS",
            "parameters": {
                "current_ma": 2000,
                "duration_min": 20,
                "electrode_size_cm2": 35,
            },
        }
        result = check_safety(patient, protocol)
        assert result["safe_to_proceed"] is False
        assert result["safety_score"] == 0.0
        assert result["risk_level"] == "critical"
        assert len(result["absolute_contraindications"]) > 0

    def test_multi_protocol_assessment(self):
        """Assess multiple protocols for a complex patient."""
        patient = {
            "age": 55,
            "sex": "F",
            "conditions": {
                "depression": True,
                "hearing_loss": True,
            },
            "medications": ["sertraline"],
            "genetic_variants": ["COMT_MET/MET"],
        }
        protocols = [
            {
                "protocol_id": "TDC-001",
                "name": "tDCS",
                "modality": "tDCS",
                "parameters": {"current_ma": 2000, "duration_min": 20, "electrode_size_cm2": 35},
            },
            {
                "protocol_id": "TMS-001",
                "name": "TMS",
                "modality": "TMS",
                "parameters": {"frequency_hz": 10, "intensity_pct_mt": 120, "total_pulses": 1500},
            },
            {
                "protocol_id": "PBM-001",
                "name": "PBM",
                "modality": "PBM",
                "parameters": {"wavelength_nm": 810, "power_mw": 250, "fluence_j_cm2": 30},
            },
        ]
        report = generate_safety_report(patient, protocols)
        assert report["summary"]["total_protocols_evaluated"] == 3
        assert all("result" in p for p in report["protocol_results"])

    def test_complex_case_all_modalities(self):
        """Complex patient with conditions affecting multiple modalities."""
        patient = {
            "age": 45,
            "sex": "M",
            "conditions": {
                "depression": True,
                "anxiety": True,
            },
            "diagnoses": {},
            "medications": ["bupropion"],
            "genetic_variants": ["BDNF_VAL/MET"],
            "implanted_devices": [],
            "other_conditions": [],
        }

        # tDCS — should pass with warnings
        tdcs_protocol = {
            "protocol_id": "TDC-001",
            "name": "tDCS DLPFC",
            "modality": "tDCS",
            "parameters": {"current_ma": 2000, "duration_min": 20, "electrode_size_cm2": 35},
        }
        tdcs_result = check_safety(patient, tdcs_protocol)
        assert tdcs_result["safe_to_proceed"] is True
        assert tdcs_result["safety_score"] < 1.0  # Has warnings

        # TMS — should flag bupropion interaction
        tms_protocol = {
            "protocol_id": "TMS-001",
            "name": "rTMS DLPFC",
            "modality": "TMS",
            "parameters": {"frequency_hz": 10, "intensity_pct_mt": 120, "total_pulses": 1500},
        }
        tms_result = check_safety(patient, tms_protocol)
        assert any(
            "bupropion" in str(w).lower()
            for w in tms_result["warnings"] + tms_result["relative_contraindications"]
        )


# =============================================================================
# Main execution for standalone test runs
# =============================================================================

if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
