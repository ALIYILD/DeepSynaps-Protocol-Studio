"""Synthesis orchestrator — runs all 6 intelligence engines in sequence."""

from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

from contracts import (
    IntelligenceOutput,
    MultimodalEvent,
    SynthesisRequest,
    SynthesisResponse,
)
from knowledge_layer import KnowledgeLayer
from safety_governance import SafetyGovernance
from timeline_engine import MultimodalTimelineEngine
from correlation_engine import CorrelationEngine
from confound_engine import ConfoundEngine
from evidence_engine import EvidenceLinkingEngine
from hypothesis_engine import HypothesisRankingEngine
from missing_data_engine import MissingDataEngine


class SynthesisService:
    """Orchestrates all 6 intelligence engines for a full synthesis."""

    def __init__(self, knowledge_layer: KnowledgeLayer):
        self.kl = knowledge_layer
        self.timeline_engine = MultimodalTimelineEngine(knowledge_layer)
        self.correlation_engine = CorrelationEngine(knowledge_layer)
        self.confound_engine = ConfoundEngine(knowledge_layer)
        self.evidence_engine = EvidenceLinkingEngine(knowledge_layer)
        self.hypothesis_engine = HypothesisRankingEngine(knowledge_layer)
        self.missing_data_engine = MissingDataEngine(knowledge_layer)

    def generate_synthesis(
        self,
        patient_id: str,
        request: SynthesisRequest,
    ) -> SynthesisResponse:
        """Run all engines and produce a full synthesis response."""
        date_range = None
        if request.date_range:
            date_range = (
                datetime.fromisoformat(request.date_range[0]),
                datetime.fromisoformat(request.date_range[1]),
            )

        modality_filter = request.include_modalities or None

        # 1. Timeline
        timeline_events = self.timeline_engine.build_timeline(
            patient_id=patient_id,
            modality_filter=modality_filter,
            date_range=date_range,
        )

        # 2. Correlations
        correlations = self.correlation_engine.find_correlations(
            patient_id=patient_id,
            window_days=getattr(request, 'window_days', 30),
            min_confidence=request.min_confidence,
        )

        # 3. Confounders
        confounders = self.confound_engine.detect_confounders(
            patient_id=patient_id,
            context_events=timeline_events,
        )

        # 4. Quality flags
        quality_flags = self.missing_data_engine.detect_gaps(
            patient_id=patient_id,
            expected_modalities=modality_filter,
        )

        # 5. Hypotheses
        observation = timeline_events[-1] if timeline_events else None
        hypotheses = self.hypothesis_engine.rank_hypotheses(
            patient_id=patient_id,
            observation_event=observation,
            max_hypotheses=request.max_hypotheses,
        )

        # 6. Evidence linking
        all_insights = correlations + confounders + hypotheses + quality_flags
        all_insights = self.evidence_engine.attach_evidence(all_insights)

        # 7. Apply safety governance
        correlations = SafetyGovernance.apply_all([c for c in all_insights if c.insight_type == "correlation"])
        confounders = SafetyGovernance.apply_all([c for c in all_insights if c.insight_type == "confound"])
        hypotheses = SafetyGovernance.apply_all([c for c in all_insights if c.insight_type == "hypothesis"])
        quality_flags = SafetyGovernance.apply_all([c for c in all_insights if c.insight_type == "quality_flag"])

        # Build evidence summary
        evidence_summary = self._build_evidence_summary(
            correlations, confounders, hypotheses, quality_flags
        )

        return SynthesisResponse(
            patient_id=patient_id,
            timeline=[e.to_dict() for e in timeline_events],
            correlations=[c.to_dict() for c in correlations],
            confounders=[c.to_dict() for c in confounders],
            quality_flags=[q.to_dict() for q in quality_flags],
            ranked_hypotheses=[h.to_dict() for h in hypotheses],
            evidence_summary=evidence_summary,
        )

    def get_timeline(
        self,
        patient_id: str,
        modality_filter: Optional[List[str]] = None,
        date_range: Optional[Tuple[datetime, datetime]] = None,
    ) -> List[MultimodalEvent]:
        return self.timeline_engine.build_timeline(
            patient_id=patient_id,
            modality_filter=modality_filter,
            date_range=date_range,
        )

    def get_correlations(
        self,
        patient_id: str,
        window_days: int = 30,
        min_confidence: float = 0.5,
    ) -> List[IntelligenceOutput]:
        correlations = self.correlation_engine.find_correlations(
            patient_id=patient_id,
            window_days=window_days,
            min_confidence=min_confidence,
        )
        return SafetyGovernance.apply_all(correlations)

    def get_confounders(
        self,
        patient_id: str,
    ) -> List[IntelligenceOutput]:
        confounders = self.confound_engine.detect_confounders(patient_id=patient_id)
        return SafetyGovernance.apply_all(confounders)

    def get_quality_flags(
        self,
        patient_id: str,
    ) -> List[IntelligenceOutput]:
        flags = self.missing_data_engine.detect_gaps(patient_id=patient_id)
        return SafetyGovernance.apply_all(flags)

    def _build_evidence_summary(
        self,
        correlations: List[IntelligenceOutput],
        confounders: List[IntelligenceOutput],
        hypotheses: List[IntelligenceOutput],
        quality_flags: List[IntelligenceOutput],
    ) -> Dict[str, Any]:
        total_insights = len(correlations) + len(confounders) + len(hypotheses) + len(quality_flags)
        evidence_grades = []
        for insight in correlations + confounders + hypotheses + quality_flags:
            for ev in insight.evidence_links:
                evidence_grades.append(ev.get("evidence_grade", "D"))

        grade_distribution = {"A": 0, "B": 0, "C": 0, "D": 0}
        for g in evidence_grades:
            grade_distribution[g] = grade_distribution.get(g, 0) + 1

        avg_confidence = 0.0
        if total_insights > 0:
            all_confs = [i.confidence for i in correlations + confounders + hypotheses + quality_flags]
            avg_confidence = round(sum(all_confs) / len(all_confs), 3)

        return {
            "total_insights": total_insights,
            "correlations": len(correlations),
            "confounders": len(confounders),
            "hypotheses": len(hypotheses),
            "quality_flags": len(quality_flags),
            "evidence_grades": grade_distribution,
            "average_confidence": avg_confidence,
            "generated_at": datetime.utcnow().isoformat(),
        }
