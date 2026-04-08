import { WorkspaceMetric } from "../../types/domain";

export function MetricTile({ metric }: { metric: WorkspaceMetric }) {
  return (
    <div
      className="rounded-xl p-5 flex flex-col gap-1"
      style={{
        background: "var(--bg-elevated)",
        border: "1px solid var(--border)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">{metric.label}</p>
      <p className="mt-2 font-display text-3xl font-bold" style={{ color: "var(--accent)" }}>
        {metric.value}
      </p>
      <p className="text-xs text-[var(--text-muted)] leading-5 mt-1">{metric.detail}</p>
    </div>
  );
}
