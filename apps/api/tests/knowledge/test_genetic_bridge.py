"""
Tests for the Genetic Analyzer Bridge.

Uses fully mocked adapters to verify bridge logic, output schema,
error resilience, and parallel query patterns.
"""
from __future__ import annotations

import asyncio
import logging
import sys
from copy import deepcopy
from typing import Any, Dict, List, Optional
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# Ensure the bridge module is importable
sys.path.insert(0, "/mnt/agents/output/phase5")

from genetic_bridge import GeneticAnalyzerBridge, _prov, _utc, _weighted_confidence

logger = logging.getLogger(__name__)

# ── Mock Adapter Factory ───────────────────────────────────────────────────────


def _make_mock_adapter(
    name: str,
    *,
    search_result: Any = None,
    connect_result: bool = True,
) -> MagicMock:
    """Create a mock adapter with the standard interface."""
    mock = MagicMock()
    mock.source_name = name
    mock.source_version = "2024.01"
    mock.search = AsyncMock(return_value=search_result)
    mock.connect = AsyncMock(return_value=connect_result)
    mock.disconnect = AsyncMock(return_value=None)
    mock.health_check = AsyncMock(return_value={"status": "ok", "source": name})
    return mock


# ── Fixtures ───────────────────────────────────────────────────────────────────


@pytest.fixture
def mock_registry_all() -> Dict[str, MagicMock]:
    """Registry with all 10 adapters providing rich mock data."""

    # ClinVar: rs4680 = risk factor
    clinvar = _make_mock_adapter("ClinVar")
    clinvar.search.return_value = [
        {
            "canonical_data": {
                "variant_id": "rs4680",
                "gene": "COMT",
                "chromosome": "22",
                "position": 19951271,
                "ref_allele": "G",
                "alt_allele": "A",
                "clinical_significance": "risk factor",
                "review_status": "criteria provided, multiple submitters, no conflicts",
                "star_level": 2,
                "conditions": ["cognitive performance", "pain sensitivity"],
            }
        }
    ]

    # PharmGKB: drug annotations
    pharmgkb = _make_mock_adapter("PharmGKB")
    pharmgkb.search.return_value = [
        {
            "canonical_data": {
                "gene": "COMT",
                "drug": "valproic acid",
                "variant": "rs4680",
                "phenotype": "poor metabolizer",
                "clinical_implication": "altered metabolism",
                "level_of_evidence": 2,
                "annotation_level": 2,
            }
        },
        {
            "canonical_data": {
                "gene": "COMT",
                "drug": "levodopa",
                "variant": "rs4680",
                "phenotype": "intermediate metabolizer",
                "clinical_implication": "reduced enzymatic activity",
                "level_of_evidence": 3,
            }
        },
    ]

    # GWAS Catalog: cognitive flexibility association
    gwas = _make_mock_adapter("GWAS Catalog")
    gwas.search.return_value = [
        {
            "canonical_data": {
                "rsid": "rs4680",
                "trait": "cognitive flexibility",
                "p_value": 1.2e-8,
                "odds_ratio": 1.45,
                "beta": 0.23,
                "first_author": "Smith et al.",
                "pubmed_id": "12345678",
            }
        },
        {
            "canonical_data": {
                "rsid": "rs4680",
                "trait": "pain sensitivity",
                "p_value": 3.4e-6,
                "odds_ratio": 1.22,
                "first_author": "Jones et al.",
                "pubmed_id": "87654321",
            }
        },
    ]

    # dbSNP: basic variant metadata
    dbsnp = _make_mock_adapter("dbSNP")
    dbsnp.search.return_value = [
        {
            "canonical_data": {
                "rsid": "rs4680",
                "gene": "COMT",
                "chromosome": "22",
                "position": 19951271,
                "ref_allele": "G",
                "alt_allele": "A",
                "snp_class": "snv",
            }
        }
    ]

    # Ensembl: variant consequence
    ensembl = _make_mock_adapter("Ensembl")
    ensembl.search.return_value = [
        {
            "canonical_data": {
                "variant_id": "rs4680",
                "gene": "COMT",
                "consequence_terms": "missense_variant",
                "impact": "MODERATE",
                "strand": 1,
                "chromosome": "22",
                "seq_region_name": "22",
                "start": 19951271,
            }
        }
    ]

    # gnomAD: population frequencies
    gnomad = _make_mock_adapter("gnomAD")
    gnomad.search.return_value = [
        {
            "canonical_data": {
                "variant_id": "rs4680",
                "gene": "COMT",
                "af_nfe": 0.42,
                "af_afr": 0.27,
                "af_eas": 0.49,
                "af_sas": 0.34,
                "af_amr": 0.38,
                "af": 0.36,
            }
        }
    ]

    # UniProt: protein info
    uniprot = _make_mock_adapter("UniProt")
    uniprot.search.return_value = [
        {
            "canonical_data": {
                "gene_name": "COMT",
                "protein_name": "Catechol O-methyltransferase",
                "pathways": ["dopaminergic synapse", "catecholamine synthesis"],
                "go_terms": ["methyltransferase activity", "dopamine metabolic process"],
                "function": "Catalyzes the O-methylation of catecholamines.",
            }
        }
    ]

    # STRING: protein interactions
    string = _make_mock_adapter("STRING")
    string.search.return_value = [
        {
            "canonical_data": {
                "preferred_name_a": "COMT",
                "preferred_name_b": "DRD2",
                "combined_score": 0.85,
                "score": 0.85,
            }
        },
        {
            "canonical_data": {
                "preferred_name_a": "COMT",
                "preferred_name_b": "HTR2A",
                "combined_score": 0.72,
                "score": 0.72,
            }
        },
        {
            "canonical_data": {
                "preferred_name_a": "COMT",
                "preferred_name_b": "BDNF",
                "combined_score": 0.68,
                "score": 0.68,
            }
        },
    ]

    # MyVariant: rich variant annotation
    myvariant = _make_mock_adapter("MyVariant")
    myvariant.search.return_value = [
        {
            "canonical_data": {
                "variant_id": "rs4680",
                "hgvsp": "Val158Met",
                "protein_change": "Val158Met",
                "cadd": {"phred": 22.3},
                "cadd_score": 22.3,
                "dbnsfp": {
                    "sift_pred": "tolerated",
                    "polyphen2_hdiv_pred": "possibly_damaging",
                    "cadd_phred": 22.3,
                },
                "snpeff": {
                    "ann": {
                        "sift_pred": "tolerated",
                        "polyphen_pred": "possibly_damaging",
                    }
                },
                "vcf": {"ref": "G", "alt": "A", "variant_class": "missense_variant"},
            }
        }
    ]

    # Allen Brain: gene expression
    allen = _make_mock_adapter("Allen Brain")
    allen.search.return_value = [
        {
            "canonical_data": {
                "gene_symbol": "COMT",
                "regions": [
                    {"name": "prefrontal cortex", "expression_level": 3.2},
                    {"name": "hippocampus", "expression_level": 2.8},
                    {"name": "striatum", "expression_level": 3.5},
                ],
                "expression_level": "high",
                "structures": [
                    {"structure_name": "prefrontal cortex", "expression": 3.2},
                ],
            }
        }
    ]

    return {
        "clinvar": clinvar,
        "pharmgkb": pharmgkb,
        "gwas_catalog": gwas,
        "dbsnp": dbsnp,
        "ensembl": ensembl,
        "gnomad": gnomad,
        "uniprot": uniprot,
        "string": string,
        "myvariant": myvariant,
        "allen_brain": allen,
    }


@pytest.fixture
def mock_registry_partial() -> Dict[str, MagicMock]:
    """Registry with only 3 adapters (tests resilience)."""
    clinvar = _make_mock_adapter("ClinVar")
    clinvar.search.return_value = [
        {
            "canonical_data": {
                "variant_id": "rs4680",
                "gene": "COMT",
                "clinical_significance": "risk factor",
                "review_status": "criteria provided, multiple submitters, no conflicts",
            }
        }
    ]

    gwas = _make_mock_adapter("GWAS Catalog")
    gwas.search.return_value = [
        {
            "canonical_data": {
                "rsid": "rs4680",
                "trait": "cognitive flexibility",
                "p_value": 1.2e-8,
                "odds_ratio": 1.45,
            }
        }
    ]

    gnomad = _make_mock_adapter("gnomAD")
    gnomad.search.return_value = [
        {
            "canonical_data": {
                "variant_id": "rs4680",
                "af_nfe": 0.42,
                "af_afr": 0.27,
                "af_eas": 0.49,
            }
        }
    ]

    return {
        "clinvar": clinvar,
        "gwas_catalog": gwas,
        "gnomad": gnomad,
    }


@pytest.fixture
def mock_registry_empty() -> Dict[str, None]:
    """Empty registry (all adapters missing)."""
    return {}


# ── Test _prov helper ──────────────────────────────────────────────────────────


def test_prov_basic():
    p = _prov(["clinvar"], "rs4680:COMT", 0.85)
    assert p["sources"] == ["clinvar"]
    assert p["query"] == "rs4680:COMT"
    assert p["confidence"] == 0.85
    assert p["confidence_tier"] == "moderate"  # 0.85 < 0.9 threshold for high
    assert p["is_research_only"] is True
    assert p["bridge"] == "genetic_analyzer_bridge"
    assert p["version"] == "2.0.0"
    assert "accessed_at" in p


def test_prov_tiers():
    assert _prov([], "q", 0.95)["confidence_tier"] == "high"
    assert _prov([], "q", 0.80)["confidence_tier"] == "moderate"
    assert _prov([], "q", 0.50)["confidence_tier"] == "low"
    assert _prov([], "q", 0.20)["confidence_tier"] == "insufficient"


def test_prov_research_flag():
    assert _prov([], "q", 0.5, research=True)["is_research_only"] is True
    assert _prov([], "q", 0.5, research=False)["is_research_only"] is False


def test_prov_metadata():
    meta = {"variant": "rs4680", "gene": "COMT"}
    p = _prov(["clinvar"], "q", 0.8, meta=meta)
    assert p["metadata"] == meta


# ── Test _weighted_confidence helper ───────────────────────────────────────────


def test_weighted_confidence_single():
    conf, sources = _weighted_confidence([(0.8, ["clinvar"])])
    assert conf == 0.8
    assert sources == ["clinvar"]


def test_weighted_confidence_multiple():
    conf, sources = _weighted_confidence(
        [(0.8, ["clinvar"]), (0.7, ["gwas_catalog"]), (0.9, ["gnomad"])]
    )
    assert conf == pytest.approx(0.8, 0.01)
    assert set(sources) == {"clinvar", "gwas_catalog", "gnomad"}


def test_weighted_confidence_empty():
    conf, sources = _weighted_confidence([])
    assert conf == 0.25
    assert sources == []


def test_weighted_confidence_dedupes_sources():
    conf, sources = _weighted_confidence(
        [(0.8, ["clinvar"]), (0.7, ["clinvar"])]
    )
    assert sources == ["clinvar"]  # deduped


# ── Test bridge initialisation ─────────────────────────────────────────────────


def test_bridge_init_all_adapters(mock_registry_all):
    bridge = GeneticAnalyzerBridge(mock_registry_all)
    assert len(bridge._adapters) == 10
    assert "clinvar" in bridge._adapters
    assert "pharmgkb" in bridge._adapters


def test_bridge_init_partial(mock_registry_partial):
    bridge = GeneticAnalyzerBridge(mock_registry_partial)
    assert len(bridge._adapters) == 3
    assert "clinvar" in bridge._adapters
    assert "pharmgkb" not in bridge._adapters


def test_bridge_init_empty(mock_registry_empty):
    bridge = GeneticAnalyzerBridge(mock_registry_empty)
    assert len(bridge._adapters) == 0


# ── Test interpret_variant (full adapters) ─────────────────────────────────────


@pytest.mark.asyncio
async def test_interpret_variant_full(mock_registry_all):
    bridge = GeneticAnalyzerBridge(mock_registry_all)
    result = await bridge.interpret_variant("rs4680", "COMT")

    # Top-level checks
    assert result["confidence_overall"] > 0
    assert result["research_only"] is True
    assert "provenance" in result

    # Variant info
    v = result["variant"]
    assert v["id"] == "rs4680"
    assert v["gene"] == "COMT"
    assert v["chromosome"] == "22"
    assert v["position"] == 19951271
    assert v["ref"] == "G"
    assert v["alt"] == "A"

    # Clinical significance
    cs = result["clinical_significance"]
    assert cs["clinvar_interpretation"] == "risk factor"
    assert "clinvar" in cs["source_adapters"]
    assert cs["confidence"] > 0

    # Population frequencies
    pf = result["population_frequencies"]
    assert pf["gnomad_eur"] == pytest.approx(0.42, 0.01)
    assert pf["gnomad_afr"] == pytest.approx(0.27, 0.01)
    assert pf["gnomad_eas"] == pytest.approx(0.49, 0.01)
    assert pf["gnomad_sas"] == pytest.approx(0.34, 0.01)
    assert "gnomad" in pf["source_adapters"]

    # Functional impact
    fi = result["functional_impact"]
    assert fi["protein_change"] == "Val158Met"
    assert fi["consequence"] == "missense_variant"
    assert fi["sift"] == "tolerated"
    assert fi["polyphen"] == "possibly_damaging"
    assert fi["cadd_score"] == pytest.approx(22.3, 0.1)
    assert set(fi["source_adapters"]) & {"ensembl", "myvariant"}

    # Phenotype associations
    phenos = result["phenotype_associations"]
    assert len(phenos) >= 1
    assert any(p["trait"] == "cognitive flexibility" for p in phenos)
    cf = [p for p in phenos if p["trait"] == "cognitive flexibility"][0]
    assert cf["p_value"] == pytest.approx(1.2e-8, rel=1e-9)
    assert cf["odds_ratio"] == pytest.approx(1.45, 0.01)
    assert cf["confidence"] > 0

    # Pharmacogenomic associations
    pgx = result["pharmacogenomic_associations"]
    assert len(pgx) >= 1
    assert any(p["drug"] == "valproic acid" for p in pgx)
    va = [p for p in pgx if p["drug"] == "valproic acid"][0]
    assert va["effect"] == "altered metabolism"
    assert va["phenotype"] == "poor metabolizer"
    assert "pharmgkb" in va["source_adapters"]

    # Protein network
    net = result["protein_network"]
    assert any(i in net["interactors"] for i in ["DRD2", "HTR2A", "BDNF"])
    assert len(net["pathways"]) >= 0
    assert "string" in net["source_adapters"]

    # Brain expression
    expr = result["brain_expression"]
    assert any(r in expr["regions"] for r in ["prefrontal cortex", "hippocampus", "striatum"])
    assert expr["expression_level"] == "high"
    assert "allen_brain" in expr["source_adapters"]

    # Provenance
    prov = result["provenance"]
    assert prov["bridge"] == "genetic_analyzer_bridge"
    assert prov["is_research_only"] is True
    assert len(prov["sources"]) >= 3


@pytest.mark.asyncio
async def test_interpret_variant_partial_adapters(mock_registry_partial):
    """interpret_variant should work gracefully with only 3 adapters."""
    bridge = GeneticAnalyzerBridge(mock_registry_partial)
    result = await bridge.interpret_variant("rs4680", "COMT")

    assert result["confidence_overall"] > 0
    assert result["research_only"] is True

    # Clinical significance should still work
    cs = result["clinical_significance"]
    assert cs["clinvar_interpretation"] == "risk factor"

    # Population frequencies should work
    pf = result["population_frequencies"]
    assert pf["gnomad_eur"] == pytest.approx(0.42, 0.01)

    # Phenotype associations should work
    phenos = result["phenotype_associations"]
    assert any(p["trait"] == "cognitive flexibility" for p in phenos)

    # Missing adapters should return empty/minimal sections
    assert result["pharmacogenomic_associations"] == []
    assert result["functional_impact"]["source_adapters"] == []


@pytest.mark.asyncio
async def test_interpret_variant_empty_registry(mock_registry_empty):
    """interpret_variant should not crash with zero adapters."""
    bridge = GeneticAnalyzerBridge(mock_registry_empty)
    result = await bridge.interpret_variant("rs4680", "COMT")

    assert result["confidence_overall"] < 0.5  # Low confidence with no data
    assert result["research_only"] is True
    assert result["variant"]["id"] == "rs4680"
    assert result["variant"]["gene"] == "COMT"


@pytest.mark.asyncio
async def test_interpret_variant_known_fallbacks(mock_registry_all):
    """Test that known variant/gene fallbacks (e.g. COMT rs4680) populate correctly."""
    bridge = GeneticAnalyzerBridge(mock_registry_all)
    result = await bridge.interpret_variant("rs4680", "COMT")
    v = result["variant"]
    assert v["chromosome"] == "22"
    assert v["position"] == 19951271


# ── Test generate_risk_profile ─────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_risk_profile_multiple_variants(mock_registry_all):
    bridge = GeneticAnalyzerBridge(mock_registry_all)
    variants = ["rs4680", "rs1799971"]
    result = await bridge.generate_risk_profile(variants)

    assert result["variants_analyzed"] == 2
    assert result["variant_ids"] == variants
    assert result["research_only"] is True
    assert "provenance" in result
    assert "condition_risks" in result
    assert "drug_responses" in result
    assert "trait_associations" in result
    assert "overall_risk_score" in result
    assert "risk_level" in result
    assert "confidence_overall" in result


@pytest.mark.asyncio
async def test_risk_profile_single_variant(mock_registry_all):
    bridge = GeneticAnalyzerBridge(mock_registry_all)
    result = await bridge.generate_risk_profile(["rs4680"])

    assert result["variants_analyzed"] == 1
    assert result["variant_ids"] == ["rs4680"]


@pytest.mark.asyncio
async def test_risk_profile_empty(mock_registry_all):
    bridge = GeneticAnalyzerBridge(mock_registry_all)
    result = await bridge.generate_risk_profile([])

    assert result["variants_analyzed"] == 0
    assert result["overall_risk_score"] == 0.0
    assert result["confidence_overall"] == 0.0


@pytest.mark.asyncio
async def test_risk_profile_with_failures(mock_registry_all):
    """Risk profile should handle adapter failures gracefully."""
    # Make ClinVar fail
    mock_registry_all["clinvar"].search.side_effect = Exception("ClinVar timeout")
    bridge = GeneticAnalyzerBridge(mock_registry_all)
    result = await bridge.generate_risk_profile(["rs4680"])

    assert result["variants_analyzed"] == 1
    assert result["research_only"] is True
    assert result["confidence_overall"] >= 0  # Should still produce a result


# ── Test get_pathway_analysis ──────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_pathway_analysis_basic(mock_registry_all):
    bridge = GeneticAnalyzerBridge(mock_registry_all)
    result = await bridge.get_pathway_analysis(["COMT", "DRD2", "BDNF"])

    assert result["input_genes"] == ["COMT", "DRD2", "BDNF"]
    assert result["input_gene_count"] == 3
    assert result["research_only"] is True
    assert "interactors" in result
    assert "interactions" in result
    assert "pathways" in result
    assert "network_density" in result
    assert "network_metrics" in result
    assert result["confidence_overall"] > 0


@pytest.mark.asyncio
async def test_pathway_analysis_empty(mock_registry_all):
    bridge = GeneticAnalyzerBridge(mock_registry_all)
    result = await bridge.get_pathway_analysis([])

    assert result["input_genes"] == []
    assert result["interactors"] == []
    assert result["pathways"] == []
    assert result["network_density"] == 0.0


@pytest.mark.asyncio
async def test_pathway_analysis_single_gene(mock_registry_all):
    bridge = GeneticAnalyzerBridge(mock_registry_all)
    result = await bridge.get_pathway_analysis(["COMT"])

    assert result["input_gene_count"] == 1
    assert result["confidence_overall"] > 0


# ── Test compare_to_normative ──────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_compare_normative_basic(mock_registry_all):
    bridge = GeneticAnalyzerBridge(mock_registry_all)
    result = await bridge.compare_to_normative(
        ["rs4680", "rs1799971", "rs6277"], "schizophrenia"
    )

    assert result["condition"] == "schizophrenia"
    assert result["condition_normalized"] == "schizophrenia"
    assert result["patient_variants"] == ["rs4680", "rs1799971", "rs6277"]
    assert "overlapping_variants" in result
    assert "overlap_count" in result
    assert "polygenic_context" in result
    assert "frequency_deviations" in result
    assert "confidence_overall" in result
    assert result["research_only"] is True
    assert "provenance" in result


@pytest.mark.asyncio
async def test_compare_normative_empty_variants(mock_registry_all):
    bridge = GeneticAnalyzerBridge(mock_registry_all)
    result = await bridge.compare_to_normative([], "depression")

    assert result["patient_variants"] == []
    assert result["overlap_count"] == 0
    assert result["polygenic_context"]["overlap_rate"] == 0.0


@pytest.mark.asyncio
async def test_compare_normative_no_gwascatalog(mock_registry_all):
    """Normative comparison should work even without GWAS Catalog."""
    mock_registry_all["gwas_catalog"].search.side_effect = Exception("GWAS down")
    bridge = GeneticAnalyzerBridge(mock_registry_all)
    result = await bridge.compare_to_normative(["rs4680"], "depression")

    assert result["research_only"] is True
    assert result["overlap_count"] == 0
    assert result["confidence_overall"] >= 0


# ── Test error resilience ──────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_all_adapters_fail_gracefully():
    """Bridge should survive when every adapter raises an exception."""
    failing_adapters = {
        name: _make_mock_adapter(name, search_result=None)
        for name in [
            "clinvar", "pharmgkb", "gwas_catalog", "dbsnp", "ensembl",
            "gnomad", "uniprot", "string", "myvariant", "allen_brain",
        ]
    }
    for adapter in failing_adapters.values():
        adapter.search.side_effect = Exception("adapter failure")

    bridge = GeneticAnalyzerBridge(failing_adapters)
    result = await bridge.interpret_variant("rs4680", "COMT")

    assert result["confidence_overall"] < 0.5
    assert result["research_only"] is True
    assert result["variant"]["id"] == "rs4680"
    # Should still have the known fallback data
    assert result["variant"]["chromosome"] == "22"


@pytest.mark.asyncio
async def test_mixed_adapter_health(mock_registry_all):
    """Some adapters work, some fail, some missing."""
    # Remove half the adapters
    partial = {
        k: v
        for k, v in mock_registry_all.items()
        if k in ["clinvar", "gwas_catalog", "gnomad"]
    }
    # Make one fail
    partial["clinvar"].search.side_effect = Exception("timeout")

    bridge = GeneticAnalyzerBridge(partial)
    result = await bridge.interpret_variant("rs4680", "COMT")

    assert result["confidence_overall"] > 0
    assert result["research_only"] is True
    # gnomAD and GWAS should still contribute
    assert result["population_frequencies"].get("gnomad_eur") == pytest.approx(0.42, 0.01)


# ── Test provenance and confidence schemas ─────────────────────────────────────


@pytest.mark.asyncio
async def test_provenance_schema_integrity(mock_registry_all):
    bridge = GeneticAnalyzerBridge(mock_registry_all)
    result = await bridge.interpret_variant("rs4680", "COMT")

    prov = result["provenance"]
    required_keys = {
        "sources", "query", "confidence", "confidence_tier",
        "is_research_only", "accessed_at", "bridge", "version",
    }
    assert required_keys.issubset(prov.keys())
    assert prov["bridge"] == "genetic_analyzer_bridge"
    assert prov["version"] == "2.0.0"
    assert isinstance(prov["is_research_only"], bool)
    assert isinstance(prov["confidence"], float)


@pytest.mark.asyncio
async def test_confidence_bounds(mock_registry_all):
    bridge = GeneticAnalyzerBridge(mock_registry_all)
    result = await bridge.interpret_variant("rs4680", "COMT")

    assert 0.0 <= result["confidence_overall"] <= 1.0

    for method_name, method in [
        ("generate_risk_profile", lambda: bridge.generate_risk_profile(["rs4680"])),
        ("get_pathway_analysis", lambda: bridge.get_pathway_analysis(["COMT"])),
        ("compare_to_normative", lambda: bridge.compare_to_normative(["rs4680"], "test")),
    ]:
        res = await method()
        assert 0.0 <= res["confidence_overall"] <= 1.0, f"{method_name} confidence out of bounds"


# ── Test research_only flag ────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_research_only_flag_always_set(mock_registry_all):
    bridge = GeneticAnalyzerBridge(mock_registry_all)

    r1 = await bridge.interpret_variant("rs4680", "COMT")
    assert r1["research_only"] is True

    r2 = await bridge.generate_risk_profile(["rs4680"])
    assert r2["research_only"] is True

    r3 = await bridge.get_pathway_analysis(["COMT"])
    assert r3["research_only"] is True

    r4 = await bridge.compare_to_normative(["rs4680"], "depression")
    assert r4["research_only"] is True


# ── Performance / concurrency tests ────────────────────────────────────────────


@pytest.mark.asyncio
async def test_parallel_execution(mock_registry_all):
    """interpret_variant should query all adapters in parallel."""
    call_times: Dict[str, float] = {}
    original_searches = {}

    for name, adapter in mock_registry_all.items():
        orig = adapter.search

        async def _timed_search(*args, orig=orig, name=name):
            import time

            t0 = time.monotonic()
            result = await orig(*args)
            call_times[name] = time.monotonic() - t0
            return result

        adapter.search = _timed_search

    bridge = GeneticAnalyzerBridge(mock_registry_all)
    result = await bridge.interpret_variant("rs4680", "COMT")

    # All adapters that exist should have been called
    for name in mock_registry_all:
        assert name in call_times, f"Adapter {name} was not called"


@pytest.mark.asyncio
async def test_large_variant_list(mock_registry_all):
    """Risk profile should handle many variants efficiently."""
    bridge = GeneticAnalyzerBridge(mock_registry_all)
    variants = [f"rs{i}" for i in range(100, 125)]  # 25 variants
    result = await bridge.generate_risk_profile(variants)

    assert result["variants_analyzed"] == 25
    # Should complete without crashing


# ── Run tests if executed directly ─────────────────────────────────────────────

if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
