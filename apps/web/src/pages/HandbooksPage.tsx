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
import { exportHandbookDocx, generateHandbook } from "../lib/api/services";
import { HandbookGenerationResult, HandbookKindApi, Modality } from "../types/domain";

const handbookOptions: Array<{ label: string; value: HandbookKindApi }> = [
  { label: "Clinician handbook", value: "clinician_handbook" },
  { label: "Patient guide", value: "patient_guide" },
  { label: "Technician SOP", value: "technician_sop" },
];

export function HandbooksPage() {
  const { role } = useAppState();
  const [kind, setKind] = useState<HandbookKindApi>("clinician_handbook");
  const [condition, setCondition] = useState("Parkinson's disease");
  const [modality, setModality] = useState<Modality>("TPS");
  const [document, setDocument] = useState<HandbookGenerationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isUnauthorized, setIsUnauthorized] = useState(false);
  const [exportingDocx, setExportingDocx] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadHandbook() {
      if (role === "guest") {
        setDocument(null);
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
          modality,
        });
        if (cancelled) {
          return;
        }
        setDocument(response);
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
        setDocument(null);
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
      const anchor = document.createElement("a");
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
            <SelectField label="Condition" value={condition} onChange={setCondition}>
              {["Parkinson's disease", "ADHD", "Depression"].map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </SelectField>
            <SelectField label="Modality" value={modality} onChange={(value) => setModality(value as Modality)}>
              {["TPS", "TMS", "Neurofeedback", "PBM"].map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
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
          ) : document ? (
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
                <DocSection title="Overview" items={[document.document.overview]} />
                <DocSection title="Eligibility" items={document.document.eligibility} />
                <DocSection title="Setup" items={document.document.setup} />
                <DocSection title="Session workflow" items={document.document.sessionWorkflow} />
                <DocSection title="Safety" items={document.document.safety} />
                <DocSection title="Troubleshooting" items={document.document.troubleshooting} />
                <DocSection title="Escalation" items={document.document.escalation} />
                <DocSection title="References" items={document.document.references} />
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
