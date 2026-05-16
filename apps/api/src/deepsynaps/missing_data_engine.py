"""Missing Data Engine — detects gaps, staleness, and completeness issues."""

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple
import uuid
from time_utils import utc_now

from contracts import (
    ConfounderCandidate,
    EvidenceLink,
    IntelligenceOutput,
    MultimodalEvent,
)
from knowledge_layer import KnowledgeLayer
from safety_governance import SafetyGovernance


class MissingDataEngine:
    """
    Detects missing or stale data across all expected modalities.

    Each detection produces an ``IntelligenceOutput`` with:
      - insight_type="quality_flag"
      - severity-based confidence (higher severity → higher confidence)
      - specific mitigation suggestions
      - clinician_review_required=True
    """

    # Default staleness thresholds (days) per modality
    DEFAULT_THRESHOLDS = {
        "qeeg": 90,
        "mri": 180,
        "biomarker": 90,
        "assessment_baseline": None,  # Required once
        "outcome_followup": 30,
        "wearable": 14,
        "medication_history": None,  # Gap detection
        "signed_report": 90,
        "evidence_link": None,  # Check per event
        "consent": None,  # Required once
    }

    # Severity mapping to confidence (never >= 0.95)
    SEVERITY_CONFIDENCE = {
        "critical": 0.92,
        "high": 0.85,
        "moderate": 0.65,
        "low": 0.45,
    }

    def __init__(self, knowledge_layer: KnowledgeLayer):
        self.knowledge_layer = knowledge_layer

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def detect_gaps(
        self,
        patient_id: str,
        expected_modalities: Optional[List[str]] = None,
    ) -> List[IntelligenceOutput]:
        """
        Detect missing or stale data for a patient.

        Parameters
        ----------
        patient_id : str
            The patient to check.
        expected_modalities : list[str] | None
            Modalities to check.  Defaults to all defined thresholds.

        Returns
        -------
        list[IntelligenceOutput]
            One ``IntelligenceOutput`` per detected gap.
        """
        now = utc_now()

        # Retrieve all events for the patient
        all_events = self.knowledge_layer.get_events_for_patient(patient_id)

        modalities_to_check = expected_modalities or list(self.DEFAULT_THRESHOLDS.keys())
        gaps: List[IntelligenceOutput] = []

        for modality in modalities_to_check:
            gap = self._check_modality_gap(
                modality, patient_id, all_events, now
            )
            if gap is not None:
                gaps.append(gap)

        # Additional checks not tied to a single modality
        gaps.extend(self._check_no_evidence_links(patient_id, all_events, now))
        gaps.extend(self._check_no_consent(patient_id, all_events, now))
        gaps.extend(self._check_incomplete_medication_history(patient_id, all_events, now))

        # Apply safety governance
        validated = SafetyGovernance.apply_all(gaps)

        # Ensure quality_flag type and labels
        for output in validated:
            output.insight_type = "quality_flag"
            if not output.safety_labels:
                output.safety_labels = [
                    "Decision support only. Requires clinician review."
                ]

        return validated

    def check_staleness(
        self,
        event: MultimodalEvent,
        threshold_days: int,
    ) -> bool:
        """
        Check if an event is stale relative to a threshold.

        Parameters
        ----------
        event : MultimodalEvent
            The event to check.
        threshold_days : int
            Maximum age in days before the event is considered stale.

        Returns
        -------
        bool
            True if the event is older than ``threshold_days``.
        """
        now = utc_now()
        age = now - event.timestamp
        return age > timedelta(days=threshold_days)

    def check_completeness(
        self,
        events: List[MultimodalEvent],
    ) -> Dict[str, float]:
        """
        Compute completeness metrics per modality.

        Returns a dict mapping modality → completeness ratio (0.0-1.0).
        """
        if not events:
            return {modality: 0.0 for modality in self.DEFAULT_THRESHOLDS}

        # Group events by modality
        by_modality: Dict[str, List[MultimodalEvent]] = {}
        for e in events:
            by_modality.setdefault(e.modality, []).append(e)

        # Compute completeness: ratio of modalities with data vs expected
        completeness: Dict[str, float] = {}
        for modality in self.DEFAULT_THRESHOLDS:
            modality_events = by_modality.get(modality, [])
            if not modality_events:
                completeness[modality] = 0.0
            else:
                # Quality-weighted completeness
                quality_scores = []
                for e in modality_events:
                    q = e.data_quality
                    if q == "high":
                        quality_scores.append(1.0)
                    elif q == "medium":
                        quality_scores.append(0.7)
                    elif q == "low":
                        quality_scores.append(0.3)
                    elif q == "missing":
                        quality_scores.append(0.0)
                    else:
                        quality_scores.append(0.5)

                avg_quality = sum(quality_scores) / len(quality_scores)
                # Scale by recency: more recent events count more
                now = utc_now()
                recency_scores = []
                for e in modality_events:
                    age_days = (now - e.timestamp).total_seconds() / 86400.0
                    # Exponential decay over 90 days
                    recency = max(0.0, 1.0 - (age_days / 90.0))
                    recency_scores.append(recency)

                avg_recency = sum(recency_scores) / len(recency_scores)

                completeness[modality] = round(avg_quality * (0.5 + 0.5 * avg_recency), 4)

        return completeness

    # ------------------------------------------------------------------
    # Gap checkers
    # ------------------------------------------------------------------

    def _check_modality_gap(
        self,
        modality: str,
        patient_id: str,
        events: List[MultimodalEvent],
        now: datetime,
    ) -> Optional[IntelligenceOutput]:
        """Check for a specific modality gap and return a quality flag if found."""
        threshold = self.DEFAULT_THRESHOLDS.get(modality)

        # One-time required checks
        if threshold is None:
            return self._check_required_once(modality, patient_id, events, now)

        # Staleness checks
        modality_events = [e for e in events if e.modality == modality]
        if not modality_events:
            # Completely missing
            return self._build_gap_output(
                gap_type=f"missing_{modality}",
                patient_id=patient_id,
                severity="high",
                summary=f"No {modality} data on record for patient {patient_id}.",
                mitigation=f"Schedule {modality} data collection per protocol.",
                events=[],
                now=now,
                threshold_days=threshold,
            )

        # Check most recent event
        most_recent = max(modality_events, key=lambda e: e.timestamp)
        age = now - most_recent.timestamp

        if age > timedelta(days=threshold):
            days_overdue = (age - timedelta(days=threshold)).days
            return self._build_gap_output(
                gap_type=f"stale_{modality}",
                patient_id=patient_id,
                severity="moderate" if days_overdue <= 14 else "high",
                summary=(
                    f"Last {modality} data is {age.days} days old "
                    f"(threshold: {threshold} days; {days_overdue} days overdue)."
                ),
                mitigation=f"Collect fresh {modality} data.",
                events=[most_recent.event_id],
                now=now,
                threshold_days=threshold,
            )

        return None

    def _check_required_once(
        self,
        modality: str,
        patient_id: str,
        events: List[MultimodalEvent],
        now: datetime,
    ) -> Optional[IntelligenceOutput]:
        """Check for modalities that must exist at least once."""
        modality_events = [e for e in events if e.modality == modality]

        if not modality_events:
            severity_map = {
                "assessment_baseline": "critical",
                "consent": "critical",
                "medication_history": "high",
            }
            severity = severity_map.get(modality, "high")

            mitigation_map = {
                "assessment_baseline": "Conduct baseline assessment before any analysis.",
                "consent": "Obtain informed consent before proceeding.",
                "medication_history": "Complete medication history review.",
            }
            mitigation = mitigation_map.get(modality, f"Collect {modality} data.")

            return self._build_gap_output(
                gap_type=f"missing_{modality}",
                patient_id=patient_id,
                severity=severity,
                summary=f"No {modality} on record for patient {patient_id}.",
                mitigation=mitigation,
                events=[],
                now=now,
            )

        return None

    def _check_no_evidence_links(
        self,
        patient_id: str,
        events: List[MultimodalEvent],
        now: datetime,
    ) -> List[IntelligenceOutput]:
        """Flag events that have no evidence links attached."""
        events_without_links = [e for e in events if not e.evidence_links]

        if events_without_links:
            return [
                self._build_gap_output(
                    gap_type="no_evidence_link",
                    patient_id=patient_id,
                    severity="moderate",
                    summary=(
                        f"{len(events_without_links)} event(s) lack evidence links. "
                        f"Event IDs: {[e.event_id for e in events_without_links]}."
                    ),
                    mitigation="Attach evidence citations to unlinked events via EvidenceLinkingEngine.",
                    events=[e.event_id for e in events_without_links],
                    now=now,
                )
            ]
        return []

    def _check_no_consent(
        self,
        patient_id: str,
        events: List[MultimodalEvent],
        now: datetime,
    ) -> List[IntelligenceOutput]:
        """Flag missing consent documentation."""
        consent_events = [e for e in events if e.event_type == "consent" or e.modality == "consent"]

        if not consent_events:
            return [
                self._build_gap_output(
                    gap_type="no_consent",
                    patient_id=patient_id,
                    severity="critical",
                    summary=f"Missing consent documentation for patient {patient_id}.",
                    mitigation="Obtain and document informed consent before any data processing.",
                    events=[],
                    now=now,
                )
            ]
        return []

    def _check_incomplete_medication_history(
        self,
        patient_id: str,
        events: List[MultimodalEvent],
        now: datetime,
    ) -> List[IntelligenceOutput]:
        """Detect gaps in medication event timeline."""
        med_events = [e for e in events if e.modality == "medication"]

        if not med_events:
            return []

        # Sort by timestamp
        med_events.sort(key=lambda e: e.timestamp)

        # Look for gaps > 30 days between consecutive medication events
        gaps_found = []
        for i in range(1, len(med_events)):
            prev = med_events[i - 1]
            curr = med_events[i]
            gap = curr.timestamp - prev.timestamp
            if gap > timedelta(days=30):
                gaps_found.append({
                    "start": prev,
                    "end": curr,
                    "gap_days": gap.days,
                })

        if gaps_found:
            gap_summaries = [
                f"{g['start'].timestamp.date()} → {g['end'].timestamp.date()} "
                f"({g['gap_days']} days)"
                for g in gaps_found
            ]
            return [
                self._build_gap_output(
                    gap_type="incomplete_medication_history",
                    patient_id=patient_id,
                    severity="moderate",
                    summary=(
                        f"Medication history has {len(gaps_found)} gap(s): "
                        f"{'; '.join(gap_summaries)}."
                    ),
                    mitigation="Review medication records and fill gaps with pharmacy/clinic data.",
                    events=[e.event_id for e in med_events],
                    now=now,
                )
            ]
        return []

    # ------------------------------------------------------------------
    # Output builder
    # ------------------------------------------------------------------

    def _build_gap_output(
        self,
        gap_type: str,
        patient_id: str,
        severity: str,
        summary: str,
        mitigation: str,
        events: List[str],
        now: datetime,
        threshold_days: Optional[int] = None,
    ) -> IntelligenceOutput:
        """Build an IntelligenceOutput for a detected data gap."""
        confidence = self.SEVERITY_CONFIDENCE.get(severity, 0.45)

        # Extract modality from gap_type
        modality = gap_type.replace("missing_", "").replace("stale_", "").replace("incomplete_", "")
        if "no_evidence_link" in gap_type:
            modality = "evidence_link"
        elif "no_consent" in gap_type:
            modality = "consent"
        elif "no_signed_report" in gap_type:
            modality = "report"

        uncertainty_drivers = [
            f"Data gap severity: {severity}",
            "Incomplete multimodal dataset may limit inference quality",
            f"Mitigation: {mitigation}",
        ]

        if threshold_days:
            uncertainty_drivers.append(
                f"Threshold: {threshold_days} days exceeded"
            )

        timeline_start = now - timedelta(days=180)
        timeline_end = now

        output = IntelligenceOutput(
            patient_id=patient_id,
            insight_type="quality_flag",
            modalities_involved=[modality],
            timeline_window=(timeline_start, timeline_end),
            summary=summary,
            supporting_events=events,
            confidence=confidence,
            uncertainty_drivers=uncertainty_drivers,
            research_only=True,
            clinician_review_required=True,
            safety_labels=[
                "Decision support only. Requires clinician review."
            ],
        )
        return output
