// API service for Brain Twin / DeepTwin
// Connects to FastAPI backend with auth, error handling, and demo fallback

const API_BASE = import.meta.env?.VITE_API_BASE_URL ?? (process.env.REACT_APP_API_URL || 'https://deepsynaps-studio.fly.dev');

const TOKEN_KEY = 'ds_access_token';

function safeStorageGet(key) {
  try {
    return globalThis.localStorage?.getItem?.(key) ?? null;
  } catch {
    return null;
  }
}

function getToken() {
  return safeStorageGet(TOKEN_KEY);
}

function isDemoSession() {
  try {
    const t = getToken();
    return !!(t && t.endsWith('-demo-token'));
  } catch {
    return false;
  }
}

/**
 * Generic fetch wrapper with auth, JSON parsing, and consistent error shapes.
 * @param {string} path - URL path (relative to API_BASE or absolute)
 * @param {object} opts - fetch options
 */
async function btFetch(path, opts = {}) {
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  const headers = { ...(opts.headers || {}) };

  if (!headers['Content-Type'] && !headers['content-type'] && !(opts.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const token = getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let res;
  try {
    res = await fetch(url, { ...opts, headers });
  } catch (networkErr) {
    const err = new Error(networkErr.message || 'Network error');
    err.status = 0;
    err.code = 'network_error';
    throw err;
  }

  if (!res.ok) {
    let body = null;
    try {
      body = await res.clone().json();
    } catch {
      try {
        body = await res.clone().text();
      } catch {}
    }
    const err = new Error(body?.message || body?.detail || `API error ${res.status}`);
    err.status = res.status;
    err.code = body?.code || `http_${res.status}`;
    err.body = body;
    throw err;
  }

  // Handle 204 or empty body
  if (res.status === 204) return null;
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return res.json();
  }
  return res.text();
}

/**
 * Retry wrapper with exponential backoff for idempotent GETs.
 */
async function btFetchWithRetry(path, opts = {}, maxRetries = 2) {
  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await btFetch(path, opts);
    } catch (err) {
      lastErr = err;
      const retryable = err.status === 0 || err.status === 502 || err.status === 503 || err.status === 504;
      if (!retryable || attempt === maxRetries) throw err;
      const delay = Math.min(1000 * 2 ** attempt, 8000);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

/**
 * Demo-mode synthetic responses for offline preview sessions.
 * Only activates when a *-demo-token is present.
 */
function _demoSyntheticResponse(path, method, bodyRaw) {
  const methodU = (method || 'GET').toUpperCase();
  const body = (() => {
    if (bodyRaw == null || bodyRaw === '') return null;
    if (typeof bodyRaw === 'string') {
      try { return JSON.parse(bodyRaw); } catch { return null; }
    }
    return bodyRaw;
  })();

  const patientIdMatch = path.match(/\/knowledge\/deeptwin\/([^/]+)(?:\/|$)/);
  const patientId = patientIdMatch ? decodeURIComponent(patientIdMatch[1]) : 'demo-patient';

  if (path.includes('/knowledge/deeptwin/') && methodU === 'GET' && !path.includes('/synthesize') && !path.includes('/report')) {
    return {
      patient_id: patientId,
      modalities: [
        { id: 'qeeg_features', label: 'qEEG biomarkers', available: true, confidence: 0.72 },
        { id: 'mri_structural', label: 'MRI structural', available: true, confidence: 0.65 },
        { id: 'wearables', label: 'Wearables', available: true, confidence: 0.58 },
        { id: 'assessments', label: 'Assessments', available: true, confidence: 0.81 },
        { id: 'ehr_text', label: 'Medical record text', available: true, confidence: 0.60 },
        { id: 'video', label: 'Video analysis', available: false, confidence: 0 },
        { id: 'audio', label: 'Audio analysis', available: false, confidence: 0 },
      ],
      generated_at: new Date().toISOString(),
      is_demo: true,
      findings: [
        { title: 'qEEG signal summary', summary: 'Theta/beta ratio 3.42 on the latest recording', confidence: 0.72, tone: 'blue', provenance: 'qEEG analyzer' },
        { title: 'Active clinical alerts', summary: '1 active alert requires review', confidence: 0.85, tone: 'amber', provenance: 'clinical alert flags' },
      ],
    };
  }

  if (path.includes('/synthesize') && methodU === 'POST') {
    const domains = body?.domains || ['qeeg_features', 'assessments'];
    return {
      patient_id: patientId,
      synthesis_id: `demo-synth-${Date.now()}`,
      domains,
      status: 'complete',
      results: {
        prediction: { key_predictions: [{ title: 'Attention improvement expected', summary: 'Predicted response to theta-beta neurofeedback within 6 weeks', confidence: 'moderate' }] },
        correlation: { priority_pairs: [{ left: 'theta_beta_ratio', right: 'attention_score', score: 0.62, interpretation: 'moves together' }] },
        causation: { hypotheses: [{ claim: 'Elevated theta/beta ratio may contribute to attention variability', strength: 'possible', confidence: 0.55 }] },
      },
      is_demo: true,
    };
  }

  if (path.includes('/report') && methodU === 'GET') {
    return {
      patient_id: patientId,
      report_type: body?.format || 'full',
      generated_at: new Date().toISOString(),
      executive_summary: 'Demo report — connect to the live API for patient-specific synthesis.',
      review_points: ['Verify source data freshness before clinical use.'],
      limitations: ['Demo session — report not persisted server-side.'],
      evidence_grade: 'low',
      is_demo: true,
    };
  }

  // Default demo empty
  return { is_demo: true, items: [] };
}

function _shouldDemoShortCircuit(path, method) {
  if (!isDemoSession()) return false;
  const demoPaths = /^\/(knowledge|api\/v1)\/(deeptwin|medication-analysis|genetic-analysis|qeeg-analysis|mri-analysis|synthesize)/;
  return demoPaths.test(path);
}

/**
 * Brain Twin API endpoints.
 */
export const brainTwinApi = {
  // ── Core DeepTwin intelligence ──────────────────────────────────────────

  /** Fetch patient intelligence snapshot (modalities, findings, coverage). */
  getIntelligence: async (patientId) => {
    const path = `/knowledge/deeptwin/${encodeURIComponent(patientId)}`;
    if (_shouldDemoShortCircuit(path, 'GET')) {
      return _demoSyntheticResponse(path, 'GET', null);
    }
    return btFetchWithRetry(path);
  },

  /** Run multimodal synthesis across selected domains. */
  synthesize: async (patientId, domains) => {
    const path = `/knowledge/deeptwin/${encodeURIComponent(patientId)}/synthesize`;
    if (_shouldDemoShortCircuit(path, 'POST')) {
      return _demoSyntheticResponse(path, 'POST', JSON.stringify({ domains }));
    }
    return btFetch(path, {
      method: 'POST',
      body: JSON.stringify({ domains }),
    });
  },

  /** Fetch structured report (full | summary | evidence). */
  getReport: async (patientId, format = 'full') => {
    const path = `/knowledge/deeptwin/${encodeURIComponent(patientId)}/report?format=${encodeURIComponent(format)}`;
    if (_shouldDemoShortCircuit(path, 'GET')) {
      return _demoSyntheticResponse(path, 'GET', null);
    }
    return btFetchWithRetry(path);
  },

  // ── Bridge APIs (direct analyzer access) ─────────────────────────────────

  medicationAnalysis: async (data) =>
    btFetch('/knowledge/medication-analysis', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  geneticAnalysis: async (data) =>
    btFetch('/knowledge/genetic-analysis', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  qeegAnalysis: async (data) =>
    btFetch('/knowledge/qeeg-analysis', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  mriAnalysis: async (data) =>
    btFetch('/knowledge/mri-analysis', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // ── Multimodal synthesis ─────────────────────────────────────────────────

  synthesizeMultimodal: async (data) =>
    btFetch('/knowledge/synthesize', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // ── Utility ─────────────────────────────────────────────────────────────

  /** Health-check the knowledge service. */
  healthCheck: async () => {
    try {
      return await btFetchWithRetry('/knowledge/health', {}, 1);
    } catch {
      return { status: 'unreachable' };
    }
  },
};

/** Re-export fetch helpers for advanced consumers. */
export { btFetch, btFetchWithRetry, API_BASE, isDemoSession };
