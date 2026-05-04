import type { ReportDraftPayload } from "../stores/ai";
import type { ReportBlock, ReportDocument } from "./types";
import { newId } from "./types";

/** Merge M13 draft text into findings / conclusion / recommendation blocks. */
export function mergeReportDraft(
  doc: ReportDocument,
  draft: ReportDraftPayload,
): ReportDocument {
  const blocks = [...doc.blocks];

  const upsertText = (
    type: "findings" | "conclusion" | "recommendation",
    text: string,
  ) => {
    const idx = blocks.findIndex((b) => b.type === type);
    if (idx >= 0) {
      const cur = blocks[idx];
      blocks[idx] = { ...cur, text } as ReportBlock;
      return;
    }
    blocks.push({ id: newId(), type, text } as ReportBlock);
  };

  if (draft.findings?.trim()) upsertText("findings", draft.findings.trim());
  if (draft.conclusion?.trim()) upsertText("conclusion", draft.conclusion.trim());
  if (draft.recommendation?.trim())
    upsertText("recommendation", draft.recommendation.trim());

  return { ...doc, blocks };
}
