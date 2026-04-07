import { useEffect, useState } from "react";

import { useAppState } from "../app/useAppStore";
import { PackageGate } from "../components/domain/PackageGate";
import { RoleGate } from "../components/domain/RoleGate";
import { FEATURES } from "../lib/packages";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { InfoNotice } from "../components/ui/InfoNotice";
import { PageHeader } from "../components/ui/PageHeader";
import { SelectField } from "../components/ui/SelectField";
import { DRAFT_SUPPORT_ONLY, PROFESSIONAL_USE_ONLY } from "../content/disclaimers";
import { ApiError } from "../lib/api/client";
import { exportHandbookDocx, fetchEvidenceLibrary, generateHandbook } from "../lib/api/services";
import { HandbookGenerationResult, HandbookKindApi, Modality } from "../types/domain";

const handbookOptions: Array<{ label: string; value: HandbookKindApi }> = [
  { label: "Clinician handbook", value: "clinician_handbook" },
  { label: "Patient guide", value: "patient_guide" },
  { label: "Technician SOP", value: "technician_sop" },
];

export function HandbooksPage() {
  const { role } = useAppState();
  const [kind, setKind] = useState<HandbookKindApi>("clinician_handbook");
  const [condition, setCondition] = useState("");
  const [modality, setModality] = useState<Modality | "">("");
  const [conditionOptions, setConditionOptions] = useState<string[]>([]);
  const [modalityOptions, setModalityOptions] = useState<string[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [handbookDoc, setHandbookDoc] = useState<HandbookGenerationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isUnauthorized, setIsUnauthorized] = useState(false);
  const [exportingDocx, setExportingDocx] = useState(false);

  // Fetch condition and modality options from evidence API on mount
  useEffect(() => {
    let cancelled = false;
    setOptionsLoading(true);

    void fetchEvidenceLibrary()
      .then(({ items }) => {
        if (cancelled) return;

        const conditions = [...new Set(items.map((item) => item.condition))].filter(Boolean);
        const modalities = [...new Set(items.map((item) => item.modality))].filter(Boolean);

        const finalConditions = conditions.length > 0 ? conditions : ["Parkinson's disease", "ADHD", "Depression"];
        const finalModalities = modalities.length > 0 ? modalities : ["TPS", "TMS", "Neurofeedback", "PBM"];

        setConditionOptions(finalConditions);
        setModalityOptions(finalModalities);
        setCondition((prev) => (prev === "" ? finalConditions[0] ?? "" : prev));
        setModality((prev) => (prev === "" ? (finalModalities[0] as Modality) ?? "" : prev));
        setOptionsLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        // Fall back to static options on error
        const fallbackConditions = ["Parkinson's disease", "ADHD", "Depression"];
        const fallbackModalities: Modality[] = ["TPS", "TMS", "Neurofeedback", "PBM"];
        setConditionOptions(fallbackConditions);
        setModalityOptions(fallbackModalities);
        setCondition(fallbackConditions[0]);
        setModality(fallbackModalities[0]);
        setOptionsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadHandbook() {
      if (role === "guest" || !condition || !modality) {
        setHandbookDoc(null);
        setError(null);
        setIsUnauthorized(false);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      setIsUnauthorized(false);

      try {
        const response = await generateHandbook({
          role,
          handbookKind: kind,
          condition,
          modality: modality as Modality,
        });
        if (cancelled) {
          return;
        }
        setHandbookDoc(response);
      } catch (caught) {
        if (cancelled) {
          return;
        }
        if (caught instanceof ApiError) {
          setError(caught.message);
          setIsUnauthorized(caught.status === 401 || caught.status === 403);
        } else {
          setError("Handbook preview could not be generated.");
        }
        setHandbookDoc(null);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadHandbook();
    return () => {
      cancelled = true;
    };
  }, [role, kind, condition, modality]);

  const selectedLabel = handbookOptions.find((option) => option.value === kind)?.label ?? "Document";

  async function handleExportDocx() {
    setExportingDocx(true);
    try {
      const blob = await exportHandbookDocx(
        { condition_name: condition, modality_name: modality, device_name: "" },
        role,
      );
      const url = URL.createObjectURL(blob);
      const anchor = window.document.createElement("a");
      anchor.href = url;
      anchor.download = `handbook_${condition}_${modality}.docx`.replace(/[^a-zA-Z0-9._-]/g, "_");
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      // silently ignore export errors — the preview is still visible
    } finally {
      setExportingDocx(false);
    }
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        icon="📄"
        eyebrow="Handbook Generator"
        title="Deterministic document generator"
        description="Generate clinician handbooks, patient guides, and technician SOPs from backend registry structures and preview them in a document-style layout."
      />
      <RoleGate
        minimumRole="clinician"
        title="Verified clinician access required"
        description="Document generation previews are available to clinician and admin simulation roles."
      >
        <PackageGate anyOf={[FEATURES.HANDBOOK_GENERATE_FULL, FEATURES.HANDBOOK_GENERATE_LIMITED]}>
        <InfoNotice
          title="Document generation notice"
          body={`${PROFESSIONAL_USE_ONLY} ${DRAFT_SUPPORT_ONLY} These previews are backend-generated deterministic outputs. Export actions remain visual only in the MVP.`}
        />
        <Card>
          <div className="grid gap-4 md:grid-cols-3">
            <SelectField label="Document type" value={kind} onChange={(value) => setKind(value as HandbookKindApi)}>
              {handbookOptions.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </SelectField>
            <SelectField label="Condition" value={condition} onChange={setCondition} disabled={optionsLoading}>
              {optionsLoading
                ? <option value="">Loading…</option>
                : conditionOptions.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
            </SelectField>
            <SelectField label="Modality" value={modality} onChange={(value) => setModality(value as Modality)} disabled={optionsLoading}>
              {optionsLoading
                ? <option value="">Loading…</option>
                : modalityOptions.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
            </SelectField>
          </div>
        </Card>

        <Card className="bg-[var(--bg-strong)]">
          {loading ? (
            <p className="text-sm leading-6 text-[var(--text-muted)]">Generating document preview from the backend.</p>
          ) : error ? (
            <InfoNotice
              title={isUnauthorized ? "Protected workflow" : "Document preview unavailable"}
              body={error}
              tone="warning"
            />
          ) : handbookDoc ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] pb-4">
                <div>
                  <Badge tone="accent">{selectedLabel}</Badge>
                  <h2 className="mt-3 font-display text-3xl text-[var(--text)]">
                    {selectedLabel} preview / {condition} / {modality}
                  </h2>
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" disabled>
                    Export PDF
                  </Button>
                  <Button variant="secondary" onClick={() => void handleExportDocx()} disabled={exportingDocx}>
                    {exportingDocx ? "Exporting…" : "Export DOCX"}
                  </Button>
                </div>
              </div>
              <div className="mt-6 grid gap-6">
                <DocSection title="Overview" items={[handbookDoc.document.overview]} />
                <DocSection title="Eligibility" items={handbookDoc.document.eligibility} />
                <DocSection title="Setup" items={handbookDoc.document.setup} />
                <DocSection title="Session workflow" items={handbookDoc.document.sessionWorkflow} />
                <DocSection title="Safety" items={handbookDoc.document.safety} />
                <DocSection title="Troubleshooting" items={handbookDoc.document.troubleshooting} />
                <DocSection title="Escalation" items={handbookDoc.document.escalation} />
                <DocSection title="References" items={handbookDoc.document.references} />
              </div>
            </>
          ) : null}
        </Card>
        </PackageGate>
      </RoleGate>
    </div>
  );
}

function DocSection({ title, items }: { title: string; items: string[] }) {
  return (
    <section>
      <h3 className="font-display text-xl text-[var(--text)]">{title}</h3>
      <ul className="mt-3 grid gap-2 text-sm leading-6 text-[var(--text-muted)]">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}
