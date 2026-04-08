import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAppState } from "../app/useAppStore";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { PageHeader } from "../components/ui/PageHeader";

type PatientStatus = "active" | "completed" | "pending";

type SessionEntry = {
  date: string;
  session: number;
  total: number;
  outcome: "positive" | "neutral" | "n/a";
  notes: string;
};

type Patient = {
  id: string;
  name: string;
  dob: string;
  condition: string;
  modality: string;
  activeProtocol: string;
  sessionsCompleted: number;
  sessionsTotal: number;
  lastSession: string | null;
  nextSession: string | null;
  status: PatientStatus;
  sessionHistory: SessionEntry[];
};

const mockPatients: Patient[] = [
  {
    id: "p1", name: "Sarah Mitchell", dob: "1978-03-12",
    condition: "Parkinson's Disease", modality: "TPS",
    activeProtocol: "Motor cortex TPS - 3×/week",
    sessionsCompleted: 8, sessionsTotal: 12,
    lastSession: "2026-04-05", nextSession: "2026-04-08", status: "active",
    sessionHistory: [
      { date: "2026-04-05", session: 8, total: 12, outcome: "positive", notes: "Mild improvement in tremor. No adverse effects." },
      { date: "2026-04-02", session: 7, total: 12, outcome: "neutral", notes: "Mild fatigue post-session. Resting well." },
      { date: "2026-03-31", session: 6, total: 12, outcome: "positive", notes: "Motor function improving. Patient motivated." },
    ],
  },
  {
    id: "p2", name: "James Okonkwo", dob: "1985-07-22",
    condition: "ADHD", modality: "Neurofeedback",
    activeProtocol: "Alpha/theta neurofeedback - 2×/week",
    sessionsCompleted: 3, sessionsTotal: 10,
    lastSession: "2026-04-03", nextSession: "2026-04-10", status: "active",
    sessionHistory: [
      { date: "2026-04-03", session: 3, total: 10, outcome: "neutral", notes: "Concentration improving. Minor resistance noted." },
      { date: "2026-03-31", session: 2, total: 10, outcome: "positive", notes: "Good engagement. Alpha increase observed." },
      { date: "2026-03-28", session: 1, total: 10, outcome: "neutral", notes: "Baseline session. Protocol introduced." },
    ],
  },
  {
    id: "p3", name: "Elena Vasquez", dob: "1992-11-05",
    condition: "Depression", modality: "TMS",
    activeProtocol: "DLPFC TMS protocol - 5×/week",
    sessionsCompleted: 15, sessionsTotal: 20,
    lastSession: "2026-04-06", nextSession: "2026-04-07", status: "active",
    sessionHistory: [
      { date: "2026-04-06", session: 15, total: 20, outcome: "positive", notes: "Good response, no adverse effects." },
      { date: "2026-04-05", session: 14, total: 20, outcome: "positive", notes: "Patient reports improved mood and sleep." },
      { date: "2026-04-04", session: 13, total: 20, outcome: "positive", notes: "Tolerating well. Motivation increasing." },
    ],
  },
  {
    id: "p4", name: "Robert Chen", dob: "1965-02-18",
    condition: "Chronic Pain", modality: "PBM",
    activeProtocol: "Photobiomodulation - 3×/week",
    sessionsCompleted: 20, sessionsTotal: 20,
    lastSession: "2026-03-28", nextSession: null, status: "completed",
    sessionHistory: [
      { date: "2026-03-28", session: 20, total: 20, outcome: "positive", notes: "Protocol complete. Pain significantly reduced." },
      { date: "2026-03-26", session: 19, total: 20, outcome: "positive", notes: "Excellent response throughout." },
      { date: "2026-03-24", session: 18, total: 20, outcome: "positive", notes: "Patient satisfied with outcomes." },
    ],
  },
  {
    id: "p5", name: "Amira Hassan", dob: "1990-09-30",
    condition: "Anxiety", modality: "Neurofeedback",
    activeProtocol: "SMR training protocol",
    sessionsCompleted: 0, sessionsTotal: 8,
    lastSession: null, nextSession: "2026-04-09", status: "pending",
    sessionHistory: [],
  },
  {
    id: "p6", name: "David Thornton", dob: "1972-06-14",
    condition: "PTSD", modality: "TMS",
    activeProtocol: "Right DLPFC inhibition",
    sessionsCompleted: 6, sessionsTotal: 15,
    lastSession: "2026-04-04", nextSession: "2026-04-08", status: "active",
    sessionHistory: [
      { date: "2026-04-04", session: 6, total: 15, outcome: "positive", notes: "Patient reported improved sleep quality." },
      { date: "2026-04-01", session: 5, total: 15, outcome: "neutral", notes: "Some anxiety post-session. Settled after 30 min." },
      { date: "2026-03-29", session: 4, total: 15, outcome: "positive", notes: "Responding well. Hyperarousal reducing." },
    ],
  },
];

function statusTone(s: PatientStatus): "success" | "neutral" | "warning" {
  return s === "active" ? "success" : s === "completed" ? "neutral" : "warning";
}
function statusLabel(s: PatientStatus) {
  return s === "active" ? "Active" : s === "completed" ? "Completed" : "Pending";
}
function outcomeTone(o: SessionEntry["outcome"]): "success" | "neutral" | "info" {
  return o === "positive" ? "success" : o === "neutral" ? "neutral" : "info";
}
function fmt(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
function fmtShort(d: string) {
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

const CARD = {
  background: "var(--bg-elevated)",
  border: "1px solid var(--border)",
  boxShadow: "var(--shadow-sm)",
};

function PatientCard({
  patient,
  expanded,
  onToggle,
  onPrescribe,
}: {
  patient: Patient;
  expanded: boolean;
  onToggle: () => void;
  onPrescribe: (p: Patient) => void;
}) {
  const pct = patient.sessionsTotal > 0 ? (patient.sessionsCompleted / patient.sessionsTotal) * 100 : 0;

  return (
    <div className="rounded-xl overflow-hidden" style={CARD}>
      {/* Card header */}
      <div className="p-5 flex flex-col gap-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-display font-semibold text-sm leading-tight truncate" style={{ color: "var(--text)" }}>
              {patient.name}
            </p>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>DOB: {fmt(patient.dob)}</p>
          </div>
          <Badge tone={statusTone(patient.status)}>{statusLabel(patient.status)}</Badge>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <Badge tone="neutral">{patient.condition}</Badge>
          <Badge tone="accent">{patient.modality}</Badge>
        </div>

        <p className="text-xs leading-5" style={{ color: "var(--text-muted)" }}>
          <span className="font-medium" style={{ color: "var(--text)" }}>Protocol: </span>
          {patient.activeProtocol}
        </p>

        {/* Progress */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>Sessions</span>
            <span className="text-xs font-semibold" style={{ color: "var(--text)" }}>
              {patient.sessionsCompleted}/{patient.sessionsTotal}
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${pct}%`,
                background: patient.status === "completed" ? "var(--text-muted)" : "var(--accent)",
              }}
            />
          </div>
        </div>

        <div className="flex items-center justify-between text-xs" style={{ color: "var(--text-muted)" }}>
          <span>Last: {fmt(patient.lastSession)}</span>
          <span>Next: {fmt(patient.nextSession)}</span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1 border-t" style={{ borderColor: "var(--border)" }}>
          <Button variant="ghost" size="sm" onClick={onToggle}>
            {expanded ? "Hide Details ↑" : "View Details ↓"}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => onPrescribe(patient)}>
            Prescribe Protocol
          </Button>
        </div>
      </div>

      {/* Expanded detail panel */}
      {expanded && (
        <div
          className="px-5 pb-5 pt-0 flex flex-col gap-4"
          style={{ borderTop: "1px solid var(--border)", background: "var(--bg)" }}
        >
          <div className="pt-4">
            <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: "var(--text-muted)" }}>
              Session History
            </p>

            {patient.sessionHistory.length === 0 ? (
              <p className="text-xs" style={{ color: "var(--text-subtle)" }}>No sessions completed yet.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {patient.sessionHistory.map((s) => (
                  <div
                    key={s.date}
                    className="rounded-xl p-3 flex flex-col gap-1.5"
                    style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold" style={{ color: "var(--text)" }}>
                          Session {s.session}/{s.total}
                        </span>
                        <span className="text-xs" style={{ color: "var(--text-subtle)" }}>{fmtShort(s.date)}</span>
                      </div>
                      <Badge tone={outcomeTone(s.outcome)}>
                        {s.outcome === "positive" ? "Positive" : s.outcome === "neutral" ? "Neutral" : "Pending"}
                      </Badge>
                    </div>
                    <p className="text-xs leading-5" style={{ color: "var(--text-muted)" }}>{s.notes}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick links */}
          <div className="flex flex-wrap gap-2 pt-1">
            <a
              href={`/documents?patient=${encodeURIComponent(patient.name)}`}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
              style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
            >
              📁 Documents
            </a>
            <a
              href={`/sessions?patient=${encodeURIComponent(patient.name)}`}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
              style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
            >
              📅 Sessions
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

export function PatientsPage() {
  const { role } = useAppState();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const isClinicianOrAdmin = role === "clinician" || role === "admin";

  function handlePrescribe(patient: Patient) {
    const params = new URLSearchParams({
      condition: patient.condition,
      modality: patient.modality,
      patient: patient.name,
    });
    navigate(`/protocols?${params.toString()}`);
  }

  if (!isClinicianOrAdmin) {
    return (
      <div className="grid gap-7">
        <PageHeader
          icon="👥"
          eyebrow="Patient Management"
          title="Patients"
          description="Manage patient profiles, prescribe protocols, and track session progress."
        />
        <div
          className="rounded-xl p-10 flex flex-col items-center gap-4 text-center"
          style={CARD}
        >
          <div
            className="flex h-14 w-14 items-center justify-center rounded-2xl text-2xl"
            style={{ background: "var(--accent-soft)", border: "1px solid var(--accent-soft-border)" }}
          >
            🔒
          </div>
          <div>
            <p className="font-display font-semibold text-base" style={{ color: "var(--text)" }}>
              Clinician access required
            </p>
            <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
              Log in as a clinician to manage patients.
            </p>
          </div>
          <button
            onClick={() => navigate("/login")}
            className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium"
            style={{ background: "var(--accent)", color: "white" }}
          >
            Sign in as clinician
          </button>
        </div>
      </div>
    );
  }

  const filtered = mockPatients.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.condition.toLowerCase().includes(search.toLowerCase()) ||
      p.modality.toLowerCase().includes(search.toLowerCase()),
  );

  const activeCount = mockPatients.filter((p) => p.status === "active").length;
  const pendingCount = mockPatients.filter((p) => p.status === "pending").length;
  const completedCount = mockPatients.filter((p) => p.status === "completed").length;

  return (
    <div className="grid gap-6">
      <PageHeader
        icon="👥"
        eyebrow="Patient Management"
        title="Patients"
        description="Manage patient profiles, prescribe protocols, and track session progress."
        actions={
          <Button variant="primary" size="md" disabled title="Coming soon">
            + Add Patient
          </Button>
        }
      />

      {/* Summary tiles */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Active", value: activeCount, color: "var(--success-text)", bg: "var(--success-bg)", border: "var(--success-border)" },
          { label: "Pending", value: pendingCount, color: "var(--warning-text)", bg: "var(--warning-bg)", border: "var(--warning-border)" },
          { label: "Completed", value: completedCount, color: "var(--text-muted)", bg: "var(--bg-elevated)", border: "var(--border)" },
        ].map((t) => (
          <div
            key={t.label}
            className="rounded-xl px-4 py-3 flex items-center gap-3"
            style={{ background: t.bg, border: `1px solid ${t.border}` }}
          >
            <p className="font-display text-2xl font-bold" style={{ color: t.color }}>{t.value}</p>
            <p className="text-xs font-medium" style={{ color: t.color }}>{t.label}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <label
        className="flex items-center gap-2.5 rounded-xl px-4 py-2.5 cursor-text"
        style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}
      >
        <span aria-hidden="true" style={{ color: "var(--text-muted)" }}>🔍</span>
        <input
          type="text"
          placeholder="Search by name, condition, or modality…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 bg-transparent text-sm outline-none"
          style={{ color: "var(--text)" }}
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="text-xs"
            style={{ color: "var(--text-muted)" }}
            aria-label="Clear search"
          >
            ✕
          </button>
        )}
      </label>

      {/* Count line */}
      <p className="text-xs -mt-3" style={{ color: "var(--text-muted)" }}>
        {filtered.length} patient{filtered.length !== 1 ? "s" : ""}{search ? " matching" : ""}
      </p>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="rounded-xl p-10 flex flex-col items-center gap-3 text-center" style={CARD}>
          <p className="text-3xl">🔍</p>
          <p className="font-medium text-sm" style={{ color: "var(--text)" }}>No patients found</p>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>Try a different search term.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((p) => (
            <PatientCard
              key={p.id}
              patient={p}
              expanded={expandedId === p.id}
              onToggle={() => setExpandedId(expandedId === p.id ? null : p.id)}
              onPrescribe={handlePrescribe}
            />
          ))}
        </div>
      )}
    </div>
  );
}
