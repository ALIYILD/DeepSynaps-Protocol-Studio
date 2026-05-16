"""Module 3: ConfoundEngine — detects potential confounders."""

from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

from contracts import ConfounderCandidate, IntelligenceOutput, MultimodalEvent
from knowledge_layer import KnowledgeLayer


class ConfoundEngine:
    """Detects potential confounders for clinical observations."""

    CONFOUNDER_RULES = [
        {
            "confounder_type": "medication",
            "modality_trigger": "medication",
            "target_modalities": ["assessment", "qeeg", "biomarker", "voice"],
            "description": "Anticholinergic or psychoactive medication may affect cognitive and functional assessments",
            "severity": "high",
            "impact_estimate": "May reduce cognitive test scores by 10-20%",
            "mitigation_suggestion": "Review medication timing relative to assessment dates. Consider washout periods.",
        },
        {
            "confounder_type": "sleep",
            "modality_trigger": "wearable",
            "target_modalities": ["assessment", "qeeg", "voice", "biomarker"],
            "description": "Sleep disruption may confound cognitive performance and biomarker readings",
            "severity": "moderate",
            "impact_estimate": "Poor sleep may reduce attention scores by 15%",
            "mitigation_suggestion": "Check wearable sleep data for the 3 days prior to each assessment.",
        },
        {
            "confounder_type": "adherence",
            "modality_trigger": "medication",
            "target_modalities": ["biomarker", "mri", "assessment"],
            "description": "Medication non-adherence may confound longitudinal biomarker trends",
            "severity": "high",
            "impact_estimate": "Variable drug levels may mask or mimic disease progression",
            "mitigation_suggestion": "Cross-reference medication events with refill records if available.",
        },
        {
            "confounder_type": "data_quality",
            "modality_trigger": None,
            "target_modalities": ["qeeg", "mri", "voice", "biomarker"],
            "description": "Low data quality or missing calibration may confound modality correlations",
            "severity": "moderate",
            "impact_estimate": "Poor quality data may produce spurious associations",
            "mitigation_suggestion": "Filter events with data_quality='low' or 'missing' before correlation analysis.",
        },
        {
            "confounder_type": "biomarker",
            "modality_trigger": "biomarker",
            "target_modalities": ["assessment", "mri", "qeeg"],
            "description": "Acute inflammatory biomarker elevation may transiently affect cognitive measures",
            "severity": "low",
            "impact_estimate": "Transient effects lasting 24-72 hours possible",
            "mitigation_suggestion": "Exclude assessment events within 72h of acute biomarker spikes.",
        },
    ]

    def __init__(self, knowledge_layer: KnowledgeLayer):
        self.kl = knowledge_layer

    def detect_confounders(
        self,
        patient_id: str,
        context_events: Optional[List[MultimodalEvent]] = None,
    ) -> List[IntelligenceOutput]:
        """Detect potential confounders for a patient's observations."""
        if context_events is None:
            end_date = datetime.utcnow()
            start_date = end_date - timedelta(days=180)
            context_events = self.kl.get_events_for_patient(
                patient_id=patient_id,
                date_range=(start_date, end_date),
            )
        if not context_events:
            return []

        confounders = []
        for rule in self.CONFOUNDER_RULES:
            result = self._apply_rule(patient_id, context_events, rule)
            if result:
                confounders.append(result)
        return confounders

    def _apply_rule(
        self,
        patient_id: str,
        events: List[MultimodalEvent],
        rule: Dict[str, Any],
    ) -> Optional[IntelligenceOutput]:
        trigger_events = [e for e in events if e.modality == rule["modality_trigger"]] if rule["modality_trigger"] else events
        target_events = [e for e in events if e.modality in rule["target_modalities"]]

        if not trigger_events and rule["modality_trigger"]:
            return None
        if not target_events:
            return None

        evidence_ids = [e.event_id for e in trigger_events[:5]] + [e.event_id for e in target_events[:5]]
        severity = rule["severity"]
        severity_score = {"high": 0.8, "moderate": 0.6, "low": 0.4}.get(severity, 0.5)

        candidate = ConfounderCandidate(
            confounder_type=rule["confounder_type"],
            description=rule["description"],
            severity=severity,
            evidence_events=evidence_ids[:8],
            impact_estimate=rule["impact_estimate"],
            mitigation_suggestion=rule["mitigation_suggestion"],
        )

        return IntelligenceOutput(
            patient_id=patient_id,
            insight_type="confound",
            modalities_involved=list(set(e.modality for e in trigger_events + target_events)),
            timeline_window=(min(e.timestamp for e in events), max(e.timestamp for e in events)),
            summary=f"Possible confounder: {rule['description']} [Temporal association only. Not causal proof.]",
            supporting_events=evidence_ids[:8],
            confounders=[candidate.to_dict()],
            confidence=round(severity_score, 3),
            uncertainty_drivers=[
                "Confounder detection based on temporal pattern matching",
                "Not all potential confounders may be captured",
                "Severity estimate is approximate and requires clinician judgment",
            ],
            safety_labels=[
                "Possible contributor.",
                "Decision support only. Requires clinician review.",
                "Temporal association only. Not causal proof.",
            ],
        )
