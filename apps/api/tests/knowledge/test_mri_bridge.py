"""Tests for MRI Analyzer Bridge.

Uses mocked adapters to verify all 4 output methods:
  - structural_analysis
  - cohort_matching
  - atrophy_analysis
  - generate_mri_report
"""
from __future__ import annotations

import asyncio
import sys
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from unittest.mock import AsyncMock, MagicMock

import pytest

# Add the project root to sys.path for adapter imports
sys.path.insert(0, "/mnt/agents/output")

from phase5.mri_bridge import MRIAnalyzerBridge, _prov, _z_score, _two_tailed_p, _compute_similarity


# ── Fixtures ───────────────────────────────────────────────────────────────────


@pytest.fixture
def mock_registry_all():
    """Registry with all 13 adapters fully mocked."""
    registry = {}
    adapter_names = [
        "mni_atlas", "schaefer", "adni", "abide", "oasis", "hcp",
        "openneuro", "cobre", "corr", "ixi", "ds030", "gsp", "adhd_200",
    ]
    for name in adapter_names:
        mock = AsyncMock()
        mock.source_name = name.upper()
        mock.source_version = "2024.01"
        registry[name] = mock
    return registry


@pytest.fixture
def mock_registry_partial():
    """Registry with only a subset of adapters available."""
    registry = {}
    for name in ["mni_atlas", "adni", "oasis"]:
        mock = AsyncMock()
        mock.source_name = name.upper()
        mock.source_version = "2024.01"
        registry[name] = mock
    return registry


@pytest.fixture
def mock_registry_empty():
    """Registry with no adapters."""
    return {}


@pytest.fixture
def sample_patient_mri():
    """Sample patient MRI data for structural analysis."""
    return {
        "patient_id": "PT-001",
        "scan_type": "T1w_MPRAGE",
        "age": 78,
        "sex": "female",
        "condition": "alzheimers_disease",
        "volumes": {
            "hippocampus_left": 2.1,
            "hippocampus_right": 2.3,
            "entorhinal_cortex": 1.8,
            "amygdala_left": 1.2,
        },
    }


@pytest.fixture
def sample_baseline():
    """Sample baseline scan for longitudinal analysis."""
    return {
        "scan_date": "2023-06-01T00:00:00+00:00",
        "volumes": {
            "hippocampus_left": 2.5,
            "hippocampus_right": 2.7,
            "entorhinal_cortex": 2.2,
            "amygdala_left": 1.4,
        },
    }


# ── Helper: run async ──────────────────────────────────────────────────────────


def _run(coro):
    """Run an async coroutine in the default event loop."""
    return asyncio.run(coro)


# ── Tests for helper functions ─────────────────────────────────────────────────


def test_z_score_normal():
    assert _z_score(2.1, 3.2, 0.45) == pytest.approx(-2.444, abs=0.01)


def test_z_score_zero_std():
    assert _z_score(5.0, 5.0, 0.0) == 0.0


def test_two_tailed_p_typical():
    p = _two_tailed_p(2.0)
    assert 0.04 < p < 0.06  # ~0.0455


def test_two_tailed_p_zero():
    assert _two_tailed_p(0.0) == 1.0


def test_prov_structure():
    p = _prov(["adni"], "test", 0.85, meta={"k": "v"})
    assert p["sources"] == ["adni"]
    assert p["query"] == "test"
    assert p["confidence"] == 0.85
    assert p["confidence_tier"] == "moderate"  # 0.85 is >= 0.7 but < 0.9
    assert p["is_research_only"] is True
    assert p["bridge"] == "mri_analyzer_bridge"
    assert "metadata" in p


def test_compute_similarity_basic():
    patient = {"age": 75, "sex": "female", "diagnosis": "alzheimers_disease"}
    cohort = {
        "condition": "alzheimers_disease",
        "age_range": [55, 95],
        "age_mean": 75.2,
        "sex_ratio_male": 0.45,
    }
    sim = _compute_similarity(patient, cohort)
    assert 0.5 < sim <= 1.0


def test_compute_similarity_no_match():
    patient = {"age": 25, "sex": "male", "diagnosis": "adhd"}
    cohort = {
        "condition": "alzheimers_disease",
        "age_range": [70, 90],
        "age_mean": 80.0,
    }
    sim = _compute_similarity(patient, cohort)
    assert sim < 0.5


# ── Tests for bridge initialization ────────────────────────────────────────────


def test_bridge_init_all_adapters(mock_registry_all):
    bridge = MRIAnalyzerBridge(mock_registry_all)
    assert len(bridge._adapters) == 13
    for name in bridge._ADAPTER_KEYS:
        assert name in bridge._adapters


def test_bridge_init_partial(mock_registry_partial):
    bridge = MRIAnalyzerBridge(mock_registry_partial)
    assert len(bridge._adapters) == 3
    assert "mni_atlas" in bridge._adapters
    assert "adni" in bridge._adapters
    assert "abide" not in bridge._adapters


def test_bridge_init_empty(mock_registry_empty):
    bridge = MRIAnalyzerBridge(mock_registry_empty)
    assert len(bridge._adapters) == 0


# ── Tests for structural_analysis ──────────────────────────────────────────────


class TestStructuralAnalysis:
    """Tests for structural_analysis method with various adapter states."""

    def test_structural_analysis_full_adapters(self, mock_registry_all, sample_patient_mri):
        """Structural analysis with all adapters returning data."""
        bridge = MRIAnalyzerBridge(mock_registry_all)

        # Set up mock return values
        mock_registry_all["oasis"].get_normative_volumes.return_value = {
            "hippocampus_left": {"mean": 3.2, "std": 0.45},
            "hippocampus_right": {"mean": 3.3, "std": 0.44},
        }
        mock_registry_all["adni"].get_normative_volumes.return_value = {
            "entorhinal_cortex": {"mean": 2.9, "std": 0.50},
        }
        mock_registry_all["hcp"].get_normative_volumes.return_value = {
            "amygdala_left": {"mean": 1.45, "std": 0.22},
        }
        mock_registry_all["adni"].get_cohorts.return_value = [
            {
                "cohort_id": "ADNI_MCI_converter",
                "n_subjects": 302,
                "age_range": [55, 95],
                "age_mean": 74.8,
                "condition": "mild_cognitive_impairment",
                "time_to_conversion_median": "18 months",
            }
        ]
        mock_registry_all["oasis"].get_cohorts.return_value = [
            {
                "cohort_id": "OASIS_dementia",
                "n_subjects": 416,
                "age_range": [60, 100],
                "age_mean": 77.1,
                "condition": "alzheimers_disease",
            }
        ]
        mock_registry_all["schaefer"].get_parcellation.return_value = {
            "dominant_network": "Default",
            "deviation_map": {"region_1": 0.12},
        }
        mock_registry_all["mni_atlas"].get_region_parcellation.return_value = {
            "area_dissimilarity": 0.34,
        }
        mock_registry_all["adni"].get_progression_probability.return_value = {
            "6_month_probability": 0.45,
            "12_month_probability": 0.72,
            "confidence": 0.68,
        }

        result = _run(bridge.structural_analysis(sample_patient_mri, "alzheimers_disease"))

        assert result["patient_id"] == "PT-001"
        assert result["scan_type"] == "T1w_MPRAGE"
        assert result["condition"] == "alzheimers_disease"
        assert result["research_only"] is True
        assert "volumetric_comparison" in result
        assert "cohort_matches" in result
        assert "atlas_parcellation" in result
        assert "predicted_trajectory" in result
        assert "confidence_overall" in result
        assert "provenance" in result
        assert 0.0 < result["confidence_overall"] <= 1.0

    def test_structural_analysis_partial_adapters(self, mock_registry_partial, sample_patient_mri):
        """Structural analysis with only some adapters available."""
        bridge = MRIAnalyzerBridge(mock_registry_partial)

        mock_registry_partial["oasis"].get_normative_volumes.return_value = {
            "hippocampus_left": {"mean": 3.2, "std": 0.45},
        }
        mock_registry_partial["adni"].get_cohorts.return_value = [
            {
                "cohort_id": "ADNI_MCI_converter",
                "n_subjects": 302,
                "age_range": [55, 95],
                "age_mean": 74.8,
                "condition": "mild_cognitive_impairment",
            }
        ]

        result = _run(bridge.structural_analysis(sample_patient_mri, "alzheimers_disease"))

        assert result["patient_id"] == "PT-001"
        assert "volumetric_comparison" in result
        assert "cohort_matches" in result
        assert result["research_only"] is True
        assert result["confidence_overall"] > 0

    def test_structural_analysis_empty_registry(self, mock_registry_empty, sample_patient_mri):
        """Structural analysis falls back to embedded data when no adapters."""
        bridge = MRIAnalyzerBridge(mock_registry_empty)
        result = _run(bridge.structural_analysis(sample_patient_mri, "alzheimers_disease"))

        assert result["patient_id"] == "PT-001"
        assert "volumetric_comparison" in result
        assert "cohort_matches" in result
        assert "atlas_parcellation" in result
        assert "predicted_trajectory" in result
        assert result["research_only"] is True

    def test_structural_analysis_volumetric_values(self, mock_registry_all, sample_patient_mri):
        """Verify z-score and p-value calculations in volumetric comparison."""
        bridge = MRIAnalyzerBridge(mock_registry_all)

        mock_registry_all["adni"].get_normative_volumes.return_value = {
            "hippocampus_left": {"mean": 3.2, "std": 0.45},
        }

        result = _run(bridge.structural_analysis(sample_patient_mri, "alzheimers_disease"))
        vol = result.get("volumetric_comparison", {})

        # hippocampus_left: z = (2.1 - 3.2) / 0.45 = -2.444...
        hipl = vol.get("hippocampus_left", {})
        assert hipl.get("patient") == 2.1
        assert hipl.get("norm_mean") == 3.2
        assert hipl.get("z_score", 0) < 0  # reduced
        assert hipl.get("p_value", 1) < 0.05  # significant

    def test_structural_analysis_adapter_exception(self, mock_registry_all, sample_patient_mri):
        """Verify bridge continues when one adapter raises an exception."""
        bridge = MRIAnalyzerBridge(mock_registry_all)

        mock_registry_all["oasis"].get_normative_volumes.side_effect = Exception("OASIS timeout")
        mock_registry_all["adni"].get_normative_volumes.return_value = {
            "hippocampus_left": {"mean": 3.2, "std": 0.45},
        }
        mock_registry_all["adni"].get_cohorts.return_value = []
        mock_registry_all["oasis"].get_cohorts.side_effect = Exception("OASIS cohort error")

        result = _run(bridge.structural_analysis(sample_patient_mri, "alzheimers_disease"))

        assert result["patient_id"] == "PT-001"
        assert "volumetric_comparison" in result
        assert "cohort_matches" in result


# ── Tests for cohort_matching ──────────────────────────────────────────────────


class TestCohortMatching:
    """Tests for cohort_matching method."""

    def test_cohort_matching_full(self, mock_registry_all):
        """Cohort matching with multiple adapters returning data."""
        bridge = MRIAnalyzerBridge(mock_registry_all)

        mock_registry_all["adni"].get_cohorts.return_value = [
            {
                "cohort_id": "ADNI_MCI_converter",
                "n_subjects": 302,
                "age_range": [55, 95],
                "age_mean": 74.8,
                "condition": "mild_cognitive_impairment",
                "time_to_conversion_median": "18 months",
                "description": "ADNI MCI converter cohort",
            }
        ]
        mock_registry_all["oasis"].get_cohorts.return_value = [
            {
                "cohort_id": "OASIS_dementia",
                "n_subjects": 416,
                "age_range": [60, 100],
                "age_mean": 77.1,
                "condition": "alzheimers_disease",
                "description": "OASIS dementia cohort",
            }
        ]
        mock_registry_all["hcp"].get_cohorts.return_value = [
            {
                "cohort_id": "HCP_aging",
                "n_subjects": 724,
                "age_range": [36, 100],
                "age_mean": 58.4,
                "condition": "brain_aging",
                "description": "HCP aging reference",
            }
        ]

        features = {"age": 75, "sex": "female", "diagnosis": "alzheimers_disease"}
        result = _run(bridge.cohort_matching(features, "alzheimers_disease", top_n=3))

        assert isinstance(result, list)
        assert len(result) <= 3
        for cohort in result:
            assert "cohort" in cohort
            assert "similarity_score" in cohort
            assert 0.0 <= cohort["similarity_score"] <= 1.0
            assert "n_subjects" in cohort
            assert "source_adapters" in cohort

    def test_cohort_matching_fallback(self, mock_registry_empty):
        """Cohort matching falls back to local descriptors."""
        bridge = MRIAnalyzerBridge(mock_registry_empty)
        features = {"age": 75, "sex": "female", "diagnosis": "alzheimers_disease"}
        result = _run(bridge.cohort_matching(features, "alzheimers_disease"))

        assert isinstance(result, list)
        assert len(result) > 0
        # Should match ADNI_AD and OASIS_dementia for alzheimers
        cohort_names = [c["cohort"] for c in result]
        assert any("ADNI" in c or "OASIS" in c for c in cohort_names)

    def test_cohort_matching_no_relevant_condition(self, mock_registry_empty):
        """Cohort matching for a condition with no specific local cohorts."""
        bridge = MRIAnalyzerBridge(mock_registry_empty)
        features = {"age": 30, "sex": "male", "diagnosis": "rare_condition"}
        result = _run(bridge.cohort_matching(features, "rare_condition"))

        # Falls back to general cohorts
        assert isinstance(result, list)

    def test_cohort_matching_top_n(self, mock_registry_all):
        """Verify top_n parameter limits results."""
        bridge = MRIAnalyzerBridge(mock_registry_all)

        mock_registry_all["adni"].get_cohorts.return_value = [
            {"cohort_id": f"ADNI_cohort_{i}", "n_subjects": 100, "age_range": [50, 80], "age_mean": 65, "condition": "alzheimers_disease"}
            for i in range(10)
        ]

        features = {"age": 75, "sex": "female", "diagnosis": "alzheimers_disease"}
        result = _run(bridge.cohort_matching(features, "alzheimers_disease", top_n=3))

        assert len(result) <= 3


# ── Tests for atrophy_analysis ─────────────────────────────────────────────────


class TestAtrophyAnalysis:
    """Tests for atrophy_analysis method."""

    def test_atrophy_analysis_longitudinal(self, mock_registry_all, sample_patient_mri, sample_baseline):
        """Longitudinal atrophy analysis with baseline comparison."""
        bridge = MRIAnalyzerBridge(mock_registry_all)

        mock_registry_all["adni"].get_normative_volumes.return_value = {
            "hippocampus_left": {"mean": 3.2, "std": 0.45},
        }
        mock_registry_all["mni_atlas"].get_atrophy_reference.return_value = {
            "hippocampus_left": {"atrophy_grade": 2, "reference": "AAL3"},
        }

        result = _run(bridge.atrophy_analysis(sample_patient_mri, sample_baseline))

        assert result["patient_id"] == "PT-001"
        assert result["baseline_available"] is True
        assert "atrophy_map" in result
        assert "alerts" in result
        assert result["research_only"] is True

        # Check hippocampus atrophy calculation:
        # baseline 2.5, current 2.1 → 0.4/2.5 = 16% loss over ~0.5 years
        hipl = result["atrophy_map"].get("hippocampus_left", {})
        assert hipl.get("baseline") == 2.5
        assert hipl.get("current") == 2.1
        assert hipl.get("percent_change", 0) < 0  # atrophy

    def test_atrophy_analysis_cross_sectional(self, mock_registry_all, sample_patient_mri):
        """Cross-sectional atrophy analysis without baseline."""
        bridge = MRIAnalyzerBridge(mock_registry_all)

        mock_registry_all["adni"].get_normative_volumes.return_value = {
            "hippocampus_left": {"mean": 3.2, "std": 0.45},
            "hippocampus_right": {"mean": 3.3, "std": 0.44},
        }

        result = _run(bridge.atrophy_analysis(sample_patient_mri, None))

        assert result["baseline_available"] is False
        assert "atrophy_map" in result
        assert result["research_only"] is True

    def test_atrophy_analysis_no_volumes(self, mock_registry_all):
        """Atrophy analysis with no volume data."""
        bridge = MRIAnalyzerBridge(mock_registry_all)
        scan = {"patient_id": "PT-002", "scan_date": "2024-01-01T00:00:00+00:00"}

        result = _run(bridge.atrophy_analysis(scan, None))

        assert result["patient_id"] == "PT-002"
        assert result["regions_analyzed"] == 0
        assert "error" in result
        assert result["research_only"] is True

    def test_atrophy_analysis_empty_registry(self, mock_registry_empty, sample_patient_mri, sample_baseline):
        """Atrophy analysis with no adapters falls back to local norms."""
        bridge = MRIAnalyzerBridge(mock_registry_empty)
        result = _run(bridge.atrophy_analysis(sample_patient_mri, sample_baseline))

        assert result["patient_id"] == "PT-001"
        assert result["baseline_available"] is True
        assert "atrophy_map" in result
        assert result["research_only"] is True

    def test_atrophy_analysis_severe_alert(self, mock_registry_all):
        """Verify severe atrophy alert generation."""
        bridge = MRIAnalyzerBridge(mock_registry_all)

        current = {
            "patient_id": "PT-003",
            "scan_date": "2024-01-01T00:00:00+00:00",
            "volumes": {"hippocampus_left": 2.0},
        }
        baseline = {
            "scan_date": "2023-06-01T00:00:00+00:00",
            "volumes": {"hippocampus_left": 2.5},
        }

        result = _run(bridge.atrophy_analysis(current, baseline))

        # 2.0 → 2.5 is 20% loss over 6 months, very severe
        assert result["alert_count"] >= 1
        alerts = result["alerts"]
        assert any("atrophy" in a.get("alert_type", "") for a in alerts)

    def test_atrophy_analysis_stable_region(self, mock_registry_all):
        """Verify stable regions produce no alerts."""
        bridge = MRIAnalyzerBridge(mock_registry_all)

        current = {
            "patient_id": "PT-004",
            "scan_date": "2024-01-01T00:00:00+00:00",
            "volumes": {"hippocampus_left": 3.2},
        }
        baseline = {
            "scan_date": "2023-12-01T00:00:00+00:00",
            "volumes": {"hippocampus_left": 3.2},
        }

        result = _run(bridge.atrophy_analysis(current, baseline))

        hipl = result["atrophy_map"].get("hippocampus_left", {})
        assert hipl.get("percent_change", 1) == 0.0
        assert hipl.get("direction") == "stable"


# ── Tests for generate_mri_report ──────────────────────────────────────────────


class TestGenerateMRIReport:
    """Tests for generate_mri_report method."""

    def test_generate_mri_report_full(self, mock_registry_all, sample_patient_mri, sample_baseline):
        """Full MRI report generation."""
        bridge = MRIAnalyzerBridge(mock_registry_all)

        mock_registry_all["oasis"].get_normative_volumes.return_value = {
            "hippocampus_left": {"mean": 3.2, "std": 0.45},
            "hippocampus_right": {"mean": 3.3, "std": 0.44},
        }
        mock_registry_all["adni"].get_normative_volumes.return_value = {
            "entorhinal_cortex": {"mean": 2.9, "std": 0.50},
        }
        mock_registry_all["hcp"].get_normative_volumes.return_value = {
            "amygdala_left": {"mean": 1.45, "std": 0.22},
        }
        mock_registry_all["adni"].get_cohorts.return_value = [
            {
                "cohort_id": "ADNI_MCI_converter",
                "n_subjects": 302,
                "age_range": [55, 95],
                "age_mean": 74.8,
                "condition": "mild_cognitive_impairment",
                "time_to_conversion_median": "18 months",
            }
        ]
        mock_registry_all["schaefer"].get_parcellation.return_value = {
            "dominant_network": "Default",
            "deviation_map": {"region_1": 0.12},
        }
        mock_registry_all["mni_atlas"].get_region_parcellation.return_value = {
            "area_dissimilarity": 0.34,
        }
        mock_registry_all["adni"].get_progression_probability.return_value = {
            "6_month_probability": 0.45,
            "12_month_probability": 0.72,
            "confidence": 0.68,
        }
        mock_registry_all["mni_atlas"].get_atrophy_reference.return_value = {
            "hippocampus_left": {"atrophy_grade": 2},
        }

        patient_data = {
            "patient_id": "PT-001",
            "condition": "alzheimers_disease",
            "current_scan": sample_patient_mri,
            "baseline_scan": sample_baseline,
        }

        result = _run(bridge.generate_mri_report(patient_data))

        assert result["report_type"] == "MRI_clinical_report"
        assert result["patient_id"] == "PT-001"
        assert result["research_only"] is True
        assert "disclaimer" in result
        assert "executive_summary" in result
        assert "structural_analysis" in result
        assert "atrophy_analysis" in result
        assert "confidence_overall" in result
        assert "provenance" in result

        summary = result["executive_summary"]
        assert "summary_points" in summary
        assert "key_findings" in summary
        assert "recommendation" in summary

    def test_generate_mri_report_no_baseline(self, mock_registry_all, sample_patient_mri):
        """MRI report without baseline scan."""
        bridge = MRIAnalyzerBridge(mock_registry_all)

        mock_registry_all["oasis"].get_normative_volumes.return_value = {
            "hippocampus_left": {"mean": 3.2, "std": 0.45},
        }
        mock_registry_all["adni"].get_cohorts.return_value = []
        mock_registry_all["schaefer"].get_parcellation.return_value = {
            "dominant_network": "Default",
            "deviation_map": {},
        }
        mock_registry_all["mni_atlas"].get_region_parcellation.return_value = {
            "area_dissimilarity": 0.34,
        }

        patient_data = {
            "patient_id": "PT-001",
            "condition": "alzheimers_disease",
            "current_scan": sample_patient_mri,
        }

        result = _run(bridge.generate_mri_report(patient_data))

        assert result["patient_id"] == "PT-001"
        assert "structural_analysis" in result
        assert "atrophy_analysis" in result
        assert result["confidence_overall"] > 0

    def test_generate_mri_report_empty_registry(self, mock_registry_empty, sample_patient_mri):
        """MRI report with no adapters still produces output."""
        bridge = MRIAnalyzerBridge(mock_registry_empty)

        patient_data = {
            "patient_id": "PT-001",
            "condition": "alzheimers_disease",
            "current_scan": sample_patient_mri,
        }

        result = _run(bridge.generate_mri_report(patient_data))

        assert result["patient_id"] == "PT-001"
        assert "structural_analysis" in result
        assert "atrophy_analysis" in result
        assert result["research_only"] is True

    def test_generate_mri_report_executive_summary(self, mock_registry_all, sample_patient_mri, sample_baseline):
        """Verify executive summary content."""
        bridge = MRIAnalyzerBridge(mock_registry_all)

        mock_registry_all["oasis"].get_normative_volumes.return_value = {
            "hippocampus_left": {"mean": 3.2, "std": 0.45},
        }
        mock_registry_all["adni"].get_cohorts.return_value = [
            {
                "cohort_id": "ADNI_MCI_converter",
                "n_subjects": 302,
                "age_range": [55, 95],
                "age_mean": 74.8,
                "condition": "mild_cognitive_impairment",
                "time_to_conversion_median": "18 months",
            }
        ]
        mock_registry_all["schaefer"].get_parcellation.return_value = {
            "dominant_network": "Default",
            "deviation_map": {},
        }
        mock_registry_all["mni_atlas"].get_region_parcellation.return_value = {
            "area_dissimilarity": 0.34,
        }
        mock_registry_all["adni"].get_progression_probability.return_value = {
            "6_month_probability": 0.45,
            "12_month_probability": 0.72,
            "confidence": 0.68,
        }
        mock_registry_all["mni_atlas"].get_atrophy_reference.return_value = {}

        patient_data = {
            "patient_id": "PT-001",
            "condition": "alzheimers_disease",
            "current_scan": sample_patient_mri,
            "baseline_scan": sample_baseline,
        }

        result = _run(bridge.generate_mri_report(patient_data))
        summary = result["executive_summary"]

        assert len(summary["summary_points"]) > 0
        assert "recommendation" in summary
        # Should mention significant deviations and cohort match
        summary_text = " ".join(summary["summary_points"])
        assert any(
            word in summary_text.lower()
            for word in ["region", "deviation", "cohort", "atrophy"]
        )


# ── Integration-style tests ────────────────────────────────────────────────────


class TestIntegrationScenarios:
    """End-to-end scenario tests."""

    def test_alzheimers_workflow(self, mock_registry_all):
        """Complete Alzheimer's disease analysis workflow."""
        bridge = MRIAnalyzerBridge(mock_registry_all)

        # Simulate a typical ADNI-style patient
        patient = {
            "patient_id": "PT-AD-001",
            "scan_type": "T1w_MPRAGE",
            "age": 78,
            "sex": "female",
            "education_years": 16,
            "volumes": {
                "hippocampus_left": 2.1,
                "hippocampus_right": 2.3,
                "entorhinal_cortex": 1.8,
                "amygdala_left": 1.2,
                "amygdala_right": 1.3,
                "ventricles_lateral": 28.0,
            },
        }
        baseline = {
            "scan_date": "2023-01-01T00:00:00+00:00",
            "volumes": {
                "hippocampus_left": 2.6,
                "hippocampus_right": 2.8,
                "entorhinal_cortex": 2.3,
                "amygdala_left": 1.5,
                "amygdala_right": 1.5,
                "ventricles_lateral": 22.0,
            },
        }

        # Set up mocks
        mock_registry_all["adni"].get_normative_volumes.return_value = {
            "hippocampus_left": {"mean": 3.2, "std": 0.45},
            "hippocampus_right": {"mean": 3.3, "std": 0.44},
            "entorhinal_cortex": {"mean": 2.9, "std": 0.50},
        }
        mock_registry_all["oasis"].get_normative_volumes.return_value = {
            "amygdala_left": {"mean": 1.45, "std": 0.22},
            "amygdala_right": {"mean": 1.50, "std": 0.23},
            "ventricles_lateral": {"mean": 18.5, "std": 8.2},
        }
        mock_registry_all["adni"].get_cohorts.return_value = [
            {
                "cohort_id": "ADNI_AD",
                "n_subjects": 302,
                "age_range": [55, 95],
                "age_mean": 75.2,
                "condition": "alzheimers_disease",
                "sex_ratio_male": 0.48,
            },
            {
                "cohort_id": "ADNI_MCI_converter",
                "n_subjects": 302,
                "age_range": [55, 95],
                "age_mean": 74.8,
                "condition": "mild_cognitive_impairment",
                "sex_ratio_male": 0.50,
                "time_to_conversion_median": "18 months",
            },
        ]
        mock_registry_all["oasis"].get_cohorts.return_value = [
            {
                "cohort_id": "OASIS_dementia",
                "n_subjects": 416,
                "age_range": [60, 100],
                "age_mean": 77.1,
                "condition": "alzheimers_disease",
                "sex_ratio_male": 0.40,
            }
        ]
        mock_registry_all["schaefer"].get_parcellation.return_value = {
            "dominant_network": "Default",
            "deviation_map": {"Default_1": -0.25, "Default_2": -0.18},
        }
        mock_registry_all["mni_atlas"].get_region_parcellation.return_value = {
            "area_dissimilarity": 0.42,
        }
        mock_registry_all["adni"].get_progression_probability.return_value = {
            "6_month_probability": 0.52,
            "12_month_probability": 0.78,
            "confidence": 0.72,
        }
        mock_registry_all["mni_atlas"].get_atrophy_reference.return_value = {
            "hippocampus_left": {"atrophy_grade": 3, "pattern": "AD_typical"},
        }

        patient_data = {
            "patient_id": "PT-AD-001",
            "condition": "alzheimers_disease",
            "current_scan": patient,
            "baseline_scan": baseline,
        }

        result = _run(bridge.generate_mri_report(patient_data))

        # Validate report structure
        assert result["patient_id"] == "PT-AD-001"
        assert result["research_only"] is True
        assert result["confidence_overall"] > 0

        struct = result["structural_analysis"]
        assert struct["condition"] == "alzheimers_disease"

        # Volumetric: hippocampi should be significantly reduced
        vol = struct["volumetric_comparison"]
        assert vol["hippocampus_left"]["z_score"] < -1.5
        assert vol["hippocampus_left"]["p_value"] < 0.05

        # Cohort matching should return ADNI and OASIS cohorts
        cohorts = struct["cohort_matches"]
        assert len(cohorts) > 0

        # Atrophy should show alerts for hippocampal loss
        atrophy = result["atrophy_analysis"]
        assert atrophy["baseline_available"] is True
        hipl = atrophy["atrophy_map"]["hippocampus_left"]
        assert hipl["percent_change"] < 0  # atrophied

        # Executive summary should have findings
        summary = result["executive_summary"]
        assert summary["finding_count"] > 0

    def test_healthy_control_workflow(self, mock_registry_all):
        """Analysis of a healthy control subject."""
        bridge = MRIAnalyzerBridge(mock_registry_all)

        patient = {
            "patient_id": "PT-HC-001",
            "scan_type": "T1w_MPRAGE",
            "age": 28,
            "sex": "male",
            "volumes": {
                "hippocampus_left": 3.3,
                "hippocampus_right": 3.4,
                "cortex_total": 520.0,
            },
        }

        mock_registry_all["hcp"].get_normative_volumes.return_value = {
            "hippocampus_left": {"mean": 3.20, "std": 0.45},
            "hippocampus_right": {"mean": 3.30, "std": 0.44},
            "cortex_total": {"mean": 520.0, "std": 55.0},
        }
        mock_registry_all["hcp"].get_cohorts.return_value = [
            {
                "cohort_id": "HCP_young_adult",
                "n_subjects": 1206,
                "age_range": [22, 37],
                "age_mean": 28.8,
                "condition": "healthy_control",
            }
        ]
        mock_registry_all["schaefer"].get_parcellation.return_value = {
            "dominant_network": "SomMot",
            "deviation_map": {},
        }
        mock_registry_all["mni_atlas"].get_region_parcellation.return_value = {
            "area_dissimilarity": 0.12,
        }
        mock_registry_all["adni"].get_progression_probability.return_value = None

        result = _run(bridge.structural_analysis(patient, "healthy_control"))

        assert result["patient_id"] == "PT-HC-001"
        assert result["condition"] == "healthy_control"
        vol = result["volumetric_comparison"]
        # Volumes near normal should have small z-scores
        hipl = vol.get("hippocampus_left", {})
        if hipl:
            assert abs(hipl.get("z_score", 10)) < 2.0

    def test_adhd_workflow(self, mock_registry_all):
        """Pediatric ADHD analysis workflow."""
        bridge = MRIAnalyzerBridge(mock_registry_all)

        patient = {
            "patient_id": "PT-ADHD-001",
            "scan_type": "T1w_MPRAGE",
            "age": 12,
            "sex": "male",
            "volumes": {
                "hippocampus_left": 3.0,
                "caudate_left": 3.2,
                "putamen_left": 4.5,
            },
        }

        mock_registry_all["adhd_200"].get_normative_volumes.return_value = {
            "hippocampus_left": {"mean": 3.1, "std": 0.40},
            "caudate_left": {"mean": 3.5, "std": 0.38},
        }
        mock_registry_all["gsp"].get_normative_volumes.return_value = {
            "putamen_left": {"mean": 4.8, "std": 0.55},
        }
        mock_registry_all["adhd_200"].get_cohorts.return_value = [
            {
                "cohort_id": "ADHD_200_ADHD",
                "n_subjects": 285,
                "age_range": [7, 21],
                "age_mean": 11.8,
                "condition": "adhd",
            }
        ]
        mock_registry_all["gsp"].get_cohorts.return_value = [
            {
                "cohort_id": "GSP_young_adult",
                "n_subjects": 1570,
                "age_range": [18, 35],
                "age_mean": 24.5,
                "condition": "healthy_control",
            }
        ]
        mock_registry_all["schaefer"].get_parcellation.return_value = {
            "dominant_network": "Cont",
            "deviation_map": {},
        }

        result = _run(bridge.structural_analysis(patient, "adhd"))

        assert result["patient_id"] == "PT-ADHD-001"
        assert result["condition"] == "adhd"
        assert result["research_only"] is True
        # Should have matched ADHD-200 cohort
        cohorts = result["cohort_matches"]
        cohort_names = [c["cohort"] for c in cohorts]
        assert any("ADHD" in c for c in cohort_names)

    def test_parallel_execution(self, mock_registry_all, sample_patient_mri):
        """Verify that parallel adapter queries complete successfully."""
        bridge = MRIAnalyzerBridge(mock_registry_all)

        call_counts = {}

        async def counting_cohorts(condition):
            call_counts["cohorts"] = call_counts.get("cohorts", 0) + 1
            await asyncio.sleep(0.01)  # Simulate latency
            return [
                {
                    "cohort_id": "ADNI_AD",
                    "n_subjects": 302,
                    "age_range": [55, 95],
                    "age_mean": 75.2,
                    "condition": condition,
                }
            ]

        async def counting_norms(regions, condition):
            call_counts["norms"] = call_counts.get("norms", 0) + 1
            await asyncio.sleep(0.01)
            return {"hippocampus_left": {"mean": 3.2, "std": 0.45}}

        mock_registry_all["adni"].get_cohorts = counting_cohorts
        mock_registry_all["oasis"].get_normative_volumes = counting_norms
        mock_registry_all["adni"].get_normative_volumes = counting_norms
        mock_registry_all["schaefer"].get_parcellation = AsyncMock(
            return_value={"dominant_network": "Default", "deviation_map": {}}
        )
        mock_registry_all["mni_atlas"].get_region_parcellation = AsyncMock(
            return_value={"area_dissimilarity": 0.34}
        )
        mock_registry_all["adni"].get_progression_probability = AsyncMock(
            return_value={"6_month_probability": 0.45, "12_month_probability": 0.72, "confidence": 0.68}
        )

        result = _run(bridge.structural_analysis(sample_patient_mri, "alzheimers_disease"))

        assert result["patient_id"] == "PT-001"
        # Verify all async paths completed
        assert "volumetric_comparison" in result
        assert "cohort_matches" in result
        assert "atlas_parcellation" in result
        assert "predicted_trajectory" in result


# ── Error handling tests ───────────────────────────────────────────────────────


class TestErrorHandling:
    """Tests for robustness under various failure modes."""

    def test_all_adapters_fail(self, mock_registry_all, sample_patient_mri):
        """Verify bridge produces output even when every adapter raises."""
        bridge = MRIAnalyzerBridge(mock_registry_all)

        for name, mock in mock_registry_all.items():
            mock.get_normative_volumes.side_effect = Exception(f"{name} failure")
            mock.get_cohorts.side_effect = Exception(f"{name} failure")
            mock.get_parcellation.side_effect = Exception(f"{name} failure")
            mock.get_region_parcellation.side_effect = Exception(f"{name} failure")
            mock.get_progression_probability.side_effect = Exception(f"{name} failure")

        result = _run(bridge.structural_analysis(sample_patient_mri, "alzheimers_disease"))

        assert result["patient_id"] == "PT-001"
        assert "volumetric_comparison" in result
        assert "cohort_matches" in result
        assert "atlas_parcellation" in result
        assert "predicted_trajectory" in result
        assert result["research_only"] is True

    def test_adapter_returns_none(self, mock_registry_all, sample_patient_mri):
        """Verify bridge handles adapters returning None."""
        bridge = MRIAnalyzerBridge(mock_registry_all)

        for name, mock in mock_registry_all.items():
            mock.get_normative_volumes.return_value = None
            mock.get_cohorts.return_value = None
            mock.get_parcellation.return_value = None
            mock.get_region_parcellation.return_value = None
            mock.get_progression_probability.return_value = None

        result = _run(bridge.structural_analysis(sample_patient_mri, "alzheimers_disease"))

        assert result["patient_id"] == "PT-001"
        assert result["research_only"] is True

    def test_adapter_returns_malformed(self, mock_registry_all, sample_patient_mri):
        """Verify bridge handles adapters returning unexpected structures."""
        bridge = MRIAnalyzerBridge(mock_registry_all)

        mock_registry_all["adni"].get_normative_volumes.return_value = "unexpected_string"
        mock_registry_all["oasis"].get_cohorts.return_value = {"not_a_list": True}
        mock_registry_all["schaefer"].get_parcellation.return_value = [1, 2, 3]

        result = _run(bridge.structural_analysis(sample_patient_mri, "alzheimers_disease"))

        assert result["patient_id"] == "PT-001"
        assert result["research_only"] is True

    def test_missing_volume_data(self, mock_registry_all):
        """Verify bridge handles missing volume data gracefully."""
        bridge = MRIAnalyzerBridge(mock_registry_all)

        patient = {
            "patient_id": "PT-005",
            "scan_type": "T1w_MPRAGE",
            "age": 70,
        }

        result = _run(bridge.structural_analysis(patient, "alzheimers_disease"))

        assert result["patient_id"] == "PT-005"
        vol = result.get("volumetric_comparison", {})
        # Should have local fallback or be empty
        assert isinstance(vol, dict)

    def test_invalid_patient_age(self, mock_registry_empty):
        """Verify bridge handles invalid patient demographics."""
        bridge = MRIAnalyzerBridge(mock_registry_empty)

        patient = {
            "patient_id": "PT-006",
            "age": None,
            "sex": "",
            "volumes": {"hippocampus_left": 2.1},
        }

        result = _run(bridge.structural_analysis(patient, "alzheimers_disease"))

        assert result["patient_id"] == "PT-006"
        assert result["research_only"] is True


# ── Run tests ──────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    pytest.main([__file__, "-v"])
