import type { CSSProperties } from "react";

import { ErpFigureBlock } from "./blocks/ErpFigureBlock";
import { FindingsBlock } from "./blocks/FindingsBlock";
import { IndicesTableBlock } from "./blocks/IndicesTableBlock";
import { PatientCardBlock } from "./blocks/PatientCardBlock";
import { SourceFigureBlock } from "./blocks/SourceFigureBlock";
import { SpectraGridBlock } from "./blocks/SpectraGridBlock";
import { SpikeSummaryBlock } from "./blocks/SpikeSummaryBlock";
import { useReportEditorStore } from "./reportEditorStore";
import type { ReportBlock } from "./types";

export function ReportEditor() {
  const document = useReportEditorStore((s) => s.document);
  const cursorAfter = useReportEditorStore((s) => s.cursorAfter);
  const setTitle = useReportEditorStore((s) => s.setTitle);
  const setCursorAfter = useReportEditorStore((s) => s.setCursorAfter);
  const updateBlock = useReportEditorStore((s) => s.updateBlock);
  const removeBlock = useReportEditorStore((s) => s.removeBlock);
  const moveBlock = useReportEditorStore((s) => s.moveBlock);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 0 }}>
      <label style={{ fontSize: 11 }}>
        Title
        <input
          value={document.title}
          onChange={(e) => setTitle(e.target.value)}
          style={{ display: "block", width: "100%", marginTop: 4, padding: 6, fontSize: 12 }}
        />
      </label>
      <div style={{ overflow: "auto", flex: 1, paddingRight: 4 }}>
        {document.blocks.length === 0 ?
          <div style={{ fontSize: 11, opacity: 0.7 }}>No blocks — use the toolbar to insert.</div>
        : document.blocks.map((b, idx) => (
            <div
              key={b.id}
              style={{
                ...blockWrap,
                outline:
                  cursorAfter === idx ?
                    "2px solid var(--ds-accent, #06c)"
                  : "1px solid #eee",
              }}
              onClick={() => setCursorAfter(idx)}
            >
              <div style={blockBar}>
                <span style={{ fontSize: 10, opacity: 0.6 }}>{b.type}</span>
                <button type="button" style={miniBtn} onClick={() => moveBlock(b.id, -1)}>
                  ↑
                </button>
                <button type="button" style={miniBtn} onClick={() => moveBlock(b.id, 1)}>
                  ↓
                </button>
                <button type="button" style={miniBtn} onClick={() => removeBlock(b.id)}>
                  ×
                </button>
              </div>
              <BlockEditor block={b} onUpdate={updateBlock} />
            </div>
          ))
        }
      </div>
    </div>
  );
}

function BlockEditor({
  block,
  onUpdate,
}: {
  block: ReportBlock;
  onUpdate: (id: string, patch: Partial<ReportBlock>) => void;
}) {
  switch (block.type) {
    case "heading":
      return (
        <label style={{ fontSize: 11, display: "block" }}>
          Heading ({block.level})
          <input
            value={block.text}
            onChange={(e) => onUpdate(block.id, { text: e.target.value })}
            style={{ width: "100%", marginTop: 4 }}
          />
        </label>
      );
    case "paragraph":
      return (
        <textarea
          value={block.text}
          onChange={(e) => onUpdate(block.id, { text: e.target.value })}
          rows={3}
          style={{ width: "100%", fontSize: 11 }}
        />
      );
    case "patientCard":
      return <PatientCardBlock />;
    case "findings":
      return (
        <FindingsBlock
          text={block.text}
          onChange={(t) => onUpdate(block.id, { text: t })}
        />
      );
    case "spectraGrid":
      return <SpectraGridBlock />;
    case "indicesTable":
      return <IndicesTableBlock />;
    case "erpFigure":
      return (
        <ErpFigureBlock
          caption={block.caption}
          onCaption={(t) => onUpdate(block.id, { caption: t })}
        />
      );
    case "sourceFigure":
      return (
        <SourceFigureBlock
          caption={block.caption}
          onCaption={(t) => onUpdate(block.id, { caption: t })}
        />
      );
    case "spikeSummary":
      return <SpikeSummaryBlock />;
    case "conclusion":
      return (
        <label style={{ fontSize: 11 }}>
          Conclusion
          <textarea
            value={block.text}
            onChange={(e) => onUpdate(block.id, { text: e.target.value })}
            rows={4}
            style={{ width: "100%", marginTop: 4, fontSize: 11 }}
          />
        </label>
      );
    case "recommendation":
      return (
        <label style={{ fontSize: 11 }}>
          Recommendation
          <textarea
            value={block.text}
            onChange={(e) => onUpdate(block.id, { text: e.target.value })}
            rows={4}
            style={{ width: "100%", marginTop: 4, fontSize: 11 }}
          />
        </label>
      );
    case "signature":
      return (
        <label style={{ fontSize: 11 }}>
          Signature
          <textarea
            value={block.text}
            onChange={(e) => onUpdate(block.id, { text: e.target.value })}
            rows={3}
            style={{ width: "100%", marginTop: 4, fontSize: 11 }}
          />
        </label>
      );
    case "pageBreak":
      return <div style={{ fontSize: 11, color: "#888" }}>— page break —</div>;
    case "figure":
      return (
        <div style={{ fontSize: 11 }}>
          <div style={{ marginBottom: 4 }}>Figure</div>
          <input
            placeholder="Caption"
            value={block.caption ?? ""}
            onChange={(e) => onUpdate(block.id, { caption: e.target.value })}
            style={{ width: "100%", marginBottom: 6 }}
          />
          <textarea
            placeholder="data:image/png;base64,... (optional)"
            value={block.src ?? ""}
            onChange={(e) => onUpdate(block.id, { src: e.target.value })}
            rows={2}
            style={{ width: "100%", fontSize: 10, fontFamily: "monospace" }}
          />
        </div>
      );
    case "table":
      return (
        <textarea
          placeholder="Table (markdown-ish)"
          value={block.markdown ?? ""}
          onChange={(e) => onUpdate(block.id, { markdown: e.target.value })}
          rows={4}
          style={{ width: "100%", fontSize: 11 }}
        />
      );
    default:
      return <pre style={{ fontSize: 10 }}>{JSON.stringify(block, null, 2)}</pre>;
  }
}

const blockWrap: CSSProperties = {
  marginBottom: 8,
  padding: 8,
  borderRadius: 6,
  background: "#fff",
  cursor: "pointer",
};

const blockBar: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 4,
  marginBottom: 6,
};

const miniBtn: CSSProperties = {
  fontSize: 10,
  padding: "0 6px",
  cursor: "pointer",
};
