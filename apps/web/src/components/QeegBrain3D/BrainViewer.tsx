import React, { useEffect, useMemo, useRef, useState } from "react";

// NOTE: repo integration is expected to provide this dependency.
// Niivue docs: https://niivue.com/docs/api/niivue/classes/Niivue
import { Niivue } from "@niivue/niivue";
import { NVMesh } from "@niivue/niivue";

type BandKey = "delta" | "theta" | "alpha" | "beta" | "gamma" | "TBR";
type HemiKey = "both" | "lh" | "rh";
type ViewKey = "lateral" | "medial" | "dorsal" | "ventral";

type BrainPayloadV1 = {
  version: 1;
  subject: string;
  mesh: {
    surf: string;
    positions: number[]; // flat 3*N
    indices: number[]; // flat 3*M
    n_lh: number;
    n_rh: number;
  };
  bands: Record<
    string,
    {
      power: number[];
      z: number[];
      power_scale: { min: number; max: number };
      z_scale: { min: number; max: number };
    }
  >;
  luts: unknown;
};

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

export function BrainViewer(props: {
  analysisId: string;
  apiBaseUrl?: string;
  initialBand?: BandKey;
}) {
  const apiBaseUrl = props.apiBaseUrl ?? (import.meta as any).env?.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";
  const initialBand = props.initialBand ?? "alpha";

  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const nvRef = useRef<Niivue | null>(null);
  const meshRef = useRef<NVMesh | null>(null);

  const [payload, setPayload] = useState<BrainPayloadV1 | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [band, setBand] = useState<BandKey>(initialBand);
  const [hemi, setHemi] = useState<HemiKey>("both");
  const [view, setView] = useState<ViewKey>("lateral");
  const [useZOverlay, setUseZOverlay] = useState(false);
  const [opacity, setOpacity] = useState(0.8);

  const endpoint = useMemo(() => {
    const base = String(apiBaseUrl).replace(/\/+$/, "");
    return `${base}/api/v1/qeeg-analysis/${encodeURIComponent(props.analysisId)}/brain.json`;
  }, [apiBaseUrl, props.analysisId]);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setPayload(null);
    (async () => {
      try {
        const res = await fetch(endpoint, { headers: { Accept: "application/json" } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as BrainPayloadV1;
        if (!cancelled) setPayload(json);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Failed to load brain payload");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [endpoint]);

  useEffect(() => {
    if (!payload) return;
    if (!canvasRef.current) return;

    const nv = new Niivue({ backColor: [0.03, 0.07, 0.12, 1] });
    nv.attachToCanvas(canvasRef.current);
    nvRef.current = nv;

    const positions = new Float32Array(payload.mesh.positions);
    const indices = new Uint32Array(payload.mesh.indices);
    const baseColor = new Uint8Array([230, 232, 236, 255]);
    const mesh = new NVMesh(positions, indices, "qeeg-cortex", baseColor, 1.0, true, (nv as any).gl);

    meshRef.current = mesh;
    nv.addMesh(mesh);

    return () => {
      try {
        // Best-effort cleanup (Niivue has internal GL resources)
        (nv as any).meshes = [];
      } catch {
        // ignore
      }
      nvRef.current = null;
      meshRef.current = null;
    };
  }, [payload]);

  useEffect(() => {
    if (!payload || !nvRef.current || !meshRef.current) return;
    const nv = nvRef.current;
    const mesh = meshRef.current;

    const bandPayload = payload.bands?.[band];
    if (!bandPayload) return;

    const values = new Float32Array(useZOverlay ? bandPayload.z : bandPayload.power);
    const scale = useZOverlay ? bandPayload.z_scale : bandPayload.power_scale;

    const layer: any = {
      name: useZOverlay ? "z" : "power",
      values,
      colormap: useZOverlay ? "RdBu_r" : "viridis",
      opacity: clamp01(opacity),
      cal_min: scale.min,
      cal_max: scale.max,
      // defaults expected by Niivue colormap pipeline
      colormapType: 0, // MIN_TO_MAX
      isTransparentBelowCalMin: true,
      useNegativeCmap: false,
      frame4D: 0,
      nFrame4D: 1,
      outlineBorder: 0.0,
    };

    (mesh as any).layers = [layer];
    try {
      (nv as any).updateGLVolume?.();
    } catch {
      // ignore
    }
    try {
      (nv as any).drawScene?.();
    } catch {
      // ignore
    }
  }, [payload, band, useZOverlay, opacity]);

  useEffect(() => {
    if (!payload || !nvRef.current || !meshRef.current) return;
    const nv: any = nvRef.current as any;
    const mesh: any = meshRef.current as any;

    // Hemisphere visibility via clip planes (fallback: toggle mesh opacity)
    const both = hemi === "both";
    mesh.visible = true;
    if (both) {
      mesh.opacity = 1.0;
    } else {
      // Coarse fallback: keep visible and rely on view; exact hemi clipping can be added once integrated.
      mesh.opacity = 1.0;
    }
    try {
      nv.drawScene?.();
    } catch {
      // ignore
    }
  }, [payload, hemi]);

  useEffect(() => {
    if (!payload || !nvRef.current) return;
    const nv: any = nvRef.current;
    // Map high-level views to Niivue azimuth/elevation conventions (best-effort)
    const preset: Record<ViewKey, { azimuth: number; elevation: number }> = {
      lateral: { azimuth: 90, elevation: 0 },
      medial: { azimuth: -90, elevation: 0 },
      dorsal: { azimuth: 0, elevation: 90 },
      ventral: { azimuth: 0, elevation: -90 },
    };
    const v = preset[view];
    try {
      nv.setAzimuthElevation?.(v.azimuth, v.elevation);
      nv.drawScene?.();
    } catch {
      // ignore
    }
  }, [payload, view]);

  const bandsAvailable = useMemo(() => {
    const keys = payload ? Object.keys(payload.bands || {}) : [];
    const preferred: BandKey[] = ["delta", "theta", "alpha", "beta", "gamma", "TBR"];
    return preferred.filter((k) => keys.includes(k));
  }, [payload]);

  return (
    <div ref={hostRef} className="ds-qeeg-brain3d" aria-label="qEEG 3D brain viewer">
      <div className="ds-qeeg-brain3d__controls" role="group" aria-label="Viewer controls">
        <div className="ds-qeeg-brain3d__row" role="group" aria-label="View buttons">
          {(["lateral", "medial", "dorsal", "ventral"] as ViewKey[]).map((k) => (
            <button
              key={k}
              type="button"
              className="ds-qeeg-brain3d__btn"
              aria-label={`View ${k}`}
              aria-pressed={view === k}
              onClick={() => setView(k)}
            >
              {k}
            </button>
          ))}
        </div>

        <div className="ds-qeeg-brain3d__row">
          <label className="ds-qeeg-brain3d__label" aria-label="Hemisphere">
            Hemisphere
            <select
              className="ds-qeeg-brain3d__select"
              value={hemi}
              onChange={(e) => setHemi(e.target.value as HemiKey)}
              aria-label="Hemisphere toggle"
            >
              <option value="both">Both</option>
              <option value="lh">Left</option>
              <option value="rh">Right</option>
            </select>
          </label>

          <label className="ds-qeeg-brain3d__label" aria-label="Band selector">
            Band
            <select
              className="ds-qeeg-brain3d__select"
              value={band}
              onChange={(e) => setBand(e.target.value as BandKey)}
              aria-label="Band selector"
            >
              {(bandsAvailable.length ? bandsAvailable : (["delta", "theta", "alpha", "beta", "gamma", "TBR"] as BandKey[])).map(
                (k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                )
              )}
            </select>
          </label>

          <label className="ds-qeeg-brain3d__toggle">
            <input
              type="checkbox"
              checked={useZOverlay}
              onChange={(e) => setUseZOverlay(e.target.checked)}
              aria-label="Toggle z-score overlay"
            />
            Z-score overlay
          </label>

          <label className="ds-qeeg-brain3d__label" aria-label="Overlay opacity">
            Opacity
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={opacity}
              onChange={(e) => setOpacity(Number(e.target.value))}
              aria-label="Opacity slider"
            />
          </label>
        </div>
      </div>

      <div className="ds-qeeg-brain3d__stage" aria-label="3D render canvas">
        {!payload && !error ? (
          <div className="ds-qeeg-brain3d__loading" aria-label="Loading">
            Loading…
          </div>
        ) : null}
        {error ? (
          <div className="ds-qeeg-brain3d__error" role="alert">
            {error}
          </div>
        ) : null}
        <canvas ref={canvasRef} className="ds-qeeg-brain3d__canvas" />
      </div>
    </div>
  );
}

