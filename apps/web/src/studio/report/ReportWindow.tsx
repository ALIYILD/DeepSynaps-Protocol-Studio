import { useCallback, useEffect, useRef, useState } from "react";

import { useAiStore } from "../stores/ai";
import { mergeReportDraft } from "./applyDraft";
import { postReportRender, type RenderFormat } from "./reportApi";
import { useReportEditorStore } from "./reportEditorStore";
import { ReportEditor } from "./ReportEditor";
import { useInsertFigureFromWindow } from "./InsertFigureFromWindow";
import { emptyDocument } from "./types";

const RENDERER_KEY = "ds.studio.reportRenderer";

function loadRendererPref(): "internal" | "ms_word" {
  try {
    const v = localStorage.getItem(RENDERER_KEY);
    if (v === "ms_word" || v === "internal") return v;
  } catch {
    /* ignore */
  }
  return "internal";
}

export function ReportWindow() {
  const open = useReportEditorStore((s) => s.open);
  const closeReport = useReportEditorStore((s) => s.closeReport);
  const analysisId = useReportEditorStore((s) => s.analysisId);
  const setDocument = useReportEditorStore((s) => s.setDocument);
  const insertBlock = useReportEditorStore((s) => s.insertBlock);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [redactPhi, setRedactPhi] = useState(false);
  const [renderer, setRenderer] = useState<"internal" | "ms_word">(loadRendererPref);
  const previewUrlRef = useRef<string | null>(null);

  const insertViewportFigure = useInsertFigureFromWindow();

  const revokePreview = useCallback(() => {
    const u = previewUrlRef.current;
    if (u) URL.revokeObjectURL(u);
    previewUrlRef.current = null;
    setPreviewUrl(null);
  }, []);

  const refreshPreview = useCallback(async () => {
    const aid = useReportEditorStore.getState().analysisId;
    const doc = useReportEditorStore.getState().document;
    if (!aid) {
      setErr("No active recording.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const blob = await postReportRender(aid, doc, "html", {
        renderer,
        redactPhi,
      });
      revokePreview();
      const url = URL.createObjectURL(blob);
      previewUrlRef.current = url;
      setPreviewUrl(url);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "preview failed");
    } finally {
      setBusy(false);
    }
  }, [renderer, redactPhi, revokePreview]);

  useEffect(() => {
    if (open && analysisId) void refreshPreview();
    if (!open) revokePreview();
  }, [open, analysisId, refreshPreview, revokePreview]);

  useEffect(() => () => revokePreview(), [revokePreview]);

  const download = async (format: RenderFormat) => {
    const aid = useReportEditorStore.getState().analysisId;
    const doc = useReportEditorStore.getState().document;
    if (!aid) return;
    setBusy(true);
    setErr(null);
    try {
      const blob = await postReportRender(aid, doc, format, {
        renderer,
        redactPhi: format === "pdf" || format === "html" ? redactPhi : false,
      });
      const ext =
        format === "pdf" ? "pdf"
        : format === "docx" ? "docx"
        : format === "rtf" ? "rtf"
        : "html";
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `report-${analysisId}.${ext}`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "download failed");
    } finally {
      setBusy(false);
    }
  };

  const applyM13Draft = () => {
    if (!analysisId) return;
    const draft = useAiStore.getState().lastReportDraft;
    if (!draft || draft.analysisId !== analysisId) {
      window.alert("No M13 report draft for this recording yet.");
      return;
    }
    setDocument(mergeReportDraft(useReportEditorStore.getState().document, draft));
    void refreshPreview();
  };

  const onRendererChange = (v: "internal" | "ms_word") => {
    setRenderer(v);
    try {
      localStorage.setItem(RENDERER_KEY, v);
    } catch {
      /* ignore */
    }
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "stretch",
        justifyContent: "center",
        padding: 12,
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          background: "var(--ds-surface, #fff)",
          color: "var(--ds-text, #111)",
          borderRadius: 8,
          maxWidth: 1200,
          width: "100%",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
          minHeight: 0,
        }}
      >
        <header
          style={{
            padding: "8px 12px",
            borderBottom: "1px solid #ddd",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 8,
            fontSize: 12,
          }}
        >
          <strong>Final Report</strong>
          {analysisId ?
            <code style={{ fontSize: 10 }}>{analysisId}</code>
          : null}
          <span style={{ flex: 1 }} />
          <label style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}>
            Renderer
            <select
              value={renderer}
              onChange={(e) =>
                onRendererChange(e.target.value === "ms_word" ? "ms_word" : "internal")
              }
            >
              <option value="internal">Internal (HTML → PDF)</option>
              <option value="ms_word">MS Word (.docx)</option>
            </select>
          </label>
          <label style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}>
            <input
              type="checkbox"
              checked={redactPhi}
              onChange={(e) => setRedactPhi(e.target.checked)}
            />
            Redact PHI (PDF/HTML)
          </label>
          <button type="button" disabled={busy} onClick={() => void refreshPreview()}>
            {busy ? "…" : "Refresh preview"}
          </button>
          <button type="button" onClick={applyM13Draft}>
            AI Draft (M13)
          </button>
          <button type="button" onClick={() => insertBlock({ type: "patientCard" })}>
            + Patient Card
          </button>
          <button type="button" onClick={() => insertBlock({ type: "paragraph", text: "" })}>
            + Paragraph
          </button>
          <button type="button" onClick={() => insertBlock({ type: "heading", level: 2, text: "" })}>
            + Heading
          </button>
          <button type="button" onClick={() => insertViewportFigure()}>
            + Figure (viewport)
          </button>
          <button type="button" onClick={() => insertBlock({ type: "table", markdown: "" })}>
            + Table
          </button>
          <button type="button" onClick={() => insertBlock({ type: "pageBreak" })}>
            + Page break
          </button>
          <button type="button" onClick={() => download("pdf")}>
            PDF
          </button>
          <button type="button" onClick={() => download("docx")}>
            DOCX
          </button>
          <button type="button" onClick={() => download("rtf")}>
            RTF
          </button>
          <button
            type="button"
            onClick={() => {
              setDocument(emptyDocument());
              void refreshPreview();
            }}
          >
            Clear
          </button>
          <button type="button" onClick={() => closeReport()}>
            Close
          </button>
        </header>
        {err ?
          <div style={{ padding: "4px 12px", fontSize: 11, color: "#a30" }}>{err}</div>
        : null}
        <div style={{ flex: 1, display: "flex", minHeight: 0, gap: 8, padding: 8 }}>
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
            <ReportEditor />
          </div>
          <div style={{ flex: 1, minWidth: 0, border: "1px solid #eee", borderRadius: 6 }}>
            {previewUrl ?
              <iframe title="Preview" src={previewUrl} style={{ width: "100%", height: "100%", border: "none" }} />
            : <div style={{ padding: 12, fontSize: 11, opacity: 0.7 }}>Preview</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
