import { useEffect, useState } from "react";

import { useAppState } from "../app/useAppStore";
import { RoleGate } from "../components/domain/RoleGate";
import { Badge } from "../components/ui/Badge";
import { Breadcrumb } from "../components/ui/Breadcrumb";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { InfoNotice } from "../components/ui/InfoNotice";
import { PageHeader } from "../components/ui/PageHeader";
import { governanceItems } from "../data/mockData";
import { OFF_LABEL_REVIEW_REQUIRED, PROFESSIONAL_USE_ONLY } from "../content/disclaimers";
import { ApiError } from "../lib/api/client";
import { fetchAuditTrailForRole, submitReviewAction } from "../lib/api/services";
import { AuditEvent } from "../types/domain";

export function GovernanceSafetyPage() {
  const { role } = useAppState();
  const [auditItems, setAuditItems] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adminActionStatus, setAdminActionStatus] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadAuditTrail() {
      if (role !== "admin") {
        setAuditItems([]);
        setError(null);
        setAdminActionStatus(null);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const response = await fetchAuditTrailForRole(role);
        if (cancelled) {
          return;
        }
        setAuditItems(response.items);
      } catch (caught) {
        if (cancelled) {
          return;
        }
        setError(caught instanceof Error ? caught.message : "Audit trail could not be loaded.");
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadAuditTrail();
    return () => {
      cancelled = true;
    };
  }, [role]);

  async function logAdminReview() {
    setAdminActionStatus("Saving governance review action...");
    try {
      const response = await submitReviewAction({
        role,
        targetId: "gov-policy-off-label",
        targetType: "evidence",
        action: "reviewed",
        note: "Admin reviewed off-label labeling policy in governance workspace.",
      });
      setAdminActionStatus(`Governance review logged as ${response.event.action}.`);
      const audit = await fetchAuditTrailForRole(role);
      setAuditItems(audit.items);
    } catch (caught) {
      if (caught instanceof ApiError) {
        setAdminActionStatus(caught.message);
      } else {
        setAdminActionStatus("Governance review action could not be saved.");
      }
    }
  }

  return (
    <div className="grid gap-6">
      <Breadcrumb items={[{ label: "Home", to: "/" }, { label: "Governance & Safety" }]} />
      <PageHeader
        eyebrow="Governance / Safety"
        title="Human review and safety layer"
        description="Evidence grading, contraindication status, review workflow, audit visibility, and disclaimer language are grouped into one governance view."
      />
      <RoleGate
        minimumRole="admin"
        title="Admin governance view required"
        description="Governance and safety administration is visible to admin simulation roles in the MVP."
      >
        <InfoNotice
          title="Governance boundary"
          body={`${PROFESSIONAL_USE_ONLY} All workflow outputs remain advisory for professional review and do not authorize autonomous treatment decisions. ${OFF_LABEL_REVIEW_REQUIRED}`}
          tone="warning"
        />
        <div className="grid gap-4 xl:grid-cols-3">
          {governanceItems.map((item) => (
            <Card key={item.id}>
              <h2 className="font-display text-2xl text-[var(--text)]">{item.title}</h2>
              <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">{item.body}</p>
              <ul className="mt-4 grid gap-2 text-sm leading-6 text-[var(--text-muted)]">
                {item.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <h2 className="font-display text-2xl text-[var(--text)]">Contraindication checklist status</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge tone="success">Implant review complete</Badge>
              <Badge tone="success">Medication review complete</Badge>
              <Badge tone="warning">Imaging interpretation pending sign-off</Badge>
            </div>
            <p className="mt-4 text-sm leading-6 text-[var(--text-muted)]">
              Checklist state is shown with human-review posture and explicit escalation visibility.
            </p>
          </Card>
          <Card>
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-display text-2xl text-[var(--text)]">Audit trail preview</h2>
              <Button variant="secondary" onClick={() => void logAdminReview()}>
                Log admin review
              </Button>
            </div>
            {adminActionStatus ? (
              <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">{adminActionStatus}</p>
            ) : null}
            {loading ? (
              <p className="mt-4 text-sm leading-6 text-[var(--text-muted)]">Loading persisted audit trail from the backend.</p>
            ) : error ? (
              <div className="mt-4">
                <InfoNotice title="Audit trail unavailable" body={error} tone="warning" />
              </div>
            ) : (
              <ul className="mt-4 grid gap-3 text-sm leading-6 text-[var(--text-muted)]">
                {auditItems.slice(0, 6).map((entry) => (
                  <li key={entry.eventId} className="rounded-2xl border border-[var(--border)] bg-[var(--bg-strong)] px-4 py-3">
                    {entry.createdAt} / {entry.action} / {entry.role} / {entry.note}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <Card>
          <h2 className="font-display text-2xl text-[var(--text)]">Governance settings</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <SettingTile title="Human review required" value="Enabled for uploads and off-label drafts" />
            <SettingTile title="Off-label labeling" value="Always visible with draft-support language" />
            <SettingTile title="Audit preview mode" value="Visible to admin role only" />
          </div>
        </Card>
        <Card>
          <h2 className="font-display text-2xl text-[var(--text)]">Disclaimer language</h2>
          <p className="mt-4 text-sm leading-6 text-[var(--text-muted)]">
            DeepSynaps Studio is a professional knowledge and document platform. It supports evidence review,
            assessment drafting, and clinician-gated workflows. It is not an autonomous diagnosis system, a
            treatment recommendation engine, or a substitute for licensed clinical judgment.
          </p>
        </Card>
      </RoleGate>
    </div>
  );
}

function SettingTile({ title, value }: { title: string; value: string }) {
  return (
    <section className="rounded-3xl border border-[var(--border)] bg-[var(--bg-strong)] p-4">
      <p className="text-sm text-[var(--text-muted)]">{title}</p>
      <p className="mt-2 font-medium text-[var(--text)]">{value}</p>
    </section>
  );
}
