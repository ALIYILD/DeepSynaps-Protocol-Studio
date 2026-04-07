import { Badge } from "./Badge";

type EvidenceGrade = "A" | "B" | "C" | "D" | string;

const gradeConfig: Record<
  string,
  { label: string; tone: "success" | "info" | "warning" | "danger"; description: string }
> = {
  A: { label: "Grade A", tone: "success", description: "Guideline-level evidence" },
  B: { label: "Grade B", tone: "info", description: "Systematic review evidence" },
  C: { label: "Grade C", tone: "warning", description: "Emerging evidence" },
  D: { label: "Grade D", tone: "danger", description: "Experimental / preliminary" },
};

function resolveGrade(grade: string): string {
  // Accept "Grade A", "A", "Level A", etc.
  const match = grade?.match(/\b([ABCD])\b/i);
  return match ? match[1].toUpperCase() : "";
}

export function EvidenceGradeBadge({
  grade,
  size = "sm",
  showDescription = false,
}: {
  grade: EvidenceGrade;
  size?: "sm" | "lg";
  showDescription?: boolean;
}) {
  const key = resolveGrade(grade);
  const config = gradeConfig[key];

  if (!config) {
    return (
      <Badge tone="neutral">{grade}</Badge>
    );
  }

  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <Badge tone={config.tone}>
        <span className={size === "lg" ? "text-sm font-bold" : "text-xs font-semibold"}>
          {grade}
        </span>
      </Badge>
      {size === "lg" && showDescription && (
        <span className="text-xs text-[var(--text-muted)]">{config.description}</span>
      )}
    </span>
  );
}
