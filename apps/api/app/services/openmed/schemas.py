"""Shared Pydantic schemas for the OpenMed adapter.

These types form the public contract between DeepSynaps and any OpenMed
backend (HTTP service or in-process heuristic). Every entity carries a
char-level span into the original text so callers can re-render or audit.
"""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field


SourceType = Literal[
    "clinician_note",
    "patient_note",
    "referral",
    "intake_form",
    "transcript",
    "document_text",
    "free_text",
    # Neuromodulation-specific types
    "stimulation_log",
    "device_interrogation",
    "programming_note",
    "session_note",
    "neuromodulation_text",
]

EntityLabel = Literal[
    "diagnosis",
    "symptom",
    "medication",
    "procedure",
    "lab",
    "anatomy",
    "vital",
    "risk_factor",
    "allergy",
    "device",
    # Neuromodulation-specific entities
    "stimulation_protocol",
    "device_parameter",
    "electrode_placement",
    "outcome_measure",
    "adverse_event",
    "neuromodulation_device",
    "other",
]

PIILabel = Literal[
    "person_name",
    "date",
    "mrn",
    "phone",
    "email",
    "address",
    "id_number",
    "url",
    "ssn",
    "ip_address",
    "other_pii",
]


class ClinicalTextInput(BaseModel):
    """Normalised input the adapter operates on."""

    text: str = Field(..., min_length=1, max_length=200_000)
    source_type: SourceType = "free_text"
    locale: str = Field(default="en", description="BCP-47 language tag.")

    @property
    def length(self) -> int:
        return len(self.text)


class TextSpan(BaseModel):
    start: int
    end: int


class ExtractedClinicalEntity(BaseModel):
    """A clinical entity recovered from free text. Never a clinician finding."""

    label: EntityLabel
    text: str
    span: TextSpan
    normalised: Optional[str] = None
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    source: Literal["openmed", "heuristic"] = "heuristic"


class PIIEntity(BaseModel):
    label: PIILabel
    text: str
    span: TextSpan
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)


class StimulationParameter(BaseModel):
    """A structured stimulation parameter extracted from clinical text.

    Represents a single quantified parameter (frequency, intensity, duration,
    pulse count, session count, inter-train interval, or electrode montage).
    """

    parameter_type: str = Field(
        ...,
        description="Parameter category: frequency, intensity_current, intensity_percent_mt, "
                    "intensity_percent_mso, duration_train, duration_session, pulses, sessions, "
                    "inter_train_interval, or montage.",
    )
    value: float = Field(..., description="Numeric value of the parameter.")
    unit: str = Field(default="", description="Unit of measurement (Hz, mA, %, s, min, etc.).")
    text_span: TextSpan = Field(..., description="Character span in original text.")
    confidence: float = Field(default=0.85, ge=0.0, le=1.0)


class AnalyzeResponse(BaseModel):
    """Result of `POST /analyze`."""

    schema_id: Literal["deepsynaps.openmed.analyze/v1"] = "deepsynaps.openmed.analyze/v1"
    backend: Literal["openmed_http", "heuristic"]
    entities: list[ExtractedClinicalEntity]
    pii: list[PIIEntity]
    summary: str = Field(default="", description="Short rule-based summary; not a clinical interpretation.")
    safety_footer: str = "decision-support, not autonomous diagnosis"
    char_count: int


class PIIExtractResponse(BaseModel):
    schema_id: Literal["deepsynaps.openmed.pii/v1"] = "deepsynaps.openmed.pii/v1"
    backend: Literal["openmed_http", "heuristic"]
    pii: list[PIIEntity]


class NeuromodulationExtractResponse(BaseModel):
    """Result of POST /analyze-neuromodulation."""

    schema_id: Literal["deepsynaps.openmed.neuro/v1"] = "deepsynaps.openmed.neuro/v1"
    backend: Literal["openmed_http", "heuristic"]
    entities: list[ExtractedClinicalEntity]
    pii: list[PIIEntity]
    summary: str = Field(default="", description="Structured neuromodulation summary; not a clinical interpretation.")
    safety_footer: str = "decision-support, not autonomous diagnosis"
    char_count: int


class ExtractParametersResponse(BaseModel):
    """Result of POST /extract-parameters.

    Returns structured stimulation parameters extracted from clinical text
    (frequency, intensity, duration, pulse count, session count, ITI, montage).
    """

    schema_id: Literal["deepsynaps.openmed.parameters/v1"] = "deepsynaps.openmed.parameters/v1"
    backend: Literal["openmed_http", "heuristic"]
    parameters: list[StimulationParameter]
    summary: str = Field(default="", description="Parameter extraction summary; not a clinical interpretation.")
    safety_footer: str = "decision-support, not autonomous diagnosis"
    char_count: int


class DeidentifyResponse(BaseModel):
    schema_id: Literal["deepsynaps.openmed.deid/v1"] = "deepsynaps.openmed.deid/v1"
    backend: Literal["openmed_http", "heuristic"]
    redacted_text: str
    replacements: list[PIIEntity]
    safety_footer: str = "de-identified preview; verify before sharing"


class HealthResponse(BaseModel):
    ok: bool
    backend: Literal["openmed_http", "heuristic"]
    upstream_ok: Optional[bool] = None
    upstream_url: Optional[str] = None
    note: str = ""


__all__ = [
    "ClinicalTextInput",
    "TextSpan",
    "ExtractedClinicalEntity",
    "PIIEntity",
    "StimulationParameter",
    "AnalyzeResponse",
    "PIIExtractResponse",
    "NeuromodulationExtractResponse",
    "ExtractParametersResponse",
    "DeidentifyResponse",
    "HealthResponse",
    "SourceType",
    "EntityLabel",
    "PIILabel",
]
