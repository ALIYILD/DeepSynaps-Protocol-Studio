"""
Test Suite — Batch 6: Adverse Event + AI Literature Adapters
=============================================================
Comprehensive tests for:
  1. SemanticScholarAdapter (AI literature search)
  2. AEOLUSAdapter (standardized FAERS)
  3. SIDERAdapter (drug side effects)
  4. OffsidesTwosidesAdapter (OFFSIDES/TWOSIDES data mining)

All tests use mocked HTTP responses — no real network calls.
Run with:  pytest test_batch6_adverse_events.py -v
"""

import json
import pytest
import httpx
from datetime import datetime
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch, mock_open, PropertyMock

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def mock_httpx_client():
    """Create a mock httpx.AsyncClient."""
    client = AsyncMock(spec=httpx.AsyncClient)
    client.aclose = AsyncMock()
    client.get = AsyncMock()
    client.post = AsyncMock()
    client.stream = MagicMock()
    return client


# ---------------------------------------------------------------------------
# Semantic Scholar Adapter Tests
# ---------------------------------------------------------------------------

class TestSemanticScholarAdapter:
    """Tests for the SemanticScholarAdapter."""

    @pytest.fixture
    def sample_paper(self):
        return {
            "paperId": "test-paper-123",
            "title": "Adverse Drug Reactions in Clinical Trials",
            "abstract": "This study examines adverse drug reactions...",
            "year": 2023,
            "authors": [{"name": "Alice Smith"}, {"name": "Bob Jones"}],
            "venue": "Journal of Pharmacovigilance",
            "fieldsOfStudy": ["Medicine", "Pharmacology"],
            "citationCount": 150,
            "referenceCount": 80,
            "influentialCitationCount": 25,
            "isOpenAccess": True,
            "openAccessPdf": {"url": "https://pdf.example.com/test.pdf"},
            "tldr": {"text": "ADRs are common in clinical trials and require monitoring."},
        }

    @pytest.fixture
    def sample_search_response(self, sample_paper):
        return {
            "total": 1,
            "data": [sample_paper],
        }

    @pytest.mark.asyncio
    async def test_validate_connection_success(self, mock_httpx_client):
        """Test successful connection validation."""
        from semantic_scholar_adapter import SemanticScholarAdapter

        adapter = SemanticScholarAdapter()

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_httpx_client.get.return_value = mock_resp
        adapter.client = mock_httpx_client

        result = await adapter.validate_connection()
        assert result is True
        mock_httpx_client.get.assert_called_once()

    @pytest.mark.asyncio
    async def test_validate_connection_failure(self, mock_httpx_client):
        """Test failed connection validation."""
        from semantic_scholar_adapter import SemanticScholarAdapter

        adapter = SemanticScholarAdapter()
        mock_httpx_client.get.side_effect = httpx.RequestError("Connection refused")
        adapter.client = mock_httpx_client

        result = await adapter.validate_connection()
        assert result is False

    @pytest.mark.asyncio
    async def test_search_returns_papers(self, mock_httpx_client, sample_search_response):
        """Test search returns paper records."""
        from semantic_scholar_adapter import SemanticScholarAdapter

        adapter = SemanticScholarAdapter()
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = sample_search_response
        mock_httpx_client.get.return_value = mock_resp
        adapter.client = mock_httpx_client

        results = await adapter.search("adverse drug reaction", filters={"limit": 5})
        assert len(results) == 1
        assert results[0]["paperId"] == "test-paper-123"
        assert results[0]["title"] == "Adverse Drug Reactions in Clinical Trials"

    @pytest.mark.asyncio
    async def test_search_rate_limit_returns_empty(self, mock_httpx_client):
        """Test search handles rate limit gracefully (returns empty without retry loop)."""
        from semantic_scholar_adapter import SemanticScholarAdapter

        adapter = SemanticScholarAdapter()
        # Clear any stale cache
        adapter._cache_memory.clear()

        rate_limited_resp = MagicMock()
        rate_limited_resp.status_code = 429
        rate_limited_resp.headers = {"Retry-After": "1"}

        mock_httpx_client.get.return_value = rate_limited_resp
        adapter.client = mock_httpx_client

        results = await adapter.search("rate_limit_test_query_xyz")
        assert results == []
        assert mock_httpx_client.get.call_count >= 1

    @pytest.mark.asyncio
    async def test_search_http_error_returns_empty(self, mock_httpx_client):
        """Test search returns empty list on HTTP error."""
        from semantic_scholar_adapter import SemanticScholarAdapter

        adapter = SemanticScholarAdapter()
        mock_resp = MagicMock()
        mock_resp.status_code = 500
        mock_resp.text = "Internal Server Error"
        mock_httpx_client.get.return_value = mock_resp
        adapter.client = mock_httpx_client

        results = await adapter.search("test query")
        assert results == []

    @pytest.mark.asyncio
    async def test_get_paper(self, mock_httpx_client, sample_paper):
        """Test fetching a single paper by ID."""
        from semantic_scholar_adapter import SemanticScholarAdapter

        adapter = SemanticScholarAdapter()
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = sample_paper
        mock_httpx_client.get.return_value = mock_resp
        adapter.client = mock_httpx_client

        paper = await adapter.get_paper("test-paper-123")
        assert paper is not None
        assert paper["paperId"] == "test-paper-123"
        assert paper["title"] == "Adverse Drug Reactions in Clinical Trials"

    def test_transform_to_canonical(self, sample_paper):
        """Test canonical transformation of a paper."""
        from semantic_scholar_adapter import SemanticScholarAdapter

        adapter = SemanticScholarAdapter()
        canonical = adapter.transform_to_canonical(sample_paper, entity_type="evidence")

        assert canonical["entity_type"] == "evidence"
        assert canonical["source_database"] == "semantic_scholar"
        assert canonical["source_id"] == "test-paper-123"
        assert canonical["title"] == "Adverse Drug Reactions in Clinical Trials"
        assert "Alice Smith" in canonical["authors"]
        assert "Bob Jones" in canonical["authors"]
        assert canonical["year"] == 2023
        assert canonical["citation_count"] == 150
        assert canonical["influential_citation_count"] == 25
        assert canonical["is_open_access"] is True
        assert canonical["tldr"] == "ADRs are common in clinical trials and require monitoring."
        assert "confidence" in canonical
        assert "provenance" in canonical
        assert canonical["adverse_event_relevance_score"] > 0

    def test_transform_ae_relevance_scoring(self):
        """Test that AE relevance scoring works correctly."""
        from semantic_scholar_adapter import SemanticScholarAdapter

        adapter = SemanticScholarAdapter()
        # Paper about pharmacovigilance should score higher
        high_relevance_paper = {
            "paperId": "pharm-1",
            "title": "Pharmacovigilance and adverse event monitoring in FAERS",
            "abstract": "We analyzed adverse drug reactions using MedDRA terms...",
            "year": 2023,
            "authors": [],
            "venue": "Drug Safety",
            "fieldsOfStudy": ["Medicine", "Pharmacology"],
            "citationCount": 200,
            "referenceCount": 50,
            "influentialCitationCount": 30,
            "isOpenAccess": True,
            "openAccessPdf": {},
            "tldr": {"text": "Pharmacovigilance analysis shows drug safety signals."},
        }
        result = adapter.transform_to_canonical(high_relevance_paper)
        assert result["adverse_event_relevance_score"] > 0.3

    def test_get_provenance(self, sample_paper):
        """Test provenance metadata generation."""
        from semantic_scholar_adapter import SemanticScholarAdapter

        adapter = SemanticScholarAdapter()
        provenance = adapter.get_provenance(sample_paper)

        assert provenance["source_database"] == "semantic_scholar"
        assert provenance["source_version"] == "2024-06"
        assert provenance["confidence_tier"] == "B"
        assert provenance["research_only"] is True
        assert provenance["citation_metrics_available"] is True
        assert provenance["ai_generated_summary"] is True
        assert provenance["publication_year"] == 2023

    def test_get_confidence_score(self, sample_paper):
        """Test confidence score computation."""
        from semantic_scholar_adapter import SemanticScholarAdapter

        adapter = SemanticScholarAdapter()
        score = adapter.get_confidence_score(sample_paper)

        assert 0 <= score["overall"] <= 1.0
        assert 0 <= score["evidence_strength"] <= 1.0
        assert 0 <= score["sample_size"] <= 1.0
        assert 0 <= score["replication"] <= 1.0
        assert 0 <= score["temporal_relevance"] <= 1.0
        assert 0 <= score["data_quality"] <= 1.0

    def test_get_confidence_score_low_citations(self):
        """Test confidence score for low-citation paper."""
        from semantic_scholar_adapter import SemanticScholarAdapter

        adapter = SemanticScholarAdapter()
        low_cite_paper = {"paperId": "x", "title": "X", "citationCount": 0, "influentialCitationCount": 0, "year": 2000, "isOpenAccess": False}
        score = adapter.get_confidence_score(low_cite_paper)
        assert score["overall"] < 0.5

    def test_cache_operations(self):
        """Test in-memory and disk cache operations."""
        from semantic_scholar_adapter import SemanticScholarAdapter

        adapter = SemanticScholarAdapter(cache_dir="/tmp/test_ss_cache")
        adapter._cache_set("test_key", {"data": "value"})

        # Memory cache
        mem = adapter._cache_get("test_key")
        assert mem == {"data": "value"}

        # Disk cache
        adapter._cache_memory.clear()
        disk = adapter._cache_get("test_key")
        assert disk == {"data": "value"}

        # Cleanup
        import shutil
        shutil.rmtree("/tmp/test_ss_cache", ignore_errors=True)

    def test_adapter_config(self):
        """Test adapter configuration attributes."""
        from semantic_scholar_adapter import SemanticScholarAdapter

        adapter = SemanticScholarAdapter()
        assert adapter.name == "semantic_scholar"
        assert adapter.display_name == "Semantic Scholar"
        assert adapter.confidence_tier == "B"
        assert "literature" in adapter.data_types
        assert adapter.rate_limit_per_minute == 20
        assert adapter.requires_auth is False

    def test_adapter_with_api_key(self):
        """Test adapter configuration with API key."""
        from semantic_scholar_adapter import SemanticScholarAdapter

        adapter = SemanticScholarAdapter(api_key="test-key-123")
        assert adapter.api_key == "test-key-123"
        assert adapter.requires_auth is True
        assert adapter.auth_type == "api_key"
        assert adapter.rate_limit_per_minute == 100


# ---------------------------------------------------------------------------
# AEOLUS Adapter Tests
# ---------------------------------------------------------------------------

class TestAEOLUSAdapter:
    """Tests for the AEOLUSAdapter."""

    @pytest.fixture
    def sample_aeolus_record(self):
        return {
            "drug_concept_id": "191337",
            "drug_concept_name": "Aspirin",
            "condition_concept_id": "31967",
            "condition_concept_name": "Gastrointestinal hemorrhage",
            "snomed_concept_id": "74474003",
            "snomed_concept_name": "Gastrointestinal hemorrhage",
            "meddra_concept_code": "10017955",
            "meddra_concept_name": "Gastrointestinal haemorrhage",
            "count": "2453",
        }

    @pytest.fixture
    def mock_aeolus_data_dir(self, tmp_path):
        """Create a temp directory with mock AEOLUS TSV data."""
        data_dir = tmp_path / "aeolus"
        data_dir.mkdir()
        tsv_file = data_dir / "aeolus_standardized.tsv"
        with open(tsv_file, "w", encoding="utf-8") as f:
            f.write("drug_concept_id\tdrug_concept_name\tcondition_concept_id\tcondition_concept_name\t")
            f.write("snomed_concept_id\tsnomed_concept_name\tmeddra_concept_code\tmeddra_concept_name\tcount\n")
            f.write("191337\tAspirin\t31967\tGastrointestinal hemorrhage\t")
            f.write("74474003\tGastrointestinal hemorrhage\t10017955\tGastrointestinal haemorrhage\t2453\n")
            f.write("191337\tAspirin\t377091\tAcute kidney injury\t")
            f.write("\t\t10038419\tAcute kidney injury\t892\n")
            f.write("40166035\tIbuprofen\t31967\tGastrointestinal hemorrhage\t")
            f.write("74474003\tGastrointestinal hemorrhage\t10017955\tGastrointestinal haemorrhage\t1520\n")
        return str(data_dir)

    @pytest.mark.asyncio
    async def test_validate_connection_with_local_data(self, mock_aeolus_data_dir):
        """Test validation when local data exists."""
        from aeolus_adapter import AEOLUSAdapter

        adapter = AEOLUSAdapter(data_dir=mock_aeolus_data_dir, auto_download=False)
        result = await adapter.validate_connection()
        assert result is True

    @pytest.mark.asyncio
    async def test_search_by_drug_name(self, mock_aeolus_data_dir):
        """Test searching by drug name."""
        from aeolus_adapter import AEOLUSAdapter

        adapter = AEOLUSAdapter(data_dir=mock_aeolus_data_dir, auto_download=False)
        results = await adapter.search("Aspirin", filters={"search_field": "drug", "limit": 50})
        assert len(results) >= 1
        assert any(r.get("drug_concept_name") == "Aspirin" for r in results)

    @pytest.mark.asyncio
    async def test_search_by_condition(self, mock_aeolus_data_dir):
        """Test searching by adverse event condition."""
        from aeolus_adapter import AEOLUSAdapter

        adapter = AEOLUSAdapter(data_dir=mock_aeolus_data_dir, auto_download=False)
        results = await adapter.search(
            "Gastrointestinal hemorrhage",
            filters={"search_field": "condition", "limit": 50}
        )
        assert len(results) >= 1
        assert any("hemorrhage" in r.get("condition_concept_name", "").lower() for r in results)

    @pytest.mark.asyncio
    async def test_search_with_min_count_filter(self, mock_aeolus_data_dir):
        """Test search with minimum report count filter."""
        from aeolus_adapter import AEOLUSAdapter

        adapter = AEOLUSAdapter(data_dir=mock_aeolus_data_dir, auto_download=False)
        results = await adapter.search("Aspirin", filters={"min_count": 1000, "search_field": "drug"})
        for r in results:
            count = int(r.get("count", 0) or 0)
            assert count >= 1000

    @pytest.mark.asyncio
    async def test_search_no_data_returns_empty(self):
        """Test search returns empty when no data available."""
        from aeolus_adapter import AEOLUSAdapter

        import tempfile
        with tempfile.TemporaryDirectory() as tmpdir:
            adapter = AEOLUSAdapter(data_dir=tmpdir, auto_download=False)
            results = await adapter.search("Aspirin")
            assert results == []

    @pytest.mark.asyncio
    async def test_search_by_drug_convenience(self, mock_aeolus_data_dir):
        """Test the convenience method search_by_drug."""
        from aeolus_adapter import AEOLUSAdapter

        adapter = AEOLUSAdapter(data_dir=mock_aeolus_data_dir, auto_download=False)
        results = await adapter.search_by_drug("Aspirin")
        assert len(results) >= 1

    @pytest.mark.asyncio
    async def test_search_by_condition_convenience(self, mock_aeolus_data_dir):
        """Test the convenience method search_by_condition."""
        from aeolus_adapter import AEOLUSAdapter

        adapter = AEOLUSAdapter(data_dir=mock_aeolus_data_dir, auto_download=False)
        results = await adapter.search_by_condition("kidney injury")
        assert len(results) >= 1

    def test_transform_to_canonical(self, sample_aeolus_record):
        """Test canonical transformation of an AEOLUS record."""
        from aeolus_adapter import AEOLUSAdapter

        adapter = AEOLUSAdapter(auto_download=False)
        canonical = adapter.transform_to_canonical(sample_aeolus_record)

        assert canonical["entity_type"] == "adverse_event"
        assert canonical["source_database"] == "aeolus"
        assert canonical["drug_name"] == "Aspirin"
        assert canonical["drug_id_rxcui"] == "191337"
        assert canonical["event_name"] == "Gastrointestinal hemorrhage"
        assert canonical["report_count"] == 2453
        assert canonical["meddra_code"] == "10017955"
        assert canonical["severity"] == "unknown"
        assert "confidence" in canonical
        assert "provenance" in canonical

    def test_get_provenance(self):
        """Test AEOLUS provenance generation."""
        from aeolus_adapter import AEOLUSAdapter

        adapter = AEOLUSAdapter(auto_download=False)
        prov = adapter.get_provenance({"drug_concept_id": "191337"})

        assert prov["source_database"] == "aeolus"
        assert prov["confidence_tier"] == "B"
        assert prov["research_only"] is True  # SAFETY REQUIREMENT
        assert "caveats" in prov
        assert "Spontaneous reporting" in prov["caveats"][0]

    def test_get_confidence_score(self, sample_aeolus_record):
        """Test confidence score computation."""
        from aeolus_adapter import AEOLUSAdapter

        adapter = AEOLUSAdapter(auto_download=False)
        score = adapter.get_confidence_score(sample_aeolus_record)

        assert 0 <= score["overall"] <= 1.0
        assert score["sample_size"] > 0.3  # 2453 reports should give decent score
        assert score["evidence_strength"] == 0.20  # observational
        assert score["data_quality"] == 0.65

    def test_get_confidence_score_zero_count(self):
        """Test confidence score with zero report count."""
        from aeolus_adapter import AEOLUSAdapter

        adapter = AEOLUSAdapter(auto_download=False)
        score = adapter.get_confidence_score({"count": "0"})
        assert score["sample_size"] < 0.1

    def test_adapter_config(self):
        """Test AEOLUS adapter configuration."""
        from aeolus_adapter import AEOLUSAdapter

        adapter = AEOLUSAdapter(auto_download=False)
        assert adapter.name == "aeolus"
        assert adapter.display_name == "AEOLUS (Standardized FAERS)"
        assert adapter.confidence_tier == "B"
        assert adapter.research_only is True
        assert adapter.data_types == ["adverse_event", "drug_safety", "spontaneous_report"]

    @pytest.mark.asyncio
    async def test_get_drug_event_summary(self, mock_aeolus_data_dir):
        """Test drug event summary aggregation."""
        from aeolus_adapter import AEOLUSAdapter

        adapter = AEOLUSAdapter(data_dir=mock_aeolus_data_dir, auto_download=False)
        summary = await adapter.get_drug_event_summary("Aspirin")

        assert summary["drug"] == "Aspirin"
        assert summary["total_events"] > 0
        assert summary["total_reports"] > 0
        assert len(summary["top_events"]) > 0


# ---------------------------------------------------------------------------
# SIDER Adapter Tests
# ---------------------------------------------------------------------------

class TestSIDERAdapter:
    """Tests for the SIDERAdapter."""

    @pytest.fixture
    def mock_sider_data_dir(self, tmp_path):
        """Create a temp directory with mock SIDER TSV data."""
        data_dir = tmp_path / "sider"
        data_dir.mkdir()

        # drug_names.tsv
        with open(data_dir / "sider_drug_names.tsv", "w") as f:
            f.write("stitch_id_flat\tstitch_id_stereo\tdrug_name\n")
            f.write("CID000002173\tCID000002173\tAspirin\n")
            f.write("CID000003345\tCID000003345\tIbuprofen\n")

        # meddra_all_se.tsv.gz (create uncompressed for test)
        import gzip
        with gzip.open(data_dir / "sider_meddra_all_se.tsv.gz", "wt") as f:
            f.write("stitch_id_flat\tstitch_id_stereo\tumls_cui_from_label\t")
            f.write("meddra_type\tumls_cui_of_meddra_term\tside_effect_name\n")
            f.write("CID000002173\tCID000002173\tC0017185\tPT\tC0017185\tGastric ulcer\n")
            f.write("CID000002173\tCID000002173\tC0020676\tPT\tC0020676\tHypersensitivity\n")
            f.write("CID000003345\tCID000003345\tC0017185\tPT\tC0017185\tGastric ulcer\n")

        # meddra_freq.tsv.gz
        with gzip.open(data_dir / "sider_meddra_freq.tsv.gz", "wt") as f:
            f.write("stitch_id_flat\tstitch_id_stereo\tumls_cui\t")
            f.write("placebo\tfrequency_description\tfrequency_lower_bound\t")
            f.write("frequency_upper_bound\tmeddra_type\tumls_cui_of_meddra_term\tside_effect_name\n")
            f.write("CID000002173\tCID000002173\tC0017185\t\t\t")
            f.write("0.01\t0.05\tPT\tC0017185\tGastric ulcer\n")

        return str(data_dir)

    @pytest.mark.asyncio
    async def test_validate_connection_with_local_data(self, mock_sider_data_dir):
        """Test validation when local data exists."""
        from sider_adapter import SIDERAdapter

        adapter = SIDERAdapter(data_dir=mock_sider_data_dir, auto_download=False)
        result = await adapter.validate_connection()
        assert result is True

    @pytest.mark.asyncio
    async def test_search_by_drug(self, mock_sider_data_dir):
        """Test searching by drug name."""
        from sider_adapter import SIDERAdapter

        adapter = SIDERAdapter(data_dir=mock_sider_data_dir, auto_download=False)
        results = await adapter.search("Aspirin", filters={"search_field": "drug"})
        assert len(results) >= 1
        for r in results:
            assert r.get("drug_name") == "Aspirin" or r.get("stitch_id_flat") == "CID000002173"

    @pytest.mark.asyncio
    async def test_search_by_side_effect(self, mock_sider_data_dir):
        """Test searching by side effect name."""
        from sider_adapter import SIDERAdapter

        adapter = SIDERAdapter(data_dir=mock_sider_data_dir, auto_download=False)
        results = await adapter.search("Gastric ulcer", filters={"search_field": "side_effect"})
        assert len(results) >= 1
        assert any("Gastric ulcer" in r.get("side_effect_name", "") for r in results)

    @pytest.mark.asyncio
    async def test_search_with_frequency_enrichment(self, mock_sider_data_dir):
        """Test that frequency data is enriched in results."""
        from sider_adapter import SIDERAdapter

        adapter = SIDERAdapter(data_dir=mock_sider_data_dir, auto_download=False)
        results = await adapter.search(
            "Aspirin",
            filters={"search_field": "drug", "include_frequency": True}
        )
        # At least one result should have frequency data
        freq_results = [r for r in results if r.get("frequency_description") or r.get("frequency_lower_bound")]
        assert len(freq_results) >= 1

    @pytest.mark.asyncio
    async def test_get_side_effects_for_drug(self, mock_sider_data_dir):
        """Test convenience method for drug side effects."""
        from sider_adapter import SIDERAdapter

        adapter = SIDERAdapter(data_dir=mock_sider_data_dir, auto_download=False)
        results = await adapter.get_side_effects_for_drug("Aspirin")
        assert len(results) >= 1

    @pytest.mark.asyncio
    async def test_get_drugs_for_side_effect(self, mock_sider_data_dir):
        """Test convenience method for side effect drugs."""
        from sider_adapter import SIDERAdapter

        adapter = SIDERAdapter(data_dir=mock_sider_data_dir, auto_download=False)
        results = await adapter.get_drugs_for_side_effect("Gastric ulcer")
        assert len(results) >= 1

    @pytest.mark.asyncio
    async def test_list_all_drugs(self, mock_sider_data_dir):
        """Test listing all drugs in the dataset."""
        from sider_adapter import SIDERAdapter

        adapter = SIDERAdapter(data_dir=mock_sider_data_dir, auto_download=False)
        drugs = await adapter.list_all_drugs()
        drug_names = [d["drug_name"] for d in drugs]
        assert "Aspirin" in drug_names
        assert "Ibuprofen" in drug_names

    @pytest.mark.asyncio
    async def test_list_all_side_effects(self, mock_sider_data_dir):
        """Test listing all side effects in the dataset."""
        from sider_adapter import SIDERAdapter

        adapter = SIDERAdapter(data_dir=mock_sider_data_dir, auto_download=False)
        effects = await adapter.list_all_side_effects()
        assert "Gastric ulcer" in effects

    def test_transform_to_canonical(self):
        """Test canonical transformation of a SIDER record."""
        from sider_adapter import SIDERAdapter

        adapter = SIDERAdapter(auto_download=False)
        raw = {
            "stitch_id_flat": "CID000002173",
            "drug_name": "Aspirin",
            "side_effect_name": "Gastric ulcer",
            "meddra_type": "PT",
            "umls_cui_of_meddra_term": "C0017185",
            "umls_cui_from_label": "C0017185",
            "frequency_description": "frequent",
            "frequency_lower_bound": "0.01",
            "frequency_upper_bound": "0.05",
            "placebo": "",
        }
        canonical = adapter.transform_to_canonical(raw)

        assert canonical["entity_type"] == "adverse_event"
        assert canonical["source_database"] == "sider"
        assert canonical["drug_name"] == "Aspirin"
        assert canonical["drug_id_stitch"] == "CID000002173"
        assert canonical["event_name"] == "Gastric ulcer"
        assert canonical["meddra_type"] == "PT"
        assert canonical["frequency"] == pytest.approx(0.03)  # midpoint of 0.01-0.05
        assert canonical["severity"] == "uncommon"
        assert "confidence" in canonical
        assert "provenance" in canonical

    def test_transform_no_frequency(self):
        """Test transform when no frequency data available."""
        from sider_adapter import SIDERAdapter

        adapter = SIDERAdapter(auto_download=False)
        raw = {
            "stitch_id_flat": "CID000002173",
            "drug_name": "Aspirin",
            "side_effect_name": "Headache",
            "meddra_type": "PT",
            "umls_cui_of_meddra_term": "C0018681",
        }
        canonical = adapter.transform_to_canonical(raw)
        assert canonical["frequency"] is None
        assert canonical["severity"] == "unknown"

    def test_get_provenance(self):
        """Test SIDER provenance generation."""
        from sider_adapter import SIDERAdapter

        adapter = SIDERAdapter(auto_download=False)
        prov = adapter.get_provenance({})

        assert prov["source_database"] == "sider"
        assert prov["research_only"] is True  # SAFETY REQUIREMENT
        assert "caveats" in prov
        assert "coding_systems" in prov

    def test_get_confidence_score(self):
        """Test SIDER confidence score computation."""
        from sider_adapter import SIDERAdapter

        adapter = SIDERAdapter(auto_download=False)

        # With frequency data
        score_freq = adapter.get_confidence_score({
            "frequency_description": "frequent",
            "frequency_lower_bound": "0.01",
            "frequency_upper_bound": "0.10",
            "placebo": "",
        })
        assert score_freq["overall"] > 0.4

        # Without frequency data
        score_no_freq = adapter.get_confidence_score({
            "frequency_description": "",
            "frequency_lower_bound": "",
        })
        assert score_no_freq["overall"] < score_freq["overall"]

    def test_adapter_config(self):
        """Test SIDER adapter configuration."""
        from sider_adapter import SIDERAdapter

        adapter = SIDERAdapter(auto_download=False)
        assert adapter.name == "sider"
        assert adapter.display_name == "SIDER (Side Effect Resource)"
        assert adapter.confidence_tier == "B"
        assert adapter.research_only is True


# ---------------------------------------------------------------------------
# OFFSIDES/TWOSIDES Adapter Tests
# ---------------------------------------------------------------------------

class TestOffsidesTwosidesAdapter:
    """Tests for the OffsidesTwosidesAdapter."""

    @pytest.fixture
    def sample_offsides_record(self):
        return {
            "drug_rxnorn_id": "191337",
            "drug_name": "Aspirin",
            "condition_meddra_id": "10017955",
            "condition_name": "Gastrointestinal haemorrhage",
            "PRR": "4.52",
            "PRR_error": "0.32",
            "IC": "2.18",
            "IC_lower": "1.95",
            "IC_upper": "2.41",
            "case_count": "2453",
            "drug_count": "52300",
            "reports_with_drug": "52300",
            "reports_with_event": "15200",
            "total_reports": "8500000",
            "p_value": "0.000001",
            "bonferroni_significant": "true",
        }

    @pytest.fixture
    def sample_twosides_record(self):
        return {
            "drug1_rxnorm_id": "191337",
            "drug1_name": "Aspirin",
            "drug2_rxnorm_id": "40166035",
            "drug2_name": "Ibuprofen",
            "condition_meddra_id": "10017955",
            "condition_name": "Gastrointestinal haemorrhage",
            "PRR": "8.12",
            "PRR_error": "0.45",
            "IC": "3.25",
            "IC_lower": "2.98",
            "IC_upper": "3.52",
            "case_count": "892",
            "combo_count": "12800",
            "reports_with_combo": "12800",
            "reports_with_event": "15200",
            "total_reports": "8500000",
            "p_value": "0.0000001",
            "bonferroni_significant": "true",
        }

    @pytest.fixture
    def mock_onsides_data_dir(self, tmp_path):
        """Create a temp directory with mock OnSIDES TSV data."""
        data_dir = tmp_path / "onsides"
        data_dir.mkdir()

        import gzip

        # OFFSIDES
        with gzip.open(data_dir / "onsides_offsides.tsv.gz", "wt") as f:
            f.write("drug_rxnorn_id\tdrug_name\tcondition_meddra_id\tcondition_name\t")
            f.write("PRR\tPRR_error\tIC\tIC_lower\tIC_upper\t")
            f.write("case_count\tdrug_count\treports_with_drug\treports_with_event\t")
            f.write("total_reports\tp_value\tbonferroni_significant\n")
            f.write("191337\tAspirin\t10017955\tGastrointestinal haemorrhage\t")
            f.write("4.52\t0.32\t2.18\t1.95\t2.41\t")
            f.write("2453\t52300\t52300\t15200\t8500000\t0.000001\ttrue\n")
            f.write("191337\tAspirin\t10038419\tAcute kidney injury\t")
            f.write("3.10\t0.28\t1.55\t1.30\t1.80\t")
            f.write("892\t52300\t52300\t5100\t8500000\t0.0001\ttrue\n")

        # TWOSIDES
        with gzip.open(data_dir / "onsides_twosides.tsv.gz", "wt") as f:
            f.write("drug1_rxnorm_id\tdrug1_name\tdrug2_rxnorm_id\tdrug2_name\t")
            f.write("condition_meddra_id\tcondition_name\t")
            f.write("PRR\tPRR_error\tIC\tIC_lower\tIC_upper\t")
            f.write("case_count\tcombo_count\treports_with_combo\treports_with_event\t")
            f.write("total_reports\tp_value\tbonferroni_significant\n")
            f.write("191337\tAspirin\t40166035\tIbuprofen\t10017955\t")
            f.write("Gastrointestinal haemorrhage\t8.12\t0.45\t3.25\t2.98\t3.52\t")
            f.write("892\t12800\t12800\t15200\t8500000\t0.0000001\ttrue\n")

        # Drug mapping
        with open(data_dir / "onsides_drug_names.tsv", "w") as f:
            f.write("rxnorm_id\tdrug_name\tgeneric_name\n")
            f.write("191337\tAspirin\tAcetylsalicylic acid\n")
            f.write("40166035\tIbuprofen\tIbuprofen\n")

        # Event mapping
        with open(data_dir / "onsides_meddra_terms.tsv", "w") as f:
            f.write("meddra_id\tmeddra_term\tmeddra_level\n")
            f.write("10017955\tGastrointestinal haemorrhage\tPT\n")
            f.write("10038419\tAcute kidney injury\tPT\n")

        return str(data_dir)

    @pytest.mark.asyncio
    async def test_validate_connection_with_local_data(self, mock_onsides_data_dir):
        """Test validation when local data exists."""
        from offsides_twosides_adapter import OffsidesTwosidesAdapter

        adapter = OffsidesTwosidesAdapter(data_dir=mock_onsides_data_dir, auto_download=False)
        result = await adapter.validate_connection()
        assert result is True

    @pytest.mark.asyncio
    async def test_search_offsides_by_drug(self, mock_onsides_data_dir):
        """Test OFFSIDES search by drug."""
        from offsides_twosides_adapter import OffsidesTwosidesAdapter

        adapter = OffsidesTwosidesAdapter(data_dir=mock_onsides_data_dir, auto_download=False)
        results = await adapter.search("Aspirin", filters={"dataset": "offsides", "search_field": "drug"})
        assert len(results) >= 1
        offsides_results = [r for r in results if r.get("_dataset") == "OFFSIDES"]
        assert len(offsides_results) >= 1

    @pytest.mark.asyncio
    async def test_search_twosides_by_drug(self, mock_onsides_data_dir):
        """Test TWOSIDES search by drug."""
        from offsides_twosides_adapter import OffsidesTwosidesAdapter

        adapter = OffsidesTwosidesAdapter(data_dir=mock_onsides_data_dir, auto_download=False)
        results = await adapter.search("Aspirin", filters={"dataset": "twosides", "search_field": "drug"})
        twosides_results = [r for r in results if r.get("_dataset") == "TWOSIDES"]
        assert len(twosides_results) >= 1

    @pytest.mark.asyncio
    async def test_search_with_min_ic_filter(self, mock_onsides_data_dir):
        """Test search with minimum IC threshold."""
        from offsides_twosides_adapter import OffsidesTwosidesAdapter

        adapter = OffsidesTwosidesAdapter(data_dir=mock_onsides_data_dir, auto_download=False)
        results = await adapter.search("Aspirin", filters={"min_ic": 2.0, "dataset": "offsides"})
        for r in results:
            ic = float(r.get("IC", 0) or 0)
            assert ic >= 2.0

    @pytest.mark.asyncio
    async def test_search_bonferroni_only(self, mock_onsides_data_dir):
        """Test search with bonferroni significance filter."""
        from offsides_twosides_adapter import OffsidesTwosidesAdapter

        adapter = OffsidesTwosidesAdapter(data_dir=mock_onsides_data_dir, auto_download=False)
        results = await adapter.search(
            "Aspirin",
            filters={"bonferroni_only": True, "dataset": "offsides"}
        )
        for r in results:
            sig = r.get("bonferroni_significant", "").lower()
            assert sig in ("true", "1", "yes", "t")

    @pytest.mark.asyncio
    async def test_search_by_condition(self, mock_onsides_data_dir):
        """Test searching by adverse event condition."""
        from offsides_twosides_adapter import OffsidesTwosidesAdapter

        adapter = OffsidesTwosidesAdapter(data_dir=mock_onsides_data_dir, auto_download=False)
        results = await adapter.search(
            "haemorrhage",
            filters={"search_field": "event", "dataset": "offsides"}
        )
        assert len(results) >= 1

    @pytest.mark.asyncio
    async def test_search_no_match_returns_empty(self, mock_onsides_data_dir):
        """Test search with no matches returns empty list."""
        from offsides_twosides_adapter import OffsidesTwosidesAdapter

        adapter = OffsidesTwosidesAdapter(data_dir=mock_onsides_data_dir, auto_download=False)
        results = await adapter.search("NonExistentDrugXYZ999")
        assert results == []

    @pytest.mark.asyncio
    async def test_search_offsides_convenience(self, mock_onsides_data_dir):
        """Test search_offsides convenience method."""
        from offsides_twosides_adapter import OffsidesTwosidesAdapter

        adapter = OffsidesTwosidesAdapter(data_dir=mock_onsides_data_dir, auto_download=False)
        results = await adapter.search_offsides("Aspirin")
        assert len(results) >= 1
        assert all(r.get("_dataset") == "OFFSIDES" for r in results)

    @pytest.mark.asyncio
    async def test_search_twosides_convenience(self, mock_onsides_data_dir):
        """Test search_twosides convenience method."""
        from offsides_twosides_adapter import OffsidesTwosidesAdapter

        adapter = OffsidesTwosidesAdapter(data_dir=mock_onsides_data_dir, auto_download=False)
        results = await adapter.search_twosides("Aspirin")
        assert len(results) >= 1
        assert all(r.get("_dataset") == "TWOSIDES" for r in results)

    @pytest.mark.asyncio
    async def test_get_top_signals(self, mock_onsides_data_dir):
        """Test getting top signals by IC."""
        from offsides_twosides_adapter import OffsidesTwosidesAdapter

        adapter = OffsidesTwosidesAdapter(data_dir=mock_onsides_data_dir, auto_download=False)
        top = await adapter.get_top_signals(dataset="offsides", min_ic=1.5, limit=10)
        assert len(top) >= 1
        # Should be sorted by IC descending
        ics = [float(r.get("IC", 0)) for r in top]
        assert ics == sorted(ics, reverse=True)

    @pytest.mark.asyncio
    async def test_get_drug_signal_summary(self, mock_onsides_data_dir):
        """Test drug signal summary."""
        from offsides_twosides_adapter import OffsidesTwosidesAdapter

        adapter = OffsidesTwosidesAdapter(data_dir=mock_onsides_data_dir, auto_download=False)
        summary = await adapter.get_drug_signal_summary("Aspirin")

        assert summary["drug"] == "Aspirin"
        assert "offsides" in summary
        assert "twosides" in summary

    def test_transform_offsides_to_canonical(self, sample_offsides_record):
        """Test canonical transformation of OFFSIDES record."""
        from offsides_twosides_adapter import OffsidesTwosidesAdapter

        adapter = OffsidesTwosidesAdapter(auto_download=False)
        sample_offsides_record["_dataset"] = "OFFSIDES"
        canonical = adapter.transform_to_canonical(sample_offsides_record)

        assert canonical["entity_type"] == "adverse_event"
        assert canonical["source_database"] == "offsides_twosides"
        assert canonical["dataset"] == "OFFSIDES"
        assert canonical["drug_name"] == "Aspirin"
        assert canonical["drug1_name"] == "Aspirin"
        assert canonical["is_drug_interaction"] is False
        assert canonical["event_name"] == "Gastrointestinal haemorrhage"
        assert canonical["statistical_scores"]["IC"] == 2.18
        assert canonical["statistical_scores"]["PRR"] == 4.52
        assert canonical["statistical_scores"]["bonferroni_significant"] is True
        assert canonical["severity"] == "moderate_signal"
        assert "confidence" in canonical
        assert "provenance" in canonical

    def test_transform_twosides_to_canonical(self, sample_twosides_record):
        """Test canonical transformation of TWOSIDES record."""
        from offsides_twosides_adapter import OffsidesTwosidesAdapter

        adapter = OffsidesTwosidesAdapter(auto_download=False)
        sample_twosides_record["_dataset"] = "TWOSIDES"
        canonical = adapter.transform_to_canonical(sample_twosides_record)

        assert canonical["dataset"] == "TWOSIDES"
        assert canonical["drug_name"] == "Aspirin + Ibuprofen"
        assert canonical["drug1_name"] == "Aspirin"
        assert canonical["drug2_name"] == "Ibuprofen"
        assert canonical["is_drug_interaction"] is True
        assert canonical["statistical_scores"]["IC"] == 3.25
        assert canonical["severity"] == "high_signal"  # IC > 3 + bonferroni sig

    def test_transform_with_high_ic(self):
        """Test severity classification with high IC values."""
        from offsides_twosides_adapter import OffsidesTwosidesAdapter

        adapter = OffsidesTwosidesAdapter(auto_download=False)
        high_ic = {
            "_dataset": "OFFSIDES",
            "drug_name": "X", "drug_rxnorn_id": "1",
            "condition_name": "Y", "condition_meddra_id": "Z",
            "IC": "4.5", "bonferroni_significant": "true",
            "PRR": "", "IC_lower": "", "IC_upper": "",
            "case_count": "", "p_value": "",
        }
        canonical = adapter.transform_to_canonical(high_ic)
        assert canonical["severity"] == "high_signal"

    def test_get_provenance(self):
        """Test OFFSIDES/TWOSIDES provenance generation."""
        from offsides_twosides_adapter import OffsidesTwosidesAdapter

        adapter = OffsidesTwosidesAdapter(auto_download=False)
        prov_off = adapter.get_provenance({"_dataset": "OFFSIDES"})

        assert prov_off["source_database"] == "offsides_twosides"
        assert prov_off["research_only"] is True  # SAFETY REQUIREMENT
        assert "caveats" in prov_off
        assert "OFFSIDES" in prov_off["data_origin"]

        prov_two = adapter.get_provenance({"_dataset": "TWOSIDES"})
        assert "TWOSIDES" in prov_two["data_origin"]

    def test_get_confidence_score(self, sample_offsides_record):
        """Test confidence score with strong signal."""
        from offsides_twosides_adapter import OffsidesTwosidesAdapter

        adapter = OffsidesTwosidesAdapter(auto_download=False)
        sample_offsides_record["_dataset"] = "OFFSIDES"
        score = adapter.get_confidence_score(sample_offsides_record)

        assert 0 <= score["overall"] <= 1.0
        assert score["evidence_strength"] > 0.5  # IC=2.18 gives good score
        assert score["replication"] > 0.5  # bonferroni sig

    def test_get_confidence_score_weak_signal(self):
        """Test confidence score with weak signal."""
        from offsides_twosides_adapter import OffsidesTwosidesAdapter

        adapter = OffsidesTwosidesAdapter(auto_download=False)
        weak = {"IC": "0.2", "p_value": "0.5", "bonferroni_significant": "false", "case_count": "10"}
        score = adapter.get_confidence_score(weak)
        assert score["overall"] < 0.4

    def test_safe_float(self):
        """Test safe float conversion."""
        from offsides_twosides_adapter import OffsidesTwosidesAdapter

        assert OffsidesTwosidesAdapter._safe_float("3.14") == 3.14
        assert OffsidesTwosidesAdapter._safe_float("") is None
        assert OffsidesTwosidesAdapter._safe_float("NA") is None
        assert OffsidesTwosidesAdapter._safe_float("NaN") is None
        assert OffsidesTwosidesAdapter._safe_float(None) is None

    def test_safe_int(self):
        """Test safe int conversion."""
        from offsides_twosides_adapter import OffsidesTwosidesAdapter

        assert OffsidesTwosidesAdapter._safe_int("42") == 42
        assert OffsidesTwosidesAdapter._safe_int("") is None
        assert OffsidesTwosidesAdapter._safe_int("NA") is None

    def test_adapter_config(self):
        """Test adapter configuration."""
        from offsides_twosides_adapter import OffsidesTwosidesAdapter

        adapter = OffsidesTwosidesAdapter(auto_download=False)
        assert adapter.name == "offsides_twosides"
        assert adapter.display_name == "OFFSIDES / TWOSIDES"
        assert adapter.confidence_tier == "B"
        assert adapter.research_only is True
        assert "drug_interaction" in adapter.data_types


# ---------------------------------------------------------------------------
# Cross-Cutting Tests
# ---------------------------------------------------------------------------

class TestCrossCutting:
    """Tests that apply to all adapters."""

    @pytest.mark.asyncio
    async def test_all_adapters_have_required_attributes(self):
        """Verify every adapter defines the required interface attributes."""
        from semantic_scholar_adapter import SemanticScholarAdapter
        from aeolus_adapter import AEOLUSAdapter
        from sider_adapter import SIDERAdapter
        from offsides_twosides_adapter import OffsidesTwosidesAdapter

        adapters = [
            SemanticScholarAdapter(),
            AEOLUSAdapter(auto_download=False),
            SIDERAdapter(auto_download=False),
            OffsidesTwosidesAdapter(auto_download=False),
        ]

        required_attrs = [
            "name", "display_name", "source_url", "version",
            "confidence_tier", "data_types", "rate_limit_per_minute",
            "requires_auth", "auth_type",
        ]

        for adapter in adapters:
            for attr in required_attrs:
                assert hasattr(adapter, attr), f"{adapter.name} missing {attr}"
                val = getattr(adapter, attr)
                assert val is not None, f"{adapter.name}.{attr} is None"

    @pytest.mark.asyncio
    async def test_all_adapters_have_required_methods(self):
        """Verify every adapter implements required methods."""
        from semantic_scholar_adapter import SemanticScholarAdapter
        from aeolus_adapter import AEOLUSAdapter
        from sider_adapter import SIDERAdapter
        from offsides_twosides_adapter import OffsidesTwosidesAdapter

        adapters = [
            SemanticScholarAdapter(),
            AEOLUSAdapter(auto_download=False),
            SIDERAdapter(auto_download=False),
            OffsidesTwosidesAdapter(auto_download=False),
        ]

        required_methods = [
            "validate_connection", "search", "transform_to_canonical",
            "get_provenance", "get_confidence_score", "close",
        ]

        for adapter in adapters:
            for method in required_methods:
                assert hasattr(adapter, method), f"{adapter.name} missing {method}"
                assert callable(getattr(adapter, method)), f"{adapter.name}.{method} not callable"

    def test_all_adverse_event_adapters_research_only(self):
        """Verify all adverse event adapters mark data as research_only."""
        from aeolus_adapter import AEOLUSAdapter
        from sider_adapter import SIDERAdapter
        from offsides_twosides_adapter import OffsidesTwosidesAdapter

        ae_adapters = [
            AEOLUSAdapter(auto_download=False),
            SIDERAdapter(auto_download=False),
            OffsidesTwosidesAdapter(auto_download=False),
        ]

        for adapter in ae_adapters:
            assert adapter.research_only is True, f"{adapter.name} must have research_only=True"
            prov = adapter.get_provenance({})
            assert prov["research_only"] is True, f"{adapter.name} provenance must have research_only=True"

    def test_confidence_scores_in_valid_range(self):
        """Verify all confidence score components are in [0, 1]."""
        from semantic_scholar_adapter import SemanticScholarAdapter
        from aeolus_adapter import AEOLUSAdapter
        from sider_adapter import SIDERAdapter
        from offsides_twosides_adapter import OffsidesTwosidesAdapter

        test_results = [
            {"paperId": "x", "title": "Test", "citationCount": 100, "influentialCitationCount": 10, "year": 2023, "isOpenAccess": True},
            {"count": "100"},
            {"frequency_description": "common", "frequency_lower_bound": "0.01", "frequency_upper_bound": "0.10", "placebo": ""},
            {"IC": "2.5", "p_value": "0.001", "bonferroni_significant": "true", "case_count": "500"},
        ]

        adapters = [
            SemanticScholarAdapter(),
            AEOLUSAdapter(auto_download=False),
            SIDERAdapter(auto_download=False),
            OffsidesTwosidesAdapter(auto_download=False),
        ]

        for adapter, result in zip(adapters, test_results):
            if hasattr(adapter, "get_confidence_score"):
                score = adapter.get_confidence_score(result)
                assert "overall" in score
                assert 0 <= score["overall"] <= 1.0, f"{adapter.name} overall out of range"
                for key in ["data_quality", "evidence_strength", "sample_size",
                           "replication", "consistency", "temporal_relevance", "population_match"]:
                    assert key in score, f"{adapter.name} missing {key}"
                    assert 0 <= score[key] <= 1.0, f"{adapter.name}.{key} out of range"

    @pytest.mark.asyncio
    async def test_all_adapters_close_gracefully(self):
        """Test that all adapters can be closed without errors."""
        from semantic_scholar_adapter import SemanticScholarAdapter
        from aeolus_adapter import AEOLUSAdapter
        from sider_adapter import SIDERAdapter
        from offsides_twosides_adapter import OffsidesTwosidesAdapter

        adapters = [
            SemanticScholarAdapter(),
            AEOLUSAdapter(auto_download=False),
            SIDERAdapter(auto_download=False),
            OffsidesTwosidesAdapter(auto_download=False),
        ]

        for adapter in adapters:
            await adapter.close()  # Should not raise
