import { ReactNode } from "react";

import { Badge } from "./Badge";

export function PageHeader({
  icon,
  eyebrow,
  title,
  description,
  badge,
  actions,
}: {
  icon?: string | ReactNode;
  eyebrow: string;
  title: string;
  description: string;
  badge?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 pb-5 mb-2 border-b border-[var(--border)] lg:flex-row lg:items-start lg:justify-between">
      <div className="flex items-start gap-4">
        {icon ? (
          <div
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl text-xl"
            style={{ background: "var(--accent-soft)", border: "1px solid var(--accent-soft-border)" }}
            aria-hidden="true"
          >
            {icon}
          </div>
        ) : null}
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--accent)" }}>
            {eyebrow}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2.5">
            <h1 className="font-display text-2xl font-semibold text-[var(--text)] md:text-3xl">
              {title}
            </h1>
            {badge ? <Badge tone="accent">{badge}</Badge> : null}
          </div>
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-[var(--text-muted)]">{description}</p>
        </div>
      </div>
      {actions ? <div className="flex items-center gap-2 flex-shrink-0">{actions}</div> : null}
    </header>
  );
}
