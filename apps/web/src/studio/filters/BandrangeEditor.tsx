import { useEffect, useState } from "react";

import type { BandrangeMap } from "./bandrangeLocal";
import { loadBandrangeOverrides, saveBandrangeOverrides } from "./bandrangeLocal";

export function BandrangeEditorDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [text, setText] = useState("{}");

  useEffect(() => {
    if (open) setText(JSON.stringify(loadBandrangeOverrides(), null, 2));
  }, [open]);

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.35)",
        zIndex: 80,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onMouseDown={() => onOpenChange(false)}
    >
      <div
        style={{
          background: "var(--ds-surface, #fff)",
          border: "1px solid var(--ds-line, #ccc)",
          borderRadius: 8,
          padding: 16,
          width: "min(560px, 94vw)",
          maxHeight: "86vh",
          overflow: "auto",
          fontSize: 12,
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div style={{ fontWeight: 600, marginBottom: 8 }}>
          EEG Bandranges (Hz)
        </div>
        <p style={{ opacity: 0.75, marginBottom: 8 }}>
          JSON map of band name → [low Hz, high Hz]. Used by Spectra / ERD and the
          Bandrange filter presets.
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          style={{
            width: "100%",
            minHeight: 220,
            fontFamily: "ui-monospace, monospace",
            fontSize: 11,
          }}
        />
        <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "flex-end" }}>
          <button type="button" onClick={() => onOpenChange(false)}>
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              try {
                const parsed = JSON.parse(text) as unknown;
                if (!parsed || typeof parsed !== "object") throw new Error("expected object");
                const m: BandrangeMap = {};
                for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
                  if (
                    Array.isArray(v) &&
                    v.length === 2 &&
                    typeof v[0] === "number" &&
                    typeof v[1] === "number"
                  ) {
                    m[k] = [v[0], v[1]];
                  }
                }
                saveBandrangeOverrides(m);
                onOpenChange(false);
              } catch {
                window.alert("Invalid JSON — fix and try again.");
              }
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
