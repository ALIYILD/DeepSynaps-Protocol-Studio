/**
 * EEG Studio — patient database browser (WinEEG `eegbase` parity).
 * Open via `studio.html?app=database`.
 */

import { useCallback, useEffect, useState } from "react";

import type { PatientListItem } from "./databaseApi";
import { fetchPatientList, mergePatients } from "./databaseApi";
import { PatientDrawer } from "./PatientDrawer";
import { RecordingTable } from "./RecordingTable";

const SMART_FILTERS = [
  { id: "", label: "All patients" },
  { id: "last_7_days", label: "Last 7 days" },
  { id: "pediatric", label: "Pediatric (<18 cohort)" },
  { id: "adhd_qeeg", label: "ADHD QEEG (client filter)" },
  { id: "pre_post_neuro", label: "Pre/post neuromodulation (tag)" },
  { id: "pending_review", label: "Pending review (future)" },
];

export default function DatabasePage() {
  const [q, setQ] = useState("");
  const [smart, setSmart] = useState("");
  const [rows, setRows] = useState<PatientListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mergeDup, setMergeDup] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const r = await fetchPatientList({ q: q || undefined, smart: smart || undefined, limit: 80 });
      let items = r.items;
      if (smart === "adhd_qeeg") {
        items = items.filter((x) => (x.diagnosis ?? "").toLowerCase().includes("adhd"));
      }
      setRows(items);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "load failed");
    }
  }, [q, smart]);

  useEffect(() => {
    void load();
  }, [load]);

  const runMerge = async () => {
    if (!selectedId || !mergeDup.trim()) return;
    try {
      await mergePatients(selectedId, mergeDup.trim());
      setMergeDup("");
      await load();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "merge failed");
    }
  };

  return (
    <div
      style={{
        fontFamily: "system-ui,Segoe UI,sans-serif",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "var(--ds-surface, #fafafa)",
        color: "var(--ds-text, #111)",
      }}
    >
      <header style={{ padding: "12px 16px", borderBottom: "1px solid #ddd" }}>
        <h1 style={{ fontSize: 16, margin: "0 0 8px" }}>EEG database</h1>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", fontSize: 12 }}>
          <input
            placeholder="Search name / notes / diagnosis…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ minWidth: 220, padding: "4px 8px" }}
          />
          <button type="button" onClick={() => void load()}>
            Search
          </button>
          <label>
            Smart filter
            <select
              style={{ marginLeft: 6 }}
              value={smart}
              onChange={(e) => setSmart(e.target.value)}
            >
              {SMART_FILTERS.map((s) => (
                <option key={s.id || "all"} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          {err ? <span style={{ color: "#a30" }}>{err}</span> : null}
        </div>
      </header>

      <div style={{ flex: 1, display: "flex", minHeight: 0, position: "relative" }}>
        <main style={{ flex: 1, padding: 12, overflow: "auto" }}>
          <RecordingTable rows={rows} selectedId={selectedId} onSelect={setSelectedId} />
          <div style={{ marginTop: 16, fontSize: 11, opacity: 0.75 }}>
            Bulk: merge duplicate — duplicate patient ID{" "}
            <input
              value={mergeDup}
              onChange={(e) => setMergeDup(e.target.value)}
              style={{ width: 220 }}
              placeholder="UUID of duplicate record"
            />{" "}
            <button type="button" disabled={!selectedId} onClick={() => void runMerge()}>
              Merge into selected
            </button>
            <span style={{ marginLeft: 12 }}>
              Export / multi-format ZIP — use per-recording Export in drawer (M6 slice).
            </span>
          </div>
        </main>
        <PatientDrawer patientId={selectedId} onClose={() => setSelectedId(null)} />
      </div>
    </div>
  );
}
