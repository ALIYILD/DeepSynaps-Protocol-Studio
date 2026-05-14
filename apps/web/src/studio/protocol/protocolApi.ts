/**
 * Protocol Studio — API client functions.
 *
 * Thin fetch wrappers over the Protocol Studio backend endpoints.
 * All functions throw on non-2xx responses so callers can handle via UI error states.
 * No patient PHI is logged or included in error messages.
 */

import type {
  EvidenceHealthResponse,
  EvidenceSearchResponse,
  ProtocolCatalogResponse,
  ProtocolDetailResponse,
  GenerateProtocolRequest,
  GenerateProtocolResponse,
  RecommendProtocolRequest,
  RecommendProtocolResponse,
  SimulateProtocolRequest,
  SimulateProtocolResponse,
  PatientContextResponse,
  DraftsResponse,
  ProtocolDraft,
} from "./protocolTypes";

const API_BASE = "/api/v1/protocol-studio";

/** Parse a standard JSON API response, throwing on error status. */
async function parseJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = `API error ${res.status}`;
    try {
      const body = await res.json();
      detail = body.detail || body.message || detail;
    } catch {
      /* ignore malformed error bodies */
    }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

/** Build a query string from an object, omitting null/undefined/empty values. */
function buildQuery(params: Record<string, unknown>): string {
  const q = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v != null && v !== "")
  ).toString();
  return q ? `?${q}` : "";
}

// ── Evidence Health ──────────────────────────────────────────────────────────

/**
 * Fetch evidence service health status.
 * @returns Evidence health response with per-source availability.
 */
export async function fetchEvidenceHealth(): Promise<EvidenceHealthResponse> {
  const res = await fetch(`${API_BASE}/evidence-health`, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  return parseJson<EvidenceHealthResponse>(res);
}

// ── Evidence Search ──────────────────────────────────────────────────────────

/**
 * Search the evidence corpus by query with optional filters.
 * @param query Free-text search query.
 * @param filters Optional filters (grade, source, year range).
 * @returns Paginated evidence search results.
 */
export async function searchEvidence(
  query: string,
  filters?: {
    grade?: string;
    source?: string;
    yearFrom?: number;
    yearTo?: number;
    limit?: number;
    offset?: number;
  }
): Promise<EvidenceSearchResponse> {
  const body = JSON.stringify({
    query: query.trim(),
    ...(filters || {}),
  });
  const res = await fetch(`${API_BASE}/evidence-search`, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body,
  });
  return parseJson<EvidenceSearchResponse>(res);
}

// ── Protocol Catalog ─────────────────────────────────────────────────────────

/**
 * List protocols with optional filtering.
 * @param condition Optional condition ID filter.
 * @param modality Optional modality ID filter.
 * @returns Protocol catalog response.
 */
export async function fetchProtocols(
  condition?: string,
  modality?: string
): Promise<ProtocolCatalogResponse> {
  const qs = buildQuery({ condition, modality });
  const res = await fetch(`${API_BASE}/protocols${qs}`, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  return parseJson<ProtocolCatalogResponse>(res);
}

/**
 * Fetch a single protocol by ID.
 * @param id Protocol identifier.
 * @returns Protocol detail response.
 */
export async function fetchProtocolDetail(id: string): Promise<ProtocolDetailResponse> {
  const res = await fetch(`${API_BASE}/protocols/${encodeURIComponent(id)}`, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  return parseJson<ProtocolDetailResponse>(res);
}

// ── AI Generation ────────────────────────────────────────────────────────────

/**
 * Generate a protocol draft using AI.
 * @param request Generation parameters and mode.
 * @returns Generated protocol draft.
 */
export async function generateProtocol(
  request: GenerateProtocolRequest
): Promise<GenerateProtocolResponse> {
  const res = await fetch(`${API_BASE}/generate`, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });
  return parseJson<GenerateProtocolResponse>(res);
}

/**
 * Request protocol recommendations for a condition.
 * @param request Recommendation parameters.
 * @returns Ranked list of recommended protocols.
 */
export async function recommendProtocol(
  request: RecommendProtocolRequest
): Promise<RecommendProtocolResponse> {
  const res = await fetch(`${API_BASE}/recommend`, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });
  return parseJson<RecommendProtocolResponse>(res);
}

/**
 * Simulate expected outcomes for a protocol configuration.
 * @param request Simulation parameters.
 * @returns Simulation results with projected outcomes.
 */
export async function simulateProtocol(
  request: SimulateProtocolRequest
): Promise<SimulateProtocolResponse> {
  const res = await fetch(`${API_BASE}/simulate`, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });
  return parseJson<SimulateProtocolResponse>(res);
}

// ── Patient Context ──────────────────────────────────────────────────────────

/**
 * Fetch PHI-minimized patient context for the protocol studio.
 * @param patientId Patient identifier.
 * @returns Patient context with data-source availability.
 */
export async function fetchPatientContext(
  patientId: string
): Promise<PatientContextResponse> {
  const res = await fetch(
    `${API_BASE}/patient-context/${encodeURIComponent(patientId)}`,
    {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    }
  );
  return parseJson<PatientContextResponse>(res);
}

// ── Draft Management ─────────────────────────────────────────────────────────

/**
 * List all saved protocol drafts.
 * @returns List of protocol drafts.
 */
export async function fetchDrafts(): Promise<DraftsResponse> {
  const res = await fetch(`${API_BASE}/drafts`, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  return parseJson<DraftsResponse>(res);
}

/**
 * Save (create or update) a protocol draft.
 * @param draft The protocol draft to save.
 * @returns The saved draft with server-assigned fields.
 */
export async function saveDraft(
  draft: ProtocolDraft
): Promise<ProtocolDraft> {
  const res = await fetch(`${API_BASE}/drafts`, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(draft),
  });
  return parseJson<ProtocolDraft>(res);
}

/**
 * Delete a protocol draft by ID.
 * @param id Draft identifier to delete.
 */
export async function deleteDraft(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/drafts/${encodeURIComponent(id)}`, {
    method: "DELETE",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    let detail = `API error ${res.status}`;
    try {
      const body = await res.json();
      detail = body.detail || body.message || detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
}
