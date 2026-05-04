import { useMemo, useState } from "react";

import { BrainViewer3D } from "./BrainViewer3D";
import { Coregistration } from "./Coregistration";
import { RoiTable } from "./RoiTable";
import { TriplanarViewer } from "./TriplanarViewer";
import type { LoretaErpResponse, LoretaSpectraResponse } from "./types";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  analysisId: string;
  kind: "erp" | "spectra";
  data: LoretaErpResponse | LoretaSpectraResponse;
};

export function LoretaWindow({ open, onOpenChange, analysisId, kind, data }: Props) {
  const [thr, setThr] = useState(0.5);
  const [tIdx, setTIdx] = useState(0);

  const peakMm = useMemo(() => {
    if (kind === "erp" && data.ok && "peak" in data) return (data as LoretaErpResponse).peak?.mniMmHeadApprox;
    if (kind === "spectra" && data.ok) return (data as LoretaSpectraResponse).peak?.mniMmHeadApprox;
    return undefined;
  }, [data, kind]);

  const roi = useMemo(() => {
    if (!data.ok) return [];
    return "roiTable" in data && data.roiTable ? data.roiTable : [];
  }, [data]);

  const prev = kind === "erp" && data.ok && "previewSeries" in data ? (data as LoretaErpResponse).previewSeries : null;
  const nT = prev?.timesSec?.length ?? 0;

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.5)",
        zIndex: 97,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 10,
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          maxWidth: 920,
          width: "100%",
          maxHeight: "96vh",
          overflow: "auto",
          border: "1px solid #ccc",
        }}
      >
        <header
          style={{
            padding: "10px 14px",
            borderBottom: "1px solid #eee",
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <strong>LORETA / sLORETA</strong>
          <span style={{ fontSize: 10, opacity: 0.75 }}>{kind === "erp" ? "ERP source" : "Spectra power map"}</span>
          <button type="button" style={{ marginLeft: "auto" }} onClick={() => onOpenChange(false)}>
            Close
          </button>
        </header>
        <div style={{ padding: 12 }}>
          {!data.ok ?
            <div style={{ color: "#b91c1c", fontSize: 12 }}>{data.error ?? "Failed"}</div>
          : null}
          {data.ok ?
            <>
              <Coregistration analysisId={analysisId} />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 10 }}>
                <BrainViewer3D peakMm={peakMm} />
                <div>
                  <div style={{ fontSize: 11, marginBottom: 6 }}>
                    {kind === "erp" && "peak" in data && (data as LoretaErpResponse).peak ?
                      <>
                        Peak latency ~ {(data as LoretaErpResponse).peak?.latencyMs?.toFixed(0) ?? "?"} ms ·{" "}
                        {(data as LoretaErpResponse).peak?.labelGuess}
                      </>
                    : (data as LoretaSpectraResponse).peak?.labelGuess}
                  </div>
                  <label style={{ fontSize: 11, display: "block" }}>
                    Threshold {thr.toFixed(2)}
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={thr}
                      onChange={(e) => setThr(Number(e.target.value))}
                    />
                  </label>
                </div>
              </div>
              <div style={{ marginTop: 12 }}>
                <TriplanarViewer peakMm={peakMm} threshold={thr} />
              </div>
              {prev && nT > 0 ?
                <div style={{ marginTop: 12 }}>
                  <label style={{ fontSize: 11 }}>
                    Time index ({prev.timesSec[tIdx]?.toFixed(3)} s)
                    <input
                      type="range"
                      min={0}
                      max={nT - 1}
                      value={Math.min(tIdx, nT - 1)}
                      onChange={(e) => setTIdx(Number(e.target.value))}
                    />
                  </label>
                  <svg width="100%" height={72} viewBox="0 0 400 60" preserveAspectRatio="none" style={{ marginTop: 6, border: "1px solid #e5e7eb", borderRadius: 6 }}>
                    <polyline
                      fill="none"
                      stroke="#2563eb"
                      strokeWidth={1.2}
                      points={prev.peakEnvelope.map((v, i) => {
                        const x = (i / Math.max(prev.peakEnvelope.length - 1, 1)) * 400;
                        const y = 55 - Math.min(55, Math.abs(v) * 3);
                        return `${x},${y}`;
                      }).join(" ")}
                    />
                  </svg>
                </div>
              : null}
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6 }}>ROI table</div>
                <RoiTable rows={roi} />
              </div>
            </>
          : null}
        </div>
      </div>
    </div>
  );
}
