import { useCallback, useEffect, useState } from "react";

import { useAiStore } from "../stores/ai";
import type { PatientCardResponse, RecordingRow } from "./databaseApi";
import { fetchPatientCard, fetchRecordings } from "./databaseApi";
import { ExportDialog } from "./ExportDialog";
import { ImportEdfDialog } from "./ImportEdfDialog";
import { PatientCard } from "./PatientCard";

export function PatientDrawer({
  patientId,
  onClose,
}: {
  patientId: string | null;
  onClose: () => void;
}) {
  const patientOpened = useAiStore((s) => s.patientOpened);
  const [card, setCard] = useState<PatientCardResponse | null>(null);
  const [recs, setRecs] = useState<RecordingRow[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportId, setExportId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!patientId) return;
    const [c, r] = await Promise.all([
      fetchPatientCard(patientId),
      fetchRecordings(patientId),
    ]);
    setCard(c);
    setRecs(r.recordings ?? []);
    const prof = c.profile as Record<string, unknown>;
    const clin = prof.clinical as Record<string, unknown> | undefined;
    const ident = prof.identification as Record<string, string> | undefined;
    patientOpened({
      patientId,
      diagnosis: (clin?.diagnosisLabel as string) || (clin?.diagnosisIcdCode as string),
      fullName: `${ident?.firstName ?? ""} ${ident?.lastName ?? ""}`.trim(),
    });
  }, [patientId, patientOpened]);

  useEffect(() => {
    if (!patientId) {
      setCard(null);
      setRecs([]);
      return;
    }
    void reload().catch(() => {});
  }, [patientId, reload]);

  if (!patientId) return null;

  return (
    <>
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          width: "min(520px, 96vw)",
          height: "100%",
          background: "var(--ds-surface, #fff)",
          borderLeft: "1px solid var(--ds-line, #ccc)",
          zIndex: 90,
          display: "flex",
          flexDirection: "column",
          boxShadow: "-4px 0 24px rgba(0,0,0,0.08)",
        }}
      >
        <div
          style={{
            padding: "10px 12px",
            borderBottom: "1px solid var(--ds-line, #eee)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <strong style={{ fontSize: 13 }}>Patient card</strong>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: 12 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <button type="button" onClick={() => setImportOpen(true)}>
              Import EDF+
            </button>
            <button type="button" onClick={() => void reload()}>
              Refresh
            </button>
          </div>
          <PatientCard patientId={patientId} data={card} onSaved={() => void reload()} />

          <h4 style={{ fontSize: 12, margin: "16px 0 8px" }}>Recordings & derivatives</h4>
          <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
                <th>When</th>
                <th>Dur</th>
                <th>Fs</th>
                <th>Derived</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {recs.map((r) => (
                <tr key={r.id} style={{ borderBottom: "1px solid #eee" }}>
                  <td>{r.recordedAt?.slice(0, 16) ?? "—"}</td>
                  <td>{r.durationSec.toFixed(1)}s</td>
                  <td>{r.sampleRateHz ?? "—"}</td>
                  <td>{r.derivatives?.length ?? 0}</td>
                  <td>
                    <button
                      type="button"
                      onClick={() => {
                        setExportId(r.id);
                        setExportOpen(true);
                      }}
                    >
                      Export
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ImportEdfDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        patientId={patientId}
        onDone={() => void reload()}
      />
      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        recordingId={exportId}
      />
    </>
  );
}
