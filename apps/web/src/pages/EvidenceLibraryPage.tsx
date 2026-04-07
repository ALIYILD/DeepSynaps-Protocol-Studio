import { useEffect, useMemo, useState } from "react";

import { useAppState } from "../app/useAppStore";
import { Badge } from "../components/ui/Badge";
import { Breadcrumb } from "../components/ui/Breadcrumb";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { ContraindicationWarning } from "../components/ui/ContraindicationWarning";
import { EmptyState } from "../components/ui/EmptyState";
import { EvidenceGradeBadge } from "../components/ui/EvidenceGradeBadge";
import { InfoNotice } from "../components/ui/InfoNotice";
import { PageHeader } from "../components/ui/PageHeader";
import { SelectField } from "../components/ui/SelectField";
import { PROFESSIONAL_USE_ONLY } from "../content/disclaimers";
import { fetchEvidenceLibrary } from "../lib/api/services";
import { EvidenceItem } from "../types/domain";

export function EvidenceLibraryPage() {
  const { searchQuery } = useAppState();
  const [condition, setCondition] = useState("all");
  const [cluster, setCluster] = useState("all");
  const [modality, setModality] = useState("all");
  const [evidenceLevel, setEvidenceLevel] = useState("all");
  const [regulatoryStatus, setRegulatoryStatus] = useState("all");
  const [selectedId, setSelectedId] = useState("");
  const [items, setItems] = useState<EvidenceItem[]>([]);
  const [libraryDisclaimer, setLibraryDisclaimer] = useState(PROFESSIONAL_USE_ONLY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadEvidence() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetchEvidenceLibrary();
        if (cancelled) {
          return;
        }
        setItems(response.items);
        setLibraryDisclaimer(response.disclaimers.professionalUseOnly);
        setSelectedId((current) => current || response.items[0]?.id || "");
      } catch (caught) {
        if (cancelled) {
          return;
        }
        setError(caught instanceof Error ? caught.message : "Evidence records could not be loaded.");
        setItems([]);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadEvidence();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const filteredItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return items.filter((item) => {
      const matchesQuery =
        query.length === 0 ||
        [item.title, item.summary, item.condition, item.modality, item.symptomCluster]
          .join(" ")
          .toLowerCase()
          .includes(query);
      return (
        matchesQuery &&
        (condition === "all" || item.condition === condition) &&
        (cluster === "all" || item.symptomCluster === cluster) &&
        (modality === "all" || item.modality === modality) &&
        (evidenceLevel === "all" || item.evidenceLevel === evidenceLevel) &&
        (regulatoryStatus === "all" || item.regulatoryStatus === regulatoryStatus)
      );
    });
  }, [searchQuery, items, condition, cluster, modality, evidenceLevel, regulatoryStatus]);

  const selectedItem = filteredItems.find((item) => item.id === selectedId) ?? filteredItems[0] ?? null;

  useEffect(() => {
    if (filteredItems.length > 0 && !filteredItems.some((item) => item.id === selectedId)) {
      setSelectedId(filteredItems[0].id);
    }
  }, [filteredItems, selectedId]);

  return (
    <div className="grid gap-6">
      <Breadcrumb items={[{ label: "Home", to: "/" }, { label: "Evidence Library" }]} />
      <PageHeader
        icon="📚"
        eyebrow="Evidence Library"
        title="Structured evidence review"
        description="Search condition-level evidence, compare supported methods, and inspect contraindications with approved versus emerging notes shown together."
      />
      <InfoNotice
        title="Professional review notice"
        body={`${libraryDisclaimer} Evidence entries are curated workspace summaries that support interpretation and governance review.`}
      />
      <Card>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <SelectField label="Condition" value={condition} onChange={setCondition} disabled={loading || items.length === 0}>
            <option value="all">All conditions</option>
            {[...new Set(items.map((item) => item.condition))].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </SelectField>
          <SelectField label="Symptom cluster" value={cluster} onChange={setCluster} disabled={loading || items.length === 0}>
            <option value="all">All clusters</option>
            {[...new Set(items.map((item) => item.symptomCluster))].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </SelectField>
          <SelectField label="Modality" value={modality} onChange={setModality} disabled={loading || items.length === 0}>
            <option value="all">All modalities</option>
            {[...new Set(items.map((item) => item.modality))].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </SelectField>
          <SelectField label="Evidence level" value={evidenceLevel} onChange={setEvidenceLevel} disabled={loading || items.length === 0}>
            <option value="all">All levels</option>
            {[...new Set(items.map((item) => item.evidenceLevel))].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </SelectField>
          <SelectField label="Regulatory status" value={regulatoryStatus} onChange={setRegulatoryStatus} disabled={loading || items.length === 0}>
            <option value="all">All statuses</option>
            {[...new Set(items.map((item) => item.regulatoryStatus))].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </SelectField>
        </div>
      </Card>

      {loading ? (
        <Card>
          <p className="text-sm leading-6 text-[var(--text-muted)]">Loading evidence records from the API.</p>
        </Card>
      ) : error ? (
        <Card>
          <h2 className="font-display text-2xl text-[var(--text)]">Evidence library unavailable</h2>
          <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">{error}</p>
          <div className="mt-4">
            <Button onClick={() => setReloadKey((current) => current + 1)}>Retry</Button>
          </div>
        </Card>
      ) : filteredItems.length === 0 ? (
        <EmptyState
          icon="🔍"
          title="No results found"
          body="No results for your search. Try broader terms or clear filters to see the full evidence library."
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
          <div className="grid gap-4">
            {filteredItems.map((item) => (
              <button key={item.id} className="text-left" onClick={() => setSelectedId(item.id)}>
                <Card className={selectedItem?.id === item.id ? "ring-2 ring-[var(--accent)]" : ""}>
                  <div className="flex flex-wrap items-center gap-2">
                    <EvidenceGradeBadge grade={item.evidenceLevel} />
                    <Badge>{item.regulatoryStatus}</Badge>
                  </div>
                  <h2 className="mt-4 font-display text-xl text-[var(--text)]">{item.title}</h2>
                  <p className="mt-2 text-sm text-[var(--text-muted)]">
                    {item.condition} / {item.symptomCluster} / {item.modality}
                  </p>
                  <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">{item.summary}</p>
                </Card>
              </button>
            ))}
          </div>

          {selectedItem ? (
            <Card>
              {/* Prominent safety summary header */}
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-strong)] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)] mb-2">
                  Evidence summary
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <EvidenceGradeBadge grade={selectedItem.evidenceLevel} size="lg" />
                  <Badge>{selectedItem.regulatoryStatus}</Badge>
                </div>
                <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">{selectedItem.evidenceStrength}</p>
              </div>
              <h2 className="mt-4 font-display text-3xl text-[var(--text)]">{selectedItem.title}</h2>
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <DetailBlock title="Supported methods" items={selectedItem.supportedMethods} />
                <ContraindicationWarning items={selectedItem.contraindications} />
                <DetailBlock title="References" items={selectedItem.references} />
                <DetailBlock title="Related devices" items={selectedItem.relatedDevices} />
              </div>
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <DetailBlock title="Approved posture" items={selectedItem.approvedNotes} />
                <DetailBlock title="Emerging posture" items={selectedItem.emergingNotes} />
              </div>
            </Card>
          ) : null}
        </div>
      )}
    </div>
  );
}

function DetailBlock({ title, items }: { title: string; items: string[] }) {
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
