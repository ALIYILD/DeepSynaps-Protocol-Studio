import { ReactNode } from "react";

import { Card } from "./Card";

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: string | ReactNode;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <Card className="text-center py-10">
      {icon ? (
        <div className="text-4xl leading-none mb-4" aria-hidden="true">
          {icon}
        </div>
      ) : null}
      <h2 className="font-display text-2xl text-[var(--text)]">{title}</h2>
      <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-[var(--text-muted)]">{body}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </Card>
  );
}
