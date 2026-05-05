import { useEffect, useMemo, useRef } from "react";

import type { ErpPeak, ErpResult } from "./types";

function peakXs(peaks: ErpPeak[], timesSec: number[], width: number, margin: number): { name: string; x: number }[] {
  const t0 = timesSec[0] ?? 0;
  const t1 = timesSec[timesSec.length - 1] ?? 1;
  const span = t1 - t0 || 1;
  return peaks.map((p) => ({
    name: p.name,
    x: margin + ((p.latencyMs / 1000 - t0) / span) * (width - 2 * margin),
  }));
}

function WaveformSvg({
  values,
  timesSec,
  peaks,
  height,
  width,
}: {
  values: number[];
  timesSec: number[];
  peaks: ErpPeak[];
  height: number;
  width: number;
}) {
  const margin = 24;
  if (!values.length || !timesSec.length) {
    return <svg width={width} height={height} />;
  }
  const vmin = Math.min(...values);
  const vmax = Math.max(...values);
  const vspan = vmax - vmin || 1;
  const n = Math.min(values.length, timesSec.length);
  const pts: string[] = [];
  for (let i = 0; i < n; i++) {
    const x = margin + (i / (n - 1 || 1)) * (width - 2 * margin);
    const y = margin + (1 - (values[i] - vmin) / vspan) * (height - 2 * margin);
    pts.push(`${x},${y}`);
  }
  const markers = peakXs(peaks, timesSec, width, margin);
  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <polyline fill="none" stroke="#2563eb" strokeWidth={1.2} points={pts.join(" ")} />
      {markers.map((m) => (
        <g key={m.name}>
          <line x1={m.x} x2={m.x} y1={margin} y2={height - margin} stroke="#f59e0b" strokeDasharray="3 2" />
          <text x={m.x + 2} y={12} fontSize={9} fill="#92400e">
            {m.name}
          </text>
        </g>
      ))}
    </svg>
  );
}

export function ModeChannelsByGroup({ result }: { result: ErpResult }) {
  const ch = result.channelNames.length || 1;
  const w = 280;
  const h = 64;
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {result.waveforms.map((wf) => (
        <div key={wf.class}>
          <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>{wf.class}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 360, overflowY: "auto" }}>
            {Array.from({ length: Math.min(ch, 8) }, (_, ci) => (
              <div key={ci} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 48, fontSize: 9, opacity: 0.8 }}>{result.channelNames[ci] ?? `Ch${ci}`}</span>
                <WaveformSvg
                  values={wf.meanUv[ci] ?? []}
                  timesSec={wf.timesSec}
                  peaks={result.peaks.filter((p) => p.channelIndex === ci)}
                  height={h}
                  width={w}
                />
              </div>
            ))}
            {ch > 8 ?
              <span style={{ fontSize: 10, opacity: 0.6 }}>Showing first 8 channels…</span>
            : null}
          </div>
        </div>
      ))}
    </div>
  );
}

export function ModeGroupsByChannel({ result }: { result: ErpResult }) {
  const ch = Math.min(result.channelNames.length || 1, 8);
  const w = 280;
  const h = 64;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {Array.from({ length: ch }, (_, ci) => (
        <div key={ci}>
          <div style={{ fontSize: 11, fontWeight: 600 }}>{result.channelNames[ci] ?? `Ch${ci}`}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {result.waveforms.map((wf) => (
              <div key={wf.class}>
                <div style={{ fontSize: 9, opacity: 0.75 }}>{wf.class}</div>
                <WaveformSvg
                  values={wf.meanUv[ci] ?? []}
                  timesSec={wf.timesSec}
                  peaks={result.peaks.filter((p) => p.channelIndex === ci)}
                  height={h}
                  width={w}
                />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function drawHeat(
  canvas: HTMLCanvasElement,
  matrix: number[][],
  opts: { width: number; height: number; labelX: string; labelY: string },
) {
  const ctx = canvas.getContext("2d");
  if (!ctx || !matrix.length || !matrix[0]?.length) return;
  const { width, height } = opts;
  canvas.width = width;
  canvas.height = height;
  let mn = Infinity;
  let mx = -Infinity;
  for (const row of matrix) {
    for (const v of row) {
      mn = Math.min(mn, v);
      mx = Math.max(mx, v);
    }
  }
  const span = mx - mn || 1;
  const rows = matrix.length;
  const cols = matrix[0].length;
  const cw = width / cols;
  const rh = height / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const t = (matrix[r][c] - mn) / span;
      const g = Math.floor(255 * (1 - t));
      ctx.fillStyle = `rgb(${g},${120 + Math.floor(t * 80)},${200 - Math.floor(t * 100)})`;
      ctx.fillRect(c * cw, r * rh, cw + 0.5, rh + 0.5);
    }
  }
}

export function ModeTimeGroupMap({ result }: { result: ErpResult }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const merged = useMemo(() => {
    const matrices = result.waveforms.map((wf) => {
      const nT = wf.timesSec.length;
      const ch = wf.meanUv.length;
      const row: number[] = [];
      for (let t = 0; t < nT; t++) {
        let s = 0;
        for (let c = 0; c < ch; c++) s += wf.meanUv[c][t] ?? 0;
        row.push(ch ? s / ch : 0);
      }
      return [row];
    });
    return matrices.length ? matrices.reduce((a, b) => a.concat(b), [] as number[][]) : [];
  }, [result.waveforms]);

  useEffect(() => {
    const c = ref.current;
    if (!c || !merged.length) return;
    drawHeat(c, merged, { width: 420, height: 80 * merged.length, labelX: "time", labelY: "group" });
  }, [merged]);

  return (
    <div>
      <div style={{ fontSize: 10, opacity: 0.75, marginBottom: 4 }}>Time × condition (mean across channels)</div>
      <canvas ref={ref} style={{ maxWidth: "100%", border: "1px solid #e5e7eb", borderRadius: 6 }} />
    </div>
  );
}

export function ModeGroupTimeMap({ result }: { result: ErpResult }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const matrix = useMemo(() => {
    const nT = result.waveforms[0]?.timesSec.length ?? 0;
    return result.waveforms.map((wf) => {
      const ch = wf.meanUv.length;
      const row: number[] = [];
      for (let t = 0; t < nT; t++) {
        let s = 0;
        for (let c = 0; c < ch; c++) s += wf.meanUv[c][t] ?? 0;
        row.push(ch ? s / ch : 0);
      }
      return row;
    });
  }, [result.waveforms]);

  useEffect(() => {
    const c = ref.current;
    if (!c || !matrix.length) return;
    drawHeat(c, matrix, { width: 420, height: 120, labelX: "time", labelY: "group" });
  }, [matrix]);

  return (
    <div>
      <div style={{ fontSize: 10, opacity: 0.75, marginBottom: 4 }}>Condition × time (mean across channels)</div>
      <canvas ref={ref} style={{ maxWidth: "100%", border: "1px solid #e5e7eb", borderRadius: 6 }} />
    </div>
  );
}

export function ModeFormattedPage({ result }: { result: ErpResult }) {
  const lines: string[] = [];
  lines.push(`Analysis: ${result.analysisId}`);
  lines.push(`Channels: ${result.channelNames.join(", ")}`);
  for (const wf of result.waveforms) {
    lines.push(`Condition ${wf.class}: n=${wf.nTrials}`);
  }
  lines.push("Peaks (channel 0 heuristic):");
  for (const p of result.peaks) {
    lines.push(`  ${p.name}: ${p.latencyMs.toFixed(1)} ms, ${p.amplitudeUv.toFixed(2)} µV (ch ${p.channelIndex})`);
  }
  if (result.warnLowTrialCount) lines.push("Warning: low trial count in at least one condition.");
  return (
    <pre
      style={{
        fontSize: 11,
        lineHeight: 1.45,
        padding: 12,
        background: "#f8fafc",
        borderRadius: 8,
        overflow: "auto",
        maxHeight: 400,
      }}
    >
      {lines.join("\n")}
    </pre>
  );
}

export type ErpViewTab =
  | "ch_grp"
  | "grp_ch"
  | "t_g"
  | "g_t"
  | "page";

export function ErpActiveMode({ tab, result }: { tab: ErpViewTab; result: ErpResult }) {
  switch (tab) {
    case "ch_grp":
      return <ModeChannelsByGroup result={result} />;
    case "grp_ch":
      return <ModeGroupsByChannel result={result} />;
    case "t_g":
      return <ModeTimeGroupMap result={result} />;
    case "g_t":
      return <ModeGroupTimeMap result={result} />;
    case "page":
      return <ModeFormattedPage result={result} />;
    default:
      return null;
  }
}
