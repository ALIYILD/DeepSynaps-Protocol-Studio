/**
 * Protocol Studio — Barrel export file.
 *
 * Re-exports all public components, types, and API functions for the
 * Protocol Studio clinical neuromodulation module.
 */

// ── Types ────────────────────────────────────────────────────────────────────
export type {
  GenerationMode,
  DraftStatus,
  ProtocolParameter,
  EvidenceLink,
  ProtocolDraft,
  PatientContext,
  ConditionItem,
  ModalityItem,
  GenerateProtocolRequest,
  RecommendProtocolRequest,
  SimulateProtocolRequest,
  EvidenceHealthResponse,
  EvidenceSearchResponse,
  ProtocolCatalogResponse,
  ProtocolDetailResponse,
  GenerateProtocolResponse,
  RecommendProtocolResponse,
  SimulateProtocolResponse,
  PatientContextResponse,
  DraftsResponse,
} from "./protocolTypes";

// ── API ──────────────────────────────────────────────────────────────────────
export {
  fetchEvidenceHealth,
  searchEvidence,
  fetchProtocols,
  fetchProtocolDetail,
  generateProtocol,
  recommendProtocol,
  simulateProtocol,
  fetchPatientContext,
  fetchDrafts,
  saveDraft,
  deleteDraft,
} from "./protocolApi";

// ── Components ───────────────────────────────────────────────────────────────
export { default as SafetyBanner } from "./SafetyBanner";
export { default as PatientContextPanel } from "./PatientContextPanel";
export { default as EvidenceGrade } from "./EvidenceGrade";
export type { EvidenceGradeValue } from "./EvidenceGrade";
export { default as EvidenceCard } from "./EvidenceCard";
export { default as EvidencePanel } from "./EvidencePanel";
export { default as GenerationWizard } from "./GenerationWizard";
export { default as DraftManager } from "./DraftManager";
export { default as ProtocolStudioPage } from "./ProtocolStudioPage";
