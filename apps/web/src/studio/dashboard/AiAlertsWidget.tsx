/**
 * AiAlertsWidget — DeepSynaps Protocol Studio
 * =============================================
 * Displays AI-detected anomaly alerts with severity indicators,
 * dismiss functionality, and alert count badge.
 */

import React, { useCallback, useState } from "react";
import type { AiAlert, AlertSeverity } from "./types";

interface AiAlertsWidgetProps {
  alerts: AiAlert[];
  onDismiss?: (alertId: string) => void;
  onViewAll?: () => void;
  isLoading?: boolean;
}

const severityConfig: Record<AlertSeverity, { icon: string; className: string; iconColor: string }> = {
  critical: {
    icon: "M12 9v2m0 4h.01M12 3a9 9 0 110 18 9 9 0 010-18z",
    className: "bg-red-50 border-red-200",
    iconColor: "text-red-500",
  },
  warning: {
    icon: "M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z",
    className: "bg-yellow-50 border-yellow-200",
    iconColor: "text-yellow-500",
  },
  info: {
    icon: "M13 16h-1v-4h-1m1-4h.01M12 3a9 9 0 110 18 9 9 0 010-18z",
    className: "bg-blue-50 border-blue-200",
    iconColor: "text-blue-500",
  },
};

export const AiAlertsWidget: React.FC<AiAlertsWidgetProps> = ({
  alerts,
  onDismiss,
  onViewAll,
  isLoading = false,
}) => {
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  const handleDismiss = useCallback(
    (alertId: string) => {
      setDismissedIds((prev) => new Set(prev).add(alertId));
      onDismiss?.(alertId);
    },
    [onDismiss]
  );

  const visibleAlerts = alerts.filter((a) => !dismissedIds.has(a.id) && !a.dismissed);
  const count = visibleAlerts.length;

  if (isLoading) {
    return (
      <div
        className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 animate-pulse"
        data-testid="ai-alerts-widget"
      >
        <div className="flex justify-between items-center mb-3">
          <div className="h-5 bg-gray-200 rounded w-1/3" />
          <div className="h-5 bg-gray-200 rounded-full w-8" />
        </div>
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-14 bg-gray-100 rounded" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      className="bg-white rounded-lg shadow-sm border border-gray-200 p-4"
      data-testid="ai-alerts-widget"
    >
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-sm font-semibold text-gray-900">AI Alerts</h3>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            count > 0 ? "bg-red-100 text-red-800" : "bg-green-100 text-green-800"
          }`}
          data-testid="alerts-count-badge"
        >
          {count}
        </span>
      </div>

      {count === 0 ? (
        <div className="text-center py-6 text-sm text-gray-500" data-testid="empty-state">
          <svg
            className="mx-auto h-8 w-8 text-green-400 mb-2"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          All clear — no active alerts
        </div>
      ) : (
        <>
          <ul className="space-y-2" data-testid="alert-list">
            {visibleAlerts.map((alert) => {
              const cfg = severityConfig[alert.severity] ?? severityConfig.info;
              return (
                <li
                  key={alert.id}
                  className={`flex items-start gap-2.5 p-2.5 rounded-md border transition-colors ${cfg.className}`}
                  data-testid={`alert-item-${alert.id}`}
                >
                  <svg
                    className={`shrink-0 h-4 w-4 mt-0.5 ${cfg.iconColor}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d={cfg.icon} />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800">{alert.message}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span
                        className={`text-xs font-medium ${cfg.iconColor}`}
                        data-testid={`alert-severity-${alert.id}`}
                      >
                        {alert.severity}
                      </span>
                      <span className="text-xs text-gray-400">{alert.timestamp}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDismiss(alert.id)}
                    className="shrink-0 text-xs text-gray-400 hover:text-gray-600 ml-1"
                    data-testid={`dismiss-btn-${alert.id}`}
                    title="Dismiss alert"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
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

export default AiAlertsWidget;
