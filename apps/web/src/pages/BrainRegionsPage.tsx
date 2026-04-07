import { useEffect, useMemo, useState } from "react";

import { useAppState } from "../app/useAppStore";
import { Badge } from "../components/ui/Badge";
import { Card } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { PageHeader } from "../components/ui/PageHeader";
import { SelectField } from "../components/ui/SelectField";
import { listBrainRegions } from "../lib/api/services";
import { BrainRegion } from "../types/domain";

export function BrainRegionsPage() {
  const { searchQuery } = useAppState();
  const [items, setItems] = useState<BrainRegion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lobeFilter, setLobeFilter] = useState("all");
  const [depthFilter, setDepthFilter] = useState("all");
  const [networkFilter, setNetworkFilter] = useState("all");
  const [modalityFilter, setModalityFilter] = useState("all");
  const [selectedId, setSelectedId] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await listBrainRegions();
        if (cancelled) return;
        setItems(data);
        setSelectedId((current) => current || data[0]?.regionId || "");
      } catch (caught) {
        if (cancelled) return;
        setError(caught instanceof Error ? caught.message : "Brain region data could not be loaded.");
        setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const lobes = useMemo(() => [...new Set(items.map((r) => r.lobe).filter(Boolean))].sort(), [items]);
  const depths = useMemo(() => [...new Set(items.map((r) => r.depth).filter(Boolean))].sort(), [items]);
  const networks = useMemo(
    () =>
      [
        ...new Set(
          items.flatMap((r) =>
            r.fnonNetwork
              .split(",")
              .map((n) => n.trim())
              .filter(Boolean),
          ),
        ),
      ].sort(),
    [items],
  );
  const modalities = useMemo(
    () =>
      [
        ...new Set(
          items.flatMap((r) =>
            r.targetableModalities
              .split(",")
              .map((m) => m.trim())
              .filter(Boolean),
          ),
        ),
      ].sort(),
    [items],
  );

  const filtered = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return items.filter((r) => {
      const matchesQuery =
        query.length === 0 ||
        [r.regionName, r.abbreviation, r.fnonNetwork, r.keyConditions, r.targetableModalities, r.primaryFunctions]
          .join(" ")
          .toLowerCase()
          .includes(query);
      const matchesLobe = lobeFilter === "all" || r.lobe === lobeFilter;
      const matchesDepth = depthFilter === "all" || r.depth === depthFilter;
      const matchesNetwork =
        networkFilter === "all" || r.fnonNetwork.split(",").map((n) => n.trim()).includes(networkFilter);
      const matchesModality =
        modalityFilter === "all" || r.targetableModalities.split(",").map((m) => m.trim()).includes(modalityFilter);
      return matchesQuery && matchesLobe && matchesDepth && matchesNetwork && matchesModality;
    });
  }, [searchQuery, items, lobeFilter, depthFilter, networkFilter, modalityFilter]);

  const selected = filtered.find((r) => r.regionId === selectedId) ?? filtered[0] ?? null;

  useEffect(() => {
    if (filtered.length > 0 && !filtered.some((r) => r.regionId === selectedId)) {
      setSelectedId(filtered[0].regionId);
    }
  }, [filtered, selectedId]);

  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow="Brain Regions"
        title="FNON targeting reference"
        description="Browse the 46-region Functional Network-Oriented Neuromodulation (FNON) atlas. Each entry maps anatomical location to EEG position, network membership, and targetable modalities."
      />

      <Card>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SelectField label="Lobe" value={lobeFilter} onChange={setLobeFilter} disabled={loading || items.length === 0}>
            <option value="all">All lobes</option>
            {lobes.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </SelectField>
          <SelectField label="Depth" value={depthFilter} onChange={setDepthFilter} disabled={loading || items.length === 0}>
            <option value="all">Any depth</option>
            {depths.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </SelectField>
          <SelectField label="Network (FNON)" value={networkFilter} onChange={setNetworkFilter} disabled={loading || items.length === 0}>
            <option value="all">All networks</option>
            {networks.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </SelectField>
          <SelectField label="Modality" value={modalityFilter} onChange={setModalityFilter} disabled={loading || items.length === 0}>
            <option value="all">All modalities</option>
            {modalities.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </SelectField>
        </div>
      </Card>

      {loading ? (
        <Card>
          <p className="text-sm leading-6 text-[var(--text-muted)]">Loading brain region data from the API.</p>
        </Card>
      ) : error ? (
        <Card>
          <h2 className="font-display text-2xl text-[var(--text)]">Brain regions unavailable</h2>
          <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">{error}</p>
        </Card>
      ) : filtered.length === 0 ? (
        <EmptyState title="No brain regions match the current filters" body="Broaden the filters or clear the search to see the full atlas." />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
          <Card className="overflow-x-auto">
            <p className="mb-3 text-xs text-[var(--text-muted)]">
              Showing {filtered.length} of {items.length} regions
            </p>
            <table className="min-w-full border-separate border-spacing-y-2">
              <thead>
                <tr className="text-left text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">
                  <th className="px-3 pb-2">Region</th>
                  <th className="px-3 pb-2">Lobe</th>
                  <th className="px-3 pb-2">Depth</th>
                  <th className="px-3 pb-2">EEG Position</th>
                  <th className="px-3 pb-2">Network</th>
                  <th className="px-3 pb-2">Modalities</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr
                    key={r.regionId}
                    className={`soft-panel cursor-pointer ${selected?.regionId === r.regionId ? "ring-1 ring-[var(--accent)]" : ""}`}
                    onClick={() => setSelectedId(r.regionId)}
                  >
                    <td className="rounded-l-2xl px-3 py-3">
                      <p className="font-medium text-[var(--text)]">{r.regionName}</p>
                      <p className="font-mono text-xs text-[var(--accent)]">{r.abbreviation}</p>
                    </td>
                    <td className="px-3 py-3 text-sm text-[var(--text-muted)]">{r.lobe}</td>
                    <td className="px-3 py-3">
                      <DepthBadge depth={r.depth} />
                    </td>
                    <td className="px-3 py-3 font-mono text-xs text-[var(--text-muted)]">{r.eegPosition}</td>
                    <td className="px-3 py-3 text-xs text-[var(--text-muted)]">{r.fnonNetwork}</td>
                    <td className="rounded-r-2xl px-3 py-3 text-xs text-[var(--text-muted)]">
                      <span className="line-clamp-2">{r.targetableModalities}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {selected ? (
            <Card className="h-fit xl:sticky xl:top-6">
              <div className="flex flex-wrap gap-2">
                <Badge tone="accent">{selected.fnonNetwork.split(",")[0].trim()}</Badge>
                <DepthBadge depth={selected.depth} />
              </div>
              <h2 className="mt-4 font-display text-2xl text-[var(--text)]">{selected.regionName}</h2>
              <p className="font-mono text-sm text-[var(--accent)]">{selected.abbreviation}</p>
              {selected.brodmannArea && (
                <p className="mt-1 text-xs text-[var(--text-muted)]">Brodmann: {selected.brodmannArea}</p>
              )}
              <p className="mt-4 text-sm leading-6 text-[var(--text-muted)]">{selected.primaryFunctions}</p>

              <RegionDetailBlock title="Key conditions" text={selected.keyConditions} />
              <RegionDetailBlock title="Targetable modalities" text={selected.targetableModalities} />
              <RegionDetailBlock title="Networks" text={selected.fnonNetwork} />
              {selected.notes && <RegionDetailBlock title="Clinical notes" text={selected.notes} />}
            </Card>
          ) : null}
        </div>
      )}
    </div>
  );
}

function DepthBadge({ depth }: { depth: string }) {
  const tone = depth === "Cortical" ? "accent" : depth === "Subcortical" ? "warning" : "neutral";
  return <Badge tone={tone}>{depth}</Badge>;
}

function RegionDetailBlock({ title, text }: { title: string; text: string }) {
  return (
    <section className="mt-4">
      <h3 className="font-display text-sm font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">{title}</h3>
      <p className="mt-1 text-sm leading-6 text-[var(--text)]">{text}</p>
    </section>
  );
}
