"""
evidence_fusion.py — Intelligent Synaps v4
============================================
Aggregates evidence from multiple sources with conflict detection and
resolution.

Workflow:
1. Group evidence pieces by entity and claim
2. Detect contradictions (quantitative + qualitative)
3. Weight by source reliability
4. Generate consensus view with confidence bounds
5. Flag unresolved conflicts for human review
6. Track provenance for every claim
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import unittest
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional, Set, Tuple

from pydantic import BaseModel, Field

logger = logging.getLogger("intelligent_synaps.evidence_fusion")

# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class EvidenceType(Enum):
    """Types of evidence."""

    EXPERIMENTAL = "experimental"
    OBSERVATIONAL = "observational"
    META_ANALYSIS = "meta_analysis"
    REVIEW = "review"
    GUIDELINE = "guideline"
    CASE_REPORT = "case_report"
    EXPERT_OPINION = "expert_opinion"
    IN_SILICO = "in_silico"
    UNKNOWN = "unknown"


class EvidencePiece(BaseModel):
    """A single piece of evidence from one source."""

    piece_id: str = ""
    source: str
    source_id: str = ""
    source_reliability: float = 0.8  # 0-1
    entity_type: str = ""
    entity_id: str = ""
    claim: str  # the assertion / statement
    claim_category: str = ""  # e.g. "efficacy", "safety", "mechanism"
    value: Any = None  # quantitative value if applicable
    value_unit: str = ""
    confidence: float = 0.8  # source-assigned confidence
    evidence_type: str = "observational"
    sample_size: Optional[int] = None
    population: str = ""
    study_design: str = ""
    publication_year: Optional[int] = None
    supporting_refs: List[str] = Field(default_factory=list)
    context: Dict[str, Any] = Field(default_factory=dict)

    def __init__(self, **data: Any) -> None:
        super().__init__(**data)
        if not self.piece_id:
            self.piece_id = self._generate_id()

    def _generate_id(self) -> str:
        """Generate deterministic ID from content."""
        content = f"{self.source}:{self.entity_id}:{self.claim}:{self.value}"
        return hashlib.sha256(content.encode()).hexdigest()[:16]


class Contradiction(BaseModel):
    """A detected contradiction between evidence pieces."""

    contradiction_id: str = ""
    claim_category: str
    property_name: str
    pieces: List[str]  # piece_ids
    values: List[Any]
    sources: List[str]
    severity: str  # low, medium, high, critical
    description: str
    suggested_resolution: str = ""
    resolution_confidence: float = 0.5

    def __init__(self, **data: Any) -> None:
        super().__init__(**data)
        if not self.contradiction_id:
            vals_str = "|".join(str(v) for v in self.values)
            content = f"{self.claim_category}:{self.property_name}:{vals_str}"
            self.contradiction_id = hashlib.sha256(
                content.encode()
            ).hexdigest()[:16]


class Consensus(BaseModel):
    """Consensus view for a claim category."""

    claim_category: str
    property_name: str
    consensus_value: Any
    consensus_type: str  # "agreement", "weighted_average", "majority", "uncertain"
    confidence_lower: float  # lower bound
    confidence_upper: float  # upper bound
    supporting_sources: List[str]
    supporting_count: int
    total_count: int
    heterogeneity: str  # "low", "moderate", "high"
    explanation: str = ""


class ProvenanceEntry(BaseModel):
    """Provenance tracking for a fused result."""

    piece_id: str
    source: str
    source_id: str
    claim: str
    weight_applied: float
    confidence_contribution: float


class FusedEvidence(BaseModel):
    """Result of evidence fusion across multiple sources."""

    fusion_id: str = ""
    entity_type: str = ""
    entity_id: str = ""
    entity_name: str = ""
    fused_at: str = ""
    consensus_views: List[Consensus] = Field(default_factory=list)
    contradictions: List[Contradiction] = Field(default_factory=list)
    unresolved_conflicts: List[Contradiction] = Field(default_factory=list)
    overall_confidence: float = 0.0
    source_count: int = 0
    piece_count: int = 0
    provenance: List[ProvenanceEntry] = Field(default_factory=list)
    requires_human_review: bool = False
    review_reasons: List[str] = Field(default_factory=list)

    def __init__(self, **data: Any) -> None:
        super().__init__(**data)
        if not self.fusion_id:
            self.fusion_id = hashlib.sha256(
                f"{self.entity_type}:{self.entity_id}:{datetime.now(timezone.utc)}".encode()
            ).hexdigest()[:16]
        if not self.fused_at:
            self.fused_at = datetime.now(timezone.utc).isoformat()


class SourceReliability(BaseModel):
    """Reliability weight for a source."""

    source: str
    reliability: float  # 0-1
    weight: float  # computed weight


# ---------------------------------------------------------------------------
# Default source reliability scores
# ---------------------------------------------------------------------------

DEFAULT_SOURCE_RELIABILITY: Dict[str, float] = {
    "cochrane": 0.98,
    "pubmed": 0.90,
    "clinicaltrials_gov": 0.88,
    "drugbank": 0.92,
    "chembl": 0.90,
    "ensembl": 0.92,
    "clinvar": 0.93,
    "guideline_db": 0.93,
    "pharmgkb": 0.88,
    "mondo": 0.90,
    "uniprot": 0.92,
    "fda_faers": 0.85,
    "who_guidelines": 0.95,
    "nice_guidelines": 0.92,
    "academic_journal": 0.85,
    "textbook": 0.80,
    "wikipedia": 0.40,
    "expert_panel": 0.82,
    "case_report_db": 0.55,
    "unknown": 0.50,
}


# ---------------------------------------------------------------------------
# EvidenceFusion
# ---------------------------------------------------------------------------

class EvidenceFusion:
    """Aggregates evidence from multiple sources with conflict detection.

    Usage:
        fusion = EvidenceFusion()
        fused = await fusion.fuse(evidence_pieces)
        for contradiction in fused.contradictions:
            ...  # handle conflict
    """

    def __init__(
        self,
        source_reliability: Optional[Dict[str, float]] = None,
    ) -> None:
        self.source_reliability = source_reliability or dict(
            DEFAULT_SOURCE_RELIABILITY
        )
        self._fusion_history: List[FusedEvidence] = []
        logger.info("EvidenceFusion initialised (%d source reliability scores)", len(self.source_reliability))

    # -- Main API -------------------------------------------------------------

    async def fuse(
        self,
        evidence_pieces: List[EvidencePiece],
        entity_type: str = "",
        entity_id: str = "",
        entity_name: str = "",
    ) -> FusedEvidence:
        """Fuse evidence pieces into a coherent view.

        Parameters
        ----------
        evidence_pieces:
            List of evidence pieces from various sources.
        entity_type, entity_id, entity_name:
            Optional entity identifiers for the result.

        Returns
        -------
        FusedEvidence with consensus views and contradictions.
        """
        if not evidence_pieces:
            return FusedEvidence(
                entity_type=entity_type,
                entity_id=entity_id,
                entity_name=entity_name,
                overall_confidence=0.0,
            )

        # 1. Group by claim category + property
        grouped = self._group_by_claim(evidence_pieces)

        # 2. Detect contradictions within each group
        all_contradictions: List[Contradiction] = []
        for (category, prop), pieces in grouped.items():
            contradictions = self.detect_contradictions(pieces)
            all_contradictions.extend(contradictions)

        # 3. Calculate consensus for each group
        consensus_views: List[Consensus] = []
        for (category, prop), pieces in grouped.items():
            consensus = self.calculate_consensus(pieces)
            if consensus:
                consensus_views.append(consensus)

        # 4. Build provenance
        provenance = self._build_provenance(evidence_pieces)

        # 5. Determine if human review needed
        unresolved = [c for c in all_contradictions if c.severity in ("high", "critical")]
        review_reasons: List[str] = []
        if unresolved:
            review_reasons.append(
                f"{len(unresolved)} high-severity contradictions detected"
            )
        if not consensus_views:
            review_reasons.append("No consensus could be established")

        # 6. Overall confidence
        overall_confidence = self._calculate_overall_confidence(
            consensus_views, all_contradictions, evidence_pieces
        )

        fused = FusedEvidence(
            entity_type=entity_type,
            entity_id=entity_id,
            entity_name=entity_name,
            consensus_views=consensus_views,
            contradictions=all_contradictions,
            unresolved_conflicts=unresolved,
            overall_confidence=overall_confidence,
            source_count=len(set(p.source for p in evidence_pieces)),
            piece_count=len(evidence_pieces),
            provenance=provenance,
            requires_human_review=len(review_reasons) > 0,
            review_reasons=review_reasons,
        )

        self._fusion_history.append(fused)
        logger.info(
            "Fused %d pieces → %d consensus views, %d contradictions "
            "(confidence=%.3f, review_needed=%s)",
            len(evidence_pieces),
            len(consensus_views),
            len(all_contradictions),
            overall_confidence,
            fused.requires_human_review,
        )
        return fused

    def detect_contradictions(
        self, pieces: List[EvidencePiece]
    ) -> List[Contradiction]:
        """Detect contradictions within a group of evidence pieces.

        Detects both quantitative conflicts (numeric values that differ
        significantly) and qualitative conflicts (opposing claims).

        Returns
        -------
        List of Contradiction objects.
        """
        if len(pieces) < 2:
            return []

        contradictions: List[Contradiction] = []
        category = pieces[0].claim_category or "general"
        prop = pieces[0].claim or "claim"

        # Check for quantitative conflicts
        numeric_pieces = [
            p for p in pieces
            if p.value is not None and isinstance(p.value, (int, float))
        ]
        if len(numeric_pieces) >= 2:
            values = [float(p.value) for p in numeric_pieces]
            mean_val = sum(values) / len(values)
            max_dev = max(abs(v - mean_val) for v in values) / (abs(mean_val) + 1e-9)

            if max_dev > 0.5:  # > 50% deviation
                severity = "critical" if max_dev > 1.0 else "high" if max_dev > 0.75 else "medium"
                contradictions.append(
                    Contradiction(
                        claim_category=category,
                        property_name=prop,
                        pieces=[p.piece_id for p in numeric_pieces],
                        values=values,
                        sources=[p.source for p in numeric_pieces],
                        severity=severity,
                        description=f"Quantitative conflict: values range from {min(values):.2f} to {max(values):.2f} "
                                   f"(deviation={max_dev:.1%})",
                        suggested_resolution="Meta-analysis or additional high-quality study needed",
                        resolution_confidence=0.3,
                    )
                )

        # Check for qualitative conflicts (opposing directions)
        directional = [p for p in pieces if p.claim]
        if len(directional) >= 2:
            # Simple heuristic: look for opposing keywords
            positive_indicators = ["increases", "enhances", "improves", "beneficial", "effective", "positive"]
            negative_indicators = ["decreases", "reduces", "worsens", "harmful", "ineffective", "negative", "no effect"]

            pos_claims = []
            neg_claims = []
            for p in directional:
                claim_lower = p.claim.lower()
                if any(kw in claim_lower for kw in positive_indicators):
                    pos_claims.append(p)
                elif any(kw in claim_lower for kw in negative_indicators):
                    neg_claims.append(p)

            if pos_claims and neg_claims:
                all_involved = pos_claims + neg_claims
                contradictions.append(
                    Contradiction(
                        claim_category=category,
                        property_name=prop,
                        pieces=[p.piece_id for p in all_involved],
                        values=[p.claim for p in all_involved],
                        sources=[p.source for p in all_involved],
                        severity="high",
                        description=f"Qualitative conflict: {len(pos_claims)} sources report positive, "
                                   f"{len(neg_claims)} sources report negative/neutral",
                        suggested_resolution="Review study design, population, and methodology differences",
                        resolution_confidence=0.4,
                    )
                )

        return contradictions

    def calculate_consensus(
        self, pieces: List[EvidencePiece]
    ) -> Optional[Consensus]:
        """Calculate consensus view for a group of evidence pieces.

        For quantitative values: weighted average.
        For qualitative: majority vote weighted by reliability.

        Returns
        -------
        Consensus object or None if no pieces.
        """
        if not pieces:
            return None

        category = pieces[0].claim_category or "general"
        prop = pieces[0].claim or "claim"

        # Compute source weights
        weights = self._compute_weights(pieces)

        # Try quantitative consensus
        numeric = [p for p in pieces if p.value is not None and isinstance(p.value, (int, float))]
        if numeric:
            return self._quantitative_consensus(numeric, weights, category, prop)

        # Qualitative consensus
        return self._qualitative_consensus(pieces, weights, category, prop)

    # -- Internal helpers ----------------------------------------------------

    def _group_by_claim(
        self, pieces: List[EvidencePiece]
    ) -> Dict[Tuple[str, str], List[EvidencePiece]]:
        """Group evidence pieces by (claim_category, claim)."""
        groups: Dict[Tuple[str, str], List[EvidencePiece]] = {}
        for p in pieces:
            key = (p.claim_category or "general", p.claim or "unknown")
            groups.setdefault(key, []).append(p)
        return groups

    def _compute_weights(
        self, pieces: List[EvidencePiece]
    ) -> Dict[str, float]:
        """Compute per-piece weight based on source reliability."""
        weights: Dict[str, float] = {}
        for p in pieces:
            rel = self.source_reliability.get(p.source, 0.5)
            # Adjust by evidence type
            type_multiplier = {
                "meta_analysis": 1.2,
                "rct": 1.1,
                "observational": 0.9,
                "case_report": 0.6,
                "expert_opinion": 0.7,
            }.get(p.study_design.lower().replace(" ", "_").replace("-", "_") if p.study_design else "", 1.0)
            # Adjust by sample size
            size_multiplier = 1.0
            if p.sample_size:
                if p.sample_size >= 1000:
                    size_multiplier = 1.15
                elif p.sample_size >= 100:
                    size_multiplier = 1.0
                elif p.sample_size >= 30:
                    size_multiplier = 0.9
                else:
                    size_multiplier = 0.7

            weights[p.piece_id] = rel * type_multiplier * size_multiplier
        return weights

    def _quantitative_consensus(
        self,
        pieces: List[EvidencePiece],
        weights: Dict[str, float],
        category: str,
        prop: str,
    ) -> Consensus:
        """Calculate weighted average consensus for numeric values."""
        total_weight = 0.0
        weighted_sum = 0.0
        for p in pieces:
            w = weights.get(p.piece_id, 0.5)
            weighted_sum += float(p.value) * w  # type: ignore[arg-type]
            total_weight += w

        mean = weighted_sum / total_weight if total_weight > 0 else 0.0

        # Confidence interval (simple)
        values = [float(p.value) for p in pieces]  # type: ignore[arg-type]
        std_dev = self._std_dev(values) if len(values) > 1 else 0.0
        sem = std_dev / (len(values) ** 0.5) if len(values) > 1 else std_dev
        ci_lower = mean - 1.96 * sem
        ci_upper = mean + 1.96 * sem

        heterogeneity = "low" if std_dev / (abs(mean) + 1e-9) < 0.2 else "moderate" if std_dev / (abs(mean) + 1e-9) < 0.5 else "high"

        return Consensus(
            claim_category=category,
            property_name=prop,
            consensus_value=round(mean, 4),
            consensus_type="weighted_average",
            confidence_lower=round(max(0.0, ci_lower), 4),
            confidence_upper=round(ci_upper, 4),
            supporting_sources=list(set(p.source for p in pieces)),
            supporting_count=len(pieces),
            total_count=len(pieces),
            heterogeneity=heterogeneity,
            explanation=f"Weighted average of {len(pieces)} sources (heterogeneity: {heterogeneity})",
        )

    def _qualitative_consensus(
        self,
        pieces: List[EvidencePiece],
        weights: Dict[str, float],
        category: str,
        prop: str,
    ) -> Consensus:
        """Calculate majority-vote consensus for qualitative claims."""
        # Weighted vote
        vote_scores: Dict[str, float] = {}
        for p in pieces:
            claim = p.claim.strip()
            w = weights.get(p.piece_id, 0.5)
            vote_scores[claim] = vote_scores.get(claim, 0.0) + w

        best_claim = max(vote_scores, key=vote_scores.get)  # type: ignore[arg-type]
        best_score = vote_scores[best_claim]
        total_score = sum(vote_scores.values())
        agreement_ratio = best_score / total_score if total_score > 0 else 0.0

        consensus_type = (
            "agreement" if agreement_ratio >= 0.75
            else "majority" if agreement_ratio >= 0.5
            else "uncertain"
        )

        return Consensus(
            claim_category=category,
            property_name=prop,
            consensus_value=best_claim,
            consensus_type=consensus_type,
            confidence_lower=round(agreement_ratio - 0.1, 3),
            confidence_upper=round(min(1.0, agreement_ratio + 0.1), 3),
            supporting_sources=list(set(p.source for p in pieces)),
            supporting_count=sum(1 for p in pieces if p.claim.strip() == best_claim),
            total_count=len(pieces),
            heterogeneity="low" if agreement_ratio > 0.75 else "moderate" if agreement_ratio > 0.5 else "high",
            explanation=f"{consensus_type.capitalize()} view from {len(pieces)} sources "
                       f"({agreement_ratio:.0%} agreement)",
        )

    def _build_provenance(
        self, pieces: List[EvidencePiece]
    ) -> List[ProvenanceEntry]:
        """Build provenance entries for all evidence pieces."""
        weights = self._compute_weights(pieces)
        total_weight = sum(weights.values())

        provenance = []
        for p in pieces:
            w = weights.get(p.piece_id, 0.5)
            provenance.append(
                ProvenanceEntry(
                    piece_id=p.piece_id,
                    source=p.source,
                    source_id=p.source_id,
                    claim=p.claim,
                    weight_applied=round(w, 4),
                    confidence_contribution=round(w / total_weight, 4) if total_weight > 0 else 0.0,
                )
            )
        return provenance

    def _calculate_overall_confidence(
        self,
        consensus_views: List[Consensus],
        contradictions: List[Contradiction],
        pieces: List[EvidencePiece],
    ) -> float:
        """Calculate overall confidence score."""
        if not pieces:
            return 0.0

        # Base: average consensus confidence
        if consensus_views:
            avg_consensus = sum(
                (cv.confidence_lower + cv.confidence_upper) / 2
                for cv in consensus_views
            ) / len(consensus_views)
        else:
            avg_consensus = 0.5

        # Penalty for contradictions
        penalty = 0.0
        for c in contradictions:
            if c.severity == "critical":
                penalty += 0.20
            elif c.severity == "high":
                penalty += 0.12
            elif c.severity == "medium":
                penalty += 0.05
            else:
                penalty += 0.02
        penalty = min(penalty, 0.60)

        # Source diversity bonus
        unique_sources = len(set(p.source for p in pieces))
        diversity_bonus = min(0.1, (unique_sources - 1) * 0.02)

        return round(max(0.0, min(1.0, avg_consensus - penalty + diversity_bonus)), 3)

    @staticmethod
    def _std_dev(values: List[float]) -> float:
        """Calculate sample standard deviation."""
        if len(values) < 2:
            return 0.0
        mean = sum(values) / len(values)
        variance = sum((x - mean) ** 2 for x in values) / (len(values) - 1)
        return variance ** 0.5

    def get_history(self) -> List[FusedEvidence]:
        """Return fusion history."""
        return list(self._fusion_history)

    def clear_history(self) -> None:
        """Clear fusion history."""
        self._fusion_history.clear()


# ---------------------------------------------------------------------------
# Unit tests
# ---------------------------------------------------------------------------

class TestEvidenceFusion(unittest.IsolatedAsyncioTestCase):
    async def test_fuse_empty(self) -> None:
        fusion = EvidenceFusion()
        result = await fusion.fuse([])
        self.assertEqual(result.piece_count, 0)
        self.assertEqual(result.overall_confidence, 0.0)

    async def test_fuse_single_piece(self) -> None:
        fusion = EvidenceFusion()
        pieces = [
            EvidencePiece(
                source="pubmed", claim="SSRIs are effective for MDD",
                claim_category="efficacy", value=0.65, confidence=0.9,
                sample_size=200, study_design="rct",
            )
        ]
        result = await fusion.fuse(pieces, entity_type="drug", entity_name="SSRI")
        self.assertEqual(result.piece_count, 1)
        self.assertTrue(result.overall_confidence > 0)
        self.assertEqual(len(result.consensus_views), 1)

    async def test_detect_quantitative_contradiction(self) -> None:
        fusion = EvidenceFusion()
        pieces = [
            EvidencePiece(source="pubmed", claim="response rate", value=0.65, confidence=0.8),
            EvidencePiece(source="drugbank", claim="response rate", value=0.30, confidence=0.7),
        ]
        contradictions = fusion.detect_contradictions(pieces)
        self.assertTrue(len(contradictions) > 0)
        self.assertTrue(contradictions[0].severity in ("medium", "high", "critical"))

    async def test_detect_qualitative_contradiction(self) -> None:
        fusion = EvidenceFusion()
        pieces = [
            EvidencePiece(source="pubmed", claim="increases serotonin levels", confidence=0.9),
            EvidencePiece(source="wikipedia", claim="has no effect on serotonin", confidence=0.4),
        ]
        contradictions = fusion.detect_contradictions(pieces)
        self.assertTrue(len(contradictions) > 0)

    async def test_quantitative_consensus(self) -> None:
        fusion = EvidenceFusion()
        pieces = [
            EvidencePiece(source="pubmed", claim="effect size", value=0.50, confidence=0.9, sample_size=200),
            EvidencePiece(source="cochrane", claim="effect size", value=0.55, confidence=0.95, sample_size=1000),
            EvidencePiece(source="drugbank", claim="effect size", value=0.48, confidence=0.8, sample_size=100),
        ]
        consensus = fusion.calculate_consensus(pieces)
        self.assertIsNotNone(consensus)
        self.assertEqual(consensus.consensus_type, "weighted_average")
        self.assertTrue(0.48 <= float(consensus.consensus_value) <= 0.58)

    async def test_qualitative_consensus(self) -> None:
        fusion = EvidenceFusion()
        pieces = [
            EvidencePiece(source="pubmed", claim="Effective for MDD", confidence=0.9),
            EvidencePiece(source="cochrane", claim="Effective for MDD", confidence=0.95),
            EvidencePiece(source="drugbank", claim="Effective for MDD", confidence=0.85),
        ]
        consensus = fusion.calculate_consensus(pieces)
        self.assertIsNotNone(consensus)
        self.assertIn("Effective", str(consensus.consensus_value))

    async def test_overall_confidence_with_contradiction(self) -> None:
        fusion = EvidenceFusion()
        pieces = [
            EvidencePiece(source="pubmed", claim="response rate", value=0.65, confidence=0.9),
            EvidencePiece(source="pubmed", claim="response rate", value=0.30, confidence=0.9),
        ]
        result = await fusion.fuse(pieces)
        self.assertTrue(len(result.contradictions) > 0)
        self.assertTrue(result.requires_human_review)

    async def test_source_reliability_weighting(self) -> None:
        fusion = EvidenceFusion()
        # Cochrane (0.98) should have more weight than Wikipedia (0.40)
        pieces = [
            EvidencePiece(source="cochrane", claim="effect size", value=0.60, confidence=0.95, sample_size=5000),
            EvidencePiece(source="wikipedia", claim="effect size", value=0.30, confidence=0.5, sample_size=10),
        ]
        consensus = fusion.calculate_consensus(pieces)
        self.assertIsNotNone(consensus)
        # Consensus should be closer to cochrane value
        self.assertTrue(float(consensus.consensus_value) > 0.45)

    async def test_provenance_tracking(self) -> None:
        fusion = EvidenceFusion()
        pieces = [
            EvidencePiece(source="pubmed", claim="test", confidence=0.9),
        ]
        result = await fusion.fuse(pieces)
        self.assertEqual(len(result.provenance), 1)
        self.assertEqual(result.provenance[0].source, "pubmed")

    async def test_history(self) -> None:
        fusion = EvidenceFusion()
        await fusion.fuse([EvidencePiece(source="pubmed", claim="test", confidence=0.5)])
        await fusion.fuse([EvidencePiece(source="pubmed", claim="test2", confidence=0.6)])
        self.assertEqual(len(fusion.get_history()), 2)
        fusion.clear_history()
        self.assertEqual(len(fusion.get_history()), 0)

    async def test_no_contradiction_agreement(self) -> None:
        fusion = EvidenceFusion()
        pieces = [
            EvidencePiece(source="pubmed", claim="effective", value=0.65, confidence=0.9),
            EvidencePiece(source="pubmed", claim="effective", value=0.67, confidence=0.85),
            EvidencePiece(source="pubmed", claim="effective", value=0.64, confidence=0.88),
        ]
        contradictions = fusion.detect_contradictions(pieces)
        self.assertEqual(len(contradictions), 0)

    async def test_paper_id_generation(self) -> None:
        p = EvidencePiece(source="pubmed", claim="test")
        self.assertTrue(len(p.piece_id) > 0)
        # Same content → same ID
        p2 = EvidencePiece(source="pubmed", claim="test")
        self.assertEqual(p.piece_id, p2.piece_id)


if __name__ == "__main__":
    unittest.main(module=__name__, exit=False, verbosity=2)
