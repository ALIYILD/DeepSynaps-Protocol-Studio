/**
 * SafetyChecklist — DeepSynaps Protocol Studio
 * =============================================
 * Interactive safety checklist with progress tracking,
 * enable/disable logic based on required checks.
 */

import React, { useMemo } from "react";
import type { SafetyCheckItem, SafetyStatus } from "./types";

interface SafetyChecklistProps {
  checks: SafetyCheckItem[];
  onToggleCheck?: (checkId: string, status: SafetyStatus) => void;
  disabled?: boolean;
}

const statusConfig: Record<SafetyStatus, { label: string; className: string; next: SafetyStatus }> = {
  pass: { label: "Pass", className: "bg-green-100 text-green-800 border-green-300", next: "pending" },
  fail: { label: "Fail", className: "bg-red-100 text-red-800 border-red-300", next: "pending" },
  pending: { label: "Pending", className: "bg-yellow-100 text-yellow-800 border-yellow-300", next: "pass" },
  na: { label: "N/A", className: "bg-gray-100 text-gray-600 border-gray-300", next: "pass" },
};

export const SafetyChecklist: React.FC<SafetyChecklistProps> = ({
  checks,
  onToggleCheck,
  disabled = false,
}) => {
  const handleToggle = (check: SafetyCheckItem) => {
    if (disabled || !check.required) return;
    const cfg = statusConfig[check.status];
    onToggleCheck?.(check.id, cfg.next);
  };

  const progress = useMemo(() => {
    const requiredChecks = checks.filter((c) => c.required);
    if (requiredChecks.length === 0) return 100;
    const passed = requiredChecks.filter((c) => c.status === "pass" || c.status === "na").length;
    return Math.round((passed / requiredChecks.length) * 100);
  }, [checks]);

  const allRequiredPassed = useMemo(() => {
    return checks
      .filter((c) => c.required)
      .every((c) => c.status === "pass" || c.status === "na");
  }, [checks]);

  const progressColor = progress === 100 ? "bg-green-500" : progress >= 50 ? "bg-yellow-500" : "bg-red-500";

  return (
    <div
      className={`bg-white rounded-lg border border-gray-200 p-4 ${disabled ? "opacity-60" : ""}`}
      data-testid="safety-checklist"
    >
      {/* Header */}
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-sm font-semibold text-gray-900">Safety Checklist</h3>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            allRequiredPassed ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"
          }`}
          data-testid="safety-status-badge"
        >
          {progress === 100 ? "Complete" : "Incomplete"}
        </span>
      </div>

      {/* Progress bar */}
      <div className="mb-4">
        <div className="flex justify-between items-center mb-1">
          <span className="text-xs text-gray-500">Progress</span>
          <span className="text-xs font-medium text-gray-700" data-testid="safety-progress-text">
            {progress}%
          </span>
        </div>
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${progressColor}`}
            style={{ width: `${progress}%` }}
            data-testid="safety-progress-bar"
          />
        </div>
      </div>

      {/* Check items */}
      <ul className="space-y-2" data-testid="checklist-items">
        {checks.map((check) => {
          const cfg = statusConfig[check.status];
          const isCheckDisabled = disabled || !check.required;
          return (
            <li
              key={check.id}
              className={`flex items-center justify-between p-2.5 rounded-md border transition-colors ${
                isCheckDisabled ? "bg-gray-50 border-gray-100" : "border-gray-200 hover:bg-gray-50"
              }`}
              data-testid={`check-item-${check.id}`}
            >
              <div className="flex items-center gap-2 min-w-0">
                {!check.required && (
                  <span className="text-xs text-gray-400 shrink-0">(opt)</span>
                )}
                <span className="text-sm text-gray-800">{check.description}</span>
              </div>
              <button
                onClick={() => handleToggle(check)}
                disabled={isCheckDisabled}
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium border transition-colors shrink-0 ml-2 ${
                  isCheckDisabled
                    ? "opacity-50 cursor-not-allowed " + cfg.className
                    : "cursor-pointer hover:brightness-95 active:scale-95 " + cfg.className
                }`}
                data-testid={`check-status-btn-${check.id}`}
              >
                {cfg.label}
              </button>
            </li>
          );
        })}
      </ul>

      {/* Enable/enable message */}
      <div className="mt-3 text-xs text-gray-500" data-testid="safety-hint">
        {allRequiredPassed
          ? "All required checks passed. Protocol generation enabled."
          : "Complete all required safety checks to enable protocol generation."}
      </div>
    </div>
  );
};

export default SafetyChecklist;
