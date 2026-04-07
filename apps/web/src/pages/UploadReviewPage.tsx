import { useEffect, useState } from "react";

import { useAppState } from "../app/useAppStore";
import { PackageGate } from "../components/domain/PackageGate";
import { RoleGate } from "../components/domain/RoleGate";
import { FEATURES } from "../lib/packages";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { InfoNotice } from "../components/ui/InfoNotice";
import { PageHeader } from "../components/ui/PageHeader";
import { DRAFT_SUPPORT_ONLY, OFF_LABEL_REVIEW_REQUIRED, PROFESSIONAL_USE_ONLY } from "../content/disclaimers";
import { stagedUploadExamples } from "../data/mockData";
import { ApiError } from "../lib/api/client";
import { generateCaseSummary, submitReviewAction } from "../lib/api/services";
import { CaseSummary, UploadedAsset } from "../types/domain";

export function UploadReviewPage() {
  const { role } = useAppState();
  const [uploads, setUploads] = useState<UploadedAsset[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [summary, setSummary] = useState<CaseSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [reviewStatus, setReviewStatus] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadSummary() {
      if (role === "guest") {
        setSummary(null);
        setError(null);
        setWarnings([]);
        setReviewStatus(null);
        setLoading(false);
        return;
      }

      if (uploads.length === 0) {
        setSummary(null);
        setError(null);
        setWarnings([]);
        return;
      }

      setLoading(true);
      setError(null);
      setWarnings([]);

      try {
        const response = await generateCaseSummary({
          role,
          uploads: uploads.map((upload) => ({
            type: upload.type,
            fileName: upload.fileName,
            summary: upload.summary,
          })),
        });
        if (cancelled) {
          return;
        }
        setSummary(response);
      } catch (caught) {
        if (cancelled) {
          return;
        }
        if (caught instanceof ApiError) {
          setError(caught.message);
          setWarnings(caught.warnings);
        } else {
          setError("Case summary could not be generated.");
        }
        setSummary(null);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadSummary();
    return () => {
      cancelled = true;
    };
  }, [role, uploads]);

  function stageUpload(upload: UploadedAsset) {
    setUploads((current) => (current.find((item) => item.id === upload.id) ? current : [...current, upload]));
    setReviewStatus(null);
  }

  async function escalateForReview() {
    if (uploads.length === 0) {
      return;
    }

    setReviewStatus("Saving review action...");
    try {
      const response = await submitReviewAction({
        role,
        targetId: uploads[0].id,
        targetType: "upload",
        action: "escalated",
        note: "Escalated from upload review workspace after deterministic metadata summary.",
      });
      setReviewStatus(`Review action saved as ${response.event.action}.`);
    } catch (caught) {
      setReviewStatus(caught instanceof Error ? caught.message : "Review action could not be saved.");
    }
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow="Upload Review Workspace"
        title="Clinician-gated upload staging"
        description="Stage sample source files, inspect a generated case summary from metadata, and keep all review activity transient inside the current session."
      />
      <RoleGate
        minimumRole="clinician"
        title="Clinician review role required"
        description="Upload review and metadata interpretation are reserved for clinician and admin simulation roles."
      >
        <PackageGate feature={FEATURES.UPLOADS_CASE_FILES}>
        <InfoNotice
          title="Interpretation and storage warning"
          body={`${PROFESSIONAL_USE_ONLY} ${DRAFT_SUPPORT_ONLY} Staged files are simulated only, require clinician interpretation, and are never stored permanently in this MVP. ${OFF_LABEL_REVIEW_REQUIRED}`}
          tone="warning"
        />
        <Card>
          <div
            className={`rounded-[2rem] border-2 border-dashed px-6 py-10 text-center transition ${
              dragActive ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--border)] bg-[var(--bg-strong)]"
            }`}
            onDragEnter={() => setDragActive(true)}
            onDragLeave={() => setDragActive(false)}
            onDragOver={(event) => {
              event.preventDefault();
              setDragActive(true);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setDragActive(false);
            }}
          >
            <h2 className="font-display text-2xl text-[var(--text)]">Drag and drop staging area</h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-[var(--text-muted)]">
              Drag gestures are simulated for the MVP. Use the sample file actions below to stage PDF, qEEG summary, MRI report, intake form, and clinician notes.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              {stagedUploadExamples.map((upload) => (
                <Button key={upload.id} variant="secondary" onClick={() => stageUpload(upload)}>
                  Add {upload.type}
                </Button>
              ))}
            </div>
          </div>
        </Card>

        <div className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
          <Card>
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-display text-2xl text-[var(--text)]">Staged uploads</h2>
              <Button variant="secondary" disabled={uploads.length === 0} onClick={() => void escalateForReview()}>
                Escalate review
              </Button>
            </div>
            {reviewStatus ? (
              <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">{reviewStatus}</p>
            ) : null}
            {uploads.length === 0 ? (
              <EmptyState
                title="No uploads staged"
                body="Add a sample file type to generate a realistic case summary from metadata."
              />
            ) : (
              <div className="mt-4 grid gap-3">
                {uploads.map((upload) => (
                  <section key={upload.id} className="rounded-3xl border border-[var(--border)] bg-[var(--bg-strong)] p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="accent">{upload.type}</Badge>
                      <Badge>{upload.status}</Badge>
                    </div>
                    <h3 className="mt-3 font-display text-lg text-[var(--text)]">{upload.fileName}</h3>
                    <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">{upload.summary}</p>
                  </section>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <h2 className="font-display text-2xl text-[var(--text)]">Generated case summary</h2>
            <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">
              This summary is derived from staged metadata only and must be interpreted by a qualified clinician.
            </p>
            {loading ? (
              <p className="mt-4 text-sm leading-6 text-[var(--text-muted)]">Generating deterministic case summary from the backend.</p>
            ) : error ? (
              <div className="mt-4 grid gap-4">
                <InfoNotice title="Summary unavailable" body={error} tone="warning" />
                {warnings.length > 0 ? <SummaryBlock title="Review notes" items={warnings} /> : null}
              </div>
            ) : summary ? (
              <>
                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <SummaryBlock title="Presenting symptoms" items={summary.presentingSymptoms} />
                  <SummaryBlock title="Relevant findings" items={summary.relevantFindings} />
                  <SummaryBlock title="Red flags" items={summary.redFlags} />
                  <SummaryBlock title="Possible targets" items={summary.possibleTargets} />
                </div>
                <section className="mt-4 rounded-3xl border border-[var(--border)] bg-[var(--bg-strong)] p-4">
                  <h3 className="font-display text-lg text-[var(--text)]">Suggested modalities</h3>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {summary.suggestedModalities.map((item) => (
                      <Badge key={item} tone="accent">
                        {item}
                      </Badge>
                    ))}
                  </div>
                </section>
              </>
            ) : (
              <EmptyState
                title="No case summary yet"
                body="Stage at least one upload to generate a backend-backed case summary."
              />
            )}
          </Card>
        </div>
        </PackageGate>
      </RoleGate>
    </div>
  );
}

function SummaryBlock({ title, items }: { title: string; items: string[] }) {
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
