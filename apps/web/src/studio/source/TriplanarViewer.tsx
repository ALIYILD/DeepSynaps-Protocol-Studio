/** Orthogonal slice placeholders — swap for vtk.js / niivue when NIfTI streaming lands. */

export function TriplanarViewer({
  peakMm,
  threshold,
}: {
  peakMm?: number[];
  threshold: number;
}) {
  const label = peakMm?.length === 3 ? peakMm.map((x) => x.toFixed(0)).join(", ") : "—";
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
      {(["Axial", "Coronal", "Sagittal"] as const).map((plane) => (
        <div key={plane} style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: 8, minHeight: 100 }}>
          <div style={{ fontSize: 10, fontWeight: 600 }}>{plane}</div>
          <div style={{ fontSize: 9, opacity: 0.75, marginTop: 6 }}>
            Peak @ MNI [{label}] mm · thr {threshold.toFixed(2)}
          </div>
          <div
            style={{
              marginTop: 8,
              height: 72,
              background: "linear-gradient(135deg,#e0e7ff,#fef3c7)",
              borderRadius: 6,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 9,
              opacity: 0.85,
            }}
          >
            Volume slice (NIfTI pipeline)
          </div>
        </div>
      ))}
    </div>
  );
}
