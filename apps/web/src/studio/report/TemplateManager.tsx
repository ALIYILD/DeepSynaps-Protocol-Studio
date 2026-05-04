import type { CSSProperties } from "react";
import { useEffect, useState } from "react";

import { getReportTemplate, getReportTemplates, type TemplateListItem } from "./reportApi";

const LS_OVERRIDES = "ds.studio.reportTemplateOverrides.v1";

function loadOverrides(): Record<string, string> {
  try {
    const raw = localStorage.getItem(LS_OVERRIDES);
    if (!raw) return {};
    const o = JSON.parse(raw) as unknown;
    return typeof o === "object" && o !== null ? (o as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function saveOverrides(m: Record<string, string>) {
  localStorage.setItem(LS_OVERRIDES, JSON.stringify(m));
}

/**
 * Setup → Final Report Templates: browse built-ins and stash JSON overrides locally until a PUT API exists.
 */
export function TemplateManager({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [list, setList] = useState<TemplateListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [jsonText, setJsonText] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setErr(null);
    void getReportTemplates()
      .then((rows) => {
        setList(rows);
        if (!selectedId && rows[0]) setSelectedId(rows[0].id);
      })
      .catch((e: unknown) =>
        setErr(e instanceof Error ? e.message : "load failed"),
      );
  }, [open, selectedId]);

  useEffect(() => {
    if (!selectedId || !open) return;
    setErr(null);
    const overrides = loadOverrides();
    if (overrides[selectedId]) {
      setJsonText(overrides[selectedId]);
      return;
    }
    void getReportTemplate(selectedId)
      .then((t) => setJsonText(JSON.stringify(t, null, 2)))
      .catch((e: unknown) =>
        setErr(e instanceof Error ? e.message : "template failed"),
      );
  }, [selectedId, open]);

  if (!open) return null;

  const onSaveLocal = () => {
    if (!selectedId) return;
    try {
      JSON.parse(jsonText);
    } catch {
      window.alert("Invalid JSON");
      return;
    }
    const o = loadOverrides();
    o[selectedId] = jsonText;
    saveOverrides(o);
    window.alert("Saved override in browser storage.");
  };

  return (
    <div style={overlay}>
      <div
        style={{
          background: "#fff",
          borderRadius: 8,
          width: "min(900px, 96vw)",
          height: "min(640px, 90vh)",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
        }}
      >
        <header
          style={{
            padding: "10px 14px",
            borderBottom: "1px solid #eee",
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 13,
          }}
        >
          <strong>Final Report Templates</strong>
          <span style={{ flex: 1 }} />
          <button type="button" onClick={() => onOpenChange(false)}>
            Close
          </button>
        </header>
        {err ?
          <div style={{ padding: "4px 14px", color: "#a30", fontSize: 12 }}>{err}</div>
        : null}
        <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
          <aside
            style={{
              width: 220,
              borderRight: "1px solid #eee",
              overflow: "auto",
              padding: 8,
              fontSize: 11,
            }}
          >
            {list.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelectedId(t.id)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "6px 8px",
                  marginBottom: 4,
                  border: selectedId === t.id ? "2px solid #06c" : "1px solid #ddd",
                  borderRadius: 4,
                  background: "#fafafa",
                  cursor: "pointer",
                }}
              >
                <div>{t.title}</div>
                <code style={{ fontSize: 9, opacity: 0.8 }}>{t.id}</code>
              </button>
            ))}
          </aside>
          <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
            <textarea
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              spellCheck={false}
              style={{
                flex: 1,
                margin: 0,
                padding: 12,
                fontFamily: "ui-monospace, monospace",
                fontSize: 11,
                border: "none",
                resize: "none",
              }}
            />
            <footer style={{ padding: 8, borderTop: "1px solid #eee", fontSize: 11 }}>
              <button type="button" onClick={onSaveLocal}>
                Save local override
              </button>
              <span style={{ marginLeft: 12, opacity: 0.75 }}>
                Built-ins ship from the API; overrides are stored in{" "}
                <code>localStorage</code> for this browser only.
              </span>
            </footer>
          </main>
        </div>
      </div>
    </div>
  );
}

const overlay: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 1200,
  background: "rgba(0,0,0,0.4)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};
