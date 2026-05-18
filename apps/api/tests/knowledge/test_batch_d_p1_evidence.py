"""
Test Suite for Batch D Evidence/Literature Database Adapters
=============================================================
Comprehensive unit tests for:
  - AHRQEPSSAdapter (USPSTF preventive service recommendations)
  - TRIPDatabaseAdapter (Clinical search engine)
  - EpistemonikosAdapter (Systematic review database)
  - NIHRePORTERAdapter (NIH funded research projects)
  - COREAdapter (Open access research aggregator)
  - BioRxivAdapter (Preprint server)

All external HTTP calls are mocked using unittest.mock + pytest-asyncio.
"""

import json
import sys
from datetime import datetime
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

# Ensure adapters are importable
sys.path.insert(0, str(Path(__file__).parent))

from ahrq_epss_adapter import AHRQEPSSAdapter
from trip_database_adapter import TRIPDatabaseAdapter
from epistemonikos_adapter import EpistemonikosAdapter
from nih_reporter_adapter import NIHRePORTERAdapter
from core_adapter import COREAdapter
from biorxiv_adapter import BioRxivAdapter


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def ahrq_adapter():
    return AHRQEPSSAdapter()


@pytest.fixture
def trip_adapter():
    return TRIPDatabaseAdapter(api_key="test_key")


@pytest.fixture
def epistemonikos_adapter():
    return EpistemonikosAdapter(api_key="test_key")


@pytest.fixture
def nih_adapter():
    return NIHRePORTERAdapter()


@pytest.fixture
def core_adapter():
    return COREAdapter(api_key="test_core_key")


@pytest.fixture
def biorxiv_adapter():
    return BioRxivAdapter()


@pytest.fixture
def mock_httpx_response():
    """Factory for creating mocked httpx responses."""
    def _make(json_data=None, text="", status_code=200, headers=None):
        response = MagicMock(spec=httpx.Response)
        response.status_code = status_code
        response.headers = headers or {"content-type": "application/json"}
        if json_data is not None:
            response.json.return_value = json_data
            response.text = json.dumps(json_data)
        else:
            response.json.side_effect = Exception("No JSON")
            response.text = text
        return response
    return _make


# ==========================================================================
# AHRQEPSSAdapter Tests
# ==========================================================================

class TestAHRQEPSSAdapter:

    @pytest.mark.asyncio
    async def test_validate_connection_success(self, ahrq_adapter, mock_httpx_response):
        """AHRQ ePSS connection validation succeeds."""
        mock_resp = mock_httpx_response(text="<html><body>AHRQ ePSS</body></html>")
        with patch.object(ahrq_adapter.client, "get", new_callable=AsyncMock, return_value=mock_resp):
            result = await ahrq_adapter.validate_connection()
        assert result is True

    @pytest.mark.asyncio
    async def test_validate_connection_failure(self, ahrq_adapter, mock_httpx_response):
        """AHRQ ePSS connection validation fails on HTTP error."""
        mock_resp = mock_httpx_response(status_code=503)
        with patch.object(ahrq_adapter.client, "get", new_callable=AsyncMock, return_value=mock_resp):
            result = await ahrq_adapter.validate_connection()
        assert result is False

    @pytest.mark.asyncio
    async def test_search_returns_recommendations(self, ahrq_adapter, mock_httpx_response):
        """AHRQ ePSS search returns USPSTF recommendations."""
        mock_resp = mock_httpx_response(json_data={
            "recommendations": [
                {
                    "id": "USPSTF-COL-2021",
                    "title": "Screening for Colorectal Cancer",
                    "topic": "Colorectal cancer screening",
                    "grade": "A",
                    "category": "cancer_screening",
                    "serviceType": "screening",
                    "recommendation": "Screen for colorectal cancer starting at age 45.",
                    "rationale": "Adequate evidence screening reduces CRC mortality.",
                    "targetPopulation": "Adults aged 45-75",
                    "ageRange": "45-75",
                    "sex": "all",
                    "riskFactors": ["family history", "Lynch syndrome"],
                    "date": "2021-05-18",
                    "updateDate": "2021-05-18",
                },
                {
                    "id": "USPSTF-BP-2021",
                    "title": "Screening for High Blood Pressure",
                    "topic": "Hypertension screening",
                    "grade": "A",
                    "category": "cardiovascular_prevention",
                    "serviceType": "screening",
                    "recommendation": "Screen adults 18+ for hypertension.",
                    "targetPopulation": "Adults aged 18 and older",
                    "ageRange": "18+",
                    "sex": "all",
                    "date": "2021-04-27",
                },
            ]
        })
        with patch.object(ahrq_adapter.client, "get", new_callable=AsyncMock, return_value=mock_resp):
            results = await ahrq_adapter.search("cancer screening", filters={"max_results": 2})
        assert len(results) == 2
        assert results[0]["id"] == "USPSTF-COL-2021"
        assert results[0]["grade"] == "A"
        assert results[0]["_query"] == "cancer screening"

    @pytest.mark.asyncio
    async def test_search_no_results(self, ahrq_adapter, mock_httpx_response):
        """AHRQ ePSS search handles zero results."""
        mock_resp = mock_httpx_response(json_data={"recommendations": []})
        with patch.object(ahrq_adapter.client, "get", new_callable=AsyncMock, return_value=mock_resp):
            results = await ahrq_adapter.search("xyznonexistentquery")
        assert results == []

    @pytest.mark.asyncio
    async def test_search_with_age_sex_filters(self, ahrq_adapter, mock_httpx_response):
        """AHRQ ePSS search applies age and sex filters."""
        mock_resp = mock_httpx_response(json_data={
            "recommendations": [
                {"id": "BRCA", "title": "BRCA Screening", "grade": "B", "sex": "female", "ageRange": "35-65"}
            ]
        })
        with patch.object(ahrq_adapter.client, "get", new_callable=AsyncMock, return_value=mock_resp):
            results = await ahrq_adapter.search(
                "BRCA", filters={"age_min": 35, "age_max": 65, "sex": "female", "max_results": 1}
            )
        assert len(results) == 1
        assert results[0]["id"] == "BRCA"

    @pytest.mark.asyncio
    async def test_search_http_error(self, ahrq_adapter, mock_httpx_response):
        """AHRQ ePSS search handles HTTP errors."""
        mock_resp = mock_httpx_response(status_code=500)
        with patch.object(ahrq_adapter.client, "get", new_callable=AsyncMock, return_value=mock_resp):
            results = await ahrq_adapter.search("test")
        assert results == []

    def test_transform_to_canonical(self, ahrq_adapter):
        """AHRQ raw data transforms to canonical format."""
        raw = {
            "id": "USPSTF-COL-2021",
            "title": "Screening for Colorectal Cancer",
            "grade": "A",
            "category": "cancer_screening",
            "serviceType": "screening",
            "recommendation": "Screen for colorectal cancer.",
            "rationale": "Strong evidence base.",
            "targetPopulation": "Adults 45-75",
            "ageRange": "45-75",
            "sex": "all",
            "riskFactors": ["family history"],
            "date": "2021-05-18",
            "url": "https://example.com/col",
        }
        canonical = ahrq_adapter.transform_to_canonical(raw)
        assert canonical["source_database"] == "ahrq_epss"
        assert canonical["source_id"] == "USPSTF-COL-2021"
        assert canonical["evidence_grade"] == "A"
        assert canonical["grade"] == "A"
        assert canonical["category"] == "cancer_screening"
        assert len(canonical["risk_factors"]) == 1
        assert "confidence" in canonical
        assert "provenance" in canonical

    def test_transform_grade_b(self, ahrq_adapter):
        """Grade B recommendation gets appropriate confidence."""
        raw = {"id": "G2", "title": "Test B", "grade": "B"}
        canonical = ahrq_adapter.transform_to_canonical(raw)
        assert canonical["evidence_grade"] == "B"
        assert canonical["confidence"]["evidence_strength"] == 0.92

    def test_transform_grade_d(self, ahrq_adapter):
        """Grade D recommendation gets lower confidence."""
        raw = {"id": "G3", "title": "Test D", "grade": "D"}
        canonical = ahrq_adapter.transform_to_canonical(raw)
        assert canonical["evidence_grade"] == "D"
        assert canonical["confidence"]["evidence_strength"] == 0.70

    def test_get_provenance(self, ahrq_adapter):
        """AHRQ provenance has USPSTF-specific metadata."""
        prov = ahrq_adapter.get_provenance({"grade": "A", "lastUpdated": "2021-05-18"})
        assert prov["source_database"] == "ahrq_epss"
        assert prov["confidence_tier"] == "A"
        assert prov["federal_mandate"] is True
        assert prov["aca_coverage_required"] is True
        assert prov["curation_status"] == "uspstf_expert_panel"

    def test_get_confidence_score_grade_a(self, ahrq_adapter):
        """Grade A recommendation gets highest confidence."""
        score = ahrq_adapter.get_confidence_score({"grade": "A", "evidenceBase": "N=150,000"})
        assert score["evidence_strength"] == 0.98
        assert score["overall"] >= 0.90

    def test_get_confidence_score_grade_i(self, ahrq_adapter):
        """Grade I recommendation gets lowest confidence."""
        score = ahrq_adapter.get_confidence_score({"grade": "I"})
        assert score["evidence_strength"] == 0.50

    def test_parse_age_range(self, ahrq_adapter):
        """Age range parsing works correctly."""
        assert ahrq_adapter._parse_age_range("18-39") == {"min": 18, "max": 39}
        assert ahrq_adapter._parse_age_range("65+") == {"min": 65, "max": None}
        assert ahrq_adapter._parse_age_range("") == {"min": None, "max": None}

    @pytest.mark.asyncio
    async def test_fetch_recommendation_detail(self, ahrq_adapter, mock_httpx_response):
        """Fetch specific recommendation detail."""
        mock_resp = mock_httpx_response(json_data={
            "id": "DETAIL-1", "title": "Detail", "grade": "A"
        })
        with patch.object(ahrq_adapter.client, "get", new_callable=AsyncMock, return_value=mock_resp):
            detail = await ahrq_adapter.fetch_recommendation_detail("DETAIL-1")
        assert detail is not None
        assert detail["id"] == "DETAIL-1"

    @pytest.mark.asyncio
    async def test_fetch_recommendation_detail_404(self, ahrq_adapter, mock_httpx_response):
        """Fetch detail returns None for non-existent ID."""
        mock_resp = mock_httpx_response(status_code=404)
        with patch.object(ahrq_adapter.client, "get", new_callable=AsyncMock, return_value=mock_resp):
            detail = await ahrq_adapter.fetch_recommendation_detail("MISSING")
        assert detail is None

    @pytest.mark.asyncio
    async def test_get_categories(self, ahrq_adapter):
        """Get preventive service categories."""
        cats = await ahrq_adapter.get_categories()
        assert len(cats) > 0
        codes = [c["code"] for c in cats]
        assert "cancer_screening" in codes
        assert "cardiovascular_prevention" in codes


# ==========================================================================
# TRIPDatabaseAdapter Tests
# ==========================================================================

class TestTRIPDatabaseAdapter:

    @pytest.mark.asyncio
    async def test_validate_connection_success(self, trip_adapter, mock_httpx_response):
        """TRIP connection validation succeeds."""
        mock_resp = mock_httpx_response(text="<html><body>TRIP Database</body></html>")
        with patch.object(trip_adapter.client, "get", new_callable=AsyncMock, return_value=mock_resp):
            result = await trip_adapter.validate_connection()
        assert result is True

    @pytest.mark.asyncio
    async def test_validate_connection_failure(self, trip_adapter, mock_httpx_response):
        """TRIP connection validation fails on HTTP error."""
        mock_resp = mock_httpx_response(status_code=503)
        with patch.object(trip_adapter.client, "get", new_callable=AsyncMock, return_value=mock_resp):
            result = await trip_adapter.validate_connection()
        assert result is False

    @pytest.mark.asyncio
    async def test_search_returns_results(self, trip_adapter, mock_httpx_response):
        """TRIP search returns evidence results."""
        mock_resp = mock_httpx_response(json_data={
            "results": [
                {
                    "id": "TRIP-1",
                    "title": "Diabetes management guidelines",
                    "abstract": "Clinical guidance for type 2 diabetes.",
                    "authors": ["Smith J", "Doe A"],
                    "source": "BMJ",
                    "date": "2024-01-15",
                    "doi": "10.1136/bmj.example",
                    "type": "Guideline",
                    "url": "https://example.com/1",
                    "peerReviewed": True,
                    "openAccess": True,
                },
                {
                    "id": "TRIP-2",
                    "title": "Systematic review of diabetes treatments",
                    "abstract": "SR of pharmacological interventions.",
                    "authors": "Lee K, Wang L",
                    "source": "Cochrane Database",
                    "date": "2023-11-01",
                    "doi": "10.1002/cochrane.test",
                    "type": "Systematic Review",
                    "url": "https://example.com/2",
                    "peerReviewed": True,
                    "openAccess": False,
                },
            ]
        })
        with patch.object(trip_adapter.client, "get", new_callable=AsyncMock, return_value=mock_resp):
            results = await trip_adapter.search("diabetes management", filters={"max_results": 2})
        assert len(results) == 2
        assert results[0]["id"] == "TRIP-1"
        assert results[0]["_query"] == "diabetes management"

    @pytest.mark.asyncio
    async def test_search_no_results(self, trip_adapter, mock_httpx_response):
        """TRIP search handles zero results."""
        mock_resp = mock_httpx_response(json_data={"results": []})
        with patch.object(trip_adapter.client, "get", new_callable=AsyncMock, return_value=mock_resp):
            results = await trip_adapter.search("xyznonexistent")
        assert results == []

    @pytest.mark.asyncio
    async def test_search_with_evidence_type_filter(self, trip_adapter, mock_httpx_response):
        """TRIP search applies evidence type filter."""
        mock_resp = mock_httpx_response(json_data={
            "results": [{"id": "G1", "title": "Guideline X", "type": "Guideline"}]
        })
        with patch.object(trip_adapter.client, "get", new_callable=AsyncMock, return_value=mock_resp):
            results = await trip_adapter.search("x", filters={"evidence_type": "guideline", "max_results": 1})
        assert len(results) == 1
        assert results[0]["type"] == "Guideline"

    @pytest.mark.asyncio
    async def test_search_http_error(self, trip_adapter, mock_httpx_response):
        """TRIP search handles HTTP errors."""
        mock_resp = mock_httpx_response(status_code=500)
        with patch.object(trip_adapter.client, "get", new_callable=AsyncMock, return_value=mock_resp):
            results = await trip_adapter.search("test")
        assert results == []

    def test_transform_to_canonical(self, trip_adapter):
        """TRIP raw data transforms to canonical format."""
        raw = {
            "id": "TRIP-1",
            "title": "Diabetes Guidelines",
            "abstract": "Clinical guidance.",
            "authors": ["Smith J", "Doe A"],
            "source": "BMJ",
            "date": "2024-01-15",
            "doi": "10.1136/bmj.example",
            "type": "Guideline",
            "url": "https://example.com/1",
            "peerReviewed": True,
            "openAccess": True,
        }
        canonical = trip_adapter.transform_to_canonical(raw)
        assert canonical["source_database"] == "trip_database"
        assert canonical["evidence_type"] == "guideline"
        assert canonical["evidence_grade"] == "A"
        assert canonical["is_open_access"] is True
        assert canonical["peer_reviewed"] is True

    def test_transform_systematic_review(self, trip_adapter):
        """Systematic review type gets grade A."""
        raw = {"id": "1", "title": "SR", "type": "Systematic Review"}
        canonical = trip_adapter.transform_to_canonical(raw)
        assert canonical["evidence_grade"] == "A"

    def test_transform_string_authors(self, trip_adapter):
        """TRIP handles comma-separated string authors."""
        raw = {"id": "1", "title": "Test", "authors": "Smith J, Doe A", "date": "2024-01-01"}
        canonical = trip_adapter.transform_to_canonical(raw)
        assert isinstance(canonical["authors"], list)
        assert "Smith J" in canonical["authors"]

    def test_get_provenance(self, trip_adapter):
        """TRIP provenance has correct metadata."""
        prov = trip_adapter.get_provenance({"type": "Guideline", "peerReviewed": True})
        assert prov["confidence_tier"] == "B"
        assert prov["curation_status"] == "trip_aggregated"

    def test_get_confidence_score_guideline(self, trip_adapter):
        """TRIP guideline gets high confidence."""
        score = trip_adapter.get_confidence_score({
            "type": "Guideline", "peerReviewed": True, "openAccess": True
        })
        assert score["evidence_strength"] == 0.94
        assert score["overall"] >= 0.80

    def test_get_confidence_score_case_report(self, trip_adapter):
        """TRIP case report gets lower confidence."""
        score = trip_adapter.get_confidence_score({
            "type": "Case Report", "peerReviewed": True, "openAccess": False
        })
        assert score["evidence_strength"] == 0.50

    def test_detect_evidence_type(self, trip_adapter):
        """Evidence type detection from raw data works."""
        assert trip_adapter._detect_evidence_type({"type": "Systematic Review"}) == "systematic_review"
        assert trip_adapter._detect_evidence_type({"type": "Randomised Controlled Trial"}) == "rct"
        assert trip_adapter._detect_evidence_type({"type": "unknown"}) == "primary_research"

    @pytest.mark.asyncio
    async def test_fetch_document_detail(self, trip_adapter, mock_httpx_response):
        """Fetch specific TRIP document detail."""
        mock_resp = mock_httpx_response(json_data={"id": "D1", "title": "Detail"})
        with patch.object(trip_adapter.client, "get", new_callable=AsyncMock, return_value=mock_resp):
            detail = await trip_adapter.fetch_document_detail("D1")
        assert detail is not None
        assert detail["id"] == "D1"

    @pytest.mark.asyncio
    async def test_get_evidence_types(self, trip_adapter):
        """Evidence types list returns all available types."""
        types = await trip_adapter.get_evidence_types()
        assert len(types) == len(trip_adapter.EVIDENCE_TYPES)
        codes = [t["code"] for t in types]
        assert "systematic_review" in codes
        assert "guideline" in codes


# ==========================================================================
# EpistemonikosAdapter Tests
# ==========================================================================

class TestEpistemonikosAdapter:

    @pytest.mark.asyncio
    async def test_validate_connection_success(self, epistemonikos_adapter, mock_httpx_response):
        """Epistemonikos connection validation succeeds."""
        mock_resp = mock_httpx_response(text="<html><body>Epistemonikos</body></html>")
        with patch.object(epistemonikos_adapter.client, "get", new_callable=AsyncMock, return_value=mock_resp):
            result = await epistemonikos_adapter.validate_connection()
        assert result is True

    @pytest.mark.asyncio
    async def test_validate_connection_failure(self, epistemonikos_adapter, mock_httpx_response):
        """Epistemonikos connection validation fails on HTTP error."""
        mock_resp = mock_httpx_response(status_code=503)
        with patch.object(epistemonikos_adapter.client, "get", new_callable=AsyncMock, return_value=mock_resp):
            result = await epistemonikos_adapter.validate_connection()
        assert result is False

    @pytest.mark.asyncio
    async def test_search_returns_results(self, epistemonikos_adapter, mock_httpx_response):
        """Epistemonikos search returns systematic reviews."""
        mock_resp = mock_httpx_response(json_data={
            "documents": [
                {
                    "id": "EPI-1",
                    "title": "Exercise for depression: a systematic review",
                    "abstract": "This review examines the effects of exercise.",
                    "authors": [{"name": "Smith J"}, {"name": "Doe A"}],
                    "journal": "Cochrane Database",
                    "date": "2023-06-01",
                    "doi": "10.1002/cochrane.test1",
                    "type": "Systematic review",
                    "url": "https://epistemonikos.org/documents/EPI-1",
                    "includedStudies": 35,
                    "pico": {
                        "population": "Adults with depression",
                        "intervention": "Exercise",
                        "comparison": "No exercise",
                        "outcomes": ["depression severity", "quality of life"],
                    },
                },
                {
                    "id": "EPI-2",
                    "title": "CBT for anxiety in children",
                    "abstract": "Review of CBT interventions.",
                    "authors": [{"name": "Lee K"}],
                    "journal": "BMJ",
                    "date": "2024-01-15",
                    "doi": "10.1136/bmj.test",
                    "type": "Systematic review",
                    "includedStudies": 18,
                },
            ]
        })
        with patch.object(epistemonikos_adapter.client, "get", new_callable=AsyncMock, return_value=mock_resp):
            results = await epistemonikos_adapter.search("depression exercise", filters={"max_results": 2})
        assert len(results) == 2
        assert results[0]["id"] == "EPI-1"
        assert results[0]["_query"] == "depression exercise"
        assert results[0]["includedStudies"] == 35

    @pytest.mark.asyncio
    async def test_search_no_results(self, epistemonikos_adapter, mock_httpx_response):
        """Epistemonikos search handles zero results."""
        mock_resp = mock_httpx_response(json_data={"documents": []})
        with patch.object(epistemonikos_adapter.client, "get", new_callable=AsyncMock, return_value=mock_resp):
            results = await epistemonikos_adapter.search("xyznonexistent")
        assert results == []

    @pytest.mark.asyncio
    async def test_search_with_doc_type_filter(self, epistemonikos_adapter, mock_httpx_response):
        """Epistemonikos search applies document type filter."""
        mock_resp = mock_httpx_response(json_data={
            "documents": [{"id": "BS1", "title": "Broad Synthesis X", "type": "Broad synthesis"}]
        })
        with patch.object(epistemonikos_adapter.client, "get", new_callable=AsyncMock, return_value=mock_resp):
            results = await epistemonikos_adapter.search("x", filters={"doc_type": "broad_synthesis", "max_results": 1})
        assert len(results) == 1

    @pytest.mark.asyncio
    async def test_search_http_error(self, epistemonikos_adapter, mock_httpx_response):
        """Epistemonikos search handles HTTP errors."""
        mock_resp = mock_httpx_response(status_code=500)
        with patch.object(epistemonikos_adapter.client, "get", new_callable=AsyncMock, return_value=mock_resp):
            results = await epistemonikos_adapter.search("test")
        assert results == []

    def test_transform_to_canonical(self, epistemonikos_adapter):
        """Epistemonikos raw data transforms to canonical format."""
        raw = {
            "id": "EPI-1",
            "title": "Exercise for depression",
            "abstract": "SR of exercise interventions.",
            "authors": [{"name": "Smith J"}, {"name": "Doe A"}],
            "journal": "Cochrane Database",
            "date": "2023-06-01",
            "doi": "10.1002/cochrane.test1",
            "type": "Systematic review",
            "includedStudies": 35,
            "pico": {
                "population": "Adults with depression",
                "intervention": "Exercise",
                "comparison": "No exercise",
                "outcomes": ["depression severity"],
            },
        }
        canonical = epistemonikos_adapter.transform_to_canonical(raw)
        assert canonical["source_database"] == "epistemonikos"
        assert canonical["document_type"] == "systematic_review"
        assert canonical["evidence_grade"] == "A"
        assert canonical["included_studies_count"] == 35
        assert canonical["pico_population"] == "Adults with depression"
        assert canonical["pico_intervention"] == "Exercise"
        assert "confidence" in canonical

    def test_transform_with_string_authors(self, epistemonikos_adapter):
        """Epistemonikos handles string-formatted authors."""
        raw = {
            "id": "1", "title": "R", "authors": "Smith J, Doe A", "date": "2024-01-01"
        }
        canonical = epistemonikos_adapter.transform_to_canonical(raw)
        assert isinstance(canonical["authors"], list)
        assert "Smith J" in canonical["authors"]

    def test_get_provenance(self, epistemonikos_adapter):
        """Epistemonikos provenance has correct metadata."""
        prov = epistemonikos_adapter.get_provenance({
            "type": "Systematic review", "structuredAbstract": "Yes"
        })
        assert prov["confidence_tier"] == "A"
        assert prov["systematic_review"] is True

    def test_get_confidence_score_systematic_review(self, epistemonikos_adapter):
        """Systematic review gets high confidence."""
        score = epistemonikos_adapter.get_confidence_score({
            "type": "Systematic review", "includedStudies": 55, "structuredAbstract": "Yes"
        })
        assert score["evidence_strength"] == 0.96
        assert score["sample_size"] == 0.95

    def test_get_confidence_score_primary_study(self, epistemonikos_adapter):
        """Primary study gets lower confidence."""
        score = epistemonikos_adapter.get_confidence_score({
            "type": "Primary study", "includedStudies": 0
        })
        assert score["evidence_strength"] == 0.78

    def test_detect_doc_type(self, epistemonikos_adapter):
        """Document type detection works correctly."""
        assert epistemonikos_adapter._detect_doc_type({"type": "Systematic review"}) == "systematic_review"
        assert epistemonikos_adapter._detect_doc_type({"title": "Overview of reviews"}) == "broad_synthesis"

    def test_extract_sample_size(self, epistemonikos_adapter):
        """Sample size extraction works."""
        assert epistemonikos_adapter._extract_sample_size({"participants": "N=5,000"}) == 5000
        assert epistemonikos_adapter._extract_sample_size({}) is None

    @pytest.mark.asyncio
    async def test_fetch_document_detail(self, epistemonikos_adapter, mock_httpx_response):
        """Fetch specific document detail."""
        mock_resp = mock_httpx_response(json_data={"id": "D1", "title": "Detail"})
        with patch.object(epistemonikos_adapter.client, "get", new_callable=AsyncMock, return_value=mock_resp):
            detail = await epistemonikos_adapter.fetch_document_detail("D1")
        assert detail is not None
        assert detail["id"] == "D1"

    @pytest.mark.asyncio
    async def test_get_document_types(self, epistemonikos_adapter):
        """Document types list returns all types."""
        types = await epistemonikos_adapter.get_document_types()
        assert len(types) == len(epistemonikos_adapter.DOC_TYPES)


# ==========================================================================
# NIHRePORTERAdapter Tests
# ==========================================================================

class TestNIHRePORTERAdapter:

    @pytest.mark.asyncio
    async def test_validate_connection_success(self, nih_adapter, mock_httpx_response):
        """NIH RePORTER connection validation succeeds."""
        mock_resp = mock_httpx_response(json_data={"results": []})
        with patch.object(nih_adapter.client, "post", new_callable=AsyncMock, return_value=mock_resp):
            result = await nih_adapter.validate_connection()
        assert result is True

    @pytest.mark.asyncio
    async def test_validate_connection_failure(self, nih_adapter, mock_httpx_response):
        """NIH RePORTER connection validation fails on HTTP error."""
        mock_resp = mock_httpx_response(status_code=500)
        with patch.object(nih_adapter.client, "post", new_callable=AsyncMock, return_value=mock_resp):
            result = await nih_adapter.validate_connection()
        assert result is False

    @pytest.mark.asyncio
    async def test_search_returns_projects(self, nih_adapter, mock_httpx_response):
        """NIH RePORTER search returns project records."""
        mock_resp = mock_httpx_response(json_data={
            "results": [
                {
                    "ProjectNum": "1R01CA123456-01A1",
                    "ProjectTitle": "Novel Therapeutics for Lung Cancer",
                    "AbstractText": "This project investigates new treatments.",
                    "PrincipalInvestigators": [
                        {"fullName": "Smith, John", "role": "Contact PI"},
                    ],
                    "Organization": {
                        "orgName": "Stanford University",
                        "orgCity": "Stanford",
                        "orgState": "CA",
                        "orgCountry": "USA",
                        "orgZipCode": "94305",
                    },
                    "AwardAmount": 2500000,
                    "AgencyIcFundings": [
                        {"code": "NCI", "totalCost": 2500000},
                    ],
                    "ProjectStartDate": "2023-07-01",
                    "ProjectEndDate": "2028-06-30",
                    "ActivityCode": "R01",
                    "FiscalYear": 2023,
                },
                {
                    "ProjectNum": "5R21MH789012-02",
                    "ProjectTitle": "Brain Imaging in Depression",
                    "AbstractText": "fMRI study of depression biomarkers.",
                    "PrincipalInvestigators": [
                        {"fullName": "Lee, Sarah", "role": "PI"},
                    ],
                    "Organization": {
                        "orgName": "Harvard Medical School",
                        "orgCity": "Boston",
                        "orgState": "MA",
                    },
                    "AwardAmount": 420000,
                    "AgencyIcFundings": [
                        {"code": "NIMH", "totalCost": 420000},
                    ],
                    "ProjectStartDate": "2024-01-01",
                    "ProjectEndDate": "2026-12-31",
                    "ActivityCode": "R21",
                    "FiscalYear": 2024,
                },
            ]
        })
        with patch.object(nih_adapter.client, "post", new_callable=AsyncMock, return_value=mock_resp):
            results = await nih_adapter.search("cancer", filters={"max_results": 2})
        assert len(results) == 2
        assert results[0]["ProjectNum"] == "1R01CA123456-01A1"
        assert results[0]["_query"] == "cancer"

    @pytest.mark.asyncio
    async def test_search_no_results(self, nih_adapter, mock_httpx_response):
        """NIH RePORTER search handles zero results."""
        mock_resp = mock_httpx_response(json_data={"results": []})
        with patch.object(nih_adapter.client, "post", new_callable=AsyncMock, return_value=mock_resp):
            results = await nih_adapter.search("xyznonexistent")
        assert results == []

    @pytest.mark.asyncio
    async def test_search_with_ic_filter(self, nih_adapter, mock_httpx_response):
        """NIH RePORTER search applies institute filter."""
        mock_resp = mock_httpx_response(json_data={
            "results": [{"ProjectNum": "NCI-1", "ProjectTitle": "Cancer Study", "ActivityCode": "R01"}]
        })
        with patch.object(nih_adapter.client, "post", new_callable=AsyncMock, return_value=mock_resp):
            results = await nih_adapter.search("cancer", filters={"ic_code": "NCI", "max_results": 1})
        assert len(results) == 1

    @pytest.mark.asyncio
    async def test_search_http_error(self, nih_adapter, mock_httpx_response):
        """NIH RePORTER search handles HTTP errors."""
        mock_resp = mock_httpx_response(status_code=500)
        with patch.object(nih_adapter.client, "post", new_callable=AsyncMock, return_value=mock_resp):
            results = await nih_adapter.search("test")
        assert results == []

    def test_transform_to_canonical(self, nih_adapter):
        """NIH project transforms to ResearchEntry canonical format."""
        raw = {
            "ProjectNum": "1R01CA123456-01A1",
            "ProjectTitle": "Lung Cancer Study",
            "AbstractText": "Novel therapeutics research.",
            "PrincipalInvestigators": [{"fullName": "Smith, John", "role": "PI"}],
            "Organization": {"orgName": "Stanford", "orgCity": "Stanford", "orgState": "CA"},
            "AwardAmount": 2500000,
            "AgencyIcFundings": [{"code": "NCI", "totalCost": 2500000}],
            "ProjectStartDate": "2023-07-01",
            "ProjectEndDate": "2028-06-30",
            "ActivityCode": "R01",
            "FiscalYear": 2023,
        }
        canonical = nih_adapter.transform_to_canonical(raw)
        assert canonical["entity_type"] == "research_entry"
        assert canonical["source_database"] == "nih_reporter"
        assert canonical["source_id"] == "1R01CA123456-01A1"
        assert canonical["award_amount"] == 2500000.0
        assert canonical["activity_code"] == "R01"
        assert canonical["project_type"] == "research"
        assert len(canonical["principal_investigators"]) == 1
        assert canonical["principal_investigators"][0]["name"] == "Smith, John"
        assert len(canonical["funding_institutes"]) == 1
        assert canonical["funding_institutes"][0]["code"] == "NCI"

    def test_transform_minimal(self, nih_adapter):
        """NIH transform handles minimal data."""
        raw = {"ProjectNum": "X", "ProjectTitle": "Minimal", "ActivityCode": "T32"}
        canonical = nih_adapter.transform_to_canonical(raw)
        assert canonical["project_type"] == "training"

    def test_get_provenance(self, nih_adapter):
        """NIH RePORTER provenance has correct metadata."""
        prov = nih_adapter.get_provenance({"ActivityCode": "R01", "FiscalYear": 2023})
        assert prov["source_database"] == "nih_reporter"
        assert prov["confidence_tier"] == "B"
        assert prov["us_government_source"] is True
        assert prov["curation_status"] == "nih_official_record"

    def test_get_confidence_score_r01(self, nih_adapter):
        """R01 grant gets high confidence."""
        score = nih_adapter.get_confidence_score({
            "ActivityCode": "R01", "AwardAmount": 2500000,
            "AbstractText": "test", "PrincipalInvestigators": [{}]
        })
        assert score["evidence_strength"] == 0.88
        assert score["sample_size"] == 0.80  # > 1M

    def test_get_confidence_score_training(self, nih_adapter):
        """Training grant gets lower confidence."""
        score = nih_adapter.get_confidence_score({"ActivityCode": "T32"})
        assert score["evidence_strength"] == 0.65

    def test_build_search_payload(self, nih_adapter):
        """Search payload construction works."""
        payload = nih_adapter._build_search_payload("cancer", {
            "pi_name": "Smith", "institution": "Stanford", "ic_code": "NCI",
            "activity_code": "R01", "award_min": 100000, "award_max": 5000000,
        })
        assert "criteria" in payload
        assert payload["limit"] <= 500

    @pytest.mark.asyncio
    async def test_fetch_project_publications(self, nih_adapter, mock_httpx_response):
        """Fetch publications linked to a project."""
        mock_resp = mock_httpx_response(json_data={
            "results": [{"title": "Pub 1"}, {"title": "Pub 2"}]
        })
        with patch.object(nih_adapter.client, "post", new_callable=AsyncMock, return_value=mock_resp):
            pubs = await nih_adapter.fetch_project_publications("1R01CA123456")
        assert len(pubs) == 2

    @pytest.mark.asyncio
    async def test_get_institutes(self, nih_adapter):
        """Get NIH institutes returns all ICs."""
        institutes = await nih_adapter.get_institutes()
        assert len(institutes) == len(nih_adapter.IC_CODES)
        codes = [i["code"] for i in institutes]
        assert "NCI" in codes
        assert "NIMH" in codes


# ==========================================================================
# COREAdapter Tests
# ==========================================================================

class TestCOREAdapter:

    @pytest.mark.asyncio
    async def test_validate_connection_success(self, core_adapter, mock_httpx_response):
        """CORE API connection validation succeeds."""
        mock_resp = mock_httpx_response(json_data={"results": [], "total": 0})
        with patch.object(core_adapter.client, "get", new_callable=AsyncMock, return_value=mock_resp):
            result = await core_adapter.validate_connection()
        assert result is True

    @pytest.mark.asyncio
    async def test_validate_connection_no_key(self):
        """CORE validation fails without API key."""
        adapter = COREAdapter(api_key=None)
        result = await adapter.validate_connection()
        assert result is False

    @pytest.mark.asyncio
    async def test_validate_connection_401(self, core_adapter, mock_httpx_response):
        """CORE validation fails on 401 unauthorized."""
        mock_resp = mock_httpx_response(status_code=401)
        with patch.object(core_adapter.client, "get", new_callable=AsyncMock, return_value=mock_resp):
            result = await core_adapter.validate_connection()
        assert result is False

    @pytest.mark.asyncio
    async def test_search_returns_results(self, core_adapter, mock_httpx_response):
        """CORE search returns open access articles."""
        mock_resp = mock_httpx_response(json_data={
            "results": [
                {
                    "id": "CORE-1",
                    "title": "Machine Learning in Cancer Diagnosis",
                    "abstract": "This study evaluates ML approaches.",
                    "authors": [{"name": "Smith J"}, {"name": "Doe A"}],
                    "publisher": "Nature",
                    "publishedDate": "2024-01-15",
                    "year": "2024",
                    "doi": "10.1038/s41586-024-00001",
                    "type": "Journal article",
                    "isOpenAccess": True,
                    "downloadUrl": "https://example.com/pdf1",
                    "citedByCount": 45,
                    "language": "en",
                },
                {
                    "id": "CORE-2",
                    "title": "Gene Therapy Advances",
                    "abstract": "Review of gene therapy.",
                    "authors": [{"name": "Lee K"}],
                    "publisher": "Science",
                    "publishedDate": "2023-11-01",
                    "year": "2023",
                    "doi": "10.1126/science.test",
                    "type": "Journal article",
                    "isOpenAccess": False,
                    "citedByCount": 12,
                },
            ]
        })
        with patch.object(core_adapter.client, "post", new_callable=AsyncMock, return_value=mock_resp):
            results = await core_adapter.search("cancer machine learning", filters={"max_results": 2})
        assert len(results) == 2
        assert results[0]["id"] == "CORE-1"
        assert results[0]["_query"] == "cancer machine learning"

    @pytest.mark.asyncio
    async def test_search_no_results(self, core_adapter, mock_httpx_response):
        """CORE search handles zero results."""
        mock_resp = mock_httpx_response(json_data={"results": []})
        with patch.object(core_adapter.client, "post", new_callable=AsyncMock, return_value=mock_resp):
            results = await core_adapter.search("xyznonexistent")
        assert results == []

    @pytest.mark.asyncio
    async def test_search_http_error(self, core_adapter, mock_httpx_response):
        """CORE search handles HTTP errors."""
        mock_resp = mock_httpx_response(status_code=500)
        with patch.object(core_adapter.client, "post", new_callable=AsyncMock, return_value=mock_resp):
            results = await core_adapter.search("test")
        assert results == []

    def test_transform_to_canonical(self, core_adapter):
        """CORE raw data transforms to canonical format."""
        raw = {
            "id": "CORE-1",
            "title": "ML in Cancer",
            "abstract": "Study of ML approaches.",
            "authors": [{"name": "Smith J"}, {"name": "Doe A"}],
            "publisher": "Nature",
            "publishedDate": "2024-01-15",
            "year": "2024",
            "doi": "10.1038/s41586-024-00001",
            "type": "Journal article",
            "isOpenAccess": True,
            "downloadUrl": "https://example.com/pdf1",
            "citedByCount": 45,
            "language": "en",
        }
        canonical = core_adapter.transform_to_canonical(raw)
        assert canonical["source_database"] == "core"
        assert canonical["is_open_access"] is True
        assert canonical["has_full_text"] is True
        assert canonical["cited_by_count"] == 45
        assert canonical["language"] == "en"
        assert canonical["work_type"] == "journal_article"
        assert canonical["evidence_grade"] == "B"

    def test_transform_preprint(self, core_adapter):
        """CORE preprint gets grade C."""
        raw = {"id": "P1", "title": "Preprint X", "type": "Preprint", "doi": "10.1101/test"}
        canonical = core_adapter.transform_to_canonical(raw)
        assert canonical["evidence_grade"] == "C"

    def test_get_provenance(self, core_adapter):
        """CORE provenance has correct metadata."""
        prov = core_adapter.get_provenance({
            "isOpenAccess": True, "repositoryName": "arXiv", "language": "en"
        })
        assert prov["confidence_tier"] == "B"
        assert prov["is_open_access"] is True
        assert prov["curation_status"] == "core_aggregated"

    def test_get_confidence_score_open_access(self, core_adapter):
        """Open access article with full text gets good confidence."""
        score = core_adapter.get_confidence_score({
            "type": "Journal article", "isOpenAccess": True,
            "downloadUrl": "https://example.com/pdf", "citedByCount": 100
        })
        assert score["evidence_strength"] == 0.85
        assert score["data_quality"] >= 0.85

    def test_detect_work_type(self, core_adapter):
        """Work type detection works correctly."""
        assert core_adapter._detect_work_type({"type": "Journal article"}) == "journal_article"
        assert core_adapter._detect_work_type({"type": "Thesis"}) == "thesis"

    def test_safe_year(self, core_adapter):
        """Year extraction from date string works."""
        assert core_adapter._safe_year("2024-01-15") == "2024"
        assert core_adapter._safe_year("") == ""

    @pytest.mark.asyncio
    async def test_fetch_work_by_id(self, core_adapter, mock_httpx_response):
        """Fetch specific work by ID."""
        mock_resp = mock_httpx_response(json_data={"id": "W1", "title": "Work Detail"})
        with patch.object(core_adapter.client, "get", new_callable=AsyncMock, return_value=mock_resp):
            work = await core_adapter.fetch_work_by_id("W1")
        assert work is not None
        assert work["id"] == "W1"

    @pytest.mark.asyncio
    async def test_fetch_work_by_id_404(self, core_adapter, mock_httpx_response):
        """Fetch work returns None for non-existent ID."""
        mock_resp = mock_httpx_response(status_code=404)
        with patch.object(core_adapter.client, "get", new_callable=AsyncMock, return_value=mock_resp):
            work = await core_adapter.fetch_work_by_id("MISSING")
        assert work is None


# ==========================================================================
# BioRxivAdapter Tests
# ==========================================================================

class TestBioRxivAdapter:

    @pytest.mark.asyncio
    async def test_validate_connection_success(self, biorxiv_adapter, mock_httpx_response):
        """bioRxiv connection validation succeeds."""
        yesterday = datetime.now().strftime("%Y-%m-%d")
        mock_resp = mock_httpx_response(json_data={"collection": []})
        with patch.object(biorxiv_adapter.client, "get", new_callable=AsyncMock, return_value=mock_resp):
            result = await biorxiv_adapter.validate_connection()
        assert result is True

    @pytest.mark.asyncio
    async def test_validate_connection_failure(self, biorxiv_adapter, mock_httpx_response):
        """bioRxiv connection validation fails on HTTP error."""
        mock_resp = mock_httpx_response(status_code=500)
        with patch.object(biorxiv_adapter.client, "get", new_callable=AsyncMock, return_value=mock_resp):
            result = await biorxiv_adapter.validate_connection()
        assert result is False

    @pytest.mark.asyncio
    async def test_search_returns_results(self, biorxiv_adapter, mock_httpx_response):
        """bioRxiv search returns preprints."""
        mock_resp = mock_httpx_response(json_data={
            "collection": [
                {
                    "doi": "10.1101/2024.01.15.123456",
                    "title": "Single cell analysis of tumor cancer microenvironment",
                    "abstract": "We performed scRNA-seq on 50,000 cells.",
                    "authors": "Smith J;Doe A;Lee K",
                    "journaltitle": "bioRxiv",
                    "date": "2024-01-15",
                    "version": "1",
                    "category": "Cancer Biology",
                    "type": "preprint",
                    "url": "https://www.biorxiv.org/content/10.1101/2024.01.15.123456",
                    "author_corresponding": "Smith J",
                    "author_corresponding_institution": "Stanford University",
                },
                {
                    "doi": "10.1101/2024.02.01.789012",
                    "title": "CRISPR screening identifies novel drug targets in cancer",
                    "abstract": "Genome-wide CRISPR screen in breast cancer.",
                    "authors": "Wang L",
                    "journaltitle": "bioRxiv",
                    "date": "2024-02-01",
                    "version": "2",
                    "category": "Genetics",
                    "type": "preprint",
                },
            ]
        })
        with patch.object(biorxiv_adapter.client, "get", new_callable=AsyncMock, return_value=mock_resp):
            results = await biorxiv_adapter.search("cancer", filters={"max_results": 2, "server": "biorxiv"})
        assert len(results) == 2
        # Results in original collection order (biorxiv only, no sort)
        assert results[0]["doi"] == "10.1101/2024.01.15.123456"
        assert results[1]["doi"] == "10.1101/2024.02.01.789012"

    @pytest.mark.asyncio
    async def test_search_no_results(self, biorxiv_adapter, mock_httpx_response):
        """bioRxiv search handles zero results."""
        mock_resp = mock_httpx_response(json_data={"collection": []})
        with patch.object(biorxiv_adapter.client, "get", new_callable=AsyncMock, return_value=mock_resp):
            results = await biorxiv_adapter.search("xyznonexistent12345")
        assert results == []

    @pytest.mark.asyncio
    async def test_search_by_doi(self, biorxiv_adapter, mock_httpx_response):
        """bioRxiv search by DOI returns single preprint."""
        mock_resp = mock_httpx_response(json_data={
            "collection": [{
                "doi": "10.1101/2024.01.15.123456",
                "title": "Test Preprint",
                "authors": "Smith J",
                "date": "2024-01-15",
            }]
        })
        with patch.object(biorxiv_adapter.client, "get", new_callable=AsyncMock, return_value=mock_resp):
            results = await biorxiv_adapter.search("", filters={"doi": "10.1101/2024.01.15.123456"})
        assert len(results) == 1
        assert results[0]["doi"] == "10.1101/2024.01.15.123456"

    @pytest.mark.asyncio
    async def test_search_http_error(self, biorxiv_adapter, mock_httpx_response):
        """bioRxiv search handles HTTP errors."""
        mock_resp = mock_httpx_response(status_code=500)
        with patch.object(biorxiv_adapter.client, "get", new_callable=AsyncMock, return_value=mock_resp):
            results = await biorxiv_adapter.search("test")
        assert results == []

    def test_transform_to_canonical(self, biorxiv_adapter):
        """bioRxiv raw data transforms to canonical format."""
        raw = {
            "doi": "10.1101/2024.01.15.123456",
            "title": "Single cell tumor analysis",
            "abstract": "scRNA-seq study of 50,000 cells.",
            "authors": "Smith J;Doe A",
            "journaltitle": "bioRxiv",
            "date": "2024-01-15",
            "version": "1",
            "category": "Cancer Biology",
            "type": "preprint",
            "url": "https://www.biorxiv.org/content/10.1101/2024.01.15.123456",
        }
        canonical = biorxiv_adapter.transform_to_canonical(raw)
        assert canonical["source_database"] == "biorxiv"
        assert canonical["doi"] == "10.1101/2024.01.15.123456"
        assert canonical["evidence_grade"] == "C"
        assert canonical["is_preprint"] is True
        assert canonical["peer_reviewed"] is False
        assert canonical["server"] == "biorxiv"
        assert canonical["version"] == "1"

    def test_transform_medrxiv(self, biorxiv_adapter):
        """medRxiv preprint is detected correctly."""
        raw = {
            "doi": "10.1101/2024.01.20.999999",
            "title": "Clinical trial results",
            "authors": "Lee K",
            "journaltitle": "medRxiv",
            "date": "2024-01-20",
            "server": "medrxiv",
        }
        canonical = biorxiv_adapter.transform_to_canonical(raw)
        assert canonical["server"] == "medrxiv"

    def test_transform_with_published_version(self, biorxiv_adapter):
        """Preprint with published version gets higher confidence."""
        raw = {
            "doi": "10.1101/2024.01.15.123456",
            "title": "Published Preprint",
            "published_doi": "10.1038/nature12345",
            "journaltitle": "bioRxiv",
            "date": "2024-01-15",
        }
        canonical = biorxiv_adapter.transform_to_canonical(raw)
        assert canonical["is_published"] is True
        assert canonical["published_doi"] == "10.1038/nature12345"
        assert canonical["confidence"]["evidence_strength"] == 0.72

    def test_get_provenance(self, biorxiv_adapter):
        """bioRxiv provenance has preprint-specific metadata."""
        prov = biorxiv_adapter.get_provenance({
            "server": "biorxiv", "version": "1", "published_doi": "10.1038/test"
        })
        assert prov["confidence_tier"] == "C"
        assert prov["peer_reviewed"] is False
        assert prov["preprint_version"] == "1"
        assert prov["open_access"] is True

    def test_get_confidence_score_biorxiv(self, biorxiv_adapter):
        """bioRxiv preprint gets appropriate low confidence."""
        score = biorxiv_adapter.get_confidence_score({"server": "biorxiv"})
        assert score["evidence_strength"] == 0.50
        assert score["replication"] == 0.35

    def test_get_confidence_score_medrxiv_published(self, biorxiv_adapter):
        """medRxiv preprint with published version gets higher confidence."""
        score = biorxiv_adapter.get_confidence_score({
            "server": "medrxiv", "published_doi": "10.1038/test"
        })
        assert score["evidence_strength"] == 0.72

    def test_detect_server(self, biorxiv_adapter):
        """Server detection works correctly."""
        assert biorxiv_adapter._detect_server({"journaltitle": "medRxiv"}) == "medrxiv"
        assert biorxiv_adapter._detect_server({"journaltitle": "bioRxiv"}) == "biorxiv"
        assert biorxiv_adapter._detect_server({}) == "biorxiv"

    def test_build_preprint_url(self, biorxiv_adapter):
        """Preprint URL construction works."""
        url = biorxiv_adapter._build_preprint_url("10.1101/2024.01.15.123456", "biorxiv")
        assert "biorxiv.org" in url
        assert "10.1101/2024.01.15.123456" in url

    @pytest.mark.asyncio
    async def test_fetch_preprint_by_doi(self, biorxiv_adapter, mock_httpx_response):
        """Fetch specific preprint by DOI."""
        mock_resp = mock_httpx_response(json_data={
            "collection": [{"doi": "10.1101/2024.01.15.123456", "title": "Found"}]
        })
        with patch.object(biorxiv_adapter.client, "get", new_callable=AsyncMock, return_value=mock_resp):
            preprint = await biorxiv_adapter.fetch_preprint_by_doi(
                "10.1101/2024.01.15.123456", "biorxiv"
            )
        assert preprint is not None
        assert preprint["doi"] == "10.1101/2024.01.15.123456"

    @pytest.mark.asyncio
    async def test_fetch_preprint_by_doi_404(self, biorxiv_adapter, mock_httpx_response):
        """Fetch preprint returns None for non-existent DOI."""
        mock_resp = mock_httpx_response(status_code=404)
        with patch.object(biorxiv_adapter.client, "get", new_callable=AsyncMock, return_value=mock_resp):
            preprint = await biorxiv_adapter.fetch_preprint_by_doi(
                "10.1101/nonexistent", "biorxiv"
            )
        assert preprint is None

    @pytest.mark.asyncio
    async def test_get_subject_areas(self, biorxiv_adapter):
        """Get subject areas returns categories for both servers."""
        areas = await biorxiv_adapter.get_subject_areas("both")
        assert "biorxiv" in areas
        assert "medrxiv" in areas
        assert len(areas["biorxiv"]) > 0
        assert len(areas["medrxiv"]) > 0


# ==========================================================================
# Cross-adapter consistency tests
# ==========================================================================

class TestCrossAdapterConsistency:

    def test_all_adapters_implement_base(self):
        """Every adapter inherits from BaseAdapter."""
        from ahrq_epss_adapter import BaseAdapter as AHRQBase
        from trip_database_adapter import BaseAdapter as TRIPBase
        from epistemonikos_adapter import BaseAdapter as EPIBase
        from nih_reporter_adapter import BaseAdapter as NIHBase
        from core_adapter import BaseAdapter as COREBase
        from biorxiv_adapter import BaseAdapter as BIOBase

        assert issubclass(AHRQEPSSAdapter, AHRQBase)
        assert issubclass(TRIPDatabaseAdapter, TRIPBase)
        assert issubclass(EpistemonikosAdapter, EPIBase)
        assert issubclass(NIHRePORTERAdapter, NIHBase)
        assert issubclass(COREAdapter, COREBase)
        assert issubclass(BioRxivAdapter, BIOBase)

    def test_all_adapters_have_required_attributes(self):
        """Every adapter defines the required metadata attributes."""
        adapters = [
            AHRQEPSSAdapter(),
            TRIPDatabaseAdapter(),
            EpistemonikosAdapter(),
            NIHRePORTERAdapter(),
            COREAdapter(),
            BioRxivAdapter(),
        ]
        for adapter in adapters:
            assert adapter.name, f"{adapter.__class__.__name__} missing name"
            assert adapter.display_name, f"{adapter.__class__.__name__} missing display_name"
            assert adapter.source_url, f"{adapter.__class__.__name__} missing source_url"
            assert adapter.version, f"{adapter.__class__.__name__} missing version"
            assert adapter.confidence_tier in ("A", "B", "C"), f"{adapter.__class__.__name__} invalid tier"
            assert isinstance(adapter.data_types, list), f"{adapter.__class__.__name__} data_types not list"
            assert len(adapter.data_types) > 0, f"{adapter.__class__.__name__} empty data_types"
            assert adapter.rate_limit_per_minute > 0, f"{adapter.__class__.__name__} invalid rate limit"

    def test_confidence_tier_alignment(self):
        """Adapter confidence tiers match specifications."""
        assert AHRQEPSSAdapter().confidence_tier == "A"
        assert TRIPDatabaseAdapter().confidence_tier == "B"
        assert EpistemonikosAdapter().confidence_tier == "A"
        assert NIHRePORTERAdapter().confidence_tier == "B"
        assert COREAdapter().confidence_tier == "B"
        assert BioRxivAdapter().confidence_tier == "C"

    def test_canonical_schema_consistency(self):
        """All adapters produce consistent canonical output keys."""
        adapters_raw = [
            (AHRQEPSSAdapter(), {"id": "1", "title": "T", "grade": "A"}),
            (TRIPDatabaseAdapter(), {"id": "1", "title": "T", "date": "2024-01-01"}),
            (EpistemonikosAdapter(), {"id": "1", "title": "T", "date": "2024-01-01"}),
            (NIHRePORTERAdapter(), {"ProjectNum": "X", "ProjectTitle": "T", "ActivityCode": "R01"}),
            (COREAdapter(), {"id": "1", "title": "T", "type": "Journal article"}),
            (BioRxivAdapter(), {"doi": "10.1101/2024.01.01.1", "title": "T", "date": "2024-01-01"}),
        ]
        required_keys = {
            "source_database", "source_id", "title", "confidence", "provenance", "raw_data"
        }
        for adapter, raw in adapters_raw:
            canonical = adapter.transform_to_canonical(raw)
            missing = required_keys - set(canonical.keys())
            assert not missing, f"{adapter.name} missing keys: {missing}"
            assert isinstance(canonical["confidence"], dict)
            assert isinstance(canonical["provenance"], dict)
            assert "overall" in canonical["confidence"]
            assert "retrieved_at" in canonical["provenance"]

    def test_provenance_schema_consistency(self):
        """All adapters produce consistent provenance structures."""
        adapters = [
            AHRQEPSSAdapter(), TRIPDatabaseAdapter(), EpistemonikosAdapter(),
            NIHRePORTERAdapter(), COREAdapter(), BioRxivAdapter(),
        ]
        required_prov_keys = {
            "source_database", "source_version", "source_url",
            "retrieved_at", "confidence_tier", "curation_status",
        }
        for adapter in adapters:
            prov = adapter.get_provenance({})
            missing = required_prov_keys - set(prov.keys())
            assert not missing, f"{adapter.name} provenance missing: {missing}"

    def test_confidence_score_dimensions(self):
        """All adapters produce 7-dimensional confidence scores."""
        adapters = [
            AHRQEPSSAdapter(), TRIPDatabaseAdapter(), EpistemonikosAdapter(),
            NIHRePORTERAdapter(), COREAdapter(), BioRxivAdapter(),
        ]
        expected_dimensions = {
            "data_quality", "evidence_strength", "sample_size",
            "replication", "consistency", "temporal_relevance",
            "population_match", "overall",
        }
        for adapter in adapters:
            score = adapter.get_confidence_score({})
            missing = expected_dimensions - set(score.keys())
            assert not missing, f"{adapter.name} confidence missing: {missing}"
            assert 0 <= score["overall"] <= 1
            assert 0 <= score["data_quality"] <= 1
            assert 0 <= score["evidence_strength"] <= 1
