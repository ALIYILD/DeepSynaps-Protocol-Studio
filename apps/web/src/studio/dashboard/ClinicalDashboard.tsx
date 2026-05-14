/**
 * ClinicalDashboard — DeepSynaps Protocol Studio
 * ================================================
 * Main dashboard page clinicians see on login. Provides an overview of
 * pending protocols, active treatments, recent analyses, AI alerts, and
 * quick actions. Responsive 2-column grid layout (1-column on mobile).
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { PendingProtocolsWidget } from "./PendingProtocolsWidget";
import { ActiveTreatmentsWidget } from "./ActiveTreatmentsWidget";
import { RecentAnalysesWidget } from "./RecentAnalysesWidget";
import { AiAlertsWidget } from "./AiAlertsWidget";
import { QuickActionsWidget } from "./QuickActionsWidget";
import type {
  PendingProtocol,
  ActiveTreatment,
  RecentAnalysis,
  AiAlert,
} from "./types";

export interface ClinicalDashboardProps {
  clinicName?: string;
  pendingProtocols?: PendingProtocol[];
  activeTreatments?: ActiveTreatment[];
  recentAnalyses?: RecentAnalysis[];
  aiAlerts?: AiAlert[];
  onRefresh?: () => Promise<void> | void;
  onReviewProtocol?: (protocolId: string) => void;
  onViewAllTreatments?: () => void;
  onViewInStudio?: (analysisId: string) => void;
  onDismissAlert?: (alertId: string) => void;
  onViewAllAlerts?: () => void;
  onGenerateProtocol?: () => void;
  onNewPatient?: () => void;
  onScheduleSession?: () => void;
  onViewReports?: () => void;
  isLoading?: boolean;
}

const useCurrentDateTime = () => {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);
  return now;
};

export const ClinicalDashboard: React.FC<ClinicalDashboardProps> = ({
  clinicName = "DeepSynaps Clinic",
  pendingProtocols: initialPending,
  activeTreatments: initialTreatments,
  recentAnalyses: initialAnalyses,
  aiAlerts: initialAlerts,
  onRefresh,
  onReviewProtocol,
  onViewAllTreatments,
  onViewInStudio,
  onDismissAlert,
  onViewAllAlerts,
  onGenerateProtocol,
  onNewPatient,
  onScheduleSession,
  onViewReports,
  isLoading: externalLoading = false,
}) => {
  const now = useCurrentDateTime();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await onRefresh?.();
    } finally {
      setIsRefreshing(false);
    }
  }, [onRefresh]);

  const dateStr = useMemo(
    () =>
      now.toLocaleDateString("en-US", {
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric",
      }),
    [now]
  );

  const timeStr = useMemo(
    () =>
      now.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      }),
    [now]
  );

  const isLoading = externalLoading || isRefreshing;

  // Default demo data when no props provided
  const defaultPending: PendingProtocol[] = [
    {
      id: "pp-001",
      patientInitials: "J.D.",
      condition: "Major Depressive Disorder",
      mode: "rTMS",
      submittedDate: "2024-12-18",
      status: "pending_review",
      priority: "urgent",
    },
    {
      id: "pp-002",
      patientInitials: "A.S.",
      condition: "Generalized Anxiety",
      mode: "tDCS",
      submittedDate: "2024-12-17",
      status: "pending_review",
    },
    {
      id: "pp-003",
      patientInitials: "M.K.",
      condition: "ADHD",
      mode: "neurofeedback",
      submittedDate: "2024-12-16",
      status: "pending_review",
    },
  ];

  const defaultTreatments: ActiveTreatment[] = [
    {
      id: "tx-001",
      patientInitials: "R.L.",
      protocolName: "DLPFC rTMS Depression",
      currentSession: 18,
      totalSessions: 20,
      mode: "rTMS",
      startDate: "2024-11-01",
    },
    {
      id: "tx-002",
      patientInitials: "S.M.",
      protocolName: "F3/F4 tDCS Anxiety",
      currentSession: 6,
      totalSessions: 15,
      mode: "tDCS",
      startDate: "2024-12-01",
    },
    {
      id: "tx-003",
      patientInitials: "T.B.",
      protocolName: "SMR Neurofeedback ADHD",
      currentSession: 3,
      totalSessions: 30,
      mode: "neurofeedback",
      startDate: "2024-12-10",
    },
  ];

  const defaultAnalyses: RecentAnalysis[] = [
    {
      id: "an-001",
      type: "qEEG",
      patientInitials: "J.D.",
      date: "2024-12-18 09:30",
      status: "completed",
      summary: "Elevated frontal theta, reduced posterior alpha",
    },
    {
      id: "an-002",
      type: "MRI",
      patientInitials: "A.S.",
      date: "2024-12-17 14:15",
      status: "processing",
    },
    {
      id: "an-003",
      type: "ERP",
      patientInitials: "M.K.",
      date: "2024-12-16 11:00",
      status: "completed",
    },
    {
      id: "an-004",
      type: "qEEG",
      patientInitials: "R.L.",
      date: "2024-12-15 16:45",
      status: "failed",
    },
  ];

  const defaultAlerts: AiAlert[] = [
    {
      id: "al-001",
      message: "Elevated seizure risk detected in patient R.L. — review stimulation parameters",
      severity: "critical",
      timestamp: "2 min ago",
      source: "SafetyMonitor",
    },
    {
      id: "al-002",
      message: "Protocol pp-001 evidence grade is C — consider additional validation",
      severity: "warning",
      timestamp: "15 min ago",
      source: "EvidenceChecker",
    },
    {
      id: "al-003",
      message: "Patient T.B. session adherence below 70%",
      severity: "info",
      timestamp: "1 hr ago",
      source: "AdherenceTracker",
    },
  ];

  const pending = initialPending ?? defaultPending;
  const treatments = initialTreatments ?? defaultTreatments;
  const analyses = initialAnalyses ?? defaultAnalyses;
  const alerts = initialAlerts ?? defaultAlerts;

  return (
    <div
      className="min-h-screen bg-gray-50 p-4 md:p-6"
      data-testid="clinical-dashboard"
    >
      {/* Header */}
      <header className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clinical Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5" data-testid="clinic-info">
            {clinicName} · {dateStr} · {timeStr}
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isLoading}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          data-testid="refresh-btn"
        >
          <svg
            className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          {isRefreshing ? "Refreshing..." : "Refresh"}
        </button>
      </header>

      {/* Dashboard Grid — 2 columns on tablet+, 1 on mobile */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        {/* Left column */}
        <div className="space-y-4 md:space-y-6">
          <QuickActionsWidget
            onGenerateProtocol={onGenerateProtocol}
            onNewPatient={onNewPatient}
            onScheduleSession={onScheduleSession}
            onViewReports={onViewReports}
            isLoading={isLoading}
          />
          <PendingProtocolsWidget
            protocols={pending}
            onReview={onReviewProtocol}
            isLoading={isLoading}
          />
          <AiAlertsWidget
            alerts={alerts}
            onDismiss={onDismissAlert}
            onViewAll={onViewAllAlerts}
            isLoading={isLoading}
          />
        </div>

        {/* Right column */}
        <div className="space-y-4 md:space-y-6">
          <ActiveTreatmentsWidget
            treatments={treatments}
            onViewAll={onViewAllTreatments}
            isLoading={isLoading}
          />
          <RecentAnalysesWidget
            analyses={analyses}
            onViewInStudio={onViewInStudio}
            isLoading={isLoading}
          />
        </div>
      </div>
    </div>
  );
};

export default ClinicalDashboard;
