import { useMemo, useState } from "react";

import type { TrialSlice } from "../stores/eegViewer";
import { postTrialSync } from "./eventApi";

export function TrialLabelsDialog({
  open,
  onOpenChange,
  analysisId,
  trials,
  onReload,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  analysisId: string;
  trials: TrialSlice[];
  onReload: () => void;
}) {
  const [deltaMs, setDeltaMs] = useState(0);
  const [busy, setBusy] = useState(false);

  const rows = useMemo(() => trials, [trials]);

  if (!open) return null;

  const applySync = async () => {
    if (analysisId === "demo") {
      window.alert("Trials sync requires a saved analysis id.");
      return;
    }
    setBusy(true);
    try {
      await postTrialSync(analysisId, deltaMs);
      onReload();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "sync failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.35)",
        zIndex: 96,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onMouseDown={() => onOpenChange(false)}
    >
      <div
        style={{
          background: "var(--ds-surface, #fff)",
          border: "1px solid var(--ds-line, #ccc)",
          borderRadius: 8,
          padding: 16,
          width: "min(720px, 96vw)",
          maxHeight: "86vh",
          overflow: "auto",
          fontSize: 12,
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Trial labels (ERP)</div>
        <p style={{ opacity: 0.75, marginBottom: 8 }}>
          Adjust alignment (ms) shifts all trial onsets. Exclusion toggles in the
          trial bar update ERP inclusion (M9).
        </p>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
          <label>
            Δ ms
            <input
              type="number"
              step={1}
              value={deltaMs}
              onChange={(e) => setDeltaMs(Number(e.target.value))}
              style={{ width: 88, marginLeft: 6 }}
            />
          </label>
          <button type="button" disabled={busy} onClick={() => void applySync()}>
            {busy ? "…" : "Apply sync"}
          </button>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
              <th>#</th>
              <th>Time s</th>
              <th>Class</th>
              <th>In</th>
              <th>RT ms</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id} style={{ opacity: t.included ? 1 : 0.45 }}>
                <td>{t.index}</td>
                <td>{t.startSec.toFixed(4)}</td>
                <td>{t.stimulusClass ?? t.kind}</td>
                <td>{t.included ? "yes" : "no"}</td>
                <td>{t.responseMs ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
          <button type="button" onClick={() => onOpenChange(false)}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
