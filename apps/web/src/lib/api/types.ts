import {
  DeviceUseType,
  EvidenceLevel,
  HandbookKindApi,
  Modality,
  RegulatoryStatus,
  ReviewActionType,
  ReviewTargetType,
  SymptomCluster,
  UploadType,
  UserRole,
} from "../../types/domain";

export type ApiDisclaimerSet = {
  professional_use_only: string;
  draft_support_only?: string | null;
  clinician_judgment: string;
  off_label_review_required?: string | null;
};

export type ApiErrorResponse = {
  code: string;
  message: string;
  warnings: string[];
};

export type ApiEvidenceRecord = {
  id: string;
  title: string;
  condition: string;
  symptom_cluster: SymptomCluster;
  modality: Modality;
  evidence_level: EvidenceLevel;
  regulatory_status: RegulatoryStatus;
  summary: string;
  evidence_strength: string;
  supported_methods: string[];
  contraindications: string[];
  references: string[];
  related_devices: string[];
  approved_notes: string[];
  emerging_notes: string[];
  disclaimers: ApiDisclaimerSet;
};

export type ApiEvidenceListResponse = {
  items: ApiEvidenceRecord[];
  total: number;
  disclaimers: ApiDisclaimerSet;
};

export type ApiDeviceRecord = {
  id: string;
  name: string;
  manufacturer: string;
  modality: Modality;
  channels: number;
  use_type: DeviceUseType;
  regions: string[];
  regulatory_status: RegulatoryStatus;
  summary: string;
  best_for: string[];
  constraints: string[];
  sample_data_notice: string;
  disclaimers: ApiDisclaimerSet;
};

export type ApiDeviceListResponse = {
  items: ApiDeviceRecord[];
  total: number;
  disclaimers: ApiDisclaimerSet;
};

export type ApiUploadedAsset = {
  type: UploadType;
  file_name: string;
  summary: string;
};

export type ApiCaseSummaryRequest = {
  uploads: ApiUploadedAsset[];
};

export type ApiCaseSummaryResponse = {
  presenting_symptoms: string[];
  relevant_findings: string[];
  red_flags: string[];
  possible_targets: string[];
  suggested_modalities: Modality[];
  disclaimers: ApiDisclaimerSet;
};

export type ApiProtocolDraftRequest = {
  condition: string;
  symptom_cluster: SymptomCluster;
  modality: Modality;
  device: string;
  setting: "Clinic" | "Home";
  evidence_threshold: "Guideline" | "Systematic Review" | "Consensus" | "Registry";
  off_label: boolean;
};

export type ApiProtocolDraftResponse = {
  rationale: string;
  target_region: string;
  session_frequency: string;
  duration: string;
  escalation_logic: string[];
  monitoring_plan: string[];
  contraindications: string[];
  patient_communication_notes: string[];
  evidence_grade: string;
  approval_status_badge: "approved use" | "clinician-reviewed draft" | "off-label" | "emerging evidence";
  off_label_review_required: boolean;
  disclaimers: ApiDisclaimerSet;
};

export type ApiHandbookGenerateRequest = {
  handbook_kind: HandbookKindApi;
  condition: string;
  modality: Modality;
};

export type ApiHandbookDocument = {
  document_type: HandbookKindApi;
  title: string;
  overview: string;
  eligibility: string[];
  setup: string[];
  session_workflow: string[];
  safety: string[];
  troubleshooting: string[];
  escalation: string[];
  references: string[];
};

export type ApiHandbookGenerateResponse = {
  document: ApiHandbookDocument;
  disclaimers: ApiDisclaimerSet;
  export_targets: Array<"pdf" | "docx">;
};

export type ApiReviewActionRequest = {
  target_id: string;
  target_type: ReviewTargetType;
  action: ReviewActionType;
  note: string;
};

export type ApiAuditEvent = {
  event_id: string;
  target_id: string;
  target_type: string;
  action: string;
  role: UserRole;
  note: string;
  created_at: string;
};

export type ApiReviewActionResponse = {
  event: ApiAuditEvent;
  disclaimers: ApiDisclaimerSet;
};

export type ApiAuditTrailResponse = {
  items: ApiAuditEvent[];
  total: number;
  disclaimers: ApiDisclaimerSet;
};
