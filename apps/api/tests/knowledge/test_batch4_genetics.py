"""
Test suite for Batch 4 genetics database adapters.
Tests GWAS Catalog, dbSNP, Ensembl, gnomAD, and UniProt adapters
with mocked HTTP responses (no real API calls).
"""

import pytest
import json
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch, PropertyMock

# ---------------------------------------------------------------------------
# Import adapters (adjust path if needed)
# ---------------------------------------------------------------------------
from gwas_catalog_adapter import GwasCatalogAdapter
from dbsnp_adapter import DbsnpAdapter
from ensembl_adapter import EnsemblAdapter
from gnomad_adapter import GnomadAdapter
from uniprot_adapter import UniprotAdapter


# =============================================================================
# Fixtures
# =============================================================================

@pytest.fixture
def gwas_adapter():
    return GwasCatalogAdapter()

@pytest.fixture
def dbsnp_adapter():
    return DbsnpAdapter()

@pytest.fixture
def ensembl_adapter():
    return EnsemblAdapter()

@pytest.fixture
def gnomad_adapter():
    return GnomadAdapter()

@pytest.fixture
def uniprot_adapter():
    return UniprotAdapter()


# =============================================================================
# GWAS Catalog Adapter Tests
# =============================================================================

class TestGwasCatalogAdapter:
    """Tests for the GWAS Catalog adapter."""

    @pytest.mark.asyncio
    async def test_validate_connection_success(self, gwas_adapter):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "_embedded": {"studies": [{"accessionId": "GCST000001"}]}
        }
        gwas_adapter.client = MagicMock()
        gwas_adapter.client.request = AsyncMock(return_value=mock_response)

        result = await gwas_adapter.validate_connection()
        assert result is True

    @pytest.mark.asyncio
    async def test_validate_connection_failure(self, gwas_adapter):
        mock_response = MagicMock()
        mock_response.status_code = 500
        gwas_adapter.client = MagicMock()
        gwas_adapter.client.request = AsyncMock(return_value=mock_response)

        result = await gwas_adapter.validate_connection()
        assert result is False

    @pytest.mark.asyncio
    async def test_search_by_trait(self, gwas_adapter):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "_embedded": {
                "associations": [
                    {
                        "accessionId": "GCST90000001",
                        "pvalue": 5e-12,
                        "orPerCopyNum": 1.25,
                        "betaNum": 0.22,
                        "betaDirection": "+",
                        "betaUnit": "unit",
                        "riskFrequency": 0.35,
                        "description": "Association with type 2 diabetes",
                        "loci": [
                            {
                                "strongestRiskAlleles": [
                                    {"riskAlleleName": "rs7903146-T"}
                                ],
                                "authorReportedGenes": [
                                    {"geneName": "TCF7L2"}
                                ],
                            }
                        ],
                        "efoTraits": [
                            {"trait": "type 2 diabetes mellitus", "label": "type 2 diabetes mellitus"}
                        ],
                    }
                ]
            }
        }
        gwas_adapter.client = MagicMock()
        gwas_adapter.client.request = AsyncMock(return_value=mock_response)

        results = await gwas_adapter.search("diabetes", filters={"search_type": "trait"})
        assert len(results) == 1
        assert results[0]["accessionId"] == "GCST90000001"
        assert results[0]["pvalue"] == 5e-12

    @pytest.mark.asyncio
    async def test_search_by_gene(self, gwas_adapter):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "_embedded": {
                "associations": [
                    {
                        "accessionId": "GCST90000002",
                        "pvalue": 1e-15,
                        "loci": [
                            {
                                "strongestRiskAlleles": [
                                    {"riskAlleleName": "rs1801133-C"}
                                ],
                                "authorReportedGenes": [
                                    {"geneName": "MTHFR"}
                                ],
                            }
                        ],
                        "efoTraits": [
                            {"trait": "homocysteine measurement"}
                        ],
                    }
                ]
            }
        }
        gwas_adapter.client = MagicMock()
        gwas_adapter.client.request = AsyncMock(return_value=mock_response)

        results = await gwas_adapter.search("MTHFR", filters={"search_type": "gene"})
        assert len(results) == 1
        assert results[0]["accessionId"] == "GCST90000002"

    def test_transform_to_canonical(self, gwas_adapter):
        raw = {
            "accessionId": "GCST90000001",
            "pvalue": 5e-12,
            "orPerCopyNum": 1.25,
            "betaNum": 0.22,
            "betaDirection": "+",
            "betaUnit": "unit",
            "riskFrequency": 0.35,
            "description": "Association with type 2 diabetes",
            "loci": [
                {
                    "strongestRiskAlleles": [{"riskAlleleName": "rs7903146-T"}],
                    "authorReportedGenes": [{"geneName": "TCF7L2"}],
                }
            ],
            "efoTraits": [{"trait": "type 2 diabetes mellitus", "label": "type 2 diabetes mellitus"}],
        }
        canonical = gwas_adapter.transform_to_canonical(raw)

        assert canonical["source_database"] == "gwas_catalog"
        assert canonical["gene_symbol"] == "TCF7L2"
        assert canonical["gwas_catalog"]["pvalue"] == 5e-12
        assert canonical["gwas_catalog"]["effect_size"] == 1.25
        assert "type 2 diabetes" in canonical["gwas_catalog"]["traits"][0]
        assert "confidence" in canonical
        assert "provenance" in canonical

    def test_get_confidence_score_high_quality(self, gwas_adapter):
        result = {"pvalue": 5e-12, "orPerCopyNum": 1.25, "replicationSampleDescription": "yes"}
        score = gwas_adapter.get_confidence_score(result)
        assert score["overall"] > 0.85
        assert score["evidence_strength"] == 1.0

    def test_get_confidence_score_low_quality(self, gwas_adapter):
        result = {"pvalue": 0.05, "orPerCopyNum": None}
        score = gwas_adapter.get_confidence_score(result)
        assert score["evidence_strength"] == 0.6

    def test_get_provenance(self, gwas_adapter):
        prov = gwas_adapter.get_provenance({})
        assert prov["source_database"] == "gwas_catalog"
        assert prov["confidence_tier"] == "A"
        assert prov["curation_level"] == "peer_reviewed_curated"

    def test_adapter_attributes(self, gwas_adapter):
        assert gwas_adapter.name == "gwas_catalog"
        assert gwas_adapter.display_name == "GWAS Catalog"
        assert gwas_adapter.confidence_tier == "A"
        assert "genetic_variant" in gwas_adapter.data_types
        assert not gwas_adapter.requires_auth


# =============================================================================
# dbSNP Adapter Tests
# =============================================================================

class TestDbsnpAdapter:
    """Tests for the dbSNP adapter."""

    @pytest.mark.asyncio
    async def test_validate_connection_success(self, dbsnp_adapter):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "esearchresult": {"count": "1", "idlist": ["6025"]}
        }
        dbsnp_adapter.client = MagicMock()
        dbsnp_adapter.client.request = AsyncMock(return_value=mock_response)

        result = await dbsnp_adapter.validate_connection()
        assert result is True

    @pytest.mark.asyncio
    async def test_validate_connection_failure(self, dbsnp_adapter):
        mock_response = MagicMock()
        mock_response.status_code = 500
        dbsnp_adapter.client = MagicMock()
        dbsnp_adapter.client.request = AsyncMock(return_value=mock_response)

        result = await dbsnp_adapter.validate_connection()
        assert result is False

    @pytest.mark.asyncio
    async def test_search_by_rsid(self, dbsnp_adapter):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "result": {
                "uids": ["6025"],
                "6025": {
                    "snp_id": "6025",
                    "chr": "1",
                    "chrpos": "11856378",
                    "snp_class": "snp",
                    "genes": [{"name": "F5"}],
                    "clinical_significance": ["pathogenic"],
                    "build_id": "156",
                    "weight": "100",
                    "alleles": [
                        {"allele": "G", "is_ref": True},
                        {"allele": "A", "freq": 0.02},
                    ],
                },
            }
        }
        dbsnp_adapter.client = MagicMock()
        dbsnp_adapter.client.request = AsyncMock(return_value=mock_response)

        results = await dbsnp_adapter.search("rs6025", filters={"search_type": "rsid"})
        assert len(results) == 1
        assert results[0]["snp_id"] == "6025"
        assert results[0]["chr"] == "1"

    @pytest.mark.asyncio
    async def test_search_by_gene(self, dbsnp_adapter):
        search_response = MagicMock()
        search_response.status_code = 200
        search_response.json.return_value = {
            "esearchresult": {"count": "2", "idlist": ["6025", "6026"]}
        }

        summary_response = MagicMock()
        summary_response.status_code = 200
        summary_response.json.return_value = {
            "result": {
                "uids": ["6025", "6026"],
                "6025": {
                    "snp_id": "6025",
                    "chr": "1",
                    "chrpos": "11856378",
                    "snp_class": "snp",
                    "genes": [{"name": "F5"}],
                    "build_id": "156",
                },
                "6026": {
                    "snp_id": "6026",
                    "chr": "1",
                    "chrpos": "11856400",
                    "snp_class": "snp",
                    "genes": [{"name": "F5"}],
                    "build_id": "156",
                },
            }
        }
        dbsnp_adapter.client = MagicMock()
        dbsnp_adapter.client.request = AsyncMock(side_effect=[search_response, summary_response])

        results = await dbsnp_adapter.search("F5", filters={"search_type": "gene"})
        assert len(results) == 2
        assert results[0]["snp_id"] == "6025"
        assert results[1]["snp_id"] == "6026"

    def test_transform_to_canonical(self, dbsnp_adapter):
        raw = {
            "snp_id": "6025",
            "chr": "1",
            "chrpos": "11856378",
            "snp_class": "snp",
            "genes": [{"name": "F5"}],
            "clinical_significance": ["pathogenic"],
            "build_id": "156",
            "weight": "100",
            "alleles": [
                {"allele": "G", "is_ref": True, "freq": None},
                {"allele": "A", "is_ref": False, "freq": 0.02},
            ],
            "organism": "Homo sapiens",
            "tax_id": "9606",
        }
        canonical = dbsnp_adapter.transform_to_canonical(raw)

        assert canonical["source_database"] == "dbsnp"
        assert canonical["source_id"] == "rs6025"
        assert canonical["gene_symbol"] == "F5"
        assert canonical["chromosome"] == "1"
        assert canonical["position"] == 11856378
        assert canonical["dbsnp"]["variant_type"] == "SNV"
        assert canonical["dbsnp"]["clinical_significance"] == "pathogenic"
        assert canonical["dbsnp"]["ref_allele"] == "G"
        assert len(canonical["dbsnp"]["alt_alleles"]) == 1

    def test_get_confidence_score(self, dbsnp_adapter):
        result = {
            "clinical_significance": ["pathogenic"],
            "genes": [{"name": "F5"}],
            "weight": "100",
        }
        score = dbsnp_adapter.get_confidence_score(result)
        assert score["overall"] > 0.8
        assert score["data_quality"] > 0.9

    def test_snp_class_mapping(self, dbsnp_adapter):
        assert dbsnp_adapter._map_snp_class("snp") == "SNV"
        assert dbsnp_adapter._map_snp_class("indel") == "indel"
        assert dbsnp_adapter._map_snp_class("del") == "deletion"
        assert DbsnpAdapter._map_snp_class("unknown") == "unknown"

    def test_adapter_attributes(self, dbsnp_adapter):
        assert dbsnp_adapter.name == "dbsnp"
        assert dbsnp_adapter.display_name == "dbSNP"
        assert dbsnp_adapter.confidence_tier == "A"
        assert "genetic_variant" in dbsnp_adapter.data_types
        assert not dbsnp_adapter.requires_auth
        assert dbsnp_adapter.auth_type == "api_key_optional"


# =============================================================================
# Ensembl Adapter Tests
# =============================================================================

class TestEnsemblAdapter:
    """Tests for the Ensembl adapter."""

    @pytest.mark.asyncio
    async def test_validate_connection_success(self, ensembl_adapter):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"ping": 1}
        ensembl_adapter.client = MagicMock()
        ensembl_adapter.client.request = AsyncMock(return_value=mock_response)

        result = await ensembl_adapter.validate_connection()
        assert result is True

    @pytest.mark.asyncio
    async def test_validate_connection_failure(self, ensembl_adapter):
        mock_response = MagicMock()
        mock_response.status_code = 503
        ensembl_adapter.client = MagicMock()
        ensembl_adapter.client.request = AsyncMock(return_value=mock_response)

        result = await ensembl_adapter.validate_connection()
        assert result is False

    @pytest.mark.asyncio
    async def test_search_by_gene(self, ensembl_adapter):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "id": "ENSG00000139618",
            "display_name": "BRCA2",
            "object_type": "Gene",
            "species": "homo_sapiens",
            "seq_region_name": "13",
            "start": 32315474,
            "end": 32400266,
            "strand": 1,
            "biotype": "protein_coding",
            "assembly_name": "GRCh38",
            "version": 2,
            "description": "BRCA2 DNA repair associated",
            "source": "ensembl_havana",
            "logic_name": "ensembl_havana_gene",
            "Transcript": [
                {"id": "ENST00000380152", "biotype": "protein_coding"},
                {"id": "ENST00000544455", "biotype": "protein_coding"},
            ],
        }
        ensembl_adapter.client = MagicMock()
        ensembl_adapter.client.request = AsyncMock(return_value=mock_response)

        results = await ensembl_adapter.search("BRCA2", filters={"search_type": "gene"})
        assert len(results) == 1
        assert results[0]["id"] == "ENSG00000139618"
        assert results[0]["display_name"] == "BRCA2"

    @pytest.mark.asyncio
    async def test_search_by_ens_id(self, ensembl_adapter):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "id": "ENSG00000141510",
            "display_name": "TP53",
            "object_type": "Gene",
            "seq_region_name": "17",
            "start": 7661779,
            "end": 7687550,
            "biotype": "protein_coding",
        }
        ensembl_adapter.client = MagicMock()
        ensembl_adapter.client.request = AsyncMock(return_value=mock_response)

        results = await ensembl_adapter.search(
            "ENSG00000141510", filters={"search_type": "ens_id"}
        )
        assert len(results) == 1
        assert results[0]["id"] == "ENSG00000141510"

    @pytest.mark.asyncio
    async def test_search_not_found(self, ensembl_adapter):
        mock_response = MagicMock()
        mock_response.status_code = 404
        ensembl_adapter.client = MagicMock()
        ensembl_adapter.client.request = AsyncMock(return_value=mock_response)

        results = await ensembl_adapter.search("FAKEGENE123", filters={"search_type": "gene"})
        assert len(results) == 0

    def test_transform_to_canonical(self, ensembl_adapter):
        raw = {
            "id": "ENSG00000139618",
            "display_name": "BRCA2",
            "object_type": "Gene",
            "seq_region_name": "13",
            "start": 32315474,
            "end": 32400266,
            "strand": 1,
            "biotype": "protein_coding",
            "assembly_name": "GRCh38",
            "version": 2,
            "description": "BRCA2 DNA repair associated",
            "source": "ensembl_havana",
            "Transcript": [
                {"id": "ENST00000380152"},
                {"id": "ENST00000544455"},
            ],
            "is_reference": True,
        }
        canonical = ensembl_adapter.transform_to_canonical(raw)

        assert canonical["source_database"] == "ensembl"
        assert canonical["source_id"] == "ENSG00000139618"
        assert canonical["gene_symbol"] == "BRCA2"
        assert canonical["chromosome"] == "13"
        assert canonical["position"] == 32315474
        assert canonical["ensembl"]["biotype"] == "protein_coding"
        assert canonical["ensembl"]["transcript_count"] == 2
        assert canonical["ensembl"]["assembly"] == "GRCh38"

    def test_get_confidence_score(self, ensembl_adapter):
        result = {
            "is_reference": True,
            "Transcript": [{"id": "ENST000001"}],
            "display_name": "BRCA2",
            "biotype": "protein_coding",
        }
        score = ensembl_adapter.get_confidence_score(result)
        assert score["overall"] > 0.9
        assert score["data_quality"] > 0.95

    def test_get_provenance(self, ensembl_adapter):
        prov = ensembl_adapter.get_provenance({"assembly_name": "GRCh38"})
        assert prov["source_database"] == "ensembl"
        assert prov["assembly"] == "GRCh38"

    def test_adapter_attributes(self, ensembl_adapter):
        assert ensembl_adapter.name == "ensembl"
        assert ensembl_adapter.display_name == "Ensembl"
        assert ensembl_adapter.confidence_tier == "A"
        assert "gene" in ensembl_adapter.data_types
        assert ensembl_adapter.default_species == "homo_sapiens"


# =============================================================================
# gnomAD Adapter Tests
# =============================================================================

class TestGnomadAdapter:
    """Tests for the gnomAD adapter."""

    @pytest.mark.asyncio
    async def test_validate_connection_success(self, gnomad_adapter):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "data": {"meta": {"gnomad_version": "4.1.0"}}
        }
        gnomad_adapter.client = MagicMock()
        gnomad_adapter.client.request = AsyncMock(return_value=mock_response)

        result = await gnomad_adapter.validate_connection()
        assert result is True

    @pytest.mark.asyncio
    async def test_validate_connection_failure(self, gnomad_adapter):
        mock_response = MagicMock()
        mock_response.status_code = 503
        gnomad_adapter.client = MagicMock()
        gnomad_adapter.client.request = AsyncMock(return_value=mock_response)

        result = await gnomad_adapter.validate_connection()
        assert result is False

    @pytest.mark.asyncio
    async def test_search_by_gene(self, gnomad_adapter):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "data": {
                "gene": {
                    "gene_id": "ENSG00000139618",
                    "symbol": "BRCA2",
                    "chrom": "13",
                    "start": 32315474,
                    "stop": 32400266,
                    "variants": [
                        {
                            "variant_id": "13-32315474-G-A",
                            "chrom": "13",
                            "pos": 32315474,
                            "ref": "G",
                            "alt": "A",
                            "rsids": ["rs80359752"],
                            "consequence": "missense_variant",
                            "gene_symbol": "BRCA2",
                            "hgvsc": "c.100G>A",
                            "hgvsp": "p.Arg34His",
                            "exome": {"ac": 5, "an": 1200000, "af": 4.17e-6},
                            "genome": {"ac": 2, "an": 150000, "af": 1.33e-5},
                            "joint": {"ac": 7, "an": 1350000, "af": 5.19e-6, "homozygote_count": 0},
                            "populations": [
                                {"id": "afr", "ac": 1, "an": 400000, "af": 2.5e-6},
                                {"id": "nfe", "ac": 4, "an": 600000, "af": 6.67e-6},
                            ],
                            "flags": [],
                            "loftee_prediction": "",
                        }
                    ],
                }
            }
        }
        gnomad_adapter.client = MagicMock()
        gnomad_adapter.client.request = AsyncMock(return_value=mock_response)

        results = await gnomad_adapter.search("BRCA2", filters={"search_type": "gene"})
        assert len(results) == 1
        assert results[0]["variant_id"] == "13-32315474-G-A"
        assert results[0]["gene_symbol"] == "BRCA2"

    @pytest.mark.asyncio
    async def test_search_variant(self, gnomad_adapter):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "data": {
                "variant": {
                    "variant_id": "1-55039959-G-A",
                    "chrom": "1",
                    "pos": 55039959,
                    "ref": "G",
                    "alt": "A",
                    "rsids": ["rs1801133"],
                    "consequence": "missense_variant",
                    "gene_symbol": "MTHFR",
                    "hgvsc": "c.665C>T",
                    "hgvsp": "p.Ala222Val",
                    "exome": {"ac": 4500, "an": 1200000, "af": 0.00375},
                    "genome": {"ac": 800, "an": 150000, "af": 0.00533},
                    "joint": {"ac": 5300, "an": 1350000, "af": 0.00393, "homozygote_count": 25},
                    "populations": [
                        {"id": "nfe", "ac": 3000, "an": 600000, "af": 0.005},
                        {"id": "afr", "ac": 200, "an": 400000, "af": 0.0005},
                    ],
                    "flags": [],
                    "loftee_prediction": "",
                }
            }
        }
        gnomad_adapter.client = MagicMock()
        gnomad_adapter.client.request = AsyncMock(return_value=mock_response)

        results = await gnomad_adapter.search(
            "1-55039959-G-A", filters={"search_type": "variant"}
        )
        assert len(results) == 1
        assert results[0]["variant_id"] == "1-55039959-G-A"
        assert results[0]["consequence"] == "missense_variant"

    def test_transform_to_canonical(self, gnomad_adapter):
        raw = {
            "variant_id": "13-32315474-G-A",
            "chrom": "13",
            "pos": 32315474,
            "ref": "G",
            "alt": "A",
            "rsids": ["rs80359752"],
            "consequence": "missense_variant",
            "gene_symbol": "BRCA2",
            "hgvsc": "c.100G>A",
            "hgvsp": "p.Arg34His",
            "exome": {"ac": 5, "an": 1200000, "af": 4.17e-6},
            "genome": {"ac": 2, "an": 150000, "af": 1.33e-5},
            "joint": {"ac": 7, "an": 1350000, "af": 5.19e-6, "homozygote_count": 0},
            "populations": [
                {"id": "afr", "ac": 1, "an": 400000, "af": 2.5e-6},
                {"id": "nfe", "ac": 4, "an": 600000, "af": 6.67e-6},
            ],
            "flags": [],
            "loftee_prediction": "",
            "_gene_metadata": {
                "gene_id": "ENSG00000139618",
                "symbol": "BRCA2",
            },
        }
        canonical = gnomad_adapter.transform_to_canonical(raw)

        assert canonical["source_database"] == "gnomad"
        assert canonical["gene_symbol"] == "BRCA2"
        assert canonical["chromosome"] == "13"
        assert canonical["position"] == 32315474
        assert canonical["gnomad"]["allele_frequency"]["joint"] == 5.19e-6
        assert canonical["gnomad"]["reference_genome"] == "GRCh38"
        assert len(canonical["gnomad"]["population_frequencies"]) == 2

    def test_get_confidence_score(self, gnomad_adapter):
        result = {
            "joint": {"ac": 7, "an": 1350000, "af": 5.19e-6, "homozygote_count": 0},
            "exome": {"ac": 5, "an": 1200000},
            "genome": {"ac": 2, "an": 150000},
            "populations": [{"id": "afr"}, {"id": "nfe"}, {"id": "amr"}, {"id": "eas"}, {"id": "sas"}],
            "flags": [],
        }
        score = gnomad_adapter.get_confidence_score(result)
        assert score["sample_size"] > 0.9
        assert score["overall"] > 0.85

    def test_get_provenance(self, gnomad_adapter):
        prov = gnomad_adapter.get_provenance({})
        assert prov["source_database"] == "gnomad"
        assert prov["confidence_tier"] == "A"
        assert "807k" in prov["sample_size_note"]

    def test_adapter_attributes(self, gnomad_adapter):
        assert gnomad_adapter.name == "gnomad"
        assert gnomad_adapter.display_name == "gnomAD"
        assert gnomad_adapter.confidence_tier == "A"
        assert "genetic_variant" in gnomad_adapter.data_types
        assert gnomad_adapter.reference_genome == "GRCh38"


# =============================================================================
# UniProt Adapter Tests
# =============================================================================

class TestUniprotAdapter:
    """Tests for the UniProt adapter."""

    @pytest.mark.asyncio
    async def test_validate_connection_success(self, uniprot_adapter):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "results": [
                {"primaryAccession": "P04637", "uniProtkbId": "P53_HUMAN"}
            ]
        }
        uniprot_adapter.client = MagicMock()
        uniprot_adapter.client.request = AsyncMock(return_value=mock_response)

        result = await uniprot_adapter.validate_connection()
        assert result is True

    @pytest.mark.asyncio
    async def test_validate_connection_failure(self, uniprot_adapter):
        mock_response = MagicMock()
        mock_response.status_code = 503
        uniprot_adapter.client = MagicMock()
        uniprot_adapter.client.request = AsyncMock(return_value=mock_response)

        result = await uniprot_adapter.validate_connection()
        assert result is False

    @pytest.mark.asyncio
    async def test_search_by_accession(self, uniprot_adapter):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "primaryAccession": "P04637",
            "uniProtkbId": "P53_HUMAN",
            "entryType": "UniProtKB/Swiss-Prot",
            "organism": {"scientificName": "Homo sapiens", "taxonId": 9606},
            "proteinDescription": {
                "recommendedName": {
                    "fullName": {"value": "Cellular tumor antigen p53"},
                    "shortNames": [{"value": "p53"}],
                }
            },
            "genes": [{"geneName": {"value": "TP53"}, "synonyms": []}],
            "sequence": {"sequence": "MEEPQSDPSVEPPLSQETFSDLWKLLPENNVLSPLPSQAMDDLMLSPDDIEQWFTEDPGP", "length": 393, "molWeight": 43653},
            "comments": [
                {
                    "commentType": "FUNCTION",
                    "texts": [{"value": "Acts as a tumor suppressor in many tumor types"}],
                }
            ],
            "keywords": [
                {"name": "Transcription regulation"},
                {"name": "Tumor suppressor"},
            ],
            "uniProtKBCrossReferences": [
                {"database": "GO", "id": "GO:0006355", "properties": [{"key": "GoTerm", "value": "P:regulation of transcription, DNA-templated"}]},
                {"database": "PDB", "id": "1TUP"},
            ],
            "features": [
                {"type": "Natural variant", "location": {"start": {"position": 72}, "end": {"position": 72}}, "variantType": "R -> P"},
            ],
            "entryAudit": {
                "firstPublicDate": "1988-01-01",
                "lastAnnotationUpdateDate": "2024-01-15",
            },
        }
        uniprot_adapter.client = MagicMock()
        uniprot_adapter.client.request = AsyncMock(return_value=mock_response)

        results = await uniprot_adapter.search("P04637", filters={"search_type": "accession"})
        assert len(results) == 1
        assert results[0]["primaryAccession"] == "P04637"
        assert results[0]["uniProtkbId"] == "P53_HUMAN"

    @pytest.mark.asyncio
    async def test_search_by_gene(self, uniprot_adapter):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "results": [
                {
                    "primaryAccession": "P04637",
                    "uniProtkbId": "P53_HUMAN",
                    "entryType": "UniProtKB/Swiss-Prot",
                    "organism": {"scientificName": "Homo sapiens"},
                    "proteinDescription": {
                        "recommendedName": {"fullName": {"value": "Cellular tumor antigen p53"}}
                    },
                    "genes": [{"geneName": {"value": "TP53"}}],
                    "sequence": {"sequence": "MEEPQSDPSVEPPLSQETFSDLWKLLPENNVLSPLPSQAMDDLMLSPDDIEQWFTEDPGP", "length": 393, "molWeight": 43653},
                    "comments": [],
                    "keywords": [],
                    "uniProtKBCrossReferences": [],
                    "features": [],
                }
            ]
        }
        uniprot_adapter.client = MagicMock()
        uniprot_adapter.client.request = AsyncMock(return_value=mock_response)

        results = await uniprot_adapter.search("TP53", filters={"search_type": "gene"})
        assert len(results) == 1
        assert results[0]["primaryAccession"] == "P04637"

    def test_transform_to_canonical(self, uniprot_adapter):
        raw = {
            "primaryAccession": "P04637",
            "uniProtkbId": "P53_HUMAN",
            "entryType": "UniProtKB/Swiss-Prot",
            "organism": {"scientificName": "Homo sapiens", "taxonId": 9606},
            "proteinDescription": {
                "recommendedName": {
                    "fullName": {"value": "Cellular tumor antigen p53"},
                    "shortNames": [{"value": "p53"}],
                }
            },
            "genes": [{"geneName": {"value": "TP53"}, "synonyms": []}],
            "sequence": {"sequence": "MEEPQSDPSVEPPLSQETFSDLWKLLPENNVLSPLPSQAMDDLMLSPDDIEQWFTEDPGP", "length": 393, "molWeight": 43653},
            "comments": [
                {
                    "commentType": "FUNCTION",
                    "texts": [{"value": "Acts as a tumor suppressor in many tumor types"}],
                }
            ],
            "keywords": [
                {"name": "Transcription regulation"},
                {"name": "Tumor suppressor"},
            ],
            "uniProtKBCrossReferences": [
                {"database": "GO", "id": "GO:0006355", "properties": [{"key": "GoTerm", "value": "P:regulation of transcription, DNA-templated"}]},
                {"database": "PDB", "id": "1TUP"},
            ],
            "features": [
                {"type": "Natural variant"},
            ],
            "entryAudit": {
                "firstPublicDate": "1988-01-01",
                "lastAnnotationUpdateDate": "2024-01-15",
            },
        }
        canonical = uniprot_adapter.transform_to_canonical(raw)

        assert canonical["source_database"] == "uniprot"
        assert canonical["source_id"] == "P04637"
        assert canonical["gene_symbol"] == "TP53"
        assert canonical["uniprot"]["protein_name"] == "Cellular tumor antigen p53"
        assert canonical["uniprot"]["is_reviewed"] is True
        assert canonical["uniprot"]["sequence_length"] == 393
        assert canonical["uniprot"]["organism"] == "Homo sapiens"
        assert len(canonical["uniprot"]["go_terms"]) == 1
        assert canonical["uniprot"]["go_terms"][0]["id"] == "GO:0006355"
        assert canonical["uniprot"]["variant_count"] == 1
        assert "Tumor suppressor" in canonical["uniprot"]["keywords"]

    def test_transform_to_canonical_trembl(self, uniprot_adapter):
        raw = {
            "primaryAccession": "A0A0C5B5G6",
            "uniProtkbId": "A0A0C5B5G6_HUMAN",
            "entryType": "UniProtKB/TrEMBL",
            "organism": {"scientificName": "Homo sapiens", "taxonId": 9606},
            "proteinDescription": {
                "submissionNames": [{"fullName": {"value": "Uncharacterized protein"}}]
            },
            "genes": [],
            "sequence": {"sequence": "MSS", "length": 3, "molWeight": 300},
            "comments": [],
            "keywords": [],
            "uniProtKBCrossReferences": [],
            "features": [],
        }
        canonical = uniprot_adapter.transform_to_canonical(raw)

        assert canonical["uniprot"]["is_reviewed"] is False
        assert canonical["uniprot"]["entry_type"] == "UniProtKB/TrEMBL"
        assert canonical["uniprot"]["protein_name"] == "Uncharacterized protein"

    def test_get_confidence_score_reviewed(self, uniprot_adapter):
        result = {
            "entryType": "UniProtKB/Swiss-Prot",
            "comments": [{"commentType": "FUNCTION"}],
            "uniProtKBCrossReferences": [
                {"database": "GO"},
                {"database": "PDB"},
            ],
        }
        score = uniprot_adapter.get_confidence_score(result)
        assert score["overall"] > 0.9
        assert score["data_quality"] > 0.98

    def test_get_confidence_score_trembl(self, uniprot_adapter):
        result = {
            "entryType": "UniProtKB/TrEMBL",
            "comments": [],
            "uniProtKBCrossReferences": [],
        }
        score = uniprot_adapter.get_confidence_score(result)
        assert score["overall"] < 0.85
        assert score["data_quality"] < 0.75

    def test_get_provenance(self, uniprot_adapter):
        prov = uniprot_adapter.get_provenance({"entryType": "UniProtKB/Swiss-Prot"})
        assert prov["source_database"] == "uniprot"
        assert prov["data_quality_score"] == 0.98
        assert prov["curation_level"] == "manual_expert"

    def test_get_provenance_trembl(self, uniprot_adapter):
        prov = uniprot_adapter.get_provenance({"entryType": "UniProtKB/TrEMBL"})
        assert prov["data_quality_score"] == 0.75
        assert prov["curation_level"] == "computational"

    def test_adapter_attributes(self, uniprot_adapter):
        assert uniprot_adapter.name == "uniprot"
        assert uniprot_adapter.display_name == "UniProt"
        assert uniprot_adapter.confidence_tier == "A"
        assert "protein" in uniprot_adapter.data_types
        assert not uniprot_adapter.requires_auth


# =============================================================================
# Cross-adapter Consistency Tests
# =============================================================================

class TestCrossAdapterConsistency:
    """Tests ensuring all adapters share consistent interface behavior."""

    def test_all_adapters_have_required_attributes(self):
        adapters = [
            GwasCatalogAdapter(),
            DbsnpAdapter(),
            EnsemblAdapter(),
            GnomadAdapter(),
            UniprotAdapter(),
        ]
        required_attrs = [
            "name", "display_name", "source_url", "version",
            "confidence_tier", "data_types", "rate_limit_per_minute",
            "requires_auth", "auth_type", "client",
        ]
        for adapter in adapters:
            for attr in required_attrs:
                assert hasattr(adapter, attr), f"{adapter.name} missing {attr}"

    def test_all_adapters_have_required_methods(self):
        adapters = [
            GwasCatalogAdapter(),
            DbsnpAdapter(),
            EnsemblAdapter(),
            GnomadAdapter(),
            UniprotAdapter(),
        ]
        required_methods = [
            "validate_connection", "search", "transform_to_canonical",
            "get_provenance", "get_confidence_score", "close",
        ]
        for adapter in adapters:
            for method in required_methods:
                assert hasattr(adapter, method), f"{adapter.name} missing {method}"
                assert callable(getattr(adapter, method)), f"{adapter.name}.{method} not callable"

    def test_all_transform_to_canonical_returns_expected_keys(self):
        adapters_data = [
            (GwasCatalogAdapter(), {"accessionId": "GCST001", "pvalue": 1e-5, "loci": [], "efoTraits": []}),
            (DbsnpAdapter(), {"snp_id": "6025", "chr": "1", "chrpos": "1000", "snp_class": "snp", "genes": []}),
            (EnsemblAdapter(), {"id": "ENSG001", "display_name": "GENE", "seq_region_name": "1", "start": 100, "biotype": "protein_coding"}),
            (GnomadAdapter(), {"variant_id": "1-100-A-G", "chrom": "1", "pos": 100, "rsids": [], "populations": []}),
            (UniprotAdapter(), {"primaryAccession": "P12345", "uniProtkbId": "TEST", "proteinDescription": {"recommendedName": {"fullName": {"value": "Test"}}}, "genes": [], "sequence": {}, "comments": [], "keywords": [], "uniProtKBCrossReferences": [], "features": []}),
        ]
        expected_keys = [
            "entity_type", "source_database", "source_id", "gene_symbol",
            "variant_id", "chromosome", "position", "confidence", "provenance", "raw_data",
        ]
        for adapter, raw_data in adapters_data:
            canonical = adapter.transform_to_canonical(raw_data)
            for key in expected_keys:
                assert key in canonical, f"{adapter.name} canonical missing {key}"

    def test_all_get_provenance_returns_expected_keys(self):
        adapters = [
            GwasCatalogAdapter(),
            DbsnpAdapter(),
            EnsemblAdapter(),
            GnomadAdapter(),
            UniprotAdapter(),
        ]
        expected_keys = [
            "source_database", "source_version", "source_url",
            "retrieved_at", "confidence_tier", "data_quality_score",
            "research_only",
        ]
        for adapter in adapters:
            prov = adapter.get_provenance({})
            for key in expected_keys:
                assert key in prov, f"{adapter.name} provenance missing {key}"

    def test_all_get_confidence_score_returns_expected_keys(self):
        adapters = [
            GwasCatalogAdapter(),
            DbsnpAdapter(),
            EnsemblAdapter(),
            GnomadAdapter(),
            UniprotAdapter(),
        ]
        expected_keys = [
            "data_quality", "evidence_strength", "sample_size",
            "replication", "consistency", "temporal_relevance",
            "population_match", "overall",
        ]
        for adapter in adapters:
            score = adapter.get_confidence_score({})
            for key in expected_keys:
                assert key in score, f"{adapter.name} confidence missing {key}"
            assert 0.0 <= score["overall"] <= 1.0

    def test_all_adapters_context_manager(self):
        adapters = [
            GwasCatalogAdapter(),
            DbsnpAdapter(),
            EnsemblAdapter(),
            GnomadAdapter(),
            UniprotAdapter(),
        ]
        for adapter in adapters:
            assert hasattr(adapter, "__aenter__")
            assert hasattr(adapter, "__aexit__")
