/**
 * JSON block model for the Final Report (M12). Mirrors backend render_html / render_docx.
 */
export type ReportBlock =
  | { id: string; type: "heading"; level: 1 | 2 | 3; text: string }
  | { id: string; type: "paragraph"; text: string }
  | { id: string; type: "patientCard" }
  | { id: string; type: "findings"; text: string }
  | { id: string; type: "spectraGrid" }
  | { id: string; type: "indicesTable" }
  | { id: string; type: "erpFigure"; caption?: string; src?: string }
  | { id: string; type: "sourceFigure"; caption?: string; src?: string }
  | { id: string; type: "spikeSummary" }
  | { id: string; type: "conclusion"; text: string }
  | { id: string; type: "recommendation"; text: string }
  | { id: string; type: "signature"; text: string }
  | { id: string; type: "pageBreak" }
  | { id: string; type: "figure"; caption?: string; src?: string }
  | { id: string; type: "table"; markdown?: string };

export interface ReportDocument {
  title: string;
  blocks: ReportBlock[];
}

export function newId(): string {
  return crypto.randomUUID();
}

export function emptyDocument(): ReportDocument {
  return { title: "EEG Report", blocks: [] };
}

/** Strip `id` for API — server only needs type + fields. */
export function documentForApi(doc: ReportDocument): {
  title: string;
  blocks: Record<string, unknown>[];
} {
  return {
    title: doc.title,
    blocks: doc.blocks.map(({ id: _id, ...rest }) => rest),
  };
}
