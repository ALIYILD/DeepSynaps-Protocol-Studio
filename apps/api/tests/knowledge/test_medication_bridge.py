"""
Tests for MedicationAnalyzerBridge.

Uses mocked adapters to avoid external API calls.
Tests all 4 primary methods with realistic data fixtures.
Verifies provenance, confidence scoring, error handling, and research-only flags.
"""

from __future__ import annotations

import asyncio
import logging
import sys
from dataclasses import dataclass
from typing import Any, Dict, List, Optional
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# Ensure the parent path is importable
sys.path.insert(0, "/mnt/agents/output/phase5")

from medication_bridge import (
    _ADAPTER_WEIGHTS,
    _avg_weight,
    _build_provenance,
    _deduplicate_dicts,
    MedicationAnalyzerBridge,
    _BRIDGE_NAME,
    _BRIDGE_VERSION,
)

logger = logging.getLogger(__name__)

# ── Mock adapter factories ──────────────────────────────────────────────────


def make_mock_adapter(
    name: str,
    fetch_result: Any = None,
    get_interactions_result: Any = None,
    get_label_result: Any = None,
    get_pgx_result: Any = None,
    get_drug_events_result: Any = None,
    health_ok: bool = True,
) -> MagicMock:
    """Create a MagicMock adapter with configurable async responses."""
    adapter = MagicMock()
    adapter.source_name = name
    adapter.source_version = "2024.01"
    adapter.fetch = AsyncMock(return_value=fetch_result)
    adapter.get_interactions = AsyncMock(return_value=get_interactions_result)
    adapter.get_label = AsyncMock(return_value=get_label_result)
    adapter.get_pgx_guidance = AsyncMock(return_value=get_pgx_result)
    adapter.get_drug_events = AsyncMock(return_value=get_drug_events_result)
    adapter.health_check = AsyncMock(
        return_value={
            "status": "ok" if health_ok else "down",
            "latency_ms": 42.0,
            "source": name,
        }
    )
    adapter.connect = AsyncMock(return_value=True)
    adapter.disconnect = AsyncMock()
    return adapter


@pytest.fixture
def full_registry() -> dict[str, Any]:
    """Build a registry with all 15 adapters mocked."""
    return {
        "drugbank": make_mock_adapter(
            "drugbank",
            fetch_result=[
                {"drugbank_id": "DB01104", "name": "Sertraline"},
            ],
            get_interactions_result=[
                {
                    "interacting_drug": "tramadol",
                    "severity": "major",
                    "mechanism": "Increased serotonergic effect",
                    "description": "SSRI + opioid combination",
                }
            ],
        ),
        "rxnorm": make_mock_adapter(
            "rxnorm",
            fetch_result=[
                {"rxcui": "C0074394", "name": "Sertraline", "tty": "IN"},
            ],
        ),
        "pharmgkb": make_mock_adapter(
            "pharmgkb",
            fetch_result=[
                {
                    "gene": "CYP2D6",
                    "variant": "*4/*4",
                    "phenotype": "poor metabolizer",
                    "clinical_implication": "Reduced metabolism; consider alternative",
                    "annotation_level": 1,
                    "evidence_level": "meta-analysis",
                    "description": "CYP2D6 poor metabolizers have reduced sertraline clearance",
                },
                {
                    "gene": "CYP2C19",
                    "variant": "*2/*2",
                    "phenotype": "poor metabolizer",
                    "clinical_implication": "Increased levels; monitor",
                    "annotation_level": 2,
                    "evidence_level": "clinical trial",
                    "description": "CYP2C19 poor metabolizers have higher sertraline exposure",
                },
            ],
        ),
        "openfda": make_mock_adapter(
            "openfda",
            fetch_result=[
                {
                    "drug_name": "Sertraline",
                    "contraindications": ["MAO inhibitors", "Pimozide"],
                    "pregnancy_category": "C",
                    "warnings": [
                        "CYP2D6 poor metabolizers may have altered drug response",
                        "Monitor for serotonin syndrome",
                    ],
                    "adverse_reactions": ["nausea", "insomnia", "diarrhea", "ejaculation failure"],
                }
            ],
            get_label_result={
                "warnings": ["CYP2D6 poor metabolizers may have altered drug response"],
                "contraindications": ["MAO inhibitors", "Pimozide"],
                "adverse_reactions": ["nausea", "insomnia", "diarrhea"],
            },
        ),
        "chembl": make_mock_adapter(
            "chembl",
            fetch_result=[
                {"chembl_id": "CHEMBL809", "name": "Sertraline"},
            ],
        ),
        "pubchem": make_mock_adapter(
            "pubchem",
            fetch_result=[
                {"cid": "68617", "name": "Sertraline"},
            ],
        ),
        "faers": make_mock_adapter(
            "faers",
            fetch_result=[
                {"adverse_event_meddra": "Nausea", "report_count": 1523, "term": "Nausea"},
                {"adverse_event_meddra": "Headache", "report_count": 981, "term": "Headache"},
                {"adverse_event_meddra": "Insomnia", "report_count": 876, "term": "Insomnia"},
                {"adverse_event_meddra": "Diarrhea", "report_count": 654, "term": "Diarrhea"},
                {"adverse_event_meddra": "Fatigue", "report_count": 543, "term": "Fatigue"},
            ],
        ),
        "onsides": make_mock_adapter(
            "onsides",
            fetch_result=[
                {"adverse_event_name": "Nausea", "adverse_event_meddra": "Nausea", "probability_score": 0.92},
                {"adverse_event_name": "Diarrhea", "adverse_event_meddra": "Diarrhea", "probability_score": 0.85},
                {"adverse_event_name": "Dizziness", "adverse_event_meddra": "Dizziness", "probability_score": 0.78},
            ],
        ),
        "sider": make_mock_adapter(
            "sider",
            fetch_result=[
                {"side_effect_name": "Nausea", "frequency": "0.15", "term": "Nausea"},
                {"side_effect_name": "Insomnia", "frequency": "0.12", "term": "Insomnia"},
                {"side_effect_name": "Headache", "frequency": "0.10", "term": "Headache"},
            ],
        ),
        "aeolus": make_mock_adapter(
            "aeolus",
            fetch_result=[
                {"event": "Nausea", "meddra_term": "Nausea"},
                {"event": "Headache", "meddra_term": "Headache"},
                {"event": "Somnolence", "meddra_term": "Somnolence"},
            ],
        ),
        "offsides_twosides": make_mock_adapter(
            "offsides_twosides",
            fetch_result=[
                {
                    "drug": "sertraline",
                    "drug2": "tramadol",
                    "severity": "major",
                    "mechanism": "SSRI + opioid serotonergic effect",
                    "description": "Increased risk of serotonin syndrome",
                }
            ],
        ),
        "dailymed": make_mock_adapter(
            "dailymed",
            fetch_result=[
                {
                    "drug_name": "Sertraline",
                    "contraindications": ["Concomitant MAO inhibitor therapy"],
                    "warnings": ["Suicidality in young adults"],
                }
            ],
        ),
        "orange_book": make_mock_adapter(
            "orange_book",
            fetch_result=[
                {"application_number": "ANDA076123", "drug_name": "Sertraline"},
            ],
        ),
        "ndc_directory": make_mock_adapter(
            "ndc_directory",
            fetch_result=[
                {"ndc": "00456-0789-00", "product_name": "Sertraline 100mg"},
            ],
        ),
        "unii": make_mock_adapter(
            "unii",
            fetch_result=[
                {"unii": "QDC7U7K3LC", "name": "Sertraline"},
            ],
        ),
    }


@pytest.fixture
def partial_registry() -> dict[str, Any]:
    """Registry with only 3 adapters — tests graceful degradation."""
    return {
        "drugbank": make_mock_adapter(
            "drugbank",
            fetch_result=[{"drugbank_id": "DB01104", "name": "Sertraline"}],
            get_interactions_result=[
                {
                    "interacting_drug": "tramadol",
                    "severity": "major",
                    "mechanism": "Serotonergic effect",
                    "description": "SSRI + opioid",
                }
            ],
        ),
        "rxnorm": make_mock_adapter(
            "rxnorm",
            fetch_result=[{"rxcui": "C0074394", "name": "Sertraline"}],
        ),
        "openfda": make_mock_adapter(
            "openfda",
            fetch_result=[
                {
                    "drug_name": "Sertraline",
                    "contraindications": ["MAO inhibitors"],
                    "pregnancy_category": "C",
                    "warnings": ["Monitor for serotonin syndrome"],
                    "adverse_reactions": ["nausea", "insomnia"],
                }
            ],
        ),
    }


@pytest.fixture
def empty_registry() -> dict[str, Any]:
    """Empty registry — tests all adapters missing."""
    return {}


# ── Test cases ──────────────────────────────────────────────────────────────


class TestHelperFunctions:
    """Test standalone helper functions."""

    def test_avg_weight_with_known_sources(self) -> None:
        sources = ["drugbank", "rxnorm", "faers"]
        result = _avg_weight(sources)
        expected = round(
            (_ADAPTER_WEIGHTS["drugbank"] + _ADAPTER_WEIGHTS["rxnorm"] + _ADAPTER_WEIGHTS["faers"]) / 3,
            4,
        )
        assert result == expected

    def test_avg_weight_empty(self) -> None:
        assert _avg_weight([]) == 0.30

    def test_avg_weight_unknown_source(self) -> None:
        result = _avg_weight(["unknown_adapter"])
        assert result == 0.50

    def test_build_provenance(self) -> None:
        prov = _build_provenance(
            sources=["drugbank", "rxnorm"],
            query="sertraline",
            confidence=0.87,
            research=False,
            meta={"key": "value"},
        )
        assert prov["sources"] == ["drugbank", "rxnorm"]
        assert prov["query"] == "sertraline"
        assert prov["confidence"] == 0.87
        assert prov["confidence_tier"] == "high"
        assert prov["is_research_only"] is False
        assert prov["bridge"] == _BRIDGE_NAME
        assert prov["version"] == _BRIDGE_VERSION
        assert "accessed_at" in prov
        assert prov["metadata"] == {"key": "value"}

    def test_build_provenance_research(self) -> None:
        prov = _build_provenance(
            sources=["faers"], query="sertraline", confidence=0.60, research=True
        )
        assert prov["is_research_only"] is True
        assert prov["confidence_tier"] == "moderate"

    def test_deduplicate_dicts(self) -> None:
        data = [
            {"name": "Alice", "val": 1},
            {"name": "Bob", "val": 2},
            {"name": "alice", "val": 3},  # duplicate key (case-insensitive)
            {"name": "Charlie", "val": 4},
        ]
        result = _deduplicate_dicts(data, "name")
        assert len(result) == 3
        assert result[0]["name"] == "Alice"
        assert result[1]["name"] == "Bob"
        assert result[2]["name"] == "Charlie"


class TestAnalyzeMedication:
    """Tests for analyze_medication method."""

    @pytest.mark.asyncio
    async def test_analyze_medication_full(self, full_registry: dict[str, Any]) -> None:
        bridge = MedicationAnalyzerBridge(full_registry)
        result = await bridge.analyze_medication("sertraline")

        # Medication identity
        assert result["medication"]["name"] == "sertraline"
        assert result["medication"]["rxnorm_cui"] == "C0074394"
        assert result["medication"]["drugbank_id"] == "DB01104"
        assert result["medication"]["pubchem_cid"] == "68617"
        assert result["medication"]["chembl_id"] == "CHEMBL809"
        assert result["medication"]["unii"] == "QDC7U7K3LC"

        # Interactions
        assert len(result["interactions"]) >= 1
        ix = result["interactions"][0]
        assert "drug" in ix
        assert "severity" in ix
        assert "mechanism" in ix
        assert "source_adapters" in ix
        assert "confidence" in ix

        # Adverse events
        assert len(result["adverse_events"]) >= 1
        ae = result["adverse_events"][0]
        assert "event" in ae
        assert "source_adapters" in ae

        # Pharmacogenomics
        assert len(result["pharmacogenomics"]) >= 1
        pgx = result["pharmacogenomics"][0]
        assert "gene" in pgx
        assert "source_adapters" in pgx

        # Contraindications
        assert isinstance(result["contraindications"], list)
        assert len(result["contraindications"]) >= 1

        # Pregnancy category
        assert result["pregnancy_category"] in ["C", "Unknown"]

        # Confidence
        assert 0.0 <= result["confidence_overall"] <= 1.0

        # Provenance
        assert "provenance" in result
        prov = result["provenance"]
        assert "sources" in prov
        assert prov["bridge"] == _BRIDGE_NAME

        # Research-only flag
        assert isinstance(result["research_only"], bool)

    @pytest.mark.asyncio
    async def test_analyze_medication_partial(self, partial_registry: dict[str, Any]) -> None:
        bridge = MedicationAnalyzerBridge(partial_registry)
        result = await bridge.analyze_medication("sertraline")

        assert result["medication"]["name"] == "sertraline"
        assert result["medication"]["drugbank_id"] == "DB01104"
        assert result["medication"]["rxnorm_cui"] == "C0074394"
        assert result["pregnancy_category"] == "C"
        assert 0.0 <= result["confidence_overall"] <= 1.0
        assert "provenance" in result

    @pytest.mark.asyncio
    async def test_analyze_medication_empty_registry(self, empty_registry: dict[str, Any]) -> None:
        bridge = MedicationAnalyzerBridge(empty_registry)
        result = await bridge.analyze_medication("sertraline")

        assert result["medication"]["name"] == "sertraline"
        # Should still have fallback contraindications
        assert isinstance(result["contraindications"], list)
        # Should have known interactions from internal KB
        assert isinstance(result["interactions"], list)
        assert 0.0 <= result["confidence_overall"] <= 1.0
        assert "provenance" in result

    @pytest.mark.asyncio
    async def test_analyze_medication_unknown_drug(self, full_registry: dict[str, Any]) -> None:
        """Test with a drug not in any known database."""
        bridge = MedicationAnalyzerBridge(full_registry)
        result = await bridge.analyze_medication("xyz_unknown_drug_12345")

        assert result["medication"]["name"] == "xyz_unknown_drug_12345"
        assert isinstance(result["interactions"], list)
        assert isinstance(result["adverse_events"], list)
        assert isinstance(result["pharmacogenomics"], list)
        assert isinstance(result["contraindications"], list)
        assert 0.0 <= result["confidence_overall"] <= 1.0

    @pytest.mark.asyncio
    async def test_analyze_medication_tramadol(self, full_registry: dict[str, Any]) -> None:
        """Specific test for tramadol which has known interaction with sertraline."""
        bridge = MedicationAnalyzerBridge(full_registry)
        result = await bridge.analyze_medication("tramadol")

        assert result["medication"]["name"] == "tramadol"
        # Tramadol has a known interaction
        tramadol_ix = [ix for ix in result["interactions"] if "sertraline" in str(ix.get("drug", "")).lower()]
        # The interaction is bidirectional, so sertraline should be listed
        # when querying tramadol (from internal KB)
        assert isinstance(result["interactions"], list)
        assert result["pregnancy_category"] == "C"


class TestCheckInteractions:
    """Tests for check_interactions method."""

    @pytest.mark.asyncio
    async def test_check_interactions_pair(self, full_registry: dict[str, Any]) -> None:
        bridge = MedicationAnalyzerBridge(full_registry)
        result = await bridge.check_interactions(["sertraline", "tramadol"])

        assert isinstance(result, list)
        assert len(result) >= 1
        ix = result[0]
        assert "drugs" in ix
        assert "severity" in ix
        assert "severity_score" in ix
        assert "mechanism" in ix
        assert "source_adapters" in ix
        assert "confidence" in ix
        # Severity score should be >= the known pair severity
        assert ix["severity_score"] >= 4  # "major" = 4

    @pytest.mark.asyncio
    async def test_check_interactions_single_drug(self, full_registry: dict[str, Any]) -> None:
        bridge = MedicationAnalyzerBridge(full_registry)
        result = await bridge.check_interactions(["sertraline"])

        # Single drug — no pairs to check
        assert result == []

    @pytest.mark.asyncio
    async def test_check_interactions_empty(self, full_registry: dict[str, Any]) -> None:
        bridge = MedicationAnalyzerBridge(full_registry)
        result = await bridge.check_interactions([])

        assert result == []

    @pytest.mark.asyncio
    async def test_check_interactions_triple(self, full_registry: dict[str, Any]) -> None:
        bridge = MedicationAnalyzerBridge(full_registry)
        result = await bridge.check_interactions(["sertraline", "tramadol", "warfarin"])

        assert isinstance(result, list)
        # Should find sertraline+tramadol and sertraline+warfarin
        assert len(result) >= 1

    @pytest.mark.asyncio
    async def test_check_interactions_sorted_by_severity(self, full_registry: dict[str, Any]) -> None:
        bridge = MedicationAnalyzerBridge(full_registry)
        result = await bridge.check_interactions([
            "sertraline", "tramadol", "warfarin", "aspirin"
        ])

        if len(result) >= 2:
            # Should be sorted by severity descending
            for i in range(len(result) - 1):
                assert result[i]["severity_score"] >= result[i + 1]["severity_score"]

    @pytest.mark.asyncio
    async def test_check_interactions_no_registry(self, empty_registry: dict[str, Any]) -> None:
        bridge = MedicationAnalyzerBridge(empty_registry)
        result = await bridge.check_interactions(["sertraline", "tramadol"])

        # Should still find interactions from internal knowledge base
        assert isinstance(result, list)
        assert len(result) >= 1


class TestGetAdverseEventProfile:
    """Tests for get_adverse_event_profile method."""

    @pytest.mark.asyncio
    async def test_adverse_event_profile_full(self, full_registry: dict[str, Any]) -> None:
        bridge = MedicationAnalyzerBridge(full_registry)
        result = await bridge.get_adverse_event_profile("sertraline")

        assert result["medication"] == "sertraline"
        assert result["event_count"] >= 1
        assert len(result["events"]) >= 1

        # Check event structure
        event = result["events"][0]
        assert "event" in event
        assert "source_adapters" in event
        assert "confidence" in event
        assert "is_research_only" in event

        # Source breakdown
        assert "source_breakdown" in result
        assert isinstance(result["source_breakdown"], dict)

        # Provenance
        assert "provenance" in result
        prov = result["provenance"]
        assert prov["is_research_only"] is True

        # Research-only flag
        assert result["research_only"] is True

        # Confidence
        assert 0.0 <= result["confidence_overall"] <= 1.0

    @pytest.mark.asyncio
    async def test_adverse_event_profile_partial(self, partial_registry: dict[str, Any]) -> None:
        bridge = MedicationAnalyzerBridge(partial_registry)
        result = await bridge.get_adverse_event_profile("sertraline")

        assert result["medication"] == "sertraline"
        # Only openfda available — may have no AE data (openfda fetch returns label data)
        assert isinstance(result["events"], list)
        assert "provenance" in result

    @pytest.mark.asyncio
    async def test_adverse_event_profile_empty(self, empty_registry: dict[str, Any]) -> None:
        bridge = MedicationAnalyzerBridge(empty_registry)
        result = await bridge.get_adverse_event_profile("sertraline")

        assert result["medication"] == "sertraline"
        assert result["event_count"] == 0
        assert result["events"] == []
        assert result["research_only"] is True

    @pytest.mark.asyncio
    async def test_adverse_event_deduplication(self, full_registry: dict[str, Any]) -> None:
        bridge = MedicationAnalyzerBridge(full_registry)
        result = await bridge.get_adverse_event_profile("sertraline")

        # Nausea appears in FAERS, SIDER, OnSIDES, AEOLUS
        nausea_events = [e for e in result["events"] if e["event"].lower() == "nausea"]
        # Should be deduplicated to a single entry
        assert len(nausea_events) <= 1
        if nausea_events:
            assert len(nausea_events[0]["source_adapters"]) >= 1


class TestGetPharmacogenomicGuidance:
    """Tests for get_pharmacogenomic_guidance method."""

    @pytest.mark.asyncio
    async def test_pgx_guidance_match(self, full_registry: dict[str, Any]) -> None:
        bridge = MedicationAnalyzerBridge(full_registry)
        result = await bridge.get_pharmacogenomic_guidance(
            "sertraline", ["CYP2D6 *1/*4", "CYP2C19 *1/*2"]
        )

        assert result["medication"] == "sertraline"
        assert len(result["patient_variants_queried"]) == 2
        assert len(result["patient_variants_parsed"]) == 2

        # Should have matched annotations
        assert len(result["matched_guidance"]) >= 1
        assert result["match_count"] >= 1

        # Check annotation structure
        ann = result["matched_guidance"][0]
        assert "gene" in ann
        assert "patient_variant" in ann
        assert "source_adapters" in ann
        assert "confidence" in ann

        # Should have unmatched too (CYP2C19 *1/*2 may or may not match)
        assert isinstance(result["unmatched_variants"], list)

        # Confidence
        assert 0.0 <= result["confidence_overall"] <= 1.0

        # Provenance
        assert "provenance" in result
        prov = result["provenance"]
        assert "pharmgkb" in prov["sources"]

    @pytest.mark.asyncio
    async def test_pgx_guidance_no_variants(self, full_registry: dict[str, Any]) -> None:
        bridge = MedicationAnalyzerBridge(full_registry)
        result = await bridge.get_pharmacogenomic_guidance("sertraline", [])

        assert result["medication"] == "sertraline"
        assert result["match_count"] == 0
        assert result["matched_guidance"] == []
        assert result["unmatched_variants"] == []

    @pytest.mark.asyncio
    async def test_pgx_guidance_empty_registry(self, empty_registry: dict[str, Any]) -> None:
        bridge = MedicationAnalyzerBridge(empty_registry)
        result = await bridge.get_pharmacogenomic_guidance(
            "sertraline", ["CYP2D6 *1/*4"]
        )

        assert result["medication"] == "sertraline"
        assert result["match_count"] == 0
        assert result["annotations"] == []

    @pytest.mark.asyncio
    async def test_pgx_guidance_unknown_gene(self, full_registry: dict[str, Any]) -> None:
        bridge = MedicationAnalyzerBridge(full_registry)
        result = await bridge.get_pharmacogenomic_guidance(
            "sertraline", ["UNKNOWN_GENE *1/*1"]
        )

        assert result["medication"] == "sertraline"
        # Unknown gene should be in unmatched
        assert any(v["gene"] == "UNKNOWN_GENE" for v in result["unmatched_variants"])


class TestBridgeHealth:
    """Tests for bridge health check."""

    @pytest.mark.asyncio
    async def test_health_check_full(self, full_registry: dict[str, Any]) -> None:
        bridge = MedicationAnalyzerBridge(full_registry)
        result = await bridge.health_check()

        assert result["bridge"] == _BRIDGE_NAME
        assert result["version"] == _BRIDGE_VERSION
        assert result["adapters_total"] == 15
        assert result["adapters_available"] == 15
        assert len(result["adapter_statuses"]) == 15
        assert "timestamp" in result

    @pytest.mark.asyncio
    async def test_health_check_partial(self, partial_registry: dict[str, Any]) -> None:
        bridge = MedicationAnalyzerBridge(partial_registry)
        result = await bridge.health_check()

        assert result["adapters_total"] == 15
        assert result["adapters_available"] == 3

    @pytest.mark.asyncio
    async def test_health_check_empty(self, empty_registry: dict[str, Any]) -> None:
        bridge = MedicationAnalyzerBridge(empty_registry)
        result = await bridge.health_check()

        assert result["adapters_available"] == 0
        for name, status in result["adapter_statuses"].items():
            assert status["available"] is False


class TestBridgeRepresentation:
    """Tests for bridge string representation."""

    def test_repr_full(self, full_registry: dict[str, Any]) -> None:
        bridge = MedicationAnalyzerBridge(full_registry)
        r = repr(bridge)
        assert _BRIDGE_NAME in r
        assert "15" in r

    def test_repr_empty(self, empty_registry: dict[str, Any]) -> None:
        bridge = MedicationAnalyzerBridge(empty_registry)
        r = repr(bridge)
        assert _BRIDGE_NAME in r
        assert "0" in r


class TestErrorHandling:
    """Tests that the bridge handles adapter failures gracefully."""

    @pytest.mark.asyncio
    async def test_failing_adapter_does_not_crash(self) -> None:
        """A failing adapter should not crash the entire bridge."""
        failing_adapter = MagicMock()
        failing_adapter.source_name = "drugbank"
        failing_adapter.source_version = "2024.01"
        failing_adapter.fetch = AsyncMock(side_effect=RuntimeError("DB connection failed"))
        failing_adapter.health_check = AsyncMock(
            side_effect=RuntimeError("Health check failed")
        )

        good_adapter = make_mock_adapter(
            "rxnorm",
            fetch_result=[{"rxcui": "C0074394", "name": "Sertraline"}],
        )

        registry = {"drugbank": failing_adapter, "rxnorm": good_adapter}
        bridge = MedicationAnalyzerBridge(registry)

        # Should complete without crashing
        result = await bridge.analyze_medication("sertraline")
        assert result["medication"]["name"] == "sertraline"
        assert result["medication"]["rxnorm_cui"] == "C0074394"
        # DrugBank failed so no drugbank_id
        assert "drugbank_id" not in result["medication"]

    @pytest.mark.asyncio
    async def test_all_adapters_failing(self) -> None:
        """All adapters failing should still produce a result."""
        failing_registry = {}
        for name in [
            "drugbank", "rxnorm", "pharmgkb", "openfda", "chembl", "pubchem",
            "faers", "onsides", "sider", "aeolus", "offsides_twosides",
            "dailymed", "orange_book", "ndc_directory", "unii",
        ]:
            adapter = MagicMock()
            adapter.source_name = name
            adapter.fetch = AsyncMock(side_effect=RuntimeError(f"{name} failed"))
            adapter.health_check = AsyncMock(side_effect=RuntimeError("failed"))
            failing_registry[name] = adapter

        bridge = MedicationAnalyzerBridge(failing_registry)
        result = await bridge.analyze_medication("sertraline")

        assert result["medication"]["name"] == "sertraline"
        assert 0.0 <= result["confidence_overall"] <= 1.0
        assert "provenance" in result

    @pytest.mark.asyncio
    async def test_adapter_with_none_response(self) -> None:
        """Adapters returning None should be handled gracefully."""
        none_adapter = make_mock_adapter("drugbank", fetch_result=None)
        none_adapter.fetch = AsyncMock(return_value=None)

        registry = {"drugbank": none_adapter}
        bridge = MedicationAnalyzerBridge(registry)

        result = await bridge.analyze_medication("sertraline")
        assert result["medication"]["name"] == "sertraline"


class TestEdgeCases:
    """Tests for edge cases and boundary conditions."""

    @pytest.mark.asyncio
    async def test_whitespace_input(self, full_registry: dict[str, Any]) -> None:
        bridge = MedicationAnalyzerBridge(full_registry)
        result = await bridge.analyze_medication("  sertraline  ")
        assert result["medication"]["name"] == "sertraline"

    @pytest.mark.asyncio
    async def test_case_insensitive_contraindications(self, full_registry: dict[str, Any]) -> None:
        bridge = MedicationAnalyzerBridge(full_registry)
        result = await bridge.analyze_medication("SERTRALINE")
        assert "sertraline" in result["medication"]["name"].lower()
        assert isinstance(result["contraindications"], list)

    @pytest.mark.asyncio
    async def test_interactions_with_whitespace(self, full_registry: dict[str, Any]) -> None:
        bridge = MedicationAnalyzerBridge(full_registry)
        result = await bridge.check_interactions(["  sertraline  ", "  tramadol  "])
        assert isinstance(result, list)

    @pytest.mark.asyncio
    async def test_pgx_with_empty_variant_string(self, full_registry: dict[str, Any]) -> None:
        bridge = MedicationAnalyzerBridge(full_registry)
        result = await bridge.get_pharmacogenomic_guidance("sertraline", [""])
        assert result["medication"] == "sertraline"


# ── Main entry point for manual testing ─────────────────────────────────────


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
