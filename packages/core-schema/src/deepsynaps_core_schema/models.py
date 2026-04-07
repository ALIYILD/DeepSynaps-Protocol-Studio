from typing import Literal

from pydantic import BaseModel, Field


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
    device: str
    setting: Literal["Clinic", "Home"]
    evidence_threshold: Literal["Guideline", "Systematic Review", "Consensus", "Registry"]
    off_label: bool = False


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


class HandbookGenerateRequest(BaseModel):
    handbook_kind: HandbookKind
    condition: str
    modality: ModalityName


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
