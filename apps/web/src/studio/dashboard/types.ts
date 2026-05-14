/**
 * Dashboard Type Definitions — DeepSynaps Protocol Studio
 * ========================================================
 * Shared types for the clinical dashboard widgets.
 */

export type ProtocolStatus = "pending_review" | "approved" | "rejected" | "draft";
export type TreatmentMode = "rTMS" | "tDCS" | "tACS" | "tRNS" | "neurofeedback" | "EEG";
export type AnalysisType = "qEEG" | "MRI" | "ERP" | "fMRI" | "PET";
export type AnalysisStatus = "completed" | "processing" | "failed" | "queued";
export type AlertSeverity = "critical" | "warning" | "info";

export interface PendingProtocol {
  id: string;
  patientInitials: string;
  condition: string;
  mode: TreatmentMode;
  submittedDate: string;
  status: ProtocolStatus;
  priority?: "normal" | "urgent";
}

export interface ActiveTreatment {
  id: string;
  patientInitials: string;
  protocolName: string;
  currentSession: number;
  totalSessions: number;
  mode: TreatmentMode;
  startDate: string;
}

export interface RecentAnalysis {
  id: string;
  type: AnalysisType;
  patientInitials: string;
  date: string;
  status: AnalysisStatus;
  summary?: string;
}

export interface AiAlert {
  id: string;
  message: string;
  severity: AlertSeverity;
  timestamp: string;
  source: string;
  dismissed?: boolean;
}

export interface QuickAction {
  id: string;
  label: string;
  icon: string;
  variant: "primary" | "secondary";
  href?: string;
  onClick?: () => void;
}

export interface DashboardData {
  pendingProtocols: PendingProtocol[];
  activeTreatments: ActiveTreatment[];
  recentAnalyses: RecentAnalysis[];
  aiAlerts: AiAlert[];
  clinicName: string;
  lastRefreshed: string;
}
