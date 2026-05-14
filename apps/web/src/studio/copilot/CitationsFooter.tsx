import { useState } from "react";

import type { AiCitation } from "../stores/ai";

interface CitationsFooterProps {
  citations: AiCitation[];
}

export function CitationsFooter({ citations }: CitationsFooterProps) {
  const [expanded, setExpanded] = useState(false);

  if (citations.length === 0) return null;

  return (
    <div
      data-testid="copilot-citations"
      className="border-t border-gray-200 bg-slate-50"
    >
      {/* Header - always visible */}
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-center justify-between px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors"
        aria-expanded={expanded}
      >
        <span className="flex items-center gap-2">
          <svg
            className="h-3.5 w-3.5 text-blue-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          Evidence ({citations.length})
        </span>
        <svg
          className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="space-y-1.5 border-t border-gray-100 px-4 py-2">
          {citations.map((citation, index) => (
            <div
              key={citation.id}
              className="flex items-start gap-2 rounded-lg bg-white px-2.5 py-2 text-xs border border-gray-100"
            >
              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[9px] font-bold text-blue-700">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-slate-700">
                  {citation.label}
                </p>
                <div className="mt-0.5 flex items-center gap-2">
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-slate-500">
                    Source
                  </span>
                  {citation.href ? (
                    <a
                      href={citation.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline truncate"
                    >
                      View reference
                    </a>
                  ) : (
                    <span className="text-slate-400">No link available</span>
                  )}
                </div>
              </div>
            </div>
          ))}
          <div className="pt-1">
            <a
              href="/evidence"
              className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline"
            >
              View all evidence
              <svg
                className="h-3 w-3"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                />
              </svg>
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
