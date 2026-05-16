"""DeepTwin Phase 4 — Patient-level synthesis contracts extending Phase 3."""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional
import uuid


@dataclass
class DeepTwinSnapshot:
    """Canonical DeepTwin snapshot — unified patient-level synthesis output."""
    patient_id: str
    snapshot_id: str = ""
    generated_at: datetime = field(default_factory=datetime.now)
    modality_coverage: Dict[str, bool] = field(default_factory=dict)
    recency_status: Dict[str, str] = field(default_factory=dict)
    data_quality_flags: List[Dict[str, Any]] = field(default_factory=list)
    timeline_events: List[Dict[str, Any]] = field(default_factory=list)
    correlation_findings: List[Dict[str, Any]] = field(default_factory=list)
    confounders: List[Dict[str, Any]] = field(default_factory=list)
    ranked_hypotheses: List[Dict[str, Any]] = field(default_factory=list)
    evidence_links: List[Dict[str, Any]] = field(default_factory=list)
    uncertainty_drivers: List[str] = field(default_factory=list)
    forecast_status: str = "unavailable: no calibrated model"
    clinician_review_status: Dict[str, Any] = field(default_factory=dict)
    provenance: Dict[str, Any] = field(default_factory=dict)
    safety_disclaimer: str = (
        "Decision support only. Requires clinician review. "
        "DeepTwin does not diagnose, prescribe, or prove causality."
    )

    def __post_init__(self):
        if not self.snapshot_id:
            self.snapshot_id = f"dts_{uuid.uuid4().hex[:12]}"
        self._ensure_review_status()

    def _ensure_review_status(self):
        defaults = {
            "reviewed": False,
            "reviewed_by": None,
            "reviewed_at": None,
            "hypotheses_reviewed": 0,
            "hypotheses_total": len(self.ranked_hypotheses),
            "notes": [],
            "pending_actions": [],
        }
        for key, val in defaults.items():
            self.clinician_review_status.setdefault(key, val)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "snapshot_id": self.snapshot_id,
            "patient_id": self.patient_id,
            "generated_at": self.generated_at.isoformat(),
            "modality_coverage": self.modality_coverage,
            "recency_status": self.recency_status,
            "data_quality_flags": self.data_quality_flags,
            "timeline_events": self.timeline_events,
            "correlation_findings": self.correlation_findings,
            "confounders": self.confounders,
            "ranked_hypotheses": self.ranked_hypotheses,
            "evidence_links": self.evidence_links,
            "uncertainty_drivers": self.uncertainty_drivers,
            "forecast_status": self.forecast_status,
            "clinician_review_status": self.clinician_review_status,
            "provenance": self.provenance,
            "safety_disclaimer": self.safety_disclaimer,
        }


@dataclass
class ClinicianReview:
    """A clinician's review action on a DeepTwin hypothesis or snapshot."""
    patient_id: str
    clinician_id: str
    snapshot_id: str
    hypothesis_id: str
    action: str  # accept | reject | note | request_data | report | protocol | export | mark_reviewed
    review_id: str = ""
    note: str = ""
    requested_modalities: List[str] = field(default_factory=list)
    follow_up_tasks: List[str] = field(default_factory=list)
    reviewed_at: datetime = field(default_factory=datetime.now)
    audit_reference: str = ""

    VALID_ACTIONS = ["accept", "reject", "note", "request_data", "report", "protocol", "export", "mark_reviewed"]

    def __post_init__(self):
        if not self.review_id:
            self.review_id = f"rev_{uuid.uuid4().hex[:12]}"
        if not self.audit_reference:
            self.audit_reference = f"audit_{uuid.uuid4().hex[:8]}"
        if self.action not in self.VALID_ACTIONS:
            raise ValueError(f"Invalid action '{self.action}'. Must be one of: {self.VALID_ACTIONS}")

    def to_dict(self) -> Dict[str, Any]:
        return {
            "review_id": self.review_id,
            "patient_id": self.patient_id,
            "clinician_id": self.clinician_id,
            "snapshot_id": self.snapshot_id,
            "hypothesis_id": self.hypothesis_id,
            "action": self.action,
            "note": self.note,
            "requested_modalities": self.requested_modalities,
            "follow_up_tasks": self.follow_up_tasks,
            "reviewed_at": self.reviewed_at.isoformat(),
            "audit_reference": self.audit_reference,
        }


@dataclass
class DeepTwinAuditEvent:
    """Audit event for DeepTwin-specific actions."""
    patient_id: str
    clinician_id: str
    event_type: str
    event_id: str = ""
    snapshot_id: Optional[str] = None
    details: Dict[str, Any] = field(default_factory=dict)
    timestamp: datetime = field(default_factory=datetime.now)

    VALID_EVENT_TYPES = [
        "deeptwin_opened",
        "snapshot_generated",
        "synthesis_requested",
        "hypothesis_accepted",
        "hypothesis_rejected",
        "hypothesis_noted",
        "data_requested",
        "report_handoff",
        "protocol_handoff",
        "export_generated",
        "review_completed",
    ]

    def __post_init__(self):
        if not self.event_id:
            self.event_id = f"dtae_{uuid.uuid4().hex[:12]}"
        if self.event_type not in self.VALID_EVENT_TYPES:
            raise ValueError(f"Invalid event_type '{self.event_type}'. Must be one of: {self.VALID_EVENT_TYPES}")

    def to_dict(self) -> Dict[str, Any]:
        return {
            "event_id": self.event_id,
            "patient_id": self.patient_id,
            "clinician_id": self.clinician_id,
            "event_type": self.event_type,
            "snapshot_id": self.snapshot_id,
            "details": self.details,
            "timestamp": self.timestamp.isoformat(),
        }


@dataclass
class DeepTwinExport:
    """Export/handoff result for a DeepTwin snapshot."""
    export_id: str = ""
    snapshot_id: str = ""
    patient_id: str = ""
    clinician_id: str = ""
    export_type: str = ""  # json | pdf | report_handoff | protocol_handoff
    content: Dict[str, Any] = field(default_factory=dict)
    exported_at: datetime = field(default_factory=datetime.now)
    audit_reference: str = ""

    def __post_init__(self):
        if not self.export_id:
            self.export_id = f"exp_{uuid.uuid4().hex[:12]}"
        if not self.audit_reference:
            self.audit_reference = f"audit_{uuid.uuid4().hex[:8]}"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "export_id": self.export_id,
            "snapshot_id": self.snapshot_id,
            "patient_id": self.patient_id,
            "clinician_id": self.clinician_id,
            "export_type": self.export_type,
            "exported_at": self.exported_at.isoformat(),
            "audit_reference": self.audit_reference,
        }
