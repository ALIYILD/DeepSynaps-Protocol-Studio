import { ReactNode } from "react";

type BadgeTone = "neutral" | "accent" | "success" | "warning";

const toneClasses: Record<BadgeTone, string> = {
  neutral: "bg-[var(--bg-subtle)] text-[var(--text)]",
  accent: "bg-[var(--accent-soft)] text-[var(--accent)]",
  success: "bg-emerald-500/15 text-emerald-300",
  warning: "bg-amber-500/15 text-amber-300",
};

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: BadgeTone }) {
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${toneClasses[tone]}`}>
      {children}
    </span>
  );
}
