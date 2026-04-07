import { ReactNode } from "react";

type NoticeTone = "warning" | "info" | "success";

const toneMap: Record<
  NoticeTone,
  { bg: string; title: string; body: string; icon: string }
> = {
  warning: {
    bg: "bg-[var(--warning-bg)] border-[var(--warning-border)]",
    title: "text-[var(--warning-text)]",
    body: "text-[var(--warning-text)] opacity-80",
    icon: "⚠️",
  },
  info: {
    bg: "bg-[var(--info-bg)] border-[var(--info-border)]",
    title: "text-[var(--info-text)]",
    body: "text-[var(--info-text)] opacity-80",
    icon: "ℹ️",
  },
  success: {
    bg: "bg-[var(--success-bg)] border-[var(--success-border)]",
    title: "text-[var(--success-text)]",
    body: "text-[var(--success-text)] opacity-80",
    icon: "✓",
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
    <section className={`rounded-3xl border p-4 ${map.bg}`}>
      <h2 className={`font-display text-lg ${map.title}`}>{map.icon} {title}</h2>
      <p className={`mt-2 text-sm leading-6 ${map.body}`}>{body}</p>
      {children ? <div className="mt-3">{children}</div> : null}
    </section>
  );
}
