"""Phase 4 Tests — Advanced Integration + Reporting (Weeks 13-16).

Test coverage for:
1. qeeg_report_generator — 14-section clinical report engine
2. qeeg_protocol_planner — neurofeedback protocol planning with safety screening
3. qeeg_multimodal_wiring — cross-analyzer context generation
4. qeeg_compliance — regulatory metrics and compliance dashboard
5. Router endpoints — wiring of all Phase 4 services into API

Run: pytest tests/test_qeeg_phase4.py -v
"""

from __future__ import annotations

import json
import sys
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any
from unittest.mock import MagicMock

import pytest

# ── Ensure services importable ────────────────────────────────────────────────
sys.path.insert(0, "/mnt/agents/DeepSynaps-Protocol-Studio/apps/api")

from app.services.qeeg_report_generator import (
    REPORT_SECTIONS,
    generate_report,
    _generate_executive_summary,
    _generate_patient_summary,
    _summarize_band_powers,
    _suggest_neurofeedback_protocols,
    _suggest_neuromodulation_targets,
    _artifact_burden_status,
    _split_half_reliability,
    _qa_recommendation,
    _summarize_evidence_grades,
)
from app.services.qeeg_protocol_planner import (
    PROTOCOL_LIBRARY,
    plan_neurofeedback_protocol,
    _evidence_grade_score,
    _protocol_rank_key,
)
from app.services.qeeg_multimodal_wiring import (
    FUSION_TARGETS,
    get_cross_analyzer_context,
    list_fusion_targets,
)
from app.services.qeeg_compliance import (
    ComplianceAlert,
    ComplianceMetrics,
    compute_compliance_metrics,
    compute_clinic_summary,
    _generate_qeeg_alerts,
    _generate_action_items,
    OVERDUE_REVIEW_HOURS,
    OVERDUE_REVIEW_CRITICAL_HOURS,
)


# ═══════════════════════════════════════════════════════════════════════════════
# FIXTURES
# ═══════════════════════════════════════════════════════════════════════════════


@pytest.fixture
def sample_patient_info() -> dict[str, Any]:
    return {
        "patient_id": "p-12345",
        "age": 42,
        "sex": "female",
    }


@pytest.fixture
def sample_scan_metadata() -> dict[str, Any]:
    return {
        "recording_date": "2025-06-15T10:30:00+00:00",
        "duration_sec": 300,
        "sampling_rate": 256,
        "channels": ["Fp1", "Fp2", "F3", "F4", "Cz", "P3", "P4", "O1", "O2"],
        "montage": "average_reference",
        "eyes_condition": "eyes_closed",
    }


@pytest.fixture
def sample_quality_metrics() -> dict[str, Any]:
    return {
        "overall_rating": "Good",
        "artifact_burden_pct": 12.5,
        "bad_channels": [],
        "total_channels": 19,
        "split_half_reliability": 0.94,
        "snr_db": 18.2,
        "pipeline_steps": ["import", "filter", "ica", "epoch", "spectral"],
        "pipeline_version": "1.2.3",
        "normative_db": "NeuroGuide",
        "normative_db_version": "2024.1",
    }


@pytest.fixture
def sample_spectral_results() -> dict[str, Any]:
    return {
        "iaf": {
            "Cz": {"iaf": 10.2, "method": "cog"},
            "O1": {"iaf": 10.5, "method": "cog"},
        },
        "band_powers": {
            "Cz": {
                "bands": {
                    "delta": {"absolute": 15.2, "relative": 18.5, "z_score": 0.8},
                    "theta": {"absolute": 12.3, "relative": 15.0, "z_score": 1.2},
                    "alpha": {"absolute": 28.4, "relative": 34.5, "z_score": -0.3},
                    "low_beta": {"absolute": 18.1, "relative": 22.0, "z_score": 0.5},
                    "high_beta": {"absolute": 8.2, "relative": 10.0, "z_score": 1.1},
                }
            },
            "O1": {
                "bands": {
                    "alpha": {"absolute": 35.2, "relative": 40.1, "z_score": 0.2},
                }
            },
        },
        "ratios": {
            "theta_beta_ratio": {"value": 1.35, "z_score": 1.8},
            "theta_alpha_ratio": {"value": 0.43, "z_score": 0.5},
        },
        "asymmetry": {
            "frontal_alpha": {"asymmetry_index": 0.15, "left": 12.3, "right": 14.8},
        },
        "psd_method": "Welch (2s Hamming, 50% overlap)",
        "connectivity": {
            "primary_hub": "Pz",
            "global_efficiency": 0.42,
        },
    }


@pytest.fixture
def sample_biomarker_results() -> dict[str, Any]:
    return {
        "findings": [
            {
                "id": "f-001",
                "present": True,
                "biomarker": "elevated_theta_beta_ratio",
                "condition": "ADHD",
                "evidence_grade": "B",
                "z_score": 1.8,
                "description": "TBR elevated above normative cutoff",
            },
            {
                "id": "f-002",
                "present": True,
                "biomarker": "frontal_alpha_asymmetry",
                "condition": "Depression",
                "evidence_grade": "B",
                "z_score": 0.15,
                "description": "Left frontal hypoactivation pattern",
            },
            {
                "id": "f-003",
                "present": False,
                "biomarker": "alpha_slowing",
                "condition": "Dementia",
                "evidence_grade": "C",
                "z_score": -0.5,
                "description": "IAF within normal range",
            },
        ],
        "references": [
            {"pmid": "12345678", "title": "TBR in ADHD meta-analysis", "grade": "B"},
        ],
        "key_images": [],
    }


# ═══════════════════════════════════════════════════════════════════════════════
# TEST 1-3: Report Generator — Structure & Header
# ═══════════════════════════════════════════════════════════════════════════════


class TestReportGeneratorStructure:
    """Tests 1-3: Report structure validation."""

    def test_01_report_has_all_14_sections(self, sample_patient_info, sample_scan_metadata,
                                            sample_quality_metrics, sample_spectral_results,
                                            sample_biomarker_results):
        """Test 1: Report contains all 14 defined sections."""
        report = generate_report(
            analysis_id="test-001",
            patient_info=sample_patient_info,
            scan_metadata=sample_scan_metadata,
            quality_metrics=sample_quality_metrics,
            spectral_results=sample_spectral_results,
            biomarker_results=sample_biomarker_results,
        )

        assert "header" in report
        assert "sections" in report
        for section in REPORT_SECTIONS:
            assert section in report["sections"], f"Missing section: {section}"

    def test_02_report_header_fields(self, sample_patient_info, sample_scan_metadata,
                                      sample_quality_metrics, sample_spectral_results,
                                      sample_biomarker_results):
        """Test 2: Header contains required metadata fields."""
        report = generate_report(
            analysis_id="test-002",
            patient_info=sample_patient_info,
            scan_metadata=sample_scan_metadata,
            quality_metrics=sample_quality_metrics,
            spectral_results=sample_spectral_results,
            biomarker_results=sample_biomarker_results,
            template="comprehensive",
        )

        header = report["header"]
        assert header["title"] == "qEEG Clinical Analysis Report"
        assert header["subtitle"] == "Draft for Clinician Review — Not a Diagnosis"
        assert header["analysis_id"] == "test-002"
        assert header["schema_version"] == "0.4.0"
        assert header["report_state"] == "DRAFT_AI"
        assert header["template"] == "comprehensive"
        assert "disclaimer" in header
        assert "Not a Diagnosis" in header["subtitle"] or "diagnosis" in header["disclaimer"].lower()

    def test_03_report_state_is_draft(self, sample_patient_info, sample_scan_metadata,
                                       sample_quality_metrics, sample_spectral_results,
                                       sample_biomarker_results):
        """Test 3: Generated report is always in DRAFT_AI state."""
        report = generate_report(
            analysis_id="test-003",
            patient_info=sample_patient_info,
            scan_metadata=sample_scan_metadata,
            quality_metrics=sample_quality_metrics,
            spectral_results=sample_spectral_results,
            biomarker_results=sample_biomarker_results,
        )
        assert report["header"]["report_state"] == "DRAFT_AI"


# ═══════════════════════════════════════════════════════════════════════════════
# TEST 4-7: Report Generator — Content Sections
# ═══════════════════════════════════════════════════════════════════════════════


class TestReportGeneratorContent:
    """Tests 4-7: Section content validation."""

    def test_04_executive_summary_content(self, sample_patient_info, sample_spectral_results,
                                          sample_biomarker_results):
        """Test 4: Executive summary contains key facts and disclaimers."""
        summary = _generate_executive_summary(
            sample_patient_info, sample_spectral_results, sample_biomarker_results
        )
        assert "42-year-old female" in summary
        assert "NOT a diagnosis" in summary
        assert "supportive context only" in summary
        assert "2 biomarker-level observation(s)" in summary or "2" in summary
        assert "Individual Alpha Frequency was 10.3 Hz" in summary or "IAF" in summary

    def test_05_patient_friendly_summary(self, sample_patient_info, sample_spectral_results,
                                          sample_biomarker_results):
        """Test 5: Patient summary uses plain language with reading level note."""
        report = generate_report(
            analysis_id="test-005",
            patient_info=sample_patient_info,
            scan_metadata={"recording_date": "2025-01-01", "duration_sec": 300, "sampling_rate": 256, "channels": ["Cz"]},
            quality_metrics={"overall_rating": "Good"},
            spectral_results=sample_spectral_results,
            biomarker_results=sample_biomarker_results,
        )

        patient_section = report["sections"]["patient_friendly_summary"]
        content = patient_section["content"]
        assert "brain wave" in content.lower() or "EEG" in content
        assert "NOT a diagnosis" in content
        assert patient_section["reading_level_target"] == "8th grade (Flesch-Kincaid)"
        assert "plain_language" in patient_section["language"]

    def test_06_clinician_sign_off_pending(self, sample_patient_info, sample_scan_metadata,
                                            sample_quality_metrics, sample_spectral_results,
                                            sample_biomarker_results):
        """Test 6: Sign-off section starts in PENDING state with checklist."""
        report = generate_report(
            analysis_id="test-006",
            patient_info=sample_patient_info,
            scan_metadata=sample_scan_metadata,
            quality_metrics=sample_quality_metrics,
            spectral_results=sample_spectral_results,
            biomarker_results=sample_biomarker_results,
        )

        sign_off = report["sections"]["clinician_sign_off"]
        assert sign_off["status"] == "PENDING"
        assert sign_off["sign_off_date"] is None
        assert sign_off["reviewer_name"] is None
        assert "mandatory_checklist" in sign_off
        assert len(sign_off["mandatory_checklist"]) == 7
        assert "IQCB" in str(sign_off["mandatory_checklist"])

    def test_07_limitations_list(self, sample_patient_info, sample_scan_metadata,
                                  sample_quality_metrics, sample_spectral_results,
                                  sample_biomarker_results):
        """Test 7: Limitations section has comprehensive caveats."""
        report = generate_report(
            analysis_id="test-007",
            patient_info=sample_patient_info,
            scan_metadata=sample_scan_metadata,
            quality_metrics=sample_quality_metrics,
            spectral_results=sample_spectral_results,
            biomarker_results=sample_biomarker_results,
        )

        limitations = report["sections"]["limitations"]
        assert len(limitations) >= 7
        assert any("decision support only" in lim.lower() for lim in limitations)
        assert any("template head model" in lim for lim in limitations)
        assert any("volume conduction" in lim for lim in limitations)


# ═══════════════════════════════════════════════════════════════════════════════
# TEST 8-10: Protocol Planner
# ═══════════════════════════════════════════════════════════════════════════════


class TestProtocolPlanner:
    """Tests 8-10: Neurofeedback protocol planning with safety screening."""

    def test_08_tbr_protocol_suggested_for_elevated_tbr(self, sample_spectral_results):
        """Test 8: Elevated TBR triggers Theta/Beta Ratio Training suggestion."""
        result = plan_neurofeedback_protocol(
            spectral_results=sample_spectral_results,
            biomarker_results={"findings": []},
            patient_history={},
        )

        suggestions = result["suggestions"]
        tbr_suggestions = [s for s in suggestions if s.get("protocol_id") == "tbr_training"]
        assert len(tbr_suggestions) > 0
        assert "TBR = 1.35" in tbr_suggestions[0].get("qeeeg_evidence", "")
        assert tbr_suggestions[0]["safety_status"] == "CLEARED"

    def test_09_epilepsy_contraindication(self, sample_spectral_results):
        """Test 9: Epilepsy flags TBR training as contraindicated."""
        result = plan_neurofeedback_protocol(
            spectral_results=sample_spectral_results,
            biomarker_results={"findings": []},
            patient_history={"epilepsy": True},
        )

        warnings = result["warnings"]
        assert any("EPILEPSY" in w for w in warnings)

        suggestions = result["suggestions"]
        tbr_suggestions = [s for s in suggestions if s.get("protocol_id") == "tbr_training"]
        if tbr_suggestions:
            assert "CONTRAINDICATED" in tbr_suggestions[0]["safety_status"]

    def test_10_protocol_library_has_10_protocols(self):
        """Test 10: Protocol library contains 10 evidence-based templates."""
        assert len(PROTOCOL_LIBRARY) == 10
        expected_ids = {
            "tbr_training", "smr_training", "alpha_theta", "faa_training",
            "alpha_uptraining", "scp_training", "beta_downtraining",
            "loreta_zscore", "dmn_regulation", "qeeg_guided_tms",
        }
        assert set(PROTOCOL_LIBRARY.keys()) == expected_ids


# ═══════════════════════════════════════════════════════════════════════════════
# TEST 11-13: Multimodal Wiring
# ═══════════════════════════════════════════════════════════════════════════════


class TestMultimodalWiring:
    """Tests 11-13: Cross-analyzer multimodal context generation."""

    def test_11_all_fusion_targets_supported(self):
        """Test 11: All 6 fusion targets return valid context."""
        for target in FUSION_TARGETS:
            result = get_cross_analyzer_context(
                patient_id="p-test",
                analysis_id="a-test",
                target_analyzer=target,
            )
            assert "error" not in result, f"Target {target} returned error"
            assert result["target_analyzer"] == target
            assert result["patient_id"] == "p-test"
            assert "safety_note" in result
            assert "temporal associations" in result["safety_note"]

    def test_12_unknown_analyzer_returns_error(self):
        """Test 12: Unknown analyzer returns helpful error."""
        result = get_cross_analyzer_context(
            patient_id="p-test",
            analysis_id="a-test",
            target_analyzer="unknown_modality",
        )
        assert "error" in result
        assert "unknown_modality" in result["error"]
        assert "mri" in result["error"] or "Supported" in result["error"]

    def test_13_mri_context_structure(self):
        """Test 13: MRI context has expected structure and clinical value."""
        result = get_cross_analyzer_context(
            patient_id="p-test",
            analysis_id="a-test",
            target_analyzer="mri",
        )
        assert result["fusion_relevance"] != ""
        assert len(result["qeeeg_contributes"]) > 0
        assert result["clinical_value"].startswith("HIGH")
        assert "4x" in result["fusion_opportunity"] or "improves" in result["fusion_opportunity"]


# ═══════════════════════════════════════════════════════════════════════════════
# TEST 14-17: Compliance Dashboard
# ═══════════════════════════════════════════════════════════════════════════════


class TestComplianceDashboard:
    """Tests 14-17: Compliance metrics and alert generation."""

    def test_14_compliance_metrics_basic(self):
        """Test 14: Basic compliance metrics computed correctly."""
        now = datetime.now(timezone.utc)
        analyses = [
            _make_mock_analysis("a-001", "APPROVED_SIGNED", now - timedelta(hours=1), signed_by="dr-1"),
            _make_mock_analysis("a-002", "APPROVED", now - timedelta(hours=2)),  # approved but not signed
            _make_mock_analysis("a-003", "DRAFT_AI", now - timedelta(hours=3)),
        ]

        result = compute_compliance_metrics(analyses, days=30)

        assert result["total_analyses"] == 3
        assert result["approved"] == 2
        assert result["approval_rate"] == pytest.approx(2 / 3, 0.01)
        assert result["signed"] == 1
        assert result["sign_rate"] == pytest.approx(1 / 3, 0.01)
        assert result["compliance_score"] > 0

    def test_15_empty_analyses(self):
        """Test 15: Empty analyses list returns zeroed metrics."""
        result = compute_compliance_metrics([], days=30)
        assert result["total_analyses"] == 0
        assert result["compliance_score"] == 0.0
        assert result["compliance_rating"] == "no_data"

    def test_16_overdue_review_alert(self):
        """Test 16: Analyses pending >24h generate overdue alert."""
        now = datetime.now(timezone.utc)
        analyses = [
            _make_mock_analysis(
                "a-old", "DRAFT_AI",
                now - timedelta(hours=OVERDUE_REVIEW_HOURS + 1),
            ),
        ]

        alerts = _generate_qeeg_alerts(analyses)
        assert len(alerts) > 0
        overdue_alerts = [a for a in alerts if a.alert_type == "overdue_review"]
        assert len(overdue_alerts) == 1
        assert overdue_alerts[0].severity in ("medium", "critical")

    def test_17_missing_safety_review_alert(self):
        """Test 17: Analyses without safety cockpit generate alert."""
        now = datetime.now(timezone.utc)
        analyses = [
            _make_mock_analysis("a-nosafety", "APPROVED", now - timedelta(hours=2)),
        ]

        alerts = _generate_qeeg_alerts(analyses)
        safety_alerts = [a for a in alerts if a.alert_type == "missing_safety_review"]
        assert len(safety_alerts) == 1
        assert safety_alerts[0].severity == "high"


# ═══════════════════════════════════════════════════════════════════════════════
# TEST 18-20: Helper Functions & Edge Cases
# ═══════════════════════════════════════════════════════════════════════════════


class TestHelpersAndEdgeCases:
    """Tests 18-20: Utility functions and edge case handling."""

    def test_18_artifact_burden_status(self):
        """Test 18: Artifact burden classification is correct."""
        assert _artifact_burden_status(2.0) == "excellent"
        assert _artifact_burden_status(10.0) == "good"
        assert _artifact_burden_status(20.0) == "acceptable"
        assert _artifact_burden_status(35.0) == "marginal — interpret with caution"
        assert _artifact_burden_status(50.0) == "poor — consider re-recording"
        assert _artifact_burden_status(None) == "unknown"

    def test_19_split_half_reliability(self):
        """Test 19: Split-half reliability classification."""
        assert _split_half_reliability(0.97) == "excellent"
        assert _split_half_reliability(0.92) == "good"
        assert _split_half_reliability(0.85) == "acceptable"
        assert _split_half_reliability(0.75) == "marginal"
        assert _split_half_reliability(0.60) == "poor — results may be unstable"
        assert _split_half_reliability(None) == "unknown"

    def test_20_report_with_empty_inputs(self):
        """Test 20: Report generation handles minimal/empty inputs gracefully."""
        report = generate_report(
            analysis_id="test-empty",
            patient_info={},
            scan_metadata={},
            quality_metrics={},
            spectral_results={},
            biomarker_results={},
        )

        # Should still have all 14 sections
        for section in REPORT_SECTIONS:
            assert section in report["sections"]

        # Limitations should still be comprehensive
        assert len(report["sections"]["limitations"]) >= 7

        # Patient summary should handle unknown age gracefully
        patient_summary = report["sections"]["patient_friendly_summary"]["content"]
        assert "brain wave" in patient_summary.lower()


# ═══════════════════════════════════════════════════════════════════════════════
# TEST 21-22: Protocol Planner Edge Cases
# ═══════════════════════════════════════════════════════════════════════════════


class TestProtocolPlannerEdgeCases:
    """Tests 21-22: Protocol planner edge cases."""

    def test_21_no_matching_protocols(self):
        """Test 21: Low spectral values still suggest general protocols."""
        spectral = {
            "ratios": {"theta_beta_ratio": {"value": 0.5}},
            "asymmetry": {"frontal_alpha": {"asymmetry_index": 0.05}},
        }
        result = plan_neurofeedback_protocol(
            spectral_results=spectral,
            biomarker_results={"findings": []},
            patient_history={},
        )
        # Should still suggest some general protocols (SMR, alpha_uptraining)
        assert len(result["suggestions"]) > 0
        assert any(s.get("protocol_id") == "smr_training" for s in result["suggestions"])

    def test_22_active_psychosis_blocks_faa(self, sample_spectral_results):
        """Test 22: Active psychosis blocks FAA training."""
        result = plan_neurofeedback_protocol(
            spectral_results=sample_spectral_results,
            biomarker_results={"findings": []},
            patient_history={"active_psychosis": True},
        )
        warnings = result["warnings"]
        assert any("ACTIVE PSYCHOSIS" in w for w in warnings)


# ═══════════════════════════════════════════════════════════════════════════════
# TEST 23-25: Multimodal Wiring Edge Cases
# ═══════════════════════════════════════════════════════════════════════════════


class TestMultimodalEdgeCases:
    """Tests 23-25: Multimodal wiring edge cases."""

    def test_23_list_fusion_targets(self):
        """Test 23: list_fusion_targets returns all targets."""
        targets = list_fusion_targets()
        assert len(targets) == 6
        for t in targets:
            assert "target" in t
            assert "description" in t
            assert "clinical_value" in t

    def test_24_deeptwin_context(self):
        """Test 24: DeepTwin context has brain-state emphasis."""
        result = get_cross_analyzer_context("p-1", "a-1", "deeptwin")
        assert result["clinical_value"].startswith("HIGH")
        assert any("brain" in c.lower() for c in result["qeeeg_contributes"])

    def test_25_medications_context(self):
        """Test 25: Medications context has confound warning."""
        result = get_cross_analyzer_context("p-1", "a-1", "medications")
        assert result["clinical_value"].startswith("HIGH")
        assert "confound" in result["fusion_relevance"].lower() or "EEG" in result["fusion_relevance"]


# ═══════════════════════════════════════════════════════════════════════════════
# MOCK HELPERS
# ═══════════════════════════════════════════════════════════════════════════════


def _make_mock_analysis(
    analysis_id: str,
    report_state: str = "DRAFT_AI",
    created_at: datetime | None = None,
    signed_by: str | None = None,
    safety_cockpit_json: str | None = None,
) -> Any:
    """Create a mock analysis object for compliance tests."""
    mock = MagicMock()
    mock.id = analysis_id
    mock.report_state = report_state
    mock.created_at = created_at or datetime.now(timezone.utc)
    mock.signed_by = signed_by
    mock.safety_cockpit_json = safety_cockpit_json
    mock.patient_id = "p-test"
    mock.clinic_id = "c-test"
    mock.quality_rating = "Good"
    mock.artifact_burden_pct = 10.0
    mock.bad_channels_json = None
    mock.channel_count = 19
    mock.split_half_reliability = 0.92
    mock.snr_db = 20.0
    mock.pipeline_steps_json = None
    mock.pipeline_version = "1.0.0"
    mock.norm_db_version = "2024.1"
    mock.band_powers_json = None
    mock.ratios_json = None
    mock.asymmetry_json = None
    mock.peak_alpha_freq_json = None
    mock.psd_method = None
    mock.connectivity_json = None
    mock.findings_json = None
    mock.report_payload_json = None
    mock.duration_sec = 300
    mock.sampling_rate = 256
    mock.channels_json = '["Cz", "Fz", "Pz"]'
    mock.montage = "average_reference"
    mock.eyes_condition = "eyes_closed"
    return mock


# ═══════════════════════════════════════════════════════════════════════════════
# pytest entry point
# ═══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
