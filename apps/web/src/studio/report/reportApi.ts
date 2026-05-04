import type { ReportDocument } from "./types";
import { documentForApi } from "./types";

const API_BASE = import.meta.env?.VITE_API_BASE_URL ?? "";

function authHeaders(): HeadersInit {
  try {
    const t = localStorage.getItem("ds_access_token");
    return t ? { Authorization: `Bearer ${t}` } : {};
  } catch {
    return {};
  }
}

const prefix = () => API_BASE || "";

export type TemplateListItem = {
  id: string;
  title: string;
  defaultRenderer: string;
};

export async function getReportTemplates(): Promise<TemplateListItem[]> {
  const url = `${prefix()}/api/v1/studio/eeg/report/templates`;
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) throw new Error(`templates ${res.status}`);
  const data = (await res.json()) as { templates: TemplateListItem[] };
  return data.templates ?? [];
}

export async function getReportTemplate(
  templateId: string,
): Promise<{ id: string; title: string; defaultRenderer?: string; blocks: unknown[] }> {
  const url = `${prefix()}/api/v1/studio/eeg/report/templates/${encodeURIComponent(templateId)}`;
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) throw new Error(`template ${res.status}`);
  return res.json() as Promise<{
    id: string;
    title: string;
    defaultRenderer?: string;
    blocks: unknown[];
  }>;
}

export async function getReportContext(analysisId: string): Promise<{
  analysisId: string;
  variables: Record<string, unknown>;
}> {
  const url = `${prefix()}/api/v1/studio/eeg/${encodeURIComponent(analysisId)}/report/context`;
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) throw new Error(`context ${res.status}`);
  return res.json() as Promise<{
    analysisId: string;
    variables: Record<string, unknown>;
  }>;
}

export type RenderFormat = "pdf" | "docx" | "rtf" | "html";

export async function postReportRender(
  analysisId: string,
  doc: ReportDocument,
  format: RenderFormat,
  opts?: { renderer?: "internal" | "ms_word"; redactPhi?: boolean },
): Promise<Blob> {
  const url = `${prefix()}/api/v1/studio/eeg/${encodeURIComponent(analysisId)}/report/render`;
  const body = {
    format,
    renderer: opts?.renderer ?? "internal",
    redactPhi: opts?.redactPhi ?? false,
    document: documentForApi(doc),
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`render ${res.status} ${t}`);
  }
  return res.blob();
}
