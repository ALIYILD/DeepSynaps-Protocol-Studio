"""Pydantic schemas for clinical text ingestion."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


ClinicalChannel = Literal["note", "message", "email", "chat"]
DeidStrategy = Literal["mask", "remove"]
PhiKind = Literal[
    "email",
    "phone",
    "mrn",
    "date",
    "ssn",
    "name",
    "url",
    "other",
]


class ClinicalTextMetadata(BaseModel):
    """Channel-specific metadata for traceability (refs are opaque identifiers, not PHI)."""

    patient_ref: str | None = Field(
        default=None,
        description="Opaque patient identifier in the deployment (not raw PHI).",
    )
    encounter_ref: str | None = Field(
        default=None,
        description="Opaque encounter or visit identifier.",
    )
    channel: ClinicalChannel = Field(description="Source channel for the text.")
    created_at: datetime | None = Field(
        default=None,
        description="Authoring time from the source system when available.",
    )
    author_role: str | None = Field(
        default=None,
        description="e.g. physician, nurse, patient, system.",
    )
    ingested_at: datetime = Field(
        description="UTC time when import_clinical_text ran.",
    )


class PhiSpan(BaseModel):
    """Character span of detected PHI in the *input* string passed to de-id."""

    start: int = Field(ge=0)
    end: int = Field(ge=0)
    phi_type: PhiKind
    replacement: str = Field(description="Masked token or empty if removed.")


class TextSection(BaseModel):
    """A headed block produced by normalize_note_format (first-pass headers)."""

    label: str = Field(description="Canonical section label, e.g. HPI, PLAN.")
    start_char: int = Field(ge=0)
    end_char: int = Field(ge=0)
    body: str = Field(description="Section body text (normalized whitespace).")


class ClinicalTextDocument(BaseModel):
    """Ingested clinical text with optional de-identification and normalization."""

    id: str = Field(description="Stable document id assigned at import.")
    raw_text: str = Field(description="Original text as received (may contain PHI).")
    deidentified_text: str | None = Field(
        default=None,
        description="Text after de-identification; None until deidentify_text runs.",
    )
    normalized_text: str | None = Field(
        default=None,
        description="Whitespace-normalized text; subfield sections optional.",
    )
    sections: list[TextSection] = Field(
        default_factory=list,
        description="Detected sections after normalize_note_format.",
    )
    metadata: ClinicalTextMetadata
    model_config = {"frozen": False}
