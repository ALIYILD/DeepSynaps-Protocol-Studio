"""
Test Suite for Batch 5 Atlas/Analytics Adapters

Tests for:
  - StringAdapter (STRING protein-protein interactions)
  - MyVariantAdapter (variant annotation aggregator)
  - Yeo2011Adapter (Yeo 2011 functional brain parcellation)
  - Gordon2014Adapter (Gordon 2014 cortical parcellation)
  - Adhd200Adapter (ADHD-200 clinical dataset)

All external HTTP calls are mocked to avoid real API requests.
"""

import pytest
import httpx
from datetime import datetime
from pathlib import Path
import json
import sys

# Add the batch5 directory to path
sys.path.insert(0, str(Path(__file__).parent))


# =============================================================================
# STRING Adapter Tests
# =============================================================================

from string_adapter import StringAdapter


class TestStringAdapter:
    """Tests for the STRING Protein-Protein Interaction Adapter."""

    @pytest.fixture
    async def adapter(self):
        """Create and yield a StringAdapter instance."""
        a = StringAdapter(cache_dir="/tmp/test_string_cache")
        yield a
        await a.close()

    @pytest.fixture
    def mock_interaction_partners(self):
        """Return mock interaction partners response."""
        return [
            {
                "preferredName_A": "TP53",
                "preferredName_B": "MDM2",
                "stringId_A": "9606.ENSP00000269305",
                "stringId_B": "9606.ENSP00000233067",
                "score": 999,
                "nscore": 0,
                "fscore": 0,
                "pscore": 0,
                "ascore": 529,
                "escore": 955,
                "dscore": 900,
                "tscore": 912,
            },
            {
                "preferredName_A": "TP53",
                "preferredName_B": "BRCA1",
                "stringId_A": "9606.ENSP00000269305",
                "stringId_B": "9606.ENSP00000350283",
                "score": 891,
                "nscore": 0,
                "fscore": 0,
                "pscore": 0,
                "ascore": 367,
                "escore": 821,
                "dscore": 750,
                "tscore": 623,
            },
        ]

    @pytest.fixture
    def mock_network(self):
        """Return mock network response."""
        return {
            "nodes": [
                {"stringId": "9606.ENSP00000269305", "name": "TP53", "taxid": 9606},
                {"stringId": "9606.ENSP00000233067", "name": "MDM2", "taxid": 9606},
                {"stringId": "9606.ENSP00000350283", "name": "BRCA1", "taxid": 9606},
            ],
            "edges": [
                {"from": "9606.ENSP00000269305", "to": "9606.ENSP00000233067", "score": 999},
                {"from": "9606.ENSP00000269305", "to": "9606.ENSP00000350283", "score": 891},
            ],
        }

    @pytest.fixture
    def mock_enrichment(self):
        """Return mock enrichment response."""
        return [
            {
                "term": "GO:0006915",
                "category": "Process",
                "description": "apoptotic process",
                "fdr": 0.001,
            },
            {
                "term": "GO:0008283",
                "category": "Process",
                "description": "cell proliferation",
                "fdr": 0.005,
            },
        ]

    @pytest.mark.asyncio
    async def test_init(self):
        """Test adapter initialization."""
        adapter = StringAdapter()
        assert adapter.name == "string"
        assert adapter.display_name == "STRING Protein-Protein Interactions"
        assert adapter.confidence_tier == "A"
        assert adapter.rate_limit_per_minute == 60
        assert adapter.requires_auth is False
        assert adapter.version == "12.0"
        await adapter.close()

    @pytest.mark.asyncio
    async def test_validate_connection_success(self, monkeypatch):
        """Test connection validation with successful response."""
        adapter = StringAdapter()

        async def mock_get(url, **kwargs):
            class MockResponse:
                status_code = 200
                def json(self):
                    return {"string_version": "12.0", "stable_address": "https://string-db.org"}
            return MockResponse()

        monkeypatch.setattr(adapter.client, "get", mock_get)
        result = await adapter.validate_connection()
        assert result is True
        assert adapter.version == "12.0"
        await adapter.close()

    @pytest.mark.asyncio
    async def test_validate_connection_failure(self, monkeypatch):
        """Test connection validation with failed response."""
        adapter = StringAdapter()

        async def mock_get(url, **kwargs):
            class MockResponse:
                status_code = 500
                def json(self):
                    return {}
            return MockResponse()

        monkeypatch.setattr(adapter.client, "get", mock_get)
        result = await adapter.validate_connection()
        assert result is False
        await adapter.close()

    @pytest.mark.asyncio
    async def test_search_protein(self, monkeypatch, mock_interaction_partners, mock_network, mock_enrichment):
        """Test protein search returns combined interaction data."""
        adapter = StringAdapter()
        call_count = {"count": 0}

        async def mock_get(url, **kwargs):
            call_count["count"] += 1
            class MockResponse:
                def __init__(self, status, data):
                    self.status_code = status
                    self._data = data
                def json(self):
                    return self._data
            if "interaction_partners" in str(url):
                return MockResponse(200, mock_interaction_partners)
            elif "network" in str(url):
                return MockResponse(200, mock_network)
            elif "enrichment" in str(url):
                return MockResponse(200, mock_enrichment)
            return MockResponse(200, {})

        monkeypatch.setattr(adapter.client, "get", mock_get)
        results = await adapter.search("TP53", filters={"species": 9606, "limit": 10})

        assert len(results) == 1
        result = results[0]
        assert result["query_protein"] == "TP53"
        assert result["species"] == 9606
        assert len(result["interaction_partners"]) == 2
        assert len(result["network"]["nodes"]) == 3
        assert len(result["enrichment"]) == 2
        await adapter.close()

    @pytest.mark.asyncio
    async def test_transform_to_canonical(self, monkeypatch, mock_interaction_partners, mock_network, mock_enrichment):
        """Test transformation to canonical format."""
        adapter = StringAdapter()

        raw_data = {
            "query_protein": "TP53",
            "species": 9606,
            "interaction_partners": mock_interaction_partners,
            "network": mock_network,
            "enrichment": mock_enrichment,
            "search_metadata": {
                "required_score": 400,
                "limit": 10,
                "network_flavor": "confidence",
                "total_interactions": 2,
                "total_enrichment_terms": 2,
            },
        }

        canonical = adapter.transform_to_canonical(raw_data)
        assert canonical["entity_type"] == "protein_interaction"
        assert canonical["source_database"] == "string"
        assert canonical["source_id"] == "TP53"
        assert canonical["network"]["query_protein"] == "TP53"
        assert canonical["network"]["species"] == 9606
        assert canonical["network"]["species_name"] == "Homo sapiens"
        assert len(canonical["network"]["interactions"]) == 2
        assert len(canonical["network"]["nodes"]) == 3
        assert "overall" in canonical["confidence"]
        assert canonical["confidence"]["overall"] > 0
        await adapter.close()

    @pytest.mark.asyncio
    async def test_get_provenance(self):
        """Test provenance metadata generation."""
        adapter = StringAdapter()
        prov = adapter.get_provenance({})
        assert prov["source_database"] == "string"
        assert prov["confidence_tier"] == "A"
        assert prov["data_quality_score"] == 0.92
        assert "citation" in prov
        assert "evidence_types" in prov
        await adapter.close()

    @pytest.mark.asyncio
    async def test_get_confidence_score(self):
        """Test confidence score calculation."""
        adapter = StringAdapter()
        result = {
            "interaction_partners": [
                {"score": 900, "escore": 800, "dscore": 700},
                {"score": 850, "escore": 0, "dscore": 600},
            ]
        }
        scores = adapter.get_confidence_score(result)
        assert scores["data_quality"] == 0.92
        assert scores["evidence_strength"] == 0.85  # has experimental
        assert scores["replication"] == 0.9  # has both exp and db
        assert "overall" in scores
        await adapter.close()

    @pytest.mark.asyncio
    async def test_get_species_name(self):
        """Test species name mapping."""
        adapter = StringAdapter()
        assert adapter._get_species_name(9606) == "Homo sapiens"
        assert adapter._get_species_name(10090) == "Mus musculus"
        assert adapter._get_species_name(4932) == "Saccharomyces cerevisiae"
        assert adapter._get_species_name(999999) == "taxon:999999"
        await adapter.close()


# =============================================================================
# MyVariant.info Adapter Tests
# =============================================================================

from myvariant_adapter import MyVariantAdapter


class TestMyVariantAdapter:
    """Tests for the MyVariant.info Adapter."""

    @pytest.fixture
    def mock_variant_response(self):
        """Return mock variant annotation response."""
        return {
            "_id": "chr1:g.218631822G>A",
            "_version": 2,
            "cadd": {
                "phred": 23.1,
                "rawscore": 0.85,
                "gene": {"gene_name": "CR1", "genename": "CR1"},
            },
            "clinvar": {
                "hgvs": {"genomic": "NC_000001.11:g.207577218G>A"},
                "clinical_significance": "risk factor",
                "rcv": [{"clinical_significance": "risk factor"}],
            },
            "dbsnp": {
                "rsid": "rs6656401",
                "alleles": [{"allele": "A", "freq": 0.15}],
            },
            "dbnsfp": {
                "sift": {"score": 0.1, "pred": "D"},
                "polyphen2": {"hdiv": {"score": 0.95, "pred": "D"}},
            },
            "snpeff": {
                "ann": [{"effect": "missense_variant", "genename": "CR1"}],
            },
            "vcf": {"chrom": "1", "pos": 218631822, "ref": "G", "alt": "A"},
            "gnomad_genome": {"af": {"af": 0.15, "af_afr": 0.05, "af_eas": 0.25}},
        }

    @pytest.fixture
    def mock_query_response(self):
        """Return mock query search response."""
        return {
            "total": 150,
            "took": 23,
            "hits": [
                {
                    "_id": "chr1:g.218631822G>A",
                    "_score": 15.2,
                    "dbsnp": {"rsid": "rs6656401"},
                    "cadd": {"phred": 23.1},
                },
                {
                    "_id": "chr19:g.45411941T>C",
                    "_score": 12.5,
                    "dbsnp": {"rsid": "rs429358"},
                    "cadd": {"phred": 18.3},
                },
            ],
        }

    @pytest.mark.asyncio
    async def test_init(self):
        """Test adapter initialization."""
        adapter = MyVariantAdapter()
        assert adapter.name == "myvariant_info"
        assert adapter.display_name == "MyVariant.info"
        assert adapter.confidence_tier == "A"
        assert adapter.rate_limit_per_minute == 60
        assert adapter.requires_auth is False
        await adapter.close()

    @pytest.mark.asyncio
    async def test_validate_connection_success(self, monkeypatch):
        """Test connection validation with successful response."""
        adapter = MyVariantAdapter()

        async def mock_get(url, **kwargs):
            class MockResponse:
                status_code = 200
                def json(self):
                    return {
                        "stats": {"total": 500000000},
                        "app_revision": "1.0-2024",
                    }
            return MockResponse()

        monkeypatch.setattr(adapter.client, "get", mock_get)
        result = await adapter.validate_connection()
        assert result is True
        await adapter.close()

    @pytest.mark.asyncio
    async def test_search_variant_id(self, monkeypatch, mock_variant_response):
        """Test search by variant ID (HGVS)."""
        adapter = MyVariantAdapter()

        async def mock_get(url, **kwargs):
            class MockResponse:
                status_code = 200
                def json(self):
                    return mock_variant_response
            return MockResponse()

        monkeypatch.setattr(adapter.client, "get", mock_get)
        results = await adapter.search("chr1:g.218631822G>A")

        assert len(results) == 1
        result = results[0]
        assert result["_id"] == "chr1:g.218631822G>A"
        assert result["_query_type"] == "variant_lookup"
        assert "cadd" in result
        assert "dbsnp" in result
        await adapter.close()

    @pytest.mark.asyncio
    async def test_search_query_endpoint(self, monkeypatch, mock_query_response):
        """Test search via query endpoint for non-variant-id queries."""
        adapter = MyVariantAdapter()

        async def mock_get(url, **kwargs):
            class MockResponse:
                status_code = 200
                def json(self):
                    return mock_query_response
            return MockResponse()

        monkeypatch.setattr(adapter.client, "get", mock_get)
        results = await adapter.search("BRCA1", filters={"size": 10})

        assert len(results) == 2
        assert results[0]["_query"] == "BRCA1"
        assert results[0]["_query_type"] == "query_search"
        assert results[0]["_total_hits"] == 150
        await adapter.close()

    @pytest.mark.asyncio
    async def test_transform_to_canonical(self, mock_variant_response):
        """Test transformation to canonical format."""
        adapter = MyVariantAdapter()
        canonical = adapter.transform_to_canonical(mock_variant_response)

        assert canonical["entity_type"] == "variant_annotation"
        assert canonical["source_database"] == "myvariant_info"
        assert canonical["source_id"] == "chr1:g.218631822G>A"
        assert canonical["coordinates"]["chromosome"] == "1"
        assert canonical["coordinates"]["position"] == 218631822
        assert canonical["network"]["variant_id"] == "chr1:g.218631822G>A"
        assert canonical["network"]["rsid"] == "rs6656401"
        assert canonical["network"]["clinical_significance"] == "risk factor"
        assert "functional_scores" in canonical["network"]
        assert canonical["network"]["functional_scores"]["cadd_phred"] == 23.1
        assert "overall" in canonical["confidence"]
        await adapter.close()

    @pytest.mark.asyncio
    async def test_get_provenance(self):
        """Test provenance metadata."""
        adapter = MyVariantAdapter()
        prov = adapter.get_provenance({})
        assert prov["source_database"] == "myvariant_info"
        assert prov["confidence_tier"] == "A"
        assert prov["data_quality_score"] == 0.93
        assert "aggregated_sources" in prov
        await adapter.close()

    @pytest.mark.asyncio
    async def test_looks_like_variant_id(self):
        """Test variant ID detection."""
        adapter = MyVariantAdapter()
        assert adapter._looks_like_variant_id("chr1:g.218631822G>A") is True
        assert adapter._looks_like_variant_id("rs429358") is True
        assert adapter._looks_like_variant_id("CA12345") is True
        assert adapter._looks_like_variant_id("c.123A>G") is False  # missing prefix
        assert adapter._looks_like_variant_id("BRCA1") is False
        assert adapter._looks_like_variant_id("") is False
        await adapter.close()

    @pytest.mark.asyncio
    async def test_count_source_databases(self, mock_variant_response):
        """Test source database counting."""
        adapter = MyVariantAdapter()
        count = adapter._count_source_databases(mock_variant_response)
        assert count >= 4  # cadd, clinvar, dbsnp, dbnsfp, snpeff
        sources = adapter._list_sources(mock_variant_response)
        assert "cadd" in sources
        assert "clinvar" in sources
        assert "dbsnp" in sources
        await adapter.close()


# =============================================================================
# Yeo 2011 Atlas Adapter Tests
# =============================================================================

from yeo2011_adapter import Yeo2011Adapter


class TestYeo2011Adapter:
    """Tests for the Yeo 2011 Functional Brain Parcellation Adapter."""

    @pytest.fixture
    async def adapter(self):
        """Create and yield a Yeo2011Adapter instance."""
        a = Yeo2011Adapter(cache_dir="/tmp/test_yeo_cache")
        yield a
        await a.close()

    @pytest.mark.asyncio
    async def test_init(self):
        """Test adapter initialization."""
        adapter = Yeo2011Adapter()
        assert adapter.name == "yeo2011_atlas"
        assert adapter.display_name == "Yeo 2011 Functional Brain Parcellation"
        assert adapter.confidence_tier == "A"
        assert adapter.rate_limit_per_minute == 0  # File-based
        assert adapter.requires_auth is False
        assert len(adapter.NETWORK_7) == 7
        assert len(adapter.NETWORK_17) == 17
        await adapter.close()

    @pytest.mark.asyncio
    async def test_validate_connection(self, monkeypatch):
        """Test connection validation (file-based always validates)."""
        adapter = Yeo2011Adapter()

        async def mock_get(url, **kwargs):
            class MockResponse:
                status_code = 200
                text = "README"
            return MockResponse()

        monkeypatch.setattr(adapter.client, "get", mock_get)
        result = await adapter.validate_connection()
        assert result is True
        assert adapter._loaded is True
        await adapter.close()

    @pytest.mark.asyncio
    async def test_load_builtin_networks(self):
        """Test loading built-in network data."""
        adapter = Yeo2011Adapter()
        adapter._load_builtin_networks()
        assert adapter._loaded is True
        assert "network_7" in adapter._atlas_data
        assert "network_17" in adapter._atlas_data
        assert "parcels_7networks" in adapter._atlas_data
        assert "parcels_17networks" in adapter._atlas_data
        assert len(adapter._atlas_data["parcels_7networks"]) == 400
        assert len(adapter._atlas_data["parcels_17networks"]) == 400
        await adapter.close()

    @pytest.mark.asyncio
    async def test_search_network_by_name(self):
        """Test searching for a network by name."""
        adapter = Yeo2011Adapter()
        adapter._load_builtin_networks()

        results = await adapter.search("Default Mode", filters={"num_networks": 7})
        assert len(results) >= 1
        assert any("Default" in r["network_name"] for r in results)
        await adapter.close()

    @pytest.mark.asyncio
    async def test_search_network_by_abbr(self):
        """Test searching for a network by abbreviation."""
        adapter = Yeo2011Adapter()
        adapter._load_builtin_networks()

        results = await adapter.search("DMN", filters={"num_networks": 7})
        assert len(results) >= 1
        await adapter.close()

    @pytest.mark.asyncio
    async def test_search_network_by_id(self):
        """Test searching for a network by numeric ID."""
        adapter = Yeo2011Adapter()
        adapter._load_builtin_networks()

        results = await adapter.search("3", filters={"num_networks": 7})
        assert len(results) >= 1
        await adapter.close()

    @pytest.mark.asyncio
    async def test_search_17network(self):
        """Test searching in 17-network system."""
        adapter = Yeo2011Adapter()
        adapter._load_builtin_networks()

        results = await adapter.search("DMN_A", filters={"num_networks": 17})
        assert len(results) >= 1
        await adapter.close()

    @pytest.mark.asyncio
    async def test_search_with_parcels(self):
        """Test search that includes parcel data."""
        adapter = Yeo2011Adapter()
        adapter._load_builtin_networks()

        results = await adapter.search(
            "Visual", filters={"num_networks": 7, "include_parcels": True}
        )
        assert len(results) >= 1
        result = results[0]
        assert "parcels" in result
        assert len(result["parcels"]) > 0
        assert "total_parcels_in_network" in result
        await adapter.close()

    @pytest.mark.asyncio
    async def test_transform_network(self):
        """Test network transformation to canonical format."""
        adapter = Yeo2011Adapter()
        adapter._load_builtin_networks()

        raw_data = {
            "network_id": 7,
            "network_name": "Default Mode Network",
            "network_abbr": "DMN",
            "color": "#CD3E4E",
            "description": "Internally directed cognition",
            "num_networks_system": 7,
            "regions": ["mPFC", "PCC", "Angular Gyrus"],
            "parcels": [{"parcel_num": 1, "network_name": "DMN"}],
            "total_parcels_in_network": 57,
        }

        canonical = adapter.transform_to_canonical(raw_data)
        assert canonical["entity_type"] == "functional_network"
        assert canonical["source_database"] == "yeo2011_atlas"
        assert canonical["source_id"] == "yeo7_net7"
        assert canonical["network"]["network_name"] == "Default Mode Network"
        assert canonical["network"]["network_abbreviation"] == "DMN"
        assert "confidence" in canonical
        assert "provenance" in canonical
        await adapter.close()

    @pytest.mark.asyncio
    async def test_transform_17network(self):
        """Test 17-network transformation."""
        adapter = Yeo2011Adapter()
        adapter._load_builtin_networks()

        raw_data = {
            "network_id": 14,
            "network_name": "DefaultA",
            "network_abbr": "DMN_A",
            "color": "#CD3E4E",
            "description": "",
            "num_networks_system": 17,
            "parent_network_id": 7,
            "parent_network_name": "Default Mode Network",
            "regions": [],
        }

        canonical = adapter.transform_to_canonical(raw_data)
        assert canonical["source_id"] == "yeo17_net14"
        assert canonical["network"]["parent_network"] == "Default Mode Network"
        assert canonical["network"]["parent_network_id"] == 7
        await adapter.close()

    @pytest.mark.asyncio
    async def test_get_provenance(self):
        """Test provenance metadata."""
        adapter = Yeo2011Adapter()
        prov = adapter.get_provenance({})
        assert prov["source_database"] == "yeo2011_atlas"
        assert prov["confidence_tier"] == "A"
        assert prov["data_quality_score"] == 0.95
        assert prov["num_subjects"] == 1000
        assert "citation" in prov
        await adapter.close()

    @pytest.mark.asyncio
    async def test_get_confidence_score(self):
        """Test confidence score."""
        adapter = Yeo2011Adapter()
        scores = adapter.get_confidence_score({})
        assert scores["data_quality"] == 0.95
        assert scores["sample_size"] == 0.95
        assert scores["overall"] == 0.92
        await adapter.close()


# =============================================================================
# Gordon 2014 Atlas Adapter Tests
# =============================================================================

from gordon2014_adapter import Gordon2014Adapter


class TestGordon2014Adapter:
    """Tests for the Gordon 2014 Cortical Parcellation Adapter."""

    @pytest.mark.asyncio
    async def test_init(self):
        """Test adapter initialization."""
        adapter = Gordon2014Adapter()
        assert adapter.name == "gordon2014_atlas"
        assert adapter.display_name == "Gordon 2014 Cortical Parcellation"
        assert adapter.confidence_tier == "A"
        assert adapter.rate_limit_per_minute == 0
        assert len(adapter.NETWORKS) == 13
        await adapter.close()

    @pytest.mark.asyncio
    async def test_validate_connection(self, monkeypatch):
        """Test connection validation."""
        adapter = Gordon2014Adapter()

        async def mock_get(url, **kwargs):
            class MockResponse:
                status_code = 200
                text = "OK"
            return MockResponse()

        monkeypatch.setattr(adapter.client, "get", mock_get)
        result = await adapter.validate_connection()
        assert result is True
        await adapter.close()

    @pytest.mark.asyncio
    async def test_search_network(self):
        """Test network search by name."""
        adapter = Gordon2014Adapter()

        results = await adapter.search("Default Mode")
        assert len(results) >= 1
        assert any("Default" in r.get("network_name", "") for r in results)
        await adapter.close()

    @pytest.mark.asyncio
    async def test_search_by_abbr(self):
        """Test search by network abbreviation."""
        adapter = Gordon2014Adapter()

        results = await adapter.search("FPN")
        assert len(results) >= 1
        assert any(r.get("network_abbr") == "FPN" for r in results)
        await adapter.close()

    @pytest.mark.asyncio
    async def test_search_parcel_number(self):
        """Test search by parcel number."""
        adapter = Gordon2014Adapter()

        results = await adapter.search("100")
        assert len(results) >= 1
        assert results[0]["match_type"] == "parcel_number"
        assert "parcel_num" in results[0]
        await adapter.close()

    @pytest.mark.asyncio
    async def test_search_by_region(self):
        """Test search by anatomical region."""
        adapter = Gordon2014Adapter()

        results = await adapter.search("Precentral")
        assert len(results) >= 1
        await adapter.close()

    @pytest.mark.asyncio
    async def test_search_by_hemisphere(self):
        """Test search by hemisphere."""
        adapter = Gordon2014Adapter()

        results = await adapter.search("LH")
        assert len(results) >= 1
        assert results[0]["match_type"] == "hemisphere"
        await adapter.close()

    @pytest.mark.asyncio
    async def test_transform_network(self):
        """Test network transformation."""
        adapter = Gordon2014Adapter()

        raw_data = {
            "network_id": 1,
            "network_name": "Default Mode",
            "network_abbr": "DMN",
            "color": "#e761c3",
            "description": "Internally-directed cognition",
            "num_parcels": 40,
            "regions": ["PCC", "mPFC"],
            "parcels": [{"parcel_num": 1, "network_name": "Default Mode"}],
            "match_type": "network",
        }

        canonical = adapter.transform_to_canonical(raw_data)
        assert canonical["entity_type"] == "functional_network"
        assert canonical["source_database"] == "gordon2014_atlas"
        assert canonical["network"]["network_abbreviation"] == "DMN"
        assert canonical["network"]["num_parcels"] == 40
        await adapter.close()

    @pytest.mark.asyncio
    async def test_transform_parcel(self):
        """Test single parcel transformation."""
        adapter = Gordon2014Adapter()

        raw_data = {
            "parcel_num": 150,
            "network_id": 1,
            "network_name": "Default Mode",
            "network_abbr": "DMN",
            "region_name": "PCC_150",
            "mni_coordinates": {"x": 0, "y": -50, "z": 30},
            "hemisphere": "Mid",
            "color": "#e761c3",
            "match_type": "parcel_number",
        }

        canonical = adapter.transform_to_canonical(raw_data)
        assert canonical["entity_type"] == "cortical_parcel"
        assert canonical["coordinates"]["x"] == 0
        assert canonical["coordinates"]["y"] == -50
        assert canonical["coordinates"]["z"] == 30
        assert canonical["coordinates"]["space"] == "MNI152"
        await adapter.close()

    @pytest.mark.asyncio
    async def test_get_provenance(self):
        """Test provenance metadata."""
        adapter = Gordon2014Adapter()
        prov = adapter.get_provenance({})
        assert prov["source_database"] == "gordon2014_atlas"
        assert prov["num_parcels"] == 333
        assert prov["num_networks"] == 12
        assert "citation" in prov
        await adapter.close()

    @pytest.mark.asyncio
    async def test_get_confidence_score(self):
        """Test confidence score."""
        adapter = Gordon2014Adapter()
        scores = adapter.get_confidence_score({})
        assert scores["data_quality"] == 0.92
        assert scores["overall"] == 0.87
        await adapter.close()


# =============================================================================
# ADHD-200 Adapter Tests
# =============================================================================

from adhd200_adapter import Adhd200Adapter


class TestAdhd200Adapter:
    """Tests for the ADHD-200 Dataset Adapter."""

    @pytest.fixture
    async def adapter(self):
        """Create and yield an Adhd200Adapter instance."""
        a = Adhd200Adapter(cache_dir="/tmp/test_adhd_cache")
        yield a
        await a.close()

    @pytest.mark.asyncio
    async def test_init(self):
        """Test adapter initialization."""
        adapter = Adhd200Adapter()
        assert adapter.name == "adhd200"
        assert adapter.display_name == "ADHD-200 Dataset"
        assert adapter.confidence_tier == "A"
        assert adapter.rate_limit_per_minute == 0
        assert len(adapter.SITES) == 8
        assert len(adapter.ADHD_SUBTYPES) == 4
        await adapter.close()

    @pytest.mark.asyncio
    async def test_validate_connection(self, monkeypatch):
        """Test connection validation."""
        adapter = Adhd200Adapter()

        async def mock_get(url, **kwargs):
            class MockResponse:
                status_code = 200
                text = "OK"
            return MockResponse()

        monkeypatch.setattr(adapter.client, "get", mock_get)
        result = await adapter.validate_connection()
        assert result is True
        await adapter.close()

    @pytest.mark.asyncio
    async def test_load_phenotypic_data_builtin(self):
        """Test loading built-in phenotypic data."""
        adapter = Adhd200Adapter()
        data = adapter._generate_sample_phenotypic_data()
        assert len(data) == 973
        assert data[0]["site"] in adapter.SITES
        await adapter.close()

    @pytest.mark.asyncio
    async def test_search_by_site(self):
        """Test search by site code."""
        adapter = Adhd200Adapter()

        results = await adapter.search("NYU", filters={"max_results": 10})
        assert len(results) > 0
        assert all(r.get("site") == "NYU" for r in results)
        await adapter.close()

    @pytest.mark.asyncio
    async def test_search_by_diagnosis(self):
        """Test search by diagnosis."""
        adapter = Adhd200Adapter()

        results = await adapter.search("ADHD", filters={"max_results": 10})
        assert len(results) > 0
        # All results should have ADHD diagnosis (dx=1)
        assert all(r.get("dx") == 1 for r in results)
        await adapter.close()

    @pytest.mark.asyncio
    async def test_search_by_control(self):
        """Test search for control subjects."""
        adapter = Adhd200Adapter()

        results = await adapter.search("control", filters={"max_results": 10})
        assert len(results) > 0
        assert all(r.get("dx") == 0 for r in results)
        await adapter.close()

    @pytest.mark.asyncio
    async def test_search_with_filters(self):
        """Test search with demographic filters."""
        adapter = Adhd200Adapter()

        results = await adapter.search(
            "*",
            filters={
                "dx": 1,
                "adhd_subtype": 1,
                "age_min": 10,
                "age_max": 15,
                "max_results": 20,
            },
        )
        assert len(results) > 0
        for r in results:
            assert r["dx"] == 1
            assert r["adhd_subtype"] == 1
            age = r.get("age")
            if age is not None:
                assert 10 <= age <= 15
        await adapter.close()

    @pytest.mark.asyncio
    async def test_search_by_sex(self):
        """Test search filtered by sex."""
        adapter = Adhd200Adapter()

        results = await adapter.search("*", filters={"sex": 1, "max_results": 10})
        assert len(results) > 0
        assert all(r.get("sex") == 1 for r in results)
        await adapter.close()

    @pytest.mark.asyncio
    async def test_transform_to_canonical(self):
        """Test transformation to canonical format."""
        adapter = Adhd200Adapter()

        raw_data = {
            "subject_id": "NYU_0001",
            "site": "NYU",
            "dx": 1,
            "adhd_subtype": 1,
            "age": 12.5,
            "sex": 1,
            "handedness": 0,
            "medication": 0,
            "verbal_iq": 110,
            "performance_iq": 105,
            "full_iq": 108,
            "adhd_index": 72.5,
        }

        canonical = adapter.transform_to_canonical(raw_data)
        assert canonical["entity_type"] == "clinical_subject"
        assert canonical["source_database"] == "adhd200"
        assert canonical["source_id"] == "NYU_0001"
        assert canonical["network"]["subject_id"] == "NYU_0001"
        assert canonical["network"]["site"] == "NYU"
        assert canonical["network"]["diagnosis"] == "ADHD"
        assert canonical["network"]["adhd_subtype"] == "ADHD Combined"
        assert canonical["network"]["age"] == 12.5
        assert canonical["network"]["sex"] == "Male"
        assert canonical["network"]["handedness"] == "Right"
        assert canonical["network"]["medication_status"] == "No medication"
        assert canonical["network"]["full_iq"] == 108
        await adapter.close()

    @pytest.mark.asyncio
    async def test_get_provenance(self):
        """Test provenance metadata."""
        adapter = Adhd200Adapter()
        prov = adapter.get_provenance({})
        assert prov["source_database"] == "adhd200"
        assert prov["num_subjects"] == 973
        assert prov["num_adhd_subjects"] == 776
        assert prov["num_control_subjects"] == 197
        assert prov["research_only"] is True
        assert "citation" in prov
        await adapter.close()

    @pytest.mark.asyncio
    async def test_get_confidence_score(self):
        """Test confidence score calculation."""
        adapter = Adhd200Adapter()

        # Complete record
        result = {
            "site": "NYU",
            "age": 12.0,
            "sex": 1,
            "dx": 1,
            "full_iq": 100,
        }
        scores = adapter.get_confidence_score(result)
        assert scores["data_quality"] == 0.9
        assert scores["data_completeness"] > 0.8
        assert "overall" in scores

        # Incomplete record
        result2 = {}
        scores2 = adapter.get_confidence_score(result2)
        assert scores2["data_completeness"] < scores["data_completeness"]
        await adapter.close()

    @pytest.mark.asyncio
    async def test_age_to_group(self):
        """Test age group classification."""
        adapter = Adhd200Adapter()
        assert adapter._age_to_group(8.0) == "Child (7-9)"
        assert adapter._age_to_group(11.0) == "Pre-teen (10-12)"
        assert adapter._age_to_group(14.0) == "Adolescent (13-15)"
        assert adapter._age_to_group(17.0) == "Late Adolescent (16-18)"
        assert adapter._age_to_group(20.0) == "Young Adult (19+)"
        assert adapter._age_to_group(None) == "Unknown"
        await adapter.close()

    @pytest.mark.asyncio
    async def test_clinical_notes(self):
        """Test clinical notes generation."""
        adapter = Adhd200Adapter()

        record = {
            "dx": 1,
            "adhd_subtype": 1,
            "age": 12.5,
            "sex": 1,
            "medication": 0,
            "full_iq": 108,
        }
        notes = adapter._generate_clinical_notes(record)
        assert "ADHD Combined" in notes
        assert "12.5yo" in notes
        assert "male" in notes
        assert "medication-free" in notes
        assert "FSIQ=108" in notes

        # Control subject
        record2 = {
            "dx": 0,
            "adhd_subtype": 0,
            "age": 10.0,
            "sex": 0,
            "medication": 0,
        }
        notes2 = adapter._generate_clinical_notes(record2)
        assert "Typically developing" in notes2
        await adapter.close()

    @pytest.mark.asyncio
    async def test_dataset_summary(self):
        """Test dataset summary generation."""
        adapter = Adhd200Adapter()
        summary = await adapter.get_dataset_summary()

        assert summary["total_subjects"] == 973
        assert "by_diagnosis" in summary
        assert "by_site" in summary
        assert "age_statistics" in summary
        assert summary["age_statistics"]["mean"] is not None
        assert summary["age_statistics"]["min"] is not None
        assert summary["age_statistics"]["max"] is not None
        await adapter.close()

    @pytest.mark.asyncio
    async def test_coerce_value(self):
        """Test value type coercion."""
        adapter = Adhd200Adapter()
        assert adapter._coerce_value("123") == 123
        assert adapter._coerce_value("12.5") == 12.5
        assert adapter._coerce_value("hello") == "hello"
        assert adapter._coerce_value("") is None
        assert adapter._coerce_value("NA") is None
        assert adapter._coerce_value("nan") is None
        assert adapter._coerce_value(None) is None
        await adapter.close()

    @pytest.mark.asyncio
    async def test_parse_phenotypic_csv(self):
        """Test CSV parsing."""
        adapter = Adhd200Adapter()
        csv_text = "subject_id,site,dx,age\nNYU_001,NYU,1,12.5\nKKI_001,KKI,0,10.0"
        records = adapter._parse_phenotypic_csv(csv_text)
        assert len(records) == 2
        assert records[0]["subject_id"] == "NYU_001"
        assert records[0]["dx"] == 1
        assert records[0]["age"] == 12.5
        assert records[1]["dx"] == 0
        await adapter.close()


# =============================================================================
# End-to-End Integration Tests
# =============================================================================

class TestBatch5Integration:
    """Integration tests covering all 5 adapters together."""

    @pytest.mark.asyncio
    async def test_all_adapters_init(self):
        """Test all adapters can be initialized."""
        adapters = [
            StringAdapter(),
            MyVariantAdapter(),
            Yeo2011Adapter(),
            Gordon2014Adapter(),
            Adhd200Adapter(),
        ]
        for adapter in adapters:
            assert adapter.name
            assert adapter.display_name
            assert adapter.source_url
            assert adapter.confidence_tier
            assert adapter.data_types
            await adapter.close()

    @pytest.mark.asyncio
    async def test_all_adapters_validate(self, monkeypatch):
        """Test all adapters can validate connection (mocked)."""
        async def mock_get(url, **kwargs):
            class MockResponse:
                status_code = 200
                def json(self):
                    return {}
                text = "OK"
            return MockResponse()

        adapters = [
            StringAdapter(),
            MyVariantAdapter(),
            Yeo2011Adapter(),
            Gordon2014Adapter(),
            Adhd200Adapter(),
        ]

        for adapter in adapters:
            monkeypatch.setattr(adapter.client, "get", mock_get)
            result = await adapter.validate_connection()
            assert result is True, f"{adapter.name} validation failed"
            await adapter.close()

    @pytest.mark.asyncio
    async def test_all_adapters_provenance(self):
        """Test all adapters produce valid provenance."""
        adapters = [
            StringAdapter(),
            MyVariantAdapter(),
            Yeo2011Adapter(),
            Gordon2014Adapter(),
            Adhd200Adapter(),
        ]
        for adapter in adapters:
            prov = adapter.get_provenance({})
            assert prov["source_database"] == adapter.name
            assert prov["confidence_tier"] == adapter.confidence_tier
            assert "retrieved_at" in prov
            assert "citation" in prov
            await adapter.close()

    @pytest.mark.asyncio
    async def test_all_adapters_confidence_scores(self):
        """Test all adapters produce valid confidence scores."""
        adapters = [
            StringAdapter(),
            MyVariantAdapter(),
            Yeo2011Adapter(),
            Gordon2014Adapter(),
            Adhd200Adapter(),
        ]
        for adapter in adapters:
            scores = adapter.get_confidence_score({})
            assert "overall" in scores
            assert 0 <= scores["overall"] <= 1
            assert "data_quality" in scores
            await adapter.close()

    @pytest.mark.asyncio
    async def test_all_adapters_close(self):
        """Test all adapters can be closed cleanly."""
        adapters = [
            StringAdapter(),
            MyVariantAdapter(),
            Yeo2011Adapter(),
            Gordon2014Adapter(),
            Adhd200Adapter(),
        ]
        for adapter in adapters:
            await adapter.close()

    @pytest.mark.asyncio
    async def test_all_canonical_transforms(self):
        """Test all adapters produce valid canonical output."""
        adapters_and_data = [
            (StringAdapter(), {
                "query_protein": "TP53",
                "species": 9606,
                "interaction_partners": [{"preferredName_A": "TP53", "preferredName_B": "MDM2", "score": 999}],
                "network": {"nodes": [], "edges": []},
                "enrichment": [],
                "search_metadata": {"total_interactions": 1, "total_enrichment_terms": 0},
            }),
            (MyVariantAdapter(), {
                "_id": "chr1:g.218631822G>A",
                "dbsnp": {"rsid": "rs6656401"},
                "vcf": {"chrom": "1", "pos": 218631822},
            }),
            (Yeo2011Adapter(), {
                "network_id": 7,
                "network_name": "Default Mode Network",
                "network_abbr": "DMN",
                "color": "#CD3E4E",
                "description": "DMN",
                "num_networks_system": 7,
                "regions": ["PCC"],
                "parcels": [],
                "total_parcels_in_network": 50,
            }),
            (Gordon2014Adapter(), {
                "network_id": 1,
                "network_name": "Default Mode",
                "network_abbr": "DMN",
                "color": "#e761c3",
                "description": "DMN",
                "num_parcels": 40,
                "regions": ["PCC"],
                "parcels": [],
                "match_type": "network",
            }),
            (Adhd200Adapter(), {
                "subject_id": "NYU_0001",
                "site": "NYU",
                "dx": 1,
                "adhd_subtype": 1,
                "age": 12.5,
                "sex": 1,
                "medication": 0,
            }),
        ]

        for adapter, raw_data in adapters_and_data:
            canonical = adapter.transform_to_canonical(raw_data)
            assert canonical["source_database"] == adapter.name
            assert "confidence" in canonical
            assert "provenance" in canonical
            assert "network" in canonical
            await adapter.close()


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
