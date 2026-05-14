import React, { useState, useMemo, useCallback } from "react";
import type { AuditEntry, AuditAction } from "./protocolTypes";

interface AuditTrailProps {
  entries: AuditEntry[];
  protocolId: string;
}

const ACTION_LABELS: Record<AuditAction, string> = {
  created: "Created",
  edited: "Edited",
  reviewed: "Reviewed",
  approved: "Approved",
  rejected: "Rejected",
  prescribed: "Prescribed",
  completed: "Completed",
};

const ACTION_COLORS: Record<AuditAction, string> = {
  created: "bg-blue-100 text-blue-700 border-blue-200",
  edited: "bg-slate-100 text-slate-700 border-slate-200",
  reviewed: "bg-purple-100 text-purple-700 border-purple-200",
  approved: "bg-emerald-100 text-emerald-700 border-emerald-200",
  rejected: "bg-red-100 text-red-700 border-red-200",
  prescribed: "bg-cyan-100 text-cyan-700 border-cyan-200",
  completed: "bg-green-100 text-green-700 border-green-200",
};

const ACTION_ICONS: Record<AuditAction, React.ReactNode> = {
  created: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  ),
  edited: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
  ),
  reviewed: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  ),
  approved: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  rejected: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  prescribed: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    </svg>
  ),
  completed: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  ),
};

/**
 * AuditTrail — Complete audit history for a protocol.
 * Shows timeline of all actions with filtering and PDF export.
 */
export const AuditTrail: React.FC<AuditTrailProps> = ({
  entries,
  protocolId,
}) => {
  const [filter, setFilter] = useState<AuditAction | "all">("all");

  const filteredEntries = useMemo(() => {
    if (filter === "all") return entries;
    return entries.filter((e) => e.action === filter);
  }, [entries, filter]);

  const handleExportPDF = useCallback(() => {
    const content = [
      `PROTOCOL AUDIT TRAIL`,
      `Protocol ID: ${protocolId}`,
      `Generated: ${new Date().toISOString()}`,
      `Total Entries: ${entries.length}`,
      ``,
      `---`,
      ``,
      ...entries.map(
        (e) =>
          `[${e.timestamp}] ${e.action.toUpperCase()} by ${e.actor} (${e.actorRole})${e.reason ? ` — Reason: ${e.reason}` : ""}`,
      ),
    ].join("\n");

    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-trail-${protocolId}-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [entries, protocolId]);

  const formatTimestamp = (ts: string): string => {
    const d = new Date(ts);
    return d.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  return (
    <div
      data-testid="audit-trail"
      className="rounded-lg border border-slate-200 bg-white shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-800">Audit Trail</h3>
          <p className="text-xs text-slate-500">
            Complete history of all actions on this protocol
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Filter */}
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as AuditAction | "all")}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
            data-testid="audit-filter"
          >
            <option value="all">All Actions</option>
            {Object.entries(ACTION_LABELS).map(([action, label]) => (
              <option key={action} value={action}>
                {label}
              </option>
            ))}
          </select>

          {/* Export */}
          <button
            onClick={handleExportPDF}
            className="inline-flex items-center gap-2 rounded-md bg-slate-700 px-3 py-1.5 text-sm font-medium text-white transition-all hover:bg-slate-800"
            data-testid="audit-export-btn"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Export
          </button>
        </div>
      </div>

      {/* Timeline */}
      <div className="max-h-96 overflow-y-auto p-4">
        {filteredEntries.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-400">
            No audit entries found for the selected filter.
          </div>
        ) : (
          <div className="relative">
            {/* Vertical connecting line */}
            <div className="absolute left-6 top-0 bottom-0 w-px bg-slate-200" />

            <div className="space-y-4">
              {filteredEntries.map((entry) => (
                <div
                  key={entry.id}
                  data-testid={`audit-entry-${entry.id}`}
                  className="relative flex gap-4"
                >
                  {/* Icon dot */}
                  <div
                    className={`relative z-10 flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full border-2 ${ACTION_COLORS[entry.action]}`}
                  >
                    {ACTION_ICONS[entry.action]}
                  </div>

                  {/* Content */}
                  <div className="flex-1 rounded-lg border border-slate-100 bg-slate-50/80 p-3">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold text-slate-500">
                        {formatTimestamp(entry.timestamp)}
                      </span>
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-bold ${ACTION_COLORS[entry.action]}`}
                      >
                        {ACTION_LABELS[entry.action]}
                      </span>
                    </div>

                    <div className="mb-1 flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-800">
                        {entry.actor}
                      </span>
                      <span className="text-xs text-slate-400">
                        ({entry.actorRole})
                      </span>
                    </div>

                    {entry.reason && (
                      <div className="mt-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5">
                        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                          Reason:
                        </span>
                        <p className="mt-0.5 text-sm text-slate-700">
                          {entry.reason}
                        </p>
                      </div>
                    )}

                    {entry.metadata && Object.keys(entry.metadata).length > 0 && (
                      <div className="mt-1.5">
                        <details className="text-xs">
                          <summary className="cursor-pointer font-medium text-slate-400 hover:text-slate-600">
                            Metadata
                          </summary>
                          <pre className="mt-1 rounded bg-slate-100 p-2 text-xs text-slate-600">
                            {JSON.stringify(entry.metadata, null, 2)}
                          </pre>
                        </details>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer summary */}
      <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-2.5">
        <span className="text-xs text-slate-500">
          Showing {filteredEntries.length} of {entries.length} entries
        </span>
        <span className="text-xs text-slate-400">
          Protocol ID: {protocolId}
        </span>
      </div>
    </div>
  );
};

export default AuditTrail;
