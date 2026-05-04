import * as React from "react";

import { postEvent } from "../events/eventApi";
import { useAiStore } from "../stores/ai";
import { DetectionDialog } from "./DetectionDialog";
import { SpikeBar } from "./SpikeBar";
import { postSpikeDetect, postSpikeDipoleAtPeak } from "./spikesApi";
import type { SpikeDetectParams, SpikeDipoleResponse, SpikeRow } from "./types";

function spikePayloadText(sp: SpikeRow): string {
  return JSON.stringify({
    v: 1,
    peakSec: sp.peakSec,
    channel: sp.channel,
    peakToPeakUv: sp.peakToPeakUv,
    durationMs: sp.durationMs,
    aiClass: sp.aiClass,
    aiConfidence: sp.aiConfidence,
    accepted: sp.accepted ?? true,
  });
}

export function SpikeWindow({
  open,
  onOpenChange,
  analysisId,
  channelNames,
  fromSec,
  toSec,
  jumpToSec,
  onDetected,
  onTimelineReload,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  analysisId: string;
  channelNames: string[];
  fromSec: number;
  toSec: number;
  jumpToSec?: (t: number) => void;
  onDetected?: (rows: SpikeRow[]) => void;
  onTimelineReload?: () => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [spikes, setSpikes] = React.useState<SpikeRow[]>([]);
  const [selected, setSelected] = React.useState<SpikeRow | null>(null);
  const [dipole, setDipole] = React.useState<SpikeDipoleResponse | null>(null);
  const [dlg, setDlg] = React.useState(false);
  const [params, setParams] = React.useState<SpikeDetectParams>(() => ({
    fromSec,
    toSec,
    ampUvMin: 70,
    durMsMin: 20,
    durMsMax: 70,
    derivZMin: 3.5,
    useAi: true,
    aiConfidenceMin: 0,
  }));

  const spikeHook = useAiStore((s) => s.spikeDetectionChanged);
  const sourceLocalizationChanged = useAiStore((s) => s.sourceLocalizationChanged);

  React.useEffect(() => {
    if (open) {
      setParams((p) => ({ ...p, fromSec, toSec }));
    }
  }, [open, fromSec, toSec]);

  const runDetect = async (p: SpikeDetectParams) => {
    setDlg(false);
    setBusy(true);
    setErr(null);
    try {
      const out = await postSpikeDetect(analysisId, p);
      if (!out.ok && out.error) setErr(out.error);
      const rows = (out.spikes ?? []).map((r) => ({ ...r, accepted: true }));
      setSpikes(rows);
      onDetected?.(rows);
      spikeHook({
        analysisId,
        summary: {
          count: rows.length,
          byClass: tally(rows),
          windowSec: [p.fromSec, p.toSec],
        },
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "detect failed");
    } finally {
      setBusy(false);
    }
  };

  const fitDipole = async () => {
    if (!selected) return;
    setBusy(true);
    setErr(null);
    try {
      const out = await postSpikeDipoleAtPeak(analysisId, selected.peakSec);
      setDipole(out);
      if (out.ok && out.timesSec?.length) {
        sourceLocalizationChanged({
          analysisId,
          kind: "dipole",
          summary: {
            spikePeakSec: selected.peakSec,
            channel: selected.channel,
            gof: out.goodnessOfFit,
            ecc: out.eccentricityProxy,
          },
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "dipole failed");
    } finally {
      setBusy(false);
    }
  };

  const persistSpike = React.useCallback(
    async (sp: SpikeRow) => {
      await postEvent(analysisId, {
        type: "spike",
        fromSec: sp.peakSec,
        text: spikePayloadText(sp),
        channelScope: "selection",
        channels: [sp.channel],
      });
      onTimelineReload?.();
    },
    [analysisId, onTimelineReload],
  );

  const menu = React.useCallback(
    async (action: string, sp: SpikeRow) => {
      const a = action.toLowerCase();
      if (a === "add") {
        const manual: SpikeRow = {
          ...sp,
          peakSec: sp.peakSec,
          channel: sp.channel,
          accepted: true,
        };
        setSpikes((s) => [...s, manual]);
      }
      if (a === "delete") {
        setSpikes((s) => s.filter((x) => !(x.peakSec === sp.peakSec && x.channel === sp.channel)));
        setSelected((cur) => (cur?.peakSec === sp.peakSec && cur.channel === sp.channel ? null : cur));
      }
      if (a === "persist") await persistSpike(sp);
      if (a === "copy") {
        await navigator.clipboard.writeText(JSON.stringify(sp, null, 2));
      }
    },
    [persistSpike],
  );

  if (!open) return null;

  return (
    <>
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
            color: "var(--ds-text)",
            padding: 12,
            borderRadius: 8,
            maxWidth: 560,
            maxHeight: "92vh",
            overflow: "auto",
            boxShadow: "0 12px 40px rgba(0,0,0,0.25)",
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Spike detection</div>
          <div style={{ fontSize: 11, opacity: 0.85, marginBottom: 8 }}>
            Top pane: use main EEG viewer (montage swap there). Bottom: spike marks for current page —
            click seeks the viewer.
          </div>
          {err ? (
            <div style={{ color: "#b91c1c", fontSize: 12, marginBottom: 8 }}>{err}</div>
          ) : null}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
            <button type="button" disabled={busy} onClick={() => setDlg(true)}>
              Detection settings…
            </button>
            <button type="button" disabled={busy} onClick={() => void runDetect(params)}>
              Run detection
            </button>
            <button type="button" onClick={() => onOpenChange(false)}>
              Close
            </button>
          </div>
          <div style={{ marginBottom: 6 }}>Spike navigator (current page)</div>
          <SpikeBar
            fromSec={fromSec}
            toSec={toSec}
            spikes={spikes}
            selectedPeakSec={selected?.peakSec ?? null}
            onSelect={(sp) => {
              setSelected(sp);
              jumpToSec?.(sp.peakSec);
            }}
            onContextMenu={(e, sp) => {
              const action = window.prompt(
                "add | delete | persist | copy",
                "persist",
              );
              if (action) void menu(action.trim(), sp);
            }}
          />
          <div style={{ display: "flex", gap: 12, marginTop: 12, alignItems: "flex-start" }}>
            <div style={{ flex: 1, minWidth: 140 }}>
              <div style={{ fontSize: 11, fontWeight: 600 }}>Voltage map (peak)</div>
              <div
                style={{
                  marginTop: 4,
                  height: 72,
                  border: "1px dashed var(--ds-line,#ccc)",
                  borderRadius: 4,
                  fontSize: 10,
                  padding: 6,
                  opacity: 0.85,
                }}
              >
                Topomap at peak — wire to MNE viz / canvas (placeholder).
                {selected ?
                  ` Peak ${selected.channel} @ ${selected.peakSec.toFixed(3)}s`
                : " Select a spike."}
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 140 }}>
              <div style={{ fontSize: 11, fontWeight: 600 }}>Dipole @ peak (M10)</div>
              <button type="button" disabled={busy || !selected} onClick={() => void fitDipole()}>
                Fit dipole
              </button>
              {dipole?.ok && dipole.goodnessOfFit?.length ?
                <pre style={{ fontSize: 10, marginTop: 6, whiteSpace: "pre-wrap" }}>
                  RRE/GOF mean {avg(dipole.goodnessOfFit).toFixed(3)} · ECC mean{" "}
                  {avg(dipole.eccentricityProxy ?? []).toFixed(3)}
                </pre>
              : dipole?.error ?
                <div style={{ fontSize: 10, color: "#b91c1c" }}>{dipole.error}</div>
              : null}
            </div>
          </div>
          <table style={{ width: "100%", fontSize: 11, marginTop: 10, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid var(--ds-line,#ddd)" }}>
                <th>t (s)</th>
                <th>ch</th>
                <th>p2p µV</th>
                <th>dur</th>
                <th>AI</th>
                <th>conf</th>
              </tr>
            </thead>
            <tbody>
              {spikes.map((r, i) => (
                <tr
                  key={`${r.peakSec}-${r.channel}-${i}`}
                  style={{
                    cursor: "pointer",
                    background:
                      selected?.peakSec === r.peakSec && selected.channel === r.channel ?
                        "rgba(124,58,237,0.08)"
                      : undefined,
                  }}
                  onClick={() => {
                    setSelected(r);
                    jumpToSec?.(r.peakSec);
                  }}
                >
                  <td>{r.peakSec.toFixed(4)}</td>
                  <td>{r.channel}</td>
                  <td>{r.peakToPeakUv?.toFixed(0) ?? "—"}</td>
                  <td>{r.durationMs?.toFixed(0) ?? "—"}</td>
                  <td>{r.aiClass ?? "—"}</td>
                  <td>{r.aiConfidence?.toFixed(2) ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {busy ? <div style={{ fontSize: 11, marginTop: 8 }}>Working…</div> : null}
        </div>
      </div>
      <DetectionDialog
        open={dlg}
        initial={params}
        channelNames={channelNames}
        onCancel={() => setDlg(false)}
        onConfirm={(p) => {
          setParams(p);
          void runDetect(p);
        }}
      />
    </>
  );
}

function tally(rows: SpikeRow[]): Record<string, number> {
  const o: Record<string, number> = {};
  for (const r of rows) {
    const k = r.aiClass ?? "unknown";
    o[k] = (o[k] ?? 0) + 1;
  }
  return o;
}

function avg(a: number[]): number {
  if (!a.length) return 0;
  return a.reduce((s, x) => s + x, 0) / a.length;
}
