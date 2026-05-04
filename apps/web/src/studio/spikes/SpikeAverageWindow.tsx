import * as React from "react";

import { postSpikeAverage } from "./spikesApi";
import type { SpikeAverageResponse, SpikeRow } from "./types";

export function SpikeAverageWindow({
  open,
  onOpenChange,
  analysisId,
  peaks,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  analysisId: string;
  peaks: SpikeRow[];
}) {
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [avg, setAvg] = React.useState<SpikeAverageResponse | null>(null);
  const [preMs, setPreMs] = React.useState(300);
  const [postMs, setPostMs] = React.useState(300);

  const run = async () => {
    if (!peaks.length) {
      setErr("Run spike detection first or add peaks.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const out = await postSpikeAverage(analysisId, peaks, preMs, postMs);
      if (!out.ok && out.error) setErr(out.error);
      setAvg(out);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "average failed");
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  const g = avg?.grandAverage;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.25)",
        zIndex: 1100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onOpenChange(false);
      }}
    >
      <div
        style={{
          background: "var(--ds-surface, #fff)",
          padding: 12,
          borderRadius: 8,
          maxWidth: 520,
          maxHeight: "90vh",
          overflow: "auto",
          boxShadow: "0 12px 40px rgba(0,0,0,0.25)",
        }}
      >
        <div style={{ fontWeight: 700 }}>Spike averaging</div>
        <div style={{ fontSize: 11, opacity: 0.85, marginBottom: 8 }}>
          Default −300 / +300 ms. Grand average + per-channel stacks feed LORETA/dipole via Source menu (M10).
        </div>
        {err ? <div style={{ color: "#b91c1c", fontSize: 12 }}>{err}</div> : null}
        <label style={{ fontSize: 12, display: "flex", gap: 8, marginTop: 8 }}>
          pre ms
          <input
            type="number"
            value={preMs}
            onChange={(e) => setPreMs(Number(e.target.value))}
          />
          post ms
          <input
            type="number"
            value={postMs}
            onChange={(e) => setPostMs(Number(e.target.value))}
          />
        </label>
        <div style={{ fontSize: 11, marginTop: 6 }}>Peaks loaded: {peaks.length}</div>
        <button type="button" style={{ marginTop: 8 }} disabled={busy} onClick={() => void run()}>
          Compute average
        </button>
        <button type="button" style={{ marginLeft: 8 }} onClick={() => onOpenChange(false)}>
          Close
        </button>
        {g?.nEpochs != null ?
          <div style={{ marginTop: 10, fontSize: 12 }}>
            Grand mean over {g.nEpochs} epochs · {g.channelNames?.length ?? 0} channels
          </div>
        : null}
        {g?.timesSec?.length ?
          <pre style={{ fontSize: 10, maxHeight: 160, overflow: "auto", marginTop: 8 }}>
            t₀={g.timesSec[0]?.toFixed(4)} … tₙ={g.timesSec[g.timesSec.length - 1]?.toFixed(4)} s
          </pre>
        : null}
        <div
          style={{
            marginTop: 8,
            height: 64,
            border: "1px dashed #ccc",
            borderRadius: 4,
            fontSize: 10,
            padding: 6,
          }}
        >
          Topomap at peak latency — render grand-average scalp map here (server PNG or Plotly).
        </div>
        {busy ? <div style={{ fontSize: 11, marginTop: 8 }}>Working…</div> : null}
      </div>
    </div>
  );
}
