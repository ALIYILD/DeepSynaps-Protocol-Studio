"""Evidence Linking Engine — attaches, grades, and resolves conflicts for evidence."""

from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple
import uuid

from contracts import (
    EvidenceLink,
    IntelligenceOutput,
    MultimodalEvent,
)
from knowledge_layer import KnowledgeLayer
from safety_governance import SafetyGovernance


class EvidenceLinkingEngine:
    """
    Attaches evidence citations to intelligence outputs, grades evidence
    per GRADE methodology, and detects conflicting evidence.
    """

    # GRADE evidence grade order for comparison
    GRADE_ORDER = {"A": 4, "B": 3, "C": 2, "D": 1}

    # Grade thresholds based on evidence characteristics
    GRADE_A_CONFIDENCE_MIN = 0.80
    GRADE_B_CONFIDENCE_MIN = 0.60
    GRADE_C_CONFIDENCE_MIN = 0.40

    def __init__(self, knowledge_layer: KnowledgeLayer):
        self.knowledge_layer = knowledge_layer

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def attach_evidence(
        self, insights: List[IntelligenceOutput]
    ) -> List[IntelligenceOutput]:
        """
        For each insight:
          1. Pull internal evidence from the knowledge layer.
          2. Attach external provenance.
          3. Grade the evidence (A/B/C/D).
          4. Compute confidence score.
          5. Set research_only label for C/D grade.
          6. Detect and attach conflicting evidence.
        """
        enriched = []
        for insight in insights:
            # 1. Internal evidence DB citations
            internal_evidence = self._fetch_internal_evidence(insight)

            # 2. External provenance
            external_evidence = self._fetch_external_provenance(insight)

            # Combine evidence lists
            all_evidence = internal_evidence + external_evidence

            # 3. Detect conflicting evidence
            conflicting = self.find_conflicting_evidence(insight)
            for ce in conflicting:
                if ce not in all_evidence:
                    all_evidence.append(ce)

            # 4. Grade the evidence
            aggregate_grade = self.grade_evidence(insight)

            # 5. Compute aggregate confidence from evidence
            aggregate_confidence = self._compute_aggregate_confidence(all_evidence)

            # 6. Determine research_only flag
            research_only = aggregate_grade in ("C", "D")

            # Update the insight
            insight.evidence_links = [ev.to_dict() for ev in all_evidence]
            insight.confidence = aggregate_confidence
            insight.research_only = research_only
            insight.clinician_review_required = True

            # Populate uncertainty_drivers
            if not insight.uncertainty_drivers:
                insight.uncertainty_drivers = self._build_uncertainty_drivers(
                    insight, all_evidence, aggregate_grade
                )

            # Ensure safety labels
            if not insight.safety_labels:
                insight.safety_labels = [
                    "Decision support only. Requires clinician review."
                ]

            # Apply safety governance
            result = SafetyGovernance.validate_output(insight)
            enriched.append(result["corrected"])

        return enriched

    def grade_evidence(self, insight: IntelligenceOutput) -> str:
        """
        Compute aggregate evidence grade (A/B/C/D) per GRADE:
          - A: Multiple RCTs or high-quality systematic reviews
          - B: Individual RCTs or well-conducted observational studies
          - C: Limited evidence, expert opinion
          - D: Very limited evidence, preliminary findings
        """
        if not insight.evidence_links:
            return "D"

        # Parse evidence_link dicts back to EvidenceLink for analysis
        evidence_objs = []
        for ev_dict in insight.evidence_links:
            if isinstance(ev_dict, dict):
                evidence_objs.append(EvidenceLink.from_dict(ev_dict))
            elif isinstance(ev_dict, EvidenceLink):
                evidence_objs.append(ev_dict)

        if not evidence_objs:
            return "D"

        # Count grade distribution
        grade_counts = {"A": 0, "B": 0, "C": 0, "D": 0}
        for ev in evidence_objs:
            grade_counts[ev.evidence_grade] = grade_counts.get(ev.evidence_grade, 0) + 1

        # Grade A: multiple high-quality (A-grade) evidence, or high confidence A
        if grade_counts["A"] >= 2:
            return "A"
        if grade_counts["A"] == 1 and len(evidence_objs) >= 3:
            return "A"

        # Grade B: at least one A or any B evidence
        if grade_counts["A"] == 1 or grade_counts["B"] >= 1:
            return "B"

        # Grade C: some C evidence
        if grade_counts["C"] >= 1:
            return "C"

        # Grade D: only D-grade or no evidence
        return "D"

    def find_conflicting_evidence(
        self, insight: IntelligenceOutput
    ) -> List[EvidenceLink]:
        """
        Find evidence citations that contradict the insight's findings.
        Looks for evidence with the conflicting flag set or evidence that
        counters the insight's modalities.
        """
        conflicting = []
        modalities = insight.modalities_involved or []

        # Fetch all evidence for the involved modalities
        all_evidence = self.knowledge_layer.get_evidence_for_modalities(modalities)

        # Evidence explicitly marked as conflicting
        for ev in all_evidence:
            if ev.conflicting and ev not in conflicting:
                conflicting.append(ev)

        # Also check for evidence with low confidence that contradicts
        for ev in all_evidence:
            if ev.evidence_grade in ("C", "D") and ev.conflicting:
                if ev not in conflicting:
                    conflicting.append(ev)

        return conflicting

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _fetch_internal_evidence(
        self, insight: IntelligenceOutput
    ) -> List[EvidenceLink]:
        """Pull evidence from the knowledge layer for the insight's modalities."""
        modalities = insight.modalities_involved or []
        if not modalities:
            return []
        return self.knowledge_layer.get_evidence_for_modalities(modalities)

    def _fetch_external_provenance(
        self, insight: IntelligenceOutput
    ) -> List[EvidenceLink]:
        """Build EvidenceLink objects from the provenance of supporting events."""
        external = []
        # Use supporting_events IDs to look up provenance
        for event_id in insight.supporting_events or []:
            # Build a minimal external evidence link from event provenance
            # In production this would query an external literature DB
            ev = EvidenceLink(
                evidence_id=f"ext_{event_id}",
                source_type="provenance",
                citation=f"External provenance for event {event_id}",
                evidence_grade="C",
                confidence=0.50,
                research_only=True,
                conflicting=False,
                url=None,
            )
            external.append(ev)
        return external

    def _compute_aggregate_confidence(
        self, evidence_list: List[EvidenceLink]
    ) -> float:
        """
        Compute a combined confidence score from evidence.
        NEVER returns >= 0.95.
        """
        if not evidence_list:
            return 0.35

        # Weighted average of evidence confidence, weighted by grade
        total_weight = 0.0
        weighted_sum = 0.0
        for ev in evidence_list:
            grade_weight = self.GRADE_ORDER.get(ev.evidence_grade, 1)
            weighted_sum += ev.confidence * grade_weight
            total_weight += grade_weight

        if total_weight == 0:
            aggregate = 0.35
        else:
            aggregate = weighted_sum / total_weight

        # Cap below 0.95
        return min(aggregate, SafetyGovernance.MAX_CONFIDENCE - 0.01)

    def _build_uncertainty_drivers(
        self,
        insight: IntelligenceOutput,
        evidence_list: List[EvidenceLink],
        grade: str,
    ) -> List[str]:
        """Build specific uncertainty driver messages."""
        drivers = []

        if grade in ("C", "D"):
            drivers.append(
                f"Evidence grade {grade}: limited or preliminary evidence available"
            )

        if not evidence_list:
            drivers.append("No evidence links available for the involved modalities")

        conflicting = [ev for ev in evidence_list if ev.conflicting]
        if conflicting:
            drivers.append(
                f"{len(conflicting)} conflicting evidence source(s) detected"
            )

        if len(insight.modalities_involved or []) < 2:
            drivers.append(
                "Single-modality analysis: limited cross-modal validation"
            )

        if not drivers:
            drivers.append("Temporal association only; causal inference not supported")

        return drivers
