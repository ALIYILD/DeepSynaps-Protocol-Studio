"""Pydantic models for Labs / Blood Biomarkers Analyzer API."""

from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


class ConfidenceBlock(BaseModel):
    overall_panel_completeness: float = Field(ge=0.0, le=1.0)
    interpretation_confidence_cap: float = Field(ge=0.0, le=1.0)


class ProvenanceBlock(BaseModel):
    source_system: str = "deepsynaps_api"
    analyzer_version: str
    input_snapshot_ids: list[str] = Field(default_factory=list)
    pipeline_run_id: Optional[str] = None
    evidence_finding_ids: list[str] = Field(default_factory=list)
    llm_narrative_model: Optional[str] = None


class ReferenceRange(BaseModel):
    low: Optional[float] = None
    high: Optional[float] = None
    text: Optional[str] = None
    population: Optional[str] = None


class LabResultRecord(BaseModel):
    id: str
    patient_id: str
    analyte_code: str
    analyte_display_name: str
    test_name: Optional[str] = None
    panel_name: Optional[str] = None
    value_numeric: Optional[float] = None
    value_text: Optional[str] = None
    unit_ucum: Optional[str] = None
    reference_range: ReferenceRange
    sample_collected_at: str
    result_reported_at: Optional[str] = None
    abnormality_direction: Literal["low", "high", "normal", "unknown"] = "unknown"
    criticality: Literal["none", "low", "moderate", "high", "critical"] = "none"
    domain: str
    acute_chronic_class: Literal["acute", "chronic", "fluctuating", "unknown"] = "unknown"
    confidence: float = Field(ge=0.0, le=1.0, default=1.0)
    linked_analyzers_impacted: list[str] = Field(default_factory=list)


class LabDomainSummary(BaseModel):
    domain: str
    status: Literal["clear", "watch", "abnormal", "critical"]
    abnormal_count: int = 0
    critical_count: int = 0
    headline: str
    marker_ids: list[str] = Field(default_factory=list)


class LabSnapshot(BaseModel):
    key_abnormal_markers: list[str] = Field(default_factory=list)
    critical_summary: str = ""
    recent_changes_summary: str = ""
    abnormal_domain_count: int = 0
    medication_safety_flag_count: int = 0
    inflammation_summary: str = ""
    metabolic_summary: str = ""
    endocrine_summary: str = ""
    completeness_pct: float = 0.0
    missing_core_analytes: list[str] = Field(default_factory=list)
    top_confound_warnings: list[str] = Field(default_factory=list)


class LabTrendWindow(BaseModel):
    analyte_code: str
    window_start: str
    window_end: str
    n_samples: int
    baseline_estimate: Optional[float] = None
    latest_value: Optional[float] = None
    delta_percent: Optional[float] = None
    trend_direction: Literal["up", "down", "flat", "mixed"] = "flat"
    real_change_probability: float = Field(ge=0.0, le=1.0, default=0.5)
    real_change_rationale_codes: list[str] = Field(default_factory=list)


class LabCriticalValueAlert(BaseModel):
    id: str
    result_id: str
    analyte_display_name: str
    message_clinical: str
    escalation_level: Literal["routine", "urgent", "emergent"] = "urgent"


class LabClinicalInterpretation(BaseModel):
    id: str
    category: Literal[
        "fatigue",
        "cognition",
        "mood",
        "inflammation",
        "metabolic",
        "endocrine",
        "medication",
        "other",
    ]
    interpretation_type: Literal[
        "possible_contributor",
        "association",
        "clinician_note",
    ] = "possible_contributor"
    summary: str
    supporting_result_ids: list[str] = Field(default_factory=list)
    confidence: float = Field(ge=0.0, le=1.0, default=0.5)
    caveats: list[str] = Field(default_factory=list)


class LabConfoundFlag(BaseModel):
    id: str
    target_analyzer: str
    strength: Literal["low", "moderate", "high"]
    confound_risk_score: float = Field(ge=0.0, le=1.0)
    rationale: str
    supporting_result_ids: list[str] = Field(default_factory=list)


class LabEvidenceLink(BaseModel):
    evidence_id: str
    source_type: Literal[
        "guideline",
        "literature",
        "institutional_rule",
        "model_card",
        "clinician_note",
        "internal_rule_pack",
    ]
    title: str
    snippet: str
    strength: Literal["high", "moderate", "low", "speculative"] = "moderate"
    uri: Optional[str] = None


class LabRecommendation(BaseModel):
    id: str
    type: Literal[
        "repeat_lab",
        "clinician_review",
        "med_review",
        "lifestyle",
        "escalation",
        "monitoring_interval",
        "caution_other_analyzers",
    ]
    priority: Literal["P0", "P1", "P2"] = "P1"
    text: str
    evidence_links: list[LabEvidenceLink] = Field(default_factory=list)
    linked_result_ids: list[str] = Field(default_factory=list)


class MultimodalLink(BaseModel):
    target_page: str
    label: str
    rationale: str
    deep_link: Optional[str] = None
    resource_id: Optional[str] = None
    last_updated_at: Optional[str] = None


class LabReviewAuditEvent(BaseModel):
    event_id: str
    event_type: Literal[
        "view",
        "ack_critical",
        "note",
        "override",
        "annotation",
        "recompute_requested",
    ]
    actor_user_id: Optional[str] = None
    timestamp: str
    payload: dict[str, Any] = Field(default_factory=dict)


class LabsExternalContext(BaseModel):
    active_medications: list[dict[str, Any]] = Field(default_factory=list)
    treatment_courses: list[dict[str, Any]] = Field(default_factory=list)
    latest_qeeg_analysis_id: Optional[str] = None
    latest_mri_analysis_id: Optional[str] = None
    fusion_case_id: Optional[str] = None
    deeptwin_last_run_id: Optional[str] = None
    biometrics_snapshot_id: Optional[str] = None


class LabsEvidenceBrief(BaseModel):
    finding_id: str
    literature_summary: str = ""
    confidence_score: float = 0.0
    top_pmids: list[str] = Field(default_factory=list)


class LabsAnalyzerPagePayload(BaseModel):
    schema_version: str = "1.0.0"
    generated_at: str
    patient_id: str
    patient_name: Optional[str] = None
    provenance: ProvenanceBlock
    confidence: ConfidenceBlock
    disclaimer_short: str
    lab_snapshot: LabSnapshot
    domain_summaries: list[LabDomainSummary] = Field(default_factory=list)
    results: list[LabResultRecord] = Field(default_factory=list)
    trend_windows: list[LabTrendWindow] = Field(default_factory=list)
    critical_alerts: list[LabCriticalValueAlert] = Field(default_factory=list)
    interpretations: list[LabClinicalInterpretation] = Field(default_factory=list)
    confound_flags: list[LabConfoundFlag] = Field(default_factory=list)
    recommendations: list[LabRecommendation] = Field(default_factory=list)
    multimodal_links: list[MultimodalLink] = Field(default_factory=list)
    external_context: LabsExternalContext = Field(default_factory=LabsExternalContext)
    evidence_brief: Optional[LabsEvidenceBrief] = None
    ai_clinical_narrative: Optional[str] = None
    ai_narrative_disclaimer: str = (
        "Optional AI narrative — rules + literature excerpts below are authoritative when they conflict."
    )


class LabsAuditResponse(BaseModel):
    patient_id: str
    items: list[LabReviewAuditEvent]
