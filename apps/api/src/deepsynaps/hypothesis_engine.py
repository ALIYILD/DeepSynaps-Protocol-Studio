"""Module 5: HypothesisRankingEngine — ranks clinical hypotheses."""

from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from contracts import IntelligenceOutput, MultimodalEvent
from knowledge_layer import KnowledgeLayer


class HypothesisRankingEngine:
    """Ranks clinical hypotheses based on multimodal evidence."""

    def __init__(self, knowledge_layer: KnowledgeLayer):
        self.kl = knowledge_layer

    def rank_hypotheses(
        self,
        patient_id: str,
        observation_event: Optional[MultimodalEvent] = None,
        max_hypotheses: int = 5,
    ) -> List[IntelligenceOutput]:
        """Rank clinical hypotheses for a patient based on available evidence."""
        end_date = datetime.utcnow()
        start_date = end_date - timedelta(days=90)
        events = self.kl.get_events_for_patient(
            patient_id=patient_id,
            date_range=(start_date, end_date),
        )
        if not events:
            return []

        hypotheses = self._generate_hypotheses(patient_id, events, observation_event)
        hypotheses.sort(key=lambda h: h.confidence, reverse=True)
        return hypotheses[:max_hypotheses]

    def _generate_hypotheses(
        self,
        patient_id: str,
        events: List[MultimodalEvent],
        observation_event: Optional[MultimodalEvent],
    ) -> List[IntelligenceOutput]:
        hypotheses = []
        modalities_present = set(e.modality for e in events)
        window = (min(e.timestamp for e in events), max(e.timestamp for e in events))

        event_ids = [e.event_id for e in events]

        # Hypothesis 1: Cognitive change pattern
        if {"assessment", "qeeg"}.issubset(modalities_present) or {"assessment", "biomarker"}.issubset(modalities_present):
            hypotheses.append(IntelligenceOutput(
                patient_id=patient_id,
                insight_type="hypothesis",
                modalities_involved=list(modalities_present & {"assessment", "qeeg", "biomarker", "mri"}),
                timeline_window=window,
                summary=(
                    "Cognitive performance changes observed with associated multimodal signals. "
                    "Multiple data streams show temporally aligned patterns. "
                    "Temporal association only. Not causal proof."
                ),
                supporting_events=event_ids[:6],
                confidence=0.72,
                uncertainty_drivers=[
                    "Single-patient observation without control group",
                    "Multiple unmeasured confounders may exist",
                    "Longitudinal follow-up needed for validation",
                ],
                safety_labels=[
                    "Ranked clinical hypothesis. Requires clinician review.",
                    "Decision support only. Requires clinician review.",
                    "Temporal association only. Not causal proof.",
                ],
            ))

        # Hypothesis 2: Sleep-cognition link
        if "wearable" in modalities_present and "assessment" in modalities_present:
            hypotheses.append(IntelligenceOutput(
                patient_id=patient_id,
                insight_type="hypothesis",
                modalities_involved=["wearable", "assessment"],
                timeline_window=window,
                summary=(
                    "Sleep patterns and cognitive assessments show temporal co-variation. "
                    "Poor sleep periods may be associated with lower cognitive scores. "
                    "Temporal association only. Not causal proof."
                ),
                supporting_events=event_ids[:6],
                confidence=0.58,
                uncertainty_drivers=[
                    "Sleep data quality and measurement method varies",
                    "Direction of association unclear",
                    "Other lifestyle factors not measured",
                ],
                safety_labels=[
                    "Ranked clinical hypothesis. Requires clinician review.",
                    "Decision support only. Requires clinician review.",
                ],
            ))

        # Hypothesis 3: Medication effect
        if "medication" in modalities_present:
            hypotheses.append(IntelligenceOutput(
                patient_id=patient_id,
                insight_type="hypothesis",
                modalities_involved=["medication"] + [m for m in modalities_present if m != "medication"][:3],
                timeline_window=window,
                summary=(
                    "Medication changes temporally overlap with changes in other clinical measures. "
                    "Effect attribution is uncertain due to multiple concurrent factors. "
                    "Temporal association only. Not causal proof."
                ),
                supporting_events=event_ids[:6],
                confidence=0.45,
                uncertainty_drivers=[
                    "Multiple medication changes may overlap",
                    "Patient adherence not fully verified",
                    "Placebo and nocebo effects possible",
                ],
                safety_labels=[
                    "Ranked clinical hypothesis. Requires clinician review.",
                    "Decision support only. Requires clinician review.",
                ],
            ))

        # Hypothesis 4: Biomarker trend
        if "biomarker" in modalities_present:
            hypotheses.append(IntelligenceOutput(
                patient_id=patient_id,
                insight_type="hypothesis",
                modalities_involved=["biomarker", "mri", "assessment"],
                timeline_window=window,
                summary=(
                    "Biomarker trends show patterns that may be associated with structural "
                    "or functional changes in other modalities. "
                    "Temporal association only. Not causal proof."
                ),
                supporting_events=event_ids[:6],
                confidence=0.65,
                uncertainty_drivers=[
                    "Biomarker specificity varies by analyte",
                    "Temporal precedence not established",
                    "Clinical significance thresholds may vary",
                ],
                safety_labels=[
                    "Ranked clinical hypothesis. Requires clinician review.",
                    "Decision support only. Requires clinician review.",
                ],
            ))

        return hypotheses
