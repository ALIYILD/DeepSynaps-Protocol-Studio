"""
test_deeptwin_integration.py — Tests for DeepTwin Integration Layer
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Comprehensive test suite for the DeepTwinBridge using fully mocked
bridge and synthesizer components. No external network calls.

Test categories:
    - Unit tests for helper functions
    - Bridge method tests with mocked dependencies
    - Hypothesis ranking tests
    - Treatment recommendation filtering tests
    - Timeline update tests
    - Report generation tests
    - Error handling and resilience tests

Run: pytest test_deeptwin_integration.py -v
"""

from __future__ import annotations

import asyncio
import sys
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# Insert the phase5 directory into the path so relative imports resolve
sys.path.insert(0, "/mnt/agents/output/phase5")

# Import the module under test — all external bridge imports are guarded
from deeptwin_integration import (
    DeepTwinBridge,
    EvidenceStore,
    _ACTIONABILITY_WEIGHTS,
    _build_provenance,
    _clamp,
    _confidence_to_plain_language,
    _extract_invasiveness,
    _is_teratogenic,
    _next_review_date,
    _now_iso,
    _parse_genetic_variant,
    _simplify_description,
    create_deeptwin_bridge,
    DT_VERSION,
    SCHEMA_VERSION,
)


# ============================================================================
# FIXTURES
# ============================================================================


@pytest.fixture
def mock_registry() -> MagicMock:
    """Minimal mock adapter registry."""
    reg = MagicMock()
    reg.get = MagicMock(return_value=None)
    return reg


@pytest.fixture
def mock_med_bridge() -> AsyncMock:
    """Mocked MedicationAnalyzerBridge."""
    bridge = AsyncMock()
    bridge.check_interactions = AsyncMock(return_value={
        "interactions": [
            {
                "drugs": ["sertraline", "clonazepam"],
                "severity": "mild",
                "description": "Additive CNS depression possible.",
                "confidence": 0.65,
                "provenance_source": "medication_bridge",
                "is_research_only": True,
            }
        ],
        "interaction_count": 1,
        "worst_severity": "mild",
        "provenance": {
            "sources": ["openfda", "pharmgkb"],
            "confidence": 0.75,
            "query": "sertraline + clonazepam",
        },
    })
    return bridge


@pytest.fixture
def mock_gen_bridge() -> AsyncMock:
    """Mocked GeneticAnalyzerBridge."""
    bridge = AsyncMock()
    bridge.get_gene_drug_guidance = AsyncMock(return_value={
        "gene": "COMT",
        "drug": "sertraline",
        "guidance": [
            {
                "gene": "COMT",
                "drug": "sertraline",
                "phenotype": "met/met",
                "implication": "Enhanced prefrontal signaling",
                "recommendation": "Standard SSRI dosing; consider tDCS augmentation",
                "classification": "moderate",
                "evidence_level": "B",
                "guideline_source": "CPIC",
                "pmids": ["12345678"],
                "provenance_source": "pharmgkb",
                "is_research_only": True,
            }
        ],
        "guidance_count": 1,
        "provenance": {
            "sources": ["pharmgkb"],
            "confidence": 0.88,
            "query": "COMT:sertraline",
        },
    })
    return bridge


@pytest.fixture
def mock_qeeg_bridge() -> AsyncMock:
    """Mocked QEEGAnalyzerBridge."""
    bridge = AsyncMock()
    bridge.assess_deviation_significance = AsyncMock(return_value={
        "assessments": [
            {"feature": "alpha_peak_hz", "z_score": -1.2, "tier": "mild"},
            {"feature": "theta_beta_ratio", "z_score": 2.8, "tier": "moderate"},
        ],
        "overall": {"tier": "moderate", "max_abs_z": 2.8, "features": 2},
        "provenance": {
            "sources": ["chbmp"],
            "confidence": 0.82,
            "query": "assess 2 z-scores",
        },
    })
    return bridge


@pytest.fixture
def mock_mri_bridge() -> AsyncMock:
    """Mocked MRIAnalyzerBridge."""
    bridge = AsyncMock()
    bridge.lookup_region = AsyncMock(return_value={
        "query_coords": [-38.0, 22.0, 42.0],
        "region": {
            "region_id": "Frontal_Sup_L",
            "region_name": "Superior frontal gyrus (L)",
            "hemisphere": "left",
            "lobe": "frontal",
        },
        "provenance": {
            "sources": ["mni_atlas"],
            "confidence": 0.92,
            "query": "MNI(-38.0,22.0,42.0)",
        },
    })
    return bridge


@pytest.fixture
def mock_synthesizer() -> AsyncMock:
    """Mocked MultimodalSynthesizer."""
    synth = AsyncMock()
    mock_response = MagicMock()
    mock_response.dict = MagicMock(return_value={
        "synthesis_id": "test-synth-001",
        "modalities_used": ["medication", "neuroimaging", "biomarker"],
        "aggregate_confidence": 0.78,
        "uncertainty_budget": {"medication": 0.15, "neuroimaging": 0.20, "biomarker": 0.12},
        "research_only": True,
        "safety_check_passed": True,
        "safety_violations": [],
        "conflict_flags": [],
        "sources": [
            {"database": "RxNorm", "record_count": 5},
            {"database": "Allen_Brain_Atlas", "record_count": 3},
        ],
    })
    mock_response.model_dump = mock_response.dict
    synth.synthesize = AsyncMock(return_value=mock_response)
    return synth


@pytest.fixture
def deep_twin(
    mock_registry: MagicMock,
    mock_med_bridge: AsyncMock,
    mock_gen_bridge: AsyncMock,
    mock_qeeg_bridge: AsyncMock,
    mock_mri_bridge: AsyncMock,
    mock_synthesizer: AsyncMock,
) -> DeepTwinBridge:
    """Fully wired DeepTwinBridge with all mocked dependencies."""
    store = EvidenceStore(db_path=":memory:")
    return DeepTwinBridge(
        registry=mock_registry,
        synthesizer=mock_synthesizer,
        med_bridge=mock_med_bridge,
        gen_bridge=mock_gen_bridge,
        qeeg_bridge=mock_qeeg_bridge,
        mri_bridge=mock_mri_bridge,
        evidence_store=store,
    )


# ============================================================================
# HELPER FUNCTION TESTS
# ============================================================================


class TestHelpers:
    """Tests for module-level helper functions."""

    def test_now_iso_format(self) -> None:
        ts = _now_iso()
        assert ts.endswith("Z")
        # Should be parseable as ISO datetime
        dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        assert dt.tzinfo is not None

    def test_next_review_date_future(self) -> None:
        nrd = _next_review_date()
        now = datetime.now(timezone.utc)
        parsed = datetime.fromisoformat(nrd.replace("Z", "+00:00"))
        assert parsed > now
        delta = parsed - now
        assert 28 <= delta.days <= 31

    def test_clamp(self) -> None:
        assert _clamp(1.5) == 1.0
        assert _clamp(-0.5) == 0.0
        assert _clamp(0.7) == 0.7
        assert _clamp(0.7, lo=0.5, hi=0.9) == 0.7
        assert _clamp(0.3, lo=0.5, hi=0.9) == 0.5

    def test_parse_genetic_variant(self) -> None:
        gene, alleles = _parse_genetic_variant("rs4680 COMT Val/Met")
        assert gene == "COMT"
        assert alleles == ["Val", "Met"]

    def test_parse_genetic_variant_no_alleles(self) -> None:
        gene, alleles = _parse_genetic_variant("rs6265 BDNF")
        assert gene == "BDNF"
        assert alleles == []

    def test_is_teratogenic(self) -> None:
        assert _is_teratogenic("tDCS F3-F4 2mA") is True
        assert _is_teratogenic("rTMS 10Hz") is True
        assert _is_teratogenic("Exercise 3x/week") is False
        assert _is_teratogenic("SSRI dose adjustment") is False

    def test_extract_invasiveness(self) -> None:
        assert _extract_invasiveness("tDCS F3-F4") == 2
        assert _extract_invasiveness("rTMS 10Hz") == 2
        assert _extract_invasiveness("exercise 3x/week") == 1
        assert _extract_invasiveness("neurofeedback") == 1

    def test_simplify_description_short(self) -> None:
        short = "Short text."
        assert _simplify_description(short) == short

    def test_simplify_description_long(self) -> None:
        long_text = "A" * 100 + ". " + "B" * 100 + "."
        result = _simplify_description(long_text)
        assert len(result) <= 220

    def test_confidence_to_plain_language(self) -> None:
        assert "High" in _confidence_to_plain_language(0.9)
        assert "Moderate" in _confidence_to_plain_language(0.75)
        assert "Moderate-low" in _confidence_to_plain_language(0.6)
        assert "Lower" in _confidence_to_plain_language(0.3)

    def test_build_provenance(self) -> None:
        p = _build_provenance(
            sources=["pharmgkb"],
            query="test_query",
            confidence=0.95,
            meta={"key": "value"},
        )
        assert p["sources"] == ["pharmgkb"]
        assert p["confidence"] == 0.95
        assert p["confidence_tier"] == "high"
        assert p["is_research_only"] is True
        assert p["metadata"] == {"key": "value"}
        assert p["version"] == DT_VERSION
        assert p["schema_version"] == SCHEMA_VERSION


# ============================================================================
# EVIDENCE STORE TESTS
# ============================================================================


class TestEvidenceStore:
    """Tests for the EvidenceStore SQLite-backed persistence."""

    @pytest.mark.asyncio
    async def test_save_and_retrieve(self) -> None:
        store = EvidenceStore(":memory:")
        await store.save_intelligence("PT-001", {"data": "test"})
        data = await store.get_patient_data("PT-001")
        assert len(data) == 1
        assert data[0]["payload"]["data"] == "test"

    @pytest.mark.asyncio
    async def test_timeline_append(self) -> None:
        store = EvidenceStore(":memory:")
        event = {"date": "2026-05-01", "event": "Test event", "findings": "None"}
        await store.append_timeline_event("PT-001", event)
        timeline = await store.get_timeline("PT-001")
        assert len(timeline) == 1
        assert timeline[0]["event"] == "Test event"

    @pytest.mark.asyncio
    async def test_timeline_multiple_events(self) -> None:
        store = EvidenceStore(":memory:")
        for i in range(3):
            await store.append_timeline_event("PT-002", {"event": f"evt{i}"})
        timeline = await store.get_timeline("PT-002")
        assert len(timeline) == 3


# ============================================================================
# HYPOTHESIS RANKING TESTS
# ============================================================================


class TestHypothesisRanking:
    """Tests for hypothesis ranking algorithm."""

    def test_rank_by_actionability_basic(self, deep_twin: DeepTwinBridge) -> None:
        hypotheses = [
            {
                "title": "H1",
                "confidence": 0.9,
                "actionability": "HIGH",
                "supporting_evidence": [{}, {}, {}],
                "contraindications": [],
            },
            {
                "title": "H2",
                "confidence": 0.5,
                "actionability": "LOW",
                "supporting_evidence": [{}],
                "contraindications": [],
            },
        ]
        ranked = deep_twin.rank_hypotheses_by_actionability(hypotheses)
        assert len(ranked) == 2
        assert ranked[0]["rank"] == 1
        assert ranked[1]["rank"] == 2
        # H1 should score higher than H2
        assert ranked[0]["composite_score"] > ranked[1]["composite_score"]

    def test_rank_penalizes_contraindications(self, deep_twin: DeepTwinBridge) -> None:
        hypotheses = [
            {
                "title": "Safe",
                "confidence": 0.8,
                "actionability": "HIGH",
                "supporting_evidence": [{}, {}],
                "contraindications": [],
            },
            {
                "title": "Risky",
                "confidence": 0.8,
                "actionability": "HIGH",
                "supporting_evidence": [{}, {}],
                "contraindications": ["cardiovascular instability"],
            },
        ]
        ranked = deep_twin.rank_hypotheses_by_actionability(hypotheses)
        assert ranked[0]["title"] == "Safe"
        assert ranked[1]["title"] == "Risky"
        assert ranked[0]["composite_score"] > ranked[1]["composite_score"]

    def test_rank_single_hypothesis(self, deep_twin: DeepTwinBridge) -> None:
        hypotheses = [
            {
                "title": "Only",
                "confidence": 0.6,
                "actionability": "MEDIUM",
                "supporting_evidence": [{}],
                "contraindications": [],
            }
        ]
        ranked = deep_twin.rank_hypotheses_by_actionability(hypotheses)
        assert len(ranked) == 1
        assert ranked[0]["rank"] == 1
        assert 0.0 < ranked[0]["composite_score"] <= 1.0

    def test_rank_empty_list(self, deep_twin: DeepTwinBridge) -> None:
        ranked = deep_twin.rank_hypotheses_by_actionability([])
        assert ranked == []


# ============================================================================
# TREATMENT RECOMMENDATION TESTS
# ============================================================================


class TestTreatmentRecommendations:
    """Tests for treatment recommendation filtering."""

    def test_basic_filtering(self, deep_twin: DeepTwinBridge) -> None:
        hypotheses = [
            {
                "rank": 1,
                "title": "Exercise",
                "confidence": 0.75,
                "composite_score": 0.8,
                "actionability": "MEDIUM",
                "recommended_action": "Exercise 3x/week",
                "supporting_evidence": [{}],
                "contraindications": [],
            },
            {
                "rank": 2,
                "title": "tDCS",
                "confidence": 0.8,
                "composite_score": 0.7,
                "actionability": "HIGH",
                "recommended_action": "tDCS F3-F4 2mA",
                "supporting_evidence": [{}, {}],
                "contraindications": [],
            },
        ]
        constraints = {"age": 35, "pregnancy": False, "comorbidities": []}
        recs = deep_twin.generate_treatment_recommendations(hypotheses, constraints)
        assert len(recs) == 2

    def test_pregnancy_filter(self, deep_twin: DeepTwinBridge) -> None:
        hypotheses = [
            {
                "rank": 1,
                "title": "tDCS",
                "confidence": 0.8,
                "composite_score": 0.7,
                "actionability": "HIGH",
                "recommended_action": "tDCS F3-F4 2mA",
                "supporting_evidence": [{}],
                "contraindications": [],
            },
        ]
        constraints = {"age": 30, "pregnancy": True, "comorbidities": []}
        recs = deep_twin.generate_treatment_recommendations(hypotheses, constraints)
        assert len(recs) == 0  # tDCS filtered out for pregnancy

    def test_comorbidity_filter(self, deep_twin: DeepTwinBridge) -> None:
        hypotheses = [
            {
                "rank": 1,
                "title": "Exercise",
                "confidence": 0.7,
                "composite_score": 0.6,
                "actionability": "MEDIUM",
                "recommended_action": "Exercise 3x/week",
                "supporting_evidence": [{}],
                "contraindications": ["cardiovascular instability"],
            },
        ]
        constraints = {"age": 50, "pregnancy": False, "comorbidities": ["cardiovascular instability"]}
        recs = deep_twin.generate_treatment_recommendations(hypotheses, constraints)
        assert len(recs) == 0

    def test_age_filter_child(self, deep_twin: DeepTwinBridge) -> None:
        hypotheses = [
            {
                "rank": 1,
                "title": "rTMS",
                "confidence": 0.8,
                "composite_score": 0.7,
                "actionability": "HIGH",
                "recommended_action": "rTMS 10Hz",
                "supporting_evidence": [{}],
                "contraindications": [],
            },
        ]
        constraints = {"age": 8, "pregnancy": False, "comorbidities": []}
        recs = deep_twin.generate_treatment_recommendations(hypotheses, constraints)
        assert len(recs) == 0  # rTMS excluded for children < 12

    def test_no_action_skipped(self, deep_twin: DeepTwinBridge) -> None:
        hypotheses = [
            {
                "rank": 1,
                "title": "No action",
                "confidence": 0.5,
                "composite_score": 0.3,
                "actionability": "LOW",
                "recommended_action": "",
                "supporting_evidence": [],
                "contraindications": [],
            },
        ]
        recs = deep_twin.generate_treatment_recommendations(hypotheses, {"age": 40})
        assert len(recs) == 0

    def test_research_only_flag(self, deep_twin: DeepTwinBridge) -> None:
        hypotheses = [
            {
                "rank": 1,
                "title": "Test",
                "confidence": 0.7,
                "composite_score": 0.6,
                "actionability": "MEDIUM",
                "recommended_action": "Something safe",
                "supporting_evidence": [{"source": "test"}],
                "contraindications": [],
            },
        ]
        recs = deep_twin.generate_treatment_recommendations(hypotheses, {"age": 40})
        assert len(recs) == 1
        assert recs[0]["research_only"] is True
        assert "provenance" in recs[0]


# ============================================================================
# INTEGRATION / BRIDGE TESTS
# ============================================================================


class TestGeneratePatientIntelligence:
    """Tests for the main generate_patient_intelligence method."""

    @pytest.mark.asyncio
    async def test_full_pipeline(self, deep_twin: DeepTwinBridge) -> None:
        result = await deep_twin.generate_patient_intelligence("PT-001")

        assert result["patient_id"] == "PT-001"
        assert "generated_at" in result
        assert "patient_summary" in result
        assert result["patient_summary"]["diagnoses"]  # non-empty default
        assert result["patient_summary"]["medications"]  # non-empty default
        assert "ranked_hypotheses" in result
        assert len(result["ranked_hypotheses"]) > 0
        # Check hypothesis structure
        top = result["ranked_hypotheses"][0]
        assert "rank" in top
        assert "title" in top
        assert "composite_score" in top
        assert "drug_alerts" in result
        assert "clinical_timeline" in result
        assert "evidence_summary" in result
        assert "overall_confidence" in result
        assert 0.0 <= result["overall_confidence"] <= 1.0
        assert "next_review_date" in result
        assert result["research_only"] is True
        assert result["schema_version"] == SCHEMA_VERSION
        assert "caveats" in result
        assert "provenance" in result

    @pytest.mark.asyncio
    async def test_persistence(self, deep_twin: DeepTwinBridge) -> None:
        await deep_twin.generate_patient_intelligence("PT-002")
        stored = await deep_twin.evidence_store.get_patient_data("PT-002")
        assert len(stored) > 0

    @pytest.mark.asyncio
    async def test_bridge_failure_resilience(self, mock_registry: MagicMock, mock_synthesizer: AsyncMock) -> None:
        """Test that one failing bridge doesn't crash the whole pipeline."""
        failing_med = AsyncMock()
        failing_med.check_interactions = AsyncMock(side_effect=RuntimeError("DB timeout"))

        good_gen = AsyncMock()
        good_gen.get_gene_drug_guidance = AsyncMock(return_value={
            "guidance": [],
            "provenance": {"sources": ["pharmgkb"], "confidence": 0.8},
        })

        bridge = DeepTwinBridge(
            registry=mock_registry,
            synthesizer=mock_synthesizer,
            med_bridge=failing_med,
            gen_bridge=good_gen,
            qeeg_bridge=None,
            mri_bridge=None,
        )

        result = await bridge.generate_patient_intelligence("PT-003")

        # Should still succeed despite med bridge failure
        assert result["patient_id"] == "PT-003"
        assert "ranked_hypotheses" in result
        assert result["research_only"] is True
        # Overall confidence should be lower but still valid
        assert 0.0 <= result["overall_confidence"] <= 1.0

    @pytest.mark.asyncio
    async def test_no_bridges_available(self, mock_registry: MagicMock) -> None:
        """Test graceful degradation when no bridges are available."""
        bridge = DeepTwinBridge(
            registry=mock_registry,
            synthesizer=None,
            med_bridge=None,
            gen_bridge=None,
            qeeg_bridge=None,
            mri_bridge=None,
        )

        result = await bridge.generate_patient_intelligence("PT-004")

        assert result["patient_id"] == "PT-004"
        assert "ranked_hypotheses" in result
        # Should still have default hypotheses built from genetic variants
        assert len(result["ranked_hypotheses"]) >= 2
        assert result["research_only"] is True


class TestTimelineUpdate:
    """Tests for update_patient_timeline."""

    @pytest.mark.asyncio
    async def test_append_and_no_resynthesis(self, deep_twin: DeepTwinBridge) -> None:
        event = {
            "date": "2026-05-20",
            "event": "Routine check-in note",
            "findings": "Patient reports feeling better",
            "type": "note",
        }
        result = await deep_twin.update_patient_timeline("PT-005", event)
        assert result["patient_id"] == "PT-005"
        assert result["re_synthesis_triggered"] is False
        assert result["timeline_length"] > 0

    @pytest.mark.asyncio
    async def test_significant_event_triggers_resynthesis(self, deep_twin: DeepTwinBridge) -> None:
        event = {
            "date": "2026-05-20",
            "event": "PHQ-9 reassessment",
            "findings": "PHQ-9 dropped to 8",
            "type": "assessment",
        }
        result = await deep_twin.update_patient_timeline("PT-006", event)
        assert result["re_synthesis_triggered"] is True
        assert result["re_synthesis_result"] is not None


class TestDeepTwinReport:
    """Tests for get_deepTwin_report."""

    @pytest.mark.asyncio
    async def test_full_report(self, deep_twin: DeepTwinBridge) -> None:
        report = await deep_twin.get_deepTwin_report("PT-007", "full")
        assert report["report_type"] == "clinician_full"
        assert report["patient_id"] == "PT-007"
        assert "ranked_hypotheses" in report
        assert "drug_alerts" in report
        assert "disclaimer" in report
        assert report["research_only"] is True

    @pytest.mark.asyncio
    async def test_simplified_report(self, deep_twin: DeepTwinBridge) -> None:
        report = await deep_twin.get_deepTwin_report("PT-008", "simplified")
        assert report["report_type"] == "patient_simplified"
        assert report["patient_id"] == "PT-008"
        assert "insights_to_discuss" in report
        assert "medication_notes" in report
        assert "disclaimer" in report
        assert report["research_only"] is True

    @pytest.mark.asyncio
    async def test_default_format_is_full(self, deep_twin: DeepTwinBridge) -> None:
        report = await deep_twin.get_deepTwin_report("PT-009")
        assert report["report_type"] == "clinician_full"


# ============================================================================
# FACTORY TEST
# ============================================================================


class TestFactory:
    """Tests for create_deeptwin_bridge factory."""

    @pytest.mark.asyncio
    async def test_factory_creates_bridge(self, mock_registry: MagicMock) -> None:
        bridge = await create_deeptwin_bridge(mock_registry)
        assert isinstance(bridge, DeepTwinBridge)
        assert bridge.registry is mock_registry


# ============================================================================
# HYPOTHESIS CONTENT TESTS
# ============================================================================


class TestHypothesisContent:
    """Verify hypothesis generation produces expected clinical content."""

    def test_comt_hypothesis_present(self, deep_twin: DeepTwinBridge) -> None:
        hypotheses = deep_twin._build_hypotheses(
            {}, ["rs4680 COMT Val/Met"], ["sertraline"], ["MDD"]
        )
        titles = [h["title"] for h in hypotheses]
        assert any("COMT" in t for t in titles)

    def test_bdnf_hypothesis_present(self, deep_twin: DeepTwinBridge) -> None:
        hypotheses = deep_twin._build_hypotheses(
            {}, ["rs6265 BDNF Val/Met"], ["sertraline"], ["MDD"]
        )
        titles = [h["title"] for h in hypotheses]
        assert any("BDNF" in t for t in titles)

    def test_qeeg_hypothesis_with_data(self, deep_twin: DeepTwinBridge) -> None:
        bo = {
            "qeeg_assessment": {
                "assessments": [{"feature": "theta_beta_ratio", "z_score": 2.8}],
                "overall": {"tier": "moderate"},
            }
        }
        hypotheses = deep_twin._build_hypotheses(bo, [], ["med"], ["MDD"])
        titles = [h["title"] for h in hypotheses]
        assert any("Theta/Beta" in t or "theta/beta" in t.lower() for t in titles)

    def test_mri_hypothesis_with_data(self, deep_twin: DeepTwinBridge) -> None:
        bo = {
            "mri_region": {
                "region": {"region_id": "Frontal_Sup_L"},
            }
        }
        hypotheses = deep_twin._build_hypotheses(bo, [], ["med"], ["MDD"])
        titles = [h["title"] for h in hypotheses]
        assert any("DLPFC" in t or "rTMS" in t for t in titles)

    def test_genetic_guidance_hypothesis(self, deep_twin: DeepTwinBridge) -> None:
        bo = {
            "genetic_guidance": {
                "guidance": [{"gene": "CYP2C19"}],
            }
        }
        hypotheses = deep_twin._build_hypotheses(bo, [], ["sertraline"], ["MDD"])
        titles = [h["title"] for h in hypotheses]
        assert any("CYP2C19" in t or "SSRI" in t for t in titles)


# ============================================================================
# DRUG ALERT TESTS
# ============================================================================


class TestDrugAlerts:
    """Tests for drug alert generation."""

    def test_interaction_alert(self, deep_twin: DeepTwinBridge) -> None:
        bo = {
            "medication_interactions": {
                "interactions": [
                    {
                        "drugs": ["sertraline", "clonazepam"],
                        "severity": "moderate",
                        "description": "CNS depression risk",
                        "confidence": 0.70,
                        "provenance_source": "openfda",
                    }
                ]
            }
        }
        alerts = deep_twin._build_drug_alerts(bo, ["sertraline", "clonazepam"], ["rs4680 COMT"])
        assert len(alerts) > 0
        assert alerts[0]["severity"] == "MODERATE"

    def test_default_alert_when_no_interactions(self, deep_twin: DeepTwinBridge) -> None:
        bo = {"medication_interactions": {"interactions": []}}
        alerts = deep_twin._build_drug_alerts(
            bo, ["sertraline 50mg", "clonazepam 0.5mg"], ["rs4680 COMT"]
        )
        assert len(alerts) > 0

    def test_cyp2d6_alert(self, deep_twin: DeepTwinBridge) -> None:
        bo = {}
        alerts = deep_twin._build_drug_alerts(
            bo, ["CYP2D6 substrate drug"], ["rs4680 CYP2D6"]
        )
        # If medication contains CYP2D6 in name, should generate alert
        assert any("CYP2D6" in a.get("alert", "") for a in alerts)


# ============================================================================
# CONFIDENCE COMPUTATION TESTS
# ============================================================================


class TestConfidenceComputation:
    """Tests for overall confidence computation."""

    def test_full_confidence(self, deep_twin: DeepTwinBridge) -> None:
        bo = {
            "med": {
                "provenance": {"sources": ["rxnorm"], "confidence": 0.9}
            },
            "gen": {
                "provenance": {"sources": ["pharmgkb"], "confidence": 0.85}
            },
        }
        synth = {"aggregate_confidence": 0.8}
        hypotheses = [{"confidence": 0.82}]
        conf = deep_twin._compute_overall_confidence(bo, synth, hypotheses)
        assert 0.0 < conf <= 1.0

    def test_empty_inputs(self, deep_twin: DeepTwinBridge) -> None:
        conf = deep_twin._compute_overall_confidence({}, {}, [])
        assert conf == 0.5  # default

    def test_only_bridge_outputs(self, deep_twin: DeepTwinBridge) -> None:
        bo = {
            "med": {"provenance": {"sources": ["a"], "confidence": 0.7}},
        }
        # Empty synthesis dict adds 0.5 partial credit; trimmed mean of [0.5, 0.7] = 0.6
        conf = deep_twin._compute_overall_confidence(bo, {}, [])
        assert conf == 0.6


# ============================================================================
# EVIDENCE SUMMARY TESTS
# ============================================================================


class TestEvidenceSummary:
    """Tests for evidence summary computation."""

    def test_basic_summary(self, deep_twin: DeepTwinBridge) -> None:
        bo = {
            "med": {"provenance": {"sources": ["rxnorm", "openfda"], "confidence": 0.8}},
            "gen": {"provenance": {"sources": ["pharmgkb"], "confidence": 0.9}},
        }
        synth = {"sources": [{"database": "RxNorm", "record_count": 5}]}
        total, relevant, highest, warnings = deep_twin._build_evidence_summary(bo, synth)
        assert total >= 2
        assert relevant >= 2
        assert highest in {"pharmgkb", "rxnorm", "deeptwin"}
        assert warnings == 3

    def test_empty_summary(self, deep_twin: DeepTwinBridge) -> None:
        total, relevant, highest, warnings = deep_twin._build_evidence_summary({}, {})
        assert total == 0
        assert relevant == 0
        assert highest == "deeptwin"
        assert warnings == 3


# ============================================================================
# REPORT FORMATTER TESTS
# ============================================================================


class TestReportFormatters:
    """Tests for clinician and patient report formatting."""

    def test_clinician_report_structure(self, deep_twin: DeepTwinBridge) -> None:
        intel = {
            "patient_id": "PT-010",
            "generated_at": _now_iso(),
            "patient_summary": {"diagnoses": ["MDD"], "medications": ["sertraline"]},
            "ranked_hypotheses": [
                {"rank": 1, "title": "H1", "description": "Test." * 10, "confidence": 0.8,
                 "recommended_action": "Action", "actionability": "HIGH"}
            ],
            "drug_alerts": [],
            "clinical_timeline": [],
            "evidence_summary": {},
            "overall_confidence": 0.8,
            "next_review_date": _next_review_date(),
            "multimodal_synthesis": {},
            "caveats": [],
        }
        report = deep_twin._format_clinician_report(intel)
        assert report["report_type"] == "clinician_full"
        assert "ranked_hypotheses" in report
        assert "review_points" in report
        assert "disclaimer" in report

    def test_patient_report_simplifies(self, deep_twin: DeepTwinBridge) -> None:
        intel = {
            "patient_id": "PT-011",
            "generated_at": _now_iso(),
            "patient_summary": {},
            "ranked_hypotheses": [
                {"rank": 1, "title": "H1", "description": "A" * 200,
                 "confidence": 0.9, "recommended_action": "Do something",
                 "supporting_evidence": [], "contraindications": []}
            ],
            "drug_alerts": [
                {"drug": "sertraline", "alert": "Watch for side effects."}
            ],
            "clinical_timeline": [],
            "evidence_summary": {},
            "overall_confidence": 0.8,
            "next_review_date": _next_review_date(),
            "multimodal_synthesis": {},
            "caveats": [],
        }
        report = deep_twin._format_patient_report(intel)
        assert report["report_type"] == "patient_simplified"
        assert "insights_to_discuss" in report
        # Description should be simplified
        insight = report["insights_to_discuss"][0]
        assert len(insight["what_it_means"]) <= 220

    def test_patient_report_no_hypotheses(self, deep_twin: DeepTwinBridge) -> None:
        intel = {
            "patient_id": "PT-012",
            "generated_at": _now_iso(),
            "patient_summary": {},
            "ranked_hypotheses": [],
            "drug_alerts": [],
            "clinical_timeline": [],
            "evidence_summary": {},
            "overall_confidence": 0.5,
            "next_review_date": _next_review_date(),
            "multimodal_synthesis": {},
            "caveats": [],
        }
        report = deep_twin._format_patient_report(intel)
        assert report["insights_to_discuss"] == []


# ============================================================================
# MODULE CONSTANTS TESTS
# ============================================================================


class TestConstants:
    """Verify module-level constants."""

    def test_schema_version(self) -> None:
        assert SCHEMA_VERSION == "2.0.0"

    def test_dt_version(self) -> None:
        assert DT_VERSION == "2.1.0"

    def test_actionability_weights(self) -> None:
        assert _ACTIONABILITY_WEIGHTS["HIGH"] == 1.0
        assert _ACTIONABILITY_WEIGHTS["MEDIUM"] == 0.7
        assert _ACTIONABILITY_WEIGHTS["LOW"] == 0.4
        assert _ACTIONABILITY_WEIGHTS["NONE"] == 0.0
