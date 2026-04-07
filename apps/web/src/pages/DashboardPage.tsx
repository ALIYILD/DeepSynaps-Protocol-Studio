import { useAppState } from "../app/useAppStore";
import { DisclaimerBanner } from "../components/domain/DisclaimerBanner";
import { DocumentList } from "../components/domain/DocumentList";
import { InfoNotice } from "../components/ui/InfoNotice";
import { MetricTile } from "../components/ui/MetricTile";
import { PageHeader } from "../components/ui/PageHeader";
import { roleProfiles, workspaceMetrics } from "../data/mockData";

export function DashboardPage() {
  const { role, searchQuery } = useAppState();
  const roleLabel = roleProfiles.find((profile) => profile.role === role)?.label ?? "Guest";

  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow="Workspace overview"
        title="Premium clinical operations workspace"
        description="A focused environment for evidence-based assessments, protocols, handbooks, and clinician-gated upload review."
        badge={roleLabel}
      />
      <DisclaimerBanner />
      <InfoNotice
        title="Expanded workspace coverage"
        body="The MVP now includes evidence review, device registry exploration, assessment drafting, upload review, governance, and pricing access views, all using in-memory sample data."
      />
      <section className="grid gap-4 xl:grid-cols-3">
        {workspaceMetrics.map((metric) => (
          <MetricTile key={metric.id} metric={metric} />
        ))}
      </section>
      <section className="grid gap-4">
        <h2 className="font-display text-2xl text-[var(--text)]">Recent workspace materials</h2>
        <DocumentList query={searchQuery} />
      </section>
    </div>
  );
}
