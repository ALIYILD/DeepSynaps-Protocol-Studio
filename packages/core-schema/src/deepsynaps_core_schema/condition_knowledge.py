from __future__ import annotations

from pydantic import BaseModel, Field


class ResearchAssetProvenance(BaseModel):
    file_name: str
    relative_path: str
    record_count: int | None = None
    notes: str | None = None


class EvidenceBucket(BaseModel):
    label: str
    count: int = 0
    share: float | None = None


class ModalityEvidenceSnapshot(BaseModel):
    modality: str
    paper_count: int
    citation_sum: int
    evidence_weight_sum: float | None = None
    mean_citations_per_paper: float | None = None
    top_study_types: list[EvidenceBucket] = Field(default_factory=list)
    top_parameter_tags: list[EvidenceBucket] = Field(default_factory=list)
    top_safety_tags: list[EvidenceBucket] = Field(default_factory=list)
    open_access_count: int | None = None
    year_min: int | None = None
    year_max: int | None = None


class TargetEvidenceSnapshot(BaseModel):
    modality: str
    target: str
    paper_count: int
    citation_sum: int
    template_support_score: float | None = None
    top_study_types: list[EvidenceBucket] = Field(default_factory=list)
    top_parameter_tags: list[EvidenceBucket] = Field(default_factory=list)
    top_population_tags: list[EvidenceBucket] = Field(default_factory=list)
    top_safety_tags: list[EvidenceBucket] = Field(default_factory=list)
    example_titles: list[str] = Field(default_factory=list)


class SafetySignalSnapshot(BaseModel):
    signal: str
    count: int
    signal_type: str


class RepresentativePaper(BaseModel):
    paper_key: str
    title: str
    year: int | None = None
    journal: str | None = None
    doi: str | None = None
    pmid: str | None = None
    citation_count: int | None = None
    evidence_tier: str | None = None
    study_type: str | None = None
    primary_modality: str | None = None
    canonical_modalities: list[str] = Field(default_factory=list)
    target_tags: list[str] = Field(default_factory=list)
    parameter_signal_tags: list[str] = Field(default_factory=list)
    record_url: str | None = None


class ProtocolCandidateSnapshot(BaseModel):
    modality: str
    target: str
    invasiveness: str | None = None
    paper_count: int
    citation_sum: int
    template_support_score: float
    top_study_types: list[EvidenceBucket] = Field(default_factory=list)
    top_parameter_tags: list[EvidenceBucket] = Field(default_factory=list)
    top_population_tags: list[EvidenceBucket] = Field(default_factory=list)
    top_safety_tags: list[EvidenceBucket] = Field(default_factory=list)
    example_titles: list[str] = Field(default_factory=list)


class ConditionResearchStats(BaseModel):
    indication_tag: str
    total_papers: int
    open_access_papers: int
    year_min: int | None = None
    year_max: int | None = None
    evidence_tiers: list[EvidenceBucket] = Field(default_factory=list)
    study_types: list[EvidenceBucket] = Field(default_factory=list)
    modalities: list[EvidenceBucket] = Field(default_factory=list)
    invasiveness: list[EvidenceBucket] = Field(default_factory=list)
    targets: list[EvidenceBucket] = Field(default_factory=list)
    parameter_signals: list[EvidenceBucket] = Field(default_factory=list)
    populations: list[EvidenceBucket] = Field(default_factory=list)


class ConditionKnowledgeBase(BaseModel):
    schema_version: str = "1.0.0"
    condition_slug: str
    condition_name: str
    condition_package_slug: str
    priority_rank: int
    indication_tags: list[str] = Field(default_factory=list)
    source_bundle_date: str
    generated_at: str
    source_assets: list[ResearchAssetProvenance] = Field(default_factory=list)
    research_stats: ConditionResearchStats
    modality_evidence: list[ModalityEvidenceSnapshot] = Field(default_factory=list)
    target_evidence: list[TargetEvidenceSnapshot] = Field(default_factory=list)
    protocol_candidates: list[ProtocolCandidateSnapshot] = Field(default_factory=list)
    safety_signals: list[SafetySignalSnapshot] = Field(default_factory=list)
    contraindication_signals: list[SafetySignalSnapshot] = Field(default_factory=list)
    representative_papers: list[RepresentativePaper] = Field(default_factory=list)
    protocol_personalization_notes: list[str] = Field(default_factory=list)
