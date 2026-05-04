import { create } from "zustand";

import type { ReportBlock, ReportDocument } from "./types";
import { emptyDocument, newId } from "./types";

export interface ReportEditorState {
  analysisId: string | null;
  open: boolean;
  /** Insert new blocks after this index (−1 = start). */
  cursorAfter: number;
  document: ReportDocument;
  setAnalysisId: (id: string | null) => void;
  openReport: () => void;
  closeReport: () => void;
  setTitle: (t: string) => void;
  setDocument: (d: ReportDocument) => void;
  loadTemplateDocument: (d: ReportDocument) => void;
  setCursorAfter: (i: number) => void;
  insertBlock: (block: Record<string, unknown> & { type: ReportBlock["type"] }) => void;
  updateBlock: (id: string, patch: Partial<ReportBlock>) => void;
  removeBlock: (id: string) => void;
  moveBlock: (id: string, delta: -1 | 1) => void;
}

function withId(b: Record<string, unknown> & { type: ReportBlock["type"] }): ReportBlock {
  return { ...b, id: newId() } as ReportBlock;
}

export const useReportEditorStore = create<ReportEditorState>((set, get) => ({
  analysisId: null,
  open: false,
  cursorAfter: -1,
  document: emptyDocument(),
  setAnalysisId: (analysisId) => set({ analysisId }),
  openReport: () => set({ open: true }),
  closeReport: () => set({ open: false }),
  setTitle: (title) =>
    set((s) => ({ document: { ...s.document, title } })),
  setDocument: (document) => set({ document }),
  loadTemplateDocument: (document) =>
    set({ document, open: true, cursorAfter: document.blocks.length - 1 }),
  setCursorAfter: (cursorAfter) => set({ cursorAfter }),
  insertBlock: (block) =>
    set((s) => {
      const b = withId(block);
      const i = s.cursorAfter + 1;
      const blocks = [...s.document.blocks];
      blocks.splice(i, 0, b);
      return {
        document: { ...s.document, blocks },
        cursorAfter: i,
      };
    }),
  updateBlock: (id, patch) =>
    set((s) => ({
      document: {
        ...s.document,
        blocks: s.document.blocks.map((x) =>
          x.id === id ? ({ ...x, ...patch } as ReportBlock) : x,
        ),
      },
    })),
  removeBlock: (id) =>
    set((s) => ({
      document: {
        ...s.document,
        blocks: s.document.blocks.filter((x) => x.id !== id),
      },
    })),
  moveBlock: (id, delta) =>
    set((s) => {
      const blocks = [...s.document.blocks];
      const idx = blocks.findIndex((x) => x.id === id);
      if (idx < 0) return s;
      const j = idx + delta;
      if (j < 0 || j >= blocks.length) return s;
      const [row] = blocks.splice(idx, 1);
      blocks.splice(j, 0, row);
      return { document: { ...s.document, blocks } };
    }),
}));
