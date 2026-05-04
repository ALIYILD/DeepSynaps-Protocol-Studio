import { useMemo } from "react";

import { BrainViewer3D } from "./BrainViewer3D";
import type { DipoleResponse } from "./types";

export function DipoleWindow({
  open,
  onOpenChange,
  data,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  data: DipoleResponse;
}) {
  const path = useMemo(() => {
    const g = data.goodnessOfFit ?? [];
    if (!g.length) return "";
    const h = 70;
    const w = 420;
    return g
      .map((v, i) => {
        const x = (i / Math.max(g.length - 1, 1)) * w;
        const y = h - Math.min(h, v * h);
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }, [data.goodnessOfFit]);

  const eccPath = useMemo(() => {
    const g = data.eccentricityProxy ?? [];
    if (!g.length) return "";
    const h = 70;
    const w = 420;
    return g
      .map((v, i) => {
        const x = (i / Math.max(g.length - 1, 1)) * w;
        const y = h - v * h;
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }, [data.eccentricityProxy]);

  if (!open) return null;

  const dips = (data.positionsM ?? []).map((p) => [p[0] * 1000, p[1] * 1000, p[2] * 1000]);

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
          maxWidth: 720,
          width: "100%",
          border: "1px solid #ccc",
          maxHeight: "96vh",
          overflow: "auto",
        }}
      >
        <header style={{ padding: "10px 14px", borderBottom: "1px solid #eee", display: "flex", alignItems: "center" }}>
          <strong>Dipole source (BrainLock-style)</strong>
          <button type="button" style={{ marginLeft: "auto" }} onClick={() => onOpenChange(false)}>
            Close
          </button>
        </header>
        <div style={{ padding: 12, fontSize: 11 }}>
          {!data.ok ?
            <div style={{ color: "#b91c1c" }}>{data.error ?? "Failed"}</div>
          : null}
          {data.ok ?
            <>
              <div style={{ fontSize: 10, opacity: 0.8, marginBottom: 8 }}>{data.note}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
                <BrainViewer3D dipolesMm={dips} />
                <div style={{ flex: 1, minWidth: 240 }}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>Goodness-of-fit (proxy)</div>
                  <svg width={420} height={76} style={{ border: "1px solid #e5e7eb", borderRadius: 6 }}>
                    <path d={path} fill="none" stroke="#7c3aed" strokeWidth={1.2} />
                  </svg>
                  <div style={{ fontWeight: 600, margin: "10px 0 4px" }}>Eccentricity proxy</div>
                  <svg width={420} height={76} style={{ border: "1px solid #e5e7eb", borderRadius: 6 }}>
                    <path d={eccPath} fill="none" stroke="#0d9488" strokeWidth={1.2} />
                  </svg>
                </div>
              </div>
            </>
          : null}
        </div>
      </div>
    </div>
  );
}
