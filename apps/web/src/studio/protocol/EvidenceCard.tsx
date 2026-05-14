/**
 * EvidenceCard — DeepSynaps Protocol Studio
 * ==========================================
 * Displays an evidence link with grade badge, citation details,
 * and expand/collapse for the summary abstract.
 */

import React, { useState } from "react";
import type { EvidenceLink } from "./types";

interface EvidenceCardProps {
  evidence: EvidenceLink;
}

const gradeColor = (grade: string): string => {
  switch (grade) {
    case "A":
      return "bg-green-100 text-green-800 border-green-200";
    case "B":
      return "bg-blue-100 text-blue-800 border-blue-200";
    case "C":
      return "bg-yellow-100 text-yellow-800 border-yellow-200";
    case "D":
      return "bg-red-100 text-red-800 border-red-200";
    default:
      return "bg-gray-100 text-gray-800 border-gray-200";
  }
};

const levelLabel = (level: string): string => `Level ${level}`;

export const EvidenceCard: React.FC<EvidenceCardProps> = ({ evidence }) => {
  const [isExpanded, setIsExpanded] = useState(evidence.isExpanded ?? false);

  const toggleExpand = () => setIsExpanded((prev) => !prev);

  return (
    <div
      className="bg-white rounded-lg border border-gray-200 p-3 hover:shadow-sm transition-shadow"
      data-testid={`evidence-card-${evidence.id}`}
    >
      {/* Header: grade + year + expand */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold border ${gradeColor(evidence.grade)}`}
            data-testid={`evidence-grade-${evidence.id}`}
            title={`Grade ${evidence.grade} — ${levelLabel(evidence.level)}`}
          >
            Grade {evidence.grade}
          </span>
          <span className="text-xs text-gray-500 font-medium">
            {evidence.year}
          </span>
        </div>
        <button
          onClick={toggleExpand}
          className="text-gray-400 hover:text-gray-600 p-0.5 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
          data-testid={`expand-btn-${evidence.id}`}
          aria-label={isExpanded ? "Collapse" : "Expand"}
          aria-expanded={isExpanded}
        >
          <svg
            className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* Title */}
      <h4
        className="text-sm font-medium text-gray-900 mt-2 line-clamp-2"
        data-testid={`evidence-title-${evidence.id}`}
      >
        {evidence.title}
      </h4>

      {/* Authors + Journal */}
      <p className="text-xs text-gray-500 mt-1 truncate" data-testid={`evidence-authors-${evidence.id}`}>
        {evidence.authors} · <em>{evidence.journal}</em>
      </p>

      {/* DOI / Link */}
      {evidence.doi && (
        <p className="text-xs text-gray-400 mt-0.5 truncate" data-testid={`evidence-doi-${evidence.id}`}>
          DOI: {evidence.doi}
        </p>
      )}

      {/* Expanded summary */}
      {isExpanded && evidence.summary && (
        <div
          className="mt-2 p-2.5 bg-gray-50 rounded-md text-xs text-gray-700 leading-relaxed border border-gray-100"
          data-testid={`evidence-summary-${evidence.id}`}
        >
          <strong className="text-gray-900">Abstract: </strong>
          {evidence.summary}
        </div>
      )}

      {/* PMID link */}
      {evidence.pmid && (
        <a
          href={`https://pubmed.ncbi.nlm.nih.gov/${evidence.pmid}/`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block mt-2 text-xs text-blue-600 hover:text-blue-800 hover:underline"
          data-testid={`evidence-pmid-link-${evidence.id}`}
        >
          PMID: {evidence.pmid} ↗
        </a>
      )}
    </div>
  );
};

export default EvidenceCard;
