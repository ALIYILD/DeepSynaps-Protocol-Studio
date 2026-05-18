"""
Tests for Batch 1 Neuroimaging Adapters

Tests cover:
- Connection validation
- Search functionality
- Canonical transformation
- Provenance generation
- Confidence scoring
- Error handling
- Adapter lifecycle (close)

All HTTP requests are mocked to avoid real API calls.
Run with: pytest test_batch1_neuroimaging.py -v
"""

import pytest
import httpx
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch
import sys
import os

# Ensure adapters are importable
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Stub BaseAdapter for standalone testing
class BaseAdapter:
    """Minimal base adapter stub for testing without the full app."""
    pass

_ORIGINAL_APP_MODULES = {
    name: sys.modules.get(name)
    for name in ("app", "app.knowledge", "app.knowledge.base_adapter")
}

try:
    # Make the stub available only while importing these legacy flat modules.
    sys.modules["app"] = type(sys)("app")
    sys.modules["app.knowledge"] = type(sys)("app.knowledge")
    sys.modules["app.knowledge.base_adapter"] = type(sys)("app.knowledge.base_adapter")
    sys.modules["app.knowledge.base_adapter"].BaseAdapter = BaseAdapter

    from neurovault_adapter import NeurovaultAdapter
    from hcp_adapter import HcpAdapter
    from openneuro_adapter import OpenneuroAdapter
    from oasis_adapter import OasisAdapter
    from hcp_aging_adapter import HcpAgingAdapter
finally:
    for name, module in _ORIGINAL_APP_MODULES.items():
        if module is None:
            sys.modules.pop(name, None)
        else:
            sys.modules[name] = module


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def nv_adapter():
    return NeurovaultAdapter()


@pytest.fixture
def hcp_adapter():
    return HcpAdapter(api_key="test_key")


@pytest.fixture
def on_adapter():
    return OpenneuroAdapter()


@pytest.fixture
def oasis_adapter():
    return OasisAdapter(username="test_user", password="test_pass")


@pytest.fixture
def hcp_a_adapter():
    return HcpAgingAdapter(api_key="test_key")


# ---------------------------------------------------------------------------
# NeuroVault Adapter Tests
# ---------------------------------------------------------------------------

class TestNeurovaultAdapter:
    """Test suite for NeuroVault adapter."""

    @pytest.mark.asyncio
    async def test_init(self, nv_adapter):
        assert nv_adapter.name == "neurovault"
        assert nv_adapter.display_name == "NeuroVault"
        assert nv_adapter.source_url == "https://neurovault.org/api/"
        assert nv_adapter.confidence_tier == "B"
        assert nv_adapter.requires_auth is False
        assert nv_adapter.rate_limit_per_minute == 100

    @pytest.mark.asyncio
    async def test_validate_connection_success(self, nv_adapter):
        mock_response = MagicMock()
        mock_response.status_code = 200
        nv_adapter.client.get = AsyncMock(return_value=mock_response)

        result = await nv_adapter.validate_connection()

        assert result is True
        nv_adapter.client.get.assert_called_once()

    @pytest.mark.asyncio
    async def test_validate_connection_failure(self, nv_adapter):
        nv_adapter.client.get = AsyncMock(side_effect=httpx.ConnectError("Connection failed"))

        result = await nv_adapter.validate_connection()

        assert result is False

    @pytest.mark.asyncio
    async def test_search_images(self, nv_adapter):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json = MagicMock(
            return_value={
                "results": [
                    {
                        "id": 1234,
                        "name": "Faces vs Places contrast",
                        "modality": "fMRI-BOLD",
                        "map_type": "Z",
                        "cognitive_paradigm_cogatlas": "Faces/Places Localizer",
                        "number_of_subjects": 20,
                        "collection_id": 287,
                        "not_mni": False,
                        "image_width": 91,
                        "image_height": 109,
                        "url": "https://neurovault.org/images/1234/",
                        "file": "https://neurovault.org/media/images/287/faces_vs_places.nii.gz",
                    },
                    {
                        "id": 1235,
                        "name": "Working Memory 2-back",
                        "modality": "fMRI-BOLD",
                        "map_type": "T",
                        "cognitive_paradigm_cogatlas": "N-back Task",
                        "number_of_subjects": 45,
                        "collection_id": 288,
                        "not_mni": False,
                    },
                ]
            }
        )
        nv_adapter.client.get = AsyncMock(return_value=mock_response)

        results = await nv_adapter.search("working memory", {"search_type": "images", "limit": 10})

        assert len(results) >= 1
        assert any("working memory" in str(r.get("name", "")).lower() or
                   "working memory" in str(r.get("cognitive_paradigm_cogatlas", "")).lower()
                   for r in results)

    @pytest.mark.asyncio
    async def test_search_collections(self, nv_adapter):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json = MagicMock(
            return_value={
                "results": [
                    {"id": 287, "name": "Face Perception Study", "description": "fMRI faces"},
                    {"id": 288, "name": "Memory Networks", "description": "Working memory"},
                ]
            }
        )
        nv_adapter.client.get = AsyncMock(return_value=mock_response)

        results = await nv_adapter.search("memory", {"search_type": "collections"})

        assert len(results) == 1
        assert results[0]["name"] == "Memory Networks"

    @pytest.mark.asyncio
    async def test_transform_to_canonical(self, nv_adapter):
        raw = {
            "id": 1234,
            "name": "Faces vs Places contrast",
            "modality": "fMRI-BOLD",
            "map_type": "Z",
            "number_of_subjects": 20,
            "collection_id": 287,
            "not_mni": False,
            "image_width": 91,
            "image_height": 109,
            "url": "https://neurovault.org/images/1234/",
            "cognitive_paradigm_cogatlas": "Faces/Places Localizer",
            "cognitive_contrast_cogpo": "faces > places",
            "analysis_level": "G",
        }

        canonical = nv_adapter.transform_to_canonical(raw)

        assert canonical["entity_type"] == "statistical_map"
        assert canonical["source_database"] == "neurovault"
        assert canonical["source_id"] == "1234"
        assert canonical["name"] == "Faces vs Places contrast"
        assert canonical["unit"] == "statistical_map"
        assert "confidence" in canonical
        assert "provenance" in canonical
        assert canonical["raw_data"] == raw

    @pytest.mark.asyncio
    async def test_get_confidence_score(self, nv_adapter):
        raw = {
            "number_of_subjects": 100,
            "map_type": "Z",
            "not_mni": False,
            "analysis_level": "G",
            "collection_id": 287,
        }

        score = nv_adapter.get_confidence_score(raw)

        assert "overall" in score
        assert "data_quality" in score
        assert "sample_size" in score
        assert 0.0 <= score["overall"] <= 1.0
        assert score["data_quality"] == 0.7

    @pytest.mark.asyncio
    async def test_get_provenance(self, nv_adapter):
        raw = {"id": 1234, "url": "https://neurovault.org/images/1234/"}
        prov = nv_adapter.get_provenance(raw)

        assert prov["source_database"] == "neurovault"
        assert prov["confidence_tier"] == "B"
        assert "retrieved_at" in prov
        assert prov["is_user_contributed"] is True

    @pytest.mark.asyncio
    async def test_close(self, nv_adapter):
        nv_adapter.client.aclose = AsyncMock()
        await nv_adapter.close()
        nv_adapter.client.aclose.assert_called_once()


# ---------------------------------------------------------------------------
# HCP Adapter Tests
# ---------------------------------------------------------------------------

class TestHcpAdapter:
    """Test suite for Human Connectome Project adapter."""

    @pytest.mark.asyncio
    async def test_init(self, hcp_adapter):
        assert hcp_adapter.name == "hcp_young_adult"
        assert hcp_adapter.display_name == "Human Connectome Project - Young Adult"
        assert hcp_adapter.confidence_tier == "A"
        assert hcp_adapter.requires_auth is True
        assert hcp_adapter.auth_type == "api_key"

    @pytest.mark.asyncio
    async def test_validate_connection_success(self, hcp_adapter):
        mock_response = MagicMock()
        mock_response.status_code = 200
        hcp_adapter.client.get = AsyncMock(return_value=mock_response)

        result = await hcp_adapter.validate_connection()

        assert result is True

    @pytest.mark.asyncio
    async def test_search_subjects(self, hcp_adapter):
        results = await hcp_adapter.search("100206", {"search_type": "subjects"})

        assert len(results) == 1
        assert results[0]["subject_id"] == "100206"
        assert "available_modalities" in results[0]

    @pytest.mark.asyncio
    async def test_search_modalities(self, hcp_adapter):
        results = await hcp_adapter.search("*", {"search_type": "modalities"})

        assert len(results) == 6
        codes = [r["modality_code"] for r in results]
        assert "T1w" in codes
        assert "rfMRI" in codes
        assert "dMRI" in codes
        assert "MEG" in codes

    @pytest.mark.asyncio
    async def test_search_tasks(self, hcp_adapter):
        results = await hcp_adapter.search("WM", {"search_type": "tasks"})

        assert len(results) >= 1
        assert results[0]["task_name"] == "WM"

    @pytest.mark.asyncio
    async def test_transform_to_canonical(self, hcp_adapter):
        raw = {
            "subject_id": "100206",
            "modality_code": "T1w",
            "description": "T1-weighted structural MRI",
            "subjects_available": 1206,
            "preprocessing_pipeline": "HCP_Pipelines_T1w",
            "data_release": "S1200",
            "age_range": "22-35",
        }

        canonical = hcp_adapter.transform_to_canonical(raw)

        assert canonical["entity_type"] == "neuroimaging_session"
        assert canonical["source_database"] == "hcp_young_adult"
        assert canonical["subject_id"] == "100206"
        assert "acquisition_details" in canonical["value"]

    @pytest.mark.asyncio
    async def test_confidence_score(self, hcp_adapter):
        raw = {"subjects_available": 1206}
        score = hcp_adapter.get_confidence_score(raw)

        assert score["data_quality"] == 0.95
        assert score["overall"] > 0.85

    @pytest.mark.asyncio
    async def test_get_provenance(self, hcp_adapter):
        prov = hcp_adapter.get_provenance({})
        assert prov["source_database"] == "hcp_young_adult"
        assert prov["confidence_tier"] == "A"
        assert prov["peer_reviewed"] is True
        assert prov["nih_funded"] is True

    @pytest.mark.asyncio
    async def test_close(self, hcp_adapter):
        hcp_adapter.client.aclose = AsyncMock()
        await hcp_adapter.close()
        hcp_adapter.client.aclose.assert_called_once()


# ---------------------------------------------------------------------------
# OpenNeuro Adapter Tests
# ---------------------------------------------------------------------------

class TestOpenneuroAdapter:
    """Test suite for OpenNeuro adapter."""

    @pytest.mark.asyncio
    async def test_init(self, on_adapter):
        assert on_adapter.name == "openneuro"
        assert on_adapter.display_name == "OpenNeuro"
        assert on_adapter.graphql_url == "https://openneuro.org/crn/graphql"
        assert on_adapter.confidence_tier == "B"
        assert on_adapter.requires_auth is False

    @pytest.mark.asyncio
    async def test_validate_connection_success(self, on_adapter):
        mock_response = MagicMock()
        mock_response.status_code = 200
        on_adapter.client.post = AsyncMock(return_value=mock_response)

        result = await on_adapter.validate_connection()

        assert result is True

    @pytest.mark.asyncio
    async def test_validate_connection_failure(self, on_adapter):
        on_adapter.client.post = AsyncMock(side_effect=httpx.ConnectError("Failed"))

        result = await on_adapter.validate_connection()

        assert result is False

    @pytest.mark.asyncio
    async def test_search(self, on_adapter):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json = MagicMock(
            return_value={
                "data": {
                    "datasets": {
                        "edges": [
                            {
                                "node": {
                                    "id": "ds000001",
                                    "draft": {
                                        "id": "ds000001",
                                        "description": {
                                            "Name": "Balloon Analog Risk Task",
                                            "Authors": ["Poldrack RA"],
                                            "DatasetDOI": "10.18112/openneuro.ds000001.v1.0.0",
                                            "License": "PDDL",
                                            "Acknowledgements": "",
                                            "Funding": "NIH",
                                            "ReferencesAndLinks": [],
                                            "EthicsApprovals": [],
                                        },
                                        "summary": {
                                            "modalities": ["MRI"],
                                            "tasks": ["balloon analog risk task"],
                                            "subjectMetadata": [
                                                {"participantId": "sub-01", "age": 25, "sex": "M", "group": "control"}
                                            ],
                                            "totalFiles": 100,
                                            "size": 1073741824,
                                        },
                                        "readme": "This is a test dataset for BART.",
                                        "created": "2016-01-01",
                                        "modified": "2023-01-01",
                                    },
                                }
                            }
                        ],
                        "pageInfo": {"hasNextPage": False, "endCursor": "abc"},
                    }
                }
            }
        )
        on_adapter.client.post = AsyncMock(return_value=mock_response)

        results = await on_adapter.search("balloon", {"limit": 5})

        assert len(results) == 1
        assert results[0]["id"] == "ds000001"
        assert results[0]["name"] == "Balloon Analog Risk Task"
        assert results[0]["modalities"] == ["MRI"]

    @pytest.mark.asyncio
    async def test_transform_to_canonical(self, on_adapter):
        raw = {
            "id": "ds000001",
            "name": "Balloon Analog Risk Task",
            "authors": ["Poldrack RA"],
            "doi": "10.18112/openneuro.ds000001.v1.0.0",
            "license": "PDDL",
            "modalities": ["MRI"],
            "tasks": ["balloon analog risk task"],
            "subjects": [
                {"participantId": "sub-01", "age": 25, "sex": "M", "group": "control"}
            ],
            "total_files": 100,
            "size": 1073741824,
            "readme": "Test dataset",
            "created": "2016-01-01",
            "modified": "2023-01-01",
            "url": "https://openneuro.org/datasets/ds000001",
        }

        canonical = on_adapter.transform_to_canonical(raw)

        assert canonical["entity_type"] == "bids_dataset"
        assert canonical["source_database"] == "openneuro"
        assert canonical["source_id"] == "ds000001"
        assert canonical["doi"] == "10.18112/openneuro.ds000001.v1.0.0"
        assert canonical["value"]["subjects"]["count"] == 1
        assert canonical["value"]["bids_compliant"] is True

    @pytest.mark.asyncio
    async def test_confidence_score(self, on_adapter):
        raw = {
            "subjects": [{"participantId": "sub-01"}],
            "doi": "10.1234/test",
            "modalities": ["MRI"],
            "total_files": 200,
        }
        score = on_adapter.get_confidence_score(raw)

        assert "overall" in score
        assert 0.0 <= score["overall"] <= 1.0
        assert score["replication"] == 0.7  # has DOI

    @pytest.mark.asyncio
    async def test_get_provenance(self, on_adapter):
        prov = on_adapter.get_provenance({"url": "https://openneuro.org/datasets/ds000001"})
        assert prov["source_database"] == "openneuro"
        assert prov["bids_compliant"] is True

    @pytest.mark.asyncio
    async def test_close(self, on_adapter):
        on_adapter.client.aclose = AsyncMock()
        await on_adapter.close()
        on_adapter.client.aclose.assert_called_once()


# ---------------------------------------------------------------------------
# OASIS Adapter Tests
# ---------------------------------------------------------------------------

class TestOasisAdapter:
    """Test suite for OASIS adapter."""

    @pytest.mark.asyncio
    async def test_init(self, oasis_adapter):
        assert oasis_adapter.name == "oasis"
        assert oasis_adapter.display_name == "OASIS - Open Access Series of Imaging Studies"
        assert oasis_adapter.confidence_tier == "A"
        assert oasis_adapter.requires_auth is True
        assert oasis_adapter.auth_type == "basic"

    @pytest.mark.asyncio
    async def test_validate_connection_success(self, oasis_adapter):
        mock_response = MagicMock()
        mock_response.status_code = 200
        oasis_adapter.client.get = AsyncMock(return_value=mock_response)

        result = await oasis_adapter.validate_connection()

        assert result is True

    @pytest.mark.asyncio
    async def test_validate_connection_401_still_valid(self, oasis_adapter):
        """401 is expected for XNAT Central without auth cookies."""
        mock_response = MagicMock()
        mock_response.status_code = 401
        oasis_adapter.client.get = AsyncMock(return_value=mock_response)

        result = await oasis_adapter.validate_connection()

        assert result is True

    @pytest.mark.asyncio
    async def test_search_projects(self, oasis_adapter):
        results = await oasis_adapter.search("OASIS3", {"search_type": "projects"})

        assert len(results) == 1
        assert results[0]["project_id"] == "OASIS3"
        assert results[0]["subjects"] == 1378

    @pytest.mark.asyncio
    async def test_search_subjects(self, oasis_adapter):
        results = await oasis_adapter.search(
            "OAS30001", {"search_type": "subjects", "project": "OASIS3"}
        )

        assert len(results) == 1
        assert results[0]["subject_id"] == "OAS30001"
        assert results[0]["project"] == "OASIS3"

    @pytest.mark.asyncio
    async def test_transform_to_canonical(self, oasis_adapter):
        raw = {
            "project_id": "OASIS3",
            "name": "OASIS-3 Longitudinal",
            "subjects": 1378,
            "age_range": "42-95",
            "modalities": ["T1w", "T2w", "FLAIR", "ASL", "SWI", "PET"],
            "has_clinical_data": True,
            "xnat_url": "https://central.xnat.org/data/projects/OASIS3",
        }

        canonical = oasis_adapter.transform_to_canonical(raw, "dataset")

        assert canonical["entity_type"] == "dataset"
        assert canonical["source_database"] == "oasis"
        assert canonical["project"] == "OASIS3"
        assert canonical["value"]["clinical_info"]["has_clinical_data"] is True
        assert "PET" in canonical["value"]["available_modalities"]

    @pytest.mark.asyncio
    async def test_confidence_score(self, oasis_adapter):
        raw = {"project": "OASIS3", "has_clinical_data": True, "subjects": 1378}
        score = oasis_adapter.get_confidence_score(raw)

        assert score["data_quality"] == 0.92
        assert score["replication"] == 0.90
        assert score["overall"] > 0.80

    @pytest.mark.asyncio
    async def test_get_provenance(self, oasis_adapter):
        prov = oasis_adapter.get_provenance({"xnat_url": "https://central.xnat.org/data/projects/OASIS3"})
        assert prov["source_database"] == "oasis"
        assert prov["longitudinal"] is True
        assert prov["confidence_tier"] == "A"

    @pytest.mark.asyncio
    async def test_all_projects_search(self, oasis_adapter):
        results = await oasis_adapter.search("*", {"search_type": "projects"})
        assert len(results) == 4
        project_ids = [r["project_id"] for r in results]
        assert "OASIS1" in project_ids
        assert "OASIS2" in project_ids
        assert "OASIS3" in project_ids
        assert "OASIS4" in project_ids

    @pytest.mark.asyncio
    async def test_close(self, oasis_adapter):
        oasis_adapter.client.aclose = AsyncMock()
        await oasis_adapter.close()
        oasis_adapter.client.aclose.assert_called_once()


# ---------------------------------------------------------------------------
# HCP Aging Adapter Tests
# ---------------------------------------------------------------------------

class TestHcpAgingAdapter:
    """Test suite for HCP-Aging adapter."""

    @pytest.mark.asyncio
    async def test_init(self, hcp_a_adapter):
        assert hcp_a_adapter.name == "hcp_aging"
        assert hcp_a_adapter.display_name == "HCP-Aging / AABC Lifespan"
        assert hcp_a_adapter.confidence_tier == "A"
        assert hcp_a_adapter.requires_auth is True

    @pytest.mark.asyncio
    async def test_validate_connection_success(self, hcp_a_adapter):
        mock_response = MagicMock()
        mock_response.status_code = 200
        hcp_a_adapter.client.get = AsyncMock(return_value=mock_response)

        result = await hcp_a_adapter.validate_connection()

        assert result is True

    @pytest.mark.asyncio
    async def test_search_subjects(self, hcp_a_adapter):
        results = await hcp_a_adapter.search(
            "HCP12001", {"search_type": "subjects", "age_min": 60, "age_max": 80}
        )

        assert len(results) == 1
        assert results[0]["subject_id"] == "HCP12001"
        assert results[0]["age_range"] == "60-80"
        assert "V1" in results[0]["timepoints"]

    @pytest.mark.asyncio
    async def test_search_modalities(self, hcp_a_adapter):
        results = await hcp_a_adapter.search("*", {"search_type": "modalities"})

        assert len(results) == 5
        assert any(r["modality_code"] == "T1w" for r in results)
        assert any(r["modality_code"] == "dMRI" for r in results)

    @pytest.mark.asyncio
    async def test_search_assessments(self, hcp_a_adapter):
        results = await hcp_a_adapter.search("Cognition", {"search_type": "assessments"})

        assert len(results) >= 1
        assert results[0]["assessment_name"] == "Cognition"

    @pytest.mark.asyncio
    async def test_transform_to_canonical(self, hcp_a_adapter):
        raw = {
            "subject_id": "HCP12001",
            "modality_code": "T1w",
            "description": "Structural T1w MRI",
            "subjects_available": 725,
            "age_range": "36-100+",
            "preprocessing_pipeline": "HCP_Lifespan_T1w",
            "timepoints": ["V1", "V2"],
            "data_release": "HCP-Aging_Release_2.0",
        }

        canonical = hcp_a_adapter.transform_to_canonical(raw)

        assert canonical["entity_type"] == "neuroimaging_session"
        assert canonical["source_database"] == "hcp_aging"
        assert canonical["value"]["age_range"] == "36-100+"
        assert canonical["value"]["timepoints"] == ["V1", "V2"]
        assert "behavioral_measures" in canonical["value"]

    @pytest.mark.asyncio
    async def test_confidence_score(self, hcp_a_adapter):
        raw = {"subjects_available": 725}
        score = hcp_a_adapter.get_confidence_score(raw)

        assert score["data_quality"] == 0.95
        assert score["consistency"] == 0.94
        assert score["overall"] >= 0.88

    @pytest.mark.asyncio
    async def test_get_provenance(self, hcp_a_adapter):
        prov = hcp_a_adapter.get_provenance({})
        assert prov["source_database"] == "hcp_aging"
        assert prov["longitudinal"] is True
        assert prov["nih_funded"] is True

    @pytest.mark.asyncio
    async def test_close(self, hcp_a_adapter):
        hcp_a_adapter.client.aclose = AsyncMock()
        await hcp_a_adapter.close()
        hcp_a_adapter.client.aclose.assert_called_once()


# ---------------------------------------------------------------------------
# Cross-adapter consistency tests
# ---------------------------------------------------------------------------

class TestCrossAdapterConsistency:
    """Verify all adapters follow the same interface contract."""

    ADAPTER_CLASSES = [
        NeurovaultAdapter,
        HcpAdapter,
        OpenneuroAdapter,
        OasisAdapter,
        HcpAgingAdapter,
    ]

    def test_all_have_required_methods(self):
        for cls in self.ADAPTER_CLASSES:
            instance = cls() if cls in (NeurovaultAdapter, OpenneuroAdapter) else cls(api_key="test") if cls in (HcpAdapter, HcpAgingAdapter) else cls(username="u", password="p")
            assert hasattr(instance, "name")
            assert hasattr(instance, "display_name")
            assert hasattr(instance, "source_url")
            assert hasattr(instance, "version")
            assert hasattr(instance, "confidence_tier")
            assert hasattr(instance, "data_types")
            assert hasattr(instance, "rate_limit_per_minute")
            assert hasattr(instance, "requires_auth")
            assert hasattr(instance, "auth_type")

    def test_all_have_confidence_tier_values(self):
        for cls in self.ADAPTER_CLASSES:
            instance = cls() if cls in (NeurovaultAdapter, OpenneuroAdapter) else cls(api_key="test") if cls in (HcpAdapter, HcpAgingAdapter) else cls(username="u", password="p")
            assert instance.confidence_tier in ("A", "B", "C")

    def test_all_required_attributes_set(self):
        for cls in self.ADAPTER_CLASSES:
            instance = cls() if cls in (NeurovaultAdapter, OpenneuroAdapter) else cls(api_key="test") if cls in (HcpAdapter, HcpAgingAdapter) else cls(username="u", password="p")
            assert isinstance(instance.name, str) and len(instance.name) > 0
            assert isinstance(instance.display_name, str) and len(instance.display_name) > 0
            assert isinstance(instance.source_url, str) and instance.source_url.startswith("http")
            assert isinstance(instance.version, str) and len(instance.version) > 0
            assert isinstance(instance.data_types, list) and len(instance.data_types) > 0
            assert isinstance(instance.rate_limit_per_minute, int) and instance.rate_limit_per_minute > 0
            assert isinstance(instance.requires_auth, bool)

    @pytest.mark.asyncio
    async def test_all_can_close(self):
        adapters = [
            NeurovaultAdapter(),
            HcpAdapter(api_key="test"),
            OpenneuroAdapter(),
            OasisAdapter(username="u", password="p"),
            HcpAgingAdapter(api_key="test"),
        ]
        for adapter in adapters:
            adapter.client.aclose = AsyncMock()
            await adapter.close()
            adapter.client.aclose.assert_called_once()
