import type { ReportBlock, ReportDocument } from "./types";
import { newId } from "./types";

/** Attach fresh ids to blocks loaded from API template JSON. */
export function hydrateTemplateDocument(data: {
  title?: string;
  blocks?: unknown[];
}): ReportDocument {
  const raw = Array.isArray(data.blocks) ? data.blocks : [];
  const blocks: ReportBlock[] = raw.map((item) => {
    if (!item || typeof item !== "object") {
      return { id: newId(), type: "paragraph", text: "" } as ReportBlock;
    }
    const o = item as Record<string, unknown>;
    return { ...o, id: newId() } as ReportBlock;
  });
  return {
    title: typeof data.title === "string" ? data.title : "EEG Report",
    blocks,
  };
}
