"""Module 1: MultimodalTimelineEngine — builds ordered patient timelines."""

from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

from contracts import MultimodalEvent
from knowledge_layer import KnowledgeLayer


class MultimodalTimelineEngine:
    """Builds a multimodal timeline for a given patient."""

    def __init__(self, knowledge_layer: KnowledgeLayer):
        self.kl = knowledge_layer

    def build_timeline(
        self,
        patient_id: str,
        modality_filter: Optional[List[str]] = None,
        date_range: Optional[Tuple[datetime, datetime]] = None,
    ) -> List[MultimodalEvent]:
        """Build a timeline of events for a patient, ordered by timestamp."""
        events = self.kl.get_events_for_patient(
            patient_id=patient_id,
            modality_filter=modality_filter,
            date_range=date_range,
        )
        return sorted(events, key=lambda e: e.timestamp)
