#!/usr/bin/env python3
"""
Comprehensive test suite for Protocol Report Generator (PRG).

Covers:
- Report generation in all formats (full, summary, patient_facing)
- Markdown conversion
- JSON serialization
- SOAP clinical note generation
- Safety warning generation
- Contraindication checking
- Evidence lookup and inference
- Input validation and error handling
- Edge cases and boundary conditions

Usage:
    python test_protocol_report_generator.py
    python test_protocol_report_generator.py -v  # verbose

Coverage target: > 95% of module lines.
"""

from __future__ import annotations

import copy
import json
import sys
import unittest
from datetime import datetime
from typing import Any, Dict, List

# Import the module under test
from protocol_report_generator import (
    CONTRAINDICATIONS_DB,
    EVIDENCE_DATABASE,
    DEFAULT_DISCLAIMER,
    PATIENT_FACING_DISCLAIMER,
    RESEARCH_ONLY_FLAG,
    RESEARCH_ONLY_NOTICE,
    EvidenceGrade,
    FormatNotSupportedError,
    InvalidInputError,
    Modality,
    PatientProfile,
    ProtocolRecommendation,
    ProtocolReportError,
    ProtocolReportGenerator,
    RiskLevel,
    SafetyWarning,
    StimulationParameters,
    generate_clinical_note,
    generate_json,
    generate_markdown,
    generate_report,
)


# ---------------------------------------------------------------------------
# Test fixtures
# ---------------------------------------------------------------------------

SAMPLE_PATIENT_PROFILE = {
    "age": 45,
    "sex": "female",
    "diagnosis": "major_depressive_disorder",
    "comorbidities": ["generalized_anxiety"],
    "medications": ["sertraline 100mg"],
    "prior_treatments": ["CBT", "SSRI trial"],
    "contraindications": [],
}

SAMPLE_PROTOCOLS = [
    {
        "modality": "tDCS",
        "protocol_name": "tDCS F3-F4 for Depression",
        "parameters": {
            "montage": "Anode F3, Cathode F4",
            "current": "2.0 mA",
            "duration": "20 minutes",
            "sessions": "15 (daily × 3 weeks)",
            "total_duration": "3 weeks",
        },
        "evidence_key": "tDCS_F3_F4_depression",
    },
    {
        "modality": "TMS",
        "protocol_name": "rTMS Left DLPFC for MDD",
        "parameters": {
            "montage": "Figure-8 coil over F3",
            "frequency": "10 Hz",
            "duration": "37.5 minutes",
            "sessions": "30 (daily × 6 weeks)",
            "total_duration": "6 weeks",
            "pulse_count": "3000 pulses/session",
        },
        "evidence_key": "rtms_ldlpc_depression",
    },
]

SAMPLE_PBM_PROTOCOL = [
    {
        "modality": "PBM",
        "protocol_name": "Transcranial PBM for Depression",
        "parameters": {
            "montage": "LED cluster over F3-F4",
            "wavelength": "810 nm",
            "power_density": "250 mW/cm²",
            "duration": "20 minutes",
            "sessions": "12 (3× per week × 4 weeks)",
            "total_duration": "4 weeks",
        },
    }
]

SAMPLE_NEUROFEEDBACK_PROTOCOL = [
    {
        "modality": "Neurofeedback",
        "protocol_name": "Alpha-Theta Neurofeedback for Depression",
        "parameters": {
            "montage": "Cz-Oz bipolar",
            "frequency": "Alpha (8-12 Hz) / Theta (4-8 Hz)",
            "duration": "30 minutes",
            "sessions": "20 (2× per week × 10 weeks)",
            "total_duration": "10 weeks",
        },
    }
]


# ---------------------------------------------------------------------------
# Test: PatientProfile
# ---------------------------------------------------------------------------


class TestPatientProfile(unittest.TestCase):
    """Tests for PatientProfile dataclass and validation."""

    def test_valid_profile(self) -> None:
        p = PatientProfile(
            patient_id="PT-001",
            age=45,
            sex="female",
            diagnosis="major_depressive_disorder",
        )
        p.validate()
        self.assertEqual(p.patient_id, "PT-001")
        self.assertEqual(p.age, 45)

    def test_missing_id(self) -> None:
        p = PatientProfile(
            patient_id="",
            age=45,
            sex="female",
            diagnosis="MDD",
        )
        with self.assertRaises(InvalidInputError):
            p.validate()

    def test_invalid_age_zero(self) -> None:
        p = PatientProfile(
            patient_id="PT-001",
            age=0,
            sex="female",
            diagnosis="MDD",
        )
        with self.assertRaises(InvalidInputError):
            p.validate()

    def test_invalid_age_too_high(self) -> None:
        p = PatientProfile(
            patient_id="PT-001",
            age=200,
            sex="female",
            diagnosis="MDD",
        )
        with self.assertRaises(InvalidInputError):
            p.validate()

    def test_invalid_sex(self) -> None:
        p = PatientProfile(
            patient_id="PT-001",
            age=45,
            sex="invalid",
            diagnosis="MDD",
        )
        with self.assertRaises(InvalidInputError):
            p.validate()

    def test_sex_case_insensitive(self) -> None:
        for sex in ["Male", "FEMALE", "OTHER", "Unknown"]:
            p = PatientProfile(
                patient_id="PT-001",
                age=45,
                sex=sex,
                diagnosis="MDD",
            )
            p.validate()  # should not raise

    def test_to_dict(self) -> None:
        p = PatientProfile(
            patient_id="PT-001",
            age=45,
            sex="female",
            diagnosis="MDD",
            comorbidities=["anxiety"],
            special_population="geriatric",
        )
        d = p.to_dict()
        self.assertEqual(d["id"], "PT-001")
        self.assertEqual(d["comorbidities"], ["anxiety"])
        self.assertEqual(d["special_population"], "geriatric")


# ---------------------------------------------------------------------------
# Test: StimulationParameters
# ---------------------------------------------------------------------------


class TestStimulationParameters(unittest.TestCase):
    """Tests for StimulationParameters dataclass."""

    def test_basic(self) -> None:
        sp = StimulationParameters(
            montage="Anode F3, Cathode F4",
            current="2.0 mA",
            duration="20 minutes",
        )
        d = sp.to_dict()
        self.assertEqual(d["montage"], "Anode F3, Cathode F4")
        self.assertEqual(d["current"], "2.0 mA")
        self.assertEqual(d["duration"], "20 minutes")
        self.assertNotIn("frequency", d)  # None values excluded

    def test_additional_params(self) -> None:
        sp = StimulationParameters(
            montage="F3",
            additional_params={"sham": "false", "ramp_up": "30s"},
        )
        d = sp.to_dict()
        self.assertEqual(d["sham"], "false")
        self.assertEqual(d["ramp_up"], "30s")


# ---------------------------------------------------------------------------
# Test: ProtocolReportGenerator — generate_report
# ---------------------------------------------------------------------------


class TestGenerateReport(unittest.TestCase):
    """Tests for the main generate_report method."""

    def setUp(self) -> None:
        self.generator = ProtocolReportGenerator()

    def test_full_report_structure(self) -> None:
        report = self.generator.generate_report(
            patient_id="PT-001",
            protocols=SAMPLE_PROTOCOLS,
            patient_profile=SAMPLE_PATIENT_PROFILE,
            report_format="full",
        )
        self.assertIn("report_id", report)
        self.assertIn("generated_at", report)
        self.assertIn("generated_by", report)
        self.assertIn("version", report)
        self.assertIn("format", report)
        self.assertIn("patient", report)
        self.assertIn("recommended_protocols", report)
        self.assertIn("safety_warnings", report)
        self.assertIn("evidence_quality", report)
        self.assertIn("disclaimer", report)
        self.assertIn("next_review_date", report)
        self.assertIn("confidence_overall", report)
        self.assertIn("research_only_notes", report)
        self.assertIn("data_sources_consulted", report)

    def test_report_id_format(self) -> None:
        report = self.generator.generate_report(
            patient_id="PT-001",
            protocols=SAMPLE_PROTOCOLS,
            patient_profile=SAMPLE_PATIENT_PROFILE,
            report_format="full",
        )
        self.assertRegex(report["report_id"], r"^RPT-\d{8}-PT001$")

    def test_patient_data_in_report(self) -> None:
        report = self.generator.generate_report(
            patient_id="PT-001",
            protocols=SAMPLE_PROTOCOLS,
            patient_profile=SAMPLE_PATIENT_PROFILE,
            report_format="full",
        )
        patient = report["patient"]
        self.assertEqual(patient["id"], "PT-001")
        self.assertEqual(patient["age"], 45)
        self.assertEqual(patient["sex"], "female")
        self.assertEqual(patient["diagnosis"], "major_depressive_disorder")

    def test_protocol_count(self) -> None:
        report = self.generator.generate_report(
            patient_id="PT-001",
            protocols=SAMPLE_PROTOCOLS,
            patient_profile=SAMPLE_PATIENT_PROFILE,
            report_format="full",
        )
        self.assertEqual(len(report["recommended_protocols"]), 2)

    def test_protocol_ranking(self) -> None:
        report = self.generator.generate_report(
            patient_id="PT-001",
            protocols=SAMPLE_PROTOCOLS,
            patient_profile=SAMPLE_PATIENT_PROFILE,
            report_format="full",
        )
        ranks = [p["rank"] for p in report["recommended_protocols"]]
        self.assertEqual(ranks, sorted(ranks))

    def test_protocol_fields(self) -> None:
        report = self.generator.generate_report(
            patient_id="PT-001",
            protocols=SAMPLE_PROTOCOLS,
            patient_profile=SAMPLE_PATIENT_PROFILE,
            report_format="full",
        )
        proto = report["recommended_protocols"][0]
        required_fields = {
            "rank", "modality", "protocol_name", "parameters",
            "evidence_summary", "predicted_response", "safety_summary",
            "contraindications_checked", "cost_estimate", "key_references",
            "evidence_grade", "response_confidence", "risk_level",
        }
        self.assertTrue(required_fields.issubset(set(proto.keys())))

    def test_evidence_populated(self) -> None:
        report = self.generator.generate_report(
            patient_id="PT-001",
            protocols=SAMPLE_PROTOCOLS,
            patient_profile=SAMPLE_PATIENT_PROFILE,
            report_format="full",
        )
        # Find the tDCS protocol (may be rank 2 after confidence sorting)
        tdcs_proto = None
        for proto in report["recommended_protocols"]:
            if proto["modality"] == "tDCS":
                tdcs_proto = proto
                break
        self.assertIsNotNone(tdcs_proto, "tDCS protocol should be in recommendations")
        self.assertIn("47 RCTs", tdcs_proto["evidence_summary"])
        self.assertIn("68% remission", tdcs_proto["predicted_response"])
        self.assertIn("Brunoni", tdcs_proto["key_references"][0])

    def test_cost_estimate(self) -> None:
        report = self.generator.generate_report(
            patient_id="PT-001",
            protocols=SAMPLE_PROTOCOLS,
            patient_profile=SAMPLE_PATIENT_PROFILE,
            report_format="full",
        )
        costs = [p["cost_estimate"] for p in report["recommended_protocols"]]
        self.assertIn("$1,500 USD", costs)
        self.assertIn("$8,000 USD", costs)

    def test_summary_format(self) -> None:
        report = self.generator.generate_report(
            patient_id="PT-001",
            protocols=SAMPLE_PROTOCOLS,
            patient_profile=SAMPLE_PATIENT_PROFILE,
            report_format="summary",
        )
        self.assertEqual(len(report["recommended_protocols"]), 1)
        refs = report["recommended_protocols"][0]["key_references"]
        self.assertLessEqual(len(refs), 2)

    def test_patient_facing_format(self) -> None:
        report = self.generator.generate_report(
            patient_id="PT-001",
            protocols=SAMPLE_PROTOCOLS,
            patient_profile=SAMPLE_PATIENT_PROFILE,
            report_format="patient_facing",
        )
        self.assertEqual(report["disclaimer"], PATIENT_FACING_DISCLAIMER)
        self.assertIsNone(report["research_only_notice"])
        self.assertEqual(report["research_only_notes"], 0)

        # Check jargon simplification
        proto = report["recommended_protocols"][0]
        self.assertEqual(proto["key_references"], [])
        self.assertIn("Contact your clinic", proto["cost_estimate"])

    def test_patient_facing_simplification(self) -> None:
        report = self.generator.generate_report(
            patient_id="PT-001",
            protocols=[{
                "modality": "tDCS",
                "protocol_name": "tDCS Anode F3 for Depression",
                "parameters": {
                    "montage": "Anode F3, Cathode F4",
                    "current": "2.0 mA",
                    "duration": "20 minutes",
                    "sessions": "15 (daily × 3 weeks)",
                    "total_duration": "3 weeks",
                },
            }],
            patient_profile=SAMPLE_PATIENT_PROFILE,
            report_format="patient_facing",
        )
        # Check that "anode" is simplified
        proto_name = report["recommended_protocols"][0]["protocol_name"]
        self.assertIn("positive electrode", proto_name.lower())

    def test_invalid_format(self) -> None:
        with self.assertRaises(FormatNotSupportedError):
            self.generator.generate_report(
                patient_id="PT-001",
                protocols=SAMPLE_PROTOCOLS,
                patient_profile=SAMPLE_PATIENT_PROFILE,
                report_format="invalid_format",
            )

    def test_invalid_patient_age(self) -> None:
        with self.assertRaises(InvalidInputError):
            self.generator.generate_report(
                patient_id="PT-001",
                protocols=SAMPLE_PROTOCOLS,
                patient_profile={
                    "age": -5,
                    "sex": "female",
                    "diagnosis": "MDD",
                },
                report_format="full",
            )

    def test_missing_required_field(self) -> None:
        with self.assertRaises(InvalidInputError):
            self.generator.generate_report(
                patient_id="PT-001",
                protocols=SAMPLE_PROTOCOLS,
                patient_profile={"age": 45},  # missing sex, diagnosis
                report_format="full",
            )

    def test_no_protocols(self) -> None:
        report = self.generator.generate_report(
            patient_id="PT-001",
            protocols=[],
            patient_profile=SAMPLE_PATIENT_PROFILE,
            report_format="full",
        )
        self.assertEqual(len(report["recommended_protocols"]), 0)
        self.assertEqual(report["confidence_overall"], 0.0)

    def test_overall_confidence_capped(self) -> None:
        report = self.generator.generate_report(
            patient_id="PT-001",
            protocols=SAMPLE_PROTOCOLS,
            patient_profile=SAMPLE_PATIENT_PROFILE,
            report_format="full",
        )
        self.assertLessEqual(report["confidence_overall"], 0.95)

    def test_evidence_quality_grade_a(self) -> None:
        report = self.generator.generate_report(
            patient_id="PT-001",
            protocols=[SAMPLE_PROTOCOLS[0]],  # tDCS with Grade A evidence
            patient_profile=SAMPLE_PATIENT_PROFILE,
            report_format="full",
        )
        self.assertIn("Grade A", report["evidence_quality"])

    def test_next_review_date(self) -> None:
        report = self.generator.generate_report(
            patient_id="PT-001",
            protocols=SAMPLE_PROTOCOLS,
            patient_profile=SAMPLE_PATIENT_PROFILE,
            report_format="full",
        )
        # Should be 30 days from now
        today = datetime.utcnow().strftime("%Y-%m-%d")
        self.assertRegex(report["next_review_date"], r"^\d{4}-\d{2}-\d{2}$")
        self.assertGreater(report["next_review_date"], today)

    def test_research_only_flag(self) -> None:
        report = self.generator.generate_report(
            patient_id="PT-001",
            protocols=SAMPLE_PROTOCOLS,
            patient_profile=SAMPLE_PATIENT_PROFILE,
            report_format="full",
        )
        self.assertEqual(report["research_only_notes"], 1 if RESEARCH_ONLY_FLAG else 0)
        if RESEARCH_ONLY_FLAG:
            self.assertIsNotNone(report["research_only_notice"])

    def test_pbm_protocol_inference(self) -> None:
        report = self.generator.generate_report(
            patient_id="PT-002",
            protocols=SAMPLE_PBM_PROTOCOL,
            patient_profile={
                "age": 50,
                "sex": "male",
                "diagnosis": "major_depressive_disorder",
            },
            report_format="full",
        )
        proto = report["recommended_protocols"][0]
        self.assertEqual(proto["modality"], "PBM")
        self.assertIn("response probability", proto["predicted_response"])

    def test_neurofeedback_protocol_inference(self) -> None:
        report = self.generator.generate_report(
            patient_id="PT-003",
            protocols=SAMPLE_NEUROFEEDBACK_PROTOCOL,
            patient_profile={
                "age": 35,
                "sex": "female",
                "diagnosis": "major_depressive_disorder",
            },
            report_format="full",
        )
        proto = report["recommended_protocols"][0]
        self.assertEqual(proto["modality"], "Neurofeedback")
        self.assertIn("response probability", proto["predicted_response"])

    def test_special_population_pregnant(self) -> None:
        profile = copy.deepcopy(SAMPLE_PATIENT_PROFILE)
        profile["special_population"] = "pregnant"
        report = self.generator.generate_report(
            patient_id="PT-001",
            protocols=SAMPLE_PROTOCOLS,
            patient_profile=profile,
            report_format="full",
        )
        warning_types = [w["level"] for w in report["safety_warnings"]]
        self.assertIn("moderate", warning_types)

    def test_pediatric_patient(self) -> None:
        profile = copy.deepcopy(SAMPLE_PATIENT_PROFILE)
        profile["age"] = 14
        report = self.generator.generate_report(
            patient_id="PT-PED-001",
            protocols=SAMPLE_PROTOCOLS,
            patient_profile=profile,
            report_format="full",
        )
        warning_types = [w["level"] for w in report["safety_warnings"]]
        self.assertIn("moderate", warning_types)

    def test_geriatric_patient(self) -> None:
        profile = copy.deepcopy(SAMPLE_PATIENT_PROFILE)
        profile["age"] = 80
        report = self.generator.generate_report(
            patient_id="PT-GER-001",
            protocols=SAMPLE_PROTOCOLS,
            patient_profile=profile,
            report_format="full",
        )
        warning_types = [w["level"] for w in report["safety_warnings"]]
        self.assertIn("low", warning_types)


# ---------------------------------------------------------------------------
# Test: generate_markdown
# ---------------------------------------------------------------------------


class TestGenerateMarkdown(unittest.TestCase):
    """Tests for Markdown report generation."""

    def setUp(self) -> None:
        self.generator = ProtocolReportGenerator()
        self.report = self.generator.generate_report(
            patient_id="PT-001",
            protocols=SAMPLE_PROTOCOLS,
            patient_profile=SAMPLE_PATIENT_PROFILE,
            report_format="full",
        )

    def test_markdown_not_empty(self) -> None:
        md = self.generator.generate_markdown(self.report)
        self.assertGreater(len(md), 100)

    def test_markdown_contains_patient_id(self) -> None:
        md = self.generator.generate_markdown(self.report)
        self.assertIn("PT-001", md)

    def test_markdown_contains_protocol_name(self) -> None:
        md = self.generator.generate_markdown(self.report)
        self.assertIn("tDCS F3-F4", md)

    def test_markdown_contains_disclaimer(self) -> None:
        md = self.generator.generate_markdown(self.report)
        self.assertIn("DeepSynaps Protocol Studio", md)

    def test_markdown_contains_evidence(self) -> None:
        md = self.generator.generate_markdown(self.report)
        self.assertIn("47 RCTs", md)

    def test_markdown_patient_facing(self) -> None:
        report_pf = self.generator.generate_report(
            patient_id="PT-001",
            protocols=SAMPLE_PROTOCOLS,
            patient_profile=SAMPLE_PATIENT_PROFILE,
            report_format="patient_facing",
        )
        md = self.generator.generate_markdown(report_pf)
        self.assertIn("Treatment Type", md)
        self.assertNotIn("NICE Guideline", md)

    def test_markdown_safety_warnings(self) -> None:
        # Add a safety warning
        report = self.generator.generate_report(
            patient_id="PT-001",
            protocols=[{
                "modality": "TMS",
                "protocol_name": "rTMS Test",
                "parameters": {"montage": "F3"},
            }],
            patient_profile={
                "age": 45,
                "sex": "female",
                "diagnosis": "MDD",
                "contraindications": ["pacemaker"],
            },
            report_format="full",
        )
        md = self.generator.generate_markdown(report)
        self.assertIn("Safety", md)


# ---------------------------------------------------------------------------
# Test: generate_json
# ---------------------------------------------------------------------------


class TestGenerateJson(unittest.TestCase):
    """Tests for JSON serialization."""

    def setUp(self) -> None:
        self.generator = ProtocolReportGenerator()
        self.report = self.generator.generate_report(
            patient_id="PT-001",
            protocols=SAMPLE_PROTOCOLS,
            patient_profile=SAMPLE_PATIENT_PROFILE,
            report_format="full",
        )

    def test_json_is_valid(self) -> None:
        json_str = self.generator.generate_json(self.report)
        parsed = json.loads(json_str)
        self.assertIn("report_id", parsed)

    def test_json_pretty_printed(self) -> None:
        json_str = self.generator.generate_json(self.report, indent=2)
        self.assertIn("\n", json_str)

    def test_json_minimal(self) -> None:
        json_str = self.generator.generate_json(self.report, indent=0)
        self.assertNotIn("\n  ", json_str)

    def test_json_roundtrip(self) -> None:
        json_str = self.generator.generate_json(self.report)
        parsed = json.loads(json_str)
        self.assertEqual(parsed["patient"]["id"], "PT-001")
        self.assertEqual(len(parsed["recommended_protocols"]), 2)

    def test_convenience_function(self) -> None:
        json_str = generate_json(self.report)
        parsed = json.loads(json_str)
        self.assertEqual(parsed["format"], "full")


# ---------------------------------------------------------------------------
# Test: generate_clinical_note (SOAP)
# ---------------------------------------------------------------------------


class TestGenerateClinicalNote(unittest.TestCase):
    """Tests for SOAP-format clinical note generation."""

    def setUp(self) -> None:
        self.generator = ProtocolReportGenerator()
        self.report = self.generator.generate_report(
            patient_id="PT-001",
            protocols=SAMPLE_PROTOCOLS,
            patient_profile=SAMPLE_PATIENT_PROFILE,
            report_format="full",
        )

    def test_soap_not_empty(self) -> None:
        note = self.generator.generate_clinical_note(self.report)
        self.assertGreater(len(note), 200)

    def test_soap_contains_sections(self) -> None:
        note = self.generator.generate_clinical_note(self.report)
        self.assertIn("S — SUBJECTIVE", note)
        self.assertIn("O — OBJECTIVE", note)
        self.assertIn("A — ASSESSMENT", note)
        self.assertIn("P — PLAN", note)

    def test_soap_contains_patient_id(self) -> None:
        note = self.generator.generate_clinical_note(self.report)
        self.assertIn("PT-001", note)

    def test_soap_contains_plan(self) -> None:
        note = self.generator.generate_clinical_note(self.report)
        self.assertIn("Initiate", note)
        self.assertIn("Follow-up", note)

    def test_soap_contains_safety_warnings(self) -> None:
        note = self.generator.generate_clinical_note(self.report)
        # Our default patient has no warnings, but the disclaimer should be there
        self.assertIn("DISCLAIMER", note)

    def test_soap_with_safety_warnings(self) -> None:
        report = self.generator.generate_report(
            patient_id="PT-001",
            protocols=[{
                "modality": "TMS",
                "protocol_name": "rTMS Left DLPFC",
                "parameters": {"montage": "F3"},
            }],
            patient_profile={
                "age": 45,
                "sex": "female",
                "diagnosis": "MDD",
                "contraindications": ["pacemaker"],
                "medications": ["bupropion"],
            },
            report_format="full",
        )
        note = self.generator.generate_clinical_note(report)
        self.assertIn("SAFETY ACTIONS", note)

    def test_convenience_function(self) -> None:
        note = generate_clinical_note(self.report)
        self.assertIn("S — SUBJECTIVE", note)


# ---------------------------------------------------------------------------
# Test: Safety warnings
# ---------------------------------------------------------------------------


class TestSafetyWarnings(unittest.TestCase):
    """Tests for safety warning generation."""

    def setUp(self) -> None:
        self.generator = ProtocolReportGenerator()

    def test_no_warnings_for_clean_patient(self) -> None:
        report = self.generator.generate_report(
            patient_id="PT-001",
            protocols=[SAMPLE_PROTOCOLS[0]],
            patient_profile=SAMPLE_PATIENT_PROFILE,
            report_format="full",
        )
        self.assertEqual(len(report["safety_warnings"]), 0)

    def test_pacemaker_warning(self) -> None:
        profile = copy.deepcopy(SAMPLE_PATIENT_PROFILE)
        profile["contraindications"] = ["pacemaker"]
        report = self.generator.generate_report(
            patient_id="PT-001",
            protocols=[{
                "modality": "TMS",
                "protocol_name": "rTMS Test",
                "parameters": {"montage": "F3"},
            }],
            patient_profile=profile,
            report_format="full",
        )
        levels = [w["level"] for w in report["safety_warnings"]]
        self.assertIn("contraindicated", levels)

    def test_cochlear_implant_warning(self) -> None:
        profile = copy.deepcopy(SAMPLE_PATIENT_PROFILE)
        profile["contraindications"] = ["cochlear implant"]
        report = self.generator.generate_report(
            patient_id="PT-001",
            protocols=[{
                "modality": "TMS",
                "protocol_name": "rTMS Test",
                "parameters": {"montage": "F3"},
            }],
            patient_profile=profile,
            report_format="full",
        )
        levels = [w["level"] for w in report["safety_warnings"]]
        self.assertIn("contraindicated", levels)

    def test_seizure_history_with_tms(self) -> None:
        profile = copy.deepcopy(SAMPLE_PATIENT_PROFILE)
        profile["contraindications"] = ["history of seizures"]
        report = self.generator.generate_report(
            patient_id="PT-001",
            protocols=[{
                "modality": "TMS",
                "protocol_name": "rTMS Left DLPFC",
                "parameters": {"montage": "F3"},
            }],
            patient_profile=profile,
            report_format="full",
        )
        levels = [w["level"] for w in report["safety_warnings"]]
        self.assertIn("high", levels)

    def test_seizure_threshold_medication(self) -> None:
        profile = copy.deepcopy(SAMPLE_PATIENT_PROFILE)
        profile["medications"] = ["bupropion 150mg"]
        report = self.generator.generate_report(
            patient_id="PT-001",
            protocols=[SAMPLE_PROTOCOLS[0]],
            patient_profile=profile,
            report_format="full",
        )
        messages = [w["message"] for w in report["safety_warnings"]]
        self.assertTrue(any("bupropion" in m.lower() for m in messages))

    def test_tramadol_warning(self) -> None:
        profile = copy.deepcopy(SAMPLE_PATIENT_PROFILE)
        profile["medications"] = ["tramadol 50mg"]
        report = self.generator.generate_report(
            patient_id="PT-001",
            protocols=[SAMPLE_PROTOCOLS[0]],
            patient_profile=profile,
            report_format="full",
        )
        messages = [w["message"] for w in report["safety_warnings"]]
        self.assertTrue(any("tramadol" in m.lower() for m in messages))

    def test_pediatric_warning(self) -> None:
        profile = copy.deepcopy(SAMPLE_PATIENT_PROFILE)
        profile["age"] = 14
        report = self.generator.generate_report(
            patient_id="PT-PED-001",
            protocols=[SAMPLE_PROTOCOLS[0]],
            patient_profile=profile,
            report_format="full",
        )
        levels = [w["level"] for w in report["safety_warnings"]]
        self.assertIn("moderate", levels)

    def test_young_child_high_risk(self) -> None:
        profile = copy.deepcopy(SAMPLE_PATIENT_PROFILE)
        profile["age"] = 8
        report = self.generator.generate_report(
            patient_id="PT-PED-002",
            protocols=[SAMPLE_PROTOCOLS[0]],
            patient_profile=profile,
            report_format="full",
        )
        levels = [w["level"] for w in report["safety_warnings"]]
        self.assertIn("high", levels)

    def test_geriatric_warning(self) -> None:
        profile = copy.deepcopy(SAMPLE_PATIENT_PROFILE)
        profile["age"] = 80
        report = self.generator.generate_report(
            patient_id="PT-GER-001",
            protocols=[SAMPLE_PROTOCOLS[0]],
            patient_profile=profile,
            report_format="full",
        )
        levels = [w["level"] for w in report["safety_warnings"]]
        self.assertIn("low", levels)

    def test_pregnancy_warning(self) -> None:
        profile = copy.deepcopy(SAMPLE_PATIENT_PROFILE)
        profile["special_population"] = "pregnant"
        report = self.generator.generate_report(
            patient_id="PT-001",
            protocols=[SAMPLE_PROTOCOLS[0]],
            patient_profile=profile,
            report_format="full",
        )
        levels = [w["level"] for w in report["safety_warnings"]]
        self.assertIn("moderate", levels)


# ---------------------------------------------------------------------------
# Test: Evidence inference
# ---------------------------------------------------------------------------


class TestEvidenceInference(unittest.TestCase):
    """Tests for evidence key inference."""

    def setUp(self) -> None:
        self.generator = ProtocolReportGenerator()

    def test_tdcs_depression_inference(self) -> None:
        key = self.generator._infer_evidence_key("tDCS", "tDCS F3-F4 for Depression", "major_depressive_disorder")
        self.assertEqual(key, "tDCS_F3_F4_depression")

    def test_rtms_depression_inference(self) -> None:
        key = self.generator._infer_evidence_key("TMS", "rTMS Left DLPFC for MDD", "major_depressive_disorder")
        self.assertEqual(key, "rtms_ldlpc_depression")

    def test_rtms_bilateral_inference(self) -> None:
        key = self.generator._infer_evidence_key("TMS", "rTMS Bilateral DLPFC", "major_depressive_disorder")
        self.assertEqual(key, "rtms_rdlpc_mdd_bilateral")

    def test_pbm_inference(self) -> None:
        key = self.generator._infer_evidence_key("PBM", "PBM for Depression", "MDD")
        self.assertEqual(key, "pbm_default")

    def test_neurofeedback_inference(self) -> None:
        key = self.generator._infer_evidence_key("Neurofeedback", "Alpha-Theta NF", "MDD")
        self.assertEqual(key, "neurofeedback_default")

    def test_unknown_fallback(self) -> None:
        key = self.generator._infer_evidence_key("Unknown", "Unknown Protocol", "unknown_diagnosis")
        # Falls back to first matching or default
        self.assertIn(key, self.generator._evidence_db)


# ---------------------------------------------------------------------------
# Test: Contraindication checking
# ---------------------------------------------------------------------------


class TestContraindicationChecking(unittest.TestCase):
    """Tests for contraindication checking."""

    def setUp(self) -> None:
        self.generator = ProtocolReportGenerator()

    def test_no_contraindications(self) -> None:
        profile = PatientProfile(
            patient_id="PT-001", age=45, sex="female", diagnosis="MDD",
            contraindications=[],
        )
        result = self.generator._check_contraindications("tDCS", profile)
        self.assertIn("None identified", result)

    def test_matching_contraindication(self) -> None:
        profile = PatientProfile(
            patient_id="PT-001", age=45, sex="female", diagnosis="MDD",
            contraindications=["pacemaker"],
        )
        result = self.generator._check_contraindications("TMS", profile)
        self.assertIn("ALERT", result)
        self.assertIn("pacemaker", result)

    def test_tdcs_contraindications_list(self) -> None:
        profile = PatientProfile(
            patient_id="PT-001", age=45, sex="female", diagnosis="MDD",
            contraindications=[],
        )
        result = self.generator._check_contraindications("tDCS", profile)
        self.assertIn("clinical verification", result)


# ---------------------------------------------------------------------------
# Test: Summary slide
# ---------------------------------------------------------------------------


class TestSummarySlide(unittest.TestCase):
    """Tests for executive summary slide generation."""

    def setUp(self) -> None:
        self.generator = ProtocolReportGenerator()
        self.report = self.generator.generate_report(
            patient_id="PT-001",
            protocols=SAMPLE_PROTOCOLS,
            patient_profile=SAMPLE_PATIENT_PROFILE,
            report_format="full",
        )

    def test_slide_not_empty(self) -> None:
        slide = self.generator.generate_summary_slide(self.report)
        self.assertGreater(len(slide), 50)

    def test_slide_contains_patient_info(self) -> None:
        slide = self.generator.generate_summary_slide(self.report)
        self.assertIn("PT-001", slide)
        self.assertIn("45y", slide)

    def test_slide_contains_top_recommendation(self) -> None:
        slide = self.generator.generate_summary_slide(self.report)
        self.assertIn("Top Recommendation", slide)

    def test_slide_table_format(self) -> None:
        slide = self.generator.generate_summary_slide(self.report)
        self.assertIn("| Field | Value |", slide)

    def test_slide_empty_protocols(self) -> None:
        report = self.generator.generate_report(
            patient_id="PT-001",
            protocols=[],
            patient_profile=SAMPLE_PATIENT_PROFILE,
            report_format="full",
        )
        slide = self.generator.generate_summary_slide(report)
        self.assertIn("PT-001", slide)


# ---------------------------------------------------------------------------
# Test: Edge cases and error handling
# ---------------------------------------------------------------------------


class TestEdgeCases(unittest.TestCase):
    """Tests for edge cases and error handling."""

    def setUp(self) -> None:
        self.generator = ProtocolReportGenerator()

    def test_empty_protocol_name(self) -> None:
        report = self.generator.generate_report(
            patient_id="PT-001",
            protocols=[{
                "modality": "tDCS",
                "protocol_name": "",
                "parameters": {"montage": "F3"},
            }],
            patient_profile=SAMPLE_PATIENT_PROFILE,
            report_format="full",
        )
        self.assertEqual(len(report["recommended_protocols"]), 1)

    def test_protocol_without_evidence_key(self) -> None:
        report = self.generator.generate_report(
            patient_id="PT-001",
            protocols=[{
                "modality": "tDCS",
                "protocol_name": "tDCS for Depression",
                "parameters": {"montage": "Anode F3, Cathode F4"},
                # No evidence_key — should infer from modality + diagnosis
            }],
            patient_profile=SAMPLE_PATIENT_PROFILE,
            report_format="full",
        )
        proto = report["recommended_protocols"][0]
        self.assertIn("RCTs", proto["evidence_summary"])

    def test_unknown_modality(self) -> None:
        report = self.generator.generate_report(
            patient_id="PT-001",
            protocols=[{
                "modality": "UnknownModality",
                "protocol_name": "Test Protocol",
                "parameters": {"montage": "X"},
            }],
            patient_profile=SAMPLE_PATIENT_PROFILE,
            report_format="full",
        )
        self.assertEqual(len(report["recommended_protocols"]), 1)

    def test_very_long_protocol_list(self) -> None:
        many_protocols = [
            {
                "modality": "tDCS",
                "protocol_name": f"tDCS Protocol {i}",
                "parameters": {"montage": "F3"},
            }
            for i in range(20)
        ]
        report = self.generator.generate_report(
            patient_id="PT-001",
            protocols=many_protocols,
            patient_profile=SAMPLE_PATIENT_PROFILE,
            report_format="full",
        )
        self.assertEqual(len(report["recommended_protocols"]), 20)

    def test_unicode_in_diagnosis(self) -> None:
        report = self.generator.generate_report(
            patient_id="PT-001",
            protocols=SAMPLE_PROTOCOLS,
            patient_profile={
                "age": 45,
                "sex": "female",
                "diagnosis": "dépression_majeure",
            },
            report_format="full",
        )
        self.assertIn("dépression_majeure", report["patient"]["diagnosis"])

    def test_zero_cost(self) -> None:
        cost_str = self.generator._format_cost(0)
        self.assertEqual(cost_str, "Cost not estimated")

    def test_none_cost(self) -> None:
        cost_str = self.generator._format_cost(None)
        self.assertEqual(cost_str, "Cost not estimated")

    def test_high_cost(self) -> None:
        cost_str = self.generator._format_cost(15000)
        self.assertEqual(cost_str, "$15,000 USD")

    def test_simplify_text_empty(self) -> None:
        result = self.generator._simplify_text("")
        self.assertEqual(result, "")

    def test_simplify_text_none(self) -> None:
        result = self.generator._simplify_text(None)
        self.assertIsNone(result)

    def test_format_evidence_no_rcts(self) -> None:
        result = self.generator._format_evidence({"rct_count": 0, "effect_size": 0})
        self.assertEqual(result, "Evidence from clinical consensus")

    def test_json_serialization_error(self) -> None:
        # Create a report with a non-serializable object
        report = self.generator.generate_report(
            patient_id="PT-001",
            protocols=SAMPLE_PROTOCOLS,
            patient_profile=SAMPLE_PATIENT_PROFILE,
            report_format="full",
        )
        # This should work since we use default=str
        json_str = self.generator.generate_json(report)
        self.assertIsInstance(json_str, str)


# ---------------------------------------------------------------------------
# Test: Module-level convenience functions
# ---------------------------------------------------------------------------


class TestConvenienceFunctions(unittest.TestCase):
    """Tests for module-level convenience functions."""

    def test_generate_report_function(self) -> None:
        report = generate_report(
            patient_id="PT-001",
            protocols=SAMPLE_PROTOCOLS,
            patient_profile=SAMPLE_PATIENT_PROFILE,
            report_format="full",
        )
        self.assertIn("report_id", report)

    def test_generate_markdown_function(self) -> None:
        report = generate_report(
            patient_id="PT-001",
            protocols=SAMPLE_PROTOCOLS,
            patient_profile=SAMPLE_PATIENT_PROFILE,
        )
        md = generate_markdown(report)
        self.assertIn("# Neuromodulation Protocol Report", md)

    def test_generate_json_function(self) -> None:
        report = generate_report(
            patient_id="PT-001",
            protocols=SAMPLE_PROTOCOLS,
            patient_profile=SAMPLE_PATIENT_PROFILE,
        )
        json_str = generate_json(report)
        parsed = json.loads(json_str)
        self.assertEqual(parsed["format"], "full")

    def test_generate_clinical_note_function(self) -> None:
        report = generate_report(
            patient_id="PT-001",
            protocols=SAMPLE_PROTOCOLS,
            patient_profile=SAMPLE_PATIENT_PROFILE,
        )
        note = generate_clinical_note(report)
        self.assertIn("S — SUBJECTIVE", note)


# ---------------------------------------------------------------------------
# Test: Data models
# ---------------------------------------------------------------------------


class TestDataModels(unittest.TestCase):
    """Tests for internal data models."""

    def test_safety_warning_to_dict(self) -> None:
        w = SafetyWarning(
            level=RiskLevel.HIGH,
            message="Test warning",
            source="test",
            action_required="Do something",
        )
        d = w.to_dict()
        self.assertEqual(d["level"], "high")
        self.assertEqual(d["message"], "Test warning")
        self.assertEqual(d["action_required"], "Do something")

    def test_safety_warning_no_action(self) -> None:
        w = SafetyWarning(
            level=RiskLevel.LOW,
            message="Info only",
        )
        d = w.to_dict()
        self.assertNotIn("action_required", d)

    def test_protocol_recommendation_to_dict(self) -> None:
        rec = ProtocolRecommendation(
            rank=1,
            modality="tDCS",
            protocol_name="Test",
            parameters=StimulationParameters(montage="F3"),
        )
        d = rec.to_dict()
        self.assertEqual(d["rank"], 1)
        self.assertEqual(d["modality"], "tDCS")

    def test_evidence_grade_values(self) -> None:
        self.assertEqual(EvidenceGrade.A.value, "Grade A (Meta-analysis of RCTs)")
        self.assertEqual(EvidenceGrade.D.value, "Grade D (Expert opinion / Case series)")

    def test_risk_level_values(self) -> None:
        self.assertEqual(RiskLevel.NONE.value, "none")
        self.assertEqual(RiskLevel.CONTRAINDICATED.value, "contraindicated")


# ---------------------------------------------------------------------------
# Test: Evidence database completeness
# ---------------------------------------------------------------------------


class TestEvidenceDatabase(unittest.TestCase):
    """Tests verifying the evidence database content."""

    def test_all_entries_have_required_fields(self) -> None:
        required = {"rct_count", "effect_size", "p_value", "grade", "key_refs",
                    "predicted_response", "response_confidence", "cost_estimate_usd",
                    "safety_summary"}
        for key, entry in EVIDENCE_DATABASE.items():
            missing = required - set(entry.keys())
            self.assertEqual(missing, set(), f"Entry '{key}' missing: {missing}")

    def test_evidence_grades_are_valid(self) -> None:
        for key, entry in EVIDENCE_DATABASE.items():
            self.assertIsInstance(entry["grade"], EvidenceGrade)

    def test_response_confidence_in_range(self) -> None:
        for key, entry in EVIDENCE_DATABASE.items():
            self.assertGreaterEqual(entry["response_confidence"], 0.0)
            self.assertLessEqual(entry["response_confidence"], 1.0)

    def test_rct_counts_non_negative(self) -> None:
        for key, entry in EVIDENCE_DATABASE.items():
            self.assertGreaterEqual(entry["rct_count"], 0)


# ---------------------------------------------------------------------------
# Test: Contraindications database completeness
# ---------------------------------------------------------------------------


class TestContraindicationsDatabase(unittest.TestCase):
    """Tests verifying the contraindications database content."""

    def test_has_all_modalities(self) -> None:
        for modality in ["tDCS", "TMS", "PBM", "Neurofeedback"]:
            self.assertIn(modality, CONTRAINDICATIONS_DB)

    def test_all_entries_are_lists(self) -> None:
        for modality, contras in CONTRAINDICATIONS_DB.items():
            self.assertIsInstance(contras, list)
            self.assertGreater(len(contras), 0)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def run_tests() -> int:
    """Run all tests and return exit code."""
    loader = unittest.TestLoader()
    suite = unittest.TestSuite()

    # Add all test classes
    test_classes = [
        TestPatientProfile,
        TestStimulationParameters,
        TestGenerateReport,
        TestGenerateMarkdown,
        TestGenerateJson,
        TestGenerateClinicalNote,
        TestSafetyWarnings,
        TestEvidenceInference,
        TestContraindicationChecking,
        TestSummarySlide,
        TestEdgeCases,
        TestConvenienceFunctions,
        TestDataModels,
        TestEvidenceDatabase,
        TestContraindicationsDatabase,
    ]

    for test_class in test_classes:
        tests = loader.loadTestsFromTestCase(test_class)
        suite.addTests(tests)

    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)

    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    sys.exit(run_tests())
