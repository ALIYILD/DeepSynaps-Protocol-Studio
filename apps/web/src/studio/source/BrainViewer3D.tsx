import { useMemo } from "react";

/** Lightweight 3D-ish projection — replace with Three.js + mesh when cortical surface assets ship. */

function proj(x: number, y: number, z: number): { px: number; py: number; s: number } {
  const X = x * 0.012 + 140;
  const Y = -z * 0.014 + 110;
  const s = Math.max(4, 10 - Math.abs(y) * 0.01);
  return { px: X, py: Y, s };
}

export function BrainViewer3D({
  peakMm,
  dipolesMm,
}: {
  peakMm?: number[];
  dipolesMm?: number[][];
}) {
  const peakDot = useMemo(() => {
    if (!peakMm || peakMm.length < 3) return null;
    return proj(peakMm[0], peakMm[1], peakMm[2]);
  }, [peakMm]);

  const dipDots = useMemo(() => {
    if (!dipolesMm?.length) return [];
    return dipolesMm.map((p) => proj(p[0], p[1], p[2]));
  }, [dipolesMm]);

  return (
    <svg width={280} height={220} style={{ border: "1px solid #e2e8f0", borderRadius: 10, background: "#f8fafc" }}>
      <ellipse cx={140} cy={115} rx={95} ry={100} fill="#e2e8f0" stroke="#94a3b8" strokeWidth={1} />
      <text x={10} y={18} style={{ fontSize: 10, fill: "#475569" }}>
        Head (XZ projection · mm)
      </text>
      {dipDots.map((d, i) => (
        <circle key={i} cx={d.px} cy={d.py} r={d.s * 0.35} fill="#38bdf8" opacity={0.6} />
      ))}
      {peakDot ?
        <circle cx={peakDot.px} cy={peakDot.py} r={8} fill="#dc2626" opacity={0.85} />
      : null}
      {peakDot ?
        <text x={peakDot.px + 10} y={peakDot.py - 8} style={{ fontSize: 9, fill: "#991b1b" }}>
          peak
        </text>
      : null}
    </svg>
  );
}
