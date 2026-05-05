import { useState } from "react";

import { ErpActiveMode, type ErpViewTab } from "./ErpModeViews";
import { TrialInclusionBar } from "./TrialInclusionBar";
import { useErpStore } from "./ErpStore";

const tabs: { id: ErpViewTab; label: string }[] = [
  { id: "ch_grp", label: "Channels/Groups" },
  { id: "grp_ch", label: "Groups/Channels" },
  { id: "t_g", label: "Time/Groups Map" },
  { id: "g_t", label: "Groups/Time Map" },
  { id: "page", label: "Formatted Page" },
];

export function ErpWindow({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const result = useErpStore((s) => s.result);
  const loading = useErpStore((s) => s.loading);
  const [tab, setTab] = useState<ErpViewTab>("ch_grp");

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.45)",
        zIndex: 1100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 12,
      }}
    >
      <div
        style={{
          background: "var(--ds-surface, #fff)",
          color: "var(--ds-text, #111)",
          borderRadius: 10,
          maxWidth: 960,
          width: "100%",
          maxHeight: "94vh",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
        }}
      >
        <header
          style={{
            padding: "10px 14px",
            borderBottom: "1px solid var(--ds-line, #e5e7eb)",
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <strong>ERP viewer</strong>
          {loading ?
            <span style={{ fontSize: 11, opacity: 0.7 }}>Updating…</span>
          : null}
          <button type="button" style={{ marginLeft: "auto", padding: "4px 8px", fontSize: 12 }} onClick={() => onOpenChange(false)}>
            Close
          </button>
        </header>
        <div style={{ padding: 10, overflow: "auto", flex: 1 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                style={{
                  padding: "6px 10px",
                  fontSize: 11,
                  borderRadius: 6,
                  border: tab === t.id ? "2px solid var(--ds-accent, #0d9488)" : "1px solid var(--ds-line, #ccc)",
                  background: tab === t.id ? "rgba(13,148,136,0.08)" : "transparent",
                  cursor: "pointer",
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
          <TrialInclusionBar />
          {!result ?
            <div style={{ fontSize: 12, opacity: 0.7 }}>No ERP result — compute from the Analysis menu.</div>
          : <ErpActiveMode tab={tab} result={result} />}
        </div>
      </div>
    </div>
  );
}
