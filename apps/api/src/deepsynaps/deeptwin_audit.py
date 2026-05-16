"""DeepTwin Audit Logger — logs every clinician-facing DeepTwin action.

All events are written to the knowledge-layer audit table for compliance,
provenance tracking, and post-hoc review.  No patient data is logged
beyond identifiers — clinical content remains in the snapshot itself.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from deeptwin_contracts import DeepTwinAuditEvent
from knowledge_layer import KnowledgeLayer


class DeepTwinAuditLogger:
    """Logs DeepTwin-specific audit events to the knowledge layer.

    Provides a generic ``log_event`` method for arbitrary audit events,
    plus convenience methods for each supported event type so callers
cannot accidentally use an invalid event_type string.

    Parameters
    ----------
    knowledge_layer : KnowledgeLayer
        The governed knowledge layer providing the audit_log table.
    """

    def __init__(self, knowledge_layer: KnowledgeLayer) -> None:
        self.kl = knowledge_layer

    # ------------------------------------------------------------------
    # Generic event logging
    # ------------------------------------------------------------------

    def log_event(self, event: DeepTwinAuditEvent) -> str:
        """Log a DeepTwin audit event to the knowledge layer.

        Parameters
        ----------
        event : DeepTwinAuditEvent
            The fully-formed audit event to persist.

        Returns
        -------
        str
            The ``event_id`` of the logged event (for caller reference).
        """
        self.kl.log_audit(
            endpoint="/deeptwin",
            clinician_id=event.clinician_id,
            clinic_id=event.details.get("clinic_id", ""),
            patient_id=event.patient_id,
            action=event.event_type,
            request_hash=event.snapshot_id or "",
            response_status=event.details.get("status", "logged"),
        )
        return event.event_id

    # ------------------------------------------------------------------
    # Convenience methods — one per VALID_EVENT_TYPES
    # ------------------------------------------------------------------

    def log_deeptwin_opened(
        self,
        patient_id: str,
        clinician_id: str,
    ) -> str:
        """Log that a clinician opened DeepTwin for a patient.

        Returns the logged event_id.
        """
        event = DeepTwinAuditEvent(
            patient_id=patient_id,
            clinician_id=clinician_id,
            event_type="deeptwin_opened",
            details={"status": "opened"},
        )
        return self.log_event(event)

    def log_snapshot_generated(
        self,
        patient_id: str,
        clinician_id: str,
        snapshot_id: str,
    ) -> str:
        """Log that a DeepTwin snapshot was generated.

        Returns the logged event_id.
        """
        event = DeepTwinAuditEvent(
            patient_id=patient_id,
            clinician_id=clinician_id,
            event_type="snapshot_generated",
            snapshot_id=snapshot_id,
            details={"status": "generated", "snapshot_id": snapshot_id},
        )
        return self.log_event(event)

    def log_synthesis_requested(
        self,
        patient_id: str,
        clinician_id: str,
        snapshot_id: str,
    ) -> str:
        """Log that a synthesis was requested against a snapshot.

        Returns the logged event_id.
        """
        event = DeepTwinAuditEvent(
            patient_id=patient_id,
            clinician_id=clinician_id,
            event_type="synthesis_requested",
            snapshot_id=snapshot_id,
            details={"status": "requested", "snapshot_id": snapshot_id},
        )
        return self.log_event(event)

    def log_hypothesis_accepted(
        self,
        patient_id: str,
        clinician_id: str,
        snapshot_id: str,
        hypothesis_id: str,
    ) -> str:
        """Log that a clinician accepted a ranked hypothesis.

        Returns the logged event_id.
        """
        event = DeepTwinAuditEvent(
            patient_id=patient_id,
            clinician_id=clinician_id,
            event_type="hypothesis_accepted",
            snapshot_id=snapshot_id,
            details={
                "status": "accepted",
                "hypothesis_id": hypothesis_id,
                "snapshot_id": snapshot_id,
            },
        )
        return self.log_event(event)

    def log_hypothesis_rejected(
        self,
        patient_id: str,
        clinician_id: str,
        snapshot_id: str,
        hypothesis_id: str,
    ) -> str:
        """Log that a clinician rejected a ranked hypothesis.

        Returns the logged event_id.
        """
        event = DeepTwinAuditEvent(
            patient_id=patient_id,
            clinician_id=clinician_id,
            event_type="hypothesis_rejected",
            snapshot_id=snapshot_id,
            details={
                "status": "rejected",
                "hypothesis_id": hypothesis_id,
                "snapshot_id": snapshot_id,
            },
        )
        return self.log_event(event)

    def log_report_handoff(
        self,
        patient_id: str,
        clinician_id: str,
        snapshot_id: str,
        handoff_id: str,
    ) -> str:
        """Log a snapshot handoff to the Report module.

        Returns the logged event_id.
        """
        event = DeepTwinAuditEvent(
            patient_id=patient_id,
            clinician_id=clinician_id,
            event_type="report_handoff",
            snapshot_id=snapshot_id,
            details={
                "status": "handoff_completed",
                "handoff_id": handoff_id,
                "target_module": "report",
            },
        )
        return self.log_event(event)

    def log_protocol_handoff(
        self,
        patient_id: str,
        clinician_id: str,
        snapshot_id: str,
        handoff_id: str,
    ) -> str:
        """Log a snapshot handoff to the Protocol Studio module.

        Returns the logged event_id.
        """
        event = DeepTwinAuditEvent(
            patient_id=patient_id,
            clinician_id=clinician_id,
            event_type="protocol_handoff",
            snapshot_id=snapshot_id,
            details={
                "status": "handoff_completed",
                "handoff_id": handoff_id,
                "target_module": "protocol_studio",
            },
        )
        return self.log_event(event)

    def log_export_generated(
        self,
        patient_id: str,
        clinician_id: str,
        snapshot_id: str,
        export_id: str,
    ) -> str:
        """Log that a snapshot export was generated.

        Returns the logged event_id.
        """
        event = DeepTwinAuditEvent(
            patient_id=patient_id,
            clinician_id=clinician_id,
            event_type="export_generated",
            snapshot_id=snapshot_id,
            details={
                "status": "export_completed",
                "export_id": export_id,
                "snapshot_id": snapshot_id,
            },
        )
        return self.log_event(event)

    # ------------------------------------------------------------------
    # API compatibility method
    # ------------------------------------------------------------------

    def log_deeptwin_event(
        self,
        patient_id: str,
        clinician_id: str,
        event_type: str,
        snapshot_id: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None,
    ) -> DeepTwinAuditEvent:
        """Log a generic DeepTwin event (API-compatible wrapper).

        This method provides backward compatibility with the FastAPI
        endpoint which logs arbitrary DeepTwin events by type string.

        Parameters
        ----------
        patient_id : str
            The patient identifier.
        clinician_id : str
            The clinician identifier.
        event_type : str
            The event type. Must be in ``VALID_EVENT_TYPES``.
        snapshot_id : str | None
            Optional snapshot identifier.
        details : dict | None
            Additional event details.

        Returns
        -------
        DeepTwinAuditEvent
            The logged audit event.
        """
        event = DeepTwinAuditEvent(
            patient_id=patient_id,
            clinician_id=clinician_id,
            event_type=event_type,
            snapshot_id=snapshot_id,
            details=details or {},
        )
        self.log_event(event)
        return event

    # ------------------------------------------------------------------
    # Convenience methods — one per VALID_EVENT_TYPES
    # ------------------------------------------------------------------

    def log_review_completed(
        self,
        patient_id: str,
        clinician_id: str,
        snapshot_id: str,
        review_id: str,
    ) -> str:
        """Log that a clinician completed review of a snapshot.

        Returns the logged event_id.
        """
        event = DeepTwinAuditEvent(
            patient_id=patient_id,
            clinician_id=clinician_id,
            event_type="review_completed",
            snapshot_id=snapshot_id,
            details={
                "status": "review_completed",
                "review_id": review_id,
                "snapshot_id": snapshot_id,
            },
        )
        return self.log_event(event)
