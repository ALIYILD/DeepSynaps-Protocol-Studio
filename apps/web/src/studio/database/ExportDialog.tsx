import { useState } from "react";

import { exportRecording } from "./databaseApi";

export function ExportDialog({
  open,
  onOpenChange,
  recordingId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  recordingId: string | null;
}) {
  const [fmt, setFmt] = useState<"edf" | "csv" | "json">("edf");
  const [busy, setBusy] = useState(false);

  if (!open || !recordingId) return null;

  const run = async () => {
    setBusy(true);
    try {
      const blob = await exportRecording(recordingId, fmt);
      const ext = fmt === "edf" ? "edf" : fmt === "csv" ? "csv" : "json";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `recording-${recordingId.slice(0, 8)}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
      onOpenChange(false);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "export failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.35)",
        zIndex: 95,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onMouseDown={() => onOpenChange(false)}
    >
      <div
        style={{
          background: "var(--ds-surface, #fff)",
          padding: 16,
          borderRadius: 8,
          minWidth: 280,
          fontSize: 12,
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Export recording</div>
        <label>
          Format
          <select
            style={{ display: "block", width: "100%", marginTop: 4 }}
            value={fmt}
            onChange={(e) => setFmt(e.target.value as typeof fmt)}
          >
            <option value="edf">EDF+ (byte-identical to imported raw)</option>
            <option value="csv">CSV (channels × samples)</option>
            <option value="json">JSON metadata bundle</option>
          </select>
        </label>
        <div style={{ marginTop: 12, display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" onClick={() => onOpenChange(false)}>
            Cancel
          </button>
          <button type="button" disabled={busy} onClick={() => void run()}>
            {busy ? "…" : "Download"}
          </button>
        </div>
      </div>
    </div>
  );
}
