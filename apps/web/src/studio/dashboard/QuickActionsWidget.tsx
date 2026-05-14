/**
 * QuickActionsWidget — DeepSynaps Protocol Studio
 * ================================================
 * Four large action buttons in a 2x2 grid for common clinician tasks:
 * Generate Protocol, New Patient, Schedule Session, View Reports.
 */

import React from "react";

interface QuickActionsWidgetProps {
  onGenerateProtocol?: () => void;
  onNewPatient?: () => void;
  onScheduleSession?: () => void;
  onViewReports?: () => void;
  isLoading?: boolean;
}

interface ActionButton {
  id: string;
  label: string;
  variant: "primary" | "secondary";
  onClick?: () => void;
  icon: React.ReactNode;
  testId: string;
}

export const QuickActionsWidget: React.FC<QuickActionsWidgetProps> = ({
  onGenerateProtocol,
  onNewPatient,
  onScheduleSession,
  onViewReports,
  isLoading = false,
}) => {
  const actions: ActionButton[] = [
    {
      id: "generate-protocol",
      label: "Generate Protocol",
      variant: "primary",
      onClick: onGenerateProtocol,
      testId: "btn-generate-protocol",
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
        </svg>
      ),
    },
    {
      id: "new-patient",
      label: "New Patient",
      variant: "secondary",
      onClick: onNewPatient,
      testId: "btn-new-patient",
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
        </svg>
      ),
    },
    {
      id: "schedule-session",
      label: "Schedule Session",
      variant: "secondary",
      onClick: onScheduleSession,
      testId: "btn-schedule-session",
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
    },
    {
      id: "view-reports",
      label: "View Reports",
      variant: "secondary",
      onClick: onViewReports,
      testId: "btn-view-reports",
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    },
  ];

  if (isLoading) {
    return (
      <div
        className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 animate-pulse"
        data-testid="quick-actions-widget"
      >
        <div className="h-5 bg-gray-200 rounded w-1/3 mb-3" />
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 bg-gray-100 rounded" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      className="bg-white rounded-lg shadow-sm border border-gray-200 p-4"
      data-testid="quick-actions-widget"
    >
      <h3 className="text-sm font-semibold text-gray-900 mb-3">Quick Actions</h3>
      <div className="grid grid-cols-2 gap-3" data-testid="actions-grid">
        {actions.map((action) => (
          <button
            key={action.id}
            onClick={action.onClick}
            className={`flex flex-col items-center justify-center gap-2 p-4 rounded-lg border font-medium text-sm transition-all focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-500 ${
              action.variant === "primary"
                ? "bg-blue-600 text-white border-blue-600 hover:bg-blue-700 active:bg-blue-800"
                : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50 hover:border-gray-300 active:bg-gray-100"
            }`}
            data-testid={action.testId}
          >
            {action.icon}
            <span>{action.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default QuickActionsWidget;
