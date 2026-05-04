import { useCallback, useEffect, useMemo, useState } from "react";

import type { BandrangePreset } from "./BandrangeDialog";
import { BandrangeDialog } from "./BandrangeDialog";
import { BandrangeEditorDialog } from "./BandrangeEditor";
import { loadBandrangeOverrides } from "./bandrangeLocal";

const API_BASE = import.meta.env?.VITE_API_BASE_URL ?? "";

function getToken(): string | null {
  try {
    return localStorage.getItem("ds_access_token");
  } catch {
    return null;
  }
}

export function BandrangeMenu({
  analysisId,
  selectionChannels,
}: {
  analysisId: string;
  selectionChannels: string[];
}) {
  const [presets, setPresets] = useState<BandrangePreset[]>([]);
  const [dialogPreset, setDialogPreset] = useState<BandrangePreset | null>(
    null,
  );
  const [editorOpen, setEditorOpen] = useState(false);

  const merged = useMemo(() => {
    const ov = loadBandrangeOverrides();
    return presets.map((p) => {
      const o = ov[p.id];
      if (o) return { ...p, lowHz: o[0], highHz: o[1] };
      return p;
    });
  }, [presets]);

  const load = useCallback(async () => {
    const tok = getToken();
    const prefix = API_BASE || "";
    const url = `${prefix}/api/v1/studio/eeg/bandrange-presets`;
    const res = await fetch(url, {
      headers: tok ? { Authorization: `Bearer ${tok}` } : {},
    });
    if (!res.ok) return;
    const json = (await res.json()) as {
      presets?: { id: string; lowHz: number; highHz: number }[];
    };
    setPresets(json.presets ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <details style={{ fontSize: 11 }}>
        <summary style={{ cursor: "pointer", userSelect: "none" }}>
          Analysis
        </summary>
        <div
          style={{
            marginTop: 4,
            paddingLeft: 8,
            borderLeft: "1px solid var(--ds-line, #ddd)",
          }}
        >
          <details style={{ marginBottom: 4 }}>
            <summary style={{ cursor: "pointer" }}>Bandrange filter</summary>
            <div style={{ display: "flex", flexDirection: "column", gap: 2, paddingTop: 4 }}>
              {merged.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  style={{
                    fontSize: 11,
                    textAlign: "left",
                    padding: "2px 6px",
                    cursor: "pointer",
                    background: "transparent",
                    border: "none",
                    color: "inherit",
                  }}
                  onClick={() => setDialogPreset(p)}
                >
                  {p.id} ({p.lowHz}–{p.highHz} Hz)
                </button>
              ))}
              <button
                type="button"
                style={{ fontSize: 10, opacity: 0.85, marginTop: 4 }}
                onClick={() => setEditorOpen(true)}
              >
                Setup → EEG Bandranges…
              </button>
            </div>
          </details>
        </div>
      </details>

      <BandrangeDialog
        open={dialogPreset != null}
        onOpenChange={(v) => {
          if (!v) setDialogPreset(null);
        }}
        analysisId={analysisId}
        preset={dialogPreset}
        selectionChannels={selectionChannels}
      />

      <BandrangeEditorDialog open={editorOpen} onOpenChange={setEditorOpen} />
    </>
  );
}
