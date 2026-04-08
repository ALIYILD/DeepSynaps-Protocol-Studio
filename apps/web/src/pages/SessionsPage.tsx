import { useState } from "react";

import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { PageHeader } from "../components/ui/PageHeader";

type SessionStatus = "confirmed" | "pending";
type OutcomeType = "positive" | "neutral";

type UpcomingSession = {
  id: string;
  patient: string;
  condition: string;
  date: string;
  time: string;
  modality: string;
  session: number;
  total: number;
  status: SessionStatus;
};

type RecentSession = {
  id: string;
  patient: string;
  date: string;
  modality: string;
  session: number;
  total: number;
  notes: string;
  outcome: OutcomeType;
};

const upcomingSessions: UpcomingSession[] = [
  { id: "s1", patient: "Sarah Mitchell", condition: "Parkinson's", date: "2026-04-08", time: "09:00", modality: "TPS",         session: 9, total: 12, status: "confirmed" },
  { id: "s2", patient: "David Thornton",  condition: "PTSD",        date: "2026-04-08", time: "11:00", modality: "TMS",         session: 7, total: 15, status: "confirmed" },
  { id: "s3", patient: "Amira Hassan",    condition: "Anxiety",     date: "2026-04-09", time: "10:00", modality: "Neurofeedback", session: 1, total: 8, status: "pending" },
  { id: "s4", patient: "James Okonkwo",  condition: "ADHD",        date: "2026-04-10", time: "14:00", modality: "Neurofeedback", session: 4, total: 10, status: "confirmed" },
  { id: "s5", patient: "Elena Vasquez",  condition: "Depression",  date: "2026-04-07", time: "09:00", modality: "TMS",         session: 16, total: 20, status: "confirmed" },
];

const recentSessions: RecentSession[] = [
  { id: "r1", patient: "Elena Vasquez",  date: "2026-04-06", modality: "TMS",         session: 15, total: 20, notes: "Good response, no adverse effects.",                 outcome: "positive" },
  { id: "r2", patient: "Sarah Mitchell", date: "2026-04-05", modality: "TPS",         session: 8,  total: 12, notes: "Mild fatigue reported post-session.",                outcome: "neutral" },
  { id: "r3", patient: "David Thornton", date: "2026-04-04", modality: "TMS",         session: 6,  total: 15, notes: "Patient reported improved sleep quality.",           outcome: "positive" },
  { id: "r4", patient: "James Okonkwo", date: "2026-04-03", modality: "Neurofeedback", session: 3, total: 10, notes: "Concentration improving, minor resistance.",          outcome: "neutral" },
];

// Build week days (Mon–Sun) from today (2026-04-08)
const TODAY = "2026-04-08";

function getWeekDays(anchor: string) {
  const base = new Date(anchor);
  const dow = base.getDay(); // 0=Sun
  const monday = new Date(base);
  monday.setDate(base.getDate() - ((dow + 6) % 7)); // shift to Mon
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

const WEEK = getWeekDays(TODAY);
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function sessionsOnDay(date: string) {
  return upcomingSessions.filter((s) => s.date === date);
}

function formatDateTime(dateStr: string, time: string): string {
  const d = new Date(dateStr);
  const day = d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  return `${day} · ${time}`;
}
function formatShort(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
function formatDayNum(dateStr: string): string {
  return new Date(dateStr).getDate().toString();
}

const CARD = {
  background: "var(--bg-elevated)",
  border: "1px solid var(--border)",
  boxShadow: "var(--shadow-sm)",
};

export function SessionsPage() {
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const displayedUpcoming = selectedDay
    ? upcomingSessions.filter((s) => s.date === selectedDay)
    : upcomingSessions;

  return (
    <div className="grid gap-7">
      <PageHeader
        icon="📅"
        eyebrow="Sessions & Calendar"
        title="Sessions"
        description="View upcoming sessions, track completed treatments, and manage patient bookings."
        actions={
          <Button variant="primary" size="md" disabled title="Coming soon">
            + Book Session
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Today's Sessions", value: 3, color: "var(--accent)" },
          { label: "This Week",        value: upcomingSessions.length, color: "var(--info-text)" },
          { label: "Month Completed",  value: 47, color: "var(--success-text)" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl p-4 flex flex-col gap-1" style={CARD}>
            <p className="font-display text-3xl font-bold" style={{ color: s.color }}>{s.value}</p>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* Weekly mini-calendar */}
      <div className="rounded-xl p-4" style={CARD}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-sm font-semibold" style={{ color: "var(--text)" }}>
            Week of {new Date(WEEK[0]).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
          </h2>
          {selectedDay && (
            <button
              className="text-xs font-medium hover:underline"
              style={{ color: "var(--accent)" }}
              onClick={() => setSelectedDay(null)}
            >
              Show all
            </button>
          )}
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {WEEK.map((date, i) => {
            const count = sessionsOnDay(date).length;
            const isToday = date === TODAY;
            const isSelected = selectedDay === date;
            return (
              <button
                key={date}
                onClick={() => setSelectedDay(isSelected ? null : date)}
                className="flex flex-col items-center gap-1 rounded-xl py-3 px-1 transition-colors"
                style={
                  isSelected
                    ? { background: "var(--accent)", color: "white" }
                    : isToday
                    ? { background: "var(--accent-soft)", border: "1px solid var(--accent-soft-border)", color: "var(--accent)" }
                    : { background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text-muted)" }
                }
              >
                <span className="text-[10px] font-semibold uppercase">{DAY_LABELS[i]}</span>
                <span className="font-display text-lg font-bold leading-none">{formatDayNum(date)}</span>
                {count > 0 ? (
                  <span
                    className="flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold"
                    style={
                      isSelected
                        ? { background: "rgba(255,255,255,0.25)", color: "white" }
                        : { background: "var(--accent-soft)", color: "var(--accent)" }
                    }
                  >
                    {count}
                  </span>
                ) : (
                  <span className="h-4 w-4" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Two-column: upcoming + recent */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Upcoming */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold" style={{ color: "var(--text)" }}>
              {selectedDay
                ? `Sessions — ${new Date(selectedDay).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" })}`
                : "Upcoming Sessions"}
            </h2>
            <Badge tone="accent">{displayedUpcoming.length}</Badge>
          </div>

          {displayedUpcoming.length === 0 ? (
            <div className="rounded-xl p-6 text-center" style={CARD}>
              <p className="text-2xl mb-2">📭</p>
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>No sessions on this day.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {displayedUpcoming.map((s) => (
                <div key={s.id} className="rounded-xl p-4 flex flex-col gap-3" style={CARD}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate" style={{ color: "var(--text)" }}>{s.patient}</p>
                      <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{s.condition}</p>
                    </div>
                    <Badge tone={s.status === "confirmed" ? "success" : "warning"}>
                      {s.status === "confirmed" ? "Confirmed" : "Pending"}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
                    <span>🕐 {formatDateTime(s.date, s.time)}</span>
                    <Badge tone="accent">{s.modality}</Badge>
                    <span style={{ color: "var(--text-subtle)" }}>·</span>
                    <span>Session {s.session}/{s.total}</span>
                  </div>
                  {/* mini progress bar */}
                  <div className="flex flex-col gap-1">
                    <div className="h-1 w-full rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${(s.session / s.total) * 100}%`, background: "var(--accent)" }}
                      />
                    </div>
                    <p className="text-[10px]" style={{ color: "var(--text-subtle)" }}>
                      {Math.round((s.session / s.total) * 100)}% complete
                    </p>
                  </div>
                  <div className="pt-1 border-t flex justify-end" style={{ borderColor: "var(--border)" }}>
                    <Button variant="primary" size="sm" disabled title="Coming soon">
                      Start Session
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Recent */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold" style={{ color: "var(--text)" }}>Recent Sessions</h2>
            <Badge tone="neutral">{recentSessions.length}</Badge>
          </div>
          <div className="flex flex-col gap-3">
            {recentSessions.map((r) => (
              <div key={r.id} className="rounded-xl p-4 flex flex-col gap-2.5" style={CARD}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate" style={{ color: "var(--text)" }}>{r.patient}</p>
                    <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{formatShort(r.date)}</p>
                  </div>
                  <Badge tone={r.outcome === "positive" ? "success" : "neutral"}>
                    {r.outcome === "positive" ? "Positive" : "Neutral"}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone="accent">{r.modality}</Badge>
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>Session {r.session}/{r.total}</span>
                </div>
                <p className="text-xs leading-5 line-clamp-2" style={{ color: "var(--text-muted)" }}>{r.notes}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
