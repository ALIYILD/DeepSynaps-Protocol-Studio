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


# --- Core clinical NLP (entities, sections) ---------------------------------

EntityType = Literal[
    "problem",
    "diagnosis",
    "symptom",
    "medication",
    "lab",
    "procedure",
    "device",
    "neuromodulation",
    "other",
]

AssertionStatus = Literal[
    "present",
    "absent",
    "hypothetical",
    "historical",
    "unknown",
]

TemporalContext = Literal["past", "current", "future", "unknown"]


class TextSpan(BaseModel):
    """Character span in ``ClinicalEntityExtractionResult.source_text``."""

    start: int = Field(ge=0, description="Inclusive character offset.")
    end: int = Field(ge=0, description="Exclusive character offset.")
    text: str = Field(description="Surface form covered by this span.")


class ClinicalEntity(BaseModel):
    """Single extracted clinical mention with context fields (cTAKES/medSpaCy-style)."""

    span: TextSpan
    entity_type: EntityType
    negation_assertion: AssertionStatus = Field(
        default="unknown",
        description="Negation / certainty / experiencer collapsed for MVP.",
    )
    temporal_context: TemporalContext = Field(
        default="unknown",
        description="Coarse temporality relative to the encounter.",
    )
    section: str = Field(
        description="Section label: HPI, MEDICATIONS, PLAN, message_body, BODY, etc.",
    )
    attributes: dict[str, str] = Field(
        default_factory=dict,
        description="e.g. dose, route, frequency for medications.",
    )

    model_config = {"frozen": False}


class ClinicalEntityExtractionResult(BaseModel):
    """Output of entity extraction plus downstream context layers."""

    document_id: str
    source_text: str = Field(description="Exact string spans reference into.")
    backend: str = Field(description="Logical backend id, e.g. spacy_med, rule.")
    model_version: str | None = Field(
        default=None,
        description="Optional model or ruleset version string.",
    )
    entities: list[ClinicalEntity] = Field(default_factory=list)

    model_config = {"frozen": False}


class SectionedText(BaseModel):
    """Note or message segmentation for NLP and display."""

    document_id: str
    full_text: str = Field(description="Same basis as offsets in ``sections``.")
    sections: list[TextSection] = Field(
        default_factory=list,
        description="Ordered blocks with global character offsets.",
    )


# --- Terminology linking & auto-coding --------------------------------------

CodeSystem = Literal[
    "SNOMED_CT",
    "ICD10CM",
    "ICD10PCS",
    "LOINC",
    "RXNORM",
    "UMLS_CUI",
]


class TerminologyReference(BaseModel):
    """A single code in a standard vocabulary with optional display and confidence."""

    system: CodeSystem
    code: str = Field(description="Code as used in that system (e.g. SNOMED concept id, ICD-10-CM).")
    display: str | None = Field(default=None, description="Human-readable preferred term.")
    confidence: float = Field(
        default=1.0,
        ge=0.0,
        le=1.0,
        description="Linker confidence for this (mention, code) pair.",
    )


class CodedEntity(ClinicalEntity):
    """Extracted entity plus terminology codes (extension of :class:`ClinicalEntity`)."""

    codings: list[TerminologyReference] = Field(
        default_factory=list,
        description="Candidate or primary codes from standard terminologies.",
    )

    model_config = {"frozen": False}


class CodedEntityExtractionResult(BaseModel):
    """Entity extraction with terminology linking applied."""

    document_id: str
    source_text: str
    backend: str = Field(description="Linker backend id, e.g. biosyn, noop.")
    model_version: str | None = Field(
        default=None,
        description="Optional linker / lexicon version string.",
    )
    entities: list[CodedEntity] = Field(default_factory=list)

    model_config = {"frozen": False}


CodingCategory = Literal["diagnosis", "procedure", "medication", "lab", "device", "other"]


class SuggestedCode(BaseModel):
    """One aggregated coding suggestion for billing / problem lists / orders (assistive)."""

    coding_category: CodingCategory
    system: CodeSystem
    code: str
    display: str | None = None
    confidence: float = Field(ge=0.0, le=1.0)
    source_entity_indices: list[int] = Field(
        default_factory=list,
        description="Indices into ``CodedEntityExtractionResult.entities`` supporting this code.",
    )


class AutoCodingResult(BaseModel):
    """Note-level roll-up of suggested codes (not a billable claim)."""

    document_id: str
    backend: str
    model_version: str | None = None
    suggestions: list[SuggestedCode] = Field(
        default_factory=list,
        description="Deduplicated suggested codes with highest confidence per (system, code).",
    )
    by_category: dict[str, list[SuggestedCode]] = Field(
        default_factory=dict,
        description="Same suggestions grouped by :class:`CodingCategory` for UI.",
    )

    model_config = {"frozen": False}
