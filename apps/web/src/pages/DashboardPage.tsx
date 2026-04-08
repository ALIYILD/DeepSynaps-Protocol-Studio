import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";

import { useAppState } from "../app/useAppStore";
import { DisclaimerBanner } from "../components/domain/DisclaimerBanner";
import { PageHeader } from "../components/ui/PageHeader";
import { Skeleton } from "../components/ui/Skeleton";
import { Badge } from "../components/ui/Badge";
import { roleProfiles } from "../data/mockData";
import {
  fetchBrainRegionTotal,
  fetchDeviceTotal,
  fetchEvidenceTotal,
  fetchQEEGBiomarkerTotal,
} from "../lib/api/services";

const clinicalTools = [
  {
    to: "/protocols",
    icon: "⚡",
    color: "#0d9488",
    colorBg: "rgba(13,148,136,0.1)",
    title: "Protocol Generator",
    description: "Evidence-ranked protocol drafts. Search by condition, modality, and evidence grade.",
    badge: "Core Tool",
  },
  {
    to: "/assessment-builder",
    icon: "📋",
    color: "#7c3aed",
    colorBg: "rgba(124,58,237,0.1)",
    title: "Assessment Generator",
    description: "Build structured clinical assessments for patients before and during treatment.",
    badge: null,
  },
  {
    to: "/sessions",
    icon: "📅",
    color: "#0284c7",
    colorBg: "rgba(2,132,199,0.1)",
    title: "Sessions & Calendar",
    description: "View upcoming sessions, track completed treatments, and manage bookings.",
    badge: null,
  },
  {
    to: "/documents",
    icon: "📁",
    color: "#ea580c",
    colorBg: "rgba(234,88,12,0.1)",
    title: "Documents",
    description: "Protocol prescriptions, session reports, assessments, and patient letters.",
    badge: null,
  },
];

const referenceLinks = [
  { to: "/evidence-library", icon: "📚", label: "Evidence Library", sub: "Clinical evidence records" },
  { to: "/device-registry", icon: "🖥️", label: "Device Registry", sub: "Neuromodulation devices" },
  { to: "/brain-regions", icon: "🧠", label: "Brain Regions", sub: "Anatomical atlas" },
  { to: "/qeeg-maps", icon: "📊", label: "qEEG Maps", sub: "Biomarker patterns" },
];

// Mock active patient/session summary for clinician view
const clinicianSummary = [
  { label: "Active Patients", value: "6", icon: "👥", to: "/patients" },
  { label: "Sessions Today", value: "3", icon: "📅", to: "/sessions" },
  { label: "Pending Documents", value: "2", icon: "📁", to: "/documents" },
];

type StatCounts = {
  evidence: number | null;
  devices: number | null;
  brainRegions: number | null;
  qeegBiomarkers: number | null;
};

const statConfig = [
  { key: "evidence" as const, label: "Evidence Records", icon: "📚", color: "#0d9488" },
  { key: "devices" as const, label: "Devices", icon: "🖥️", color: "#7c3aed" },
  { key: "brainRegions" as const, label: "Brain Regions", icon: "🧠", color: "#0284c7" },
  { key: "qeegBiomarkers" as const, label: "qEEG Biomarkers", icon: "📊", color: "#ea580c" },
];

export function DashboardPage() {
  const { role } = useAppState();
  const roleLabel = roleProfiles.find((p) => p.role === role)?.label ?? "Guest";
  const isGuest = role === "guest";
  const isClinician = role === "clinician" || role === "admin";

  const [statsLoading, setStatsLoading] = useState(true);
  const [counts, setCounts] = useState<StatCounts>({
    evidence: null,
    devices: null,
    brainRegions: null,
    qeegBiomarkers: null,
  });

  useEffect(() => {
    let cancelled = false;
    setStatsLoading(true);
    void Promise.all([
      fetchEvidenceTotal().catch(() => null),
      fetchDeviceTotal().catch(() => null),
      fetchBrainRegionTotal().catch(() => null),
      fetchQEEGBiomarkerTotal().catch(() => null),
    ]).then(([evidence, devices, brainRegions, qeegBiomarkers]) => {
      if (cancelled) return;
      setCounts({ evidence, devices, brainRegions, qeegBiomarkers });
      setStatsLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="grid gap-7 max-w-6xl">
      <PageHeader
        icon="🏠"
        eyebrow="Workspace"
        title="Clinical Dashboard"
        description="Evidence-based protocols, patient management, sessions, and clinical documents — all in one place."
        badge={roleLabel}
      />

      <DisclaimerBanner />

      {/* Clinician summary strip */}
      {isClinician && (
        <div className="grid grid-cols-3 gap-3">
          {clinicianSummary.map((s) => (
            <NavLink
              key={s.to}
              to={s.to}
              className="flex items-center gap-3 rounded-xl px-4 py-3.5 transition-all hover:border-[var(--accent)] group"
              style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}
            >
              <span className="text-xl leading-none">{s.icon}</span>
              <div>
                <p className="font-display text-2xl font-bold text-[var(--text)] leading-none">{s.value}</p>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">{s.label}</p>
              </div>
              <svg width="14" height="14" viewBox="0 0 12 12" fill="none" className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" style={{ color: "var(--accent)" }} aria-hidden="true">
                <path d="M4.5 3l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </NavLink>
          ))}
        </div>
      )}

      {/* Clinical Tools */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-base font-semibold text-[var(--text)]">Clinical Tools</h2>
          {isClinician && (
            <NavLink to="/patients" className="text-xs font-medium transition-colors hover:underline" style={{ color: "var(--accent)" }}>
              View all patients →
            </NavLink>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {clinicalTools.map((tool) => (
            <NavLink
              key={tool.to}
              to={tool.to}
              className="group flex flex-col gap-3 rounded-xl p-5 transition-all hover:-translate-y-0.5 hover:shadow-md"
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border)",
                boxShadow: "var(--shadow-sm)",
              }}
            >
              <div className="flex items-start justify-between gap-2">
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-xl text-xl flex-shrink-0"
                  style={{ background: tool.colorBg }}
                >
                  {tool.icon}
                </div>
                {tool.badge && (
                  <Badge tone="accent">{tool.badge}</Badge>
                )}
              </div>
              <div className="flex-1">
                <p className="font-semibold text-sm text-[var(--text)] group-hover:text-[var(--accent)] transition-colors leading-tight">
                  {tool.title}
                </p>
                <p className="mt-1.5 text-xs leading-5 text-[var(--text-muted)]">{tool.description}</p>
              </div>
              <div className="flex items-center gap-1 text-xs font-medium mt-auto" style={{ color: tool.color }}>
                Open
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="transition-transform group-hover:translate-x-0.5" aria-hidden="true">
                  <path d="M2.5 6h7M6.5 3l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </NavLink>
          ))}
        </div>
      </section>

      {/* Knowledge base stats */}
      <section>
        <h2 className="font-display text-base font-semibold text-[var(--text)] mb-3">Knowledge Base</h2>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {statsLoading
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-xl p-4" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
                  <Skeleton className="h-5 w-5 rounded-lg mb-3" />
                  <Skeleton className="h-7 w-12 mb-1.5" />
                  <Skeleton className="h-3 w-20" />
                </div>
              ))
            : statConfig.map((s) => {
                const val = counts[s.key];
                return (
                  <div
                    key={s.key}
                    className="rounded-xl p-4 flex flex-col gap-0.5"
                    style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}
                  >
                    <div
                      className="mb-2.5 flex h-8 w-8 items-center justify-center rounded-lg text-base"
                      style={{ background: s.color + "18" }}
                    >
                      {s.icon}
                    </div>
                    <p className="font-display text-2xl font-bold leading-none" style={{ color: s.color }}>
                      {val !== null ? val : "—"}
                    </p>
                    <p className="text-xs text-[var(--text-muted)] mt-1">{s.label}</p>
                  </div>
                );
              })}
        </div>
      </section>

      {/* Reference quick access */}
      <section>
        <h2 className="font-display text-base font-semibold text-[var(--text)] mb-3">Reference Library</h2>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {referenceLinks.map((ref) => (
            <NavLink
              key={ref.to}
              to={ref.to}
              className="flex items-center gap-3 rounded-xl px-4 py-3.5 transition-colors hover:border-[var(--accent)] group"
              style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}
            >
              <span className="text-xl leading-none flex-shrink-0">{ref.icon}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-[var(--text)] truncate">{ref.label}</p>
                <p className="text-xs text-[var(--text-muted)] truncate">{ref.sub}</p>
              </div>
              <svg width="14" height="14" viewBox="0 0 12 12" fill="none" className="flex-shrink-0 opacity-30 group-hover:opacity-100 transition-opacity" style={{ color: "var(--accent)" }} aria-hidden="true">
                <path d="M4.5 3l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </NavLink>
          ))}
        </div>
      </section>

      {/* Guest CTA */}
      {isGuest && (
        <section
          className="rounded-xl p-5"
          style={{ background: "var(--accent-soft)", border: "1px solid var(--accent-soft-border)" }}
        >
          <p className="font-display font-semibold text-sm" style={{ color: "var(--accent)" }}>
            Get full access
          </p>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Sign in as a clinician to manage patients, prescribe protocols, and track sessions.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <NavLink
              to="/login"
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium"
              style={{ background: "var(--accent)", color: "white" }}
            >
              Sign In →
            </NavLink>
            <NavLink
              to="/how-to-use"
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium"
              style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
            >
              How to Use →
            </NavLink>
          </div>
        </section>
      )}
    </div>
  );
}
