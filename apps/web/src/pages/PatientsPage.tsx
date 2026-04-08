import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { RoleGate } from "../components/domain/RoleGate";
import { Badge } from "../components/ui/Badge";
import { Breadcrumb } from "../components/ui/Breadcrumb";
import { PageHeader } from "../components/ui/PageHeader";
import {
  createPatient,
  deletePatient,
  listPatients,
  updatePatient,
} from "../lib/api/services";
import { Patient } from "../types/domain";

// ── Constants ──────────────────────────────────────────────────────────────────

const CONDITIONS = [
  "Parkinson's Disease", "ADHD", "Depression", "PTSD", "Anxiety", "TBI",
  "Stroke Recovery", "Chronic Pain", "Insomnia", "OCD", "Autism Spectrum",
  "Migraine", "Tinnitus", "Fibromyalgia", "Other",
];

const MODALITIES = ["TMS", "tDCS", "TPS", "PBM", "Neurofeedback"];

const STATUS_TONE: Record<string, "success" | "warning" | "neutral"> = {
  active: "success", on_hold: "warning", discharged: "neutral",
};

function statusLabel(s: string) {
  return s === "on_hold" ? "On Hold" : s.charAt(0).toUpperCase() + s.slice(1);
}

function age(dob: string | null): string {
  if (!dob) return "—";
  const diff = Date.now() - new Date(dob).getTime();
  return `${Math.floor(diff / 3.156e10)} yrs`;
}

const FIELD = "w-full rounded-xl border border-[var(--border)] bg-[var(--bg-strong)] px-3 py-2 text-sm text-[var(--text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] transition";

// ── Patient form modal ─────────────────────────────────────────────────────────

type FormData = {
  firstName: string; lastName: string; dob: string; email: string; phone: string;
  gender: string; primaryCondition: string; primaryModality: string;
  referringClinician: string; insuranceProvider: string; insuranceNumber: string;
  consentSigned: boolean; consentDate: string; status: string; notes: string;
  secondaryConditions: string[];
};

function emptyForm(): FormData {
  return {
    firstName: "", lastName: "", dob: "", email: "", phone: "", gender: "",
    primaryCondition: "", primaryModality: "", referringClinician: "",
    insuranceProvider: "", insuranceNumber: "", consentSigned: false,
    consentDate: "", status: "active", notes: "", secondaryConditions: [],
  };
}

function formFromPatient(p: Patient): FormData {
  return {
    firstName: p.firstName, lastName: p.lastName, dob: p.dob ?? "",
    email: p.email ?? "", phone: p.phone ?? "", gender: p.gender ?? "",
    primaryCondition: p.primaryCondition ?? "", primaryModality: p.primaryModality ?? "",
    referringClinician: p.referringClinician ?? "", insuranceProvider: p.insuranceProvider ?? "",
    insuranceNumber: p.insuranceNumber ?? "", consentSigned: p.consentSigned,
    consentDate: p.consentDate ?? "", status: p.status, notes: p.notes ?? "",
    secondaryConditions: p.secondaryConditions,
  };
}

function toApiPayload(f: FormData): Omit<Patient, "id" | "clinicianId" | "fullName" | "createdAt" | "updatedAt"> {
  return {
    firstName: f.firstName, lastName: f.lastName,
    dob: f.dob || null, email: f.email || null, phone: f.phone || null,
    gender: f.gender || null, primaryCondition: f.primaryCondition || null,
    secondaryConditions: f.secondaryConditions,
    primaryModality: f.primaryModality || null,
    referringClinician: f.referringClinician || null,
    insuranceProvider: f.insuranceProvider || null, insuranceNumber: f.insuranceNumber || null,
    consentSigned: f.consentSigned, consentDate: f.consentDate || null,
    status: f.status as Patient["status"], notes: f.notes || null,
  };
}

interface PatientFormProps {
  initial?: Patient;
  onSave: (data: Omit<Patient, "id" | "clinicianId" | "fullName" | "createdAt" | "updatedAt">) => Promise<void>;
  onClose: () => void;
}

function PatientForm({ initial, onSave, onClose }: PatientFormProps) {
  const [f, setF] = useState<FormData>(initial ? formFromPatient(initial) : emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(key: keyof FormData, val: unknown) {
    setF((prev) => ({ ...prev, [key]: val }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSave(toApiPayload(f));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)" }}>
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border)] shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
          <h2 className="font-semibold text-[var(--text)]">{initial ? "Edit Patient" : "New Patient"}</h2>
          <button type="button" onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text)] text-2xl leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 grid gap-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <label className="text-xs font-medium text-[var(--text-muted)]">First name *</label>
              <input className={FIELD} required value={f.firstName} onChange={e => set("firstName", e.target.value)} placeholder="Jane" />
            </div>
            <div className="grid gap-1.5">
              <label className="text-xs font-medium text-[var(--text-muted)]">Last name *</label>
              <input className={FIELD} required value={f.lastName} onChange={e => set("lastName", e.target.value)} placeholder="Smith" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="grid gap-1.5">
              <label className="text-xs font-medium text-[var(--text-muted)]">Date of birth</label>
              <input className={FIELD} type="date" value={f.dob} onChange={e => set("dob", e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <label className="text-xs font-medium text-[var(--text-muted)]">Gender</label>
              <select className={FIELD} value={f.gender} onChange={e => set("gender", e.target.value)}>
                <option value="">Select</option>
                {["Male","Female","Non-binary","Prefer not to say"].map(g => <option key={g}>{g}</option>)}
              </select>
            </div>
            <div className="grid gap-1.5">
              <label className="text-xs font-medium text-[var(--text-muted)]">Status</label>
              <select className={FIELD} value={f.status} onChange={e => set("status", e.target.value)}>
                <option value="active">Active</option>
                <option value="on_hold">On Hold</option>
                <option value="discharged">Discharged</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <label className="text-xs font-medium text-[var(--text-muted)]">Email</label>
              <input className={FIELD} type="email" value={f.email} onChange={e => set("email", e.target.value)} placeholder="patient@email.com" />
            </div>
            <div className="grid gap-1.5">
              <label className="text-xs font-medium text-[var(--text-muted)]">Phone</label>
              <input className={FIELD} type="tel" value={f.phone} onChange={e => set("phone", e.target.value)} placeholder="+44 7911 123456" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <label className="text-xs font-medium text-[var(--text-muted)]">Primary condition</label>
              <select className={FIELD} value={f.primaryCondition} onChange={e => set("primaryCondition", e.target.value)}>
                <option value="">Select</option>
                {CONDITIONS.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="grid gap-1.5">
              <label className="text-xs font-medium text-[var(--text-muted)]">Primary modality</label>
              <select className={FIELD} value={f.primaryModality} onChange={e => set("primaryModality", e.target.value)}>
                <option value="">Select</option>
                {MODALITIES.map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <label className="text-xs font-medium text-[var(--text-muted)]">Insurance provider</label>
              <input className={FIELD} value={f.insuranceProvider} onChange={e => set("insuranceProvider", e.target.value)} placeholder="Bupa, AXA…" />
            </div>
            <div className="grid gap-1.5">
              <label className="text-xs font-medium text-[var(--text-muted)]">Policy / member no.</label>
              <input className={FIELD} value={f.insuranceNumber} onChange={e => set("insuranceNumber", e.target.value)} />
            </div>
          </div>

          <div className="grid gap-1.5">
            <label className="text-xs font-medium text-[var(--text-muted)]">Referring clinician</label>
            <input className={FIELD} value={f.referringClinician} onChange={e => set("referringClinician", e.target.value)} placeholder="Dr. John Doe" />
          </div>

          <div className="flex items-center gap-3">
            <input type="checkbox" id="consent" checked={f.consentSigned} onChange={e => set("consentSigned", e.target.checked)} className="h-4 w-4 rounded" />
            <label htmlFor="consent" className="text-sm text-[var(--text)]">Consent signed</label>
            {f.consentSigned && (
              <input className={FIELD + " max-w-[180px]"} type="date" value={f.consentDate} onChange={e => set("consentDate", e.target.value)} />
            )}
          </div>

          <div className="grid gap-1.5">
            <label className="text-xs font-medium text-[var(--text-muted)]">Clinical notes</label>
            <textarea className={FIELD + " min-h-[80px]"} value={f.notes} onChange={e => set("notes", e.target.value)} placeholder="Background, referral reason, contraindications…" />
          </div>

          {error && (
            <p className="rounded-xl bg-[var(--danger-bg)] border border-[var(--danger-border)] px-4 py-2.5 text-sm text-[var(--danger-text)]">{error}</p>
          )}

          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-[var(--text-muted)] hover:text-[var(--text)] border border-[var(--border)] transition">Cancel</button>
            <button type="submit" disabled={saving} className="px-5 py-2 rounded-xl text-sm font-semibold bg-[var(--accent)] text-white hover:brightness-110 disabled:opacity-50 transition">
              {saving ? "Saving…" : "Save Patient"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function PatientsPage() {
  const navigate = useNavigate();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [modal, setModal] = useState<"add" | Patient | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      setPatients(await listPatients());
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load patients.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const filtered = patients.filter(p => {
    const q = search.toLowerCase();
    const matchSearch = !q || p.fullName.toLowerCase().includes(q) || (p.primaryCondition ?? "").toLowerCase().includes(q) || (p.email ?? "").toLowerCase().includes(q);
    const matchStatus = statusFilter === "all" || p.status === statusFilter;
    return matchSearch && matchStatus;
  });

  async function handleSave(data: Omit<Patient, "id" | "clinicianId" | "fullName" | "createdAt" | "updatedAt">) {
    if (modal !== "add" && modal !== null) {
      await updatePatient(modal.id, data);
    } else {
      await createPatient(data);
    }
    setModal(null);
    await load();
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this patient and all their records? This cannot be undone.")) return;
    setDeleting(id);
    try {
      await deletePatient(id);
      setPatients(prev => prev.filter(p => p.id !== id));
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="grid gap-6">
      <Breadcrumb items={[{ label: "Home", to: "/" }, { label: "Patients" }]} />
      <PageHeader
        icon="👥"
        eyebrow="Patient Management"
        title="Patient registry"
        description="Full patient CRM — manage demographics, conditions, consent, and treatment history."
      />

      <RoleGate minimumRole="clinician" title="Clinician access required" description="Patient management is restricted to clinician and admin roles.">
        {/* Toolbar */}
        <div className="flex flex-wrap gap-3 items-center">
          <input
            className="flex-1 min-w-[200px] rounded-xl border border-[var(--border)] bg-[var(--bg-strong)] px-4 py-2.5 text-sm text-[var(--text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] transition"
            placeholder="Search name, condition, email…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <select
            className="rounded-xl border border-[var(--border)] bg-[var(--bg-strong)] px-3 py-2.5 text-sm text-[var(--text)] outline-none"
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="on_hold">On Hold</option>
            <option value="discharged">Discharged</option>
          </select>
          <button
            onClick={() => setModal("add")}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-[var(--accent)] text-white hover:brightness-110 transition"
          >
            + New Patient
          </button>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total patients", value: patients.length, color: "var(--accent)" },
            { label: "Active", value: patients.filter(p => p.status === "active").length, color: "var(--success)" },
            { label: "On hold", value: patients.filter(p => p.status === "on_hold").length, color: "var(--warning)" },
            { label: "Discharged", value: patients.filter(p => p.status === "discharged").length, color: "var(--text-muted)" },
          ].map(stat => (
            <div key={stat.label} className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
              <p className="text-xs text-[var(--text-muted)] mb-1">{stat.label}</p>
              <p className="text-2xl font-bold" style={{ color: stat.color }}>{loading ? "—" : stat.value}</p>
            </div>
          ))}
        </div>

        {/* Content */}
        {loading ? (
          <div className="text-center py-16 text-[var(--text-muted)] text-sm">Loading patients…</div>
        ) : loadError ? (
          <div className="rounded-2xl border border-[var(--danger-border)] bg-[var(--danger-bg)] p-6 text-sm text-[var(--danger-text)]">{loadError}</div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-12 text-center text-sm text-[var(--text-muted)]">
            {patients.length === 0 ? (
              <div>
                <p className="text-2xl mb-3">👥</p>
                <p className="font-medium text-[var(--text)] mb-1">No patients yet</p>
                <p className="mb-4">Add your first patient to get started.</p>
                <button onClick={() => setModal("add")} className="px-4 py-2 rounded-xl text-sm font-semibold bg-[var(--accent)] text-white">+ Add Patient</button>
              </div>
            ) : "No patients match your search."}
          </div>
        ) : (
          <div className="rounded-2xl border border-[var(--border)] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[var(--bg-subtle)] border-b border-[var(--border)]">
                  {["Patient", "Age", "Condition", "Modality", "Status", "Consent", "Actions"].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => (
                  <tr key={p.id} className="border-b border-[var(--border)] hover:bg-[var(--bg-subtle)] transition bg-[var(--bg-elevated)]">
                    <td className="px-4 py-3">
                      <div className="font-medium text-[var(--text)]">{p.fullName}</div>
                      {p.email && <div className="text-xs text-[var(--text-muted)]">{p.email}</div>}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-muted)] whitespace-nowrap">{age(p.dob)}</td>
                    <td className="px-4 py-3 text-[var(--text)]">{p.primaryCondition ?? "—"}</td>
                    <td className="px-4 py-3">
                      {p.primaryModality ? <Badge>{p.primaryModality}</Badge> : <span className="text-[var(--text-muted)]">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={STATUS_TONE[p.status]}>{statusLabel(p.status)}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      {p.consentSigned
                        ? <span className="text-xs font-medium text-[var(--success)]">✓ Signed</span>
                        : <span className="text-xs font-medium text-[var(--warning)]">Pending</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1.5 flex-wrap">
                        <button onClick={() => navigate(`/assessment-builder?patient=${p.id}`)}
                          className="text-xs px-2.5 py-1 rounded-lg border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--accent)] hover:border-[var(--accent)] transition whitespace-nowrap">
                          Assess
                        </button>
                        <button onClick={() => navigate(`/sessions?patient=${p.id}`)}
                          className="text-xs px-2.5 py-1 rounded-lg border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--accent)] hover:border-[var(--accent)] transition whitespace-nowrap">
                          Sessions
                        </button>
                        <button onClick={() => setModal(p)}
                          className="text-xs px-2.5 py-1 rounded-lg border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] transition">
                          Edit
                        </button>
                        <button onClick={() => handleDelete(p.id)} disabled={deleting === p.id}
                          className="text-xs px-2.5 py-1 rounded-lg border border-transparent text-[var(--danger-text)] hover:border-[var(--danger-border)] transition disabled:opacity-50">
                          {deleting === p.id ? "…" : "Del"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </RoleGate>

      {modal !== null && (
        <PatientForm
          initial={modal !== "add" ? modal : undefined}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
