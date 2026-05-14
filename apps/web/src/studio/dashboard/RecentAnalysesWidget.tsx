/**
 * RecentAnalysesWidget — DeepSynaps Protocol Studio
 * ==================================================
 * Displays latest qEEG/MRI/ERP analyses with type badges,
 * patient info, status indicators, and studio navigation.
 */

import React from "react";
import type { RecentAnalysis, AnalysisType, AnalysisStatus } from "./types";

interface RecentAnalysesWidgetProps {
  analyses: RecentAnalysis[];
  onViewInStudio?: (analysisId: string) => void;
  isLoading?: boolean;
}

const typeBadgeColors: Record<AnalysisType, string> = {
  qEEG: "bg-purple-100 text-purple-800",
  MRI: "bg-blue-100 text-blue-800",
  ERP: "bg-orange-100 text-orange-800",
  fMRI: "bg-indigo-100 text-indigo-800",
  PET: "bg-pink-100 text-pink-800",
};

const statusConfig: Record<AnalysisStatus, { label: string; className: string }> = {
  completed: { label: "Completed", className: "bg-green-100 text-green-800" },
  processing: { label: "Processing", className: "bg-yellow-100 text-yellow-800" },
  failed: { label: "Failed", className: "bg-red-100 text-red-800" },
  queued: { label: "Queued", className: "bg-gray-100 text-gray-800" },
};

export const RecentAnalysesWidget: React.FC<RecentAnalysesWidgetProps> = ({
  analyses,
  onViewInStudio,
  isLoading = false,
}) => {
  if (isLoading) {
    return (
      <div
        className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 animate-pulse"
        data-testid="recent-analyses-widget"
      >
        <div className="flex justify-between items-center mb-3">
          <div className="h-5 bg-gray-200 rounded w-1/3" />
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 bg-gray-100 rounded" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      className="bg-white rounded-lg shadow-sm border border-gray-200 p-4"
      data-testid="recent-analyses-widget"
    >
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-sm font-semibold text-gray-900">Recent Analyses</h3>
      </div>

      {analyses.length === 0 ? (
        <div className="text-center py-6 text-sm text-gray-500" data-testid="empty-state">
          No recent analyses
        </div>
      ) : (
        <ul className="space-y-2" data-testid="analysis-list">
          {analyses.map((analysis) => {
            const typeColor = typeBadgeColors[analysis.type] ?? typeBadgeColors.qEEG;
            const statusCfg = statusConfig[analysis.status] ?? statusConfig.queued;
            return (
              <li
                key={analysis.id}
                className="flex items-center justify-between p-2.5 rounded-md border border-gray-100 hover:bg-gray-50 transition-colors"
                data-testid={`analysis-item-${analysis.id}`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium shrink-0 ${typeColor}`}
                    data-testid={`analysis-type-${analysis.id}`}
                  >
                    {analysis.type}
                  </span>
                  <div className="min-w-0">
                    <span className="text-sm font-medium text-gray-900 block truncate">
                      {analysis.patientInitials}
                    </span>
                    <span className="text-xs text-gray-400">{analysis.date}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-2 shrink-0">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusCfg.className}`}
                    data-testid={`analysis-status-${analysis.id}`}
                  >
                    {statusCfg.label}
                  </span>
                  {onViewInStudio && analysis.status === "completed" && (
                    <button
                      onClick={() => onViewInStudio(analysis.id)}
                      className="text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline"
                      data-testid={`view-studio-btn-${analysis.id}`}
                    >
                      View in Studio
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default RecentAnalysesWidget;
