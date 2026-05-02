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


class AuditEventSummary(BaseModel):
    total_events: int = 0
    last_event_at: Optional[str] = None
    last_event_type: Optional[str] = None


class NutritionAnalyzerPayload(BaseModel):
    patient_id: str
    computation_id: str
    data_as_of: str
    schema_version: str = "1"
    clinical_disclaimer: str = (
        "Decision-support only. Not a prescription or diet order. "
        "Clinician judgment and local policy govern all care decisions."
    )
    snapshot: list[NutritionSnapshotCard] = Field(default_factory=list)
    diet: DietIntakeSummary = Field(default_factory=DietIntakeSummary)
    supplements: list[SupplementItem] = Field(default_factory=list)
    biomarker_links: list[BiomarkerLink] = Field(default_factory=list)
    recommendations: list[NutritionRecommendation] = Field(default_factory=list)
    audit_events: AuditEventSummary = Field(default_factory=AuditEventSummary)
