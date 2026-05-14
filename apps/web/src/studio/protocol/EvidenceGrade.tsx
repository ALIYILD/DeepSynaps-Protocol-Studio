/**
 * EvidenceGrade — Visual grade indicator for evidence quality.
 *
 * Displays A/B/C/D grades with color-coded badges and accessible tooltips
 * explaining the clinical meaning of each grade. Grades follow standard
 * evidence-based medicine hierarchy.
 */

import React, { useState } from "react";

export type EvidenceGradeValue = "A" | "B" | "C" | "D";

interface EvidenceGradeProps {
  grade: EvidenceGradeValue;
  showTooltip?: boolean;
}

/** Grade definitions with color coding and clinical descriptions. */
const GRADE_META: Record<
  EvidenceGradeValue,
  { color: string; bg: string; border: string; label: string; description: string }
> = {
  A: {
    color: "text-emerald-800",
    bg: "bg-emerald-100",
    border: "border-emerald-300",
    label: "Grade A",
    description:
      "High-certainty evidence: consistent RCTs or meta-analyses with narrow confidence intervals.",
  },
  B: {
    color: "text-sky-800",
    bg: "bg-sky-100",
    border: "border-sky-300",
    label: "Grade B",
    description:
      "Moderate evidence: limited RCTs, consistent cohort studies, or high-quality observational data.",
  },
  C: {
    color: "text-amber-800",
    bg: "bg-amber-100",
    border: "border-amber-300",
    label: "Grade C",
    description:
      "Low evidence: small studies, case series, or expert opinion with inconsistent findings.",
  },
  D: {
    color: "text-rose-800",
    bg: "bg-rose-100",
    border: "border-rose-300",
    label: "Grade D",
    description:
      "Very low evidence: case reports, expert opinion only, or preclinical data. Exercise caution.",
  },
};

/**
 * Evidence grade badge with color coding and optional tooltip.
 * @param grade - The evidence grade (A/B/C/D).
 * @param showTooltip - Whether to show tooltip on hover. Defaults to true.
 */
const EvidenceGrade: React.FC<EvidenceGradeProps> = ({
  grade,
  showTooltip = true,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const meta = GRADE_META[grade] || GRADE_META.D;

  return (
    <span
      className="relative inline-block"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      data-testid={`evidence-grade-${grade}`}
      aria-label={`${meta.label}: ${meta.description}`}
    >
      <span
        className={`inline-flex h-6 w-6 items-center justify-center rounded-full border text-xs font-bold ${meta.bg} ${meta.color} ${meta.border}`}
        role="img"
        aria-label={meta.label}
      >
        {grade}
      </span>

      {/* Tooltip */}
      {showTooltip && isHovered && (
        <span
          className="absolute bottom-full left-1/2 z-50 mb-2 w-56 -translate-x-1/2 rounded-md bg-slate-800 px-3 py-2 text-xs text-white shadow-lg"
          role="tooltip"
        >
          <span className="font-semibold">{meta.label}</span>
          <span className="mt-1 block text-slate-200">{meta.description}</span>
          <span
            className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-slate-800"
            aria-hidden="true"
          />
        </span>
      )}
    </span>
  );
};

export default EvidenceGrade;
