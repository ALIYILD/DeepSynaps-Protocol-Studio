"""Hypothesis Ranking Engine — ranks clinical hypotheses for observed changes."""

from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple
import uuid

from contracts import (
    ConfounderCandidate,
    EvidenceLink,
    IntelligenceOutput,
    MultimodalEvent,
)
from knowledge_layer import KnowledgeLayer
from safety_governance import SafetyGovernance


class HypothesisRankingEngine:
    """
    Ranks possible clinical hypotheses for an observed change in a patient's
    multimodal data.  Scores are based on supporting-evidence strength,
    temporal proximity, and cross-modal agreement.
    """

    # Maximum allowed confidence — never 0.95 or above
    MAX_SCORE = 0.94

    # Score weights
    WEIGHT_EVIDENCE_STRENGTH = 0.40
    WEIGHT_TEMPORAL_PROXIMITY = 0.35
    WEIGHT_MODAL_AGREEMENT = 0.25

    # Temporal look-back windows (days) for different hypothesis types
    TEMPORAL_WINDOWS = {
        "intervention_related_change": 30,
        "medication_related_change": 30,
        "biomarker_lab_confound": 60,
        "sleep_circadian_contribution": 14,
        "adherence_issue": 30,
        "measurement_artifact": 7,
        "data_sparsity": 90,
        "multimodal_agreement": 14,
    }

    def __init__(self, knowledge_layer: KnowledgeLayer):
        self.knowledge_layer = knowledge_layer

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def rank_hypotheses(
        self,
        patient_id: str,
        observation_event: MultimodalEvent,
        max_hypotheses: int = 5,
    ) -> List[IntelligenceOutput]:
        """
        Rank possible explanations for an observed change.

        Returns up to ``max_hypotheses`` IntelligenceOutput objects, sorted
        descending by score.  Every output is marked with:
          - safety_labels = ["Ranked clinical hypothesis. Requires clinician review."]
          - uncertainty_drivers (populated)
          - research_only = True
          - clinician_review_required = True
          - confidence < 0.95
        """
        now = datetime.utcnow()
        window_start = now - timedelta(days=180)

        # Retrieve patient's recent events
        patient_events = self.knowledge_layer.get_events_for_patient(
            patient_id, date_range=(window_start, now)
        )

        # Build each hypothesis
        hypotheses: List[Tuple[IntelligenceOutput, float]] = []

        for hyp_type in self.TEMPORAL_WINDOWS:
            output, score = self._build_hypothesis(
                hyp_type=hyp_type,
                patient_id=patient_id,
                observation_event=observation_event,
                patient_events=patient_events,
                now=now,
            )
            hypotheses.append((output, score))

        # Sort descending by score
        hypotheses.sort(key=lambda x: x[1], reverse=True)

        # Take top N
        top_hypotheses = [h[0] for h in hypotheses[:max_hypotheses]]

        # Run through safety governance
        validated = SafetyGovernance.apply_all(top_hypotheses)

        # Ensure hypothesis-specific label is present
        for output in validated:
            if (
                SafetyGovernance.REQUIRED_HYPOTHESIS_LABEL
                not in output.safety_labels
            ):
                output.safety_labels.append(
                    SafetyGovernance.REQUIRED_HYPOTHESIS_LABEL
                )
            # Ensure insight_type is hypothesis
            output.insight_type = "hypothesis"

        return validated

    # ------------------------------------------------------------------
    # Hypothesis builders
    # ------------------------------------------------------------------

    def _build_hypothesis(
        self,
        hyp_type: str,
        patient_id: str,
        observation_event: MultimodalEvent,
        patient_events: List[MultimodalEvent],
        now: datetime,
    ) -> Tuple[IntelligenceOutput, float]:
        """Build a single hypothesis and compute its score."""

        # Evidence strength
        evidence_score = self._score_evidence_strength(
            hyp_type, patient_events, observation_event
        )

        # Temporal proximity
        temporal_score = self._score_temporal_proximity(
            hyp_type, patient_events, observation_event, now
        )

        # Modal agreement
        modal_score = self._score_modal_agreement(
            hyp_type, patient_events, observation_event
        )

        # Weighted total
        raw_score = (
            self.WEIGHT_EVIDENCE_STRENGTH * evidence_score
            + self.WEIGHT_TEMPORAL_PROXIMITY * temporal_score
            + self.WEIGHT_MODAL_AGREEMENT * modal_score
        )

        # Cap at MAX_SCORE
        final_score = min(round(raw_score, 4), self.MAX_SCORE)

        # Build summary and uncertainty drivers
        summary = self._hypothesis_summary(
            hyp_type, observation_event, evidence_score, temporal_score, modal_score
        )
        uncertainty_drivers = self._hypothesis_uncertainty(
            hyp_type, evidence_score, temporal_score, modal_score, patient_events
        )

        # Determine modalities involved
        modalities = self._hypothesis_modalities(hyp_type, observation_event)

        # Timeline window
        lookback_days = self.TEMPORAL_WINDOWS[hyp_type]
        timeline_window = (now - timedelta(days=lookback_days), now)

        # Confounders
        confounders = self._extract_confounders(hyp_type, patient_events)

        # Build evidence links
        evidence_links = self._hypothesis_evidence_links(hyp_type, modalities)

        output = IntelligenceOutput(
            patient_id=patient_id,
            insight_type="hypothesis",
            modalities_involved=modalities,
            timeline_window=timeline_window,
            summary=summary,
            supporting_events=[
                e.event_id for e in patient_events
                if e.event_type != "measurement_artifact"
            ],
            confounders=[c.to_dict() for c in confounders],
            evidence_links=[ev.to_dict() for ev in evidence_links],
            confidence=final_score,
            uncertainty_drivers=uncertainty_drivers,
            research_only=True,
            clinician_review_required=True,
            safety_labels=[
                "Ranked clinical hypothesis. Requires clinician review."
            ],
        )

        return output, final_score

    # ------------------------------------------------------------------
    # Scoring components
    # ------------------------------------------------------------------

    def _score_evidence_strength(
        self,
        hyp_type: str,
        events: List[MultimodalEvent],
        observation_event: MultimodalEvent,
    ) -> float:
        """Score 0.0-1.0 based on supporting evidence quality."""
        relevant_events = [e for e in events if self._event_relevant(e, hyp_type)]
        if not relevant_events:
            return 0.2

        # Average confidence of relevant events, weighted by data quality
        total_weight = 0.0
        weighted_sum = 0.0
        quality_weights = {"high": 1.0, "medium": 0.7, "low": 0.4, "unknown": 0.5}

        for e in relevant_events:
            qw = quality_weights.get(e.data_quality, 0.5)
            weighted_sum += e.confidence * qw
            total_weight += qw

        avg_confidence = weighted_sum / total_weight if total_weight else 0.3

        # Scale to 0.0-1.0
        return min(max(avg_confidence, 0.0), 1.0)

    def _score_temporal_proximity(
        self,
        hyp_type: str,
        events: List[MultimodalEvent],
        observation_event: Optional[MultimodalEvent],
        now: datetime,
    ) -> float:
        """Score 0.0-1.0 based on how close relevant events are in time."""
        window_days = self.TEMPORAL_WINDOWS[hyp_type]
        window_start = now - timedelta(days=window_days)

        relevant = [
            e for e in events
            if self._event_relevant(e, hyp_type)
            and e.timestamp >= window_start
        ]

        if not relevant:
            return 0.1

        if observation_event is None:
            # Score based on recency when no observation event
            total_days = 0.0
            for e in relevant:
                diff = abs((now - e.timestamp).total_seconds()) / 86400.0
                total_days += diff
            avg_days = total_days / len(relevant)
            score = max(0.0, 1.0 - (avg_days / window_days))
            return min(score, 1.0)

        # Compute average days from observation event
        obs_time = observation_event.timestamp
        total_days = 0.0
        for e in relevant:
            diff = abs((e.timestamp - obs_time).total_seconds()) / 86400.0
            total_days += diff

        avg_days = total_days / len(relevant)

        # Score inversely proportional to average distance
        score = max(0.0, 1.0 - (avg_days / window_days))
        return min(score, 1.0)

    def _score_modal_agreement(
        self,
        hyp_type: str,
        events: List[MultimodalEvent],
        observation_event: Optional[MultimodalEvent],
    ) -> float:
        """Score 0.0-1.0 based on cross-modal agreement."""
        if observation_event is None:
            return 0.5  # neutral when no specific observation is provided
        observed_modality = observation_event.modality

        # Count events from different modalities that support the hypothesis
        supporting_modalities = set()
        for e in events:
            if e.modality != observed_modality and self._event_relevant(e, hyp_type):
                supporting_modalities.add(e.modality)

        # More supporting modalities = higher agreement score
        num_supporting = len(supporting_modalities)
        if num_supporting >= 3:
            return 1.0
        if num_supporting == 2:
            return 0.75
        if num_supporting == 1:
            return 0.45
        return 0.15

    # ------------------------------------------------------------------
    # Summaries, uncertainty, modalities, confounders, evidence
    # ------------------------------------------------------------------

    def _hypothesis_summary(
        self,
        hyp_type: str,
        observation_event: Optional[MultimodalEvent],
        evidence_score: float,
        temporal_score: float,
        modal_score: float,
    ) -> str:
        """Generate a human-readable hypothesis summary."""
        event_desc = observation_event.value_summary if observation_event else "clinical changes"
        summaries = {
            "intervention_related_change": (
                f"Observed {event_desc} may be related to a "
                f"recent intervention. Evidence score: {evidence_score:.2f}, "
                f"temporal score: {temporal_score:.2f}, modal agreement: {modal_score:.2f}."
            ),
            "medication_related_change": (
                f"Observed {event_desc} may be related to a "
                f"recent medication change. Evidence score: {evidence_score:.2f}, "
                f"temporal score: {temporal_score:.2f}, modal agreement: {modal_score:.2f}."
            ),
            "biomarker_lab_confound": (
                f"Abnormal lab values may confound the observed "
                f"{event_desc}. Evidence score: {evidence_score:.2f}, "
                f"temporal score: {temporal_score:.2f}, modal agreement: {modal_score:.2f}."
            ),
            "sleep_circadian_contribution": (
                f"Sleep pattern data suggests a contribution to the observed "
                f"{event_desc}. Evidence score: {evidence_score:.2f}, "
                f"temporal score: {temporal_score:.2f}, modal agreement: {modal_score:.2f}."
            ),
            "adherence_issue": (
                f"Patient adherence gaps detected that may explain the observed "
                f"{event_desc}. Evidence score: {evidence_score:.2f}, "
                f"temporal score: {temporal_score:.2f}, modal agreement: {modal_score:.2f}."
            ),
            "measurement_artifact": (
                f"Data quality issues suggest the observed "
                f"{event_desc} may be a measurement artifact. "
                f"Evidence score: {evidence_score:.2f}, temporal score: {temporal_score:.2f}, "
                f"modal agreement: {modal_score:.2f}."
            ),
            "data_sparsity": (
                f"Too few data points for reliable inference about the observed "
                f"{event_desc}. Evidence score: {evidence_score:.2f}, "
                f"temporal score: {temporal_score:.2f}, modal agreement: {modal_score:.2f}."
            ),
            "multimodal_agreement": (
                f"Cross-modal analysis of the observed "
                f"{event_desc} shows variable agreement. "
                f"Evidence score: {evidence_score:.2f}, temporal score: {temporal_score:.2f}, "
                f"modal agreement: {modal_score:.2f}."
            ),
        }
        return summaries.get(hyp_type, f"Hypothesis {hyp_type} for {event_desc}")

    def _hypothesis_uncertainty(
        self,
        hyp_type: str,
        evidence_score: float,
        temporal_score: float,
        modal_score: float,
        patient_events: List[MultimodalEvent],
    ) -> List[str]:
        """Build specific uncertainty driver messages for a hypothesis."""
        drivers = []

        if evidence_score < 0.4:
            drivers.append("Limited supporting evidence strength")
        elif evidence_score < 0.7:
            drivers.append("Moderate supporting evidence; further validation needed")

        if temporal_score < 0.3:
            drivers.append("Weak temporal association; timing unclear")
        elif temporal_score < 0.6:
            drivers.append("Moderate temporal proximity; exact causal timing uncertain")

        if modal_score < 0.3:
            drivers.append("Limited cross-modal agreement")
        elif modal_score < 0.6:
            drivers.append("Partial cross-modal agreement")

        total_events = len(patient_events)
        if total_events < 5:
            drivers.append(f"Sparse event history ({total_events} events)")

        # Hypothesis-specific drivers
        hyp_specific = {
            "intervention_related_change": "Intervention details may be incomplete",
            "medication_related_change": "Medication history may have gaps",
            "biomarker_lab_confound": "Lab values may be within normal variance",
            "sleep_circadian_contribution": "Sleep data may have collection bias",
            "adherence_issue": "Adherence metrics may be indirect proxies",
            "measurement_artifact": "Artifact detection is probabilistic",
            "data_sparsity": "Insufficient data for reliable statistical inference",
            "multimodal_agreement": "Modalities may capture different phenomena",
        }
        if hyp_type in hyp_specific:
            drivers.append(hyp_specific[hyp_type])

        return drivers

    def _hypothesis_modalities(
        self,
        hyp_type: str,
        observation_event: Optional[MultimodalEvent],
    ) -> List[str]:
        """Determine which modalities are involved for the hypothesis."""
        base_mod = observation_event.modality if observation_event else "unknown"
        base = [base_mod]

        modality_map = {
            "intervention_related_change": ["intervention", "assessment"],
            "medication_related_change": ["medication", "biomarker"],
            "biomarker_lab_confound": ["biomarker", "lab", "bloodwork"],
            "sleep_circadian_contribution": ["wearable", "sleep", "qeeg"],
            "adherence_issue": ["medication", "wearable", "assessment"],
            "measurement_artifact": [base_mod, "quality"],
            "data_sparsity": [base_mod],
            "multimodal_agreement": [
                base_mod,
                "qeeg", "mri", "biomarker", "wearable", "voice",
            ],
        }

        extras = modality_map.get(hyp_type, [])
        for m in extras:
            if m not in base:
                base.append(m)

        return base

    def _extract_confounders(
        self,
        hyp_type: str,
        events: List[MultimodalEvent],
    ) -> List[ConfounderCandidate]:
        """Extract confounders relevant to the hypothesis type."""
        confounders = []

        # Sleep-related confounders
        if hyp_type in ("sleep_circadian_contribution", "multimodal_agreement"):
            sleep_events = [e for e in events if e.modality in ("wearable", "sleep")]
            if sleep_events:
                confounders.append(ConfounderCandidate(
                    confounder_type="sleep",
                    description="Sleep quality may affect observed measures",
                    severity="moderate",
                    evidence_events=[e.event_id for e in sleep_events],
                    impact_estimate="moderate",
                    mitigation_suggestion="Collect additional sleep data",
                ))

        # Medication-related confounders
        if hyp_type in ("medication_related_change", "adherence_issue"):
            med_events = [e for e in events if e.modality == "medication"]
            if med_events:
                confounders.append(ConfounderCandidate(
                    confounder_type="medication",
                    description="Medication changes may confound results",
                    severity="high",
                    evidence_events=[e.event_id for e in med_events],
                    impact_estimate="high",
                    mitigation_suggestion="Review medication history",
                ))

        # Biomarker confounders
        if hyp_type == "biomarker_lab_confound":
            lab_events = [e for e in events if e.modality == "biomarker"]
            if lab_events:
                confounders.append(ConfounderCandidate(
                    confounder_type="biomarker",
                    description="Lab variability may explain observed changes",
                    severity="moderate",
                    evidence_events=[e.event_id for e in lab_events],
                    impact_estimate="moderate",
                    mitigation_suggestion="Repeat lab measurements",
                ))

        # Data quality confounders
        if hyp_type == "measurement_artifact":
            low_quality = [e for e in events if e.data_quality in ("low", "missing")]
            if low_quality:
                confounders.append(ConfounderCandidate(
                    confounder_type="quality",
                    description="Low data quality may produce artifacts",
                    severity="high",
                    evidence_events=[e.event_id for e in low_quality],
                    impact_estimate="high",
                    mitigation_suggestion="Re-collect low-quality data points",
                ))

        return confounders

    def _hypothesis_evidence_links(
        self,
        hyp_type: str,
        modalities: List[str],
    ) -> List[EvidenceLink]:
        """Fetch evidence links for the hypothesis."""
        evidence = self.knowledge_layer.get_evidence_for_modalities(modalities)

        # If no evidence found, create a placeholder
        if not evidence:
            evidence = [
                EvidenceLink(
                    evidence_id=f"hyp_{hyp_type}_fallback",
                    source_type="inferred",
                    citation=f"Inferred hypothesis: {hyp_type}",
                    evidence_grade="D",
                    confidence=0.35,
                    research_only=True,
                    conflicting=False,
                    url=None,
                )
            ]

        return evidence

    # ------------------------------------------------------------------
    # Helper
    # ------------------------------------------------------------------

    def _event_relevant(self, event: MultimodalEvent, hyp_type: str) -> bool:
        """Check if an event is relevant to a hypothesis type."""
        relevance_map = {
            "intervention_related_change": ["intervention", "procedure", "therapy"],
            "medication_related_change": ["medication", "prescription", "drug"],
            "biomarker_lab_confound": ["biomarker", "lab", "bloodwork"],
            "sleep_circadian_contribution": ["wearable", "sleep"],
            "adherence_issue": ["medication", "adherence", "wearable"],
            "measurement_artifact": ["quality", "calibration", "artifact"],
            "data_sparsity": [],  # All events are relevant
            "multimodal_agreement": [],  # All events are relevant
        }

        relevant_types = relevance_map.get(hyp_type, [])
        if not relevant_types:
            return True

        return event.event_type in relevant_types or event.modality in relevant_types
