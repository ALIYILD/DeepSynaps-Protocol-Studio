from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field


SAFETY_DISCLAIMER = (
    "Evidence intelligence is for clinical/research decision support only. "
    "It does not diagnose, prescribe, or replace clinician judgement."
)
PROTOCOL_CAVEAT = (
    "Protocol links are extracted evidence relationships and require clinician "
    "verification before use."
)
GRADE_CAVEAT = (
    "Computed evidence grades are decision-support signals derived from available "
    "database records and must be reviewed before clinical use."
)


class EvidenceTerminalCounts(BaseModel):
    papers: int = 0
    papers_with_abstracts: int = 0
    abstract_coverage_percent: float = 0.0
    paper_indications: int = 0
    trial_indications: int = 0
    paper_trial_links: int = 0
    resolved_paper_trial_links: int = 0
    protocols: int = 0
    orphan_protocols: int = 0


class EvidenceTerminalStatusOut(BaseModel):
    db_available: bool
    db_path: str
    source_name: str = "local-evidence-sqlite"
    last_updated: Optional[str] = None
    counts: EvidenceTerminalCounts = Field(default_factory=EvidenceTerminalCounts)
    safety_disclaimer: str = SAFETY_DISCLAIMER
    protocol_caveat: str = PROTOCOL_CAVEAT
    grade_caveat: str = GRADE_CAVEAT
    pipeline_metadata: dict[str, Any] = Field(default_factory=dict)


class EvidenceTerminalGradeBucketOut(BaseModel):
    grade: str
    count: int


class EvidenceTerminalMetricIndicationOut(BaseModel):
    indication_id: str
    display_name: str
    modality: Optional[str] = None
    computed_evidence_grade: Optional[str] = None
    paper_count: int = 0
    trial_count: int = 0
    protocol_count: int = 0


class EvidenceTerminalOverviewOut(BaseModel):
    db_available: bool = True
    counts: EvidenceTerminalCounts = Field(default_factory=EvidenceTerminalCounts)
    grade_distribution: list[EvidenceTerminalGradeBucketOut] = Field(default_factory=list)
    modality_distribution: list[EvidenceTerminalGradeBucketOut] = Field(default_factory=list)
    top_indications_by_paper_count: list[EvidenceTerminalMetricIndicationOut] = Field(default_factory=list)
    top_indications_by_trial_count: list[EvidenceTerminalMetricIndicationOut] = Field(default_factory=list)
    top_indications_by_protocol_count: list[EvidenceTerminalMetricIndicationOut] = Field(default_factory=list)
    flagship_indications: list[EvidenceTerminalMetricIndicationOut] = Field(default_factory=list)
    relationship_counts: dict[str, int] = Field(default_factory=dict)
    safety_disclaimer: str = SAFETY_DISCLAIMER
    protocol_caveat: str = PROTOCOL_CAVEAT
    grade_caveat: str = GRADE_CAVEAT


class EvidenceTerminalIndicationSummaryOut(BaseModel):
    indication_id: str
    display_name: str
    modality: Optional[str] = None
    condition: Optional[str] = None
    paper_count: int = 0
    trial_count: int = 0
    protocol_count: int = 0
    computed_evidence_grade: Optional[str] = None
    abstract_coverage_percent: Optional[float] = None
    latest_year: Optional[int] = None
    safety_flags: list[str] = Field(default_factory=list)


class EvidenceTerminalIndicationsOut(BaseModel):
    total: int
    limit: int
    offset: int
    results: list[EvidenceTerminalIndicationSummaryOut] = Field(default_factory=list)
    safety_disclaimer: str = SAFETY_DISCLAIMER
    grade_caveat: str = GRADE_CAVEAT


class EvidenceTerminalLinkOut(BaseModel):
    label: str
    url: str


class EvidenceTerminalPaperRefOut(BaseModel):
    paper_id: int
    title: Optional[str] = None
    year: Optional[int] = None
    journal: Optional[str] = None
    pmid: Optional[str] = None
    doi: Optional[str] = None
    computed_evidence_grade: Optional[str] = None


class EvidenceTerminalTrialRefOut(BaseModel):
    trial_id: int
    nct_id: str
    title: Optional[str] = None
    status: Optional[str] = None
    phase: Optional[str] = None
    last_update: Optional[str] = None


class EvidenceTerminalProtocolRefOut(BaseModel):
    protocol_id: int
    source_type: str
    source_id: str
    modality: Optional[str] = None
    arm_label: Optional[str] = None
    confidence: Optional[str] = None
    target_anatomy: Optional[str] = None


class EvidenceTerminalIndicationDetailOut(BaseModel):
    indication: EvidenceTerminalIndicationSummaryOut
    linked_papers_summary: dict[str, int] = Field(default_factory=dict)
    linked_trials_summary: dict[str, int] = Field(default_factory=dict)
    linked_protocols_summary: dict[str, int] = Field(default_factory=dict)
    top_papers: list[EvidenceTerminalPaperRefOut] = Field(default_factory=list)
    top_trials: list[EvidenceTerminalTrialRefOut] = Field(default_factory=list)
    top_protocols: list[EvidenceTerminalProtocolRefOut] = Field(default_factory=list)
    available_modalities: list[str] = Field(default_factory=list)
    evidence_caveats: list[str] = Field(default_factory=list)


class EvidenceTerminalPaperSearchResultOut(BaseModel):
    paper_id: int
    title: Optional[str] = None
    abstract_snippet: Optional[str] = None
    year: Optional[int] = None
    authors: list[str] = Field(default_factory=list)
    journal: Optional[str] = None
    pmid: Optional[str] = None
    doi: Optional[str] = None
    source_url: Optional[str] = None
    indications: list[EvidenceTerminalIndicationSummaryOut] = Field(default_factory=list)
    linked_trials_count: int = 0
    linked_protocols_count: int = 0
    computed_evidence_grade: Optional[str] = None
    source_metadata: dict[str, Any] = Field(default_factory=dict)


class EvidenceTerminalPaperSearchOut(BaseModel):
    total: int
    limit: int
    offset: int
    results: list[EvidenceTerminalPaperSearchResultOut] = Field(default_factory=list)
    safety_disclaimer: str = SAFETY_DISCLAIMER
    grade_caveat: str = GRADE_CAVEAT


class EvidenceTerminalPaperDetailOut(BaseModel):
    paper_id: int
    title: Optional[str] = None
    abstract: Optional[str] = None
    authors: list[str] = Field(default_factory=list)
    journal: Optional[str] = None
    year: Optional[int] = None
    pmid: Optional[str] = None
    doi: Optional[str] = None
    source_links: list[EvidenceTerminalLinkOut] = Field(default_factory=list)
    indications: list[EvidenceTerminalIndicationSummaryOut] = Field(default_factory=list)
    trials_linked: list[EvidenceTerminalTrialRefOut] = Field(default_factory=list)
    protocols_linked: list[EvidenceTerminalProtocolRefOut] = Field(default_factory=list)
    extracted_protocol_snippets: list[str] = Field(default_factory=list)
    computed_evidence_grade: Optional[str] = None
    source_provenance: dict[str, Any] = Field(default_factory=dict)
    safety_caveats: list[str] = Field(default_factory=list)


class EvidenceTerminalTrialSearchResultOut(BaseModel):
    trial_id: int
    nct_id: str
    title: Optional[str] = None
    status: Optional[str] = None
    phase: Optional[str] = None
    enrollment: Optional[int] = None
    sponsor: Optional[str] = None
    last_update: Optional[str] = None
    indications: list[EvidenceTerminalIndicationSummaryOut] = Field(default_factory=list)
    linked_papers_count: int = 0
    linked_protocols_count: int = 0


class EvidenceTerminalTrialSearchOut(BaseModel):
    total: int
    limit: int
    offset: int
    results: list[EvidenceTerminalTrialSearchResultOut] = Field(default_factory=list)
    safety_disclaimer: str = SAFETY_DISCLAIMER


class EvidenceTerminalProtocolSearchResultOut(BaseModel):
    protocol_id: int
    indication_id: Optional[str] = None
    indication_display_name: Optional[str] = None
    source_type: str
    source_id: str
    modality: Optional[str] = None
    arm_label: Optional[str] = None
    target_anatomy: Optional[str] = None
    waveform: Optional[str] = None
    frequency_hz: Optional[float] = None
    pulse_width_us: Optional[float] = None
    amplitude_mA: Optional[float] = None
    amplitude_V: Optional[float] = None
    session_duration_min: Optional[float] = None
    sessions_per_week: Optional[int] = None
    total_sessions: Optional[int] = None
    extracted_parameters_present: bool = False
    extraction_confidence: Optional[str] = None
    linked_paper_ids: list[int] = Field(default_factory=list)
    linked_trial_ids: list[int] = Field(default_factory=list)
    linked_trial_nct_ids: list[str] = Field(default_factory=list)
    safety_caveat: str = PROTOCOL_CAVEAT


class EvidenceTerminalProtocolSearchOut(BaseModel):
    total: int
    limit: int
    offset: int
    results: list[EvidenceTerminalProtocolSearchResultOut] = Field(default_factory=list)
    safety_disclaimer: str = SAFETY_DISCLAIMER
    protocol_caveat: str = PROTOCOL_CAVEAT


class EvidenceTerminalNetworkNodeOut(BaseModel):
    id: str
    type: str
    label: str
    meta: dict[str, Any] = Field(default_factory=dict)


class EvidenceTerminalNetworkEdgeOut(BaseModel):
    source: str
    target: str
    type: str


class EvidenceTerminalNetworkOut(BaseModel):
    nodes: list[EvidenceTerminalNetworkNodeOut] = Field(default_factory=list)
    edges: list[EvidenceTerminalNetworkEdgeOut] = Field(default_factory=list)
    max_nodes_applied: int
    safety_disclaimer: str = SAFETY_DISCLAIMER
    protocol_caveat: str = PROTOCOL_CAVEAT
    grade_caveat: str = GRADE_CAVEAT


class EvidenceTerminalGradeDistributionOut(BaseModel):
    grades: list[EvidenceTerminalGradeBucketOut] = Field(default_factory=list)
    grade_caveat: str = GRADE_CAVEAT
