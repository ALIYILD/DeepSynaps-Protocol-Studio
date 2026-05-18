"""
Unit tests for the qEEG Analyzer Bridge.

Tests all four public methods with fully mocked adapters:
  - normative_comparison
  - atlas_region_analysis
  - meta_analytic_comparison
  - generate_clinical_report

Each test verifies:
  - Correct output schema and shape
  - Provenance envelope presence
  - Confidence scores within [0, 1]
  - research_only=True flag
  - Graceful adapter failure handling (bridge doesn't crash)
"""

from __future__ import annotations

import asyncio
import sys
from typing import Any, Dict, List, Optional
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# Ensure the bridge module is importable
sys.path.insert(0, "/mnt/agents/output/phase5")

from qeeg_bridge import (
    QEEGAnalyzerBridge,
    _z_score,
    _p_value_from_z,
    _deviation_tier,
    _direction,
    _build_provenance,
    _confidence_from_sources,
    create_bridge,
)


# ── Fixtures ─────────────────────────────────────────────────────────────────


@pytest.fixture
def mock_chbmp_adapter():
    """Mock CHBMP adapter with realistic normative data."""
    adapter = MagicMock()
    adapter.is_connected = True
    adapter.source_name = "CHBMP_Normative_EEG"
    adapter.source_version = "1.0"

    async def mock_fetch(query):
        age = query.get("age", 35)
        return [
            {
                "subject_id": f"chbmp_norm_{age}",
                "age": age,
                "sex": query.get("sex", "all"),
                "n_subjects": 42,
                "eeg_features": {
                    "absolute_power": {
                        "delta": {"Fp1": {"mean": 25.0, "sd": 8.5}},
                        "theta": {"Fp1": {"mean": 18.0, "sd": 6.2}},
                        "alpha": {"Fp1": {"mean": 12.0, "sd": 5.1}},
                        "beta": {"Fp1": {"mean": 6.0, "sd": 3.8}},
                        "gamma": {"Fp1": {"mean": 2.5, "sd": 1.9}},
                    },
                },
                "normative_statistics": {
                    "n_total_subjects": 300,
                    "population": "Cuban_healthy_adults",
                    "alpha_power": {"mean": 10.1, "sd": 5.0},
                    "theta_power": {"mean": 4.2, "sd": 2.1},
                },
            }
        ]

    async def mock_connect():
        adapter.is_connected = True
        return True

    async def mock_disconnect():
        adapter.is_connected = False

    async def mock_health_check():
        return {"status": "ok", "source": "CHBMP"}

    adapter.fetch = AsyncMock(side_effect=mock_fetch)
    adapter.connect = AsyncMock(side_effect=mock_connect)
    adapter.disconnect = AsyncMock(side_effect=mock_disconnect)
    adapter.health_check = AsyncMock(side_effect=mock_health_check)
    return adapter


@pytest.fixture
def mock_neurosynth_adapter():
    """Mock Neurosynth adapter with meta-analytic data."""
    adapter = MagicMock()
    adapter.is_connected = True
    adapter.source_name = "Neurosynth"
    adapter.source_version = "1.0"

    async def mock_fetch(query):
        term = query.get("term", "")
        return [
            {
                "term": term or "depression",
                "term_id": "ns_001",
                "association_z_score": 3.2,
                "posterior_probability": 0.67,
                "num_studies": 45,
                "num_activations": 120,
                "inference_type": query.get("inference_type", "forward"),
                "coordinate": [-44, 22, 34],
                "radius_mm": 6.0,
            },
            {
                "term": term or "depression",
                "term_id": "ns_002",
                "association_z_score": -2.1,
                "posterior_probability": 0.45,
                "num_studies": 38,
                "num_activations": 95,
                "inference_type": query.get("inference_type", "forward"),
                "coordinate": [40, -50, 42],
                "radius_mm": 6.0,
            },
        ]

    adapter.fetch = AsyncMock(side_effect=mock_fetch)
    adapter.connect = AsyncMock(return_value=True)
    adapter.disconnect = AsyncMock()
    adapter.health_check = AsyncMock(return_value={"status": "ok", "source": "Neurosynth"})
    return adapter


@pytest.fixture
def mock_neurovault_adapter():
    """Mock NeuroVault adapter."""
    adapter = MagicMock()
    adapter.is_connected = True
    adapter.source_name = "NeuroVault"
    adapter.source_version = "2024.1"

    async def mock_search(query, filters=None):
        return [
            {"id": 1, "name": f"{query}_map_1", "modality": "fMRI-BOLD"},
            {"id": 2, "name": f"{query}_map_2", "modality": "fMRI-BOLD"},
        ]

    adapter.search = AsyncMock(side_effect=mock_search)
    adapter.connect = AsyncMock(return_value=True)
    adapter.disconnect = AsyncMock()
    adapter.health_check = AsyncMock(return_value={"status": "ok", "source": "NeuroVault"})
    return adapter


@pytest.fixture
def mock_schaefer_adapter():
    """Mock Schaefer atlas adapter."""
    adapter = MagicMock()
    adapter.is_connected = True

    async def mock_fetch(query):
        mni = query.get("mni_coordinate")
        if mni:
            return [
                {
                    "region_id": "Schaefer400_7N_LH_Parcel_0001",
                    "region_name": "Default_LH_Parcel_0001",
                    "network_name": "Default",
                    "network_id": 7,
                    "hemisphere": "LH",
                    "x": mni[0] + 2,
                    "y": mni[1] + 1,
                    "z": mni[2] - 1,
                    "_distance_mm": 5.2,
                }
            ]
        return []

    adapter.fetch = AsyncMock(side_effect=mock_fetch)
    adapter.connect = AsyncMock(return_value=True)
    adapter.disconnect = AsyncMock()
    adapter.health_check = AsyncMock(return_value={"status": "ok", "parcels_loaded": 400})
    return adapter


@pytest.fixture
def mock_yeo2011_adapter():
    """Mock Yeo 2011 adapter."""
    adapter = MagicMock()
    adapter.is_connected = True

    async def mock_fetch(query):
        return [
            {"network_id": 7, "network_name": "Default", "parcel_id": 1, "parcel_name": "DMN_1"}
        ]

    adapter.fetch = AsyncMock(side_effect=mock_fetch)
    adapter.connect = AsyncMock(return_value=True)
    adapter.disconnect = AsyncMock()
    adapter.health_check = AsyncMock(return_value={"status": "ok"})
    return adapter


@pytest.fixture
def mock_gordon2014_adapter():
    """Mock Gordon 2014 adapter."""
    adapter = MagicMock()
    adapter.is_connected = True

    async def mock_fetch(query):
        return [{"network_name": "Default Mode", "region_id": "GORD_001"}]

    adapter.fetch = AsyncMock(side_effect=mock_fetch)
    adapter.connect = AsyncMock(return_value=True)
    adapter.disconnect = AsyncMock()
    adapter.health_check = AsyncMock(return_value={"status": "ok"})
    return adapter


@pytest.fixture
def mock_glasser2016_adapter():
    """Mock Glasser 2016 adapter."""
    adapter = MagicMock()
    adapter.is_connected = True

    async def mock_fetch(query):
        return [{"parcel_id": "A1", "region_name": "Area_1", "network": "Visual"}]

    adapter.fetch = AsyncMock(side_effect=mock_fetch)
    adapter.connect = AsyncMock(return_value=True)
    adapter.disconnect = AsyncMock()
    adapter.health_check = AsyncMock(return_value={"status": "ok"})
    return adapter


@pytest.fixture
def mock_brainnetome_adapter():
    """Mock Brainnetome adapter."""
    adapter = MagicMock()
    adapter.is_connected = True

    async def mock_fetch(query):
        return [{"region_id": "BN_001", "region_name": "Prefrontal_L", "lobe": "Frontal"}]

    adapter.fetch = AsyncMock(side_effect=mock_fetch)
    adapter.connect = AsyncMock(return_value=True)
    adapter.disconnect = AsyncMock()
    adapter.health_check = AsyncMock(return_value={"status": "ok"})
    return adapter


@pytest.fixture
def mock_mni_atlas_adapter():
    """Mock MNI Atlas adapter."""
    adapter = MagicMock()
    adapter.is_connected = True

    async def mock_fetch(query):
        return [{"region_id": "Precentral_L", "region_name": "Precentral_L", "lobe": "Prefrontal"}]

    adapter.fetch = AsyncMock(side_effect=mock_fetch)
    adapter.connect = AsyncMock(return_value=True)
    adapter.disconnect = AsyncMock()
    adapter.health_check = AsyncMock(return_value={"status": "ok"})
    return adapter


@pytest.fixture
def full_registry(
    mock_chbmp_adapter,
    mock_neurosynth_adapter,
    mock_neurovault_adapter,
    mock_schaefer_adapter,
    mock_yeo2011_adapter,
    mock_gordon2014_adapter,
    mock_glasser2016_adapter,
    mock_brainnetome_adapter,
    mock_mni_atlas_adapter,
):
    """Registry with all 9 mocked adapters."""
    return {
        "chbmp": mock_chbmp_adapter,
        "neurosynth": mock_neurosynth_adapter,
        "neurovault": mock_neurovault_adapter,
        "schaefer": mock_schaefer_adapter,
        "yeo2011": mock_yeo2011_adapter,
        "gordon2014": mock_gordon2014_adapter,
        "glasser2016": mock_glasser2016_adapter,
        "brainnetome": mock_brainnetome_adapter,
        "mni_atlas": mock_mni_atlas_adapter,
    }


@pytest.fixture
def minimal_patient_data():
    """Minimal patient data fixture for testing."""
    return {
        "patient_id": "PT-001",
        "age": 35.0,
        "sex": "all",
        "condition": "major_depressive_disorder",
        "qeeg_features": {
            "alpha_power": 8.2,
            "theta_power": 6.5,
            "beta_power": 5.8,
        },
        "montage": "19-channel_10-20",
        "regions_of_interest": ["F3", "F4", "Cz", "P3"],
    }


# ── Helper tests ─────────────────────────────────────────────────────────────


class TestHelperFunctions:
    """Test standalone utility functions."""

    def test_z_score_normal(self):
        assert _z_score(12.0, 10.0, 2.0) == 1.0

    def test_z_score_zero_std(self):
        assert _z_score(12.0, 10.0, 0.0) == 0.0

    def test_z_score_nan(self):
        import math
        assert _z_score(float("nan"), 10.0, 2.0) == 0.0

    def test_p_value_range(self):
        p = _p_value_from_z(2.0)
        assert 0.0 < p < 1.0

    def test_p_value_zero_z(self):
        assert _p_value_from_z(0.0) == 1.0

    def test_deviation_tier_severe(self):
        tier, note = _deviation_tier(3.5)
        assert tier == "severe"
        assert "urgent" in note.lower()

    def test_deviation_tier_normal(self):
        tier, note = _deviation_tier(0.5)
        assert tier == "normal"

    def test_direction_elevated(self):
        assert _direction(1.5) == "elevated"

    def test_direction_reduced(self):
        assert _direction(-1.5) == "reduced"

    def test_direction_neutral(self):
        assert _direction(0.0) == "neutral"

    def test_build_provenance(self):
        p = _build_provenance(["chbmp"], "test_query", 0.75)
        assert p["sources"] == ["chbmp"]
        assert p["query"] == "test_query"
        assert p["confidence"] == 0.75
        assert p["is_research_only"] is True
        assert p["bridge"] == "qeeg_analyzer_bridge"
        assert "accessed_at" in p
        assert "confidence_tier" in p

    def test_build_provenance_high_confidence(self):
        p = _build_provenance(["a", "b"], "q", 0.95)
        assert p["confidence_tier"] == "high"

    def test_build_provenance_insufficient(self):
        p = _build_provenance(["a"], "q", 0.2)
        assert p["confidence_tier"] == "insufficient"

    def test_confidence_from_sources(self):
        c = _confidence_from_sources(["a", "b"], ["a", "b", "c"], 0.5)
        assert 0.5 <= c <= 1.0

    def test_confidence_from_sources_all_available(self):
        c = _confidence_from_sources(["a", "b", "c"], ["a", "b", "c"], 0.5)
        assert c > 0.5


# ── Bridge initialization tests ──────────────────────────────────────────────


class TestBridgeInitialization:
    """Test QEEGAnalyzerBridge initialization and lifecycle."""

    def test_bridge_init_no_registry(self):
        bridge = QEEGAnalyzerBridge()
        assert bridge._registry == {}
        assert isinstance(bridge.available_adapters, list)

    def test_bridge_init_with_registry(self, full_registry):
        bridge = QEEGAnalyzerBridge(full_registry)
        assert "chbmp" in bridge._adapters
        assert "neurosynth" in bridge._adapters
        assert "neurovault" in bridge._adapters

    @pytest.mark.asyncio
    async def test_connect_all(self, full_registry):
        bridge = QEEGAnalyzerBridge(full_registry)
        results = await bridge.connect_all()
        assert isinstance(results, dict)
        assert results.get("chbmp") is True
        assert results.get("neurosynth") is True

    @pytest.mark.asyncio
    async def test_disconnect_all(self, full_registry):
        bridge = QEEGAnalyzerBridge(full_registry)
        await bridge.connect_all()
        await bridge.disconnect_all()
        assert not any(bridge._adapter_available.values())

    @pytest.mark.asyncio
    async def test_health_check(self, full_registry):
        bridge = QEEGAnalyzerBridge(full_registry)
        await bridge.connect_all()
        health = await bridge.health_check()
        assert health["bridge"] == "qeeg_analyzer_bridge"
        assert health["adapters_total"] == 9
        assert health["adapters_available"] >= 3
        assert health["status"] in ("healthy", "degraded", "unavailable")
        assert "adapter_health" in health

    def test_available_adapters_with_registry(self, full_registry):
        bridge = QEEGAnalyzerBridge(full_registry)
        available = bridge.available_adapters
        assert "chbmp" in available
        assert "neurosynth" in available
        assert "neurovault" in available


# ── normative_comparison tests ───────────────────────────────────────────────


class TestNormativeComparison:
    """Test normative_comparison method."""

    @pytest.mark.asyncio
    async def test_normative_comparison_basic(self, full_registry, minimal_patient_data):
        bridge = QEEGAnalyzerBridge(full_registry)
        await bridge.connect_all()

        result = await bridge.normative_comparison(
            {
                "patient_id": minimal_patient_data["patient_id"],
                "age": minimal_patient_data["age"],
                "sex": minimal_patient_data["sex"],
                "montage": minimal_patient_data["montage"],
                "features": minimal_patient_data["qeeg_features"],
            },
            minimal_patient_data["condition"],
        )

        # Schema verification
        assert result["patient_id"] == "PT-001"
        assert result["condition"] == "major_depressive_disorder"
        assert result["montage"] == "19-channel_10-20"
        assert result["research_only"] is True
        assert 0.0 <= result["confidence_overall"] <= 1.0

        # Cohorts
        assert isinstance(result["comparison_cohorts"], list)
        assert len(result["comparison_cohorts"]) > 0

        # Atlas assignments
        assert isinstance(result["atlas_assignments"], dict)

        # Neurosynth associations
        assert isinstance(result["neurosynth_associations"], list)

        # Provenance
        assert "provenance" in result
        prov = result["provenance"]
        assert "sources" in prov
        assert "confidence" in prov
        assert prov["is_research_only"] is True

    @pytest.mark.asyncio
    async def test_normative_comparison_empty_features(self, full_registry):
        bridge = QEEGAnalyzerBridge(full_registry)
        result = await bridge.normative_comparison(
            {
                "patient_id": "PT-002",
                "age": 40.0,
                "sex": "M",
                "montage": "19-channel_10-20",
                "features": {},
            },
            "general",
        )
        assert result["patient_id"] == "PT-002"
        assert result["research_only"] is True
        assert "provenance" in result

    @pytest.mark.asyncio
    async def test_normative_comparison_missing_adapters(self):
        """Bridge should work even with no adapters."""
        bridge = QEEGAnalyzerBridge({})
        result = await bridge.normative_comparison(
            {
                "patient_id": "PT-003",
                "age": 30.0,
                "sex": "F",
                "montage": "19-channel_10-20",
                "features": {"alpha_power": 8.0},
            },
            "depression",
        )
        assert result["patient_id"] == "PT-003"
        assert result["research_only"] is True
        assert "provenance" in result

    @pytest.mark.asyncio
    async def test_normative_comparison_adapter_failure(self, full_registry, minimal_patient_data):
        """Failed adapters should be skipped, not crash the bridge."""
        bridge = QEEGAnalyzerBridge(full_registry)
        # Make CHBMP fail
        full_registry["chbmp"].fetch = AsyncMock(side_effect=Exception("CHBMP timeout"))
        await bridge.connect_all()

        result = await bridge.normative_comparison(
            {
                "patient_id": minimal_patient_data["patient_id"],
                "age": minimal_patient_data["age"],
                "sex": minimal_patient_data["sex"],
                "montage": minimal_patient_data["montage"],
                "features": minimal_patient_data["qeeg_features"],
            },
            minimal_patient_data["condition"],
        )
        assert result["research_only"] is True
        assert "provenance" in result

    @pytest.mark.asyncio
    async def test_normative_comparison_different_conditions(self, full_registry):
        """Test with various conditions."""
        bridge = QEEGAnalyzerBridge(full_registry)
        for condition in ["anxiety", "adhd", "schizophrenia", "epilepsy", "unspecified"]:
            result = await bridge.normative_comparison(
                {
                    "patient_id": "PT-TEST",
                    "age": 35.0,
                    "sex": "all",
                    "montage": "19-channel_10-20",
                    "features": {"alpha_power": 8.0, "theta_power": 6.0},
                },
                condition,
            )
            assert result["condition"] == condition
            assert result["research_only"] is True


# ── atlas_region_analysis tests ──────────────────────────────────────────────


class TestAtlasRegionAnalysis:
    """Test atlas_region_analysis method."""

    @pytest.mark.asyncio
    async def test_atlas_region_analysis_schaefer(self, full_registry):
        bridge = QEEGAnalyzerBridge(full_registry)
        result = await bridge.atlas_region_analysis(
            ["F3", "F4", "Cz", "P3"],
            atlas="schaefer",
        )
        assert result["atlas"] == "schaefer"
        assert result["input_regions"] == ["F3", "F4", "Cz", "P3"]
        assert isinstance(result["region_mappings"], list)
        assert 0.0 <= result["confidence_overall"] <= 1.0
        assert result["research_only"] is True
        assert "provenance" in result

    @pytest.mark.asyncio
    async def test_atlas_region_analysis_yeo2011(self, full_registry):
        bridge = QEEGAnalyzerBridge(full_registry)
        result = await bridge.atlas_region_analysis(
            ["F3", "Cz"],
            atlas="yeo2011",
        )
        assert result["atlas"] == "yeo2011"
        assert result["research_only"] is True

    @pytest.mark.asyncio
    async def test_atlas_region_analysis_gordon2014(self, full_registry):
        bridge = QEEGAnalyzerBridge(full_registry)
        result = await bridge.atlas_region_analysis(
            ["P3", "P4"],
            atlas="gordon2014",
        )
        assert result["atlas"] == "gordon2014"
        assert result["research_only"] is True

    @pytest.mark.asyncio
    async def test_atlas_region_analysis_glasser2016(self, full_registry):
        bridge = QEEGAnalyzerBridge(full_registry)
        result = await bridge.atlas_region_analysis(
            ["O1", "O2"],
            atlas="glasser2016",
        )
        assert result["atlas"] == "glasser2016"
        assert result["research_only"] is True

    @pytest.mark.asyncio
    async def test_atlas_region_analysis_brainnetome(self, full_registry):
        bridge = QEEGAnalyzerBridge(full_registry)
        result = await bridge.atlas_region_analysis(
            ["T7", "T8"],
            atlas="brainnetome",
        )
        assert result["atlas"] == "brainnetome"
        assert result["research_only"] is True

    @pytest.mark.asyncio
    async def test_atlas_region_analysis_no_adapters(self):
        """Should still return result with fallback mappings."""
        bridge = QEEGAnalyzerBridge({})
        result = await bridge.atlas_region_analysis(
            ["F3", "Cz", "P3"],
            atlas="schaefer",
        )
        assert result["atlas"] == "schaefer"
        assert len(result["region_mappings"]) == 3
        assert result["research_only"] is True

    @pytest.mark.asyncio
    async def test_atlas_region_analysis_empty_regions(self, full_registry):
        bridge = QEEGAnalyzerBridge(full_registry)
        result = await bridge.atlas_region_analysis([], atlas="schaefer")
        assert result["atlas"] == "schaefer"
        assert result["n_mapped"] == 0
        assert result["n_unmapped"] == 0


# ── meta_analytic_comparison tests ───────────────────────────────────────────


class TestMetaAnalyticComparison:
    """Test meta_analytic_comparison method."""

    @pytest.mark.asyncio
    async def test_meta_analytic_comparison_basic(self, full_registry):
        bridge = QEEGAnalyzerBridge(full_registry)
        result = await bridge.meta_analytic_comparison(
            patient_pattern="frontal_hypoactivation",
            condition="major_depressive_disorder",
        )
        assert result["patient_pattern"] == "frontal_hypoactivation"
        assert result["condition"] == "major_depressive_disorder"
        assert 0.0 <= result["pattern_similarity_score"] <= 1.0
        assert isinstance(result["supporting_studies"], int)
        assert "neurosynth_match" in result
        assert "neurovault_match" in result
        assert result["research_only"] is True
        assert "caveat" in result
        assert "provenance" in result

    @pytest.mark.asyncio
    async def test_meta_analytic_comparison_no_adapters(self):
        bridge = QEEGAnalyzerBridge({})
        result = await bridge.meta_analytic_comparison(
            patient_pattern="temporal_hyperactivation",
            condition="epilepsy",
        )
        assert result["patient_pattern"] == "temporal_hyperactivation"
        assert result["condition"] == "epilepsy"
        assert result["research_only"] is True
        assert "provenance" in result

    @pytest.mark.asyncio
    async def test_meta_analytic_comparison_various_conditions(self, full_registry):
        bridge = QEEGAnalyzerBridge(full_registry)
        for condition in ["depression", "anxiety", "adhd", "bipolar"]:
            result = await bridge.meta_analytic_comparison(
                patient_pattern="default_pattern",
                condition=condition,
            )
            assert result["condition"] == condition
            assert result["research_only"] is True


# ── generate_clinical_report tests ───────────────────────────────────────────


class TestGenerateClinicalReport:
    """Test generate_clinical_report method."""

    @pytest.mark.asyncio
    async def test_generate_clinical_report_full(self, full_registry, minimal_patient_data):
        bridge = QEEGAnalyzerBridge(full_registry)
        await bridge.connect_all()

        result = await bridge.generate_clinical_report(minimal_patient_data)

        # Top-level schema
        assert result["patient_id"] == "PT-001"
        assert result["report_type"] == "qEEG Clinical Intelligence Report"
        assert result["condition"] == "major_depressive_disorder"
        assert result["research_only"] is True
        assert "governance_notice" in result
        assert 0.0 <= result["confidence_overall"] <= 1.0

        # Demographics
        assert "demographics" in result
        assert result["demographics"]["age"] == 35.0

        # Executive summary
        assert "executive_summary" in result
        assert isinstance(result["executive_summary"], str)
        assert len(result["executive_summary"]) > 0

        # Sub-analyses
        assert "normative_comparison" in result
        assert "meta_analytic_comparison" in result
        assert "atlas_region_analysis" in result
        assert "risk_assessment" in result

        # Alerts and recommendations
        assert "alerts" in result
        assert isinstance(result["alerts"], list)
        assert "recommendations" in result
        assert isinstance(result["recommendations"], list)

        # Provenance
        assert "provenance" in result
        prov = result["provenance"]
        assert "sources" in prov
        assert "metadata" in prov

    @pytest.mark.asyncio
    async def test_generate_clinical_report_minimal(self, full_registry):
        """Test with minimal data."""
        bridge = QEEGAnalyzerBridge(full_registry)
        result = await bridge.generate_clinical_report(
            {
                "patient_id": "PT-MIN",
                "age": 25.0,
                "sex": "F",
                "condition": "general",
                "qeeg_features": {},
            }
        )
        assert result["patient_id"] == "PT-MIN"
        assert result["research_only"] is True
        assert "recommendations" in result
        assert "provenance" in result

    @pytest.mark.asyncio
    async def test_generate_clinical_report_no_regions(self, full_registry):
        """Test without regions_of_interest."""
        bridge = QEEGAnalyzerBridge(full_registry)
        data = {
            "patient_id": "PT-NOREG",
            "age": 45.0,
            "sex": "M",
            "condition": "anxiety",
            "qeeg_features": {"alpha_power": 7.0, "beta_power": 8.0},
        }
        result = await bridge.generate_clinical_report(data)
        assert result["patient_id"] == "PT-NOREG"
        assert result["research_only"] is True

    @pytest.mark.asyncio
    async def test_generate_clinical_report_no_adapters(self):
        """Test with no adapters available."""
        bridge = QEEGAnalyzerBridge({})
        result = await bridge.generate_clinical_report(
            {
                "patient_id": "PT-NOADAPT",
                "age": 30.0,
                "sex": "all",
                "condition": "depression",
                "qeeg_features": {"alpha_power": 8.0},
                "regions_of_interest": ["F3", "Cz"],
            }
        )
        assert result["patient_id"] == "PT-NOADAPT"
        assert result["research_only"] is True
        assert "executive_summary" in result
        assert "recommendations" in result


# ── Factory function test ────────────────────────────────────────────────────


class TestFactory:
    """Test create_bridge factory function."""

    @pytest.mark.asyncio
    async def test_create_bridge(self, full_registry):
        bridge = await create_bridge(full_registry)
        assert isinstance(bridge, QEEGAnalyzerBridge)
        health = await bridge.health_check()
        assert health["status"] in ("healthy", "degraded")
        await bridge.disconnect_all()


# ── End-to-end integration-style test ────────────────────────────────────────


class TestEndToEnd:
    """End-to-end test simulating full clinical workflow."""

    @pytest.mark.asyncio
    async def test_full_workflow(self, full_registry, minimal_patient_data):
        """Run all four methods in sequence."""
        bridge = QEEGAnalyzerBridge(full_registry)
        await bridge.connect_all()

        # 1. Normative comparison
        norm = await bridge.normative_comparison(
            {
                "patient_id": minimal_patient_data["patient_id"],
                "age": minimal_patient_data["age"],
                "sex": minimal_patient_data["sex"],
                "montage": minimal_patient_data["montage"],
                "features": minimal_patient_data["qeeg_features"],
            },
            minimal_patient_data["condition"],
        )
        assert norm["research_only"] is True

        # 2. Atlas region analysis
        atlas = await bridge.atlas_region_analysis(
            minimal_patient_data["regions_of_interest"],
            atlas="schaefer",
        )
        assert atlas["research_only"] is True

        # 3. Meta-analytic comparison
        meta = await bridge.meta_analytic_comparison(
            "frontal_hypoactivation",
            minimal_patient_data["condition"],
        )
        assert meta["research_only"] is True

        # 4. Clinical report
        report = await bridge.generate_clinical_report(minimal_patient_data)
        assert report["research_only"] is True
        assert report["patient_id"] == minimal_patient_data["patient_id"]
        assert len(report["recommendations"]) > 0

        await bridge.disconnect_all()

    @pytest.mark.asyncio
    async def test_parallel_queries(self, full_registry):
        """Verify multiple queries can run in parallel."""
        bridge = QEEGAnalyzerBridge(full_registry)
        await bridge.connect_all()

        results = await asyncio.gather(
            bridge.normative_comparison(
                {"patient_id": "PT-A", "age": 30, "sex": "M", "montage": "19-channel_10-20", "features": {"alpha": 8.0}},
                "depression",
            ),
            bridge.normative_comparison(
                {"patient_id": "PT-B", "age": 45, "sex": "F", "montage": "19-channel_10-20", "features": {"theta": 7.0}},
                "anxiety",
            ),
            bridge.atlas_region_analysis(["F3", "Cz"], "schaefer"),
            bridge.meta_analytic_comparison("pattern_a", "adhd"),
        )

        assert len(results) == 4
        assert all(r["research_only"] is True for r in results)

        await bridge.disconnect_all()


# ── Governance / compliance tests ────────────────────────────────────────────


class TestGovernance:
    """Test governance compliance: research_only flags, confidence, provenance."""

    @pytest.mark.asyncio
    async def test_all_outputs_research_only(self, full_registry, minimal_patient_data):
        bridge = QEEGAnalyzerBridge(full_registry)
        await bridge.connect_all()

        norm = await bridge.normative_comparison(
            {
                "patient_id": "PT-GOV",
                "age": 35,
                "sex": "all",
                "montage": "19-channel_10-20",
                "features": minimal_patient_data["qeeg_features"],
            },
            "depression",
        )
        assert norm["research_only"] is True

        atlas = await bridge.atlas_region_analysis(["F3"], "schaefer")
        assert atlas["research_only"] is True

        meta = await bridge.meta_analytic_comparison("p", "depression")
        assert meta["research_only"] is True

        report = await bridge.generate_clinical_report(minimal_patient_data)
        assert report["research_only"] is True
        assert "governance_notice" in report

        await bridge.disconnect_all()

    @pytest.mark.asyncio
    async def test_confidence_bounds(self, full_registry, minimal_patient_data):
        bridge = QEEGAnalyzerBridge(full_registry)
        await bridge.connect_all()

        report = await bridge.generate_clinical_report(minimal_patient_data)
        assert 0.0 <= report["confidence_overall"] <= 1.0

        norm = await bridge.normative_comparison(
            {
                "patient_id": "PT-CONF",
                "age": 35,
                "sex": "all",
                "montage": "19-channel_10-20",
                "features": minimal_patient_data["qeeg_features"],
            },
            "depression",
        )
        assert 0.0 <= norm["confidence_overall"] <= 1.0

        await bridge.disconnect_all()

    @pytest.mark.asyncio
    async def test_provenance_structure(self, full_registry, minimal_patient_data):
        bridge = QEEGAnalyzerBridge(full_registry)
        await bridge.connect_all()

        result = await bridge.generate_clinical_report(minimal_patient_data)
        prov = result["provenance"]
        assert "sources" in prov
        assert "query" in prov
        assert "confidence" in prov
        assert "confidence_tier" in prov
        assert "is_research_only" in prov
        assert "accessed_at" in prov
        assert "bridge" in prov
        assert "version" in prov
        assert "metadata" in prov

        await bridge.disconnect_all()

    @pytest.mark.asyncio
    async def test_bridge_does_not_crash_on_failures(self, full_registry, minimal_patient_data):
        """Bridge must never raise — always return structured output."""
        bridge = QEEGAnalyzerBridge(full_registry)

        # Make all adapters fail
        for key, adapter in full_registry.items():
            if hasattr(adapter, "fetch"):
                adapter.fetch = AsyncMock(side_effect=Exception(f"{key} down"))

        await bridge.connect_all()

        result = await bridge.generate_clinical_report(minimal_patient_data)
        assert result["patient_id"] == minimal_patient_data["patient_id"]
        assert result["research_only"] is True
        assert "recommendations" in result

        await bridge.disconnect_all()


# ── Run helper ───────────────────────────────────────────────────────────────


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
