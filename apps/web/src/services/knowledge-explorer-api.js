// =============================================================================
// knowledge-explorer-integration.js
// DeepSynaps Protocol Studio — Knowledge Explorer API Integration Layer
// Phase 6/7/8 — React hooks + FastAPI wiring
// =============================================================================

const API_BASE = process.env.REACT_APP_API_URL || 'https://deepsynaps-studio.fly.dev';

/**
 * Standard HTTP error class that carries response metadata
 * for downstream error-boundary / toast handling.
 */
export class KnowledgeApiError extends Error {
  constructor(message, { status, endpoint, body = null } = {}) {
    super(message);
    this.name = 'KnowledgeApiError';
    this.status = status;
    this.endpoint = endpoint;
    this.body = body;
    this.timestamp = new Date().toISOString();
  }
}

/**
 * Wrapper around fetch that centralises:
 *   • JSON parsing
 *   • 401 → 403 auth mapping
 *   • network failure handling
 *   • response cloning for debug logging
 */
async function _fetchJson(url, options = {}) {
  let response;
  try {
    response = await fetch(url, options);
  } catch (networkErr) {
    throw new KnowledgeApiError(
      networkErr.message || 'Network error — check your connection.',
      { status: 0, endpoint: url }
    );
  }

  if (!response.ok) {
    let body = null;
    try { body = await response.clone().json(); } catch { /* not JSON */ }
    throw new KnowledgeApiError(
      body?.message || `Request failed (${response.status})`,
      { status: response.status, endpoint: url, body }
    );
  }

  try {
    return await response.json();
  } catch (parseErr) {
    throw new KnowledgeApiError(
      'Invalid JSON in server response.',
      { status: response.status, endpoint: url }
    );
  }
}

/**
 * DeepSynaps Knowledge Explorer — typed API client.
 *
 * Every method returns a Promise that resolves to the parsed JSON body.
 * Rejections are always instances of `KnowledgeApiError` so UI code can
 * branch on `err.status === 401` or `err.status >= 500` uniformly.
 */
export const knowledgeApi = {
  /* ── Adapter discovery ─────────────────────────────────────────────────── */

  /** List all registered knowledge adapters (RxNorm, CPIC, AAL3, …). */
  getAdapters: async () =>
    _fetchJson(`${API_BASE}/api/v1/knowledge/adapters`, {
      headers: { Accept: 'application/json' },
    }),

  /** Metadata + health for a single adapter. */
  getAdapter: async (key) =>
    _fetchJson(`${API_BASE}/api/v1/knowledge/adapters/${encodeURIComponent(key)}`, {
      headers: { Accept: 'application/json' },
    }),

  /** Category taxonomy (Medication, EEG, MRI, PGx, Simulation, Outcomes). */
  getCategories: async () =>
    _fetchJson(`${API_BASE}/api/v1/knowledge/adapters/categories`, {
      headers: { Accept: 'application/json' },
    }),

  /** Aggregate stats: adapter count, cache size, license status. */
  getStats: async () =>
    _fetchJson(`${API_BASE}/api/v1/knowledge/adapters/stats`, {
      headers: { Accept: 'application/json' },
    }),

  /* ── Cross-adapter search ────────────────────────────────────────────── */

  /**
   * Search across every enabled adapter.
   * @param {string} query   Free-text query
   * @param {string[]} databases  Adapter keys to scope the search (optional)
   * @param {object} filters  Arbitrary filter object forwarded to the backend
   */
  search: async (query, databases = [], filters = {}) =>
    _fetchJson(`${API_BASE}/api/v1/knowledge/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ query, databases, filters }),
    }),

  /* ── Single-adapter search ───────────────────────────────────────────── */

  /**
   * Search within one adapter only.
   * @param {string} key   Adapter key (e.g. 'rxnorm', 'aal3')
   * @param {string} query Free-text query
   */
  searchAdapter: async (key, query) =>
    _fetchJson(
      `${API_BASE}/api/v1/knowledge/${encodeURIComponent(key)}/search?q=${encodeURIComponent(query)}`,
      { headers: { Accept: 'application/json' } }
    ),

  /* ── Medication endpoints ────────────────────────────────────────────── */

  lookupMedication: async ({ name, rxcui, ndc, atc_code } = {}) =>
    _fetchJson(`${API_BASE}/api/v1/knowledge/medications/lookup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ name, rxcui, ndc, atc_code }),
    }),

  getMedicationDetail: async (rxcui) =>
    _fetchJson(`${API_BASE}/api/v1/knowledge/medications/${encodeURIComponent(rxcui)}`),

  getMedicationIngredients: async (rxcui) =>
    _fetchJson(`${API_BASE}/api/v1/knowledge/medications/${encodeURIComponent(rxcui)}/ingredients`),

  getMedicationATC: async (rxcui) =>
    _fetchJson(`${API_BASE}/api/v1/knowledge/medications/${encodeURIComponent(rxcui)}/atc`),

  getMedicationInteractions: async (rxcui, severity) => {
    const qs = severity ? `?severity=${encodeURIComponent(severity)}` : '';
    return _fetchJson(`${API_BASE}/api/v1/knowledge/medications/${encodeURIComponent(rxcui)}/interactions${qs}`);
  },

  /* ── Pharmacogenomics ───────────────────────────────────────────────── */

  queryGeneDrug: async ({ gene, drug, variant } = {}) =>
    _fetchJson(`${API_BASE}/api/v1/knowledge/pgx/gene-drug`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ gene, drug, variant }),
    }),

  getGeneAnnotation: async (gene) =>
    _fetchJson(`${API_BASE}/api/v1/knowledge/pgx/genes/${encodeURIComponent(gene)}`),

  getGenesForDrug: async (drug) =>
    _fetchJson(`${API_BASE}/api/v1/knowledge/pgx/drugs/${encodeURIComponent(drug)}/genes`),

  getCPICGuidelines: async (gene, drug) =>
    _fetchJson(`${API_BASE}/api/v1/knowledge/pgx/guidelines/${encodeURIComponent(gene)}/${encodeURIComponent(drug)}`),

  /* ── Normative EEG ────────────────────────────────────────────────────── */

  getNormativeEEG: async ({ age, sex, recording_condition = 'eyes_closed', features = [], database_id } = {}) =>
    _fetchJson(`${API_BASE}/api/v1/knowledge/eeg/normative?${new URLSearchParams({ database_id }).toString()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ age, sex, recording_condition, features }),
    }),

  listNormativeDatabases: async () =>
    _fetchJson(`${API_BASE}/api/v1/knowledge/eeg/normative/databases`),

  /* ── MRI Atlas ───────────────────────────────────────────────────────── */

  lookupAtlasRegion: async ({ region_name, region_id, mni_coordinates, atlas = 'AAL3' } = {}) =>
    _fetchJson(`${API_BASE}/api/v1/knowledge/mri/atlas/lookup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ region_name, region_id, mni_coordinates, atlas }),
    }),

  listAtlasRegions: async ({ atlas = 'AAL3', page = 1, page_size = 50 } = {}) =>
    _fetchJson(
      `${API_BASE}/api/v1/knowledge/mri/atlas/regions?${new URLSearchParams({ atlas, page, page_size }).toString()}`
    ),

  getAtlasRegionDetail: async (region_id, atlas = 'AAL3') =>
    _fetchJson(
      `${API_BASE}/api/v1/knowledge/mri/atlas/${encodeURIComponent(region_id)}/details?${new URLSearchParams({ atlas }).toString()}`
    ),

  /* ── Simulation ──────────────────────────────────────────────────────── */

  submitSimulation: async ({ simulation_type, subject_mri, electrode_config, coil_model, target_roi, intensity_ma } = {}) =>
    _fetchJson(`${API_BASE}/api/v1/knowledge/simulations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ simulation_type, subject_mri, electrode_config, coil_model, target_roi, intensity_ma }),
    }),

  getSimulation: async (simulation_id) =>
    _fetchJson(`${API_BASE}/api/v1/knowledge/simulations/${encodeURIComponent(simulation_id)}`),

  validateSimulation: async (payload) =>
    _fetchJson(`${API_BASE}/api/v1/knowledge/simulations/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    }),

  /* ── Outcomes ─────────────────────────────────────────────────────────── */

  listOutcomeDomains: async () =>
    _fetchJson(`${API_BASE}/api/v1/knowledge/outcomes/domains`),

  getOutcomeInstrument: async ({ domain, instrument_type = 'PROMIS', administration_mode = 'CAT' } = {}) =>
    _fetchJson(`${API_BASE}/api/v1/knowledge/outcomes/instrument`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ domain, instrument_type, administration_mode }),
    }),

  /* ── Evidence Store ────────────────────────────────────────────────────── */

  getEvidenceStats: async () =>
    _fetchJson(`${API_BASE}/api/v1/knowledge/evidence/stats`),

  searchEvidence: async (params = {}) =>
    _fetchJson(`${API_BASE}/api/v1/knowledge/evidence/search?${new URLSearchParams(params).toString()}`),

  /* ── Admin / Status ──────────────────────────────────────────────────── */

  getStatus: async () =>
    _fetchJson(`${API_BASE}/api/v1/knowledge/status`),

  triggerSync: async (adapter_name) =>
    _fetchJson(`${API_BASE}/api/v1/knowledge/sync/${encodeURIComponent(adapter_name)}`, {
      method: 'POST',
      headers: { Accept: 'application/json' },
    }),

  getLicenses: async () =>
    _fetchJson(`${API_BASE}/api/v1/knowledge/licenses`),
};

/**
 * React-friendly hook factory: returns { data, loading, error, refetch }
 * that can be dropped into any functional component.
 */
export function useKnowledgeApi(apiMethod, initialArgs = null) {
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);

  const refetch = React.useCallback(
    async (...args) => {
      setLoading(true);
      setError(null);
      try {
        const result = await apiMethod(...(args.length ? args : initialArgs ?? []));
        setData(result);
        return result;
      } catch (err) {
        setError(err);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [apiMethod, initialArgs]
  );

  React.useEffect(() => {
    if (initialArgs !== null) refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { data, loading, error, refetch };
}

export default knowledgeApi;
