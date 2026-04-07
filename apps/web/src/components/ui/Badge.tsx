import { ReactNode } from "react";

type BadgeTone = "neutral" | "accent" | "success" | "warning" | "danger" | "info";

const toneClasses: Record<BadgeTone, string> = {
  neutral: "bg-[var(--bg-subtle)] text-[var(--text-muted)]",
  accent: "bg-[var(--accent-soft)] text-[var(--accent)]",
  success: "bg-[var(--success-bg)] text-[var(--success-text)] border border-[var(--success-border)]",
  warning: "bg-[var(--warning-bg)] text-[var(--warning-text)] border border-[var(--warning-border)]",
  danger: "bg-[var(--danger-bg)] text-[var(--danger-text)] border border-[var(--danger-border)]",
  info: "bg-[var(--info-bg)] text-[var(--info-text)] border border-[var(--info-border)]",
};

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: BadgeTone }) {
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${toneClasses[tone]}`}>
      {children}
    </span>
  );
}
