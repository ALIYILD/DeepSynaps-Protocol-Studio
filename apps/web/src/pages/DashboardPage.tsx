import { NavLink } from "react-router-dom";

import { useAppState } from "../app/useAppStore";
import { DisclaimerBanner } from "../components/domain/DisclaimerBanner";
import { DocumentList } from "../components/domain/DocumentList";
import { Card } from "../components/ui/Card";
import { MetricTile } from "../components/ui/MetricTile";
import { PageHeader } from "../components/ui/PageHeader";
import { roleProfiles, workspaceMetrics } from "../data/mockData";

const quickActions = [
  {
    to: "/protocols",
    icon: "⚡",
    title: "Generate Protocol",
    description: "Create deterministic protocol drafts from registry-driven backend rules.",
  },
  {
    to: "/assessment-builder",
    icon: "📋",
    title: "Build Assessment",
    description: "Select a structured template and complete a clinician-facing assessment form.",
  },
  {
    to: "/upload-review",
    icon: "📂",
    title: "Review Uploads",
    description: "Inspect staged uploads and triage case summary documents.",
  },
  {
    to: "/evidence-library",
    icon: "🔬",
    title: "Browse Evidence",
    description: "Search condition-level evidence, compare methods, and inspect contraindications.",
  },
];

const clinicalSummaryItems = [
  { label: "Modalities available", value: "16" },
  { label: "Conditions covered", value: "31" },
  { label: "Protocols in database", value: "100" },
];

const gettingStartedItems = [
  { label: "Browse Evidence Library", to: "/evidence-library" },
  { label: "Explore Device Registry", to: "/device-registry" },
  { label: "View Brain Regions Atlas", to: "/brain-regions" },
];

const workspaceStatTiles = [
  {
    id: "ws1",
    label: "Evidence Records",
    value: "42",
    delta: "6 newly curated",
    detail: "Structured clinical library entries with regulatory posture notes.",
  },
  {
    id: "ws2",
    label: "Devices in Registry",
    value: "4",
    delta: "Sample MVP records",
    detail: "Device entries browseable by modality, region, and regulatory status.",
  },
  {
    id: "ws3",
    label: "Brain Regions",
    value: "46",
    delta: "Full atlas loaded",
    detail: "Anatomical regions mapped to EEG positions, networks, and targetable modalities.",
  },
  {
    id: "ws4",
    label: "qEEG Mappings",
    value: "22",
    delta: "Biomarker + condition maps",
    detail: "Frequency band biomarkers and condition-level qEEG patterns with neuromod strategies.",
  },
];

export function DashboardPage() {
  const { role, searchQuery } = useAppState();
  const roleLabel = roleProfiles.find((profile) => profile.role === role)?.label ?? "Guest";
  const isGuest = role === "guest";

  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow="Workspace overview"
        title="Clinical operations workspace"
        description="A focused environment for evidence-based assessments, protocols, handbooks, and clinician-gated upload review."
        badge={roleLabel}
      />

      <DisclaimerBanner />

      {/* Quick Actions */}
      <section className="grid gap-4">
        <h2 className="font-display text-xl text-[var(--text)]">Quick Actions</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {quickActions.map((action) => (
            <Card key={action.to} className="flex flex-col gap-3">
              <span className="text-3xl leading-none">{action.icon}</span>
              <h3 className="font-display text-lg text-[var(--text)]">{action.title}</h3>
              <p className="flex-1 text-sm leading-6 text-[var(--text-muted)]">{action.description}</p>
              <NavLink
                to={action.to}
                className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-[var(--accent)] hover:underline"
              >
                Go <span aria-hidden="true">→</span>
              </NavLink>
            </Card>
          ))}
        </div>
      </section>

      {/* Workspace Stats */}
      <section className="grid gap-4">
        <h2 className="font-display text-xl text-[var(--text)]">Workspace Stats</h2>
        <div className="grid gap-4 xl:grid-cols-4">
          {workspaceStatTiles.map((metric) => (
            <MetricTile key={metric.id} metric={metric} />
          ))}
        </div>
      </section>

      {/* Clinical Data Summary */}
      <section className="grid gap-4">
        <h2 className="font-display text-xl text-[var(--text)]">Clinical Data Summary</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {clinicalSummaryItems.map((item) => (
            <Card key={item.label} className="flex flex-col gap-2">
              <p className="text-sm text-[var(--text-muted)]">{item.label}</p>
              <p className="font-display text-4xl font-semibold text-[var(--accent)]">{item.value}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* Recent Documents */}
      <section className="grid gap-4">
        <h2 className="font-display text-xl text-[var(--text)]">Recent Workspace Materials</h2>
        <DocumentList query={searchQuery} />
      </section>

      {/* Getting Started (Guest role) */}
      {isGuest && (
        <section className="grid gap-4">
          <h2 className="font-display text-xl text-[var(--text)]">Getting Started</h2>
          <Card>
            <ul className="grid gap-3">
              {gettingStartedItems.map((item) => (
                <li key={item.to} className="flex items-center gap-3 text-sm text-[var(--text-muted)]">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full border border-[var(--accent)] text-[var(--accent)] text-xs font-bold">
                    ✓
                  </span>
                  <NavLink
                    to={item.to}
                    className="hover:text-[var(--accent)] transition-colors"
                  >
                    {item.label}
                  </NavLink>
                </li>
              ))}
              <li className="flex items-center gap-3 text-sm text-[var(--text-muted)]">
                <span className="flex h-5 w-5 items-center justify-center rounded-full border border-[var(--border)] text-xs font-bold">
                  →
                </span>
                <NavLink
                  to="/pricing-access"
                  className="font-medium text-[var(--accent)] hover:underline"
                >
                  Upgrade for Protocol Generation
                </NavLink>
              </li>
            </ul>
          </Card>
        </section>
      )}
    </div>
  );
}
