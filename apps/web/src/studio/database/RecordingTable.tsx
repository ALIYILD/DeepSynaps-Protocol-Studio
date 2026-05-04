/** Main EEG database grid — patients (WinEEG-style columns). */

import type { CSSProperties } from "react";

import type { PatientListItem } from "./databaseApi";

export function RecordingTable({
  rows,
  selectedId,
  onSelect,
}: {
  rows: PatientListItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div style={{ overflow: "auto", border: "1px solid var(--ds-line, #ddd)", borderRadius: 6 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead style={{ background: "var(--ds-elev, #f6f6f6)", textAlign: "left" }}>
          <tr>
            <th style={th}>Last name</th>
            <th style={th}>First name</th>
            <th style={th}>ID</th>
            <th style={th}>DOB</th>
            <th style={th}>Last recording</th>
            <th style={th}>Diagnosis</th>
            <th style={th}># rec</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              onClick={() => onSelect(r.id)}
              style={{
                cursor: "pointer",
                background: selectedId === r.id ? "rgba(30,107,255,0.08)" : undefined,
              }}
            >
              <td style={td}>{r.lastName}</td>
              <td style={td}>{r.firstName}</td>
              <td style={td}>{r.externalId ?? r.id.slice(0, 8)}</td>
              <td style={td}>{r.dob ?? "—"}</td>
              <td style={td}>{r.lastRecordingAt ? r.lastRecordingAt.slice(0, 16) : "—"}</td>
              <td style={td}>{r.diagnosis ?? "—"}</td>
              <td style={td}>{r.recordingCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 ?
        <div style={{ padding: 16, opacity: 0.7 }}>No patients match filters.</div>
      : null}
    </div>
  );
}

const th: CSSProperties = { padding: "8px 10px", borderBottom: "1px solid #ddd" };
const td: CSSProperties = { padding: "6px 10px", borderBottom: "1px solid #eee" };
