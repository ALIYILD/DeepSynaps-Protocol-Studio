import { WorkspaceMetric } from "../../types/domain";
import { Card } from "./Card";

export function MetricTile({ metric }: { metric: WorkspaceMetric }) {
  return (
    <Card className="clinical-grid">
      <p className="text-sm text-[var(--text-muted)]">{metric.label}</p>
      <p className="mt-4 font-display text-4xl font-semibold text-[var(--text)]">{metric.value}</p>
      <p className="mt-2 text-sm text-[var(--accent)]">{metric.delta}</p>
      <p className="mt-4 text-sm leading-6 text-[var(--text-muted)]">{metric.detail}</p>
    </Card>
  );
}
