import { ReactNode } from "react";

import { Card } from "./Card";

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <Card className="text-center">
      <h2 className="font-display text-2xl text-[var(--text)]">{title}</h2>
      <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-[var(--text-muted)]">{body}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </Card>
  );
}
