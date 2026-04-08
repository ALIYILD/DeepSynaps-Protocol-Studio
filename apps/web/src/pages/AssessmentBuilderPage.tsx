import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { PackageGate } from "../components/domain/PackageGate";
import { RoleGate } from "../components/domain/RoleGate";
import { FEATURES } from "../lib/packages";
import { Badge } from "../components/ui/Badge";
import { Breadcrumb } from "../components/ui/Breadcrumb";
import { Card } from "../components/ui/Card";
import { InfoNotice } from "../components/ui/InfoNotice";
import { PageHeader } from "../components/ui/PageHeader";
import { SelectField } from "../components/ui/SelectField";
import {
  listPatients,
  saveAssessmentToServer,
  updateAssessmentRecord,
  listAssessments,
  listAssessmentTemplates,
  AssessmentTemplate,
} from "../lib/api/services";
import { Patient, AssessmentRecord } from "../types/domain";

type DraftState = Record<string, string | boolean>;

export function AssessmentBuilderPage() {
  const [searchParams] = useSearchParams();
  const preselectedPatientId = searchParams.get("patient");

  const [templates, setTemplates] = useState<AssessmentTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [templateId, setTemplateId] = useState("");
  const [draft, setDraft] = useState<DraftState>({});
  const [clinicianNotes, setClinicianNotes] = useState("");
  const [selectedPatientId, setSelectedPatientId] = useState<string>(preselectedPatientId ?? "");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [saving, setSaving] = useState(false);
  const [savedRecord, setSavedRecord] = useState<AssessmentRecord | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saveMode, setSaveMode] = useState<"server" | "local">("server");
  const [patientHistory, setPatientHistory] = useState<AssessmentRecord[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const template = useMemo(
    () => templates.find((item) => item.id === templateId) ?? templates[0],
    [templateId, templates],
  );

  // Load assessment templates from API on mount
  useEffect(() => {
    listAssessmentTemplates()
      .then((data) => {
        setTemplates(data);
        setTemplateId(data[0]?.id ?? "");
      })
      .catch(() => setTemplates([]))
      .finally(() => setTemplatesLoading(false));
  }, []);

  // Load patients for selector
  useEffect(() => {
    listPatients()
      .then(setPatients)
      .catch(() => setPatients([]));
  }, []);

  // Load patient assessment history when patient selected
  useEffect(() => {
    if (!selectedPatientId) { setPatientHistory([]); return; }
    listAssessments(selectedPatientId)
      .then(setPatientHistory)
      .catch(() => setPatientHistory([]));
  }, [selectedPatientId]);

  // Pre-populate draft from server record or localStorage on template change
  function handleTemplateChange(newId: string) {
    setTemplateId(newId);
    setSavedRecord(null);
    setSavedAt(null);
    // Try localStorage fallback
    const key = `assessment_draft_${newId}`;
    const raw = localStorage.getItem(key);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as { data: DraftState; savedAt: string };
        setDraft(parsed.data);
        setSavedAt(parsed.savedAt);
      } catch { setDraft({}); }
    } else {
      setDraft({});
    }
  }

  function updateField(fieldId: string, value: string | boolean) {
    setDraft((cur) => ({ ...cur, [fieldId]: value }));
  }

  function formatSavedAt(iso: string): string {
    try {
      return new Intl.DateTimeFormat(undefined, { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
    } catch { return iso; }
  }

  async function handleSave(status: "draft" | "completed" = "draft") {
    setSaving(true);
    setServerError(null);
    try {
      if (saveMode === "server") {
        const data = draft as Record<string, unknown>;
        if (savedRecord) {
          const updated = await updateAssessmentRecord(savedRecord.id, {
            formData: data,
            clinicianNotes: clinicianNotes || undefined,
            status,
            patientId: selectedPatientId || undefined,
          });
          setSavedRecord(updated);
          setSavedAt(updated.updatedAt);
        } else {
          const created = await saveAssessmentToServer({
            templateId,
            templateTitle: template.title,
            patientId: selectedPatientId || undefined,
            formData: data,
            clinicianNotes: clinicianNotes || undefined,
            status,
          });
          setSavedRecord(created);
          setSavedAt(created.createdAt);
        }
        // Also save to localStorage as backup
        localStorage.setItem(`assessment_draft_${templateId}`, JSON.stringify({ data: draft, savedAt: new Date().toISOString() }));
      } else {
        localStorage.setItem(`assessment_draft_${templateId}`, JSON.stringify({ data: draft, savedAt: new Date().toISOString() }));
        setSavedAt(new Date().toISOString());
      }
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Save failed.");
      // Fall back to local
      localStorage.setItem(`assessment_draft_${templateId}`, JSON.stringify({ data: draft, savedAt: new Date().toISOString() }));
      setSavedAt(new Date().toISOString());
    } finally {
      setSaving(false);
    }
  }

  const commonClasses =
    "w-full rounded-2xl border border-[var(--border)] bg-transparent px-4 py-3 text-[var(--text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-1";

  return (
    <div className="grid gap-6">
      <Breadcrumb items={[{ label: "Home", to: "/" }, { label: "Assessment Builder" }]} />
      <PageHeader
        icon="📋"
        eyebrow="Assessment Builder"
        title="Structured clinical assessments"
        description="Complete validated assessment tools and save results against patients. All assessments are stored securely server-side."
      />
      <RoleGate minimumRole="clinician" title="Verified clinician access required" description="Assessment drafting is reserved for clinician and admin roles.">
        <PackageGate anyOf={[FEATURES.ASSESSMENT_BUILDER_FULL, FEATURES.ASSESSMENT_BUILDER_LIMITED]}>

          {templatesLoading ? (
            <div className="flex items-center justify-center py-12 text-sm text-[var(--text-muted)]">
              Loading templates…
            </div>
          ) : templates.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-sm text-[var(--text-muted)]">
              No assessment templates available.
            </div>
          ) : (
          <>
          {/* Template + Patient selector */}
          <Card>
            <div className="grid gap-4 md:grid-cols-3">
              <SelectField label="Assessment template" value={templateId} onChange={handleTemplateChange}>
                {templates.map((item) => (
                  <option key={item.id} value={item.id}>{item.title}</option>
                ))}
              </SelectField>

              <div className="grid gap-1.5">
                <label className="text-sm font-medium text-[var(--text)]">Patient (optional)</label>
                <select
                  className="w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-strong)] px-4 py-2.5 text-sm text-[var(--text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] transition"
                  value={selectedPatientId}
                  onChange={e => setSelectedPatientId(e.target.value)}
                >
                  <option value="">No patient linked</option>
                  {patients.map(p => (
                    <option key={p.id} value={p.id}>{p.fullName} — {p.primaryCondition ?? "No condition"}</option>
                  ))}
                </select>
              </div>

              <div className="grid gap-1.5">
                <label className="text-sm font-medium text-[var(--text)]">Save mode</label>
                <div className="flex rounded-2xl border border-[var(--border)] bg-[var(--bg-subtle)] p-1">
                  {(["server", "local"] as const).map(mode => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setSaveMode(mode)}
                      className={`flex-1 rounded-xl py-2 text-xs font-medium transition ${saveMode === mode ? "bg-[var(--bg-strong)] text-[var(--text)] shadow-sm" : "text-[var(--text-muted)] hover:text-[var(--text)]"}`}
                    >
                      {mode === "server" ? "Server (persistent)" : "Local only"}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-strong)] p-4">
              <p className="text-sm text-[var(--text-muted)]">{template.description}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {template.sections.map(section => (
                  <Badge key={section.title}>{section.title}</Badge>
                ))}
              </div>
            </div>
          </Card>

          {/* Patient history sidebar */}
          {selectedPatientId && patientHistory.length > 0 && (
            <Card>
              <button
                type="button"
                onClick={() => setShowHistory(h => !h)}
                className="flex items-center gap-2 text-sm font-medium text-[var(--text)] w-full text-left"
              >
                <span>📁</span>
                Prior assessments for this patient ({patientHistory.length})
                <span className="ml-auto text-[var(--text-muted)]">{showHistory ? "▲" : "▼"}</span>
              </button>
              {showHistory && (
                <div className="mt-3 grid gap-2">
                  {patientHistory.map(rec => (
                    <div key={rec.id} className="flex items-center gap-3 p-3 rounded-xl border border-[var(--border)] bg-[var(--bg-strong)]">
                      <div className="flex-1">
                        <div className="text-sm font-medium text-[var(--text)]">{rec.templateTitle}</div>
                        <div className="text-xs text-[var(--text-muted)]">{formatSavedAt(rec.updatedAt)}</div>
                      </div>
                      <Badge tone={rec.status === "completed" ? "success" : "neutral"}>{rec.status}</Badge>
                      {rec.score && <Badge>{rec.score}</Badge>}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {saveMode === "local" && (
            <InfoNotice
              title="Local save only"
              body="Drafts saved to browser localStorage only — not linked to patient records. Switch to Server mode to persist securely."
            />
          )}

          {/* Form */}
          <Card>
            <form className="grid gap-6" onSubmit={e => e.preventDefault()}>
              {template.sections.map(section => (
                <section key={section.title} className="grid gap-4 rounded-3xl border border-[var(--border)] bg-[var(--bg-strong)] p-4">
                  <h2 className="font-display text-xl text-[var(--text)]">{section.title}</h2>
                  <div className="grid gap-4 md:grid-cols-2">
                    {section.fields.map(field => {
                      const value = draft[field.id];
                      return (
                        <label key={field.id} className={`grid gap-2 text-sm ${field.type === "textarea" ? "md:col-span-2" : ""}`}>
                          <span className="font-medium text-[var(--text)]">
                            {field.label} {field.required && <span className="text-[var(--accent)]">*</span>}
                          </span>
                          {field.type === "textarea" ? (
                            <textarea className={`${commonClasses} min-h-28`} value={typeof value === "string" ? value : ""} aria-required={field.required ? "true" : undefined} onChange={e => updateField(field.id, e.target.value)} />
                          ) : field.type === "select" ? (
                            <select className={commonClasses} value={typeof value === "string" ? value : ""} aria-required={field.required ? "true" : undefined} onChange={e => updateField(field.id, e.target.value)}>
                              <option value="">Select</option>
                              {field.options?.map(opt => <option key={opt}>{opt}</option>)}
                            </select>
                          ) : field.type === "checkbox" ? (
                            <input className="h-5 w-5 rounded border-[var(--border)]" type="checkbox" checked={value === true} aria-required={field.required ? "true" : undefined} onChange={e => updateField(field.id, e.target.checked)} />
                          ) : (
                            <input className={commonClasses} type={field.type === "number" ? "number" : "text"} value={typeof value === "string" ? value : ""} aria-required={field.required ? "true" : undefined} onChange={e => updateField(field.id, e.target.value)} />
                          )}
                          <span className="text-[var(--text-muted)]">{field.helpText}</span>
                        </label>
                      );
                    })}
                  </div>
                </section>
              ))}

              {/* Clinician notes */}
              <section className="grid gap-3 rounded-3xl border border-[var(--border)] bg-[var(--bg-strong)] p-4">
                <h2 className="font-display text-xl text-[var(--text)]">Clinician notes</h2>
                <textarea
                  className={`${commonClasses} min-h-24`}
                  placeholder="Observations, context, treatment recommendations…"
                  value={clinicianNotes}
                  onChange={e => setClinicianNotes(e.target.value)}
                />
              </section>

              {serverError && (
                <div className="rounded-xl bg-[var(--danger-bg)] border border-[var(--danger-border)] px-4 py-2.5 text-sm text-[var(--danger-text)]">
                  Server save failed — {serverError}. A local backup was saved.
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-wrap items-center gap-3">
                <button
                  className="inline-flex items-center justify-center rounded-xl bg-[var(--accent)] px-4 py-2.5 font-medium text-white transition hover:brightness-110 disabled:opacity-50"
                  onClick={() => handleSave("draft")}
                  disabled={saving}
                  type="button"
                >
                  {saving ? "Saving…" : "Save Draft"}
                </button>
                <button
                  className="inline-flex items-center justify-center rounded-xl border border-[var(--accent)] text-[var(--accent)] px-4 py-2.5 font-medium transition hover:bg-[var(--accent-soft)] disabled:opacity-50"
                  onClick={() => handleSave("completed")}
                  disabled={saving}
                  type="button"
                >
                  Mark Complete
                </button>
                {savedAt && (
                  <Badge tone={savedRecord ? "success" : "neutral"}>
                    {savedRecord ? `Saved to server — ${formatSavedAt(savedAt)}` : `Local backup — ${formatSavedAt(savedAt)}`}
                  </Badge>
                )}
                {savedRecord?.patientId && (
                  <Badge tone="info">Linked to patient</Badge>
                )}
              </div>
            </form>
          </Card>
          </>
          )}
        </PackageGate>
      </RoleGate>
    </div>
  );
}
