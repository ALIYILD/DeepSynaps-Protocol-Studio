"""Pydantic contracts for the Nutrition, Supplements & Diet Analyzer (MVP)."""
from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class NutritionSnapshotCard(BaseModel):
    label: str
    value: str
    unit: str = ""
    confidence: float = Field(ge=0.0, le=1.0, default=0.0)
    provenance: str = ""
    as_of: Optional[str] = None


class DietIntakeSummary(BaseModel):
    window_days: int = 7
    avg_calories_kcal: Optional[float] = None
    avg_protein_g: Optional[float] = None
    avg_carbs_g: Optional[float] = None
    avg_fat_g: Optional[float] = None
    avg_sodium_mg: Optional[float] = None
    avg_fiber_g: Optional[float] = None
    logging_coverage_pct: float = 0.0
    confidence: float = Field(ge=0.0, le=1.0, default=0.0)
    provenance: str = ""
    notes: str = ""


class SupplementItem(BaseModel):
    id: str
    name: str
    dose: Optional[str] = None
    frequency: Optional[str] = None
    active: bool = True
    notes: Optional[str] = None
    started_at: Optional[str] = None
    confidence: float = Field(ge=0.0, le=1.0, default=0.85)
    provenance: str = ""


class BiomarkerLink(BaseModel):
    label: str
    page_id: str
    detail: str = ""
    confidence: float = Field(ge=0.0, le=1.0, default=0.5)


class NutritionRecommendation(BaseModel):
    title: str
    detail: str
    priority: str = "routine"  # routine | follow_up | urgent
    confidence: float = Field(ge=0.0, le=1.0, default=0.5)
    provenance: str = ""
    evidence_refs: list[str] = Field(default_factory=list)


class NutritionEvidenceItem(BaseModel):
    """One row from the shared literature corpus (FTS-ranked), not a separate DB."""

    id: int
    title: Optional[str] = None
    year: Optional[int] = None
    journal: Optional[str] = None
    snippet: str = ""
    pmid: Optional[str] = None
    doi: Optional[str] = None
    cited_by_count: Optional[int] = None
    is_oa: bool = False
    oa_url: Optional[str] = None
    europe_pmc_url: Optional[str] = None
    source_type: str = "literature_corpus"
    strength: str = "fts_ranked"
    evidence_topic: str = ""
    query_used: str = ""


class NutritionEvidencePack(BaseModel):
    """Surface context for decision-support: corpus size + top hits."""

    corpus_paper_count: int = 0
    corpus_note: str = (
        "Indexed literature corpus (shared evidence.db). "
        "Full-text search ranking is heuristic — verify critical claims in primary sources."
    )
    items: list[NutritionEvidenceItem] = Field(default_factory=list)


class NutritionAiBlock(BaseModel):
    """Structured AI-style interpretation for auditability (rule-assembled in MVP)."""

    title: str
    summary: str
    uncertainty: str = ""
    linked_sections: list[str] = Field(default_factory=list)
    provenance: str = "rule_assembled_mvp"
    confidence: float = Field(ge=0.0, le=1.0, default=0.45)


class AuditEventSummary(BaseModel):
    total_events: int = 0
    last_event_at: Optional[str] = None
    last_event_type: Optional[str] = None


class NutritionAnalyzerPayload(BaseModel):
    patient_id: str
    computation_id: str
    data_as_of: str
    schema_version: str = "2"
    clinical_disclaimer: str = (
        "Decision-support only. Not a prescription or diet order. "
        "Clinician judgment and local policy govern all care decisions."
    )
    snapshot: list[NutritionSnapshotCard] = Field(default_factory=list)
    diet: DietIntakeSummary = Field(default_factory=DietIntakeSummary)
    supplements: list[SupplementItem] = Field(default_factory=list)
    biomarker_links: list[BiomarkerLink] = Field(default_factory=list)
    recommendations: list[NutritionRecommendation] = Field(default_factory=list)
    evidence_pack: NutritionEvidencePack = Field(default_factory=NutritionEvidencePack)
    ai_interpretation: list[NutritionAiBlock] = Field(default_factory=list)
    audit_events: AuditEventSummary = Field(default_factory=AuditEventSummary)
