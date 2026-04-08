import { ReactNode } from "react";

type NoticeTone = "warning" | "info" | "success" | "danger";

const toneMap: Record<NoticeTone, { wrapper: string; title: string; body: string; icon: string }> = {
  warning: {
    wrapper: "bg-[var(--warning-bg)] border-[var(--warning-border)]",
    title: "text-[var(--warning-text)]",
    body: "text-[var(--warning-text)] opacity-80",
    icon: "⚠️",
  },
  info: {
    wrapper: "bg-[var(--info-bg)] border-[var(--info-border)]",
    title: "text-[var(--info-text)]",
    body: "text-[var(--info-text)] opacity-80",
    icon: "ℹ️",
  },
  success: {
    wrapper: "bg-[var(--success-bg)] border-[var(--success-border)]",
    title: "text-[var(--success-text)]",
    body: "text-[var(--success-text)] opacity-80",
    icon: "✓",
  },
  danger: {
    wrapper: "bg-[var(--danger-bg)] border-[var(--danger-border)]",
    title: "text-[var(--danger-text)]",
    body: "text-[var(--danger-text)] opacity-80",
    icon: "⛔",
  },
};

export function InfoNotice({
  title,
  body,
  tone = "info",
  children,
}: {
  title: string;
  body: string;
  tone?: NoticeTone;
  children?: ReactNode;
}) {
  const map = toneMap[tone];
  return (
    <div className={`rounded-xl border p-4 ${map.wrapper}`}>
      <div className="flex items-start gap-2.5">
        <span className="text-base leading-none flex-shrink-0 mt-0.5" aria-hidden="true">{map.icon}</span>
        <div>
          <p className={`font-semibold text-sm ${map.title}`}>{title}</p>
          <p className={`mt-1 text-sm leading-6 ${map.body}`}>{body}</p>
          {children ? <div className="mt-3">{children}</div> : null}
        </div>
      </div>
    </div>
  );
}
