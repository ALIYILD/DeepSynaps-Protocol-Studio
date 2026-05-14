/**
 * EvidencePanel — Searchable evidence list with filtering and pagination.
 *
 * Provides a search interface for the clinical evidence corpus with grade
 * filtering, source filtering, and paginated results. Handles loading,
 * error, and empty states gracefully. All search terms are PHI-safe.
 */

import React, { useCallback, useEffect, useState } from "react";
import EvidenceCard from "./EvidenceCard";
import type { EvidenceGradeValue } from "./EvidenceGrade";
import { searchEvidence, fetchEvidenceHealth } from "./protocolApi";
import type { EvidenceSearchResponse } from "./protocolTypes";

interface EvidencePanelProps {
  onAddToProtocol?: (evidenceId: string) => void;
  initialQuery?: string;
}

const GRADE_OPTIONS: { value: EvidenceGradeValue | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "A", label: "A" },
  { value: "B", label: "B" },
  { value: "C", label: "C" },
  { value: "D", label: "D" },
];

const SOURCE_OPTIONS = [
  { value: "", label: "All sources" },
  { value: "pubmed", label: "PubMed" },
  { value: "cochrane", label: "Cochrane" },
  { value: "clinicaltrials", label: "ClinicalTrials.gov" },
  { value: "guideline", label: "Guidelines" },
];

const PAGE_SIZE = 10;

/**
 * Skeleton loader for evidence cards during loading state.
 */
const EvidenceCardSkeleton: React.FC = () => (
  <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
    <div className="flex items-center gap-2">
      <div className="h-6 w-6 animate-pulse rounded-full bg-slate-200" />
      <div className="h-4 w-16 animate-pulse rounded bg-slate-200" />
      <div className="h-4 w-20 animate-pulse rounded bg-slate-200" />
    </div>
    <div className="mt-2 h-4 w-3/4 animate-pulse rounded bg-slate-200" />
    <div className="mt-1 h-3 w-1/2 animate-pulse rounded bg-slate-200" />
    <div className="mt-3 flex justify-end gap-2 border-t border-slate-100 pt-3">
      <div className="h-7 w-20 animate-pulse rounded bg-slate-200" />
    </div>
  </div>
);

/**
 * Evidence panel with search, filter, and paginated results.
 */
const EvidencePanel: React.FC<EvidencePanelProps> = ({
  onAddToProtocol,
  initialQuery = "",
}) => {
  const [query, setQuery] = useState(initialQuery);
  const [gradeFilter, setGradeFilter] = useState<EvidenceGradeValue | "all">("all");
  const [sourceFilter, setSourceFilter] = useState("");
  const [results, setResults] = useState<EvidenceSearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [health, setHealth] = useState<{ status: string } | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);

  /** Fetch evidence health on mount. */
  useEffect(() => {
    let cancelled = false;
    fetchEvidenceHealth()
      .then((h) => {
        if (!cancelled) setHealth(h);
      })
      .catch(() => {
        if (!cancelled) setHealth({ status: "unavailable" });
      })
      .finally(() => {
        if (!cancelled) setHealthLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Execute search with current filters. */
  const executeSearch = useCallback(
    async (searchQuery: string, newOffset = 0) => {
      if (!searchQuery.trim()) {
        setResults(null);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const res = await searchEvidence(searchQuery, {
          grade: gradeFilter === "all" ? undefined : gradeFilter,
          source: sourceFilter || undefined,
          limit: PAGE_SIZE,
          offset: newOffset,
        });
        setResults(res);
        setOffset(newOffset);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to search evidence. Please try again."
        );
        setResults(null);
      } finally {
        setLoading(false);
      }
    },
    [gradeFilter, sourceFilter]
  );

  const handleSearch = useCallback(() => {
    executeSearch(query, 0);
  }, [executeSearch, query]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") handleSearch();
    },
    [handleSearch]
  );

  const handleNextPage = useCallback(() => {
    if (results && results.total > offset + PAGE_SIZE) {
      executeSearch(query, offset + PAGE_SIZE);
    }
  }, [executeSearch, offset, query, results]);

  const handlePrevPage = useCallback(() => {
    if (offset > 0) {
      executeSearch(query, Math.max(0, offset - PAGE_SIZE));
    }
  }, [executeSearch, offset, query]);

  const totalPages = results ? Math.ceil(results.total / PAGE_SIZE) : 0;
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  return (
    <div data-testid="protocol-evidence-search-panel" className="flex h-full flex-col gap-4">
      {/* Evidence health status */}
      <div
        data-testid="protocol-evidence-health"
        className={`rounded-md border px-3 py-2 text-xs font-medium ${
          healthLoading
            ? "border-slate-200 bg-slate-50 text-slate-500"
            : health?.status === "healthy"
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : health?.status === "degraded"
            ? "border-amber-200 bg-amber-50 text-amber-700"
            : "border-rose-200 bg-rose-50 text-rose-700"
        }`}
        role="status"
        aria-live="polite"
      >
        {healthLoading
          ? "Checking evidence sources…"
          : health?.status === "healthy"
          ? "Evidence sources are available and up to date."
          : health?.status === "degraded"
          ? "Some evidence sources are unavailable. Results may be limited."
          : "Evidence search is currently unavailable. Please try again later."}
      </div>

      {/* Search controls */}
      <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        {/* Search input */}
        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search evidence by keyword, condition, or intervention…"
            className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            data-testid="evidence-search-input"
            aria-label="Search evidence"
          />
          <button
            onClick={handleSearch}
            disabled={loading || !query.trim()}
            className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-1 disabled:cursor-not-allowed disabled:bg-slate-300"
            data-testid="evidence-search-button"
            type="button"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <svg
                  className="h-4 w-4 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                Searching…
              </span>
            ) : (
              "Search"
            )}
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Grade filter */}
          <div className="flex items-center gap-1">
            <span className="text-xs font-medium text-slate-500">Grade:</span>
            <div className="flex gap-1">
              {GRADE_OPTIONS.map((g) => (
                <button
                  key={g.value}
                  onClick={() => setGradeFilter(g.value)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-1 ${
                    gradeFilter === g.value
                      ? "bg-slate-800 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                  data-testid={`evidence-filter-grade-${g.value}`}
                  type="button"
                  aria-pressed={gradeFilter === g.value}
                >
                  {g.label}
                </button>
              ))}
            </div>
          </div>

          {/* Source filter */}
          <div className="flex items-center gap-1">
            <span className="text-xs font-medium text-slate-500">Source:</span>
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-600 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              data-testid="evidence-filter-source"
              aria-label="Filter by source"
            >
              {SOURCE_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div
          className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-center"
          role="alert"
        >
          <p className="text-sm text-rose-700">{error}</p>
          <button
            onClick={() => executeSearch(query, 0)}
            className="mt-2 rounded-md bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-1"
            data-testid="evidence-search-retry"
            type="button"
          >
            Retry
          </button>
        </div>
      )}

      {/* Results list */}
      <div data-testid="protocol-results-list" className="flex-1 space-y-3 overflow-auto">
        {loading && !results ? (
          /* Loading skeleton */
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <EvidenceCardSkeleton key={i} />
            ))}
          </div>
        ) : !results ? (
          /* Empty state — no search yet */
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 py-12 text-center">
            <svg
              className="h-12 w-12 text-slate-300"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <p className="mt-3 text-sm font-medium text-slate-600">
              Search for evidence to see results
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Enter keywords related to a condition, intervention, or outcome.
            </p>
          </div>
        ) : results.results.length === 0 ? (
          /* Empty state — no results */
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 py-12 text-center">
            <svg
              className="h-12 w-12 text-slate-300"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p className="mt-3 text-sm font-medium text-slate-600">
              No evidence found
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Try adjusting your search terms or filters.
            </p>
          </div>
        ) : (
          /* Results */
          <>
            <p className="text-xs text-slate-500">
              {results.total} result{results.total !== 1 ? "s" : ""} for &ldquo;
              {results.query}&rdquo;
            </p>
            <div className="space-y-3">
              {results.results.map((r) => (
                <EvidenceCard
                  key={r.id}
                  id={r.id}
                  title={r.title}
                  authors={r.authors}
                  year={r.year}
                  grade={r.grade}
                  source={r.source}
                  abstract={r.abstract}
                  url={r.url}
                  onAddToProtocol={onAddToProtocol}
                />
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-slate-200 pt-3">
                <button
                  onClick={handlePrevPage}
                  disabled={offset === 0}
                  className="rounded-md bg-white px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-300 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
                  data-testid="evidence-page-prev"
                  type="button"
                >
                  Previous
                </button>
                <span
                  className="text-xs text-slate-500"
                  data-testid="evidence-page-info"
                >
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  onClick={handleNextPage}
                  disabled={offset + PAGE_SIZE >= results.total}
                  className="rounded-md bg-white px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-300 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
                  data-testid="evidence-page-next"
                  type="button"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default EvidencePanel;
