import { useState } from "react";

import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { PageHeader } from "../components/ui/PageHeader";

type DocType = "prescription" | "session_report" | "assessment" | "correspondence";
type DocStatus = "active" | "final" | "sent";

type Document = {
  id: string;
  type: DocType;
  title: string;
  patient: string;
  date: string;
  author: string;
  status: DocStatus;
};

const mockDocuments: Document[] = [
  { id: "d1", type: "prescription", title: "TPS Motor Protocol — Sarah Mitchell", patient: "Sarah Mitchell", date: "2026-03-30", author: "Dr. Admin", status: "active" },
  { id: "d2", type: "session_report", title: "Session Report #8 — Sarah Mitchell", patient: "Sarah Mitchell", date: "2026-04-05", author: "Dr. Admin", status: "final" },
  { id: "d3", type: "assessment", title: "Initial UPDRS Assessment — Sarah Mitchell", patient: "Sarah Mitchell", date: "2026-03-25", author: "Dr. Admin", status: "final" },
  { id: "d4", type: "prescription", title: "DLPFC TMS Protocol — Elena Vasquez", patient: "Elena Vasquez", date: "2026-03-15", author: "Dr. Admin", status: "active" },
  { id: "d5", type: "session_report", title: "Session Report #15 — Elena Vasquez", patient: "Elena Vasquez", date: "2026-04-06", author: "Dr. Admin", status: "final" },
  { id: "d6", type: "correspondence", title: "Referral Letter — James Okonkwo", patient: "James Okonkwo", date: "2026-03-20", author: "Dr. Admin", status: "sent" },
  { id: "d7", type: "assessment", title: "ADHD Rating Scale — James Okonkwo", patient: "James Okonkwo", date: "2026-03-22", author: "Dr. Admin", status: "final" },
  { id: "d8", type: "prescription", title: "Alpha/Theta Neurofeedback — James Okonkwo", patient: "James Okonkwo", date: "2026-03-23", author: "Dr. Admin", status: "active" },
];

type FilterTab = "all" | DocType;

const TABS: { key: FilterTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "prescription", label: "Prescriptions" },
  { key: "session_report", label: "Session Reports" },
  { key: "assessment", label: "Assessments" },
  { key: "correspondence", label: "Correspondence" },
];

const TYPE_META: Record<
  DocType,
  { icon: string; label: string; badgeTone: "accent" | "neutral" | "info" }
> = {
  prescription:   { icon: "📋", label: "Prescription",   badgeTone: "accent" },
  session_report: { icon: "📝", label: "Session Report",  badgeTone: "neutral" },
  assessment:     { icon: "📊", label: "Assessment",      badgeTone: "info" },
  correspondence: { icon: "✉️", label: "Letter",          badgeTone: "neutral" },
};

const STATUS_TONE: Record<DocStatus, "success" | "neutral" | "info"> = {
  active: "success",
  final:  "neutral",
  sent:   "info",
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

const CARD_STYLE = {
  background: "var(--bg-elevated)",
  border: "1px solid var(--border)",
  boxShadow: "var(--shadow-sm)",
};

export function DocumentsPage() {
  const [activeTab, setActiveTab] = useState<FilterTab>("all");

  const filtered =
    activeTab === "all"
      ? mockDocuments
      : mockDocuments.filter((d) => d.type === activeTab);

  return (
    <div className="grid gap-7">
      <PageHeader
        icon="📁"
        eyebrow="Documents"
        title="Clinical Documents"
        description="Protocol prescriptions, session reports, assessment results, and patient correspondence."
      />

      {/* Filter tabs */}
      <div
        className="flex flex-wrap gap-1.5 p-1.5 rounded-xl"
        style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}
        role="tablist"
      >
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          const count =
            tab.key === "all"
              ? mockDocuments.length
              : mockDocuments.filter((d) => d.type === tab.key).length;
          return (
            <button
              key={tab.key}
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveTab(tab.key)}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
              style={
                isActive
                  ? { background: "var(--accent)", color: "white" }
                  : { color: "var(--text-muted)" }
              }
            >
              {tab.label}
              <span
                className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                style={
                  isActive
                    ? { background: "rgba(255,255,255,0.2)", color: "white" }
                    : { background: "var(--border)", color: "var(--text-muted)" }
                }
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Document list */}
      <div className="rounded-xl overflow-hidden" style={CARD_STYLE}>
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center px-6">
            <p className="text-3xl">📭</p>
            <p className="font-medium text-sm" style={{ color: "var(--text)" }}>No documents</p>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              No documents in this category yet.
            </p>
          </div>
        ) : (
          <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
            {filtered.map((doc) => {
              const meta = TYPE_META[doc.type];
              return (
                <li
                  key={doc.id}
                  className="flex flex-wrap items-center gap-3 px-5 py-4 transition-colors hover:bg-[var(--accent-soft)]"
                >
                  {/* Icon */}
                  <div
                    className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl text-lg"
                    style={{ background: "var(--bg)", border: "1px solid var(--border)" }}
                    aria-hidden="true"
                  >
                    {meta.icon}
                  </div>

                  {/* Title + type */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-sm truncate" style={{ color: "var(--text)" }}>
                        {doc.title}
                      </p>
                      <Badge tone={meta.badgeTone}>{meta.label}</Badge>
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                      {doc.author} · {formatDate(doc.date)}
                    </p>
                  </div>

                  {/* Patient badge */}
                  <div className="hidden sm:block flex-shrink-0">
                    <Badge tone="neutral">{doc.patient}</Badge>
                  </div>

                  {/* Status badge */}
                  <div className="flex-shrink-0">
                    <Badge tone={STATUS_TONE[doc.status]}>
                      {doc.status.charAt(0).toUpperCase() + doc.status.slice(1)}
                    </Badge>
                  </div>

                  {/* Download */}
                  <div className="flex-shrink-0">
                    <Button variant="ghost" size="sm" disabled title="Coming soon">
                      Download
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Footer count */}
      <p className="text-xs" style={{ color: "var(--text-subtle)" }}>
        Showing {filtered.length} of {mockDocuments.length} documents
      </p>
    </div>
  );
}
