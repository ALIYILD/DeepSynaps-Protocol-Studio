import { useState } from "react";

import { persistRecordingMontagePref, useMontageStore } from "./useMontage";

const API_BASE = import.meta.env?.VITE_API_BASE_URL ?? "";

function getToken(): string | null {
  try {
    return localStorage.getItem("ds_access_token");
  } catch {
    return null;
  }
}

type Row = { label: string; plus: string; minus: string };

export function MontageEditorTrigger({
  recordingId,
}: {
  recordingId: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          fontSize: 11,
          padding: "2px 8px",
          borderRadius: 4,
          border: "1px solid var(--ds-line, #ccc)",
          background: "var(--ds-elev, #f6f6f6)",
          cursor: "pointer",
        }}
      >
        Setup — Montage list…
      </button>
      {open ?
        <MontageEditorModal
          recordingId={recordingId}
          onClose={() => setOpen(false)}
        />
      : null}
    </>
  );
}

function MontageEditorModal({
  onClose,
  recordingId,
}: {
  onClose: () => void;
  recordingId: string;
}) {
  const loadCatalog = useMontageStore((s) => s.loadCatalog);
  const setMontageId = useMontageStore((s) => s.setMontageId);
  const [name, setName] = useState("My montage");
  const [rows, setRows] = useState<Row[]>([
    { label: "Fp1-F7", plus: "Fp1", minus: "F7" },
    { label: "F7-T7", plus: "F7", minus: "T7" },
  ]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const move = (from: number, to: number) => {
    setRows((r) => {
      const next = [...r];
      const [x] = next.splice(from, 1);
      next.splice(to, 0, x!);
      return next;
    });
  };

  const save = async () => {
    setErr(null);
    setBusy(true);
    try {
      const derivations = rows.map((row) => ({
        label: row.label.trim(),
        plus: row.plus.split(/[, ]+/).filter(Boolean).map((n) => ({
          name: n.trim(),
          weight: 1,
        })),
        minus: row.minus.split(/[, ]+/).filter(Boolean).map((n) => ({
          name: n.trim(),
          weight: 1,
        })),
      }));
      const spec = { kind: "linear", derivations };
      const tok = getToken();
      const res = await fetch(`${API_BASE}/api/v1/montages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(tok ? { Authorization: `Bearer ${tok}` } : {}),
        },
        body: JSON.stringify({ name, family: "custom", spec }),
      });
      if (!res.ok) {
        setErr(`Save failed (${res.status})`);
        return;
      }
      const data = (await res.json()) as {
        montage?: { id?: string };
      };
      const mid = data.montage?.id;
      if (mid) {
        setMontageId(mid);
        void persistRecordingMontagePref(recordingId, mid);
      }
      await loadCatalog();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "save failed");
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
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          width: 520,
          maxHeight: "90vh",
          overflow: "auto",
          background: "var(--ds-surface, #fff)",
          color: "var(--ds-text, #111)",
          borderRadius: 8,
          padding: 16,
          boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
          Montage list editor
        </div>
        <p style={{ fontSize: 11, opacity: 0.8, marginTop: 0 }}>
          Linear derivations: label and comma-separated electrode names for + and −
          legs (matches backend ``LinearDerivation``).
        </p>
        <label style={{ fontSize: 11, display: "block", marginBottom: 8 }}>
          Name{" "}
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ width: "100%", padding: 4 }}
          />
        </label>
        <div style={{ fontSize: 11, marginBottom: 4 }}>Rows (drag handle)</div>
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {rows.map((row, i) => (
            <li
              key={`${i}-${row.label}`}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("text/plain", String(i));
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const from = Number(e.dataTransfer.getData("text/plain"));
                if (Number.isFinite(from)) move(from, i);
              }}
              style={{
                display: "grid",
                gridTemplateColumns: "24px 1fr 1fr 1fr 28px",
                gap: 6,
                alignItems: "center",
                marginBottom: 6,
              }}
            >
              <span title="Drag">⠿</span>
              <input
                placeholder="Label"
                value={row.label}
                onChange={(e) =>
                  setRows((rs) =>
                    rs.map((r, j) =>
                      j === i ? { ...r, label: e.target.value } : r,
                    ),
                  )
                }
              />
              <input
                placeholder="+ electrodes"
                value={row.plus}
                onChange={(e) =>
                  setRows((rs) =>
                    rs.map((r, j) =>
                      j === i ? { ...r, plus: e.target.value } : r,
                    ),
                  )
                }
              />
              <input
                placeholder="− electrodes"
                value={row.minus}
                onChange={(e) =>
                  setRows((rs) =>
                    rs.map((r, j) =>
                      j === i ? { ...r, minus: e.target.value } : r,
                    ),
                  )
                }
              />
              <button
                type="button"
                onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() =>
            setRows((rs) => [...rs, { label: "", plus: "", minus: "" }])
          }
          style={{ fontSize: 11, marginBottom: 12 }}
        >
          + Row
        </button>
        {err ?
          <div style={{ color: "#b00", fontSize: 11, marginBottom: 8 }}>{err}</div>
        : null}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" onClick={() => void save()} disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
