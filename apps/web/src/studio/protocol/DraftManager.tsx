/**
 * DraftManager — Protocol draft management interface.
 *
 * Displays saved protocol drafts with status badges, sorting, filtering,
 * edit capability (opens generation wizard), and delete with confirmation.
 * Handles loading, error, and empty states.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import EvidenceGrade from "./EvidenceGrade";
import type { EvidenceGradeValue } from "./EvidenceGrade";
import { fetchDrafts, deleteDraft } from "./protocolApi";
import type { DraftStatus, ProtocolDraft } from "./protocolTypes";

interface DraftManagerProps {
  onEditDraft?: (draft: ProtocolDraft) => void;
  onRefresh?: () => void;
}

const STATUS_COLORS: Record<DraftStatus, string> = {
  draft_requires_review: "bg-amber-50 text-amber-700 border-amber-300",
  insufficient_evidence: "bg-rose-50 text-rose-700 border-rose-300",
  needs_more_data: "bg-sky-50 text-sky-700 border-sky-300",
  blocked_requires_review: "bg-orange-50 text-orange-700 border-orange-300",
  research_only_not_prescribable: "bg-purple-50 text-purple-700 border-purple-300",
};

const STATUS_LABELS: Record<DraftStatus, string> = {
  draft_requires_review: "Requires Review",
  insufficient_evidence: "Insufficient Evidence",
  needs_more_data: "Needs More Data",
  blocked_requires_review: "Blocked — Review",
  research_only_not_prescribable: "Research Only",
};

const MODE_LABELS: Record<string, string> = {
  evidence_search: "Evidence Search",
  qeeg_guided: "qEEG Guided",
  mri_guided: "MRI Guided",
  deeptwin_personalized: "DeepTwin",
  multimodal: "Multimodal",
};

type SortField = "date" | "status" | "mode";
type SortDir = "asc" | "desc";

/**
 * Draft manager component with list, sort, filter, edit, and delete.
 */
const DraftManager: React.FC<DraftManagerProps> = ({ onEditDraft, onRefresh }) => {
  const [drafts, setDrafts] = useState<ProtocolDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [statusFilter, setStatusFilter] = useState<DraftStatus | "all">("all");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  /** Load drafts from API. */
  const loadDrafts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchDrafts();
      setDrafts(res.drafts);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load drafts. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDrafts();
  }, [loadDrafts]);

  /** Sort and filter drafts. */
  const sortedDrafts = useMemo(() => {
    let filtered =
      statusFilter === "all"
        ? [...drafts]
        : drafts.filter((d) => d.status === statusFilter);

    filtered.sort((a, b) => {
      let cmp = 0;
      if (sortField === "date") {
        cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      } else if (sortField === "status") {
        cmp = a.status.localeCompare(b.status);
      } else if (sortField === "mode") {
        cmp = a.mode.localeCompare(b.mode);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return filtered;
  }, [drafts, sortField, sortDir, statusFilter]);

  const handleDelete = useCallback(
    async (id: string) => {
      setDeleting(true);
      try {
        await deleteDraft(id);
        setDeleteConfirmId(null);
        await loadDrafts();
        if (onRefresh) onRefresh();
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to delete draft. Please try again."
        );
      } finally {
        setDeleting(false);
      }
    },
    [loadDrafts, onRefresh]
  );

  const toggleSort = useCallback(
    (field: SortField) => {
      if (sortField === field) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortField(field);
        setSortDir("desc");
      }
    },
    [sortField]
  );

  if (loading) {
    return (
      <div data-testid="protocol-draft-manager" className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="h-6 w-32 animate-pulse rounded bg-slate-200" />
          <div className="h-8 w-24 animate-pulse rounded bg-slate-200" />
        </div>
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-lg border border-slate-200 bg-slate-100"
          />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div data-testid="protocol-draft-manager">
        <div
          className="rounded-lg border border-rose-200 bg-rose-50 p-6 text-center"
          role="alert"
        >
          <p className="text-sm text-rose-700">{error}</p>
          <div className="mt-3 flex justify-center gap-2">
            <button
              onClick={loadDrafts}
              className="rounded-md bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-1"
              data-testid="drafts-retry"
              type="button"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="protocol-draft-manager" className="flex h-full flex-col gap-4">
      {/* Header + controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-slate-800">
          Protocol Drafts
          <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-sm font-normal text-slate-500">
            {drafts.length}
          </span>
        </h3>
        <div className="flex items-center gap-2">
          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as DraftStatus | "all")}
            className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-600 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            data-testid="drafts-filter-status"
            aria-label="Filter by status"
          >
            <option value="all">All statuses</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>

          {/* Sort controls */}
          <div className="flex rounded-md border border-slate-300 overflow-hidden">
            {(["date", "status", "mode"] as SortField[]).map((field) => (
              <button
                key={field}
                onClick={() => toggleSort(field)}
                className={`px-2.5 py-1.5 text-xs font-medium capitalize focus:outline-none ${
                  sortField === field
                    ? "bg-slate-800 text-white"
                    : "bg-white text-slate-600 hover:bg-slate-50"
                }`}
                data-testid={`drafts-sort-${field}`}
                type="button"
                aria-label={`Sort by ${field} ${sortField === field ? sortDir : ""}`}
              >
                {field}
                {sortField === field && (
                  <span className="ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Empty state */}
      {sortedDrafts.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 py-16 text-center">
          <svg
            className="h-16 w-16 text-slate-300"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <p className="mt-4 text-sm font-medium text-slate-600">
            {statusFilter !== "all"
              ? "No drafts match the selected filter."
              : "No protocol drafts yet"}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {statusFilter !== "all"
              ? "Try a different status filter."
              : "Generate a protocol to create your first draft."}
          </p>
        </div>
      ) : (
        /* Draft list */
        <div className="space-y-3 overflow-auto">
          {sortedDrafts.map((draft) => (
            <div
              key={draft.draftId}
              className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
              data-testid={`draft-card-${draft.draftId}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  {/* Status + date row */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-md border px-2 py-0.5 text-xs font-medium ${
                        STATUS_COLORS[draft.status]
                      }`}
                    >
                      {STATUS_LABELS[draft.status]}
                    </span>
                    <span className="text-xs text-slate-400">
                      {MODE_LABELS[draft.mode] || draft.mode}
                    </span>
                    <span className="text-xs text-slate-400">
                      {new Date(draft.createdAt).toLocaleDateString()}
                    </span>
                    {draft.offLabel && (
                      <span className="rounded-md border border-amber-300 bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                        Off-label
                      </span>
                    )}
                  </div>

                  {/* Summary */}
                  <p className="mt-2 text-sm font-medium text-slate-800 truncate">
                    {draft.protocolSummary}
                  </p>

                  {/* Evidence grade */}
                  <div className="mt-2 flex items-center gap-2">
                    {draft.evidenceGrade && (
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-slate-400">
                          Evidence:
                        </span>
                        <EvidenceGrade
                          grade={(draft.evidenceGrade.charAt(0) as EvidenceGradeValue) || "D"}
                        />
                      </div>
                    )}
                    <span className="text-xs text-slate-400">
                      {draft.parameters.length} param
                      {draft.parameters.length !== 1 ? "s" : ""}
                    </span>
                    {draft.contraindications.length > 0 && (
                      <span className="text-xs text-rose-500">
                        {draft.contraindications.length} contraindication
                        {draft.contraindications.length !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1">
                  {onEditDraft && (
                    <button
                      onClick={() => onEditDraft(draft)}
                      className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-500"
                      aria-label={`Edit draft ${draft.draftId}`}
                      data-testid={`draft-edit-${draft.draftId}`}
                      type="button"
                    >
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                        />
                      </svg>
                    </button>
                  )}

                  {/* Delete with confirmation */}
                  {deleteConfirmId === draft.draftId ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleDelete(draft.draftId)}
                        disabled={deleting}
                        className="rounded-md bg-rose-600 px-2 py-1 text-xs font-medium text-white hover:bg-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-500 disabled:opacity-50"
                        data-testid={`draft-confirm-delete-${draft.draftId}`}
                        type="button"
                      >
                        {deleting ? "…" : "Confirm"}
                      </button>
                      <button
                        onClick={() => setDeleteConfirmId(null)}
                        className="rounded-md bg-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-300 focus:outline-none"
                        type="button"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeleteConfirmId(draft.draftId)}
                      className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 focus:outline-none focus:ring-2 focus:ring-rose-500"
                      aria-label={`Delete draft ${draft.draftId}`}
                      data-testid={`draft-delete-${draft.draftId}`}
                      type="button"
                    >
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default DraftManager;
