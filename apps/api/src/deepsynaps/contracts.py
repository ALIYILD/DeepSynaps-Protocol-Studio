"""Canonical data contracts for the Multimodal Intelligence Engine."""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple
import uuid
import json


@dataclass
class MultimodalEvent:
    """Canonical multimodal event contract — every data point across all modalities."""
    patient_id: str
    event_type: str
    modality: str
    source_system: str
    source_record_id: str
    timestamp: datetime
    value_summary: str
    event_id: str = ""
    numeric_features: Dict[str, float] = field(default_factory=dict)
    textual_summary: str = ""
    confidence: float = 0.0
    data_quality: str = "unknown"  # high, medium, low, missing, unknown
    provenance: Dict[str, Any] = field(default_factory=dict)
    evidence_links: List[str] = field(default_factory=list)
    audit_reference: str = ""

    def __post_init__(self):
        if not self.event_id:
            self.event_id = f"evt_{uuid.uuid4().hex[:12]}"
        if not self.audit_reference:
            self.audit_reference = f"audit_{uuid.uuid4().hex[:8]}"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "event_id": self.event_id,
            "patient_id": self.patient_id,
            "event_type": self.event_type,
            "modality": self.modality,
            "source_system": self.source_system,
            "source_record_id": self.source_record_id,
            "timestamp": self.timestamp.isoformat(),
            "value_summary": self.value_summary,
            "numeric_features": self.numeric_features,
            "textual_summary": self.textual_summary,
            "confidence": self.confidence,
            "data_quality": self.data_quality,
            "provenance": self.provenance,
            "evidence_links": self.evidence_links,
            "audit_reference": self.audit_reference,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "MultimodalEvent":
        data = dict(data)
        if "timestamp" in data and isinstance(data["timestamp"], str):
            data["timestamp"] = datetime.fromisoformat(data["timestamp"])
        return cls(**{k: v for k, v in data.items() if k in cls.__dataclass_fields__})


@dataclass
class EvidenceLink:
    """Evidence citation linked to an intelligence insight."""
    evidence_id: str
    source_type: str  # internal_db, external_db, literature
    citation: str
    evidence_grade: str  # A, B, C, D per GRADE
    confidence: float = 0.0
    research_only: bool = False
    conflicting: bool = False
    url: Optional[str] = None

    def __post_init__(self):
        if not self.evidence_id:
            self.evidence_id = f"ev_{uuid.uuid4().hex[:12]}"
        self.research_only = self.research_only or self.evidence_grade in ("C", "D")

    def to_dict(self) -> Dict[str, Any]:
        return {
            "evidence_id": self.evidence_id,
            "source_type": self.source_type,
            "citation": self.citation,
            "evidence_grade": self.evidence_grade,
            "confidence": self.confidence,
            "research_only": self.research_only,
            "conflicting": self.conflicting,
            "url": self.url,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "EvidenceLink":
        return cls(**{k: v for k, v in data.items() if k in cls.__dataclass_fields__})


@dataclass
class ConfounderCandidate:
    """A potential confounder detected for a given clinical observation."""
    confounder_id: str = ""
    confounder_type: str = ""  # medication, sleep, adherence, quality, biomarker, etc.
    description: str = ""
    severity: str = "moderate"  # high, moderate, low
    evidence_events: List[str] = field(default_factory=list)
    impact_estimate: str = "unknown"
    mitigation_suggestion: str = ""

    def __post_init__(self):
        if not self.confounder_id:
            self.confounder_id = f"cnf_{uuid.uuid4().hex[:12]}"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "confounder_id": self.confounder_id,
            "confounder_type": self.confounder_type,
            "description": self.description,
            "severity": self.severity,
            "evidence_events": self.evidence_events,
            "impact_estimate": self.impact_estimate,
            "mitigation_suggestion": self.mitigation_suggestion,
        }


@dataclass
class IntelligenceOutput:
    """Canonical intelligence output contract — every insight produced by any engine."""
    patient_id: str
    insight_type: str  # correlation, confound, hypothesis, quality_flag, evidence_linked
    modalities_involved: List[str]
    timeline_window: Tuple[datetime, datetime]
    summary: str
    insight_id: str = ""
    supporting_events: List[str] = field(default_factory=list)
    conflicting_events: List[str] = field(default_factory=list)
    confounders: List[Dict[str, Any]] = field(default_factory=list)
    evidence_links: List[Dict[str, Any]] = field(default_factory=list)
    confidence: float = 0.0
    uncertainty_drivers: List[str] = field(default_factory=list)
    research_only: bool = True
    clinician_review_required: bool = True
    safety_labels: List[str] = field(default_factory=list)

    def __post_init__(self):
        if not self.insight_id:
            self.insight_id = f"ins_{uuid.uuid4().hex[:12]}"
        # Enforce safety defaults
        self.clinician_review_required = True
        if not self.safety_labels:
            self.safety_labels = ["Decision support only. Requires clinician review."]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "insight_id": self.insight_id,
            "patient_id": self.patient_id,
            "insight_type": self.insight_type,
            "modalities_involved": self.modalities_involved,
            "timeline_window": (
                self.timeline_window[0].isoformat(),
                self.timeline_window[1].isoformat(),
            ) if self.timeline_window else (None, None),
            "summary": self.summary,
            "supporting_events": self.supporting_events,
            "conflicting_events": self.conflicting_events,
            "confounders": self.confounders,
            "evidence_links": self.evidence_links,
            "confidence": self.confidence,
            "uncertainty_drivers": self.uncertainty_drivers,
            "research_only": self.research_only,
            "clinician_review_required": self.clinician_review_required,
            "safety_labels": self.safety_labels,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "IntelligenceOutput":
        data = dict(data)
        if "timeline_window" in data and isinstance(data["timeline_window"], (list, tuple)):
            tw = data["timeline_window"]
            if tw[0] and isinstance(tw[0], str):
                tw = (datetime.fromisoformat(tw[0]), datetime.fromisoformat(tw[1]))
            data["timeline_window"] = tw
        return cls(**{k: v for k, v in data.items() if k in cls.__dataclass_fields__})


@dataclass
class SynthesisRequest:
    """Request body for POST /synthesis endpoint."""
    patient_id: str
    include_modalities: Optional[List[str]] = None
    date_range: Optional[Tuple[str, str]] = None
    focus_areas: Optional[List[str]] = None
    min_confidence: float = 0.3
    max_hypotheses: int = 5


@dataclass
class SynthesisResponse:
    """Full synthesis response combining all intelligence modules."""
    patient_id: str
    synthesis_id: str = ""
    generated_at: datetime = field(default_factory=datetime.utcnow)
    timeline: List[Dict[str, Any]] = field(default_factory=list)
    correlations: List[Dict[str, Any]] = field(default_factory=list)
    confounders: List[Dict[str, Any]] = field(default_factory=list)
    quality_flags: List[Dict[str, Any]] = field(default_factory=list)
    ranked_hypotheses: List[Dict[str, Any]] = field(default_factory=list)
    evidence_summary: Dict[str, Any] = field(default_factory=dict)
    safety_disclaimer: str = "This output is decision support only and requires clinician review. It does not constitute a diagnosis or treatment recommendation."

    def __post_init__(self):
        if not self.synthesis_id:
            self.synthesis_id = f"syn_{uuid.uuid4().hex[:12]}"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "synthesis_id": self.synthesis_id,
            "patient_id": self.patient_id,
            "generated_at": self.generated_at.isoformat(),
            "timeline": self.timeline,
            "correlations": self.correlations,
            "confounders": self.confounders,
            "quality_flags": self.quality_flags,
            "ranked_hypotheses": self.ranked_hypotheses,
            "evidence_summary": self.evidence_summary,
            "safety_disclaimer": self.safety_disclaimer,
        }
