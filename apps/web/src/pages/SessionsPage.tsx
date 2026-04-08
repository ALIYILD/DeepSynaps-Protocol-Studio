import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { RoleGate } from "../components/domain/RoleGate";
import { Badge } from "../components/ui/Badge";
import { Breadcrumb } from "../components/ui/Breadcrumb";
import { PageHeader } from "../components/ui/PageHeader";
import {
  createClinicalSession,
  deleteClinicalSession,
  listPatients,
  listSessions,
  updateClinicalSession,
} from "../lib/api/services";
import { ClinicalSession, Patient } from "../types/domain";

// ── Constants ──────────────────────────────────────────────────────────────────

const MODALITIES = ["TMS", "tDCS", "TPS", "PBM", "Neurofeedback"];

const STATUS_TONE: Record<string, "success" | "warning" | "neutral" | "info"> = {
  scheduled: "info", completed: "success", cancelled: "neutral", no_show: "warning",
};

const OUTCOME_TONE: Record<string, "success" | "warning" | "neutral"> = {
  positive: "success", neutral: "neutral", negative: "warning",
};

// ── Calendar helpers ───────────────────────────────────────────────────────────

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function getWeekDays(anchor: Date): string[] {
  const dow = anchor.getDay(); // 0 = Sun
  const monday = new Date(anchor);
  monday.setDate(anchor.getDate() - ((dow + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

function isoDateOnly(isoStr: string): string {
  return new Date(isoStr).toISOString().slice(0, 10);
}

const TODAY_DATE = new Date().toISOString().slice(0, 10);
const WEEK = getWeekDays(new Date());

function fmtDateTime(iso: string): string {
  try { return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso)); }
  catch { return iso; }
}

const FIELD = "w-full rounded-xl border border-[var(--border)] bg-[var(--bg-strong)] px-3 py-2 text-sm text-[var(--text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] transition";

// ── Book session modal ─────────────────────────────────────────────────────────

interface BookModalProps {
  patients: Patient[];
  preselectedPatientId?: string;
  session?: ClinicalSession;
  onSave: (data: { patientId: string; scheduledAt: string; durationMinutes: number; modality: string; sessionNumber?: number; totalSessions?: number; protocolRef: string; billingCode: string; }) => Promise<void>;
  onClose: () => void;
}

function BookModal({ patients, preselectedPatientId, session, onSave, onClose }: BookModalProps) {
  const [patientId, setPatientId] = useState(session?.patientId ?? preselectedPatientId ?? "");
  const [date, setDate] = useState(session ? session.scheduledAt.slice(0, 10) : "");
  const [time, setTime] = useState(session ? session.scheduledAt.slice(11, 16) : "09:00");
  const [duration, setDuration] = useState(String(session?.durationMinutes ?? 60));
  const [modality, setModality] = useState(session?.modality ?? "");
  const [sessionNum, setSessionNum] = useState(String(session?.sessionNumber ?? ""));
  const [totalSessions, setTotalSessions] = useState(String(session?.totalSessions ?? ""));
  const [protocolRef, setProtocolRef] = useState(session?.protocolRef ?? "");
  const [billingCode, setBillingCode] = useState(session?.billingCode ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!patientId || !date) { setError("Patient and date are required."); return; }
    setSaving(true); setError(null);
    try {
      await onSave({ patientId, scheduledAt: `${date}T${time}:00`, durationMinutes: parseInt(duration) || 60, modality, sessionNumber: sessionNum ? parseInt(sessionNum) : undefined, totalSessions: totalSessions ? parseInt(totalSessions) : undefined, protocolRef, billingCode });
    } catch (err) { setError(err instanceof Error ? err.message : "Save failed."); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)" }}>
      <div className="w-full max-w-lg rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border)] shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
          <h2 className="font-semibold text-[var(--text)]">{session ? "Edit Session" : "Book Session"}</h2>
          <button type="button" onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text)] text-2xl">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 grid gap-4">
          <div className="grid gap-1.5">
            <label className="text-xs font-medium text-[var(--text-muted)]">Patient *</label>
            <select className={FIELD} required value={patientId} onChange={e => setPatientId(e.target.value)}>
              <option value="">Select patient</option>
              {patients.map(p => <option key={p.id} value={p.id}>{p.fullName} — {p.primaryCondition ?? "—"}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5"><label className="text-xs font-medium text-[var(--text-muted)]">Date *</label><input className={FIELD} type="date" required value={date} onChange={e => setDate(e.target.value)} /></div>
            <div className="grid gap-1.5"><label className="text-xs font-medium text-[var(--text-muted)]">Time</label><input className={FIELD} type="time" value={time} onChange={e => setTime(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <label className="text-xs font-medium text-[var(--text-muted)]">Duration (min)</label>
              <select className={FIELD} value={duration} onChange={e => setDuration(e.target.value)}>
                {["30","45","60","90","120"].map(d => <option key={d} value={d}>{d} min</option>)}
              </select>
            </div>
            <div className="grid gap-1.5">
              <label className="text-xs font-medium text-[var(--text-muted)]">Modality</label>
              <select className={FIELD} value={modality} onChange={e => setModality(e.target.value)}>
                <option value="">Select</option>
                {MODALITIES.map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5"><label className="text-xs font-medium text-[var(--text-muted)]">Session #</label><input className={FIELD} type="number" min="1" value={sessionNum} onChange={e => setSessionNum(e.target.value)} placeholder="e.g. 3" /></div>
            <div className="grid gap-1.5"><label className="text-xs font-medium text-[var(--text-muted)]">Total sessions</label><input className={FIELD} type="number" min="1" value={totalSessions} onChange={e => setTotalSessions(e.target.value)} placeholder="e.g. 12" /></div>
          </div>
          <div className="grid gap-1.5"><label className="text-xs font-medium text-[var(--text-muted)]">Protocol reference</label><input className={FIELD} value={protocolRef} onChange={e => setProtocolRef(e.target.value)} placeholder="e.g. Motor cortex TMS 3×/week" /></div>
          <div className="grid gap-1.5"><label className="text-xs font-medium text-[var(--text-muted)]">Billing code</label><input className={FIELD} value={billingCode} onChange={e => setBillingCode(e.target.value)} placeholder="e.g. 90901" /></div>
          {error && <p className="rounded-xl bg-[var(--danger-bg)] border border-[var(--danger-border)] px-4 py-2 text-sm text-[var(--danger-text)]">{error}</p>}
          <div className="flex gap-3 justify-end pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-[var(--text-muted)] border border-[var(--border)] hover:text-[var(--text)] transition">Cancel</button>
            <button type="submit" disabled={saving} className="px-5 py-2 rounded-xl text-sm font-semibold bg-[var(--accent)] text-white hover:brightness-110 disabled:opacity-50 transition">{saving ? "Saving…" : session ? "Update" : "Book Session"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Complete session modal ─────────────────────────────────────────────────────

interface CompleteModalProps {
  session: ClinicalSession;
  patientName: string;
  onSave: (data: { outcome: string; sessionNotes: string; adverseEvents: string; billingStatus: string }) => Promise<void>;
  onClose: () => void;
}

function CompleteModal({ session, patientName, onSave, onClose }: CompleteModalProps) {
  const [outcome, setOutcome] = useState(session.outcome ?? "neutral");
  const [notes, setNotes] = useState(session.sessionNotes ?? "");
  const [adverse, setAdverse] = useState(session.adverseEvents ?? "");
  const [billing, setBilling] = useState(session.billingStatus);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(null);
    try { await onSave({ outcome, sessionNotes: notes, adverseEvents: adverse, billingStatus: billing }); }
    catch (err) { setError(err instanceof Error ? err.message : "Save failed."); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)" }}>
      <div className="w-full max-w-lg rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border)] shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
          <div>
            <h2 className="font-semibold text-[var(--text)]">Complete Session</h2>
            <p className="text-xs text-[var(--text-muted)]">{patientName} · {fmtDateTime(session.scheduledAt)}</p>
          </div>
          <button type="button" onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text)] text-2xl">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 grid gap-4">
          <div className="grid gap-1.5">
            <label className="text-xs font-medium text-[var(--text-muted)]">Outcome</label>
            <div className="flex gap-2">
              {(["positive","neutral","negative"] as const).map(o => (
                <button key={o} type="button" onClick={() => setOutcome(o)} className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition ${outcome === o ? "bg-[var(--accent)] text-white border-[var(--accent)]" : "border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]"}`}>{o.charAt(0).toUpperCase() + o.slice(1)}</button>
              ))}
            </div>
          </div>
          <div className="grid gap-1.5"><label className="text-xs font-medium text-[var(--text-muted)]">Session notes</label><textarea className={FIELD + " min-h-[80px]"} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Patient response, observations, adjustments made…" /></div>
          <div className="grid gap-1.5"><label className="text-xs font-medium text-[var(--text-muted)]">Adverse events</label><textarea className={FIELD + " min-h-[60px]"} value={adverse} onChange={e => setAdverse(e.target.value)} placeholder="None / describe any adverse events…" /></div>
          <div className="grid gap-1.5">
            <label className="text-xs font-medium text-[var(--text-muted)]">Billing status</label>
            <select className={FIELD} value={billing} onChange={e => setBilling(e.target.value as "unbilled" | "billed" | "paid")}>
              <option value="unbilled">Unbilled</option>
              <option value="billed">Billed</option>
              <option value="paid">Paid</option>
            </select>
          </div>
          {error && <p className="rounded-xl bg-[var(--danger-bg)] border border-[var(--danger-border)] px-4 py-2 text-sm text-[var(--danger-text)]">{error}</p>}
          <div className="flex gap-3 justify-end pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-[var(--text-muted)] border border-[var(--border)] hover:text-[var(--text)] transition">Cancel</button>
            <button type="submit" disabled={saving} className="px-5 py-2 rounded-xl text-sm font-semibold bg-[var(--success)] text-white hover:brightness-110 disabled:opacity-50 transition">{saving ? "Saving…" : "Mark Complete"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Session card ───────────────────────────────────────────────────────────────

function SessionCard({ s, patientName, onEdit, onComplete, onCancel, onDelete, deleting }: {
  s: ClinicalSession; patientName: string;
  onEdit: () => void; onComplete: () => void;
  onCancel: () => void; onDelete: () => void; deleting: boolean;
}) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <div className="font-medium text-[var(--text)]">{patientName}</div>
          <div className="text-xs text-[var(--text-muted)]">{fmtDateTime(s.scheduledAt)} · {s.durationMinutes} min</div>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          <Badge tone={STATUS_TONE[s.status]}>{s.status.replace("_", " ")}</Badge>
          {s.modality && <Badge>{s.modality}</Badge>}
        </div>
      </div>
      {(s.sessionNumber || s.protocolRef) && (
        <div className="text-xs text-[var(--text-muted)] mb-2">
          {s.sessionNumber && s.totalSessions && `Session ${s.sessionNumber}/${s.totalSessions}`}
          {s.protocolRef && ` · ${s.protocolRef}`}
        </div>
      )}
      {s.sessionNotes && <p className="text-xs text-[var(--text)] mb-2 line-clamp-2">{s.sessionNotes}</p>}
      {s.outcome && <div className="mb-2"><Badge tone={OUTCOME_TONE[s.outcome]}>Outcome: {s.outcome}</Badge></div>}
      <div className="flex gap-1.5 flex-wrap mt-3">
        {s.status === "scheduled" && (
          <>
            <button onClick={onComplete} className="text-xs px-3 py-1 rounded-lg bg-[var(--success)] text-white font-medium hover:brightness-110 transition">Complete</button>
            <button onClick={onEdit} className="text-xs px-2.5 py-1 rounded-lg border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] transition">Edit</button>
            <button onClick={onCancel} className="text-xs px-2.5 py-1 rounded-lg border border-[var(--border)] text-[var(--warning)] hover:border-[var(--warning)] transition">Cancel</button>
          </>
        )}
        {s.status === "completed" && (
          <button onClick={onEdit} className="text-xs px-2.5 py-1 rounded-lg border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] transition">Edit notes</button>
        )}
        <button onClick={onDelete} disabled={deleting} className="text-xs px-2.5 py-1 rounded-lg border border-transparent text-[var(--danger-text)] hover:border-[var(--danger-border)] transition disabled:opacity-50">{deleting ? "…" : "Delete"}</button>
        {s.status === "completed" && s.billingStatus !== "paid" && <Badge tone="warning">Billing: {s.billingStatus}</Badge>}
        {s.billingStatus === "paid" && <Badge tone="success">Paid</Badge>}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function SessionsPage() {
  const [searchParams] = useSearchParams();
  const filterPatientId = searchParams.get("patient");

  const [sessions, setSessions] = useState<ClinicalSession[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [bookModal, setBookModal] = useState<"new" | ClinicalSession | null>(null);
  const [completeModal, setCompleteModal] = useState<ClinicalSession | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function load() {
    setLoading(true); setLoadError(null);
    try {
      const [s, p] = await Promise.all([listSessions(filterPatientId ?? undefined), listPatients()]);
      setSessions(s); setPatients(p);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load sessions.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [filterPatientId]);

  function pName(id: string) { return patients.find(p => p.id === id)?.fullName ?? `Patient ${id.slice(0, 8)}`; }

  // ── Derived stats ───────────────────────────────────────────────────────────
  const todayCount = sessions.filter(s => isoDateOnly(s.scheduledAt) === TODAY_DATE).length;
  const weekCount = sessions.filter(s => { const d = isoDateOnly(s.scheduledAt); return d >= WEEK[0] && d <= WEEK[6]; }).length;
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  const monthCompleted = sessions.filter(s => s.status === "completed" && isoDateOnly(s.scheduledAt) >= monthStart && isoDateOnly(s.scheduledAt) <= monthEnd).length;

  // ── Session splits ──────────────────────────────────────────────────────────
  const allUpcoming = sessions
    .filter(s => s.status === "scheduled")
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));

  const allCompleted = sessions
    .filter(s => s.status === "completed")
    .sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt))
    .slice(0, 10);

  const displayedUpcoming = selectedDay
    ? allUpcoming.filter(s => isoDateOnly(s.scheduledAt) === selectedDay)
    : allUpcoming;

  // ── Handlers ────────────────────────────────────────────────────────────────
  async function handleBook(data: Parameters<BookModalProps["onSave"]>[0]) {
    if (bookModal !== "new" && bookModal !== null) {
      await updateClinicalSession(bookModal.id, { scheduledAt: data.scheduledAt, durationMinutes: data.durationMinutes, modality: data.modality });
    } else {
      await createClinicalSession(data);
    }
    setBookModal(null); await load();
  }

  async function handleComplete(sess: ClinicalSession, data: { outcome: string; sessionNotes: string; adverseEvents: string; billingStatus: string }) {
    await updateClinicalSession(sess.id, { status: "completed", outcome: data.outcome, sessionNotes: data.sessionNotes, adverseEvents: data.adverseEvents, billingStatus: data.billingStatus });
    setCompleteModal(null); await load();
  }

  async function handleCancel(id: string) {
    if (!window.confirm("Cancel this session?")) return;
    await updateClinicalSession(id, { status: "cancelled" }); await load();
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this session permanently?")) return;
    setDeleting(id);
    try { await deleteClinicalSession(id); setSessions(prev => prev.filter(s => s.id !== id)); }
    finally { setDeleting(null); }
  }

  return (
    <div className="grid gap-6">
      <Breadcrumb items={[{ label: "Home", to: "/" }, { label: "Sessions & Calendar" }]} />
      <PageHeader
        icon="📅"
        eyebrow="Sessions & Calendar"
        title="Session management"
        description="Book, track and complete neuromodulation sessions. Record outcomes, adverse events and billing status."
        actions={
          <button
            onClick={() => setBookModal("new")}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-[var(--accent)] text-white hover:brightness-110 transition"
          >
            + Book Session
          </button>
        }
      />

      <RoleGate minimumRole="clinician" title="Clinician access required" description="Session management requires clinician or admin access.">
        {/* Patient filter pill */}
        {filterPatientId && (
          <div className="flex items-center gap-2">
            <span className="text-xs px-3 py-1 rounded-full border border-[var(--accent-soft-border)] bg-[var(--accent-soft)] text-[var(--accent)]">
              Filtered by patient: {filterPatientId}
            </span>
          </div>
        )}

        {/* Error notice */}
        {loadError && (
          <div className="rounded-2xl border border-[var(--danger-border)] bg-[var(--danger-bg)] p-4 text-sm text-[var(--danger-text)]">
            {loadError}
          </div>
        )}

        {/* Stats tiles */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Today's Sessions",   value: loading ? "—" : todayCount,      color: "var(--accent)" },
            { label: "This Week",          value: loading ? "—" : weekCount,        color: "var(--info-text)" },
            { label: "Month Completed",    value: loading ? "—" : monthCompleted,   color: "var(--success-text)" },
          ].map(stat => (
            <div key={stat.label} className="rounded-xl p-4 flex flex-col gap-1" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
              <p className="font-display text-3xl font-bold" style={{ color: stat.color }}>{stat.value}</p>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Weekly mini-calendar */}
        <div className="rounded-xl p-4" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
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
              const count = sessions.filter(s => isoDateOnly(s.scheduledAt) === date).length;
              const isToday = date === TODAY_DATE;
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
                  <span className="font-display text-lg font-bold leading-none">{new Date(date).getDate()}</span>
                  {count > 0 ? (
                    <span
                      className="flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold"
                      style={isSelected
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

        {/* Two-column: upcoming + completed */}
        {loading ? (
          <div className="text-center py-16 text-[var(--text-muted)] text-sm">Loading sessions…</div>
        ) : sessions.length === 0 && !loadError ? (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-12 text-center text-sm text-[var(--text-muted)]">
            <p className="text-2xl mb-3">📅</p>
            <p className="font-medium text-[var(--text)] mb-1">No sessions yet</p>
            <p className="mb-4">Book your first session to get started.</p>
            <button onClick={() => setBookModal("new")} className="px-4 py-2 rounded-xl text-sm font-semibold bg-[var(--accent)] text-white">
              + Book Session
            </button>
          </div>
        ) : (
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
                <div className="rounded-xl p-6 text-center" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
                  <p className="text-2xl mb-2">📭</p>
                  <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                    {selectedDay ? "No sessions on this day." : "No upcoming sessions."}
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {displayedUpcoming.map(s => (
                    <SessionCard
                      key={s.id} s={s} patientName={pName(s.patientId)}
                      onEdit={() => setBookModal(s)}
                      onComplete={() => setCompleteModal(s)}
                      onCancel={() => handleCancel(s.id)}
                      onDelete={() => handleDelete(s.id)}
                      deleting={deleting === s.id}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* Completed */}
            <section className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-sm font-semibold" style={{ color: "var(--text)" }}>Completed Sessions</h2>
                <Badge tone="neutral">{allCompleted.length}</Badge>
              </div>

              {allCompleted.length === 0 ? (
                <div className="rounded-xl p-6 text-center" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
                  <p className="text-2xl mb-2">📋</p>
                  <p className="text-sm" style={{ color: "var(--text-muted)" }}>No completed sessions yet.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {allCompleted.map(s => (
                    <SessionCard
                      key={s.id} s={s} patientName={pName(s.patientId)}
                      onEdit={() => setBookModal(s)}
                      onComplete={() => setCompleteModal(s)}
                      onCancel={() => handleCancel(s.id)}
                      onDelete={() => handleDelete(s.id)}
                      deleting={deleting === s.id}
                    />
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </RoleGate>

      {bookModal !== null && (
        <BookModal patients={patients} preselectedPatientId={filterPatientId ?? undefined} session={bookModal !== "new" ? bookModal : undefined} onSave={handleBook} onClose={() => setBookModal(null)} />
      )}
      {completeModal !== null && (
        <CompleteModal session={completeModal} patientName={pName(completeModal.patientId)} onSave={data => handleComplete(completeModal, data)} onClose={() => setCompleteModal(null)} />
      )}
    </div>
  );
}
