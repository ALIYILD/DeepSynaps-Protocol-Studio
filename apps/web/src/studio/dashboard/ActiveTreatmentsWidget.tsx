/**
 * ActiveTreatmentsWidget — DeepSynaps Protocol Studio
 * ====================================================
 * Shows active treatment sessions with progress bars,
 * color-coded by completion percentage.
 */

import React from "react";
import type { ActiveTreatment } from "./types";

interface ActiveTreatmentsWidgetProps {
  treatments: ActiveTreatment[];
  onViewAll?: () => void;
  isLoading?: boolean;
}

const progressColor = (pct: number): string => {
  if (pct >= 75) return "bg-green-500";
  if (pct >= 50) return "bg-yellow-500";
  return "bg-red-500";
};

const progressLabelColor = (pct: number): string => {
  if (pct >= 75) return "text-green-700";
  if (pct >= 50) return "text-yellow-700";
  return "text-red-700";
};

export const ActiveTreatmentsWidget: React.FC<ActiveTreatmentsWidgetProps> = ({
  treatments,
  onViewAll,
  isLoading = false,
}) => {
  const count = treatments.length;

  if (isLoading) {
    return (
      <div
        className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 animate-pulse"
        data-testid="active-treatments-widget"
      >
        <div className="flex justify-between items-center mb-3">
          <div className="h-5 bg-gray-200 rounded w-1/3" />
          <div className="h-5 bg-gray-200 rounded-full w-8" />
        </div>
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-16 bg-gray-100 rounded" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      className="bg-white rounded-lg shadow-sm border border-gray-200 p-4"
      data-testid="active-treatments-widget"
    >
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-sm font-semibold text-gray-900">Active Treatments</h3>
        <span
          className="rounded-full px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-800"
          data-testid="active-count-badge"
        >
          {count}
        </span>
      </div>

      {count === 0 ? (
        <div className="text-center py-6 text-sm text-gray-500" data-testid="empty-state">
          No active treatments
        </div>
      ) : (
        <>
          <ul className="space-y-3" data-testid="treatment-list">
            {treatments.map((tx) => {
              const pct = Math.round((tx.currentSession / tx.totalSessions) * 100);
              return (
                <li
                  key={tx.id}
                  className="p-2.5 rounded-md border border-gray-100 hover:bg-gray-50 transition-colors"
                  data-testid={`treatment-item-${tx.id}`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-medium text-gray-900 truncate">
                        {tx.patientInitials}
                      </span>
                      <span className="text-xs text-gray-400 truncate max-w-[120px]">
                        {tx.protocolName}
                      </span>
                    </div>
                    <span
                      className={`text-xs font-semibold ${progressLabelColor(pct)} shrink-0 ml-2`}
                      data-testid={`progress-label-${tx.id}`}
                    >
                      Session {tx.currentSession}/{tx.totalSessions}
                    </span>
                  </div>
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${progressColor(pct)}`}
                      style={{ width: `${pct}%` }}
                      data-testid={`progress-bar-${tx.id}`}
                    />
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs text-gray-400">{tx.mode}</span>
                    <span className="text-xs text-gray-400">{pct}%</span>
                  </div>
                </li>
              );
            })}
          </ul>
          {onViewAll && (
            <button
              onClick={onViewAll}
              className="mt-3 text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline w-full text-center"
              data-testid="view-all-link"
            >
              View all
            </button>
          )}
        </>
      )}
    </div>
  );
};

export default ActiveTreatmentsWidget;
