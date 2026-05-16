"""Module 6: MissingDataEngine — detects data gaps and quality issues."""

from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from contracts import IntelligenceOutput
from knowledge_layer import KnowledgeLayer


class MissingDataEngine:
    """Detects missing data, stale records, and quality issues."""

    EXPECTED_MODALITIES = [
        "assessment", "qeeg", "mri", "biomarker",
        "medication", "wearable", "voice", "patient_checkin",
    ]

    STALENESS_DAYS = {
        "assessment": 90,
        "qeeg": 180,
        "mri": 365,
        "biomarker": 90,
        "medication": 30,
        "wearable": 7,
        "voice": 30,
        "patient_checkin": 14,
    }

    def __init__(self, knowledge_layer: KnowledgeLayer):
        self.kl = knowledge_layer

    def detect_gaps(
        self,
        patient_id: str,
        expected_modalities: Optional[List[str]] = None,
    ) -> List[IntelligenceOutput]:
        """Detect missing or stale data for a patient."""
        modalities = expected_modalities or self.EXPECTED_MODALITIES
        end_date = datetime.utcnow()
        start_date = end_date - timedelta(days=365)
        events = self.kl.get_events_for_patient(
            patient_id=patient_id,
            date_range=(start_date, end_date),
        )

        present_modalities = {}
        for evt in events:
            if evt.modality not in present_modalities:
                present_modalities[evt.modality] = evt
            elif evt.timestamp > present_modalities[evt.modality].timestamp:
                present_modalities[evt.modality] = evt

        flags = []
        window = (start_date, end_date)

        for modality in modalities:
            if modality not in present_modalities:
                flags.append(self._build_gap_flag(
                    patient_id, modality, "missing", window,
                    f"No {modality} data found in the last 365 days. "
                    f"This modality is important for multimodal synthesis.",
                ))
            else:
                last_event = present_modalities[modality]
                days_since = (end_date - last_event.timestamp).days
                threshold = self.STALENESS_DAYS.get(modality, 90)
                if days_since > threshold:
                    flags.append(self._build_gap_flag(
                        patient_id, modality, "stale", window,
                        f"Last {modality} data is {days_since} days old "
                        f"(threshold: {threshold} days). Data may be outdated.",
                        last_event.event_id,
                    ))
                if last_event.data_quality in ("low", "missing"):
                    flags.append(self._build_gap_flag(
                        patient_id, modality, "quality", window,
                        f"Latest {modality} record has data quality: '{last_event.data_quality}'. "
                        f"Results using this modality may be less reliable.",
                        last_event.event_id,
                    ))

        return flags

    def _build_gap_flag(
        self,
        patient_id: str,
        modality: str,
        flag_type: str,
        window: tuple,
        description: str,
        event_id: str = "",
    ) -> IntelligenceOutput:
        severity_map = {"missing": "high", "stale": "moderate", "quality": "moderate"}
        severity = severity_map.get(flag_type, "moderate")
        confidence_map = {"missing": 0.95, "stale": 0.85, "quality": 0.75}

        suggestion_map = {
            "assessment": "Schedule a follow-up cognitive assessment.",
            "qeeg": "Arrange qEEG recording session.",
            "mri": "Consider structural MRI if clinically indicated.",
            "biomarker": "Order relevant biomarker panel.",
            "medication": "Review medication history with patient.",
            "wearable": "Ensure wearable device is active and syncing.",
            "voice": "Schedule voice sample collection.",
            "patient_checkin": "Send patient check-in reminder.",
        }

        return IntelligenceOutput(
            patient_id=patient_id,
            insight_type="quality_flag",
            modalities_involved=[modality],
            timeline_window=window,
            summary=description,
            supporting_events=[event_id] if event_id else [],
            confidence=confidence_map.get(flag_type, 0.7),
            uncertainty_drivers=[
                "Flag based on record timestamps and metadata only",
                "Data may exist in external systems not yet integrated",
                "Thresholds for staleness are configurable defaults",
            ],
            safety_labels=[
                "Decision support only. Requires clinician review.",
                "Data quality flag — verify with source systems.",
            ],
        )
