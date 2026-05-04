import { useEffect } from "react";

import { BUILTIN_MONTAGE_OPTIONS } from "./montagePresets";
import {
  persistRecordingMontagePref,
  useMontageStore,
  type MontageListEntry,
} from "./useMontage";

function labelFor(
  id: string,
  catalog: { builtins: MontageListEntry[]; custom: MontageListEntry[] } | null,
): string {
  const builtin = BUILTIN_MONTAGE_OPTIONS.find((b) => b.id === id);
  if (builtin) return builtin.label;
  const c = catalog?.custom.find((x) => x.id === id);
  if (c) return `${c.name} (custom)`;
  const b = catalog?.builtins.find((x) => x.id === id);
  if (b) return b.name;
  return id;
}

export function MontagePicker({ recordingId }: { recordingId: string }) {
  const montageId = useMontageStore((s) => s.montageId);
  const setMid = useMontageStore((s) => s.setMontageId);
  const catalog = useMontageStore((s) => s.catalog);
  const loadCatalog = useMontageStore((s) => s.loadCatalog);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  const options: { id: string; label: string }[] = [
    ...BUILTIN_MONTAGE_OPTIONS.map((b) => ({ id: b.id, label: b.label })),
    ...(catalog?.custom.map((c) => ({
      id: c.id,
      label: `${c.name} (custom)`,
    })) ?? []),
  ];

  return (
    <label
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 11,
        marginRight: 12,
      }}
    >
      <span style={{ opacity: 0.85 }}>Montage</span>
      <select
        value={montageId}
        title="View → Select Montage"
        onChange={(e) => {
          const next = e.target.value;
          setMid(next);
          void persistRecordingMontagePref(recordingId, next);
        }}
        style={{
          fontSize: 11,
          maxWidth: 280,
          padding: "2px 6px",
          borderRadius: 4,
          border: "1px solid var(--ds-line, #ccc)",
          background: "var(--ds-surface, #fff)",
          color: "var(--ds-text, #111)",
        }}
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
      <span style={{ opacity: 0.6 }} title={labelFor(montageId, catalog)}>
        {montageId.replace("builtin:", "")}
      </span>
    </label>
  );
}
