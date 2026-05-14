/**
 * PendingProtocolsWidget — DeepSynaps Protocol Studio
 * ====================================================
 * Displays protocols awaiting clinical review with patient info,
 * condition, treatment mode, and quick review action.
 */

import React, { useCallback, useState } from "react";
import type { PendingProtocol } from "./types";

interface PendingProtocolsWidgetProps {
  protocols: PendingProtocol[];
  onReview?: (protocolId: string) => void;
  isLoading?: boolean;
}

const statusConfig: Record<string, { label: string; className: string }> = {
  pending_review: {
    label: "Pending Review",
    className: "bg-yellow-100 text-yellow-800",
  },
  approved: {
    label: "Approved",
    className: "bg-green-100 text-green-800",
  },
  rejected: {
    label: "Rejected",
    className: "bg-red-100 text-red-800",
  },
  draft: {
    label: "Draft",
    className: "bg-gray-100 text-gray-800",
  },
};

const priorityDot = (priority?: string) =>
  priority === "urgent" ? (
    <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-red-500" data-testid="priority-urgent" />
  ) : null;

export const PendingProtocolsWidget: React.FC<PendingProtocolsWidgetProps> = ({
  protocols,
  onReview,
  isLoading = false,
}) => {
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  const handleReview = useCallback(
    (id: string) => {
      setDismissedIds((prev) => new Set(prev).add(id));
      onReview?.(id);
    },
    [onReview]
  );

  const visibleProtocols = protocols.filter((p) => !dismissedIds.has(p.id));
  const count = visibleProtocols.length;

  if (isLoading) {
    return (
      <div
        className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 animate-pulse"
        data-testid="pending-protocols-widget"
      >
        <div className="flex justify-between items-center mb-3">
          <div className="h-5 bg-gray-200 rounded w-1/3" />
          <div className="h-5 bg-gray-200 rounded-full w-8" />
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-gray-100 rounded" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      className="bg-white rounded-lg shadow-sm border border-gray-200 p-4"
      data-testid="pending-protocols-widget"
    >
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-sm font-semibold text-gray-900">Pending Protocols</h3>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            count > 0 ? "bg-yellow-100 text-yellow-800" : "bg-green-100 text-green-800"
          }`}
          data-testid="pending-count-badge"
        >
          {count}
        </span>
      </div>

      {count === 0 ? (
        <div
          className="text-center py-6 text-sm text-gray-500"
          data-testid="empty-state"
        >
          <svg
            className="mx-auto h-8 w-8 text-green-400 mb-2"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          No pending protocols — all caught up!
        </div>
      ) : (
        <ul className="space-y-2" data-testid="protocol-list">
          {visibleProtocols.map((protocol) => {
            const cfg = statusConfig[protocol.status] ?? statusConfig.draft;
            return (
              <li
                key={protocol.id}
                className="flex items-center justify-between p-2.5 rounded-md border border-gray-100 hover:bg-gray-50 transition-colors"
                data-testid={`protocol-item-${protocol.id}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center">
                    <span className="text-sm font-medium text-gray-900 truncate">
                      {protocol.patientInitials}
                    </span>
                    {priorityDot(protocol.priority)}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-gray-500 truncate">
                      {protocol.condition}
                    </span>
                    <span className="text-xs text-gray-300">|</span>
                    <span className="text-xs text-gray-500">{protocol.mode}</span>
                  </div>
                  <span className="text-xs text-gray-400 mt-0.5 block">
                    Submitted {protocol.submittedDate}
                  </span>
                </div>
                <div className="flex items-center gap-2 ml-3 shrink-0">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${cfg.className}`}
                    data-testid={`protocol-status-${protocol.id}`}
                  >
                    {cfg.label}
                  </span>
                  <button
                    onClick={() => handleReview(protocol.id)}
                    className="text-xs font-medium text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-md transition-colors"
                    data-testid={`review-btn-${protocol.id}`}
                  >
                    Review
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default PendingProtocolsWidget;
