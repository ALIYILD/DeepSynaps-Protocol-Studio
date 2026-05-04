import { useRef, useState } from "react";

import { importEdf } from "./databaseApi";

export function ImportEdfDialog({
  open,
  onOpenChange,
  patientId,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  patientId: string;
  onDone: () => void;
}) {
  const [op, setOp] = useState("");
  const [eq, setEq] = useState("");
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const run = async () => {
    const f = ref.current?.files?.[0];
    if (!f) return;
    setBusy(true);
    try {
      await importEdf(patientId, f, op || undefined, eq || undefined);
      onDone();
      onOpenChange(false);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "import failed");
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
          minWidth: 320,
          fontSize: 12,
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Import EDF+</div>
        <input ref={ref} type="file" accept=".edf,.bdf,.edf+,application/octet-stream" />
        <label style={{ display: "block", marginTop: 8 }}>
          Operator
          <input
            style={{ width: "100%" }}
            value={op}
            onChange={(e) => setOp(e.target.value)}
          />
        </label>
        <label style={{ display: "block", marginTop: 8 }}>
          Equipment
          <input
            style={{ width: "100%" }}
            value={eq}
            onChange={(e) => setEq(e.target.value)}
          />
        </label>
        <div style={{ marginTop: 12, display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" onClick={() => onOpenChange(false)}>
            Cancel
          </button>
          <button type="button" disabled={busy} onClick={() => void run()}>
            {busy ? "…" : "Import"}
          </button>
        </div>
      </div>
    </div>
  );
}
