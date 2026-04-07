type EvidenceGrade = "A" | "B" | "C" | "D" | string;

const gradeConfig: Record<string, { classes: string; label: string }> = {
  A: {
    classes: "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30",
    label: "Grade A — Strong evidence",
  },
  B: {
    classes: "bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/30",
    label: "Grade B — Moderate evidence",
  },
  C: {
    classes: "bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30",
    label: "Grade C — Weak evidence",
  },
  D: {
    classes: "bg-red-500/15 text-red-400 ring-1 ring-red-500/30",
    label: "Grade D — Very limited / preliminary",
  },
};

function resolveGrade(grade: string): string {
  // Accept "Grade A", "A", "Level A", etc.
  const match = grade?.match(/\b([ABCD])\b/i);
  return match ? match[1].toUpperCase() : "";
}

export function EvidenceGradeBadge({
  grade,
  size = "sm",
}: {
  grade: EvidenceGrade;
  size?: "sm" | "lg";
}) {
  const key = resolveGrade(grade);
  const config = gradeConfig[key];

  if (!config) {
    // Fallback: render as neutral badge matching Badge.tsx style
    return (
      <span className="inline-flex rounded-full px-3 py-1 text-xs font-semibold bg-[var(--bg-subtle)] text-[var(--text)]">
        {grade}
      </span>
    );
  }

  const sizeClasses =
    size === "lg"
      ? "px-4 py-2 text-sm font-bold"
      : "px-3 py-1 text-xs font-semibold";

  return (
    <span
      className={`inline-flex rounded-full ${sizeClasses} ${config.classes}`}
      title={config.label}
    >
      {grade}
    </span>
  );
}
