import { ReactNode } from "react";

type NoticeTone = "warning" | "info" | "success";

const toneMap: Record<NoticeTone, string> = {
  warning: "border-amber-400/40 bg-amber-500/10 text-amber-100",
  info: "border-[var(--accent)]/40 bg-[var(--accent-soft)] text-[var(--text)]",
  success: "border-emerald-400/40 bg-emerald-500/10 text-emerald-100",
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
  return (
    <section className={`rounded-3xl border p-4 ${toneMap[tone]}`}>
      <h2 className="font-display text-lg">{title}</h2>
      <p className="mt-2 text-sm leading-6 opacity-90">{body}</p>
      {children ? <div className="mt-3">{children}</div> : null}
    </section>
  );
}
