import { useEffect, useState } from "react";

import { useAppState } from "../app/useAppStore";
import { PackageGate } from "../components/domain/PackageGate";
import { Badge } from "../components/ui/Badge";
import { Breadcrumb } from "../components/ui/Breadcrumb";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { ContraindicationWarning } from "../components/ui/ContraindicationWarning";
import { EvidenceGradeBadge } from "../components/ui/EvidenceGradeBadge";
import { InfoNotice } from "../components/ui/InfoNotice";
import { PageHeader } from "../components/ui/PageHeader";
import { SelectField } from "../components/ui/SelectField";
import { DRAFT_SUPPORT_ONLY, OFF_LABEL_REVIEW_REQUIRED, PROFESSIONAL_USE_ONLY } from "../content/disclaimers";
import { protocolGeneratorOptions } from "../data/mockData";
import { ApiError } from "../lib/api/client";
import { FEATURES } from "../lib/packages";
import { generateProtocolDraft } from "../lib/api/services";
import { ProtocolDraft } from "../types/domain";

const deviceOptions = ["NEUROLITH", "PulseArc Clinical", "FocusLoop Hybrid", "LumaBand Home"] as const;

export function ProtocolsPage() {
  const { role } = useAppState();
  const [condition, setCondition] = useState(protocolGeneratorOptions.conditions[0]);
  const [symptomCluster, setSymptomCluster] = useState(protocolGeneratorOptions.symptomClusters[0]);
  const [modality, setModality] = useState(protocolGeneratorOptions.modalities[0]);
  const [device, setDevice] = useState<(typeof deviceOptions)[number]>(deviceOptions[0]);
  const [setting, setSetting] = useState(protocolGeneratorOptions.settings[0]);
  const [threshold, setThreshold] = useState(protocolGeneratorOptions.evidenceThresholds[1]);
  const [offLabel, setOffLabel] = useState(false);
  const [output, setOutput] = useState<ProtocolDraft | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [isUnauthorized, setIsUnauthorized] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const canUseOffLabel = role !== "guest";

  useEffect(() => {
    if (!canUseOffLabel && offLabel) {
      setOffLabel(false);
    }
  }, [canUseOffLabel, offLabel]);

  useEffect(() => {
    let cancelled = false;

    async function loadDraft() {
      setLoading(true);
      setError(null);
      setWarnings([]);
      setIsUnauthorized(false);

      try {
        const response = await generateProtocolDraft({
          role,
          condition,
          symptomCluster,
          modality,
          device,
          setting,
          evidenceThreshold: threshold,
          offLabel,
        });
        if (cancelled) {
          return;
        }
        setOutput(response);
      } catch (caught) {
        if (cancelled) {
          return;
        }
        if (caught instanceof ApiError) {
          setError(caught.message);
          setWarnings(caught.warnings);
          setIsUnauthorized(caught.status === 401 || caught.status === 403);
        } else {
          setError("Protocol draft could not be generated.");
        }
        setOutput(null);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadDraft();
    return () => {
      cancelled = true;
    };
  }, [role, condition, symptomCluster, modality, device, setting, threshold, offLabel, reloadKey]);

  return (
    <div className="grid gap-6">
      <Breadcrumb items={[{ label: "Home", to: "/" }, { label: "Protocol Generator" }]} />
      <PageHeader
        eyebrow="Protocol Generator"
        title="Deterministic protocol drafting"
        description="Generate structured protocol guidance from registry-driven backend rules with no AI or LLM composition."
        badge="Same input, same output"
      />
      <PackageGate anyOf={[FEATURES.PROTOCOL_GENERATE, FEATURES.PROTOCOL_GENERATE_LIMITED]}>
      <InfoNotice
        title="Deterministic generation notice"
        body={`${PROFESSIONAL_USE_ONLY} Protocol outputs are derived from backend registry rules only. The generator remains deterministic and does not use AI composition.`}
      />
      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <div className="grid gap-4 md:grid-cols-2">
            <SelectField label="Condition" value={condition} onChange={(value) => setCondition(value as typeof condition)}>
              {protocolGeneratorOptions.conditions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </SelectField>
            <SelectField label="Symptom cluster" value={symptomCluster} onChange={(value) => setSymptomCluster(value as typeof symptomCluster)}>
              {protocolGeneratorOptions.symptomClusters.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </SelectField>
            <SelectField label="Modality" value={modality} onChange={(value) => setModality(value as typeof modality)}>
              {protocolGeneratorOptions.modalities.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </SelectField>
            <SelectField label="Device" value={device} onChange={(value) => setDevice(value as (typeof deviceOptions)[number])}>
              {deviceOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </SelectField>
            <SelectField label="Setting" value={setting} onChange={(value) => setSetting(value as typeof setting)}>
              {protocolGeneratorOptions.settings.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </SelectField>
            <SelectField label="Evidence threshold" value={threshold} onChange={(value) => setThreshold(value as typeof threshold)}>
              {protocolGeneratorOptions.evidenceThresholds.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </SelectField>
          </div>
          <div className="mt-4 rounded-3xl border border-[var(--border)] bg-[var(--bg-strong)] p-4">
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                className="mt-1 h-5 w-5"
                checked={offLabel}
                disabled={!canUseOffLabel}
                onChange={(event) => setOffLabel(event.target.checked)}
              />
              <span className="text-sm leading-6 text-[var(--text-muted)]">
                Clinician-only off-label mode
                {!canUseOffLabel ? " is unavailable for Guest users." : " enables draft-support language and independent clinical review warnings."}
              </span>
            </label>
          </div>
          {offLabel ? (
            <div className="mt-4">
              <InfoNotice
                title="Off-label draft warning"
                body={`${DRAFT_SUPPORT_ONLY} ${OFF_LABEL_REVIEW_REQUIRED} This output must not be presented as approved-use guidance.`}
                tone="warning"
              >
                <label className="mt-3 flex gap-3 text-sm">
                  <input type="checkbox" className="mt-1 h-5 w-5" checked readOnly />
                  <span>Clinician review acknowledgement is required for this draft preview.</span>
                </label>
              </InfoNotice>
            </div>
          ) : null}
        </Card>

        <Card>
          {loading ? (
            <p className="text-sm leading-6 text-[var(--text-muted)]">Generating deterministic protocol draft from the API.</p>
          ) : error ? (
            <div className="grid gap-4">
              <InfoNotice
                title={isUnauthorized ? "Protected workflow" : "Protocol draft unavailable"}
                body={error}
                tone="warning"
              />
              {warnings.length > 0 ? <PreviewBlock title="Review notes" items={warnings} /> : null}
              <Button onClick={() => setReloadKey((current) => current + 1)}>Retry draft</Button>
            </div>
          ) : output ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={output.approvalStatusBadge === "approved use" ? "success" : output.approvalStatusBadge === "off-label" ? "warning" : "accent"}>
                  {output.approvalStatusBadge}
                </Badge>
                <EvidenceGradeBadge grade={output.evidenceGrade} size="lg" />
              </div>
              <h2 className="mt-4 font-display text-3xl text-[var(--text)]">Generated protocol preview</h2>
              <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">{output.rationale}</p>
              {output.offLabelReviewRequired ? (
                <div className="mt-4 rounded-2xl border-2 border-amber-400/50 bg-amber-500/12 px-5 py-4">
                  <div className="flex items-center gap-2 mb-2">
                    <svg aria-hidden="true" className="h-5 w-5 flex-shrink-0 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                    </svg>
                    <span className="text-sm font-bold text-amber-300">Off-label use — Independent clinical review required</span>
                  </div>
                  <p className="text-sm leading-6 text-amber-200">
                    {output.disclaimers.draftSupportOnly ?? DRAFT_SUPPORT_ONLY}{" "}
                    {output.disclaimers.offLabelReviewRequired ?? OFF_LABEL_REVIEW_REQUIRED}
                  </p>
                </div>
              ) : null}
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <PreviewBlock title="Target region" items={[output.targetRegion]} />
                <PreviewBlock title="Session frequency" items={[output.sessionFrequency, output.duration]} />
                <PreviewBlock title="Escalation logic" items={output.escalationLogic} />
                <PreviewBlock title="Monitoring plan" items={output.monitoringPlan} />
                <ContraindicationWarning items={output.contraindications} />
                <PreviewBlock title="Patient communication notes" items={output.patientCommunicationNotes} />
              </div>
            </>
          ) : null}
        </Card>
      </div>
      </PackageGate>
    </div>
  );
}

function PreviewBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="rounded-3xl border border-[var(--border)] bg-[var(--bg-strong)] p-4">
      <h3 className="font-display text-lg text-[var(--text)]">{title}</h3>
      <ul className="mt-3 grid gap-2 text-sm leading-6 text-[var(--text-muted)]">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}
