import { useEffect, useState } from "react";

import { DEFAULT_LABEL_NAMES, loadLabelNames, saveLabelNames } from "./defaultLists";

/** Setup → Label List — predefined names for Add Label. */
export function LabelListDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [lines, setLines] = useState("");

  useEffect(() => {
    if (open) setLines(loadLabelNames().join("\n"));
  }, [open]);

  if (!open) return null;

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
          border: "1px solid var(--ds-line, #ccc)",
          borderRadius: 8,
          padding: 16,
          width: "min(420px, 94vw)",
          fontSize: 12,
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Label List</div>
        <p style={{ opacity: 0.75, marginBottom: 8 }}>
          One label name per line (used in Add Label).
        </p>
        <textarea
          value={lines}
          onChange={(e) => setLines(e.target.value)}
          style={{ width: "100%", minHeight: 160, fontFamily: "inherit", fontSize: 11 }}
        />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 10 }}>
          <button type="button" onClick={() => setLines(DEFAULT_LABEL_NAMES.join("\n"))}>
            Defaults
          </button>
          <button type="button" onClick={() => onOpenChange(false)}>
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              saveLabelNames(
                lines
                  .split("\n")
                  .map((s) => s.trim())
                  .filter(Boolean),
              );
              onOpenChange(false);
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
