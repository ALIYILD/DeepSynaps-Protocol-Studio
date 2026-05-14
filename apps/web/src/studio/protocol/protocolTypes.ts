/**
 * Protocol Studio — Core TypeScript types for clinical neuromodulation protocol management.
 *
 * These types model protocol generation drafts, evidence links, patient context,
 * and the full spectrum of AI-assisted decision-support outputs. All fields are
 * PHI-safe by design; no direct patient identifiers in draft payloads.
 *
 * Sprint 3: Extended with approval workflow, audit trail, and safety checklist types.
 */

/** Supported AI generation modes for protocol creation. */
export type GenerationMode =
  | "evidence_search"
  | "qeeg_guided"
  | "mri_guided"
  | "deeptwin_personalized"
  | "multimodal"
  | "auto_ai"
  | "clinician_guided"
  | "research_exploratory";

/** Clinical lifecycle status for a protocol draft. */
export type DraftStatus =
  | "draft_requires_review"
  | "insufficient_evidence"
  | "needs_more_data"
  | "blocked_requires_review"
  | "research_only_not_prescribable"
  | "under_review"
  | "approved"
  | "rejected"
  | "prescribed"
  | "completed";

/** A single tunable parameter within a protocol. */
export interface ProtocolParameter {
  id?: string;
  name: string;
  value: string | number;
  unit?: string;
  /** Tuple of [min, max] for safe range validation. */
  range?: [number, number];
  min?: number;
  max?: number;
  required?: boolean;
  /** AI-suggested value for comparison. */
  aiSuggested?: string | number;
  /** Clinician-edited value. */
  clinicianEdit?: string | number;
  /** Clinician notes per parameter. */
  notes?: string;
}

/** Evidence grade classification. */
export type EvidenceGrade =
  | "A_systematic_review"
  | "B_randomized_trial"
  | "C_observational"
  | "D_expert_opinion"
  | "E_anecdotal"
  | "A"
  | "B"
  | "C"
  | "D";

/** A link to external or internal evidence supporting a protocol. */
export interface EvidenceLink {
  id: string;
  title: string;
  link?: string;
  url?: string;
  retrievalSource?: string;
  retrievedAt?: string;
  /** Evidence quality grade (A-D or extended form). */
  grade: EvidenceGrade;
  /** Publication year. */
  year?: number;
}

/** A protocol draft produced by AI generation or manual composition. */
export interface ProtocolDraft {
  draftId: string;
  status: DraftStatus;
  mode: GenerationMode;
  protocolSummary: string;
  parameters: ProtocolParameter[];
  rationale: string[];
  evidenceLinks: EvidenceLink[];
  evidenceGrade: string | null;
  regulatoryStatus: string | null;
  offLabel: boolean;
  offLabelWarning?: string;
  contraindications: string[];
  missingData: string[];
  uncertainty: string;
  createdAt: string;
  updatedAt?: string;
  reviewedBy?: string;
  approvedBy?: string;
  prescribedBy?: string;
}

/** PHI-minimized patient context shown in the protocol studio sidebar. */
export interface PatientContext {
  patientId: string;
  fullName?: string;
  diagnosis?: string;
  age?: number;
  dataSources: {
    qeeg: boolean;
    mri: boolean;
    deeptwin: boolean;
    evidence: boolean;
  };
}

/** A clinical condition selectable for protocol generation. */
export interface ConditionItem {
  id: string;
  label: string;
  category: string;
}

/** A neuromodulation modality (e.g., rTMS, tDCS). */
export interface ModalityItem {
  id: string;
  label: string;
  description: string;
}

/* ═══════════════════════════════════════════════════════════════════════════ *
 *  SPRINT 3 — Approval Workflow, Audit Trail, Safety Checklist Types
 * ═══════════════════════════════════════════════════════════════════════════ */

/** Workflow states for the clinical approval pipeline. */
export type WorkflowState =
  | "draft"
  | "under_review"
  | "approved"
  | "rejected"
  | "prescribed"
  | "completed";

/** Types of auditable actions on a protocol. */
export type AuditAction =
  | "created"
  | "edited"
  | "reviewed"
  | "approved"
  | "rejected"
  | "prescribed"
  | "completed";

/** A single audit trail entry — immutable record of who did what and when. */
export interface AuditEntry {
  id: string;
  timestamp: string;
  actor: string;
  actorRole: string;
  action: AuditAction;
  reason: string;
  metadata?: Record<string, unknown>;
}

/** A state transition in the approval workflow. */
export interface WorkflowTransition {
  from: WorkflowState;
  to: WorkflowState;
  actorRole: string;
  requiredChecks?: string[];
}

/** A comment attached to a specific workflow state. */
export interface WorkflowComment {
  id: string;
  timestamp: string;
  author: string;
  authorRole: string;
  state: WorkflowState;
  message: string;
}

/** A version snapshot of the protocol for history tracking. */
export interface ProtocolVersion {
  version: number;
  createdAt: string;
  createdBy: string;
  changes: string;
  draft: ProtocolDraft;
}

/** Full approval workflow state container. */
export interface ApprovalWorkflowState {
  currentState: WorkflowState;
  history: WorkflowTransition[];
  comments: WorkflowComment[];
  auditTrail: AuditEntry[];
  versions: ProtocolVersion[];
}

/** A single checklist item for clinical safety verification. */
export interface ChecklistItem {
  id: string;
  label: string;
  required: boolean;
  /** Only show this item when the condition function returns true. */
  conditional?: (draft: ProtocolDraft) => boolean;
}

/** Map of checklist item IDs to their checked state. */
export type ChecklistState = Record<string, boolean>;

/** Clinical role types for role-based access control. */
export type ClinicalRole =
  | "system_ai"
  | "reviewing_clinician"
  | "senior_clinician"
  | "prescribing_physician"
  | "pharmacist"
  | "administrator";

/** Display metadata for a clinical role badge. */
export interface RoleBadge {
  role: ClinicalRole;
  label: string;
  color: string;
}

/* ═══════════════════════════════════════════════════════════════════════════ *
 *  API Request / Response Types (from Sprint 1)
 * ═══════════════════════════════════════════════════════════════════════════ */

/** Request payload for AI protocol generation. */
export interface GenerateProtocolRequest {
  mode: GenerationMode;
  conditionId?: string;
  modalityId?: string;
  target?: string;
  constraints?: string[];
  offLabel?: boolean;
  patientId?: string;
}

/** Request payload for protocol recommendation. */
export interface RecommendProtocolRequest {
  conditionId: string;
  patientId?: string;
  modalityId?: string;
  preferredTarget?: string;
}

/** Request payload for parameter simulation. */
export interface SimulateProtocolRequest {
  protocolId: string;
  parameters: ProtocolParameter[];
  durationWeeks?: number;
  patientId?: string;
}

/** API response wrapper for evidence health. */
export interface EvidenceHealthResponse {
  status: "healthy" | "degraded" | "unavailable";
  sources: Array<{
    source: string;
    available: boolean;
    count: number;
    lastUpdated: string | null;
  }>;
}

/** API response wrapper for evidence search. */
export interface EvidenceSearchResponse {
  results: Array<{
    id: string;
    title: string;
    authors: string[];
    year: number;
    abstract?: string;
    source: string;
    grade: "A" | "B" | "C" | "D";
    url?: string;
  }>;
  total: number;
  query: string;
}

/** API response wrapper for protocol catalog. */
export interface ProtocolCatalogResponse {
  protocols: Array<{
    id: string;
    title: string;
    condition: string;
    modality: string;
    target: string;
    parameters: ProtocolParameter[];
    evidenceGrade: string;
    status: string;
  }>;
  total: number;
}

/** API response wrapper for protocol detail. */
export interface ProtocolDetailResponse {
  id: string;
  title: string;
  condition: string;
  modality: string;
  target: string;
  parameters: ProtocolParameter[];
  evidenceGrade: string;
  status: string;
  contraindications: string[];
  rationale: string[];
  evidenceLinks: EvidenceLink[];
  offLabel: boolean;
  regulatoryStatus: string;
}

/** API response for protocol generation. */
export interface GenerateProtocolResponse {
  draft: ProtocolDraft;
}

/** API response for protocol recommendation. */
export interface RecommendProtocolResponse {
  recommendations: Array<{
    protocolId: string;
    title: string;
    score: number;
    rationale: string;
    evidenceGrade: string;
  }>;
}

/** API response for simulation. */
export interface SimulateProtocolResponse {
  simulationId: string;
  predictedResponse: string;
  confidence: number;
  warnings: string[];
  timelineWeeks: number;
  projectedImprovement: number;
}

/** API response for patient context. */
export interface PatientContextResponse {
  context: PatientContext;
}

/** API response for drafts list. */
export interface DraftsResponse {
  drafts: ProtocolDraft[];
  total: number;
}
