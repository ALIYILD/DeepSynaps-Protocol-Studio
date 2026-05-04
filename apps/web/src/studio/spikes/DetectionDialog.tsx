import * as React from "react";

import type { SpikeDetectParams } from "./types";

export function DetectionDialog({
  open,
  initial,
  channelNames,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  initial: SpikeDetectParams;
  channelNames: string[];
  onCancel: () => void;
  onConfirm: (p: SpikeDetectParams) => void;
}) {
  if (!open) return null;
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.35)",
        zIndex: 1200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        style={{
          background: "var(--ds-surface, #fff)",
          color: "var(--ds-text, #111)",
          padding: 16,
          borderRadius: 8,
          minWidth: 320,
          maxHeight: "90vh",
          overflow: "auto",
          boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Spike detection settings</div>
        <DialogBody initial={initial} channelNames={channelNames} onConfirm={onConfirm} onCancel={onCancel} />
      </div>
    </div>
  );
}

const lb: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  fontSize: 12,
  marginBottom: 8,
};
const inp: React.CSSProperties = { padding: "4px 8px", fontSize: 12 };

function DialogBody({
  initial,
  channelNames,
  onConfirm,
  onCancel,
}: {
  initial: SpikeDetectParams;
  channelNames: string[];
  onConfirm: (p: SpikeDetectParams) => void;
  onCancel: () => void;
}) {
  const [ampUvMin, setAmpUvMin] = React.useState(initial.ampUvMin);
  const [durMsMin, setDurMsMin] = React.useState(initial.durMsMin);
  const [durMsMax, setDurMsMax] = React.useState(initial.durMsMax);
  const [derivZMin, setDerivZMin] = React.useState(initial.derivZMin);
  const [useAi, setUseAi] = React.useState(initial.useAi);
  const [aiConfidenceMin, setAiConfidenceMin] = React.useState(initial.aiConfidenceMin);
  const [selCh, setSelCh] = React.useState<string[] | undefined>(initial.channels);

  return (
    <>
      <label style={lb}>
        Amplitude min (µV)
        <input
          type="number"
          style={inp}
          value={ampUvMin}
          onChange={(e) => setAmpUvMin(Number(e.target.value))}
        />
      </label>
      <label style={lb}>
        Duration min (ms)
        <input
          type="number"
          style={inp}
          value={durMsMin}
          onChange={(e) => setDurMsMin(Number(e.target.value))}
        />
      </label>
      <label style={lb}>
        Duration max (ms)
        <input
          type="number"
          style={inp}
          value={durMsMax}
          onChange={(e) => setDurMsMax(Number(e.target.value))}
        />
      </label>
      <label style={lb}>
        |s′′| z-min
        <input
          type="number"
          style={inp}
          step={0.1}
          value={derivZMin}
          onChange={(e) => setDerivZMin(Number(e.target.value))}
        />
      </label>
      <label style={{ ...lb, flexDirection: "row", alignItems: "center", gap: 8 }}>
        <input type="checkbox" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} />
        AI classify (ONNX or heuristic)
      </label>
      <label style={lb}>
        AI confidence min (0–1)
        <input
          type="number"
          style={inp}
          step={0.05}
          min={0}
          max={1}
          value={aiConfidenceMin}
          onChange={(e) => setAiConfidenceMin(Number(e.target.value))}
        />
      </label>
      <div style={{ marginTop: 8, fontSize: 11, opacity: 0.85 }}>Channels (empty = all EEG)</div>
      <select
        multiple
        size={Math.min(8, Math.max(3, channelNames.length || 1))}
        style={{ width: "100%", marginTop: 4 }}
        value={selCh ?? []}
        onChange={(e) => {
          const v = Array.from(e.target.selectedOptions).map((o) => o.value);
          setSelCh(v.length ? v : undefined);
        }}
      >
        {channelNames.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "flex-end" }}>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          onClick={() =>
            onConfirm({
              ...initial,
              ampUvMin,
              durMsMin,
              durMsMax,
              derivZMin,
              useAi,
              aiConfidenceMin,
              channels: selCh,
            })
          }
        >
          Run
        </button>
      </div>
    </>
  );
}
