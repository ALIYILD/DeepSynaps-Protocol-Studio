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

// ── Brain Regions ──────────────────────────────────────────────────────────────

export type ApiBrainRegion = {
  region_id: string;
  region_name: string;
  abbreviation: string;
  lobe: string;
  depth: string;
  eeg_position_10_20: string;
  brodmann_area: string;
  primary_functions: string;
  brain_network: string;
  key_conditions: string;
  targetable_modalities: string;
  notes: string;
  review_status: string;
};

export type ApiBrainRegionListResponse = {
  items: ApiBrainRegion[];
  total: number;
};

// ── qEEG Biomarkers ────────────────────────────────────────────────────────────

export type ApiQEEGBiomarker = {
  band_id: string;
  band_name: string;
  hz_range: string;
  normal_brain_state: string;
  key_regions: string;
  eeg_positions: string;
  pathological_increase: string;
  pathological_decrease: string;
  associated_disorders: string;
  clinical_significance: string;
  review_status: string;
};

export type ApiQEEGBiomarkerListResponse = {
  items: ApiQEEGBiomarker[];
  total: number;
};

// ── qEEG Condition Map ─────────────────────────────────────────────────────────

export type ApiQEEGConditionMap = {
  map_id: string;
  condition_id: string;
  condition_name: string;
  key_symptoms: string;
  qeeg_patterns: string;
  key_qeeg_electrode_sites: string;
  affected_brain_regions: string;
  primary_networks_disrupted: string;
  network_dysfunction_pattern: string;
  recommended_neuromod_techniques: string;
  primary_stimulation_targets: string;
  stimulation_rationale: string;
  review_status: string;
};

export type ApiQEEGConditionMapListResponse = {
  items: ApiQEEGConditionMap[];
  total: number;
};
