"""Pydantic schemas for multimodal DeepTwin events and safety envelopes."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class Modality(str, Enum):
    eeg = "eeg"
    qeeg = "qeeg"
    mri = "mri"
    fmri = "fmri"
    video = "video"
    audio = "audio"
    voice = "voice"
    text = "text"
    clinical_note = "clinical_note"
    assessment = "assessment"
    biometric = "biometric"
    medication = "medication"
    intervention = "intervention"
    outcome_score = "outcome_score"
    wearable = "wearable"
    lab_result = "lab_result"
    sleep = "sleep"
    behaviour = "behaviour"
    other = "other"


class InterventionType(str, Enum):
    tDCS = "tDCS"
    TMS = "TMS"
    rTMS = "rTMS"
    TPS = "TPS"
    CES = "CES"
    PBM = "PBM"
    other = "other"


class ScoreDirection(str, Enum):
    higher_is_worse = "higher_is_worse"
    higher_is_better = "higher_is_better"
    neutral = "neutral"
    unknown = "unknown"


class EventType(str, Enum):
    observation = "observation"
    recording = "recording"
    assessment = "assessment"
    intervention_session = "intervention_session"
    outcome = "outcome"
    note = "note"
    lab = "lab"
    other = "other"


class InterventionPayload(BaseModel):
    """Structured intervention metadata when ``modality`` is ``intervention``."""

    model_config = ConfigDict(extra="allow")

    intervention_type: InterventionType
    target: str = ""
    frequency_hz: float | None = None
    intensity: str | None = None
    duration_minutes: float | None = None
    session_number: int | None = None
    protocol_name: str | None = None
    off_label: bool = False
    evidence_level: str | None = None
    clinician_approved: bool = False


class OutcomeScorePayload(BaseModel):
    """Outcome / assessment score block (may live inside ``payload``)."""

    model_config = ConfigDict(extra="allow")

    scale_name: str
    score: float
    score_direction: ScoreDirection = ScoreDirection.unknown
    date: datetime | None = None
    rater: str | None = None
    notes: str | None = None


class DeepTwinSafetyMetadata(BaseModel):
    """Every generated analytic output should carry this envelope."""

    is_research_only: Literal[True] = True
    is_clinical_decision_support: Literal[True] = True
    requires_clinician_review: Literal[True] = True
    not_diagnostic: Literal[True] = True
    not_prescriptive: Literal[True] = True
    no_autonomous_treatment_change: Literal[True] = True


class PatientDataEvent(BaseModel):
    """Single multimodal patient event aligned on a timeline."""

    model_config = ConfigDict(extra="allow")

    event_id: str = Field(..., min_length=1)
    patient_id: str | None = None
    event_type: EventType | str = EventType.observation
    modality: Modality
    timestamp: datetime
    source: str = ""
    payload: dict[str, Any] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)
    clinician_verified: bool = False
    research_only: bool = True

    intervention: InterventionPayload | None = None
    outcome: OutcomeScorePayload | None = None

    @field_validator("event_type", mode="before")
    @classmethod
    def coerce_event_type(cls, v: Any) -> Any:
        if isinstance(v, str):
            try:
                return EventType(v)
            except ValueError:
                return v
        return v


class FeatureExtractionResult(BaseModel):
    """Result of deterministic / placeholder feature extraction."""

    features: dict[str, Any] = Field(default_factory=dict)
    warnings: list[str] = Field(default_factory=list)
    missing_fields: list[str] = Field(default_factory=list)
    safety_flags: list[str] = Field(default_factory=list)
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)
    research_only: Literal[True] = True
