import { useEffect, useMemo, useState } from "react";

import { useAppState } from "../app/useAppStore";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { InfoNotice } from "../components/ui/InfoNotice";
import { PageHeader } from "../components/ui/PageHeader";
import { SelectField } from "../components/ui/SelectField";
import { fetchDeviceRegistry } from "../lib/api/services";
import { DeviceRecord } from "../types/domain";

export function DeviceRegistryPage() {
  const { searchQuery } = useAppState();
  const [modality, setModality] = useState("all");
  const [channels, setChannels] = useState("all");
  const [useType, setUseType] = useState("all");
  const [region, setRegion] = useState("all");
  const [status, setStatus] = useState("all");
  const [view, setView] = useState<"table" | "cards">("table");
  const [selectedId, setSelectedId] = useState("");
  const [items, setItems] = useState<DeviceRecord[]>([]);
  const [registryNotice, setRegistryNotice] = useState(
    "All device registry entries in this MVP are illustrative workspace data and must not be interpreted as actual regulatory claims or product endorsements.",
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadDevices() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetchDeviceRegistry();
        if (cancelled) {
          return;
        }
        setItems(response.items);
        setRegistryNotice(response.disclaimers.professionalUseOnly);
        setSelectedId((current) => current || response.items[0]?.id || "");
      } catch (caught) {
        if (cancelled) {
          return;
        }
        setError(caught instanceof Error ? caught.message : "Device records could not be loaded.");
        setItems([]);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadDevices();
    return () => {
      cancelled = true;
    };
  }, []);

  const devices = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return items.filter((item) => {
      const matchesQuery =
        query.length === 0 ||
        [item.name, item.summary, item.manufacturer, item.modality].join(" ").toLowerCase().includes(query);
      return (
        matchesQuery &&
        (modality === "all" || item.modality === modality) &&
        (channels === "all" || (channels === "8plus" ? item.channels >= 8 : item.channels < 8)) &&
        (useType === "all" || item.useType === useType) &&
        (region === "all" || item.regions.includes(region)) &&
        (status === "all" || item.regulatoryStatus === status)
      );
    });
  }, [searchQuery, items, modality, channels, useType, region, status]);

  const selected = devices.find((item) => item.id === selectedId) ?? devices[0] ?? null;

  useEffect(() => {
    if (devices.length > 0 && !devices.some((item) => item.id === selectedId)) {
      setSelectedId(devices[0].id);
    }
  }, [devices, selectedId]);

  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow="Device Registry"
        title="Sample registry for professional review"
        description="Browse sample device records by modality, operational context, region, and regulatory posture without implying real-world claims."
        actions={
          <div className="flex gap-2">
            <Button variant={view === "table" ? "primary" : "secondary"} onClick={() => setView("table")}>
              Table view
            </Button>
            <Button variant={view === "cards" ? "primary" : "secondary"} onClick={() => setView("cards")}>
              Card view
            </Button>
          </div>
        }
      />
      <InfoNotice
        title="Sample data notice"
        body={`${registryNotice} Device entries remain sample MVP records rather than real regulatory claims.`}
        tone="warning"
      />
      <Card>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <SelectField label="Modality" value={modality} onChange={setModality} disabled={loading || items.length === 0}>
            <option value="all">All modalities</option>
            {[...new Set(items.map((item) => item.modality))].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </SelectField>
          <SelectField label="Channels" value={channels} onChange={setChannels} disabled={loading || items.length === 0}>
            <option value="all">Any channel count</option>
            <option value="sub8">Below 8</option>
            <option value="8plus">8 or more</option>
          </SelectField>
          <SelectField label="Use" value={useType} onChange={setUseType} disabled={loading || items.length === 0}>
            <option value="all">Any use type</option>
            {[...new Set(items.map((item) => item.useType))].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </SelectField>
          <SelectField label="Region" value={region} onChange={setRegion} disabled={loading || items.length === 0}>
            <option value="all">Any region</option>
            {[...new Set(items.flatMap((item) => item.regions))].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </SelectField>
          <SelectField label="Regulatory status" value={status} onChange={setStatus} disabled={loading || items.length === 0}>
            <option value="all">Any status</option>
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
          <p className="text-sm leading-6 text-[var(--text-muted)]">Loading device registry records from the API.</p>
        </Card>
      ) : error ? (
        <Card>
          <h2 className="font-display text-2xl text-[var(--text)]">Device registry unavailable</h2>
          <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">{error}</p>
        </Card>
      ) : devices.length === 0 ? (
        <EmptyState title="No device records match the current view" body="Broaden the filters to see the sample registry again." />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
          {view === "table" ? (
            <Card className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-y-3">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">
                    <th>Name</th>
                    <th>Modality</th>
                    <th>Channels</th>
                    <th>Use</th>
                    <th>Region</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {devices.map((item) => (
                    <tr
                      key={item.id}
                      className={`soft-panel cursor-pointer ${selected?.id === item.id ? "ring-1 ring-[var(--accent)]" : ""}`}
                      onClick={() => setSelectedId(item.id)}
                    >
                      <td className="rounded-l-2xl px-4 py-4">
                        <p className="font-medium text-[var(--text)]">{item.name}</p>
                        <p className="text-sm text-[var(--text-muted)]">{item.manufacturer}</p>
                      </td>
                      <td className="px-4 py-4 text-sm text-[var(--text-muted)]">{item.modality}</td>
                      <td className="px-4 py-4 text-sm text-[var(--text-muted)]">{item.channels}</td>
                      <td className="px-4 py-4 text-sm text-[var(--text-muted)]">{item.useType}</td>
                      <td className="px-4 py-4 text-sm text-[var(--text-muted)]">{item.regions.join(", ")}</td>
                      <td className="rounded-r-2xl px-4 py-4">
                        <Badge>{item.regulatoryStatus}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          ) : (
            <div className="grid gap-4">
              {devices.map((item) => (
                <button key={item.id} className="text-left" onClick={() => setSelectedId(item.id)}>
                  <Card className={selected?.id === item.id ? "ring-1 ring-[var(--accent)]" : ""}>
                    <div className="flex flex-wrap gap-2">
                      <Badge tone="accent">{item.modality}</Badge>
                      <Badge>{item.regulatoryStatus}</Badge>
                    </div>
                    <h2 className="mt-4 font-display text-xl text-[var(--text)]">{item.name}</h2>
                    <p className="mt-2 text-sm text-[var(--text-muted)]">{item.summary}</p>
                  </Card>
                </button>
              ))}
            </div>
          )}

          {selected ? (
            <Card className="h-fit xl:sticky xl:top-6">
              <Badge tone="warning">Sample MVP record</Badge>
              <h2 className="mt-4 font-display text-2xl text-[var(--text)]">{selected.name}</h2>
              <p className="mt-2 text-sm text-[var(--text-muted)]">{selected.manufacturer}</p>
              <p className="mt-4 text-sm leading-6 text-[var(--text-muted)]">{selected.summary}</p>
              <div className="mt-4">
                <InfoNotice title="Registry caution" body={selected.sampleDataNotice} tone="warning" />
              </div>
              <DetailList title="Best fit" items={selected.bestFor} />
              <DetailList title="Constraints" items={selected.constraints} />
            </Card>
          ) : null}
        </div>
      )}
    </div>
  );
}

function DetailList({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="mt-5">
      <h3 className="font-display text-lg text-[var(--text)]">{title}</h3>
      <ul className="mt-2 grid gap-2 text-sm leading-6 text-[var(--text-muted)]">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}
