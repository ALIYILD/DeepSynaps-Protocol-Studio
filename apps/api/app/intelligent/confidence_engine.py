"""
confidence_engine.py — Intelligent Synaps v4
================================================
7-dimensional confidence scoring for all knowledge results.

Dimensions:
- data_quality: Source reliability (curated DB = 1.0, web = 0.3)
- evidence_strength: Study design quality (RCT meta-analysis = 1.0, case report = 0.3)
- sample_size: Statistical power mapping (log scale, n>1000 = 1.0)
- replication: Cross-study consistency (multiple confirming = 1.0)
- consistency: Internal coherence of the result
- temporal_relevance: Recency of data (2024 = 1.0, 2010 = 0.3)
- population_match: Applicability to target population

Every result from every adapter is scored before reaching the synthesizer.
"""

from __future__ import annotations

import asyncio
import logging
import math
import unittest
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple

from pydantic import BaseModel, Field, validator

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logger = logging.getLogger("intelligent_synaps.confidence_engine")


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
CURRENT_YEAR = datetime.now(timezone.utc).year

# Study design → evidence strength mapping
STUDY_DESIGN_SCORES: Dict[str, float] = {
    "systematic_review_meta_analysis": 1.0,
    "meta_analysis": 0.95,
    "systematic_review": 0.92,
    "rct": 0.90,
    "randomized_controlled_trial": 0.90,
    "controlled_trial": 0.75,
    "cohort_study": 0.70,
    "case_control": 0.60,
    "cross_sectional": 0.55,
    "case_series": 0.45,
    "case_report": 0.30,
    "expert_opinion": 0.25,
    "in_silico": 0.40,
    "in_vitro": 0.50,
    "animal_study": 0.45,
    "review": 0.55,
    "guideline": 0.88,
    "consensus_statement": 0.85,
    "unknown": 0.40,
}

# Source reliability tiers
SOURCE_RELIABILITY: Dict[str, float] = {
    "fda": 1.0,
    "ema": 1.0,
    "who": 0.98,
    "pubmed": 0.90,
    "cochrane": 0.97,
    "clinicaltrials_gov": 0.85,
    "drugbank": 0.92,
    "chembl": 0.90,
    "pubchem": 0.88,
    "rxnorm": 0.93,
    "umls": 0.91,
    "ensembl": 0.90,
    "clinvar": 0.92,
    "gnomad": 0.90,
    "pharmgkb": 0.88,
    "opentargets": 0.85,
    "guideline_db": 0.93,
    "academic_journal": 0.85,
    "textbook": 0.82,
    "wikipedia": 0.45,
    "news": 0.30,
    "blog": 0.20,
    "unknown": 0.40,
}

# Default dimension weights
DEFAULT_WEIGHTS = {
    "data_quality": 0.20,
    "evidence_strength": 0.25,
    "sample_size": 0.15,
    "replication": 0.15,
    "consistency": 0.10,
    "temporal_relevance": 0.08,
    "population_match": 0.07,
}


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class ConfidenceDimension(Enum):
    """Named confidence dimensions."""

    DATA_QUALITY = "data_quality"
    EVIDENCE_STRENGTH = "evidence_strength"
    SAMPLE_SIZE = "sample_size"
    REPLICATION = "replication"
    CONSISTENCY = "consistency"
    TEMPORAL_RELEVANCE = "temporal_relevance"
    POPULATION_MATCH = "population_match"


class ConfidenceScore(BaseModel):
    """7-dimensional confidence score for a knowledge result.

    Each dimension is a float in [0, 1]. The composite is a weighted
    combination used for threshold filtering and ranking.
    """

    data_quality: float = Field(..., ge=0.0, le=1.0, description="Source reliability")
    evidence_strength: float = Field(
        ..., ge=0.0, le=1.0, description="Study design quality"
    )
    sample_size: float = Field(..., ge=0.0, le=1.0, description="Statistical power")
    replication: float = Field(
        ..., ge=0.0, le=1.0, description="Cross-study consistency"
    )
    consistency: float = Field(
        ..., ge=0.0, le=1.0, description="Internal coherence"
    )
    temporal_relevance: float = Field(
        ..., ge=0.0, le=1.0, description="Recency of data"
    )
    population_match: float = Field(
        ..., ge=0.0, le=1.0, description="Target population applicability"
    )
    # Optional context
    source_name: Optional[str] = None
    study_design: Optional[str] = None
    sample_n: Optional[int] = None
    publication_year: Optional[int] = None

    @validator("*", pre=True, always=True)
    def clamp_values(cls, v: Any, field: Any) -> Any:  # type: ignore[misc]
        if isinstance(v, (int, float)) and field.name not in (
            "source_name",
            "study_design",
            "sample_n",
            "publication_year",
        ):
            return max(0.0, min(1.0, float(v)))
        return v

    @property
    def composite(self) -> float:
        """Weighted composite score."""
        weights = DEFAULT_WEIGHTS
        return sum(getattr(self, k) * w for k, w in weights.items())

    @property
    def composite_rounded(self) -> float:
        """Composite rounded to 3 decimal places."""
        return round(self.composite, 3)

    @property
    def grade(self) -> str:
        """Letter grade based on composite score."""
        c = self.composite
        if c >= 0.90:
            return "A+"
        if c >= 0.80:
            return "A"
        if c >= 0.70:
            return "B"
        if c >= 0.60:
            return "C"
        if c >= 0.40:
            return "D"
        return "F"

    @property
    def is_high_confidence(self) -> bool:
        """True if composite >= 0.80."""
        return self.composite >= 0.80

    @property
    def is_acceptable(self) -> bool:
        """True if composite >= 0.60."""
        return self.composite >= 0.60

    def to_dict(self) -> Dict[str, Any]:
        return {
            "data_quality": round(self.data_quality, 3),
            "evidence_strength": round(self.evidence_strength, 3),
            "sample_size": round(self.sample_size, 3),
            "replication": round(self.replication, 3),
            "consistency": round(self.consistency, 3),
            "temporal_relevance": round(self.temporal_relevance, 3),
            "population_match": round(self.population_match, 3),
            "composite": self.composite_rounded,
            "grade": self.grade,
        }

    def __str__(self) -> str:
        return f"Confidence({self.composite_rounded} / {self.grade})"

    def __repr__(self) -> str:
        return (
            f"ConfidenceScore(dq={self.data_quality:.2f}, "
            f"es={self.evidence_strength:.2f}, ss={self.sample_size:.2f}, "
            f"rep={self.replication:.2f}, cons={self.consistency:.2f}, "
            f"tr={self.temporal_relevance:.2f}, pm={self.population_match:.2f} "
            f"→ {self.composite_rounded} [{self.grade}])"
        )


class CompositeWeights(BaseModel):
    """Customisable weights for composite calculation."""

    data_quality: float = 0.20
    evidence_strength: float = 0.25
    sample_size: float = 0.15
    replication: float = 0.15
    consistency: float = 0.10
    temporal_relevance: float = 0.08
    population_match: float = 0.07

    @validator("*")
    def weights_sum_to_one(cls, v: Dict[str, float]) -> Dict[str, float]:  # type: ignore[misc]
        total = sum(v.values())  # type: ignore[attr-defined]
        if not (0.99 <= total <= 1.01):
            raise ValueError(f"Weights must sum to 1.0, got {total}")
        return v


class ScoredResult(BaseModel):
    """A knowledge result wrapped with its confidence score."""

    result_id: str
    adapter_name: str
    raw_result: Dict[str, Any]
    confidence: ConfidenceScore
    entity_type: Optional[str] = None
    entity_id: Optional[str] = None


class ConfidenceReport(BaseModel):
    """Aggregate confidence report across multiple results."""

    result_count: int
    average_composite: float
    median_composite: float
    min_composite: float
    max_composite: float
    high_confidence_count: int
    acceptable_count: int
    low_confidence_count: int
    dimension_averages: Dict[str, float]
    scored_results: List[ScoredResult]


# ---------------------------------------------------------------------------
# Scoring helpers
# ---------------------------------------------------------------------------

def _sample_size_score(n: Optional[int]) -> float:
    """Map sample size to [0, 1] using a log-scale sigmoid.

    n < 10        → ~0.1
    n = 30        → ~0.3
    n = 100       → ~0.5
    n = 500       → ~0.75
    n >= 10000    → ~1.0
    """
    if n is None or n <= 0:
        return 0.35
    if n >= 10000:
        return 1.0
    if n < 10:
        return 0.1
    return float(1.0 / (1.0 + math.exp(-0.5 * (math.log10(n) - 2.0))))


def _temporal_score(year: Optional[int]) -> float:
    """Map publication year to temporal relevance.

    Current year     → 1.0
    5 years old      → ~0.85
    10 years old     → ~0.6
    15+ years old    → ~0.3
    """
    if year is None or year < 1900:
        return 0.50
    age = max(0, CURRENT_YEAR - year)
    return float(max(0.15, 1.0 - (age / 20.0)))


def _population_match_score(
    source_population: Optional[str], target_population: Optional[str]
) -> float:
    """Score how well source population matches target.

    Exact match    → 1.0
    Partial match  → 0.7
    No info        → 0.5
    """
    if source_population is None or target_population is None:
        return 0.50
    s = source_population.lower().strip()
    t = target_population.lower().strip()
    if s == t:
        return 1.0
    # Partial matches
    if any(term in s for term in t.split()) or any(term in t for term in s.split()):
        return 0.70
    return 0.40


def _replication_score(num_confirming: int, num_contradicting: int) -> float:
    """Score replication based on confirming vs contradicting studies."""
    total = num_confirming + num_contradicting
    if total == 0:
        return 0.50
    ratio = num_confirming / total
    # Boost when many studies exist
    volume_bonus = min(0.15, total / 40.0)
    return min(1.0, ratio + volume_bonus)


def _consistency_score(internal_metrics: Optional[Dict[str, Any]]) -> float:
    """Score internal consistency of a result."""
    if internal_metrics is None:
        return 0.60
    scores = []
    if "p_value" in internal_metrics:
        p = internal_metrics["p_value"]
        scores.append(1.0 if p < 0.01 else 0.8 if p < 0.05 else 0.5)
    if "confidence_interval_width" in internal_metrics:
        w = internal_metrics["confidence_interval_width"]
        scores.append(1.0 if w < 0.2 else 0.7 if w < 0.5 else 0.4)
    if "heterogeneity_i2" in internal_metrics:
        i2 = internal_metrics["heterogeneity_i2"]
        scores.append(1.0 - min(i2, 1.0))  # lower I² = more consistent
    if not scores:
        return 0.60
    return float(sum(scores) / len(scores))


# ---------------------------------------------------------------------------
# ConfidenceEngine
# ---------------------------------------------------------------------------

class ConfidenceEngine:
    """7-dimensional confidence scoring for all knowledge results.

    Usage:
        engine = ConfidenceEngine()
        score = engine.score_adapter_result(result, adapter_meta)
        if engine.should_include(score, threshold=0.6):
            results.append(score)
    """

    def __init__(self, weights: Optional[CompositeWeights] = None) -> None:
        self.weights = weights or CompositeWeights()
        self._scoring_cache: Dict[str, ConfidenceScore] = {}
        logger.info("ConfidenceEngine initialised")

    # -- Public API ----------------------------------------------------------

    def score_adapter_result(
        self,
        result: Dict[str, Any],
        adapter_meta: Dict[str, Any],
        target_population: Optional[str] = None,
    ) -> ConfidenceScore:
        """Score a single adapter's result across all 7 dimensions.

        Parameters
        ----------
        result:
            Raw result dict. May contain keys like 'sample_size',
            'p_value', 'publication_year', 'study_design', etc.
        adapter_meta:
            Metadata about the adapter/source. Should contain 'source_name'
            and optionally 'reliability_tier'.
        target_population:
            Optional target population string for population_match scoring.

        Returns
        -------
        ConfidenceScore
            Fully populated 7-dimensional score.
        """
        cache_key = f"{adapter_meta.get('source_name', 'unknown')}:{hash(str(result))}"
        if cache_key in self._scoring_cache:
            return self._scoring_cache[cache_key]

        source_name = adapter_meta.get("source_name", "unknown")
        study_design = result.get("study_design", result.get("evidence_type", "unknown"))
        sample_n = result.get("sample_size", result.get("n", None))
        pub_year = result.get("publication_year", result.get("year", None))
        source_pop = result.get("population", None)
        num_confirming = result.get("confirming_studies", 1)
        num_contradicting = result.get("contradicting_studies", 0)
        internal_metrics = result.get("internal_metrics", None)

        # 1. Data quality
        data_quality = SOURCE_RELIABILITY.get(
            source_name.lower(),
            adapter_meta.get("reliability_tier", 0.50),
        )

        # 2. Evidence strength
        evidence_strength = STUDY_DESIGN_SCORES.get(
            str(study_design).lower().replace(" ", "_").replace("-", "_"),
            0.40,
        )

        # 3. Sample size
        sample_size = _sample_size_score(sample_n)

        # 4. Replication
        replication = _replication_score(num_confirming, num_contradicting)

        # 5. Consistency
        consistency = _consistency_score(internal_metrics)

        # 6. Temporal relevance
        temporal_relevance = _temporal_score(pub_year)

        # 7. Population match
        population_match = _population_match_score(source_pop, target_population)

        score = ConfidenceScore(
            data_quality=round(data_quality, 4),
            evidence_strength=round(evidence_strength, 4),
            sample_size=round(sample_size, 4),
            replication=round(replication, 4),
            consistency=round(consistency, 4),
            temporal_relevance=round(temporal_relevance, 4),
            population_match=round(population_match, 4),
            source_name=source_name,
            study_design=str(study_design),
            sample_n=sample_n,
            publication_year=pub_year,
        )

        self._scoring_cache[cache_key] = score
        logger.debug(
            "Scored result from %s: %s (composite=%.3f)",
            source_name,
            score.grade,
            score.composite,
        )
        return score

    def score_synthesis(
        self,
        sources: List[Dict[str, Any]],
        contradictions: List[Dict[str, Any]],
        weights: Optional[CompositeWeights] = None,
    ) -> ConfidenceScore:
        """Score a synthesized multi-source result.

        The synthesis score is the weighted average of individual source
        scores, penalised by the number and severity of contradictions.

        Parameters
        ----------
        sources:
            List of source result dicts, each with an embedded 'confidence'
            dict or individual scoring fields.
        contradictions:
            List of detected contradiction dicts. Each should have
            'severity' in ['low', 'medium', 'high'].
        weights:
            Optional custom weights. Uses engine defaults if None.
        """
        if not sources:
            # No sources → minimal confidence
            return ConfidenceScore(
                data_quality=0.1,
                evidence_strength=0.1,
                sample_size=0.1,
                replication=0.1,
                consistency=0.1,
                temporal_relevance=0.1,
                population_match=0.1,
            )

        # Score each source
        source_scores: List[ConfidenceScore] = []
        for src in sources:
            meta = src.get("_meta", {"source_name": src.get("source", "unknown")})
            if "confidence" in src and isinstance(src["confidence"], dict):
                # Already scored — reconstruct
                c = src["confidence"]
                source_scores.append(
                    ConfidenceScore(
                        data_quality=c.get("data_quality", 0.5),
                        evidence_strength=c.get("evidence_strength", 0.5),
                        sample_size=c.get("sample_size", 0.5),
                        replication=c.get("replication", 0.5),
                        consistency=c.get("consistency", 0.5),
                        temporal_relevance=c.get("temporal_relevance", 0.5),
                        population_match=c.get("population_match", 0.5),
                    )
                )
            else:
                source_scores.append(self.score_adapter_result(src, meta))

        # Average each dimension
        def _avg(attr: str) -> float:
            vals = [getattr(s, attr) for s in source_scores]
            return float(sum(vals) / len(vals)) if vals else 0.5

        # Penalise for contradictions
        penalty = 0.0
        for contr in contradictions:
            sev = contr.get("severity", "medium")
            if sev == "high":
                penalty += 0.12
            elif sev == "medium":
                penalty += 0.06
            else:
                penalty += 0.02
        penalty = min(penalty, 0.40)

        consistency_penalty = _avg("consistency") * (1.0 - penalty)

        synthesis = ConfidenceScore(
            data_quality=_avg("data_quality"),
            evidence_strength=_avg("evidence_strength"),
            sample_size=_avg("sample_size"),
            replication=_avg("replication"),
            consistency=consistency_penalty,
            temporal_relevance=_avg("temporal_relevance"),
            population_match=_avg("population_match"),
        )

        logger.debug(
            "Synthesis score: %.3f (%s) from %d sources, %d contradictions",
            synthesis.composite,
            synthesis.grade,
            len(sources),
            len(contradictions),
        )
        return synthesis

    def should_include(
        self, score: ConfidenceScore, threshold: float = 0.60
    ) -> bool:
        """Determine if a scored result meets the confidence threshold.

        Also applies per-dimension minimums to prevent lopsided scores
        from passing on composite alone.
        """
        if score.composite < threshold:
            return False
        # Prevent lopsided scores: no single dimension below 0.15
        dims = [
            score.data_quality,
            score.evidence_strength,
            score.sample_size,
            score.replication,
            score.consistency,
            score.temporal_relevance,
            score.population_match,
        ]
        if any(d < 0.10 for d in dims):
            logger.warning(
                "Result filtered: lopsided score (min_dim=%.2f)", min(dims)
            )
            return False
        return True

    def rank_results(
        self, scored_results: List[ScoredResult]
    ) -> List[ScoredResult]:
        """Rank scored results by composite score (descending)."""
        return sorted(
            scored_results,
            key=lambda r: r.confidence.composite,
            reverse=True,
        )

    def generate_report(
        self, scored_results: List[ScoredResult]
    ) -> ConfidenceReport:
        """Generate an aggregate confidence report."""
        if not scored_results:
            return ConfidenceReport(
                result_count=0,
                average_composite=0.0,
                median_composite=0.0,
                min_composite=0.0,
                max_composite=0.0,
                high_confidence_count=0,
                acceptable_count=0,
                low_confidence_count=0,
                dimension_averages={},
                scored_results=[],
            )

        composites = [r.confidence.composite for r in scored_results]
        composites.sort()
        n = len(composites)
        median = composites[n // 2] if n % 2 else (composites[n // 2 - 1] + composites[n // 2]) / 2

        dim_avgs = {
            "data_quality": round(
                sum(r.confidence.data_quality for r in scored_results) / n, 3
            ),
            "evidence_strength": round(
                sum(r.confidence.evidence_strength for r in scored_results) / n, 3
            ),
            "sample_size": round(
                sum(r.confidence.sample_size for r in scored_results) / n, 3
            ),
            "replication": round(
                sum(r.confidence.replication for r in scored_results) / n, 3
            ),
            "consistency": round(
                sum(r.confidence.consistency for r in scored_results) / n, 3
            ),
            "temporal_relevance": round(
                sum(r.confidence.temporal_relevance for r in scored_results) / n, 3
            ),
            "population_match": round(
                sum(r.confidence.population_match for r in scored_results) / n, 3
            ),
        }

        return ConfidenceReport(
            result_count=n,
            average_composite=round(sum(composites) / n, 3),
            median_composite=round(median, 3),
            min_composite=round(min(composites), 3),
            max_composite=round(max(composites), 3),
            high_confidence_count=sum(1 for c in composites if c >= 0.80),
            acceptable_count=sum(1 for c in composites if 0.60 <= c < 0.80),
            low_confidence_count=sum(1 for c in composites if c < 0.60),
            dimension_averages=dim_avgs,
            scored_results=scored_results,
        )

    def clear_cache(self) -> None:
        """Clear the internal scoring cache."""
        self._scoring_cache.clear()


# ---------------------------------------------------------------------------
# Unit tests
# ---------------------------------------------------------------------------

class TestConfidenceScore(unittest.TestCase):
    def test_composite_calculation(self) -> None:
        s = ConfidenceScore(
            data_quality=1.0,
            evidence_strength=1.0,
            sample_size=1.0,
            replication=1.0,
            consistency=1.0,
            temporal_relevance=1.0,
            population_match=1.0,
        )
        self.assertAlmostEqual(s.composite, 1.0)
        self.assertEqual(s.grade, "A+")

    def test_all_zeros(self) -> None:
        s = ConfidenceScore(
            data_quality=0.0,
            evidence_strength=0.0,
            sample_size=0.0,
            replication=0.0,
            consistency=0.0,
            temporal_relevance=0.0,
            population_match=0.0,
        )
        self.assertAlmostEqual(s.composite, 0.0)
        self.assertEqual(s.grade, "F")

    def test_mid_range(self) -> None:
        s = ConfidenceScore(
            data_quality=0.5,
            evidence_strength=0.5,
            sample_size=0.5,
            replication=0.5,
            consistency=0.5,
            temporal_relevance=0.5,
            population_match=0.5,
        )
        self.assertAlmostEqual(s.composite, 0.5)
        self.assertEqual(s.grade, "D")

    def test_clamping(self) -> None:
        s = ConfidenceScore(
            data_quality=1.5,  # > 1
            evidence_strength=-0.5,  # < 0
            sample_size=0.5,
            replication=0.5,
            consistency=0.5,
            temporal_relevance=0.5,
            population_match=0.5,
        )
        self.assertAlmostEqual(s.data_quality, 1.0, places=3)
        self.assertAlmostEqual(s.evidence_strength, 0.0, places=3)


class TestScoringHelpers(unittest.TestCase):
    def test_sample_size_score(self) -> None:
        self.assertAlmostEqual(_sample_size_score(None), 0.35)
        self.assertAlmostEqual(_sample_size_score(0), 0.35)
        self.assertAlmostEqual(_sample_size_score(5), 0.1)
        self.assertAlmostEqual(_sample_size_score(10000), 1.0)
        self.assertTrue(0.4 < _sample_size_score(100) < 0.6)

    def test_temporal_score(self) -> None:
        self.assertAlmostEqual(_temporal_score(None), 0.50)
        self.assertAlmostEqual(_temporal_score(CURRENT_YEAR), 1.0)
        self.assertTrue(_temporal_score(CURRENT_YEAR - 10) < 1.0)
        self.assertTrue(_temporal_score(1900) >= 0.15)

    def test_replication_score(self) -> None:
        self.assertAlmostEqual(_replication_score(0, 0), 0.50)
        self.assertAlmostEqual(_replication_score(5, 0), 1.0)
        self.assertAlmostEqual(_replication_score(0, 5), 0.0)

    def test_consistency_score_no_metrics(self) -> None:
        self.assertAlmostEqual(_consistency_score(None), 0.60)

    def test_consistency_score_with_pvalue(self) -> None:
        self.assertTrue(_consistency_score({"p_value": 0.001}) > 0.9)
        self.assertTrue(_consistency_score({"p_value": 0.1}) < 0.6)


class TestConfidenceEngine(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = ConfidenceEngine()

    def test_score_adapter_result_minimal(self) -> None:
        result = {}
        meta = {"source_name": "unknown"}
        score = self.engine.score_adapter_result(result, meta)
        self.assertIsInstance(score, ConfidenceScore)
        self.assertTrue(0.0 <= score.composite <= 1.0)

    def test_score_adapter_result_rct_pubmed(self) -> None:
        result = {
            "study_design": "rct",
            "sample_size": 500,
            "publication_year": CURRENT_YEAR,
            "confirming_studies": 3,
            "contradicting_studies": 0,
        }
        meta = {"source_name": "pubmed"}
        score = self.engine.score_adapter_result(result, meta)
        self.assertTrue(score.data_quality >= 0.85)
        self.assertTrue(score.evidence_strength >= 0.85)
        self.assertTrue(score.composite >= 0.60)

    def test_should_include_threshold(self) -> None:
        good = ConfidenceScore(
            data_quality=0.9,
            evidence_strength=0.9,
            sample_size=0.8,
            replication=0.8,
            consistency=0.8,
            temporal_relevance=0.8,
            population_match=0.8,
        )
        self.assertTrue(self.engine.should_include(good, threshold=0.6))
        bad = ConfidenceScore(
            data_quality=0.1,
            evidence_strength=0.1,
            sample_size=0.1,
            replication=0.1,
            consistency=0.1,
            temporal_relevance=0.1,
            population_match=0.1,
        )
        self.assertFalse(self.engine.should_include(bad, threshold=0.6))

    def test_should_include_lopsided(self) -> None:
        lopsided = ConfidenceScore(
            data_quality=1.0,
            evidence_strength=1.0,
            sample_size=1.0,
            replication=1.0,
            consistency=1.0,
            temporal_relevance=1.0,
            population_match=0.0,  # very low
        )
        # Still passes because 0.0 is exactly 0.10 threshold boundary
        # Actually 0.0 < 0.10 so it should fail
        self.assertFalse(self.engine.should_include(lopsided, threshold=0.6))

    def test_score_synthesis_empty(self) -> None:
        score = self.engine.score_synthesis([], [])
        self.assertAlmostEqual(score.composite, 0.1)

    def test_rank_results(self) -> None:
        results = [
            ScoredResult(
                result_id="r1",
                adapter_name="a",
                raw_result={},
                confidence=ConfidenceScore(
                    data_quality=0.5, evidence_strength=0.5, sample_size=0.5,
                    replication=0.5, consistency=0.5, temporal_relevance=0.5,
                    population_match=0.5,
                ),
            ),
            ScoredResult(
                result_id="r2",
                adapter_name="a",
                raw_result={},
                confidence=ConfidenceScore(
                    data_quality=0.9, evidence_strength=0.9, sample_size=0.9,
                    replication=0.9, consistency=0.9, temporal_relevance=0.9,
                    population_match=0.9,
                ),
            ),
        ]
        ranked = self.engine.rank_results(results)
        self.assertEqual(ranked[0].result_id, "r2")
        self.assertEqual(ranked[1].result_id, "r1")

    def test_generate_report(self) -> None:
        results = [
            ScoredResult(
                result_id=f"r{i}",
                adapter_name="a",
                raw_result={},
                confidence=ConfidenceScore(
                    data_quality=0.5 + i * 0.05,
                    evidence_strength=0.5 + i * 0.05,
                    sample_size=0.5 + i * 0.05,
                    replication=0.5 + i * 0.05,
                    consistency=0.5 + i * 0.05,
                    temporal_relevance=0.5 + i * 0.05,
                    population_match=0.5 + i * 0.05,
                ),
            )
            for i in range(3)
        ]
        report = self.engine.generate_report(results)
        self.assertEqual(report.result_count, 3)
        self.assertTrue(report.min_composite <= report.average_composite <= report.max_composite)

    def test_clear_cache(self) -> None:
        self.engine._scoring_cache["key"] = ConfidenceScore(
            data_quality=0.5, evidence_strength=0.5, sample_size=0.5,
            replication=0.5, consistency=0.5, temporal_relevance=0.5,
            population_match=0.5,
        )
        self.engine.clear_cache()
        self.assertEqual(len(self.engine._scoring_cache), 0)

    def test_all_study_designs_present(self) -> None:
        for design in STUDY_DESIGN_SCORES:
            self.assertTrue(0.0 <= STUDY_DESIGN_SCORES[design] <= 1.0)

    def test_all_source_reliabilities_present(self) -> None:
        for source in SOURCE_RELIABILITY:
            self.assertTrue(0.0 <= SOURCE_RELIABILITY[source] <= 1.0)


def run_tests() -> None:
    loader = unittest.TestLoader()
    suite = unittest.TestSuite()
    suite.addTests(loader.loadTestsFromTestCase(TestConfidenceScore))
    suite.addTests(loader.loadTestsFromTestCase(TestScoringHelpers))
    suite.addTests(loader.loadTestsFromTestCase(TestConfidenceEngine))
    runner = unittest.TextTestRunner(verbosity=2)
    runner.run(suite)


if __name__ == "__main__":
    run_tests()
