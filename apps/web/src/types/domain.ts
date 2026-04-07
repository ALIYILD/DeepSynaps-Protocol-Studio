export type UserRole = "guest" | "clinician" | "admin";
export type PackageId = "explorer" | "resident" | "clinician_pro" | "clinic_team" | "enterprise";
export type ThemeMode = "light" | "dark";
export type WorkspaceSection =
  | "Dashboard"
  | "Assessment Builder"
  | "Protocols"
  | "Handbooks"
  | "Evidence Library"
  | "Device Registry"
  | "Upload Review"
  | "Governance / Safety"
  | "Pricing / Access";

export type DocumentStatus = "draft" | "review" | "approved" | "restricted";
export type EvidenceLevel = "Guideline" | "Systematic Review" | "Consensus" | "Registry" | "Emerging";
export type RegulatoryStatus = "Cleared" | "Approved" | "Research Use" | "Emerging";
export type NotificationTone = "info" | "warning" | "success";
export type Modality = "tDCS" | "TMS" | "TPS" | "PBM" | "Neurofeedback";
export type SymptomCluster =
  | "Motor symptoms"
  | "Attention regulation"
  | "Mood symptoms"
  | "Sleep disturbance"
  | "Cognitive fatigue";
export type DeviceUseType = "Clinic" | "Home" | "Hybrid";
export type UploadType = "PDF" | "qEEG Summary" | "MRI Report" | "Intake Form" | "Clinician Notes";
export type PricingTierName = "Explorer" | "Resident / Fellow" | "Clinician Pro" | "Clinic Team" | "Enterprise";
export type ApprovalBadge = "approved use" | "clinician-reviewed draft" | "off-label" | "emerging evidence";
export type HandbookKindApi = "clinician_handbook" | "patient_guide" | "technician_sop";
export type ReviewTargetType = "upload" | "protocol" | "handbook" | "evidence";
export type ReviewActionType = "reviewed" | "accepted" | "escalated" | "flagged";

export type WorkspaceMetric = {
  id: string;
  label: string;
  value: string;
  delta: string;
  detail: string;
};

export type DisclaimerSet = {
  professionalUseOnly: string;
  draftSupportOnly?: string;
  clinicianJudgment: string;
  offLabelReviewRequired?: string;
};

export type WorkspaceAlert = {
  id: string;
  title: string;
  body: string;
  tone: NotificationTone;
};

export type WorkspaceDocument = {
  id: string;
  title: string;
  section: WorkspaceSection;
  status: DocumentStatus;
  audience: string;
  updatedAt: string;
  owner: string;
  summary: string;
  evidence: EvidenceLevel;
};

export type ReviewQueueItem = {
  id: string;
  fileName: string;
  submittedBy: string;
  submittedAt: string;
  state: "pending" | "escalated" | "accepted";
  reviewerNote: string;
};

export type KnowledgeNote = {
  id: string;
  title: string;
  category: string;
  summary: string;
  evidence: EvidenceLevel;
};

export type RoleProfile = {
  role: UserRole;
  label: string;
  description: string;
  permissions: string[];
};

export type EvidenceItem = {
  id: string;
  title: string;
  condition: string;
  symptomCluster: SymptomCluster;
  modality: Modality;
  evidenceLevel: EvidenceLevel;
  regulatoryStatus: RegulatoryStatus;
  summary: string;
  evidenceStrength: string;
  supportedMethods: string[];
  contraindications: string[];
  references: string[];
  relatedDevices: string[];
  approvedNotes: string[];
  emergingNotes: string[];
};

export type DeviceRecord = {
  id: string;
  name: string;
  manufacturer: string;
  modality: Modality;
  channels: number;
  useType: DeviceUseType;
  regions: string[];
  regulatoryStatus: RegulatoryStatus;
  summary: string;
  bestFor: string[];
  constraints: string[];
  sampleDataNotice: string;
};

export type AssessmentFieldType = "text" | "textarea" | "select" | "number" | "checkbox";

export type AssessmentField = {
  id: string;
  label: string;
  type: AssessmentFieldType;
  required: boolean;
  helpText: string;
  options?: string[];
};

export type AssessmentTemplate = {
  id: string;
  title: string;
  description: string;
  sections: {
    id: string;
    title: string;
    fields: AssessmentField[];
  }[];
};

export type UploadedAsset = {
  id: string;
  type: UploadType;
  fileName: string;
  status: "staged" | "reviewed";
  summary: string;
};

export type CaseSummary = {
  presentingSymptoms: string[];
  relevantFindings: string[];
  redFlags: string[];
  possibleTargets: string[];
  suggestedModalities: Modality[];
  disclaimers?: DisclaimerSet;
};

export type ProtocolDraft = {
  rationale: string;
  targetRegion: string;
  sessionFrequency: string;
  duration: string;
  escalationLogic: string[];
  monitoringPlan: string[];
  contraindications: string[];
  patientCommunicationNotes: string[];
  evidenceGrade: string;
  approvalStatusBadge: ApprovalBadge;
  offLabelReviewRequired: boolean;
  disclaimers: DisclaimerSet;
};

export type HandbookDocumentPreview = {
  documentType: HandbookKindApi;
  title: string;
  overview: string;
  eligibility: string[];
  setup: string[];
  sessionWorkflow: string[];
  safety: string[];
  troubleshooting: string[];
  escalation: string[];
  references: string[];
};

export type HandbookGenerationResult = {
  document: HandbookDocumentPreview;
  disclaimers: DisclaimerSet;
  exportTargets: Array<"pdf" | "docx">;
};

export type AuditEvent = {
  eventId: string;
  targetId: string;
  targetType: string;
  action: string;
  role: UserRole;
  note: string;
  createdAt: string;
};

export type GovernanceItem = {
  id: string;
  title: string;
  body: string;
  bullets: string[];
};

export type PricingTier = {
  id: string;
  name: PricingTierName;
  price: string;
  description: string;
  audience: string;
  features: string[];
};

export type FeatureMatrixRow = {
  feature: string;
  availability: Record<PricingTierName, string>;
};
