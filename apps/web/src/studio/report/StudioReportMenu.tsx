import type { CSSProperties } from "react";
import { useEffect, useState } from "react";

import { getReportTemplate, getReportTemplates } from "./reportApi";
import { useReportEditorStore } from "./reportEditorStore";
import { hydrateTemplateDocument } from "./hydrateTemplate";

export function StudioReportMenu({ analysisId }: { analysisId: string }) {
  const setAnalysisId = useReportEditorStore((s) => s.setAnalysisId);
  const openReport = useReportEditorStore((s) => s.openReport);
  const insertBlock = useReportEditorStore((s) => s.insertBlock);
  const loadTemplateDocument = useReportEditorStore((s) => s.loadTemplateDocument);
  const [pickTpl, setPickTpl] = useState(false);

  useEffect(() => {
    setAnalysisId(analysisId);
  }, [analysisId, setAnalysisId]);

  return (
    <>
      <button
        type="button"
        style={btn}
        onClick={() => {
          setAnalysisId(analysisId);
          openReport();
        }}
      >
        Final Report…
      </button>
      <button
        type="button"
        style={btn}
        onClick={() => {
          setAnalysisId(analysisId);
          insertBlock({ type: "patientCard" });
          openReport();
        }}
      >
        Insert Patient Card
      </button>
      <button
        type="button"
        style={btn}
        onClick={() => {
          setAnalysisId(analysisId);
          setPickTpl(true);
          openReport();
        }}
      >
        Insert Final Report Template…
      </button>
      {pickTpl ?
        <TemplatePickerDialog
          onClose={() => setPickTpl(false)}
          onPick={async (id) => {
            const t = await getReportTemplate(id);
            loadTemplateDocument(hydrateTemplateDocument(t));
            setPickTpl(false);
          }}
        />
      : null}
    </>
  );
}

function TemplatePickerDialog({
  onPick,
  onClose,
}: {
  onPick: (id: string) => void | Promise<void>;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<{ id: string; title: string }[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void getReportTemplates()
      .then((r) => setRows(r.map((x) => ({ id: x.id, title: x.title }))))
      .catch((e: unknown) =>
        setErr(e instanceof Error ? e.message : "failed to load templates"),
      );
  }, []);

  return (
    <div style={overlay}>
      <div style={panel}>
        <div style={{ fontSize: 13, marginBottom: 8 }}>Choose template</div>
        {err ?
          <div style={{ color: "#a30", fontSize: 11, marginBottom: 8 }}>{err}</div>
        : null}
        <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12 }}>
          {rows.map((r) => (
            <li key={r.id} style={{ marginBottom: 4 }}>
              <button
                type="button"
                style={{ ...btn, display: "inline" }}
                onClick={() => void onPick(r.id)}
              >
                {r.title}
              </button>{" "}
              <code style={{ fontSize: 10 }}>{r.id}</code>
            </li>
          ))}
        </ul>
        <div style={{ marginTop: 12 }}>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

const btn: CSSProperties = {
  fontSize: 11,
  textAlign: "left",
  padding: "2px 6px",
  cursor: "pointer",
  background: "transparent",
  border: "none",
  color: "inherit",
};

const overlay: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 1100,
  background: "rgba(0,0,0,0.35)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const panel: CSSProperties = {
  background: "#fff",
  padding: 16,
  borderRadius: 8,
  maxWidth: 420,
  width: "90%",
  boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
};
