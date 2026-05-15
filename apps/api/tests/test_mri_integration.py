"""Phase 4 Integration Tests — Weeks 13-16.

Tests for:
- Multimodal fusion (mri_multimodal_fusion.py)
- Structured report generator (mri_report_generator.py)
- Compliance dashboard (mri_compliance.py)
- Router endpoint wiring (mri_analysis_router.py Phase 4 endpoints)

Decision-support only. All correlations are temporal associations, not causal proof.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any
from unittest.mock import MagicMock, patch

import pytest


def pytest_module():
    """Return pytest module for skip calls in methods that import at test time."""
    return pytest


# ═══════════════════════════════════════════════════════════════════════════
# Fixtures
# ═══════════════════════════════════════════════════════════════════════════


@pytest.fixture
def sample_mri_data() -> dict[str, Any]:
    """Sample MRI structural data for fusion tests."""
    return {
        "structural": {
            "dlpfc_left": -1.5,
            "dlpfc_right": -0.8,
            "hippocampus_left": -2.1,
            "hippocampus_right": -1.9,
            "amygdala_left": 0.3,
            "amygdala_right": 0.5,
            "anterior_cingulate": -1.2,
            "cortex": -0.5,
        }
    }


@pytest.fixture
def sample_qeeg_data() -> dict[str, Any]:
    """Sample qEEG marker data for fusion tests."""
    return {
        "dlpfc_left": 1.4,
        "dlpfc_right": 0.7,
        "hippocampus_left": 2.0,
        "hippocampus_right": 1.8,
        "amygdala_left": -0.2,
        "amygdala_right": -0.4,
        "anterior_cingulate": 1.1,
        "cortex": 0.4,
    }


@pytest.fixture
def sample_biomarker_data() -> dict[str, Any]:
    """Sample biomarker data for fusion tests."""
    return {
        "hippocampal_volume": 3.2,
        "cortical_thickness": 2.1,
        "white_matter_volume": 1.8,
    }


@pytest.fixture
def sample_findings() -> list[dict[str, Any]]:
    """Sample AI findings for report tests."""
    return [
        {
            "region": "dlpfc_left",
            "status": "below_threshold",
            "z_score": -1.5,
            "note": "Reduced cortical thickness",
        },
        {
            "region": "hippocampus_left",
            "status": "significantly_below",
            "z_score": -2.1,
            "note": "Hippocampal atrophy detected",
        },
    ]


@pytest.fixture
def sample_safety_cockpit() -> dict[str, Any]:
    """Sample safety cockpit data for report tests."""
    return {
        "overall_status": "warning",
        "red_flags": [
            {"code": "HIPPOCAMPAL_ATROPHY", "message": "Hippocampal volume below 2 SD", "severity": "high", "resolved": False},
        ],
        "warnings": [
            {"code": "DLPFC_THINNING", "message": "DLPFC cortical thickness reduced", "severity": "medium"},
        ],
    }


@pytest.fixture
def mock_analysis_row() -> MagicMock:
    """Create a mock MriAnalysis row for compliance tests."""
    row = MagicMock()
    row.analysis_id = str(uuid.uuid4())
    row.patient_id = str(uuid.uuid4())
    row.report_state = "MRI_APPROVED"
    row.signed_by = "clinician_001"
    row.signed_at = datetime.now(timezone.utc) - timedelta(hours=12)
    row.created_at = datetime.now(timezone.utc) - timedelta(days=2)
    row.reviewed_at = datetime.now(timezone.utc) - timedelta(hours=20)
    row.red_flags_json = None
    return row


@pytest.fixture
def mock_draft_analysis() -> MagicMock:
    """Create a mock draft analysis row for compliance alert tests."""
    row = MagicMock()
    row.analysis_id = str(uuid.uuid4())
    row.patient_id = str(uuid.uuid4())
    row.report_state = "MRI_DRAFT_AI"
    row.signed_by = None
    row.signed_at = None
    row.created_at = datetime.now(timezone.utc) - timedelta(hours=48)
    row.reviewed_at = None
    row.red_flags_json = None
    return row


# ═══════════════════════════════════════════════════════════════════════════
# Week 13: Multimodal Fusion Tests
# ═══════════════════════════════════════════════════════════════════════════


class TestMultimodalFusion:
    """Tests for mri_multimodal_fusion service."""

    def test_fuse_mri_with_qeeg_domain(self, sample_mri_data, sample_qeeg_data):
        """Test MRI-qEEG fusion produces correlation signals."""
        from app.services.mri_multimodal_fusion import fuse_mri_with_domain

        result = fuse_mri_with_domain(sample_mri_data, sample_qeeg_data, "qeeg")

        assert "error" not in result
        assert result["domain"] == "qeeg"
        assert result["count"] > 0
        assert len(result["correlations"]) > 0
        assert "safety_note" in result
        assert "temporal associations" in result["safety_note"]

        # Check correlation structure
        first = result["correlations"][0]
        assert "region" in first
        assert "mri_z_score" in first
        assert "eeg_marker" in first
        assert "correlation" in first
        assert "confidence" in first
        assert first["confidence"] in ("low", "moderate", "high")

    def test_fuse_mri_with_biomarkers_domain(self, sample_mri_data, sample_biomarker_data):
        """Test MRI-biomarker fusion produces correlations."""
        from app.services.mri_multimodal_fusion import fuse_mri_with_domain

        result = fuse_mri_with_domain(sample_mri_data, sample_biomarker_data, "biomarkers")

        assert "error" not in result
        assert result["domain"] == "biomarkers"
        assert result["count"] >= 0
        assert "safety_note" in result

    def test_fuse_mri_with_unknown_domain_returns_error(self, sample_mri_data):
        """Test unknown domain returns error, not exception."""
        from app.services.mri_multimodal_fusion import fuse_mri_with_domain

        result = fuse_mri_with_domain(sample_mri_data, {}, "nonexistent_domain")

        assert "error" in result
        assert "nonexistent_domain" in result["error"]

    def test_fuse_mri_with_all_valid_domains(self, sample_mri_data):
        """Test that all valid domains are accepted."""
        from app.services.mri_multimodal_fusion import fuse_mri_with_domain, FUSION_DOMAINS

        for domain in FUSION_DOMAINS:
            result = fuse_mri_with_domain(sample_mri_data, {"test": 1.0}, domain)
            assert "error" not in result, f"Domain {domain} should not error"
            assert result["domain"] == domain

    def test_correlation_estimate_is_bounded(self):
        """Test correlation estimates are in [-1, 1]."""
        from app.services.mri_multimodal_fusion import _estimate_correlation

        test_cases = [
            (0.0, 0.0),
            (1.0, 1.0),
            (-1.0, 1.0),
            (2.5, -1.5),
            (-2.5, -1.5),
            (0.5, 0.5),
            (100.0, 100.0),
        ]
        for a, b in test_cases:
            corr = _estimate_correlation(a, b)
            assert -1.0 <= corr <= 1.0, f"Correlation {corr} out of bounds for ({a}, {b})"

    def test_fusion_safety_note_always_present(self, sample_mri_data):
        """Test every fusion result includes safety framing."""
        from app.services.mri_multimodal_fusion import fuse_mri_with_domain, FUSION_DOMAINS

        for domain in FUSION_DOMAINS:
            result = fuse_mri_with_domain(sample_mri_data, {}, domain)
            assert "safety_note" in result
            assert "clinician review" in result["safety_note"].lower()

    def test_fuse_mri_with_assessments_domain(self, sample_mri_data):
        """Test MRI-assessments fusion."""
        from app.services.mri_multimodal_fusion import fuse_mri_with_domain

        assessments = {"mmse_score": 28.0, "moca_score": 26.0}
        result = fuse_mri_with_domain(sample_mri_data, assessments, "assessments")

        assert "error" not in result
        assert result["domain"] == "assessments"
        # Should find correlations between cognitive scores and brain regions
        assert result["count"] >= 0

    def test_fuse_mri_with_medications_domain(self, sample_mri_data):
        """Test MRI-medications fusion."""
        from app.services.mri_multimodal_fusion import fuse_mri_with_domain

        medications = {
            "lithium": {"known_effect_regions": ["hippocampus_left", "amygdala_left"]},
        }
        result = fuse_mri_with_domain(sample_mri_data, medications, "medications")

        assert "error" not in result
        assert result["domain"] == "medications"

    def test_confidence_band_mapping(self):
        """Test confidence band thresholds."""
        from app.services.mri_multimodal_fusion import _confidence_band

        assert _confidence_band(0.1) == "low"
        assert _confidence_band(0.29) == "low"
        assert _confidence_band(0.3) == "moderate"
        assert _confidence_band(0.5) == "moderate"
        assert _confidence_band(0.69) == "moderate"
        assert _confidence_band(0.7) == "high"
        assert _confidence_band(0.9) == "high"
        assert _confidence_band(0.0) == "low"


# ═══════════════════════════════════════════════════════════════════════════
# Week 14: Structured Report Generator Tests
# ═══════════════════════════════════════════════════════════════════════════


class TestReportGenerator:
    """Tests for mri_report_generator service."""

    def test_generate_structured_report_basic(self, sample_findings, sample_safety_cockpit):
        """Test structured report generation with minimal inputs."""
        from app.services.mri_report_generator import generate_structured_report

        report = generate_structured_report(
            analysis_id="test-analysis-001",
            patient_id="patient-001",
            age=45,
            sex="F",
            condition="mdd",
            modality="T1w",
            scan_date=datetime.now(timezone.utc),
            biomarkers={"total_count": 10, "abnormal_count": 2},
            findings=sample_findings,
            safety_cockpit=sample_safety_cockpit,
        )

        assert report["header"]["schema_version"] == "0.4.0"
        assert report["header"]["report_state"] == "MRI_DRAFT_AI"
        assert report["patient_info"]["patient_id"] == "patient-001"
        assert report["patient_info"]["age"] == 45
        assert report["scan_info"]["analysis_id"] == "test-analysis-001"
        assert len(report["ai_findings"]) == 2
        assert len(report["limitations"]) >= 4
        assert report["footer"]["signature_required"] is True
        assert report["footer"]["radiology_review_required"] is True
        assert "generated_at" in report["header"]

    def test_generate_patient_friendly_summary(self, sample_findings, sample_safety_cockpit):
        """Test patient-friendly summary generation."""
        from app.services.mri_report_generator import (
            generate_structured_report,
            generate_patient_friendly_summary,
        )

        report = generate_structured_report(
            analysis_id="test-analysis-002",
            patient_id="patient-002",
            age=55,
            sex="M",
            condition="ptsd",
            modality="T1w",
            scan_date=datetime.now(timezone.utc),
            biomarkers={"total_count": 8, "abnormal_count": 1},
            findings=sample_findings,
            safety_cockpit=sample_safety_cockpit,
        )

        summary = generate_patient_friendly_summary(report)

        assert "MRI Scan Summary" in summary
        assert "NOT a diagnosis" in summary
        assert "Your doctor will review" in summary
        assert "Next Steps:" in summary
        assert summary.count("- ") >= 3  # bullet points

    def test_patient_friendly_summary_no_abnormalities(self):
        """Test summary when no abnormalities found."""
        from app.services.mri_report_generator import (
            generate_structured_report,
            generate_patient_friendly_summary,
        )

        report = generate_structured_report(
            analysis_id="test-analysis-003",
            patient_id="patient-003",
            age=30,
            sex="F",
            condition=None,
            modality="T1w",
            scan_date=None,
            biomarkers={"total_count": 10, "abnormal_count": 0},
            findings=[],
            safety_cockpit={"overall_status": "normal"},
        )

        summary = generate_patient_friendly_summary(report)
        assert "No significant abnormalities" in summary

    def test_report_disclaimer_present(self, sample_findings, sample_safety_cockpit):
        """Test report header contains mandatory disclaimer."""
        from app.services.mri_report_generator import generate_structured_report

        report = generate_structured_report(
            analysis_id="test-analysis-004",
            patient_id="patient-004",
            age=60,
            sex="M",
            condition="alzheimers",
            modality="FLAIR",
            scan_date=datetime.now(timezone.utc),
            biomarkers={},
            findings=sample_findings,
            safety_cockpit=sample_safety_cockpit,
        )

        assert "disclaimer" in report["header"]
        assert "decision support" in report["header"]["disclaimer"].lower()

    def test_generate_fhir_diagnostic_report(self, sample_findings, sample_safety_cockpit):
        """Test FHIR R4 DiagnosticReport generation."""
        from app.services.mri_report_generator import (
            generate_structured_report,
            generate_fhir_diagnostic_report,
        )

        report = generate_structured_report(
            analysis_id="test-analysis-005",
            patient_id="patient-005",
            age=40,
            sex="F",
            condition="mdd",
            modality="T1w",
            scan_date=datetime(2026, 1, 15, 10, 0, 0, tzinfo=timezone.utc),
            biomarkers={},
            findings=sample_findings,
            safety_cockpit=sample_safety_cockpit,
        )

        fhir = generate_fhir_diagnostic_report(report, "Patient/patient-005")

        assert fhir["resourceType"] == "DiagnosticReport"
        assert fhir["status"] == "preliminary"
        assert fhir["subject"]["reference"] == "Patient/patient-005"
        assert "conclusion" in fhir
        assert "category" in fhir
        assert "code" in fhir
        assert fhir["identifier"][0]["value"] == "test-analysis-005"

    def test_report_comparison(self, sample_findings, sample_safety_cockpit):
        """Test baseline vs followup report comparison."""
        from app.services.mri_report_generator import (
            generate_structured_report,
            generate_report_comparison,
        )

        baseline = generate_structured_report(
            analysis_id="baseline-001",
            patient_id="patient-006",
            age=50,
            sex="M",
            condition="mdd",
            modality="T1w",
            scan_date=datetime(2026, 1, 1, tzinfo=timezone.utc),
            biomarkers={"regions": {"dlpfc_left": {"z_score": -1.5}, "hippocampus_left": {"z_score": -2.0}}},
            findings=sample_findings[:1],
            safety_cockpit=sample_safety_cockpit,
        )

        followup = generate_structured_report(
            analysis_id="followup-001",
            patient_id="patient-006",
            age=50,
            sex="M",
            condition="mdd",
            modality="T1w",
            scan_date=datetime(2026, 4, 1, tzinfo=timezone.utc),
            biomarkers={"regions": {"dlpfc_left": {"z_score": -1.2}, "hippocampus_left": {"z_score": -1.8}}},
            findings=sample_findings[:1],
            safety_cockpit=sample_safety_cockpit,
        )

        comparison = generate_report_comparison(baseline, followup)

        assert "baseline_analysis_id" in comparison
        assert "followup_analysis_id" in comparison
        assert "biomarker_changes" in comparison
        assert "safety_note" in comparison
        assert "overall_assessment" in comparison
        assert "temporal" in comparison["safety_note"].lower() or "decision support" in comparison["safety_note"].lower()


# ═══════════════════════════════════════════════════════════════════════════
# Week 15: Compliance Dashboard Tests
# ═══════════════════════════════════════════════════════════════════════════


class TestComplianceDashboard:
    """Tests for mri_compliance service."""

    def test_compute_compliance_metrics_basic(self, mock_analysis_row):
        """Test basic compliance metrics computation."""
        from app.services.mri_compliance import compute_compliance_metrics

        result = compute_compliance_metrics(
            analyses=[mock_analysis_row],
            clinic_id="clinic-001",
            days=30,
        )

        assert "error" not in result
        assert result["clinic_id"] == "clinic-001"
        assert result["total_analyses"] == 1
        assert result["approved"] == 1
        assert result["approval_rate"] == 1.0
        assert result["signed"] == 1
        assert result["sign_rate"] == 1.0
        assert result["compliance_score"] == 100.0
        assert "avg_turnaround_hours" in result
        assert "fda_510k_metrics" in result

    def test_compute_compliance_empty_analyses(self):
        """Test compliance with no analyses."""
        from app.services.mri_compliance import compute_compliance_metrics

        result = compute_compliance_metrics(
            analyses=[],
            clinic_id="clinic-002",
            days=30,
        )

        assert "error" in result
        assert result["total_analyses"] == 0

    def test_compliance_alerts_overdue_review(self, mock_draft_analysis):
        """Test overdue review alert generation."""
        from app.services.mri_compliance import compute_compliance_metrics

        result = compute_compliance_metrics(
            analyses=[mock_draft_analysis],
            clinic_id="clinic-003",
            days=30,
        )

        alerts = result.get("alerts", [])
        overdue_alerts = [a for a in alerts if a["type"] == "overdue_review"]
        assert len(overdue_alerts) >= 1
        assert overdue_alerts[0]["severity"] in ("medium", "high")
        assert "48" in overdue_alerts[0]["message"] or "hours" in overdue_alerts[0]["message"]

    def test_compliance_alerts_approved_not_signed(self):
        """Test alert for approved but not signed analysis."""
        from app.services.mri_compliance import compute_compliance_metrics

        row = MagicMock()
        row.analysis_id = "test-007"
        row.patient_id = "patient-007"
        row.report_state = "MRI_APPROVED"
        row.signed_by = None
        row.signed_at = None
        row.created_at = datetime.now(timezone.utc) - timedelta(days=1)
        row.reviewed_at = datetime.now(timezone.utc) - timedelta(hours=12)
        row.red_flags_json = None

        result = compute_compliance_metrics(
            analyses=[row],
            clinic_id="clinic-004",
            days=30,
        )

        alerts = result.get("alerts", [])
        unsigned_alerts = [a for a in alerts if a["type"] == "approved_not_signed"]
        assert len(unsigned_alerts) == 1
        assert unsigned_alerts[0]["severity"] == "high"

    def test_compliance_score_calculation(self):
        """Test compliance score is 0-100 and weighted correctly."""
        from app.services.mri_compliance import compute_compliance_metrics

        # Perfect: all approved and signed
        row = MagicMock()
        row.analysis_id = "test-008"
        row.patient_id = "patient-008"
        row.report_state = "MRI_APPROVED_SIGNED"
        row.signed_by = "clinician"
        row.signed_at = datetime.now(timezone.utc) - timedelta(hours=1)
        row.created_at = datetime.now(timezone.utc) - timedelta(days=1)
        row.reviewed_at = datetime.now(timezone.utc) - timedelta(hours=2)
        row.red_flags_json = None

        result = compute_compliance_metrics(
            analyses=[row],
            clinic_id="clinic-005",
            days=30,
        )

        assert 0.0 <= result["compliance_score"] <= 100.0
        assert result["compliance_score"] == 100.0

    def test_compliance_trend_computation(self, mock_analysis_row):
        """Test trend computation in compliance metrics."""
        from app.services.mri_compliance import compute_compliance_metrics

        # Create analyses on different days
        rows = []
        for i in range(5):
            row = MagicMock()
            row.analysis_id = f"test-trend-{i}"
            row.patient_id = f"patient-trend-{i}"
            row.report_state = "MRI_APPROVED_SIGNED"
            row.signed_by = "clinician"
            row.signed_at = datetime.now(timezone.utc) - timedelta(hours=i)
            row.created_at = datetime.now(timezone.utc) - timedelta(days=i, hours=2)
            row.reviewed_at = datetime.now(timezone.utc) - timedelta(days=i, hours=1)
            row.red_flags_json = None
            rows.append(row)

        result = compute_compliance_metrics(
            analyses=rows,
            clinic_id="clinic-006",
            days=30,
        )

        assert "trend" in result
        assert "direction" in result["trend"]
        assert result["trend"]["direction"] in ("up", "down", "flat")

    def test_generate_regulatory_export(self, mock_analysis_row):
        """Test FDA 510(k) regulatory export generation."""
        from app.services.mri_compliance import (
            compute_compliance_metrics,
            generate_regulatory_export,
        )

        metrics = compute_compliance_metrics(
            analyses=[mock_analysis_row],
            clinic_id="clinic-007",
            days=30,
        )

        clinic_info = {
            "clinic_id": "clinic-007",
            "clinic_name": "Test Neuro Clinic",
            "software_version": "0.4.0",
        }

        export = generate_regulatory_export(metrics, clinic_info)

        assert export["report_type"] == "FDA_510K_QUALITY_METRICS"
        assert export["software_version"] == "0.4.0"
        assert export["clinic"]["name"] == "Test Neuro Clinic"
        assert "metrics" in export
        assert "quality_indicators" in export
        assert export["quality_indicators"]["clinical_review_required"] is True
        assert export["quality_indicators"]["digital_sign_off"] is True
        assert "disclaimer" in export

    def test_fda_metrics_percentiles(self, mock_analysis_row):
        """Test FDA turnaround time percentiles."""
        from app.services.mri_compliance import compute_compliance_metrics

        result = compute_compliance_metrics(
            analyses=[mock_analysis_row],
            clinic_id="clinic-008",
            days=30,
        )

        fda = result.get("fda_510k_metrics", {})
        assert "turnaround_p50_hours" in fda
        assert "turnaround_p90_hours" in fda
        assert "turnaround_p95_hours" in fda
        assert "state_distribution" in fda

    def test_alerts_sorted_by_severity(self):
        """Test alerts are sorted with highest severity first."""
        from app.services.mri_compliance import compute_compliance_metrics

        rows = []
        # Create a draft analysis (medium/high overdue alert)
        draft = MagicMock()
        draft.analysis_id = "test-sort-1"
        draft.patient_id = "patient-sort-1"
        draft.report_state = "MRI_DRAFT_AI"
        draft.signed_by = None
        draft.signed_at = None
        draft.created_at = datetime.now(timezone.utc) - timedelta(hours=30)
        draft.reviewed_at = None
        draft.red_flags_json = None
        rows.append(draft)

        # Create approved unsigned (high severity)
        approved = MagicMock()
        approved.analysis_id = "test-sort-2"
        approved.patient_id = "patient-sort-2"
        approved.report_state = "MRI_APPROVED"
        approved.signed_by = None
        approved.signed_at = None
        approved.created_at = datetime.now(timezone.utc) - timedelta(hours=10)
        approved.reviewed_at = datetime.now(timezone.utc) - timedelta(hours=5)
        approved.red_flags_json = None
        rows.append(approved)

        result = compute_compliance_metrics(
            analyses=rows,
            clinic_id="clinic-009",
            days=30,
        )

        alerts = result.get("alerts", [])
        severities = [a["severity"] for a in alerts]
        # Critical/high should come before medium
        if len(severities) >= 2:
            severity_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
            for i in range(len(severities) - 1):
                assert severity_order[severities[i]] <= severity_order[severities[i + 1]]


# ═══════════════════════════════════════════════════════════════════════════
# Safety Framing Tests
# ═══════════════════════════════════════════════════════════════════════════


class TestSafetyFraming:
    """Cross-cutting safety framing tests for all Phase 4 services."""

    def test_all_fusion_correlations_include_interpretation(self, sample_mri_data, sample_qeeg_data):
        """Test every correlation has association-not-causal interpretation."""
        from app.services.mri_multimodal_fusion import fuse_mri_with_domain

        result = fuse_mri_with_domain(sample_mri_data, sample_qeeg_data, "qeeg")

        for corr in result["correlations"]:
            assert "interpretation" in corr
            assert "association" in corr["interpretation"].lower()

    def test_report_limitations_mandatory(self, sample_findings, sample_safety_cockpit):
        """Test report always includes mandatory limitations."""
        from app.services.mri_report_generator import generate_structured_report

        report = generate_structured_report(
            analysis_id="test-safety-001",
            patient_id="patient-s-001",
            age=35,
            sex="F",
            condition="mdd",
            modality="T1w",
            scan_date=datetime.now(timezone.utc),
            biomarkers={},
            findings=sample_findings,
            safety_cockpit=sample_safety_cockpit,
        )

        limitations = report["limitations"]
        assert any("decision support" in lim.lower() for lim in limitations)
        assert any("radiologist" in lim.lower() or "clinician review" in lim.lower() for lim in limitations)
        assert any("temporal associations" in lim.lower() for lim in limitations)

    def test_compliance_safety_note_present(self, mock_analysis_row):
        """Test compliance export includes safety disclaimer."""
        from app.services.mri_compliance import (
            compute_compliance_metrics,
            generate_regulatory_export,
        )

        metrics = compute_compliance_metrics(
            analyses=[mock_analysis_row],
            clinic_id="clinic-safety",
            days=30,
        )

        export = generate_regulatory_export(metrics, {"clinic_id": "c", "clinic_name": "N", "software_version": "0.4.0"})
        assert "disclaimer" in export
        assert "quality officer" in export["disclaimer"].lower() or "regulatory" in export["disclaimer"].lower()


# ═══════════════════════════════════════════════════════════════════════════
# Router Endpoint Tests (integration with mocked dependencies)
# ═══════════════════════════════════════════════════════════════════════════


class TestRouterPhase4Endpoints:
    """Integration tests for Phase 4 router endpoints."""

    @pytest.fixture
    def mock_db_session(self):
        """Create a mock DB session."""
        session = MagicMock()
        session.query.return_value.filter_by.return_value.first.return_value = None
        session.query.return_value.filter.return_value.all.return_value = []
        session.commit.return_value = None
        return session

    @pytest.fixture
    def mock_analysis(self):
        """Create a mock MriAnalysis with all Phase 4 attributes."""
        analysis = MagicMock()
        analysis.analysis_id = str(uuid.uuid4())
        analysis.patient_id = str(uuid.uuid4())
        analysis.age = 45
        analysis.sex = "F"
        analysis.condition = "mdd"
        analysis.created_at = datetime.now(timezone.utc)
        analysis.structural_json = json.dumps({
            "dlpfc_left": {"z_score": -1.5},
            "hippocampus_left": {"z_score": -2.1},
        })
        analysis.stim_targets_json = None
        analysis.safety_cockpit_json = json.dumps({"overall_status": "warning"})
        analysis.patient_facing_report_json = None
        analysis.report_state = "MRI_DRAFT_AI"
        return analysis

    def test_multimodal_fusion_service_import(self):
        """Test multimodal fusion service imports cleanly."""
        from app.services.mri_multimodal_fusion import (
            FUSION_DOMAINS,
            fuse_mri_with_domain,
            _estimate_correlation,
        )
        assert len(FUSION_DOMAINS) == 6
        assert callable(fuse_mri_with_domain)
        assert callable(_estimate_correlation)

    def test_report_generator_service_import(self):
        """Test report generator service imports cleanly."""
        from app.services.mri_report_generator import (
            REPORT_TEMPLATE,
            generate_structured_report,
            generate_patient_friendly_summary,
            generate_fhir_diagnostic_report,
            generate_report_comparison,
        )
        assert isinstance(REPORT_TEMPLATE, dict)
        assert callable(generate_structured_report)
        assert callable(generate_patient_friendly_summary)
        assert callable(generate_fhir_diagnostic_report)
        assert callable(generate_report_comparison)

    def test_compliance_service_import(self):
        """Test compliance service imports cleanly."""
        from app.services.mri_compliance import (
            compute_compliance_metrics,
            generate_regulatory_export,
        )
        assert callable(compute_compliance_metrics)
        assert callable(generate_regulatory_export)

    def test_fusion_endpoint_response_model(self):
        """Test fusion endpoint response model structure."""
        pytest = pytest_module()
        try:
            from app.routers.mri_analysis_router import _MultimodalFusionOut
        except ImportError:
            pytest.skip("Router dependencies (sqlalchemy) not available")

        # Instantiate with sample data
        out = _MultimodalFusionOut(
            domain="qeeg",
            correlations=[{"region": "dlpfc_left", "correlation": 0.5}],
            count=1,
            safety_note="Test note",
        )
        assert out.domain == "qeeg"
        assert out.count == 1
        assert out.error is None

    def test_generate_report_endpoint_response_model(self):
        """Test generate report endpoint response model structure."""
        pytest = pytest_module()
        try:
            from app.routers.mri_analysis_router import _GenerateReportOut
        except ImportError:
            pytest.skip("Router dependencies (sqlalchemy) not available")

        out = _GenerateReportOut(
            header={"title": "Test", "schema_version": "0.4.0"},
            patient_info={"patient_id": "p1"},
            scan_info={"analysis_id": "a1"},
            safety_cockpit={"status": "ok"},
            biomarkers={},
            ai_findings=[],
            target_plans=[],
            evidence_links=[],
            limitations=["Test limitation"],
            footer={"signature_required": True},
            patient_friendly_summary="Test summary",
        )
        assert out.header["schema_version"] == "0.4.0"
        assert out.patient_friendly_summary == "Test summary"

    def test_compliance_endpoint_response_model(self):
        """Test compliance endpoint response model structure."""
        pytest = pytest_module()
        try:
            from app.routers.mri_analysis_router import _ComplianceOut
        except ImportError:
            pytest.skip("Router dependencies (sqlalchemy) not available")

        out = _ComplianceOut(
            clinic_id="clinic-001",
            period_days=30,
            total_analyses=10,
            approved=8,
            approval_rate=0.8,
            signed=7,
            sign_rate=0.7,
            with_red_flags=2,
            red_flag_rate=0.2,
            avg_turnaround_hours=24.5,
            avg_review_time_hours=18.0,
            avg_daily_volume=2.5,
            compliance_score=76.0,
        )
        assert out.compliance_score == 76.0
        assert out.total_analyses == 10

    def test_cognitive_region_links_coverage(self):
        """Test cognitive region links cover known assessments."""
        from app.services.mri_multimodal_fusion import _cognitive_region_links

        known_assessments = ["mmse", "moca", "ravlt", "wais", "stroop", "trail_making", "verbal_fluency", "digit_span"]
        for assessment in known_assessments:
            regions = _cognitive_region_links(assessment)
            assert len(regions) > 0, f"Assessment {assessment} should return regions"
            assert all(isinstance(r, str) for r in regions)

    def test_risk_region_links_coverage(self):
        """Test risk region links cover known risk factors."""
        from app.services.mri_multimodal_fusion import _risk_region_links

        known_risks = ["apoe4", "tau", "amyloid", "neuroinflammation", "vascular_risk", "depression_history", "tbi_history"]
        for risk in known_risks:
            regions = _risk_region_links(risk)
            assert len(regions) > 0, f"Risk factor {risk} should return regions"
            assert all(isinstance(r, str) for r in regions)
