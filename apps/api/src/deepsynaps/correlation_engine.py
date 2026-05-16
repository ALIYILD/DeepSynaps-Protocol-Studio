"""Module 2: CorrelationEngine — finds temporal associations across modalities."""

from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

from contracts import IntelligenceOutput, MultimodalEvent
from knowledge_layer import KnowledgeLayer


class CorrelationEngine:
    """Finds temporal associations between multimodal events."""

    def __init__(self, knowledge_layer: KnowledgeLayer):
        self.kl = knowledge_layer

    def find_correlations(
        self,
        patient_id: str,
        window_days: int = 30,
        min_confidence: float = 0.5,
    ) -> List[IntelligenceOutput]:
        """Find temporal correlations across modalities for a patient."""
        end_date = datetime.utcnow()
        start_date = end_date - timedelta(days=window_days)
        events = self.kl.get_events_for_patient(
            patient_id=patient_id,
            date_range=(start_date, end_date),
        )
        if len(events) < 2:
            return []

        correlations = []
        # Find temporal associations between events of different modalities
        modality_events: Dict[str, List[MultimodalEvent]] = {}
        for evt in events:
            modality_events.setdefault(evt.modality, []).append(evt)

        modalities = list(modality_events.keys())
        for i in range(len(modalities)):
            for j in range(i + 1, len(modalities)):
                mod_a, mod_b = modalities[i], modalities[j]
                for evt_a in modality_events[mod_a]:
                    for evt_b in modality_events[mod_b]:
                        time_diff = abs((evt_a.timestamp - evt_b.timestamp).days)
                        if time_diff <= window_days:
                            confidence = self._compute_confidence(evt_a, evt_b, time_diff, window_days)
                            if confidence >= min_confidence:
                                correlations.append(self._build_correlation(
                                    patient_id, evt_a, evt_b, confidence, (start_date, end_date)
                                ))
        return correlations

    def _compute_confidence(
        self,
        evt_a: MultimodalEvent,
        evt_b: MultimodalEvent,
        time_diff: int,
        window_days: int,
    ) -> float:
        """Compute correlation confidence based on temporal proximity and event confidence."""
        temporal_score = 1.0 - (time_diff / max(window_days, 1))
        quality_score = (
            (evt_a.confidence if evt_a.confidence > 0 else 0.5) +
            (evt_b.confidence if evt_b.confidence > 0 else 0.5)
        ) / 2
        return round(min(temporal_score * quality_score, 0.94), 3)

    def _build_correlation(
        self,
        patient_id: str,
        evt_a: MultimodalEvent,
        evt_b: MultimodalEvent,
        confidence: float,
        window: Tuple[datetime, datetime],
    ) -> IntelligenceOutput:
        return IntelligenceOutput(
            patient_id=patient_id,
            insight_type="correlation",
            modalities_involved=[evt_a.modality, evt_b.modality],
            timeline_window=window,
            summary=(
                f"Temporal association between {evt_a.modality} event "
                f"({evt_a.value_summary[:60]}) and {evt_b.modality} event "
                f"({evt_b.value_summary[:60]}). Temporal association only. Not causal proof."
            ),
            supporting_events=[evt_a.event_id, evt_b.event_id],
            confidence=confidence,
            uncertainty_drivers=[
                "Temporal proximity does not imply causation",
                "Additional confounders may explain the association",
                f"Based on {evt_a.modality} and {evt_b.modality} data only",
            ],
            safety_labels=[
                "Temporal association only. Not causal proof.",
                "Decision support only. Requires clinician review.",
            ],
        )
