import { useEffect, useMemo, useState } from "react";

import { useAppState } from "../app/useAppStore";
import { Badge } from "../components/ui/Badge";
import { Breadcrumb } from "../components/ui/Breadcrumb";
import { Card } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { PageHeader } from "../components/ui/PageHeader";
import { SelectField } from "../components/ui/SelectField";
import { TabList } from "../components/ui/Tabs";
import { listQEEGBiomarkers, listQEEGConditionMap } from "../lib/api/services";
import { QEEGBiomarker, QEEGConditionMap } from "../types/domain";

type Tab = "conditions" | "biomarkers";

export function QEEGMapsPage() {
  const { searchQuery } = useAppState();
  const [activeTab, setActiveTab] = useState<Tab>("conditions");

  // Condition map state
  const [conditionItems, setConditionItems] = useState<QEEGConditionMap[]>([]);
  const [conditionLoading, setConditionLoading] = useState(true);
  const [conditionError, setConditionError] = useState<string | null>(null);
  const [selectedMapId, setSelectedMapId] = useState("");

  // Biomarker state
  const [biomarkerItems, setBiomarkerItems] = useState<QEEGBiomarker[]>([]);
  const [biomarkerLoading, setBiomarkerLoading] = useState(true);
  const [biomarkerError, setBiomarkerError] = useState<string | null>(null);

  // Condition filter
  const [networkFilter, setNetworkFilter] = useState("all");

  useEffect(() => {
    let cancelled = false;

    async function loadConditions() {
      setConditionLoading(true);
      setConditionError(null);
      try {
        const data = await listQEEGConditionMap();
        if (cancelled) return;
        setConditionItems(data);
        setSelectedMapId((current) => current || data[0]?.mapId || "");
      } catch (caught) {
        if (cancelled) return;
        setConditionError(caught instanceof Error ? caught.message : "Condition map data could not be loaded.");
      } finally {
        if (!cancelled) setConditionLoading(false);
      }
    }

    async function loadBiomarkers() {
      setBiomarkerLoading(true);
      setBiomarkerError(null);
      try {
        const data = await listQEEGBiomarkers();
        if (cancelled) return;
        setBiomarkerItems(data);
      } catch (caught) {
        if (cancelled) return;
        setBiomarkerError(caught instanceof Error ? caught.message : "Biomarker data could not be loaded.");
      } finally {
        if (!cancelled) setBiomarkerLoading(false);
      }
    }

    void loadConditions();
    void loadBiomarkers();
    return () => {
      cancelled = true;
    };
  }, []);

  const networks = useMemo(
    () =>
      [
        ...new Set(
          conditionItems.flatMap((c) =>
            c.primaryNetworksDisrupted
              .split(",")
              .map((n) => n.trim())
              .filter(Boolean),
          ),
        ),
      ].sort(),
    [conditionItems],
  );

  const filteredConditions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return conditionItems.filter((c) => {
      const matchesQuery =
        query.length === 0 ||
        [c.conditionName, c.keySymptoms, c.qeegPatterns, c.affectedBrainRegions, c.recommendedNeuromodTechniques]
          .join(" ")
          .toLowerCase()
          .includes(query);
      const matchesNetwork =
        networkFilter === "all" ||
        c.primaryNetworksDisrupted
          .split(",")
          .map((n) => n.trim())
          .includes(networkFilter);
      return matchesQuery && matchesNetwork;
    });
  }, [searchQuery, conditionItems, networkFilter]);

  const filteredBiomarkers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (query.length === 0) return biomarkerItems;
    return biomarkerItems.filter((b) =>
      [b.bandName, b.hzRange, b.normalBrainState, b.associatedDisorders, b.clinicalSignificance]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [searchQuery, biomarkerItems]);

  const selectedMap = filteredConditions.find((c) => c.mapId === selectedMapId) ?? filteredConditions[0] ?? null;

  useEffect(() => {
    if (filteredConditions.length > 0 && !filteredConditions.some((c) => c.mapId === selectedMapId)) {
      setSelectedMapId(filteredConditions[0].mapId);
    }
  }, [filteredConditions, selectedMapId]);

  const qeegTabs = [
    { id: "conditions", label: `Condition Maps${conditionItems.length > 0 ? ` (${conditionItems.length})` : ""}` },
    { id: "biomarkers", label: `Biomarker Bands${biomarkerItems.length > 0 ? ` (${biomarkerItems.length})` : ""}` },
  ];

  return (
    <div className="grid gap-6">
      <Breadcrumb items={[{ label: "Home", to: "/" }, { label: "qEEG Maps" }]} />
      <PageHeader
        icon="📊"
        eyebrow="qEEG Maps"
        title="Biomarker and condition reference"
        description="Frequency band biomarkers with normal and pathological ranges alongside condition-level qEEG patterns, disrupted networks, and recommended neuromodulation strategies."
      />

      <TabList
        tabs={qeegTabs}
        activeTab={activeTab}
        onTabChange={(id) => setActiveTab(id as Tab)}
      />

      {/* ── CONDITIONS TAB ─────────────────────────────────────────────── */}
      {activeTab === "conditions" && (
        <>
          <Card>
            <div className="grid gap-4 md:grid-cols-2">
              <SelectField
                label="Network"
                value={networkFilter}
                onChange={setNetworkFilter}
                disabled={conditionLoading || conditionItems.length === 0}
              >
                <option value="all">All networks</option>
                {networks.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </SelectField>
            </div>
          </Card>

          {conditionLoading ? (
            <Card>
              <p className="text-sm leading-6 text-[var(--text-muted)]">Loading condition maps from the API.</p>
            </Card>
          ) : conditionError ? (
            <Card>
              <h2 className="font-display text-2xl text-[var(--text)]">Condition maps unavailable</h2>
              <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">{conditionError}</p>
            </Card>
          ) : filteredConditions.length === 0 ? (
            <EmptyState
              title="No condition maps match the current filters"
              body="Adjust the network filter or clear the search to see the full condition map."
            />
          ) : (
            <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
              <div className="grid gap-4 content-start">
                {filteredConditions.map((c) => (
                  <button key={c.mapId} className="text-left" onClick={() => setSelectedMapId(c.mapId)}>
                    <Card className={selectedMap?.mapId === c.mapId ? "ring-2 ring-[var(--accent)]" : ""}>
                      <div className="flex flex-wrap gap-2">
                        <Badge tone="accent">{c.mapId}</Badge>
                        {c.primaryNetworksDisrupted
                          .split(",")
                          .slice(0, 2)
                          .map((n) => n.trim())
                          .filter(Boolean)
                          .map((n) => (
                            <Badge key={n} tone="neutral">
                              {n}
                            </Badge>
                          ))}
                      </div>
                      <h2 className="mt-3 font-display text-xl text-[var(--text)]">{c.conditionName}</h2>
                      <p className="mt-2 text-sm leading-6 text-[var(--text-muted)] line-clamp-2">{c.keySymptoms}</p>
                      <div className="mt-3 rounded-2xl border border-[var(--border)] bg-[var(--bg-strong)] px-3 py-2">
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                          qEEG patterns
                        </p>
                        <p className="mt-1 text-xs leading-5 text-[var(--text)] line-clamp-2">{c.qeegPatterns}</p>
                      </div>
                    </Card>
                  </button>
                ))}
              </div>

              {selectedMap ? (
                <Card className="h-fit xl:sticky xl:top-6">
                  <Badge tone="accent">{selectedMap.mapId}</Badge>
                  <h2 className="mt-3 font-display text-2xl text-[var(--text)]">{selectedMap.conditionName}</h2>

                  <QEEGDetailBlock title="Key symptoms" text={selectedMap.keySymptoms} />
                  <QEEGDetailBlock title="qEEG patterns" text={selectedMap.qeegPatterns} />
                  <QEEGDetailBlock title="Electrode sites" text={selectedMap.keyElectrodeSites} />
                  <QEEGDetailBlock title="Affected brain regions" text={selectedMap.affectedBrainRegions} />
                  <QEEGDetailBlock title="Networks disrupted" text={selectedMap.primaryNetworksDisrupted} />
                  <QEEGDetailBlock title="Network dysfunction" text={selectedMap.networkDysfunctionPattern} />
                  <QEEGDetailBlock title="Recommended neuromod" text={selectedMap.recommendedNeuromodTechniques} />
                  <QEEGDetailBlock title="Stimulation targets" text={selectedMap.primaryStimulationTargets} />
                  <QEEGDetailBlock title="Stimulation rationale" text={selectedMap.stimulationRationale} />
                </Card>
              ) : null}
            </div>
          )}
        </>
      )}

      {/* ── BIOMARKERS TAB ─────────────────────────────────────────────── */}
      {activeTab === "biomarkers" && (
        <>
          {biomarkerLoading ? (
            <Card>
              <p className="text-sm leading-6 text-[var(--text-muted)]">Loading biomarker bands from the API.</p>
            </Card>
          ) : biomarkerError ? (
            <Card>
              <h2 className="font-display text-2xl text-[var(--text)]">Biomarker data unavailable</h2>
              <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">{biomarkerError}</p>
            </Card>
          ) : filteredBiomarkers.length === 0 ? (
            <EmptyState title="No biomarker bands match the search" body="Clear the search to see all frequency bands." />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredBiomarkers.map((b) => (
                <Card key={b.bandId}>
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="font-display text-xl text-[var(--text)]">{b.bandName}</h2>
                    <Badge tone="accent">{b.hzRange}</Badge>
                  </div>

                  <div className="mt-3 rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.08] px-3 py-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.10em] text-emerald-400">Normal state: </span>
                    <span className="text-xs text-[var(--text)]">{b.normalBrainState}</span>
                  </div>

                  <div className="mt-4 grid gap-2">
                    <BiomarkerRow label="Key regions" value={b.keyRegions} />
                    <BiomarkerRow label="EEG sites" value={b.eegPositions} mono />
                  </div>

                  <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/[0.08] p-3 grid gap-2">
                    <div className="flex items-start gap-1.5">
                      <span className="mt-0.5 h-2 w-2 flex-shrink-0 rounded-full bg-red-400" aria-hidden="true" />
                      <div>
                        <span className="text-xs font-semibold text-red-400">Pathological increase: </span>
                        <span className="text-xs text-[var(--text)]">{b.pathologicalIncrease}</span>
                      </div>
                    </div>
                    <div className="flex items-start gap-1.5">
                      <span className="mt-0.5 h-2 w-2 flex-shrink-0 rounded-full bg-red-400" aria-hidden="true" />
                      <div>
                        <span className="text-xs font-semibold text-red-400">Pathological decrease: </span>
                        <span className="text-xs text-[var(--text)]">{b.pathologicalDecrease}</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-2">
                    <BiomarkerRow label="Disorders" value={b.associatedDisorders} />
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                        Clinical significance
                      </p>
                      <p className="mt-1 text-xs leading-5 text-[var(--text)]">{b.clinicalSignificance}</p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}


function QEEGDetailBlock({ title, text }: { title: string; text: string }) {
  if (!text) return null;
  return (
    <section className="mt-4 border-t border-[var(--border)] pt-3">
      <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">{title}</h3>
      <p className="mt-1 text-sm leading-6 text-[var(--text)]">{text}</p>
    </section>
  );
}

function BiomarkerRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">{label}: </span>
      <span className={`text-xs text-[var(--text)] ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}
