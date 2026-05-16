"""Module 4: EvidenceLinkingEngine — attaches evidence citations to insights."""

from typing import Any, Dict, List

from contracts import EvidenceLink, IntelligenceOutput
from knowledge_layer import KnowledgeLayer


class EvidenceLinkingEngine:
    """Attaches relevant evidence citations to intelligence outputs."""

    def __init__(self, knowledge_layer: KnowledgeLayer):
        self.kl = knowledge_layer

    def attach_evidence(self, insights: List[IntelligenceOutput]) -> List[IntelligenceOutput]:
        """Attach relevant evidence links to each insight based on involved modalities."""
        for insight in insights:
            modalities = insight.modalities_involved or []
            evidence_links = self.kl.get_evidence_for_modalities(modalities)
            insight.evidence_links = [ev.to_dict() for ev in evidence_links]
            if insight.evidence_links:
                avg_confidence = sum(ev.confidence for ev in evidence_links) / len(evidence_links)
                insight.confidence = round(min(avg_confidence, insight.confidence + 0.05, 0.94), 3)
        return insights
