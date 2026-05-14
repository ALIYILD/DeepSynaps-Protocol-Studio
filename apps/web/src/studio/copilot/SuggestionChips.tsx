/**
 * SuggestionChips — DeepSynaps Protocol Studio
 * =============================================
 * Horizontal scrollable row of AI-suggested action chips
 * with click handling and type-based icons.
 */

import React from "react";
import type { SuggestionChip } from "./types";

interface SuggestionChipsProps {
  suggestions: SuggestionChip[];
  onChipClick?: (chip: SuggestionChip) => void;
  disabled?: boolean;
}

const typeColors: Record<string, string> = {
  protocol: "bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100",
  analysis: "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100",
  condition: "bg-green-50 text-green-700 border-green-200 hover:bg-green-100",
  general: "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100",
};

const typeIcon = (type: string): string => {
  switch (type) {
    case "protocol":
      return "M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z";
    case "analysis":
      return "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z";
    case "condition":
      return "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z";
    default:
      return "M13 10V3L4 14h7v7l9-11h-7z";
  }
};

export const SuggestionChips: React.FC<SuggestionChipsProps> = ({
  suggestions,
  onChipClick,
  disabled = false,
}) => {
  if (suggestions.length === 0) return null;

  return (
    <div
      className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide"
      data-testid="suggestion-chips"
    >
      {suggestions.map((chip) => {
        const colorClass = typeColors[chip.type] ?? typeColors.general;
        return (
          <button
            key={chip.id}
            onClick={() => !disabled && onChipClick?.(chip)}
            disabled={disabled}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-colors shrink-0 ${
              disabled ? "opacity-40 cursor-not-allowed " + colorClass : colorClass
            }`}
            data-testid={`suggestion-chip-${chip.id}`}
          >
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d={typeIcon(chip.type)} />
            </svg>
            {chip.label}
          </button>
        );
      })}
    </div>
  );
};

export default SuggestionChips;
