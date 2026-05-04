import type { MouseEvent } from "react";

import type { SpikeRow } from "./types";

/** Horizontal strip with tick marks at spike times (WinEEG-style navigation). */
export function SpikeBar({
  fromSec,
  toSec,
  spikes,
  selectedPeakSec,
  height = 28,
  onSelect,
  onContextMenu,
}: {
  fromSec: number;
  toSec: number;
  spikes: SpikeRow[];
  selectedPeakSec: number | null;
  height?: number;
  onSelect: (sp: SpikeRow) => void;
  onContextMenu?: (e: MouseEvent, sp: SpikeRow) => void;
}) {
  const span = toSec - fromSec || 1;
  const w = 320;
  const x = (t: number) => ((t - fromSec) / span) * w;
  return (
    <div style={{ width: w, height, position: "relative", background: "rgba(0,0,0,0.04)" }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: "50%",
          height: 1,
          background: "var(--ds-line, #ccc)",
        }}
      />
      {spikes.map((sp, i) => {
        const sel =
          selectedPeakSec != null && Math.abs(sp.peakSec - selectedPeakSec) < 1e-6;
        return (
          <button
            key={`${sp.peakSec}-${sp.channel}-${i}`}
            type="button"
            title={`${sp.channel} ${sp.peakSec.toFixed(4)}s · ${sp.aiClass ?? "?"}`}
            onClick={() => onSelect(sp)}
            onContextMenu={(e) => {
              e.preventDefault();
              onContextMenu?.(e, sp);
            }}
            style={{
              position: "absolute",
              left: x(sp.peakSec) - 3,
              top: height / 2 - 5,
              width: 6,
              height: 10,
              borderRadius: 2,
              border: "none",
              padding: 0,
              cursor: "pointer",
              background: sel ? "#7c3aed" : "#64748b",
            }}
          />
        );
      })}
    </div>
  );
}
