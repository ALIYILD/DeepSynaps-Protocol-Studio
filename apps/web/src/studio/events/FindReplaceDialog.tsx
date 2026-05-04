import { useState } from "react";

import type { FragmentSlice } from "../stores/eegViewer";
import type { ViewerMarker } from "../stores/eegViewer";
import { patchEvent } from "./eventApi";

export function FindReplaceDialog({
  open,
  onOpenChange,
  analysisId,
  markers,
  fragments,
  onPatched,
  jumpToSec,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  analysisId: string;
  markers: ViewerMarker[];
  fragments: FragmentSlice[];
  onPatched: () => void;
  jumpToSec: (t: number) => void;
}) {
  const [find, setFind] = useState("");
  const [replace, setReplace] = useState("");
  const [cursor, setCursor] = useState(0);

  if (!open) return null;

  const targets = [
    ...markers.map((m) => ({
      kind: "marker" as const,
      id: m.id,
      sec: m.fromSec,
      label: m.text ?? "",
    })),
    ...fragments.map((f) => ({
      kind: "fragment_meta" as const,
      id: f.id,
      sec: f.startSec,
      label: f.label,
    })),
  ].filter((x) => find && x.label.includes(find));

  const next = () => {
    if (!targets.length) return;
    const i = cursor % targets.length;
    setCursor((c) => c + 1);
    jumpToSec(targets[i]!.sec);
  };

  const replaceAll = async () => {
    if (analysisId === "demo" || !find) return;
    for (const m of markers) {
      if (!m.text?.includes(find)) continue;
      const nt = m.text.replaceAll(find, replace);
      await patchEvent(analysisId, m.id, { text: nt });
    }
    onPatched();
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
      onMouseDown={() => onOpenChange(false)}
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
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Find / Replace</div>
        <label style={{ display: "block", marginBottom: 6 }}>
          Find
          <input
            value={find}
            onChange={(e) => setFind(e.target.value)}
            style={{ width: "100%", marginTop: 4 }}
          />
        </label>
        <label style={{ display: "block", marginBottom: 6 }}>
          Replace with
          <input
            value={replace}
            onChange={(e) => setReplace(e.target.value)}
            style={{ width: "100%", marginTop: 4 }}
          />
        </label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
          <button type="button" onClick={() => next()}>
            Jump next ({targets.length})
          </button>
          <button type="button" onClick={() => void replaceAll()}>
            Replace all in labels
          </button>
          <button type="button" onClick={() => onOpenChange(false)}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
