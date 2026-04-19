from typing import Any, Literal, Union

from pydantic import BaseModel, Field, field_validator


UserRole = Literal["guest", "clinician", "admin"]
EvidenceLevel = str
RegulatoryStatus = str
ModalityName = str
SymptomCluster = str
ApprovalBadge = Literal[
    "approved use",
    "clinician-reviewed draft",
    "off-label",
    "emerging evidence",
]
HandbookKind = Literal["clinician_handbook", "patient_guide", "technician_sop"]


class DisclaimerSet(BaseModel):
    professional_use_only: str
    draft_support_only: str | None = None
    clinician_judgment: str
    off_label_review_required: str | None = None


class ConditionProfile(BaseModel):
    slug: str
    name: str
    phenotypes: list[str] = Field(default_factory=list)
    contraindications: list[str] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)

    @field_validator("contraindications", mode="before")
    @classmethod
    def _flatten_contraindications(cls, v: Union[list, dict]) -> list[str]:
        """Accept both flat list[str] and structured {'absolute': [...], 'relative': [...]} dict."""
        if isinstance(v, dict):
            items: list[str] = []
            for section in v.values():
                if isinstance(section, list):
                    for entry in section:
                        if isinstance(entry, dict):
                            items.append(entry.get("condition") or str(entry))
                        else:
                            items.append(str(entry))
            return items
        return v


class ModalityProfile(BaseModel):
    slug: str
    name: str
    treatment_family: str
    supported_device_slugs: list[str] = Field(default_factory=list)
    safety_notes: list[str] = Field(default_factory=list)


class DeviceProfile(BaseModel):
    slug: str
    name: str
    manufacturer: str
    supported_modality_slugs: list[str] = Field(default_factory=list)
    markets: list[str] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)


class AssessmentPlan(BaseModel):
    title: str
    sections: list[str] = Field(default_factory=list)


class SessionStep(BaseModel):
    order: int
    title: str
    detail: str


class SessionStructure(BaseModel):
    total_sessions: int
    sessions_per_week: int
    session_duration_minutes: int
    steps: list[SessionStep] = Field(default_factory=list)


class HandbookSection(BaseModel):
    title: str
    bullets: list[str] = Field(default_factory=list)


class ProtocolPlan(BaseModel):
    title: str
    condition_slug: str
    modality_slug: str
    device_slug: str
    phenotype: str
    summary: str
    support_basis: list[str] = Field(default_factory=list)
    safety_notes: list[str] = Field(default_factory=list)
    monitoring: list[str] = Field(default_factory=list)
    contraindications: list[str] = Field(default_factory=list)
    session_structure: SessionStructure
    checks: list[str] = Field(default_factory=list)


class IntakePreviewRequest(BaseModel):
    condition_slug: str
    phenotype: str = Field(min_length=1)
    modality_slug: str
    device_slug: str


class IntakeSummary(BaseModel):
    condition_name: str
    condition_slug: str
    phenotype: str
    modality_name: str
    modality_slug: str
    device_name: str
    device_slug: str


class SupportStatus(BaseModel):
    status: Literal["supported", "unsupported"]
    message: str


class ClinicianHandbookPlan(BaseModel):
    title: str
    audience: str
    summary: str
    support_basis: list[str] = Field(default_factory=list)
    safety_notes: list[str] = Field(default_factory=list)
    monitoring: list[str] = Field(default_factory=list)
    contraindications: list[str] = Field(default_factory=list)
    session_structure: SessionStructure
    sections: list[HandbookSection] = Field(default_factory=list)


class IntakePreviewResponse(BaseModel):
    intake_summary: IntakeSummary
    support_status: SupportStatus
    warnings: list[str] = Field(default_factory=list)
    protocol_plan: ProtocolPlan
    clinician_handbook_plan: ClinicianHandbookPlan


class ErrorResponse(BaseModel):
    code: str
    message: str
    warnings: list[str] = Field(default_factory=list)
    details: dict[str, object] | None = None


class RoleContext(BaseModel):
    role: UserRole


class EvidenceRecord(BaseModel):
    id: str
    title: str
    condition: str
    symptom_cluster: SymptomCluster
    modality: ModalityName
    evidence_level: EvidenceLevel
    regulatory_status: RegulatoryStatus
    summary: str
    evidence_strength: str
    supported_methods: list[str] = Field(default_factory=list)
    contraindications: list[str] = Field(default_factory=list)
    references: list[str] = Field(default_factory=list)
    related_devices: list[str] = Field(default_factory=list)
    approved_notes: list[str] = Field(default_factory=list)
    emerging_notes: list[str] = Field(default_factory=list)
    disclaimers: DisclaimerSet


class EvidenceListResponse(BaseModel):
    items: list[EvidenceRecord] = Field(default_factory=list)
    total: int
    disclaimers: DisclaimerSet


class DeviceRecord(BaseModel):
    id: str
    name: str
    manufacturer: str
    modality: ModalityName
    channels: int
    use_type: Literal["Clinic", "Home", "Hybrid"]
    regions: list[str] = Field(default_factory=list)
    regulatory_status: RegulatoryStatus
    summary: str
    best_for: list[str] = Field(default_factory=list)
    constraints: list[str] = Field(default_factory=list)
    sample_data_notice: str
    disclaimers: DisclaimerSet


class DeviceListResponse(BaseModel):
    items: list[DeviceRecord] = Field(default_factory=list)
    total: int
    disclaimers: DisclaimerSet


class UploadedAsset(BaseModel):
    type: Literal["PDF", "qEEG Summary", "MRI Report", "Intake Form", "Clinician Notes"]
    file_name: str
    summary: str


class CaseSummaryRequest(BaseModel):
    uploads: list[UploadedAsset] = Field(default_factory=list)


class CaseSummaryResponse(BaseModel):
    presenting_symptoms: list[str] = Field(default_factory=list)
    relevant_findings: list[str] = Field(default_factory=list)
    red_flags: list[str] = Field(default_factory=list)
    possible_targets: list[str] = Field(default_factory=list)
    suggested_modalities: list[ModalityName] = Field(default_factory=list)
    disclaimers: DisclaimerSet


class ProtocolDraftRequest(BaseModel):
    condition: str
    symptom_cluster: SymptomCluster
    modality: ModalityName
    device: str = Field(
        default="",
        description=(
            "Registry device name or alias. When empty, the server deterministically resolves a "
            "compatible device from condition/modality protocol rows. If multiple devices match, "
            "HTTP 409 is returned with ranked candidates until the client supplies a device."
        ),
    )
    setting: Literal["Clinic", "Home"]
    evidence_threshold: Literal["Guideline", "Systematic Review", "Consensus", "Registry"]
    off_label: bool = False
    # Optional future ranking hints — must never bypass registry eligibility or safety ordering.
    qeeg_summary: str | None = Field(
        default=None,
        description="Optional qEEG summary text for future deterministic ranking among eligible protocols only.",
    )
    phenotype_tags: list[str] = Field(
        default_factory=list,
        description=(
            "Optional phenotype labels; used only to score overlap with imported phenotype rows "
            "when multiple protocol rows are eligible (deterministic substring match)."
        ),
    )
    comorbidities: list[str] = Field(
        default_factory=list,
        description="Optional comorbidity labels for future contraindication-aware ranking hints.",
    )
    prior_response: str | None = Field(
        default=None,
        description="Optional prior treatment response note for future ranking (not used in core selection).",
    )
    prior_failed_modalities: list[str] = Field(
        default_factory=list,
        description="Optional list of modalities already tried; for future ranking only.",
    )
    include_personalization_debug: bool = Field(
        default=False,
        description=(
            "When true, response may include personalization_why_selected_debug (compact why-selected projection). "
            "Does not change ranking."
        ),
    )
    include_structured_rule_matches_detail: bool = Field(
        default=True,
        description=(
            "When false, structured_rule_matches_by_protocol is omitted (empty) to keep payloads lean. "
            "When true (default), per-protocol rule fires are included as today. Ignored when no eligible rows."
        ),
    )


class RankedDeviceCandidate(BaseModel):
    rank: int
    device_id: str
    device_name: str
    score: int
    rationale: list[str] = Field(default_factory=list)


class DeviceResolutionInfo(BaseModel):
    """Traceability for how the registry selected or validated the device."""

    resolution_method: Literal["user_selected", "auto_resolved", "user_selected_validated"]
    resolved_device: str
    clinical_evidence_snapshot_id: str | None = None
    ranking_notes: list[str] = Field(default_factory=list)
    device_selection_rationale: list[str] = Field(default_factory=list)
    candidate_devices: list[RankedDeviceCandidate] = Field(default_factory=list)
    safety_checks_applied: list[str] = Field(default_factory=list)


class StructuredRuleFire(BaseModel):
    """One structured personalization rule that matched an eligible protocol row."""

    rule_id: str
    score_delta: int
    rationale_label: str = ""


class TopProtocolStructuredScore(BaseModel):
    """Compact row for structured-score ordering in debug projections."""

    protocol_id: str
    structured_score_total: int


class PersonalizationWhySelectedDebug(BaseModel):
    """Opt-in compact explanation of deterministic protocol selection (no PHI)."""

    format_version: int = 1
    selected_protocol_id: str = ""
    selected_protocol_name: str = ""
    csv_first_baseline_protocol_id: str | None = None
    csv_first_baseline_protocol_name: str | None = None
    personalization_changed_vs_csv_first: bool | None = None
    fired_rule_ids: list[str] = Field(default_factory=list)
    fired_rule_labels: list[str] = Field(default_factory=list)
    structured_rule_score_total: int = 0
    token_fallback_used: bool = False
    ranking_factors_applied: list[str] = Field(default_factory=list)
    secondary_sort_factors: list[str] = Field(default_factory=list)
    top_protocols_by_structured_score: list[TopProtocolStructuredScore] = Field(default_factory=list)
    deterministic_rank_order_protocol_ids: list[str] = Field(default_factory=list)
    eligible_protocol_count: int = 0


PERSISTED_PERSONALIZATION_EXPLAINABILITY_MAX_TOP_PROTOCOLS = 20


class PersistedPersonalizationExplainability(BaseModel):
    """Durable, bounded snapshot stored with saved treatment courses (no large rule maps).

    Subset of :class:`PersonalizationWhySelectedDebug` suitable for ``protocol_json`` persistence.
    Built only when generation included ``include_personalization_debug`` and eligible rows existed.
    """

    format_version: int = 1
    selected_protocol_id: str = ""
    csv_first_protocol_id: str | None = Field(
        default=None,
        description="Same as csv_first_baseline_protocol_id on live debug; stable persisted name.",
    )
    personalization_changed_vs_csv_first: bool | None = None
    fired_rule_ids: list[str] = Field(default_factory=list)
    fired_rule_labels: list[str] = Field(default_factory=list)
    structured_rule_score_total: int = 0
    token_fallback_used: bool = False
    ranking_factors_applied: list[str] = Field(default_factory=list)
    top_protocols_by_structured_score: list[TopProtocolStructuredScore] = Field(default_factory=list)
    eligible_protocol_count: int = 0

    @classmethod
    def from_personalization_why_selected_debug(
        cls,
        dbg: PersonalizationWhySelectedDebug,
        *,
        max_top_protocols: int = PERSISTED_PERSONALIZATION_EXPLAINABILITY_MAX_TOP_PROTOCOLS,
    ) -> "PersistedPersonalizationExplainability":
        top = list(dbg.top_protocols_by_structured_score)[: max(0, max_top_protocols)]
        return cls(
            format_version=dbg.format_version,
            selected_protocol_id=dbg.selected_protocol_id,
            csv_first_protocol_id=dbg.csv_first_baseline_protocol_id,
            personalization_changed_vs_csv_first=dbg.personalization_changed_vs_csv_first,
            fired_rule_ids=list(dbg.fired_rule_ids),
            fired_rule_labels=list(dbg.fired_rule_labels),
            structured_rule_score_total=dbg.structured_rule_score_total,
            token_fallback_used=dbg.token_fallback_used,
            ranking_factors_applied=list(dbg.ranking_factors_applied),
            top_protocols_by_structured_score=top,
            eligible_protocol_count=dbg.eligible_protocol_count,
        )


class PersonalizationRulesReviewResponse(BaseModel):
    """Registry governance snapshot for reviewer/admin tools."""

    format_version: int = 1
    snapshot: dict[str, Any] = Field(
        default_factory=dict,
        description="Deterministic JSON-serializable output from build_personalization_rule_review_snapshot.",
    )
    report_text: str | None = Field(
        default=None,
        description="Optional multi-line human-readable report when requested.",
    )


class ProtocolDraftResponse(BaseModel):
    rationale: str
    target_region: str
    session_frequency: str
    duration: str
    escalation_logic: list[str] = Field(default_factory=list)
    monitoring_plan: list[str] = Field(default_factory=list)
    contraindications: list[str] = Field(default_factory=list)
    patient_communication_notes: list[str] = Field(default_factory=list)
    evidence_grade: str
    approval_status_badge: ApprovalBadge
    off_label_review_required: bool = False
    disclaimers: DisclaimerSet
    device_resolution: DeviceResolutionInfo | None = None
    ranking_factors_applied: list[str] = Field(
        default_factory=list,
        description="Deterministic ranking factors used once personalization is implemented.",
    )
    personalization_inputs_used: list[str] = Field(
        default_factory=list,
        description="Which optional request hint fields were non-empty (audit / transparency).",
    )
    protocol_ranking_rationale: list[str] = Field(
        default_factory=list,
        description="Human-readable notes for future protocol-ranking tier (qEEG/phenotype).",
    )
    structured_rules_applied: list[str] = Field(
        default_factory=list,
        description="Rule_ID values from personalization_rules.csv that contributed Score_Delta to the selected protocol.",
    )
    structured_rule_labels_applied: list[str] = Field(
        default_factory=list,
        description="Rationale_Label values for rules in structured_rules_applied (same order as rule application).",
    )
    structured_rule_score_total: int = Field(
        default=0,
        description="Sum of Score_Delta from structured_rules_applied for the selected protocol.",
    )
    structured_rule_matches_by_protocol: dict[str, list[StructuredRuleFire]] = Field(
        default_factory=dict,
        description=(
            "Per eligible Protocol_ID, which structured rules matched and their deltas (audit / debug). "
            "Omitted when include_structured_rule_matches_detail is false on the request."
        ),
    )
    personalization_why_selected_debug: PersonalizationWhySelectedDebug | None = Field(
        default=None,
        description=(
            "Present only when include_personalization_debug was true on the request and eligible rows existed. "
            "Compact deterministic why-selected projection; does not change ranking."
        ),
    )


class HandbookGenerateRequest(BaseModel):
    handbook_kind: HandbookKind
    condition: str
    modality: ModalityName
    device: str = ""


class HandbookDocument(BaseModel):
    document_type: HandbookKind
    title: str
    overview: str
    eligibility: list[str] = Field(default_factory=list)
    setup: list[str] = Field(default_factory=list)
    session_workflow: list[str] = Field(default_factory=list)
    safety: list[str] = Field(default_factory=list)
    troubleshooting: list[str] = Field(default_factory=list)
    escalation: list[str] = Field(default_factory=list)
    references: list[str] = Field(default_factory=list)


class HandbookGenerateResponse(BaseModel):
    document: HandbookDocument
    disclaimers: DisclaimerSet
    export_targets: list[Literal["pdf", "docx"]] = Field(default_factory=lambda: ["pdf", "docx"])


class ReviewActionRequest(BaseModel):
    target_id: str
    target_type: Literal["upload", "protocol", "handbook", "evidence"]
    action: Literal["reviewed", "accepted", "escalated", "flagged"]
    note: str = Field(min_length=1)


class AuditEvent(BaseModel):
    event_id: str
    target_id: str
    target_type: str
    action: str
    role: UserRole
    note: str
    created_at: str


class ReviewActionResponse(BaseModel):
    event: AuditEvent
    disclaimers: DisclaimerSet


class AuditTrailResponse(BaseModel):
    items: list[AuditEvent] = Field(default_factory=list)
    total: int
    disclaimers: DisclaimerSet


class BrainRegion(BaseModel):
    id: str
    name: str
    abbreviation: str
    lobe: str
    depth: str
    eeg_position_10_20: str
    brodmann_area: str
    primary_functions: str
    brain_network: str
    key_conditions: str
    targetable_modalities: list[str] = Field(default_factory=list)
    notes: str
    review_status: str


class BrainRegionListResponse(BaseModel):
    items: list[BrainRegion] = Field(default_factory=list)
    total: int


class QEEGBiomarker(BaseModel):
    id: str
    band_name: str
    hz_range: str
    normal_brain_state: str
    key_regions: str
    eeg_positions: str
    pathological_increase: str
    pathological_decrease: str
    associated_disorders: str
    clinical_significance: str
    review_status: str


class QEEGBiomarkerListResponse(BaseModel):
    items: list[QEEGBiomarker] = Field(default_factory=list)
    total: int


class QEEGConditionMap(BaseModel):
    id: str
    condition_id: str
    condition_name: str
    key_symptoms: str
    qeeg_patterns: str
    key_qeeg_electrode_sites: str
    affected_brain_regions: str
    primary_networks_disrupted: str
    network_dysfunction_pattern: str
    recommended_neuromod_techniques: str
    primary_stimulation_targets: str
    stimulation_rationale: str
    review_status: str


class QEEGConditionMapListResponse(BaseModel):
    items: list[QEEGConditionMap] = Field(default_factory=list)
    total: int
