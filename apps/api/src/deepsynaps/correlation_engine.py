"""CorrelationEngine — detects temporal associations between multimodal events."""

from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Tuple

from contracts import IntelligenceOutput, MultimodalEvent
from knowledge_layer import KnowledgeLayer
from safety_governance import SafetyGovernance


class CorrelationEngine:
    """Detects temporal relationships between multimodal patient events.

    Every output is explicitly labeled as temporal association only — never causal.
    """

    # Modality pairs of clinical interest for correlation detection
    INTERESTING_PAIRS = [
        ("interventions", "assessments"),
        ("sessions", "assessments"),
        ("wearables", "assessments"),
        ("medications", "wearables"),
        ("medications", "assessments"),
        ("medications", "voice"),
        ("medications", "text"),
        ("qeeg", "interventions"),
        ("qeeg", "sessions"),
        ("biomarkers", "wearables"),
        ("biomarkers", "assessments"),
        ("mri", "assessments"),
        ("mri", "biomarkers"),
        ("voice", "assessments"),
        ("text", "assessments"),
        ("video", "assessments"),
        ("movement", "assessments"),
        ("digital_phenotyping", "assessments"),
        ("patient_checkins", "medications"),
        ("patient_checkins", "wearables"),
        ("risk_signals", "biomarkers"),
        ("risk_signals", "mri"),
        ("reports", "assessments"),
        ("labs", "biomarkers"),
        ("labs", "wearables"),
    ]

    def __init__(self, knowledge_layer: KnowledgeLayer):
        self.kl = knowledge_layer

    def find_correlations(
        self,
        patient_id: str,
        window_days: int = 30,
        min_confidence: float = 0.5,
    ) -> List[IntelligenceOutput]:
        """Find temporal correlations between multimodal events.

        Parameters
        ----------
        patient_id: str
            Patient identifier.
        window_days: int
            Maximum days between paired events to consider them temporally related.
        min_confidence: float
            Minimum correlation score to include in results.

        Returns
        -------
        List[IntelligenceOutput]
            Each output represents a detected temporal association.
        """
        events = self.kl.get_events_for_patient(patient_id)
        if len(events) < 2:
            return []

        # Build modality-indexed event lists
        by_modality: Dict[str, List[MultimodalEvent]] = {}
        for evt in events:
            by_modality.setdefault(evt.modality, []).append(evt)

        outputs: List[IntelligenceOutput] = []
        seen_pairs = set()

        for mod_a, mod_b in self.INTERESTING_PAIRS:
            if mod_a not in by_modality or mod_b not in by_modality:
                continue

            for evt_a in by_modality[mod_a]:
                for evt_b in by_modality[mod_b]:
                    # Avoid self-pairing and duplicate (unordered) pairs
                    pair_key = tuple(sorted([evt_a.event_id, evt_b.event_id]))
                    if pair_key in seen_pairs:
                        continue
                    seen_pairs.add(pair_key)

                    # Check temporal proximity
                    delta = abs((evt_a.timestamp - evt_b.timestamp).total_seconds())
                    delta_days = delta / 86400.0
                    if delta_days > window_days:
                        continue

                    # Score the correlation
                    score = self._score_correlation(evt_a, evt_b, delta_days, window_days)
                    if score < min_confidence:
                        continue

                    # Build IntelligenceOutput
                    output = self._build_correlation_output(
                        patient_id, evt_a, evt_b, score, delta_days, window_days
                    )
                    outputs.append(output)

        # Apply safety governance and sort by confidence descending
        outputs = SafetyGovernance.apply_all(outputs)
        outputs.sort(key=lambda o: o.confidence, reverse=True)
        return outputs

    # ------------------------------------------------------------------
    # Scoring
    # ------------------------------------------------------------------

    def _score_correlation(
        self,
        evt_a: MultimodalEvent,
        evt_b: MultimodalEvent,
        delta_days: float,
        window_days: int,
    ) -> float:
        """Calculate correlation score based on proximity, quality, and confidence.

        Score = min(0.94, proximity_weight * quality_weight * confidence_weight)
        """
        # Proximity: closer events score higher (exponential decay)
        if window_days > 0:
            proximity_weight = max(0.1, 1.0 - (delta_days / window_days) ** 0.5)
        else:
            proximity_weight = 1.0

        # Data quality weight
        quality_map = {"high": 1.0, "medium": 0.75, "low": 0.5, "missing": 0.25, "unknown": 0.5}
        q_a = quality_map.get(evt_a.data_quality, 0.5)
        q_b = quality_map.get(evt_b.data_quality, 0.5)
        quality_weight = (q_a * q_b) ** 0.5  # geometric mean

        # Confidence weight
        conf_weight = min(1.0, ((evt_a.confidence + evt_b.confidence) / 2.0))

        raw_score = proximity_weight * quality_weight * conf_weight
        return min(0.94, round(raw_score, 4))

    # ------------------------------------------------------------------
    # Output construction
    # ------------------------------------------------------------------

    def _build_correlation_output(
        self,
        patient_id: str,
        evt_a: MultimodalEvent,
        evt_b: MultimodalEvent,
        score: float,
        delta_days: float,
        window_days: int,
    ) -> IntelligenceOutput:
        """Construct an IntelligenceOutput for a detected correlation."""
        modalities = sorted(list({evt_a.modality, evt_b.modality}))

        # Determine before/after relationship
        earlier, later = (evt_a, evt_b) if evt_a.timestamp <= evt_b.timestamp else (evt_b, evt_a)

        summary = (
            f"Temporal association detected between {earlier.modality} event "
            f"({earlier.value_summary}) and {later.modality} event "
            f"({later.value_summary}). "
            f"Events are separated by {delta_days:.1f} days within a {window_days}-day window. "
            f"{later.modality} event follows {earlier.modality} event. "
            f"Temporal association only. Not causal proof."
        )

        # Build timeline window spanning both events
        timeline_start = min(evt_a.timestamp, evt_b.timestamp) - timedelta(days=2)
        timeline_end = max(evt_a.timestamp, evt_b.timestamp) + timedelta(days=2)

        # Uncertainty drivers
        uncertainty_drivers = [
            "limited sample size (single-patient observation)",
            "no control group",
            "temporal association does not imply causation",
            "unmeasured confounders may explain the relationship",
            f"events are {delta_days:.1f} days apart — intervening factors unknown",
        ]

        output = IntelligenceOutput(
            patient_id=patient_id,
            insight_type="correlation",
            modalities_involved=modalities,
            timeline_window=(timeline_start, timeline_end),
            summary=summary,
            supporting_events=[earlier.event_id, later.event_id],
            conflicting_events=[],
            confounders=[],
            evidence_links=[],
            confidence=score,
            uncertainty_drivers=uncertainty_drivers,
            research_only=True,
            clinician_review_required=True,
            safety_labels=[
                "Temporal association only. Not causal proof.",
                "Decision support only. Requires clinician review.",
            ],
        )
        return output
