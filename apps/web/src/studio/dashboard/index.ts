/**
 * Dashboard Module Barrel Exports — DeepSynaps Protocol Studio
 * =============================================================
 */

export { ClinicalDashboard } from "./ClinicalDashboard";
export { PendingProtocolsWidget } from "./PendingProtocolsWidget";
export { ActiveTreatmentsWidget } from "./ActiveTreatmentsWidget";
export { RecentAnalysesWidget } from "./RecentAnalysesWidget";
export { AiAlertsWidget } from "./AiAlertsWidget";
export { QuickActionsWidget } from "./QuickActionsWidget";

export type {
  PendingProtocol,
  ActiveTreatment,
  RecentAnalysis,
  AiAlert,
  QuickAction,
  DashboardData,
  ProtocolStatus,
  TreatmentMode,
  AnalysisType,
  AnalysisStatus,
  AlertSeverity,
} from "./types";
