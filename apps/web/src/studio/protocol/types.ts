/**
 * Protocol Module Type Definitions — DeepSynaps Protocol Studio
 * ==============================================================
 * Types for protocol generation, review, evidence grading, and safety.
 */

export type EvidenceGrade = "A" | "B" | "C" | "D";
export type EvidenceLevel = "I" | "II" | "III" | "IV" | "V";
export type ProtocolMode = "rTMS" | "tDCS" | "tACS" | "tRNS" | "neurofeedback" | "EEG";
export type TargetRegion = "DLPFC" | "M1" | "SMA" | "V1" | "F3" | "F4" | "Cz" | "Pz" | "O1" | "O2" | "T3" | "T4" | "custom";
export type SafetyStatus = "pass" | "fail" | "pending" | "na";

export interface EvidenceLink {
  id: string;
  title: string;
  authors: string;
  year: number;
  journal: string;
  doi: string;
  grade: EvidenceGrade;
  level: EvidenceLevel;
  pmid?: number;
  url?: string;
  summary?: string;
  isExpanded?: boolean;
}

export interface ConditionItem {
  id: string;
  name: string;
  category: string;
  icd10Code?: string;
  commonModes: ProtocolMode[];
  description?: string;
}

export interface ModalityItem {
  id: string;
  name: string;
  mode: ProtocolMode;
  description: string;
  contraindications: string[];
  typicalDuration: string;
  frequency: string;
}

export interface PatientContext {
  id: string;
  initials: string;
  age: number;
  gender: "M" | "F" | "NB" | "U";
  primaryCondition: string;
  comorbidities: string[];
  medications: string[];
  previousTreatments: string[];
  metalImplants: boolean;
  seizureHistory: boolean;
  pregnancyStatus?: "pregnant" | "not_pregnant" | "unknown";
  notes?: string;
}

export interface ProtocolDraft {
  id: string;
  title: string;
  mode: ProtocolMode;
  targetRegion: TargetRegion;
  frequency?: number;
  intensity?: number;
  duration: number;
  sessions: number;
  interTrainInterval?: number;
  pulseCount?: number;
  coilType?: string;
  evidenceLinks: EvidenceLink[];
  patientContext: PatientContext;
  safetyChecks: SafetyCheckItem[];
  status: "draft" | "review_pending" | "approved" | "rejected";
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  notes?: string;
}

export interface SafetyCheckItem {
  id: string;
  category: string;
  description: string;
  status: SafetyStatus;
  required: boolean;
  notes?: string;
}

export interface WizardStep {
  id: string;
  label: string;
  description: string;
  isComplete: boolean;
  isActive: boolean;
}

export interface ProtocolTemplate {
  id: string;
  name: string;
  mode: ProtocolMode;
  condition: string;
  description: string;
  defaultParams: Partial<ProtocolDraft>;
}
