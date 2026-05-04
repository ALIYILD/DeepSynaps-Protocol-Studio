import { useEffect, useState } from "react";

import { loadLabelNames } from "./defaultLists";
import { postEvent } from "./eventApi";

export function AddLabelDialog({
  open,
  onOpenChange,
  analysisId,
  defaultTimeSec,
  highlightChannelId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  analysisId: string;
  defaultTimeSec: number;
  highlightChannelId: string | null;
  onSaved: () => void;
}) {
  const [preset, setPreset] = useState("");
  const [text, setText] = useState("");
  const [color, setColor] = useState("#6b5b00");
  const [scope, setScope] = useState<"all" | "selection">("all");
  const [kind, setKind] = useState<"label" | "fragment">("label");
  const [toSec, setToSec] = useState<number | "">("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const names = loadLabelNames();
    setPreset(names[0] ?? "EO");
    setText(names[0] ?? "EO");
    setToSec("");
    setKind("label");
  }, [open]);

  if (!open) return null;

  const submit = async () => {
    if (analysisId === "demo") {
      window.alert("Save a real recording to persist events.");
      onOpenChange(false);
      return;
    }
    setBusy(true);
    try {
      const body = {
        type:
          kind === "fragment" ? ("fragment" as const) : ("label" as const),
        fromSec: defaultTimeSec,
        toSec:
          kind === "fragment" ?
            Number(toSec || defaultTimeSec + 1)
          : undefined,
        text: text.trim() || preset,
        color,
        channelScope: scope,
        channels:
          scope === "selection" && highlightChannelId ?
            [highlightChannelId]
          : undefined,
      };
      await postEvent(analysisId, body);
      onSaved();
      onOpenChange(false);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "save failed");
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
        zIndex: 96,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onMouseDown={() => !busy && onOpenChange(false)}
    >
      <div
        style={{
          background: "var(--ds-surface, #fff)",
          border: "1px solid var(--ds-line, #ccc)",
          borderRadius: 8,
          padding: 16,
          width: "min(400px, 94vw)",
          fontSize: 12,
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Add label / fragment</div>
        <label style={{ display: "block", marginBottom: 6 }}>
          Type
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as typeof kind)}
            style={{ width: "100%", marginTop: 4 }}
          >
            <option value="label">Label (instant)</option>
            <option value="fragment">Fragment (interval)</option>
          </select>
        </label>
        <label style={{ display: "block", marginBottom: 6 }}>
          Preset
          <select
            value={preset}
            onChange={(e) => {
              setPreset(e.target.value);
              setText(e.target.value);
            }}
            style={{ width: "100%", marginTop: 4 }}
          >
            {loadLabelNames().map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: "block", marginBottom: 6 }}>
          Text
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            style={{ width: "100%", marginTop: 4 }}
          />
        </label>
        <label style={{ display: "block", marginBottom: 6 }}>
          Time (s) @ left cursor
          <input type="number" readOnly value={defaultTimeSec} style={{ width: "100%", marginTop: 4 }} />
        </label>
        {kind === "fragment" ?
          <label style={{ display: "block", marginBottom: 6 }}>
            End time (s)
            <input
              type="number"
              step={0.01}
              value={toSec}
              onChange={(e) =>
                setToSec(e.target.value === "" ? "" : Number(e.target.value))
              }
              style={{ width: "100%", marginTop: 4 }}
            />
          </label>
        : null}
        <label style={{ display: "block", marginBottom: 6 }}>
          Color
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            style={{ width: "100%", marginTop: 4, height: 28 }}
          />
        </label>
        <label style={{ display: "block", marginBottom: 6 }}>
          Channels
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as typeof scope)}
            style={{ width: "100%", marginTop: 4 }}
          >
            <option value="all">All channels</option>
            <option
              value="selection"
              disabled={!highlightChannelId}
              title={highlightChannelId ? undefined : "Highlight a row first"}
            >
              Selection ({highlightChannelId ?? "—"})
            </option>
          </select>
        </label>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 10 }}>
          <button type="button" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </button>
          <button type="button" disabled={busy} onClick={() => void submit()}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
