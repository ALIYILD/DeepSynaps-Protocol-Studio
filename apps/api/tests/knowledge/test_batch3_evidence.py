"""
Test Suite for Batch 3 Evidence/Literature Database Adapters
=============================================================
Comprehensive unit tests for:
  - PubMedAdapter
  - CochraneAdapter
  - ClinicalTrialsAdapter
  - EuropePMCAdapter
  - NICEAdapter

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

from pubmed_adapter import PubMedAdapter
from cochrane_adapter import CochraneAdapter
from clinicaltrials_adapter import ClinicalTrialsAdapter
from europepmc_adapter import EuropePMCAdapter
from nice_adapter import NICEAdapter


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def pubmed_adapter():
    return PubMedAdapter(api_key="test_key")


@pytest.fixture
def cochrane_adapter():
    return CochraneAdapter(api_key="test_key")


@pytest.fixture
def clinicaltrials_adapter():
    return ClinicalTrialsAdapter()


@pytest.fixture
def europepmc_adapter():
    return EuropePMCAdapter()


@pytest.fixture
def nice_adapter():
    return NICEAdapter()


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
# PubMedAdapter Tests
# ==========================================================================

class TestPubMedAdapter:

    @pytest.mark.asyncio
    async def test_validate_connection_success(self, pubmed_adapter, mock_httpx_response):
        """PubMed connection validation succeeds when einfo returns valid data."""
        mock_resp = mock_httpx_response(json_data={
            "header": {"type": "einfo", "version": "0.3"},
            "einforesult": {"dbname": ["pubmed", "protein", "nuccore"]}
        })
        with patch.object(pubmed_adapter.client, "get", new_callable=AsyncMock, return_value=mock_resp):
            result = await pubmed_adapter.validate_connection()
        assert result is True

    @pytest.mark.asyncio
    async def test_validate_connection_failure(self, pubmed_adapter, mock_httpx_response):
        """PubMed connection validation fails on HTTP error."""
        mock_resp = mock_httpx_response(status_code=500)
        with patch.object(pubmed_adapter.client, "get", new_callable=AsyncMock, return_value=mock_resp):
            result = await pubmed_adapter.validate_connection()
        assert result is False

    @pytest.mark.asyncio
    async def test_validate_connection_exception(self, pubmed_adapter):
        """PubMed connection validation handles network exceptions."""
        with patch.object(pubmed_adapter.client, "get", new_callable=AsyncMock,
                         side_effect=httpx.ConnectError("Connection refused")):
            result = await pubmed_adapter.validate_connection()
        assert result is False

    @pytest.mark.asyncio
    async def test_search_returns_results(self, pubmed_adapter, mock_httpx_response):
        """PubMed search returns transformed result documents."""
        esearch_resp = mock_httpx_response(json_data={
            "esearchresult": {"idlist": ["12345678", "87654321"], "count": "2"}
        })
        esummary_resp = mock_httpx_response(json_data={
            "result": {
                "uids": ["12345678", "87654321"],
                "12345678": {
                    "uid": "12345678", "title": "Test Article Title",
                    "authors": [{"name": "Smith J"}, {"name": "Doe A"}],
                    "pubtype": ["Journal Article"],
                    "source": "Test Journal",
                    "pubdate": "2024-01-15",
                    "elocationid": "doi:10.1234/test.123",
                    "meshterms": ["Diabetes Mellitus"],
                },
                "87654321": {
                    "uid": "87654321", "title": "Second Article",
                    "authors": [{"name": "Lee K"}],
                    "pubtype": ["Review"],
                    "source": "Another Journal",
                    "pubdate": "2024-02-01",
                    "elocationid": "",
                    "meshterms": [],
                },
            }
        })

        call_count = {"count": 0}
        async def mock_get(url, params=None):
            call_count["count"] += 1
            if "esearch" in str(url):
                return esearch_resp
            return esummary_resp

        with patch.object(pubmed_adapter.client, "get", side_effect=mock_get):
            results = await pubmed_adapter.search("diabetes treatment", filters={"max_results": 2})

        assert len(results) == 2
        assert results[0]["_pmid"] == "12345678"
        assert results[0]["title"] == "Test Article Title"
        assert results[1]["_pmid"] == "87654321"

    @pytest.mark.asyncio
    async def test_search_no_results(self, pubmed_adapter, mock_httpx_response):
        """PubMed search handles zero-result queries gracefully."""
        esearch_resp = mock_httpx_response(json_data={
            "esearchresult": {"idlist": [], "count": "0"}
        })
        with patch.object(pubmed_adapter.client, "get", new_callable=AsyncMock, return_value=esearch_resp):
            results = await pubmed_adapter.search("xyznonexistentquery12345")
        assert results == []

    def test_transform_to_canonical(self, pubmed_adapter):
        """PubMed raw data is correctly transformed to canonical format."""
        raw = {
            "_pmid": "12345678",
            "title": "A Systematic Review of Diabetes Treatments",
            "authors": [{"name": "Smith J"}],
            "pubtype": ["Systematic Review"],
            "source": "Cochrane Database",
            "pubdate": "2024-01-15",
            "elocationid": "doi:10.1234/example",
            "meshterms": ["Diabetes Mellitus, Type 2"],
        }
        canonical = pubmed_adapter.transform_to_canonical(raw)
        assert canonical["source_database"] == "pubmed"
        assert canonical["source_id"] == "12345678"
        assert canonical["evidence_grade"] == "A"
        assert canonical["title"] == "A Systematic Review of Diabetes Treatments"
        assert "confidence" in canonical
        assert "provenance" in canonical

    def test_transform_rct_grade(self, pubmed_adapter):
        """PubMed correctly assigns grade A to RCT publication type."""
        raw = {"_pmid": "1", "title": "RCT", "pubtype": ["Randomized Controlled Trial"]}
        canonical = pubmed_adapter.transform_to_canonical(raw)
        assert canonical["evidence_grade"] == "A"

    def test_transform_case_report_grade(self, pubmed_adapter):
        """PubMed correctly assigns grade C to case reports."""
        raw = {"_pmid": "2", "title": "Case", "pubtype": ["Case Reports"]}
        canonical = pubmed_adapter.transform_to_canonical(raw)
        assert canonical["evidence_grade"] == "C"

    def test_get_provenance(self, pubmed_adapter):
        """PubMed provenance contains required fields."""
        prov = pubmed_adapter.get_provenance({"edat": "2024/01/15"})
        assert prov["source_database"] == "pubmed"
        assert prov["confidence_tier"] == "B"
        assert "retrieved_at" in prov
        assert prov["curation_status"] == "ncbi_curated"

    def test_get_confidence_score(self, pubmed_adapter):
        """PubMed confidence score contains all dimensions."""
        score = pubmed_adapter.get_confidence_score({
            "pubtype": ["Journal Article"],
            "meshterms": ["term"],
            "elocationid": "doi:10.1234/test",
        })
        assert "data_quality" in score
        assert "evidence_strength" in score
        assert "overall" in score
        assert 0 <= score["overall"] <= 1

    @pytest.mark.asyncio
    async def test_fetch_abstract(self, pubmed_adapter, mock_httpx_response):
        """PubMed abstract fetch parses XML correctly."""
        xml_text = (
            '<?xml version="1.0"?><PubmedArticleSet>'
            '<PubmedArticle><MedlineCitation><Article><Abstract>'
            '<AbstractText>Background: This study examined...</AbstractText>'
            '</Abstract></Article></MedlineCitation></PubmedArticle>'
            '</PubmedArticleSet>'
        )
        mock_resp = mock_httpx_response(text=xml_text)
        with patch.object(pubmed_adapter.client, "get", new_callable=AsyncMock, return_value=mock_resp):
            abstract = await pubmed_adapter.fetch_abstract("12345678")
        assert "Background:" in abstract

    @pytest.mark.asyncio
    async def test_fetch_related(self, pubmed_adapter, mock_httpx_response):
        """PubMed elink returns related PMIDs."""
        mock_resp = mock_httpx_response(json_data={
            "linksets": [{
                "linksetdbs": [{"links": ["99988877", "99988876"]}]
            }]
        })
        with patch.object(pubmed_adapter.client, "get", new_callable=AsyncMock, return_value=mock_resp):
            related = await pubmed_adapter.fetch_related("12345678")
        assert len(related) == 2
        assert "99988877" in related


# ==========================================================================
# CochraneAdapter Tests
# ==========================================================================

class TestCochraneAdapter:

    @pytest.mark.asyncio
    async def test_validate_connection_success(self, cochrane_adapter, mock_httpx_response):
        """Cochrane connection validation succeeds."""
        mock_resp = mock_httpx_response(text="<html><body>Cochrane Library</body></html>")
        with patch.object(cochrane_adapter.client, "get", new_callable=AsyncMock, return_value=mock_resp):
            result = await cochrane_adapter.validate_connection()
        assert result is True

    @pytest.mark.asyncio
    async def test_validate_connection_failure(self, cochrane_adapter, mock_httpx_response):
        """Cochrane connection validation fails on HTTP error."""
        mock_resp = mock_httpx_response(status_code=503)
        with patch.object(cochrane_adapter.client, "get", new_callable=AsyncMock, return_value=mock_resp):
            result = await cochrane_adapter.validate_connection()
        assert result is False

    @pytest.mark.asyncio
    async def test_search_returns_results(self, cochrane_adapter, mock_httpx_response):
        """Cochrane search returns results with proper metadata."""
        html_content = (
            '<html><head>'
            '<script type="application/ld+json">'
            '{"@type":"ScholarlyArticle","name":"Test Review",'
            '"identifier":"10.1002/14651858.CD012345.pub2",'
            '"author":[{"name":"Smith J"}],'
            '"datePublished":"2024-01-01","description":"A test review."}'
            '</script>'
            '</head><body></body></html>'
        )
        mock_resp = mock_httpx_response(text=html_content, headers={"content-type": "text/html"})
        with patch.object(cochrane_adapter.client, "get", new_callable=AsyncMock, return_value=mock_resp):
            results = await cochrane_adapter.search("depression treatment")
        assert len(results) >= 1
        assert results[0]["title"] == "Test Review"
        assert results[0]["_query"] == "depression treatment"

    @pytest.mark.asyncio
    async def test_search_http_error(self, cochrane_adapter, mock_httpx_response):
        """Cochrane search handles HTTP errors gracefully."""
        mock_resp = mock_httpx_response(status_code=500)
        with patch.object(cochrane_adapter.client, "get", new_callable=AsyncMock, return_value=mock_resp):
            results = await cochrane_adapter.search("test")
        assert results == []

    def test_transform_to_canonical(self, cochrane_adapter):
        """Cochrane raw data transforms to canonical format with grade A."""
        raw = {
            "title": "Test Cochrane Review",
            "doi": "10.1002/14651858.CD012345.pub2",
            "authors": ["Smith J", "Doe A"],
            "datePublished": "2024-01-15",
            "description": "This is a comprehensive review.",
            "_query": "test",
        }
        canonical = cochrane_adapter.transform_to_canonical(raw)
        assert canonical["source_database"] == "cochrane_library"
        assert canonical["evidence_grade"] == "A"
        assert canonical["journal"] == "Cochrane Database of Systematic Reviews"
        assert "confidence" in canonical
        assert "provenance" in canonical

    def test_transform_with_string_authors(self, cochrane_adapter):
        """Cochrane transform handles string-formatted authors."""
        raw = {
            "title": "Review", "doi": "10.1/test",
            "authors": "Smith J, Doe A",
            "datePublished": "2024-01-01",
        }
        canonical = cochrane_adapter.transform_to_canonical(raw)
        assert isinstance(canonical["authors"], list)
        assert "Smith J" in canonical["authors"]

    def test_get_provenance(self, cochrane_adapter):
        """Cochrane provenance has correct tier and curation status."""
        prov = cochrane_adapter.get_provenance({"datePublished": "2024-01-01"})
        assert prov["confidence_tier"] == "A"
        assert prov["curation_status"] == "cochrane_peer_reviewed"
        assert prov["review_status"] == "published"

    def test_get_confidence_score(self, cochrane_adapter):
        """Cochrane confidence score is high for systematic reviews."""
        score = cochrane_adapter.get_confidence_score({
            "title": "Cochrane Systematic Review of X",
            "doi": "10.1002/cochrane.test",
        })
        assert score["overall"] >= 0.90
        assert score["evidence_strength"] >= 0.95

    @pytest.mark.asyncio
    async def test_fetch_review_by_doi(self, cochrane_adapter, mock_httpx_response):
        """Cochrane review fetch by DOI returns structured data."""
        mock_resp = mock_httpx_response(json_data={
            "title": "Detailed Review",
            "doi": "10.1002/14651858.CD012345.pub2",
            "abstract": "Comprehensive analysis...",
        })
        with patch.object(cochrane_adapter.client, "get", new_callable=AsyncMock, return_value=mock_resp):
            review = await cochrane_adapter.fetch_review_by_doi("10.1002/14651858.CD012345.pub2")
        assert review is not None
        assert review["title"] == "Detailed Review"

    @pytest.mark.asyncio
    async def test_fetch_review_by_doi_404(self, cochrane_adapter, mock_httpx_response):
        """Cochrane review fetch returns None for 404."""
        mock_resp = mock_httpx_response(status_code=404)
        with patch.object(cochrane_adapter.client, "get", new_callable=AsyncMock, return_value=mock_resp):
            review = await cochrane_adapter.fetch_review_by_doi("10.1002/nonexistent")
        assert review is None


# ==========================================================================
# ClinicalTrialsAdapter Tests
# ==========================================================================

class TestClinicalTrialsAdapter:

    @pytest.mark.asyncio
    async def test_validate_connection_success(self, clinicaltrials_adapter, mock_httpx_response):
        """ClinicalTrials.gov connection validation succeeds."""
        mock_resp = mock_httpx_response(json_data={"version": "2.0.3"})
        with patch.object(clinicaltrials_adapter.client, "get", new_callable=AsyncMock,
                         return_value=mock_resp):
            result = await clinicaltrials_adapter.validate_connection()
        assert result is True

    @pytest.mark.asyncio
    async def test_validate_connection_fallback(self, clinicaltrials_adapter, mock_httpx_response):
        """ClinicalTrials.gov validation falls back to /studies on version failure."""
        error_resp = mock_httpx_response(status_code=404)
        success_resp = mock_httpx_response(json_data={"studies": []})
        call_count = {"count": 0}
        async def mock_get(url, params=None):
            call_count["count"] += 1
            if call_count["count"] == 1:
                return error_resp
            return success_resp
        with patch.object(clinicaltrials_adapter.client, "get", side_effect=mock_get):
            result = await clinicaltrials_adapter.validate_connection()
        assert result is True

    @pytest.mark.asyncio
    async def test_search_returns_studies(self, clinicaltrials_adapter, mock_httpx_response):
        """ClinicalTrials.gov search returns study records."""
        mock_resp = mock_httpx_response(json_data={
            "studies": [
                {
                    "protocolSection": {
                        "identificationModule": {
                            "nctId": "NCT04292899",
                            "briefTitle": "Test Clinical Trial",
                            "officialTitle": "A Phase III Study of Drug X",
                        },
                        "statusModule": {
                            "overallStatus": "COMPLETED",
                            "startDateStruct": {"date": "2023-01-01"},
                            "completionDateStruct": {"date": "2024-01-01"},
                            "lastUpdatePostDateStruct": {"date": "2024-03-15"},
                        },
                        "descriptionModule": {
                            "briefSummary": "This study evaluates drug X.",
                        },
                        "designModule": {
                            "studyType": "INTERVENTIONAL",
                            "phases": ["PHASE3"],
                            "enrollmentInfo": {"count": 500},
                            "designInfo": {"allocation": "RANDOMIZED"},
                        },
                        "conditionsModule": {
                            "conditions": ["Diabetes Mellitus"],
                        },
                        "armsInterventionsModule": {
                            "interventions": [{"name": "Drug X", "type": "DRUG"}],
                        },
                        "sponsorCollaboratorsModule": {
                            "leadSponsor": {"name": "University Hospital"},
                        },
                        "contactsLocationsModule": {
                            "locations": [{"city": "London", "country": "UK"}],
                        },
                    },
                    "resultsSection": {},
                }
            ],
            "totalCount": 1,
        })
        with patch.object(clinicaltrials_adapter.client, "get", new_callable=AsyncMock,
                         return_value=mock_resp):
            results = await clinicaltrials_adapter.search("diabetes", filters={"max_results": 1})
        assert len(results) == 1
        assert results[0]["protocolSection"]["identificationModule"]["nctId"] == "NCT04292899"

    @pytest.mark.asyncio
    async def test_search_no_results(self, clinicaltrials_adapter, mock_httpx_response):
        """ClinicalTrials.gov search handles zero results."""
        mock_resp = mock_httpx_response(json_data={"studies": [], "totalCount": 0})
        with patch.object(clinicaltrials_adapter.client, "get", new_callable=AsyncMock,
                         return_value=mock_resp):
            results = await clinicaltrials_adapter.search("xyznonexistent")
        assert results == []

    @pytest.mark.asyncio
    async def test_search_http_error(self, clinicaltrials_adapter, mock_httpx_response):
        """ClinicalTrials.gov search handles HTTP errors."""
        mock_resp = mock_httpx_response(status_code=500)
        with patch.object(clinicaltrials_adapter.client, "get", new_callable=AsyncMock,
                         return_value=mock_resp):
            results = await clinicaltrials_adapter.search("test")
        assert results == []

    def test_transform_to_canonical(self, clinicaltrials_adapter):
        """ClinicalTrials.gov raw study transforms to canonical format."""
        raw = {
            "protocolSection": {
                "identificationModule": {
                    "nctId": "NCT04292899",
                    "briefTitle": "Test Trial",
                    "officialTitle": "Official Test Trial Title",
                },
                "statusModule": {
                    "overallStatus": "COMPLETED",
                    "startDateStruct": {"date": "2023-01-01"},
                    "completionDateStruct": {"date": "2024-01-01"},
                    "lastUpdatePostDateStruct": {"date": "2024-03-15"},
                },
                "descriptionModule": {"briefSummary": "Testing drug X."},
                "designModule": {
                    "studyType": "INTERVENTIONAL",
                    "phases": ["PHASE3"],
                    "enrollmentInfo": {"count": 500},
                    "designInfo": {"allocation": "RANDOMIZED"},
                },
                "conditionsModule": {"conditions": ["Diabetes"]},
                "armsInterventionsModule": {"interventions": [{"name": "Drug X"}]},
                "sponsorCollaboratorsModule": {"leadSponsor": {"name": "Uni Hospital"}},
                "contactsLocationsModule": {"locations": [{"city": "Boston", "country": "US"}]},
            },
            "resultsSection": {},
        }
        canonical = clinicaltrials_adapter.transform_to_canonical(raw)
        assert canonical["source_database"] == "clinicaltrials_gov"
        assert canonical["source_id"] == "NCT04292899"
        assert canonical["evidence_grade"] == "A"
        assert canonical["phase"] == ["PHASE3"]
        assert canonical["has_results"] is False  # empty dict is falsy
        assert "confidence" in canonical
        assert "provenance" in canonical

    def test_transform_no_results(self, clinicaltrials_adapter):
        """Transform handles study without posted results."""
        raw = {
            "protocolSection": {
                "identificationModule": {"nctId": "NCT00000001", "briefTitle": "Test"},
                "statusModule": {"overallStatus": "RECRUITING"},
                "descriptionModule": {},
                "designModule": {"studyType": "OBSERVATIONAL"},
                "conditionsModule": {"conditions": []},
                "armsInterventionsModule": {"interventions": []},
                "sponsorCollaboratorsModule": {"leadSponsor": {"name": ""}},
                "contactsLocationsModule": {},
            },
        }
        canonical = clinicaltrials_adapter.transform_to_canonical(raw)
        assert canonical["has_results"] is False
        assert canonical["phase"] == []

    def test_get_provenance(self, clinicaltrials_adapter):
        """ClinicalTrials.gov provenance contains registry metadata."""
        prov = clinicaltrials_adapter.get_provenance({
            "protocolSection": {
                "statusModule": {"lastUpdatePostDateStruct": {"date": "2024-03-15"}}
            }
        })
        assert prov["source_database"] == "clinicaltrials_gov"
        assert prov["curation_status"] == "registry_entry"

    def test_get_confidence_score_phase3(self, clinicaltrials_adapter):
        """Confidence score is high for Phase 3 RCT with results."""
        score = clinicaltrials_adapter.get_confidence_score({
            "protocolSection": {
                "designModule": {
                    "phases": ["PHASE3"],
                    "enrollmentInfo": {"count": 1000},
                    "designInfo": {"allocation": "RANDOMIZED"},
                },
                "statusModule": {"overallStatus": "COMPLETED"},
            },
            "resultsSection": {},
        })
        assert score["evidence_strength"] == 0.95
        assert score["sample_size"] == 0.95
        assert score["overall"] >= 0.85

    def test_get_confidence_score_phase1(self, clinicaltrials_adapter):
        """Confidence score is lower for Phase 1 trials."""
        score = clinicaltrials_adapter.get_confidence_score({
            "protocolSection": {
                "designModule": {
                    "phases": ["PHASE1"],
                    "enrollmentInfo": {"count": 30},
                    "designInfo": {"allocation": "NA"},
                },
                "statusModule": {"overallStatus": "COMPLETED"},
            },
        })
        assert score["evidence_strength"] == 0.60
        assert score["sample_size"] < 0.70

    @pytest.mark.asyncio
    async def test_fetch_study(self, clinicaltrials_adapter, mock_httpx_response):
        """Fetch single study by NCT ID."""
        mock_resp = mock_httpx_response(json_data={
            "protocolSection": {
                "identificationModule": {"nctId": "NCT04292899", "briefTitle": "Found Trial"}
            }
        })
        with patch.object(clinicaltrials_adapter.client, "get", new_callable=AsyncMock,
                         return_value=mock_resp):
            study = await clinicaltrials_adapter.fetch_study("NCT04292899")
        assert study is not None
        assert study["protocolSection"]["identificationModule"]["briefTitle"] == "Found Trial"

    @pytest.mark.asyncio
    async def test_fetch_study_404(self, clinicaltrials_adapter, mock_httpx_response):
        """Fetch study returns None for non-existent NCT ID."""
        mock_resp = mock_httpx_response(status_code=404)
        with patch.object(clinicaltrials_adapter.client, "get", new_callable=AsyncMock,
                         return_value=mock_resp):
            study = await clinicaltrials_adapter.fetch_study("NCT00000000")
        assert study is None

    @pytest.mark.asyncio
    async def test_get_statistics(self, clinicaltrials_adapter, mock_httpx_response):
        """Registry statistics endpoint returns data."""
        mock_resp = mock_httpx_response(json_data={"totalStudies": 450000})
        with patch.object(clinicaltrials_adapter.client, "get", new_callable=AsyncMock,
                         return_value=mock_resp):
            stats = await clinicaltrials_adapter.get_statistics()
        assert stats.get("totalStudies") == 450000


# ==========================================================================
# EuropePMCAdapter Tests
# ==========================================================================

class TestEuropePMCAdapter:

    @pytest.mark.asyncio
    async def test_validate_connection_success(self, europepmc_adapter, mock_httpx_response):
        """Europe PMC connection validation succeeds."""
        mock_resp = mock_httpx_response(json_data={
            "databases": [{"name": "pubmed"}, {"name": "pmc"}]
        })
        with patch.object(europepmc_adapter.client, "get", new_callable=AsyncMock,
                         return_value=mock_resp):
            result = await europepmc_adapter.validate_connection()
        assert result is True

    @pytest.mark.asyncio
    async def test_validate_connection_http_error(self, europepmc_adapter, mock_httpx_response):
        """Europe PMC validation handles HTTP errors."""
        mock_resp = mock_httpx_response(status_code=500)
        with patch.object(europepmc_adapter.client, "get", new_callable=AsyncMock,
                         return_value=mock_resp):
            result = await europepmc_adapter.validate_connection()
        assert result is False

    @pytest.mark.asyncio
    async def test_search_returns_results(self, europepmc_adapter, mock_httpx_response):
        """Europe PMC search returns publication records."""
        mock_resp = mock_httpx_response(json_data={
            "resultList": {
                "result": [
                    {
                        "id": "12345",
                        "pmid": "12345678",
                        "pmcid": "PMC1234567",
                        "doi": "10.1234/example",
                        "title": "Test Article on Depression",
                        "authorList": {
                            "author": [
                                {"fullName": "Smith J", "lastName": "Smith", "firstName": "John"},
                                {"fullName": "Doe A", "lastName": "Doe", "firstName": "Alice"},
                            ]
                        },
                        "journalInfo": {"journal": {"title": "BMJ"}},
                        "firstPublicationDate": "2024-01-15",
                        "pubYear": "2024",
                        "pubType": "research article",
                        "abstractText": "This study found significant results...",
                        "hasFT": "Y",
                        "isOpenAccess": "Y",
                        "inEPMC": "Y",
                        "inPMC": "N",
                        "citedByCount": 42,
                        "meshHeadingList": {
                            "meshHeading": [{"descriptorName": "Depression"}]
                        },
                    },
                    {
                        "id": "12346",
                        "pmid": "12345679",
                        "title": "Second Article",
                        "authorList": {"author": {"fullName": "Lee K"}},
                        "pubYear": "2023",
                        "pubType": "review",
                    },
                ]
            },
            "hitCount": 2,
        })
        with patch.object(europepmc_adapter.client, "get", new_callable=AsyncMock,
                         return_value=mock_resp):
            results = await europepmc_adapter.search("depression", filters={"max_results": 2})
        assert len(results) == 2
        assert results[0]["pmid"] == "12345678"
        assert results[0]["_query"] == "depression"

    @pytest.mark.asyncio
    async def test_search_no_results(self, europepmc_adapter, mock_httpx_response):
        """Europe PMC search handles zero results."""
        mock_resp = mock_httpx_response(json_data={"resultList": {"result": []}, "hitCount": 0})
        with patch.object(europepmc_adapter.client, "get", new_callable=AsyncMock,
                         return_value=mock_resp):
            results = await europepmc_adapter.search("xyznonexistent")
        assert results == []

    def test_transform_to_canonical(self, europepmc_adapter):
        """Europe PMC raw data transforms to canonical format."""
        raw = {
            "pmid": "12345678",
            "pmcid": "PMC1234567",
            "doi": "10.1234/example",
            "title": "Test Article",
            "authorList": {"author": {"fullName": "Smith J"}},
            "journalInfo": {"journal": {"title": "Lancet"}},
            "firstPublicationDate": "2024-01-15",
            "pubType": "systematic review",
            "abstractText": "Abstract text here...",
            "hasFT": "Y",
            "isOpenAccess": "Y",
            "inEPMC": "Y",
            "citedByCount": 50,
            "meshHeadingList": {"meshHeading": {"descriptorName": "Diabetes"}},
        }
        canonical = europepmc_adapter.transform_to_canonical(raw)
        assert canonical["source_database"] == "europepmc"
        assert canonical["pmid"] == "12345678"
        assert canonical["evidence_grade"] == "A"
        assert canonical["has_full_text"] is True
        assert canonical["is_open_access"] is True
        assert "confidence" in canonical

    def test_transform_no_pmid(self, europepmc_adapter):
        """Transform handles records without PMID."""
        raw = {
            "doi": "10.1234/test",
            "title": "No PMID Article",
            "pubYear": "2024",
        }
        canonical = europepmc_adapter.transform_to_canonical(raw)
        assert canonical["source_id"] == "10.1234/test"

    def test_get_provenance(self, europepmc_adapter):
        """Europe PMC provenance has correct fields."""
        prov = europepmc_adapter.get_provenance({
            "hasFT": "Y", "isOpenAccess": "Y", "firstPublicationDate": "2024-01-15"
        })
        assert prov["source_database"] == "europepmc"
        assert prov["has_full_text"] is True
        assert prov["is_open_access"] is True

    def test_get_confidence_score_highly_cited(self, europepmc_adapter):
        """Highly cited open-access article gets high confidence."""
        score = europepmc_adapter.get_confidence_score({
            "pubType": "systematic review",
            "hasFT": "Y",
            "isOpenAccess": "Y",
            "inEPMC": "Y",
            "citedByCount": 200,
            "meshHeadingList": {"meshHeading": {}},
        })
        assert score["evidence_strength"] == 0.95
        assert score["replication"] == 0.90

    def test_get_confidence_score_uncited_preprint(self, europepmc_adapter):
        """Uncited preprint gets lower confidence."""
        score = europepmc_adapter.get_confidence_score({
            "pubType": "preprint",
            "hasFT": "N",
            "isOpenAccess": "N",
            "citedByCount": 0,
        })
        assert score["evidence_strength"] < 0.80
        assert score["replication"] < 0.50

    @pytest.mark.asyncio
    async def test_fetch_references(self, europepmc_adapter, mock_httpx_response):
        """Europe PMC reference fetch works."""
        mock_resp = mock_httpx_response(json_data={
            "referenceList": {
                "reference": [{"title": "Ref 1"}, {"title": "Ref 2"}]
            }
        })
        with patch.object(europepmc_adapter.client, "get", new_callable=AsyncMock,
                         return_value=mock_resp):
            refs = await europepmc_adapter.fetch_references("12345678")
        assert len(refs) == 2

    @pytest.mark.asyncio
    async def test_fetch_citations(self, europepmc_adapter, mock_httpx_response):
        """Europe PMC citation fetch works."""
        mock_resp = mock_httpx_response(json_data={
            "citationList": {
                "citation": [{"title": "Citing 1"}, {"title": "Citing 2"}]
            }
        })
        with patch.object(europepmc_adapter.client, "get", new_callable=AsyncMock,
                         return_value=mock_resp):
            cites = await europepmc_adapter.fetch_citations("12345678")
        assert len(cites) == 2

    @pytest.mark.asyncio
    async def test_fetch_fulltext(self, europepmc_adapter, mock_httpx_response):
        """Europe PMC full-text XML fetch works."""
        mock_resp = mock_httpx_response(text="<article><body>Full text</body></article>")
        with patch.object(europepmc_adapter.client, "get", new_callable=AsyncMock,
                         return_value=mock_resp):
            ft = await europepmc_adapter.fetch_fulltext("PMC1234567")
        assert "<body>Full text</body>" in ft


# ==========================================================================
# NICEAdapter Tests
# ==========================================================================

class TestNICEAdapter:

    @pytest.mark.asyncio
    async def test_validate_connection_success(self, nice_adapter, mock_httpx_response):
        """NICE connection validation succeeds."""
        mock_resp = mock_httpx_response(text="<html><body>NICE Guidance</body></html>")
        with patch.object(nice_adapter.client, "get", new_callable=AsyncMock,
                         return_value=mock_resp):
            result = await nice_adapter.validate_connection()
        assert result is True

    @pytest.mark.asyncio
    async def test_validate_connection_failure(self, nice_adapter, mock_httpx_response):
        """NICE connection validation fails on HTTP error."""
        mock_resp = mock_httpx_response(status_code=503)
        with patch.object(nice_adapter.client, "get", new_callable=AsyncMock,
                         return_value=mock_resp):
            result = await nice_adapter.validate_connection()
        assert result is False

    @pytest.mark.asyncio
    async def test_search_returns_results(self, nice_adapter, mock_httpx_response):
        """NICE search returns guidance documents."""
        mock_resp = mock_httpx_response(text=(
            '<html><head>'
            '<script type="application/ld+json">'
            '{"@type":"MedicalWebPage","name":"Type 2 Diabetes Guideline",'
            '"identifier":"NG28","url":"https://www.nice.org.uk/guidance/ng28",'
            '"datePublished":"2022-12-01"}'
            '</script>'
            '</head><body></body></html>'
        ), headers={"content-type": "text/html"})
        with patch.object(nice_adapter.client, "get", new_callable=AsyncMock,
                         return_value=mock_resp):
            results = await nice_adapter.search("type 2 diabetes")
        assert len(results) >= 1
        assert results[0]["title"] == "Type 2 Diabetes Guideline"

    @pytest.mark.asyncio
    async def test_search_with_json_response(self, nice_adapter, mock_httpx_response):
        """NICE search handles JSON responses."""
        mock_resp = mock_httpx_response(json_data={
            "results": [
                {"id": "NG28", "title": "Diabetes Guideline", "guidanceType": "ng",
                 "datePublished": "2022-12-01", "status": "published"},
                {"id": "TA123", "title": "SGLT2 Inhibitor Appraisal", "guidanceType": "ta",
                 "datePublished": "2023-01-01", "status": "published"},
            ]
        })
        with patch.object(nice_adapter.client, "get", new_callable=AsyncMock,
                         return_value=mock_resp):
            results = await nice_adapter.search("diabetes")
        assert len(results) == 2
        assert results[0]["id"] == "NG28"

    @pytest.mark.asyncio
    async def test_search_http_error(self, nice_adapter, mock_httpx_response):
        """NICE search handles HTTP errors gracefully."""
        mock_resp = mock_httpx_response(status_code=500)
        with patch.object(nice_adapter.client, "get", new_callable=AsyncMock,
                         return_value=mock_resp):
            results = await nice_adapter.search("test")
        assert results == []

    def test_transform_to_canonical(self, nice_adapter):
        """NICE raw data transforms to canonical format."""
        raw = {
            "id": "NG28",
            "title": "Type 2 diabetes in adults: management",
            "guidanceType": "ng",
            "datePublished": "2022-12-01",
            "dateUpdated": "2023-06-01",
            "status": "published",
            "summary": "This guideline covers the care and management of type 2 diabetes.",
            "url": "https://www.nice.org.uk/guidance/ng28",
            "recommendations": [{"text": "Offer lifestyle advice."}],
            "committee": {"name": "Diabetes Guideline Committee"},
        }
        canonical = nice_adapter.transform_to_canonical(raw)
        assert canonical["source_database"] == "nice"
        assert canonical["source_id"] == "NG28"
        assert canonical["evidence_grade"] == "A"
        assert canonical["guidance_type"] == "ng"
        assert canonical["guidance_type_label"] == "NICE guideline"
        assert len(canonical["recommendations"]) == 1
        assert "confidence" in canonical

    def test_transform_technology_appraisal(self, nice_adapter):
        """NICE TA gets appropriate confidence score."""
        raw = {
            "id": "TA678", "title": "Appraisal", "guidanceType": "ta",
            "datePublished": "2024-01-01", "status": "published",
        }
        canonical = nice_adapter.transform_to_canonical(raw)
        score = canonical["confidence"]
        assert score["evidence_strength"] == 0.97

    def test_get_provenance(self, nice_adapter):
        """NICE provenance has correct curation metadata."""
        prov = nice_adapter.get_provenance({
            "guidanceType": "ng", "dateUpdated": "2023-06-01"
        })
        assert prov["confidence_tier"] == "A"
        assert prov["curation_status"] == "nice_national_guideline"
        assert prov["uk_national_recommendation"] is True

    def test_get_confidence_score_guideline(self, nice_adapter):
        """NICE guideline confidence score is appropriately high."""
        score = nice_adapter.get_confidence_score({
            "guidanceType": "ng",
            "status": "published",
            "recommendations": [{"text": "Rec 1"}],
        })
        assert score["overall"] >= 0.90
        assert score["evidence_strength"] == 0.96

    def test_get_confidence_score_ip(self, nice_adapter):
        """Interventional procedure guidance has slightly lower evidence strength."""
        score = nice_adapter.get_confidence_score({
            "guidanceType": "ip", "status": "published", "recommendations": [],
        })
        assert score["evidence_strength"] == 0.94

    def test_extract_guidance_type(self, nice_adapter):
        """Guidance type extraction from NICE ID works."""
        assert nice_adapter._extract_guidance_type("NG28") == "NICE guideline"
        assert nice_adapter._extract_guidance_type("TA678") == "Technology appraisal"
        assert nice_adapter._extract_guidance_type("CG159") == "Clinical guideline"
        assert nice_adapter._extract_guidance_type("IP123") == "Interventional procedures"

    def test_nice_id_to_url(self, nice_adapter):
        """URL construction from NICE ID works."""
        url = nice_adapter._nice_id_to_url("NG28", "ng")
        assert "nice.org.uk/guidance" in url
        assert "ng28" in url.lower()

    @pytest.mark.asyncio
    async def test_fetch_guidance_detail(self, nice_adapter, mock_httpx_response):
        """Fetch specific NICE guidance detail page."""
        mock_resp = mock_httpx_response(text=(
            '<html><title>NG28 | Diabetes | NICE</title>'
            '<meta name="description" content="Management guideline.">'
            '</html>'
        ), headers={"content-type": "text/html"})
        with patch.object(nice_adapter.client, "get", new_callable=AsyncMock,
                         return_value=mock_resp):
            detail = await nice_adapter.fetch_guidance_detail("NG28")
        assert detail is not None
        assert detail["id"] == "NG28"

    @pytest.mark.asyncio
    async def test_fetch_guidance_detail_404(self, nice_adapter, mock_httpx_response):
        """Fetch guidance returns None for non-existent ID."""
        mock_resp = mock_httpx_response(status_code=404)
        with patch.object(nice_adapter.client, "get", new_callable=AsyncMock,
                         return_value=mock_resp):
            detail = await nice_adapter.fetch_guidance_detail("NG999999")
        assert detail is None

    @pytest.mark.asyncio
    async def test_get_guidance_types(self, nice_adapter):
        """Guidance types list returns all available types."""
        types = await nice_adapter.get_guidance_types()
        assert len(types) == len(NICEAdapter.GUIDANCE_TYPES)
        codes = [t["code"] for t in types]
        assert "ng" in codes
        assert "ta" in codes
        assert "cg" in codes


# ==========================================================================
# Cross-adapter consistency tests
# ==========================================================================

class TestCrossAdapterConsistency:

    def test_all_adapters_implement_base(self):
        """Every adapter inherits from BaseAdapter."""
        from pubmed_adapter import BaseAdapter as PubMedBase
        from cochrane_adapter import BaseAdapter as CochraneBase
        from clinicaltrials_adapter import BaseAdapter as CTBase
        from europepmc_adapter import BaseAdapter as EPMCBase
        from nice_adapter import BaseAdapter as NICEBase

        assert issubclass(PubMedAdapter, PubMedBase)
        assert issubclass(CochraneAdapter, CochraneBase)
        assert issubclass(ClinicalTrialsAdapter, CTBase)
        assert issubclass(EuropePMCAdapter, EPMCBase)
        assert issubclass(NICEAdapter, NICEBase)

    def test_all_adapters_have_required_attributes(self):
        """Every adapter defines the required metadata attributes."""
        adapters = [
            PubMedAdapter(), CochraneAdapter(), ClinicalTrialsAdapter(),
            EuropePMCAdapter(), NICEAdapter(),
        ]
        for adapter in adapters:
            assert adapter.name
            assert adapter.display_name
            assert adapter.source_url
            assert adapter.version
            assert adapter.confidence_tier in ("A", "B", "C")
            assert isinstance(adapter.data_types, list)
            assert len(adapter.data_types) > 0
            assert adapter.rate_limit_per_minute > 0

    def test_canonical_schema_consistency(self):
        """All adapters produce consistent canonical output keys."""
        adapters = [
            (PubMedAdapter(), {"_pmid": "1", "title": "T", "pubtype": ["Article"]}),
            (CochraneAdapter(), {"title": "R", "doi": "10.1/t"}),
            (ClinicalTrialsAdapter(), {
                "protocolSection": {
                    "identificationModule": {"nctId": "NCT1", "briefTitle": "T"},
                    "statusModule": {}, "descriptionModule": {},
                    "designModule": {}, "conditionsModule": {"conditions": []},
                    "armsInterventionsModule": {"interventions": []},
                    "sponsorCollaboratorsModule": {"leadSponsor": {"name": ""}},
                    "contactsLocationsModule": {},
                }
            }),
            (EuropePMCAdapter(), {"pmid": "1", "title": "T"}),
            (NICEAdapter(), {"id": "NG1", "title": "T"}),
        ]

        required_keys = [
            "entity_type", "source_database", "source_id", "title",
            "evidence_grade", "confidence", "provenance", "raw_data",
        ]

        for adapter, raw in adapters:
            canonical = adapter.transform_to_canonical(raw)
            for key in required_keys:
                assert key in canonical, f"{adapter.name} missing key: {key}"
            assert canonical["source_database"] == adapter.name
            assert isinstance(canonical["confidence"], dict)
            assert isinstance(canonical["provenance"], dict)

    def test_confidence_score_dimensions(self):
        """All adapters return confidence scores with required dimensions."""
        adapters = [
            PubMedAdapter(), CochraneAdapter(), ClinicalTrialsAdapter(),
            EuropePMCAdapter(), NICEAdapter(),
        ]
        required_dimensions = [
            "data_quality", "evidence_strength", "sample_size",
            "replication", "consistency", "temporal_relevance",
            "population_match", "overall",
        ]
        for adapter in adapters:
            score = adapter.get_confidence_score({})
            for dim in required_dimensions:
                assert dim in score, f"{adapter.name} missing dimension: {dim}"
                assert 0 <= score[dim] <= 1, f"{adapter.name}.{dim} out of range"

    def test_provenance_schema(self):
        """All adapters return provenance with required fields."""
        adapters = [
            PubMedAdapter(), CochraneAdapter(), ClinicalTrialsAdapter(),
            EuropePMCAdapter(), NICEAdapter(),
        ]
        for adapter in adapters:
            prov = adapter.get_provenance({})
            assert "source_database" in prov
            assert "source_version" in prov
            assert "source_url" in prov
            assert "retrieved_at" in prov
            assert "confidence_tier" in prov
            assert "data_quality_score" in prov
            assert "research_only" in prov

    @pytest.mark.asyncio
    async def test_all_adapters_close(self):
        """All adapters implement close() without error."""
        adapters = [
            PubMedAdapter(), CochraneAdapter(), ClinicalTrialsAdapter(),
            EuropePMCAdapter(), NICEAdapter(),
        ]
        for adapter in adapters:
            # Just ensure close can be called (client.aclose is mocked via AsyncClient)
            await adapter.close()
