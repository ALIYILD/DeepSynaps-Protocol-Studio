import type { RoiRow } from "./types";

export function RoiTable({ rows }: { rows: RoiRow[] }) {
  if (!rows?.length) return <div style={{ fontSize: 11, opacity: 0.7 }}>No ROI rows</div>;
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
      <thead>
        <tr style={{ borderBottom: "1px solid #ddd", textAlign: "left" }}>
          <th>#</th>
          <th>MNI (mm)</th>
          <th>Region (guess)</th>
          <th>Laterality</th>
          <th>BA (guess)</th>
          <th>Value</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.rank} style={{ borderBottom: "1px solid #eee" }}>
            <td>{r.rank}</td>
            <td>
              {r.peakMm?.map((x) => x.toFixed(1)).join(", ") ?? "—"}
            </td>
            <td>{r.labelGuess ?? "—"}</td>
            <td>{r.laterality ?? "—"}</td>
            <td>{r.brodmannGuess ?? "—"}</td>
            <td>{r.value != null ? r.value.toFixed(4) : "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
