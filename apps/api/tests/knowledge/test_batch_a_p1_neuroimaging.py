"""
Test Suite for Phase 4 Batch A - Neuroimaging Adapters

Tests for 5 neuroimaging adapters:
  1. FunctionalConnectomes1000Adapter (1000 FCP, static data)
  2. NitrcAdapter (NITRC REST API)
  3. Glasser2016Adapter (Glasser HCP parcellation)
  4. BrainnetomeAdapter (Brainnetome Atlas)
  5. IxiAdapter (IXI Dataset)

All external HTTP calls are mocked to avoid real API requests.
Run with: pytest test_batch_a_neuroimaging.py -v
"""

import pytest
import httpx
from datetime import datetime
from pathlib import Path
import json
import sys
import os
from unittest.mock import AsyncMock, MagicMock, patch, PropertyMock

# Ensure adapters are importable
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Stub BaseAdapter for standalone testing
class BaseAdapter:
    """Minimal base adapter stub for testing without the full app."""
    pass

# Make it available as the expected import path
sys.modules['app'] = type(sys)('app')
sys.modules['app.knowledge'] = type(sys)('app.knowledge')
sys.modules['app.knowledge.base_adapter'] = type(sys)('app.knowledge.base_adapter')
sys.modules['app.knowledge.base_adapter'].BaseAdapter = BaseAdapter

from functional_connectomes_1000_adapter import FunctionalConnectomes1000Adapter
from nitrc_adapter import NitrcAdapter
from glasser2016_adapter import Glasser2016Adapter
from brainnetome_adapter import BrainnetomeAdapter
from ixi_adapter import IxiAdapter


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def fcp_adapter():
    """Create a FunctionalConnectomes1000Adapter instance with temp cache."""
    return FunctionalConnectomes1000Adapter(cache_dir="/tmp/test_fcp_cache")


@pytest.fixture
def nitrc_adapter():
    """Create a NitrcAdapter instance."""
    return NitrcAdapter()


@pytest.fixture
def glasser_adapter():
    """Create a Glasser2016Adapter instance with temp cache."""
    return Glasser2016Adapter(cache_dir="/tmp/test_glasser_cache")


@pytest.fixture
def brainnetome_adapter():
    """Create a BrainnetomeAdapter instance with temp cache."""
    return BrainnetomeAdapter(cache_dir="/tmp/test_brainnetome_cache")


@pytest.fixture
def ixi_adapter():
    """Create an IxiAdapter instance with temp cache."""
    return IxiAdapter(cache_dir="/tmp/test_ixi_cache")


# =============================================================================
# 1000 Functional Connectomes Project Adapter Tests
# =============================================================================

class TestFunctionalConnectomes1000Adapter:
    """Tests for the 1000 Functional Connectomes Project Adapter."""

    @pytest.mark.asyncio
    async def test_init(self, fcp_adapter):
        """Test adapter initialization."""
        assert fcp_adapter.name == "fcp_1000"
        assert fcp_adapter.display_name == "1000 Functional Connectomes Project"
        assert fcp_adapter.source_url == "https://fcon_1000.projects.nitrc.org/"
        assert fcp_adapter.confidence_tier == "A"
        assert fcp_adapter.rate_limit_per_minute == 0
        assert fcp_adapter.requires_auth is False
        assert fcp_adapter.version == "3.0"
        assert len(fcp_adapter.SITES) >= 20
        await fcp_adapter.close()

    @pytest.mark.asyncio
    async def test_validate_connection_success(self, fcp_adapter):
        """Test connection validation with successful response."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        fcp_adapter.client.get = AsyncMock(return_value=mock_response)

        result = await fcp_adapter.validate_connection()
        assert result is True
        await fcp_adapter.close()

    @pytest.mark.asyncio
    async def test_validate_connection_failure_fallback(self, fcp_adapter):
        """Test connection validation falls back to built-in data."""
        fcp_adapter.client.get = AsyncMock(side_effect=httpx.ConnectError("Connection failed"))

        result = await fcp_adapter.validate_connection()
        assert result is True  # Built-in data available
        await fcp_adapter.close()

    @pytest.mark.asyncio
    async def test_search_sites_by_name(self, fcp_adapter):
        """Test searching for sites by name."""
        results = await fcp_adapter.search("Beijing", {"search_type": "sites", "limit": 10})
        assert len(results) >= 1
        assert any("Beijing" in r.get("site_name", "") for r in results)
        await fcp_adapter.close()

    @pytest.mark.asyncio
    async def test_search_sites_by_code(self, fcp_adapter):
        """Test searching for sites by code."""
        results = await fcp_adapter.search("Cambridge", {"search_type": "sites", "limit": 10})
        assert len(results) >= 1
        assert any(r.get("site_code") == "Cambridge" for r in results)
        await fcp_adapter.close()

    @pytest.mark.asyncio
    async def test_search_all_sites(self, fcp_adapter):
        """Test listing all sites with wildcard."""
        results = await fcp_adapter.search("*", {"search_type": "sites", "limit": 100})
        assert len(results) >= 20  # Should have at least 20 sites
        await fcp_adapter.close()

    @pytest.mark.asyncio
    async def test_search_sites_by_scanner_brand(self, fcp_adapter):
        """Test filtering sites by scanner manufacturer."""
        results = await fcp_adapter.search(
            "*", {"search_type": "sites", "scanner_brand": "Siemens", "limit": 50}
        )
        assert len(results) >= 1
        assert all("Siemens" in r.get("scanner", "") for r in results)
        await fcp_adapter.close()

    @pytest.mark.asyncio
    async def test_search_subjects(self, fcp_adapter):
        """Test searching for subjects."""
        results = await fcp_adapter.search(
            "Beijing", {"search_type": "subjects", "limit": 20}
        )
        assert len(results) >= 1
        assert all(r.get("site") == "Beijing" for r in results)
        await fcp_adapter.close()

    @pytest.mark.asyncio
    async def test_search_subjects_with_age_filter(self, fcp_adapter):
        """Test searching subjects with age filter."""
        results = await fcp_adapter.search(
            "*",
            {
                "search_type": "subjects",
                "site": "Beijing",
                "age_min": 20,
                "age_max": 25,
                "limit": 20,
            },
        )
        assert len(results) >= 1
        for r in results:
            age = r.get("age")
            if age is not None:
                assert 20 <= age <= 25
        await fcp_adapter.close()

    @pytest.mark.asyncio
    async def test_search_subjects_by_sex(self, fcp_adapter):
        """Test filtering subjects by sex."""
        results = await fcp_adapter.search(
            "*", {"search_type": "subjects", "sex": 1, "limit": 20}
        )
        assert len(results) >= 1
        assert all(r.get("sex") == 1 for r in results)
        await fcp_adapter.close()

    @pytest.mark.asyncio
    async def test_search_scanners(self, fcp_adapter):
        """Test searching for scanner types."""
        results = await fcp_adapter.search("Siemens", {"search_type": "scanners", "limit": 20})
        assert len(results) >= 1
        assert all("Siemens" in r.get("scanner", "") for r in results)
        await fcp_adapter.close()

    @pytest.mark.asyncio
    async def test_transform_site(self, fcp_adapter):
        """Test transformation of site result."""
        raw = {
            "site_code": "Beijing",
            "site_name": "Beijing Normal University / Beijing",
            "location": "Beijing, China",
            "subjects": 198,
            "age_range": "18-26",
            "scanner": "3T Siemens Trio",
            "tr_ms": 2000,
            "slices": 33,
            "voxel_size_mm": 3.12,
            "eyes": "closed",
        }

        canonical = fcp_adapter.transform_to_canonical(raw)
        assert canonical["entity_type"] == "imaging_site"
        assert canonical["source_database"] == "fcp_1000"
        assert canonical["source_id"] == "Beijing"
        assert canonical["value"]["subjects"] == 198
        assert canonical["value"]["modality"] == "rs-fMRI"
        assert "acquisition_params" in canonical["value"]
        await fcp_adapter.close()

    @pytest.mark.asyncio
    async def test_transform_subject(self, fcp_adapter):
        """Test transformation of subject result."""
        raw = {
            "subject_id": "Beijing_0001",
            "site": "Beijing",
            "site_name": "Beijing Normal University",
            "age": 22.5,
            "sex": 0,
            "handedness": 1,
            "scanner": "3T Siemens Trio",
            "tr_ms": 2000,
            "voxel_size_mm": 3.12,
            "eyes": "closed",
        }

        canonical = fcp_adapter.transform_to_canonical(raw)
        assert canonical["entity_type"] == "neuroimaging_subject"
        assert canonical["source_database"] == "fcp_1000"
        assert canonical["source_id"] == "Beijing_0001"
        assert canonical["value"]["sex"] == "Female"
        assert canonical["value"]["handedness"] == "Right"
        assert canonical["value"]["age"] == 22.5
        await fcp_adapter.close()

    @pytest.mark.asyncio
    async def test_get_provenance(self, fcp_adapter):
        """Test provenance metadata generation."""
        prov = fcp_adapter.get_provenance({})
        assert prov["source_database"] == "fcp_1000"
        assert prov["confidence_tier"] == "A"
        assert prov["multi_site"] is True
        assert prov["num_sites"] == len(fcp_adapter.SITES)
        assert "citation" in prov
        await fcp_adapter.close()

    @pytest.mark.asyncio
    async def test_get_confidence_score(self, fcp_adapter):
        """Test confidence score calculation."""
        result = {"subjects": 198, "scanner": "3T Siemens", "site": "Beijing"}
        scores = fcp_adapter.get_confidence_score(result)
        assert scores["data_quality"] == 0.85
        assert scores["sample_size"] == 0.4  # 198/500
        assert "overall" in scores
        assert 0.0 <= scores["overall"] <= 1.0
        await fcp_adapter.close()

    @pytest.mark.asyncio
    async def test_get_dataset_summary(self, fcp_adapter):
        """Test dataset summary generation."""
        summary = await fcp_adapter.get_dataset_summary()
        assert summary["total_subjects"] > 0
        assert summary["total_sites"] == len(fcp_adapter.SITES)
        assert "by_scanner" in summary
        assert "by_sex" in summary
        assert "age_statistics" in summary
        await fcp_adapter.close()

    @pytest.mark.asyncio
    async def test_load_site_data(self, fcp_adapter):
        """Test loading phenotypic data."""
        site_data = await fcp_adapter._load_site_data()
        assert len(site_data) > 0
        first_site = list(site_data.keys())[0]
        assert len(site_data[first_site]) > 0
        assert "subject_id" in site_data[first_site][0]
        await fcp_adapter.close()

    @pytest.mark.asyncio
    async def test_close(self, fcp_adapter):
        """Test adapter cleanup."""
        fcp_adapter.client.aclose = AsyncMock()
        await fcp_adapter.close()
        fcp_adapter.client.aclose.assert_called_once()


# =============================================================================
# NITRC Adapter Tests
# =============================================================================

class TestNitrcAdapter:
    """Tests for the NITRC Adapter."""

    @pytest.mark.asyncio
    async def test_init(self, nitrc_adapter):
        """Test adapter initialization."""
        assert nitrc_adapter.name == "nitrc"
        assert nitrc_adapter.display_name == "NITRC - Neuroimaging Tools & Resources Collaboratory"
        assert nitrc_adapter.source_url == "https://www.nitrc.org/"
        assert nitrc_adapter.confidence_tier == "B"
        assert nitrc_adapter.rate_limit_per_minute == 60
        assert nitrc_adapter.requires_auth is False
        assert nitrc_adapter.version == "2024.1"
        await nitrc_adapter.close()

    @pytest.mark.asyncio
    async def test_validate_connection_success(self, nitrc_adapter):
        """Test connection validation with successful response."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        nitrc_adapter.client.get = AsyncMock(return_value=mock_response)

        result = await nitrc_adapter.validate_connection()
        assert result is True
        await nitrc_adapter.close()

    @pytest.mark.asyncio
    async def test_validate_connection_failure(self, nitrc_adapter):
        """Test connection validation with failure."""
        nitrc_adapter.client.get = AsyncMock(side_effect=httpx.ConnectError("Connection failed"))

        result = await nitrc_adapter.validate_connection()
        assert result is False
        await nitrc_adapter.close()

    @pytest.mark.asyncio
    async def test_search_tools(self, nitrc_adapter):
        """Test searching for tools."""
        results = await nitrc_adapter.search("ITK", {"search_type": "tools", "limit": 10})
        assert len(results) >= 1
        assert all(r.get("resource_type") == "software" for r in results)
        await nitrc_adapter.close()

    @pytest.mark.asyncio
    async def test_search_datasets(self, nitrc_adapter):
        """Test searching for datasets."""
        results = await nitrc_adapter.search(
            "ADHD", {"search_type": "datasets", "limit": 10}
        )
        assert len(results) >= 1
        assert all(r.get("resource_type") == "dataset" for r in results)
        await nitrc_adapter.close()

    @pytest.mark.asyncio
    async def test_search_all(self, nitrc_adapter):
        """Test searching all resource types."""
        results = await nitrc_adapter.search("fMRI", {"search_type": "all", "limit": 50})
        assert len(results) >= 1
        await nitrc_adapter.close()

    @pytest.mark.asyncio
    async def test_search_datasets_by_modality(self, nitrc_adapter):
        """Test filtering datasets by modality."""
        results = await nitrc_adapter.search(
            "*", {"search_type": "datasets", "modality": "fMRI", "limit": 20}
        )
        assert len(results) >= 1
        assert all("fMRI" in r.get("modality", "") for r in results)
        await nitrc_adapter.close()

    @pytest.mark.asyncio
    async def test_search_standards(self, nitrc_adapter):
        """Test searching for standards."""
        results = await nitrc_adapter.search(
            "NIfTI", {"search_type": "standards", "limit": 10}
        )
        assert len(results) >= 1
        assert all(r.get("resource_type") == "standard" for r in results)
        await nitrc_adapter.close()

    @pytest.mark.asyncio
    async def test_get_project_details_known(self, nitrc_adapter):
        """Test getting details for a known project."""
        details = await nitrc_adapter.get_project_details("fcp_1000")
        assert details["project_id"] == "fcp_1000"
        assert "1000 Functional Connectomes" in details["name"]
        await nitrc_adapter.close()

    @pytest.mark.asyncio
    async def test_get_project_details_api_fallback(self, nitrc_adapter):
        """Test API fallback for unknown project."""
        mock_response = MagicMock()
        mock_response.status_code = 404
        nitrc_adapter.client.get = AsyncMock(return_value=mock_response)

        details = await nitrc_adapter.get_project_details("nonexistent_project")
        assert details == {}
        await nitrc_adapter.close()

    @pytest.mark.asyncio
    async def test_transform_dataset(self, nitrc_adapter):
        """Test dataset transformation to canonical format."""
        raw = {
            "project_id": "fcp_1000",
            "name": "1000 Functional Connectomes Project",
            "category": "dataset",
            "modality": "fMRI",
            "subjects": 1400,
            "description": "Resting-state fMRI from 35+ sites",
            "source_url": "https://www.nitrc.org/projects/fcp_1000",
        }

        canonical = nitrc_adapter.transform_to_canonical(raw)
        assert canonical["entity_type"] == "neuroimaging_dataset"
        assert canonical["source_database"] == "nitrc"
        assert canonical["value"]["subjects"] == 1400
        assert canonical["value"]["category"] == "dataset"
        await nitrc_adapter.close()

    @pytest.mark.asyncio
    async def test_transform_tool(self, nitrc_adapter):
        """Test tool transformation to canonical format."""
        raw = {
            "project_id": "itk",
            "name": "Insight Toolkit",
            "category": "tool",
            "modality": "multi",
            "description": "Open-source image analysis toolkit",
            "source_url": "https://www.nitrc.org/projects/itk",
        }

        canonical = nitrc_adapter.transform_to_canonical(raw)
        assert canonical["entity_type"] == "neuroimaging_tool"
        assert canonical["source_database"] == "nitrc"
        assert canonical["value"]["resource_type"] == "software"
        await nitrc_adapter.close()

    @pytest.mark.asyncio
    async def test_transform_standard(self, nitrc_adapter):
        """Test standard transformation to canonical format."""
        raw = {
            "project_id": "nifti",
            "name": "NIfTI",
            "category": "standard",
            "modality": "multi",
            "description": "Neuroimaging data format",
            "source_url": "https://www.nitrc.org/projects/nifti",
        }

        canonical = nitrc_adapter.transform_to_canonical(raw)
        assert canonical["entity_type"] == "data_standard"
        assert canonical["source_database"] == "nitrc"
        assert canonical["value"]["status"] == "Community standard"
        await nitrc_adapter.close()

    @pytest.mark.asyncio
    async def test_get_provenance(self, nitrc_adapter):
        """Test provenance metadata."""
        prov = nitrc_adapter.get_provenance({})
        assert prov["source_database"] == "nitrc"
        assert prov["confidence_tier"] == "B"
        assert prov["community_curated"] is True
        assert "citation" in prov
        await nitrc_adapter.close()

    @pytest.mark.asyncio
    async def test_get_confidence_score(self, nitrc_adapter):
        """Test confidence score calculation."""
        result = {
            "subjects": 500,
            "category": "dataset",
            "description": "A neuroimaging dataset",
        }
        scores = nitrc_adapter.get_confidence_score(result)
        assert scores["data_quality"] == 0.80
        assert scores["evidence_strength"] == 0.75
        assert "overall" in scores
        assert 0.0 <= scores["overall"] <= 1.0
        await nitrc_adapter.close()

    @pytest.mark.asyncio
    async def test_close(self, nitrc_adapter):
        """Test adapter cleanup."""
        nitrc_adapter.client.aclose = AsyncMock()
        await nitrc_adapter.close()
        nitrc_adapter.client.aclose.assert_called_once()


# =============================================================================
# Glasser 2016 Adapter Tests
# =============================================================================

class TestGlasser2016Adapter:
    """Tests for the Glasser 2016 HCP Multi-Modal Parcellation Adapter."""

    @pytest.mark.asyncio
    async def test_init(self, glasser_adapter):
        """Test adapter initialization."""
        assert glasser_adapter.name == "glasser2016"
        assert glasser_adapter.display_name == "Glasser 2016 HCP Multi-Modal Parcellation"
        assert glasser_adapter.source_url == "https://balsa.wustl.edu/VvA7"
        assert glasser_adapter.confidence_tier == "A"
        assert glasser_adapter.rate_limit_per_minute == 0
        assert glasser_adapter.requires_auth is False
        assert len(glasser_adapter.DOMAINS) == 7
        assert len(glasser_adapter.PARCELS) >= 20
        await glasser_adapter.close()

    @pytest.mark.asyncio
    async def test_validate_connection_success(self, glasser_adapter):
        """Test connection validation with successful response."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        glasser_adapter.client.get = AsyncMock(return_value=mock_response)

        result = await glasser_adapter.validate_connection()
        assert result is True
        await glasser_adapter.close()

    @pytest.mark.asyncio
    async def test_validate_connection_failure(self, glasser_adapter):
        """Test connection validation falls back to built-in data."""
        glasser_adapter.client.get = AsyncMock(side_effect=httpx.ConnectError("Failed"))

        result = await glasser_adapter.validate_connection()
        assert result is True  # Built-in data available
        await glasser_adapter.close()

    @pytest.mark.asyncio
    async def test_search_parcel_by_name(self, glasser_adapter):
        """Test searching for a parcel by name."""
        glasser_adapter._load_builtin_atlas()
        results = await glasser_adapter.search("V1", {"search_type": "parcels", "limit": 10})
        assert len(results) >= 1
        assert any("V1" in r.get("name", "") for r in results)
        await glasser_adapter.close()

    @pytest.mark.asyncio
    async def test_search_parcel_by_number(self, glasser_adapter):
        """Test searching for a parcel by number."""
        glasser_adapter._load_builtin_atlas()
        results = await glasser_adapter.search("1", {"search_type": "parcels", "limit": 10})
        assert len(results) >= 1
        assert any(r.get("parcel_num") == 1 for r in results)
        await glasser_adapter.close()

    @pytest.mark.asyncio
    async def test_search_parcels_by_hemisphere(self, glasser_adapter):
        """Test filtering parcels by hemisphere."""
        glasser_adapter._load_builtin_atlas()
        results = await glasser_adapter.search(
            "*", {"search_type": "parcels", "hemisphere": "left", "limit": 30}
        )
        assert len(results) >= 1
        assert all(r.get("hemisphere") == "left" for r in results)
        await glasser_adapter.close()

    @pytest.mark.asyncio
    async def test_search_parcels_by_domain(self, glasser_adapter):
        """Test filtering parcels by domain."""
        glasser_adapter._load_builtin_atlas()
        results = await glasser_adapter.search(
            "*", {"search_type": "parcels", "domain_id": 1, "limit": 20}
        )
        assert len(results) >= 1
        assert all(r.get("domain_id") == 1 for r in results)
        await glasser_adapter.close()

    @pytest.mark.asyncio
    async def test_search_domain(self, glasser_adapter):
        """Test searching for a domain by name."""
        glasser_adapter._load_builtin_atlas()
        results = await glasser_adapter.search(
            "Default Mode", {"search_type": "domains", "limit": 10}
        )
        assert len(results) >= 1
        assert any("Default" in r.get("name", "") for r in results)
        await glasser_adapter.close()

    @pytest.mark.asyncio
    async def test_search_all_domains(self, glasser_adapter):
        """Test listing all domains."""
        glasser_adapter._load_builtin_atlas()
        results = await glasser_adapter.search("*", {"search_type": "domains", "limit": 20})
        assert len(results) == 7
        await glasser_adapter.close()

    @pytest.mark.asyncio
    async def test_transform_parcel(self, glasser_adapter):
        """Test parcel transformation to canonical format."""
        glasser_adapter._load_builtin_atlas()

        raw = {
            "parcel_key": "V1",
            "parcel_num": 1,
            "name": "Primary Visual Cortex (V1)",
            "hemisphere": "left",
            "domain_id": 1,
            "domain_name": "Visual",
            "area": "V1",
            "cortical_layer": "granular",
        }

        canonical = glasser_adapter.transform_to_canonical(raw)
        assert canonical["entity_type"] == "cortical_parcel"
        assert canonical["source_database"] == "glasser2016"
        assert canonical["source_id"] == "glasser_1"
        assert canonical["parcel_num"] == 1
        assert canonical["value"]["hemisphere"] == "left"
        assert canonical["value"]["domain_name"] == "Visual"
        assert canonical["coordinates"]["space"] == "fs_LR_32k"
        assert "confidence" in canonical
        assert "provenance" in canonical
        await glasser_adapter.close()

    @pytest.mark.asyncio
    async def test_transform_domain(self, glasser_adapter):
        """Test domain transformation to canonical format."""
        glasser_adapter._load_builtin_atlas()

        raw = {
            "domain_id": 7,
            "name": "Default Mode",
            "abbreviation": "DMN",
            "description": "Internally-directed cognition",
            "color": "#FFA500",
            "num_parcels": 39,
        }

        canonical = glasser_adapter.transform_to_canonical(raw)
        assert canonical["entity_type"] == "functional_network"
        assert canonical["source_database"] == "glasser2016"
        assert canonical["source_id"] == "glasser_domain_7"
        assert canonical["network"]["network_abbreviation"] == "DMN"
        assert canonical["value"]["color"] == "#FFA500"
        await glasser_adapter.close()

    @pytest.mark.asyncio
    async def test_get_provenance(self, glasser_adapter):
        """Test provenance metadata."""
        prov = glasser_adapter.get_provenance({})
        assert prov["source_database"] == "glasser2016"
        assert prov["confidence_tier"] == "A"
        assert prov["peer_reviewed"] is True
        assert prov["hcp_based"] is True
        assert prov["num_parcels"] == 360
        assert "citation" in prov
        await glasser_adapter.close()

    @pytest.mark.asyncio
    async def test_get_confidence_score(self, glasser_adapter):
        """Test confidence score."""
        scores = glasser_adapter.get_confidence_score({})
        assert scores["data_quality"] == 0.95
        assert scores["sample_size"] == 0.85
        assert scores["overall"] == 0.88
        await glasser_adapter.close()

    @pytest.mark.asyncio
    async def test_close(self, glasser_adapter):
        """Test adapter cleanup."""
        glasser_adapter.client.aclose = AsyncMock()
        await glasser_adapter.close()
        glasser_adapter.client.aclose.assert_called_once()


# =============================================================================
# Brainnetome Adapter Tests
# =============================================================================

class TestBrainnetomeAdapter:
    """Tests for the Brainnetome Atlas Adapter."""

    @pytest.mark.asyncio
    async def test_init(self, brainnetome_adapter):
        """Test adapter initialization."""
        assert brainnetome_adapter.name == "brainnetome"
        assert brainnetome_adapter.display_name == "Brainnetome Atlas"
        assert brainnetome_adapter.source_url == "http://atlas.brainnetome.org/"
        assert brainnetome_adapter.confidence_tier == "A"
        assert brainnetome_adapter.rate_limit_per_minute == 0
        assert brainnetome_adapter.requires_auth is False
        assert len(brainnetome_adapter.MAJOR_GROUPS) == 26
        assert len(brainnetome_adapter.REGIONS) >= 20
        await brainnetome_adapter.close()

    @pytest.mark.asyncio
    async def test_validate_connection_success(self, brainnetome_adapter):
        """Test connection validation with successful response."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        brainnetome_adapter.client.get = AsyncMock(return_value=mock_response)

        result = await brainnetome_adapter.validate_connection()
        assert result is True
        await brainnetome_adapter.close()

    @pytest.mark.asyncio
    async def test_validate_connection_failure(self, brainnetome_adapter):
        """Test connection validation falls back to built-in data."""
        brainnetome_adapter.client.get = AsyncMock(side_effect=httpx.ConnectError("Failed"))

        result = await brainnetome_adapter.validate_connection()
        assert result is True
        await brainnetome_adapter.close()

    @pytest.mark.asyncio
    async def test_search_region_by_name(self, brainnetome_adapter):
        """Test searching for a region by name."""
        brainnetome_adapter._load_builtin_atlas()
        results = await brainnetome_adapter.search("Hippocampus", {"search_type": "regions", "limit": 10})
        assert len(results) >= 1
        assert any("Hippocampus" in r.get("name", "") for r in results)
        await brainnetome_adapter.close()

    @pytest.mark.asyncio
    async def test_search_region_by_abbreviation(self, brainnetome_adapter):
        """Test searching for a region by abbreviation."""
        brainnetome_adapter._load_builtin_atlas()
        results = await brainnetome_adapter.search("A8m_L", {"search_type": "regions", "limit": 10})
        assert len(results) >= 1
        assert any("A8m" in r.get("abbreviation", "") for r in results)
        await brainnetome_adapter.close()

    @pytest.mark.asyncio
    async def test_search_regions_by_hemisphere(self, brainnetome_adapter):
        """Test filtering regions by hemisphere."""
        brainnetome_adapter._load_builtin_atlas()
        results = await brainnetome_adapter.search(
            "*", {"search_type": "regions", "hemisphere": "left", "limit": 30}
        )
        assert len(results) >= 1
        assert all(r.get("hemisphere") == "left" for r in results)
        await brainnetome_adapter.close()

    @pytest.mark.asyncio
    async def test_search_regions_by_lobe(self, brainnetome_adapter):
        """Test filtering regions by lobe."""
        brainnetome_adapter._load_builtin_atlas()
        results = await brainnetome_adapter.search(
            "*", {"search_type": "regions", "lobe": "Frontal", "limit": 30}
        )
        assert len(results) >= 1
        assert all(r.get("lobe") == "Frontal" for r in results)
        await brainnetome_adapter.close()

    @pytest.mark.asyncio
    async def test_search_regions_by_ba_area(self, brainnetome_adapter):
        """Test searching regions by Brodmann area."""
        brainnetome_adapter._load_builtin_atlas()
        results = await brainnetome_adapter.search(
            "BA 8", {"search_type": "regions", "limit": 10}
        )
        assert len(results) >= 1
        assert all("BA 8" in r.get("ba_area", "") for r in results)
        await brainnetome_adapter.close()

    @pytest.mark.asyncio
    async def test_search_groups(self, brainnetome_adapter):
        """Test searching for anatomical groups."""
        brainnetome_adapter._load_builtin_atlas()
        results = await brainnetome_adapter.search("Prefrontal", {"search_type": "groups", "limit": 10})
        assert len(results) >= 1
        assert any("Prefrontal" in r.get("name", "") for r in results)
        await brainnetome_adapter.close()

    @pytest.mark.asyncio
    async def test_search_lobes(self, brainnetome_adapter):
        """Test searching for lobes."""
        brainnetome_adapter._load_builtin_atlas()
        results = await brainnetome_adapter.search("Frontal", {"search_type": "lobes", "limit": 10})
        assert len(results) >= 1
        assert any("Frontal" == r.get("lobe_name", "") for r in results)
        await brainnetome_adapter.close()

    @pytest.mark.asyncio
    async def test_transform_region(self, brainnetome_adapter):
        """Test region transformation to canonical format."""
        brainnetome_adapter._load_builtin_atlas()

        raw = {
            "region_id": 1,
            "name": "Middle Frontal Gyrus, area 8m",
            "abbreviation": "A8m_L",
            "hemisphere": "left",
            "lobe": "Frontal",
            "group_id": 1,
            "group_name": "Prefrontal",
            "ba_area": "BA 8",
            "cytoarchitectonic": "agranular",
            "mni_coords": {"x": -22, "y": 22, "z": 52},
        }

        canonical = brainnetome_adapter.transform_to_canonical(raw)
        assert canonical["entity_type"] == "brain_region"
        assert canonical["source_database"] == "brainnetome"
        assert canonical["source_id"] == "1"
        assert canonical["coordinates"]["x"] == -22
        assert canonical["coordinates"]["y"] == 22
        assert canonical["coordinates"]["z"] == 52
        assert canonical["coordinates"]["space"] == "MNI152"
        assert canonical["value"]["total_regions"] == 246
        assert canonical["value"]["connectivity_based"] is True
        await brainnetome_adapter.close()

    @pytest.mark.asyncio
    async def test_transform_group(self, brainnetome_adapter):
        """Test group transformation."""
        brainnetome_adapter._load_builtin_atlas()

        raw = {
            "group_id": 1,
            "name": "Prefrontal",
            "lobe": "Frontal",
            "side": "left",
            "num_regions": 28,
            "regions_found": 4,
        }

        canonical = brainnetome_adapter.transform_to_canonical(raw)
        assert canonical["entity_type"] == "anatomical_group"
        assert canonical["source_database"] == "brainnetome"
        assert canonical["value"]["group_id"] == 1
        assert canonical["value"]["lobe"] == "Frontal"
        await brainnetome_adapter.close()

    @pytest.mark.asyncio
    async def test_transform_lobe(self, brainnetome_adapter):
        """Test lobe transformation."""
        brainnetome_adapter._load_builtin_atlas()

        raw = {
            "lobe_name": "Frontal",
            "num_regions": 68,
            "groups": ["Prefrontal", "Motor"],
        }

        canonical = brainnetome_adapter.transform_to_canonical(raw)
        assert canonical["entity_type"] == "brain_lobe"
        assert canonical["source_database"] == "brainnetome"
        assert canonical["value"]["lobe"] == "Frontal"
        assert canonical["value"]["total_regions"] == 246
        await brainnetome_adapter.close()

    @pytest.mark.asyncio
    async def test_get_provenance(self, brainnetome_adapter):
        """Test provenance metadata."""
        prov = brainnetome_adapter.get_provenance({})
        assert prov["source_database"] == "brainnetome"
        assert prov["confidence_tier"] == "A"
        assert prov["peer_reviewed"] is True
        assert prov["num_regions"] == 246
        assert prov["connectivity_based"] is True
        assert "citation" in prov
        await brainnetome_adapter.close()

    @pytest.mark.asyncio
    async def test_get_confidence_score(self, brainnetome_adapter):
        """Test confidence score."""
        result = {"mni_coords": {"x": -22, "y": 22, "z": 52}, "ba_area": "BA 8"}
        scores = brainnetome_adapter.get_confidence_score(result)
        assert scores["data_quality"] == 0.95  # has coords
        assert scores["evidence_strength"] == 0.93  # has BA
        assert "overall" in scores
        await brainnetome_adapter.close()

    @pytest.mark.asyncio
    async def test_close(self, brainnetome_adapter):
        """Test adapter cleanup."""
        brainnetome_adapter.client.aclose = AsyncMock()
        await brainnetome_adapter.close()
        brainnetome_adapter.client.aclose.assert_called_once()


# =============================================================================
# IXI Adapter Tests
# =============================================================================

class TestIxiAdapter:
    """Tests for the IXI Dataset Adapter."""

    @pytest.mark.asyncio
    async def test_init(self, ixi_adapter):
        """Test adapter initialization."""
        assert ixi_adapter.name == "ixi"
        assert ixi_adapter.display_name == "IXI Dataset - King's College London"
        assert ixi_adapter.source_url == "https://brain-development.org/ixi-dataset/"
        assert ixi_adapter.confidence_tier == "A"
        assert ixi_adapter.rate_limit_per_minute == 0
        assert ixi_adapter.requires_auth is False
        assert len(ixi_adapter.SITES) == 3
        await ixi_adapter.close()

    @pytest.mark.asyncio
    async def test_validate_connection_success(self, ixi_adapter):
        """Test connection validation with successful response."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        ixi_adapter.client.get = AsyncMock(return_value=mock_response)

        result = await ixi_adapter.validate_connection()
        assert result is True
        await ixi_adapter.close()

    @pytest.mark.asyncio
    async def test_validate_connection_failure(self, ixi_adapter):
        """Test connection validation falls back to built-in data."""
        ixi_adapter.client.get = AsyncMock(side_effect=httpx.ConnectError("Failed"))

        result = await ixi_adapter.validate_connection()
        assert result is True
        await ixi_adapter.close()

    @pytest.mark.asyncio
    async def test_search_subjects_by_id(self, ixi_adapter):
        """Test searching for subjects by ID."""
        results = await ixi_adapter.search("IXI001", {"search_type": "subjects", "limit": 10})
        assert len(results) >= 1
        assert results[0]["subject_id"] == "IXI001"
        await ixi_adapter.close()

    @pytest.mark.asyncio
    async def test_search_subjects_by_site(self, ixi_adapter):
        """Test searching subjects by site."""
        results = await ixi_adapter.search(
            "Guys", {"search_type": "subjects", "limit": 20}
        )
        assert len(results) >= 1
        assert all(r.get("site") == "Guys" for r in results)
        await ixi_adapter.close()

    @pytest.mark.asyncio
    async def test_search_subjects_with_age_filter(self, ixi_adapter):
        """Test searching subjects with age range."""
        results = await ixi_adapter.search(
            "*",
            {
                "search_type": "subjects",
                "age_min": 40,
                "age_max": 60,
                "limit": 30,
            },
        )
        assert len(results) >= 1
        for r in results:
            age = r.get("age")
            if age is not None:
                assert 40 <= age <= 60
        await ixi_adapter.close()

    @pytest.mark.asyncio
    async def test_search_subjects_by_sex(self, ixi_adapter):
        """Test filtering subjects by sex."""
        results = await ixi_adapter.search(
            "*", {"search_type": "subjects", "sex": 0, "limit": 20}
        )
        assert len(results) >= 1
        assert all(r.get("sex") == 0 for r in results)
        await ixi_adapter.close()

    @pytest.mark.asyncio
    async def test_search_sites(self, ixi_adapter):
        """Test searching for acquisition sites."""
        results = await ixi_adapter.search("Guy's", {"search_type": "sites", "limit": 10})
        assert len(results) >= 1
        assert any("Guy's" in r.get("name", "") for r in results)
        await ixi_adapter.close()

    @pytest.mark.asyncio
    async def test_search_all_sites(self, ixi_adapter):
        """Test listing all sites."""
        results = await ixi_adapter.search("*", {"search_type": "sites", "limit": 10})
        assert len(results) == 3  # 3 sites
        await ixi_adapter.close()

    @pytest.mark.asyncio
    async def test_search_demographics(self, ixi_adapter):
        """Test demographic summary search."""
        results = await ixi_adapter.search("*", {"search_type": "demographics"})
        assert len(results) == 1
        assert "total_subjects" in results[0]
        assert "age_statistics" in results[0]
        assert "sex_distribution" in results[0]
        await ixi_adapter.close()

    @pytest.mark.asyncio
    async def test_transform_subject(self, ixi_adapter):
        """Test subject transformation to canonical format."""
        raw = {
            "subject_id": "IXI001",
            "site": "Guys",
            "age": 35.2,
            "sex": 1,
            "ethnicity": "White",
            "height_cm": 175.0,
            "weight_kg": 72.5,
            "bmi": 23.7,
            "iq": 105,
            "has_t1": True,
            "has_t2": True,
            "has_mra": False,
        }

        canonical = ixi_adapter.transform_to_canonical(raw)
        assert canonical["entity_type"] == "neuroimaging_subject"
        assert canonical["source_database"] == "ixi"
        assert canonical["source_id"] == "IXI001"
        assert canonical["value"]["sex"] == "Male"
        assert canonical["value"]["age"] == 35.2
        assert canonical["value"]["bmi"] == 23.7
        assert canonical["value"]["modalities"]["T1"] is True
        assert canonical["value"]["modalities"]["T2"] is True
        assert "acquisition_params" in canonical["value"]
        await ixi_adapter.close()

    @pytest.mark.asyncio
    async def test_transform_site(self, ixi_adapter):
        """Test site transformation."""
        raw = {
            "site_code": "Guys",
            "name": "Guy's Hospital",
            "location": "London, UK",
            "scanner": "Philips 1.5T",
            "scanner_model": "Philips Gyroscan Intera",
            "field_strength": "1.5T",
            "manufacturer": "Philips",
            "t1_sequence": "3D T1-FFE",
            "voxel_size_t1_mm": (0.94, 0.94, 1.2),
        }

        canonical = ixi_adapter.transform_to_canonical(raw)
        assert canonical["entity_type"] == "acquisition_site"
        assert canonical["source_database"] == "ixi"
        assert canonical["value"]["field_strength"] == "1.5T"
        assert canonical["value"]["manufacturer"] == "Philips"
        await ixi_adapter.close()

    @pytest.mark.asyncio
    async def test_transform_demographics(self, ixi_adapter):
        """Test demographic summary transformation."""
        raw = {
            "total_subjects": 600,
            "age_statistics": {"mean": 48.5, "median": 47.0, "min": 20.1, "max": 85.8},
            "sex_distribution": {"Female": 318, "Male": 282},
            "modality_availability": {"t1": 600, "t2": 510, "mra": 180},
        }

        canonical = ixi_adapter.transform_to_canonical(raw)
        assert canonical["entity_type"] == "dataset_summary"
        assert canonical["source_database"] == "ixi"
        assert canonical["value"]["total_subjects"] == 600
        assert canonical["value"]["age_statistics"]["mean"] == 48.5
        await ixi_adapter.close()

    @pytest.mark.asyncio
    async def test_get_provenance(self, ixi_adapter):
        """Test provenance metadata."""
        prov = ixi_adapter.get_provenance({})
        assert prov["source_database"] == "ixi"
        assert prov["confidence_tier"] == "A"
        assert prov["healthy_population"] is True
        assert prov["num_subjects"] == 600
        assert prov["num_sites"] == 3
        await ixi_adapter.close()

    @pytest.mark.asyncio
    async def test_get_confidence_score_complete_record(self, ixi_adapter):
        """Test confidence score with complete record."""
        result = {
            "age": 35.0,
            "has_t1": True,
            "has_t2": True,
        }
        scores = ixi_adapter.get_confidence_score(result)
        assert scores["data_quality"] == 0.92  # has modalities
        assert scores["evidence_strength"] == 0.90  # has age
        assert "overall" in scores
        await ixi_adapter.close()

    @pytest.mark.asyncio
    async def test_get_confidence_score_minimal(self, ixi_adapter):
        """Test confidence score with minimal record."""
        result = {}
        scores = ixi_adapter.get_confidence_score(result)
        assert scores["data_quality"] == 0.90
        assert scores["evidence_strength"] == 0.85
        await ixi_adapter.close()

    @pytest.mark.asyncio
    async def test_get_dataset_summary(self, ixi_adapter):
        """Test dataset summary generation."""
        summary = await ixi_adapter.get_dataset_summary()
        assert summary["total_subjects"] == 600
        assert "age_statistics" in summary
        assert "by_sex" in summary
        assert "by_site" in summary
        assert "modality_counts" in summary
        await ixi_adapter.close()

    @pytest.mark.asyncio
    async def test_load_demographic_data(self, ixi_adapter):
        """Test loading demographic data."""
        data = await ixi_adapter._load_demographic_data()
        assert len(data) == 600
        assert "subject_id" in data[0]
        assert "age" in data[0]
        assert "sex" in data[0]
        await ixi_adapter.close()

    @pytest.mark.asyncio
    async def test_close(self, ixi_adapter):
        """Test adapter cleanup."""
        ixi_adapter.client.aclose = AsyncMock()
        await ixi_adapter.close()
        ixi_adapter.client.aclose.assert_called_once()


# =============================================================================
# Cross-adapter consistency tests
# =============================================================================

class TestCrossAdapterConsistency:
    """Verify all 5 adapters follow the same interface contract."""

    ADAPTER_CLASSES = [
        FunctionalConnectomes1000Adapter,
        NitrcAdapter,
        Glasser2016Adapter,
        BrainnetomeAdapter,
        IxiAdapter,
    ]

    def test_all_have_required_methods(self):
        """Test all adapters have required attributes."""
        for cls in self.ADAPTER_CLASSES:
            if cls in (FunctionalConnectomes1000Adapter, Glasser2016Adapter,
                       BrainnetomeAdapter, IxiAdapter):
                instance = cls(cache_dir="/tmp/test_cross")
            else:
                instance = cls()

            assert hasattr(instance, "name")
            assert hasattr(instance, "display_name")
            assert hasattr(instance, "source_url")
            assert hasattr(instance, "version")
            assert hasattr(instance, "confidence_tier")
            assert hasattr(instance, "data_types")
            assert hasattr(instance, "rate_limit_per_minute")
            assert hasattr(instance, "requires_auth")
            assert hasattr(instance, "auth_type")

            # Check attribute types
            assert isinstance(instance.name, str) and len(instance.name) > 0
            assert isinstance(instance.display_name, str) and len(instance.display_name) > 0
            assert isinstance(instance.source_url, str) and instance.source_url.startswith("http")
            assert isinstance(instance.version, str) and len(instance.version) > 0
            assert isinstance(instance.data_types, list) and len(instance.data_types) > 0
            assert isinstance(instance.rate_limit_per_minute, int) and instance.rate_limit_per_minute >= 0
            assert isinstance(instance.requires_auth, bool)

    def test_all_confidence_tier_values(self):
        """Test all adapters have valid confidence tier values."""
        for cls in self.ADAPTER_CLASSES:
            if cls in (FunctionalConnectomes1000Adapter, Glasser2016Adapter,
                       BrainnetomeAdapter, IxiAdapter):
                instance = cls(cache_dir="/tmp/test_cross")
            else:
                instance = cls()
            assert instance.confidence_tier in ("A", "B", "C")

    @pytest.mark.asyncio
    async def test_all_can_close(self):
        """Test all adapters can be closed properly."""
        adapters = [
            FunctionalConnectomes1000Adapter(cache_dir="/tmp/test_cross"),
            NitrcAdapter(),
            Glasser2016Adapter(cache_dir="/tmp/test_cross"),
            BrainnetomeAdapter(cache_dir="/tmp/test_cross"),
            IxiAdapter(cache_dir="/tmp/test_cross"),
        ]
        for adapter in adapters:
            adapter.client.aclose = AsyncMock()
            await adapter.close()
            adapter.client.aclose.assert_called_once()
