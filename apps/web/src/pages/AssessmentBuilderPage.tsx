import { useMemo, useState } from "react";

import { RoleGate } from "../components/domain/RoleGate";
import { Badge } from "../components/ui/Badge";
import { Card } from "../components/ui/Card";
import { InfoNotice } from "../components/ui/InfoNotice";
import { PageHeader } from "../components/ui/PageHeader";
import { SelectField } from "../components/ui/SelectField";
import { assessmentTemplates } from "../data/mockData";

type DraftState = Record<string, string | boolean>;

export function AssessmentBuilderPage() {
  const [templateId, setTemplateId] = useState(assessmentTemplates[0].id);
  const [draft, setDraft] = useState<DraftState>({});
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const template = useMemo(
    () => assessmentTemplates.find((item) => item.id === templateId) ?? assessmentTemplates[0],
    [templateId],
  );

  function updateField(fieldId: string, value: string | boolean) {
    setDraft((current) => ({ ...current, [fieldId]: value }));
  }

  function saveDraft() {
    setSavedAt("Draft stored in memory for the current session");
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow="Assessment Builder"
        title="Structured assessment drafting"
        description="Select a template, complete a realistic clinician-facing form, and keep the draft in memory only for the current session."
      />
      <RoleGate
        minimumRole="clinician"
        title="Verified clinician access required"
        description="Assessment drafting is reserved for clinician and admin simulation roles in the MVP."
      >
        <InfoNotice
          title="In-memory draft notice"
          body="Drafts are kept only in active app state. Nothing is written to local storage or permanent backend storage in this MVP."
        />
        <Card>
          <div className="grid gap-4 md:grid-cols-[280px_1fr]">
            <SelectField label="Template" value={templateId} onChange={setTemplateId}>
              {assessmentTemplates.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </SelectField>
            <div className="rounded-3xl border border-[var(--border)] bg-[var(--bg-strong)] p-4">
              <p className="text-sm text-[var(--text-muted)]">{template.description}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {template.sections.map((section) => (
                  <Badge key={section.id}>{section.title}</Badge>
                ))}
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <form className="grid gap-6" onSubmit={(event) => event.preventDefault()}>
            {template.sections.map((section) => (
              <section key={section.id} className="grid gap-4 rounded-3xl border border-[var(--border)] bg-[var(--bg-strong)] p-4">
                <h2 className="font-display text-xl text-[var(--text)]">{section.title}</h2>
                <div className="grid gap-4 md:grid-cols-2">
                  {section.fields.map((field) => {
                    const value = draft[field.id];
                    const commonClasses =
                      "w-full rounded-2xl border border-[var(--border)] bg-transparent px-4 py-3 text-[var(--text)] outline-none";
                    return (
                      <label key={field.id} className={`grid gap-2 text-sm ${field.type === "textarea" ? "md:col-span-2" : ""}`}>
                        <span className="font-medium text-[var(--text)]">
                          {field.label} {field.required ? <span className="text-[var(--accent)]">*</span> : null}
                        </span>
                        {field.type === "textarea" ? (
                          <textarea
                            className={`${commonClasses} min-h-28`}
                            value={typeof value === "string" ? value : ""}
                            onChange={(event) => updateField(field.id, event.target.value)}
                          />
                        ) : field.type === "select" ? (
                          <select
                            className={commonClasses}
                            value={typeof value === "string" ? value : ""}
                            onChange={(event) => updateField(field.id, event.target.value)}
                          >
                            <option value="">Select</option>
                            {field.options?.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        ) : field.type === "checkbox" ? (
                          <input
                            className="h-5 w-5 rounded border-[var(--border)]"
                            type="checkbox"
                            checked={value === true}
                            onChange={(event) => updateField(field.id, event.target.checked)}
                          />
                        ) : (
                          <input
                            className={commonClasses}
                            type={field.type === "number" ? "number" : "text"}
                            value={typeof value === "string" ? value : ""}
                            onChange={(event) => updateField(field.id, event.target.value)}
                          />
                        )}
                        <span className="text-[var(--text-muted)]">{field.helpText}</span>
                      </label>
                    );
                  })}
                </div>
              </section>
            ))}

            <div className="flex flex-wrap items-center gap-3">
              <button
                className="inline-flex items-center justify-center rounded-xl bg-[var(--accent)] px-4 py-2.5 font-medium text-white transition hover:brightness-110"
                onClick={saveDraft}
                type="button"
              >
                Save draft
              </button>
              {savedAt ? <Badge tone="success">{savedAt}</Badge> : null}
            </div>
          </form>
        </Card>
      </RoleGate>
    </div>
  );
}
