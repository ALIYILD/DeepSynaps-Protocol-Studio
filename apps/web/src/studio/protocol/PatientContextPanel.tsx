/**
 * PatientContextPanel — PHI-minimized patient context sidebar.
 *
 * Shows patient initials (never full name), age range, diagnosis, and
 * available data sources. Designed to give clinicians enough context
 * for informed protocol decisions without exposing identifiable information.
 */

import React from "react";
import type { PatientContext } from "./protocolTypes";

interface PatientContextPanelProps {
  context: PatientContext | null;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

/**
 * Compute patient initials from a full name, returning up to 2 characters.
 * Falls back to "?" if no name is available. Never returns full name.
 */
function getInitials(fullName?: string): string {
  if (!fullName) return "?";
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

/**
 * Derive a consistent avatar background color from patient ID.
 * Uses a simple hash so the same patient always gets the same color.
 */
function avatarColor(patientId: string): string {
  const colors = [
    "bg-slate-500",
    "bg-zinc-500",
    "bg-stone-500",
    "bg-neutral-500",
    "bg-gray-600",
    "bg-slate-600",
  ];
  let hash = 0;
  for (let i = 0; i < patientId.length; i++) {
    hash = patientId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

/**
 * Map age to a broad age-range bucket to avoid precise identification.
 */
function ageRange(age?: number): string {
  if (age == null) return "—";
  if (age < 18) return "< 18";
  if (age < 30) return "18-29";
  if (age < 45) return "30-44";
  if (age < 60) return "45-59";
  if (age < 75) return "60-74";
  return "75+";
}

/**
 * Data source availability badge.
 */
const DataSourceBadge: React.FC<{ label: string; available: boolean }> = ({
  label,
  available,
}) => (
  <span
    className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${
      available
        ? "bg-emerald-50 text-emerald-700"
        : "bg-slate-100 text-slate-500"
    }`}
    data-testid={`patient-datasource-${label.toLowerCase()}`}
    aria-label={`${label} ${available ? "available" : "unavailable"}`}
  >
    {available ? (
      <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
        <path
          fillRule="evenodd"
          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
          clipRule="evenodd"
        />
      </svg>
    ) : (
      <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
        <path
          fillRule="evenodd"
          d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
          clipRule="evenodd"
        />
      </svg>
    )}
    {label}
  </span>
);

/**
 * Patient context panel component.
 * Displays PHI-minimized patient info with data-source badges.
 */
const PatientContextPanel: React.FC<PatientContextPanelProps> = ({
  context,
  loading = false,
  error = null,
  onRetry,
}) => {
  if (loading) {
    return (
      <div
        data-testid="protocol-patient-context-panel"
        className="w-64 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
        aria-label="Loading patient context"
      >
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 animate-pulse rounded-full bg-slate-200" />
          <div className="space-y-2">
            <div className="h-4 w-24 animate-pulse rounded bg-slate-200" />
            <div className="h-3 w-16 animate-pulse rounded bg-slate-200" />
          </div>
        </div>
        <div className="mt-4 space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-5 w-full animate-pulse rounded bg-slate-200"
            />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        data-testid="protocol-patient-context-panel"
        className="w-64 rounded-lg border border-rose-200 bg-rose-50 p-4 shadow-sm"
        role="alert"
        aria-label="Patient context error"
      >
        <p className="text-sm text-rose-700">{error}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="mt-2 rounded-md bg-rose-600 px-3 py-1 text-xs font-medium text-white hover:bg-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-1"
            data-testid="patient-context-retry"
            type="button"
          >
            Retry
          </button>
        )}
      </div>
    );
  }

  if (!context) {
    return (
      <div
        data-testid="protocol-patient-context-panel"
        className="w-64 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
        aria-label="No patient selected"
      >
        <p className="text-sm text-slate-500">
          No patient context loaded. Select a patient to see available data
          sources.
        </p>
      </div>
    );
  }

  const initials = getInitials(context.fullName);
  const bgClass = avatarColor(context.patientId);

  return (
    <div
      data-testid="protocol-patient-context-panel"
      className="w-64 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
      aria-label="Patient context panel"
    >
      {/* Patient header with initials avatar */}
      <div className="flex items-center gap-3">
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white ${bgClass}`}
          aria-label="Patient initials"
          data-testid="patient-initials-avatar"
        >
          {initials}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-800">
            Patient {context.patientId.slice(0, 8).toUpperCase()}
          </p>
          <p className="text-xs text-slate-500">ID: ···{context.patientId.slice(-6)}</p>
        </div>
      </div>

      {/* Clinical summary */}
      <div className="mt-3 space-y-1 border-t border-slate-100 pt-3">
        {context.diagnosis && (
          <p className="text-xs text-slate-600" data-testid="patient-diagnosis">
            <span className="font-medium text-slate-500">Diagnosis:</span>{" "}
            {context.diagnosis}
          </p>
        )}
        <p className="text-xs text-slate-600" data-testid="patient-age-range">
          <span className="font-medium text-slate-500">Age range:</span>{" "}
          {ageRange(context.age)}
        </p>
      </div>

      {/* Data source badges */}
      <div className="mt-3 border-t border-slate-100 pt-3">
        <p className="mb-2 text-xs font-medium text-slate-500">
          Data Sources
        </p>
        <div className="flex flex-wrap gap-2">
          <DataSourceBadge label="qEEG" available={context.dataSources.qeeg} />
          <DataSourceBadge label="MRI" available={context.dataSources.mri} />
          <DataSourceBadge
            label="DeepTwin"
            available={context.dataSources.deeptwin}
          />
          <DataSourceBadge
            label="Evidence"
            available={context.dataSources.evidence}
          />
        </div>
      </div>

      {/* Privacy notice */}
      <p className="mt-3 text-xs text-slate-400" data-testid="patient-privacy-notice">
        PHI minimized per clinic policy. Full record available in patient chart.
      </p>
    </div>
  );
};

export default PatientContextPanel;
