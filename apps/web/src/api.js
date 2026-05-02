import { parseHomeProgramTaskMutationResponse } from './home-program-task-sync.js';

const API_BASE = import.meta.env?.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000';
const TOKEN_KEY = 'ds_access_token';
const REFRESH_KEY = 'ds_refresh_token';

function safeStorageGet(key) {
  try {
    return globalThis.localStorage?.getItem?.(key) ?? null;
  } catch {
    return null;
  }
}

function safeStorageSet(key, value) {
  try {
    globalThis.localStorage?.setItem?.(key, value);
  } catch {}
}

function safeStorageRemove(key) {
  try {
    globalThis.localStorage?.removeItem?.(key);
  } catch {}
}

function getToken() { return safeStorageGet(TOKEN_KEY); }
function setToken(t) { safeStorageSet(TOKEN_KEY, t); }
function clearToken() { safeStorageRemove(TOKEN_KEY); clearRefreshToken(); }

function getRefreshToken() { return safeStorageGet(REFRESH_KEY); }
function setRefreshToken(t) { safeStorageSet(REFRESH_KEY, t); }
function clearRefreshToken() { safeStorageRemove(REFRESH_KEY); }

// ── 401 interceptor ───────────────────────────────────────────────────────────
let _401InFlight = false;
function _on401() {
  if (_401InFlight) return;
  _401InFlight = true;
  window._handleSessionExpired?.();
  setTimeout(() => { _401InFlight = false; }, 5000);
}

// ── Demo-mode fetch shim ─────────────────────────────────────────────────────
// On Netlify preview / dev with VITE_ENABLE_DEMO=1 the offline demo-login
// stores a synthetic '*-demo-token' string. Every backend call from that
// session is rejected by the real API (401/403) or hits an endpoint the
// preview API does not expose (404). The browser logs each failed response
// as a console error — JS .catch() cannot suppress that browser log. To
// keep reviewer consoles clean, short-circuit predictable demo failures by
// returning a synthetic empty response WITHOUT firing the network call.
// Auth endpoints still pass through so demo-login / refresh / me work.
const _DEMO_PASSTHROUGH = /^\/api\/v1\/auth\/(demo-login|refresh|me|login|logout|register|activate-patient|forgot-password|reset-password)\b/;
function _isDemoSession() {
  try {
    const flag = import.meta.env?.DEV || import.meta.env?.VITE_ENABLE_DEMO === '1';
    if (!flag) return false;
    const t = getToken();
    return !!(t && t.endsWith('-demo-token'));
  } catch { return false; }
}
function _mriDemoLongitudinalCompare(baselineId, followupId) {
  return {
    demo: true,
    baseline_analysis_id: baselineId,
    followup_analysis_id: followupId,
    days_between: 30,
    summary:
      'Demo longitudinal preview — use a real clinician session against the API for visit-to-visit change maps from stored analyses.',
    structural_changes: [
      {
        region: 'Left-Hippocampus',
        baseline_value: 4200.0,
        followup_value: 4150.0,
        delta_absolute: -50.0,
        delta_pct: -1.19,
        flagged: false,
        metric: 'subcortical_volume_mm3',
      },
    ],
    functional_changes: [],
    diffusion_changes: [],
    comparison_meta: {
      key_findings: [
        { domain: 'structural', region: 'Left-Hippocampus', delta_pct: -1.19 },
      ],
    },
    pipeline_version: '0.1.0',
  };
}

function _demoSyntheticResponse(path, method) {
  const compare = path.match(/^\/api\/v1\/mri\/compare\/([^/]+)\/([^/?]+)/);
  if (compare && (!method || method === 'GET')) {
    return _mriDemoLongitudinalCompare(
      decodeURIComponent(compare[1]),
      decodeURIComponent(compare[2]),
    );
  }
  // Mutations: pretend success (return a minimal accepted-shape object).
  if (method && method !== 'GET') return { ok: true, demo: true, id: 'demo-' + Date.now() };
  // Reads: list-shaped endpoints get { items: [] }; singular getters get null.
  // Heuristic: most cohort/list endpoints already expect { items: [...] }, so
  // returning that shape matches the existing fallback path in pages.
  return { items: [], demo: true };
}

function _extractTransport(res, extractor) {
  if (typeof extractor !== 'function') return undefined;
  try {
    return extractor(res);
  } catch {
    return undefined;
  }
}

async function apiFetch(path, opts = {}) {
  let res;
  const { _fetch: fetchOverride, _transportExtractor: transportExtractor, ...requestOpts } = opts;
  const fetchFn = fetchOverride || globalThis.fetch;
  // Demo-mode shim — short-circuit before any network call. See helper above.
  if (_isDemoSession() && !_DEMO_PASSTHROUGH.test(path)) {
    const data = _demoSyntheticResponse(path, (requestOpts.method || 'GET').toUpperCase());
    if (transportExtractor) return { data, transport: undefined };
    return data;
  }
  // Detect multipart uploads: when body is FormData, omit the JSON content-type
  // so the browser can set the correct multipart/form-data boundary automatically.
  const _isFormData = (typeof FormData !== 'undefined') && (requestOpts.body instanceof FormData);
  try {
    const token = getToken();
    const headers = { ...(requestOpts.headers || {}) };
    if (!_isFormData && !('Content-Type' in headers) && !('content-type' in headers)) {
      headers['Content-Type'] = 'application/json';
    }
    if (token) headers['Authorization'] = `Bearer ${token}`;
    res = await fetchFn(`${API_BASE}${path}`, { ...requestOpts, headers });
  } catch (networkErr) {
    const err = new Error('Network error');
    err.status = 0;
    err.message = 'Network error';
    throw err;
  }
  if (res.status === 401) {
    // Avoid infinite loop — never attempt refresh when the refresh call itself 401s.
    // If that 401 is user_not_found / not_a_real_user (demo session — refresh
    // requires a DB user), don't clear tokens: access token is still valid for
    // every other endpoint.
    if (path === '/api/v1/auth/refresh') {
      let rb = null; try { rb = await res.clone().json(); } catch {}
      if (rb && (rb.code === 'user_not_found' || rb.code === 'not_a_real_user')) {
        const e = new Error(rb.message || 'Refresh not available for demo account');
        e.status = 401; e.code = rb.code; e.body = rb; return Promise.reject(e);
      }
      clearToken(); _on401();
      const e = new Error('API error 401'); e.status = 401; return Promise.reject(e);
    }
    // Peek at the original 401 first. If the endpoint explicitly rejects the
    // demo actor, skip the refresh dance (refresh will also fail) and surface
    // the error without clearing tokens.
    let origBody = null; try { origBody = await res.clone().json(); } catch {}
    if (origBody && origBody.code === 'not_a_real_user') {
      const err = new Error(origBody.message || 'Not available for demo account');
      err.status = 401; err.code = 'not_a_real_user'; err.body = origBody;
      return Promise.reject(err);
    }
    const storedRefresh = getRefreshToken();
    if (storedRefresh) {
      let refreshResult;
      try {
        refreshResult = await apiFetch('/api/v1/auth/refresh', {
          method: 'POST',
          body: JSON.stringify({ refresh_token: storedRefresh }),
        });
      } catch (_) { refreshResult = null; }
      if (refreshResult && refreshResult.access_token) {
        setToken(refreshResult.access_token);
        if (refreshResult.refresh_token) setRefreshToken(refreshResult.refresh_token);
        // Retry original request once with new token
        const retryHeaders = { ...(requestOpts.headers || {}) };
        if (!_isFormData && !('Content-Type' in retryHeaders) && !('content-type' in retryHeaders)) {
          retryHeaders['Content-Type'] = 'application/json';
        }
        retryHeaders['Authorization'] = `Bearer ${refreshResult.access_token}`;
        let retryRes;
        try {
          retryRes = await fetchFn(`${API_BASE}${path}`, { ...requestOpts, headers: retryHeaders });
        } catch (networkErr) {
          const err = new Error('Network error');
          err.status = 0;
          throw err;
        }
        if (retryRes.status === 204) {
          if (transportExtractor) return { data: null, transport: _extractTransport(retryRes, transportExtractor) };
          return null;
        }
        if (!retryRes.ok) {
          const retryErr = new Error(`API error ${retryRes.status}`);
          retryErr.status = retryRes.status;
          try { const e = await retryRes.json(); retryErr.message = e.detail || retryErr.message; } catch {}
          if (retryRes.status === 403) { console.warn('[api] 403 Forbidden:', path); }
          throw retryErr;
        }
        const retryData = await retryRes.json();
        if (transportExtractor) {
          return { data: retryData, transport: _extractTransport(retryRes, transportExtractor) };
        }
        return retryData;
      }
    }
    // Per-endpoint "not a real user" — demo JWTs are rejected by routes that
    // require a DB-backed user (e.g. profile/preferences/clinic). Surface as
    // a plain 401 without clearing tokens, so the session stays alive for
    // every other endpoint.
    let body401 = null;
    try { body401 = await res.clone().json(); } catch {}
    if (body401 && body401.code === 'not_a_real_user') {
      const err = new Error(body401.message || 'Not available for demo account');
      err.status = 401;
      err.code = 'not_a_real_user';
      err.body = body401;
      return Promise.reject(err);
    }
    // Demo-token guard — in dev/demo mode the token is a synthetic string
    // (e.g. "clinician-demo-token") that the real backend will always reject.
    // Don't clear it or fire session-expired; let the caller handle the error.
    const _curToken = getToken();
    const _demoOk = import.meta.env?.DEV || import.meta.env?.VITE_ENABLE_DEMO === '1';
    if (_demoOk && _curToken && _curToken.endsWith('-demo-token')) {
      const demoErr = new Error('Demo session — endpoint not available');
      demoErr.status = 401;
      demoErr.code = 'demo_session';
      return Promise.reject(demoErr);
    }
    // Refresh failed or unavailable — session truly expired
    clearToken();
    _on401();
    const expiredErr = new Error('API error 401');
    expiredErr.status = 401;
    return Promise.reject(expiredErr);
  }
  if (res.status === 204) {
    if (transportExtractor) return { data: null, transport: _extractTransport(res, transportExtractor) };
    return null;
  }
  if (!res.ok) {
    const err = new Error(`API error ${res.status}`);
    err.status = res.status;
    try {
      const e = await res.json();
      err.message = e.message || e.detail || err.message;
      err.body = e;
      if (e.code) err.code = e.code;
      if (e.details != null) err.details = e.details;
    } catch {}
    if (res.status === 403) { console.warn('[api] 403 Forbidden:', path); }
    throw err;
  }
  const data = await res.json();
  if (transportExtractor) {
    return { data, transport: _extractTransport(res, transportExtractor) };
  }
  return data;
}

async function apiFetchWithRetry(path, opts = {}, maxRetries = 2) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await apiFetch(path, opts);
    } catch (err) {
      lastError = err;
      // Don't retry on auth errors or client errors (4xx)
      if (err.message && /API error 4\d\d/.test(err.message)) throw err;
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 500)); // 500ms, 1s
      }
    }
  }
  throw lastError;
}

async function apiFetchBlob(path, data) {
  const token = getToken();
  const res = await globalThis.fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Export error ${res.status}`);
  return res.blob();
}

async function apiFetchBinary(path, opts = {}) {
  // Demo preview: MRI PDF/HTML/overlay routes cannot satisfy auth from <iframe src>.
  // Return a tiny HTML stub so download/open flows do not throw noisy 401s.
  if (_isDemoSession() && !_DEMO_PASSTHROUGH.test(path)) {
    const binaryMri = /^\/api\/v1\/mri\/(report\/[^/]+\/(pdf|html)|overlay\/[^/]+\/[^/?]+)/.test(path);
    if (binaryMri) {
      const stub =
        '<!DOCTYPE html><html><head><meta charset="utf-8"><title>MRI demo</title></head>'
        + '<body style="font-family:system-ui;padding:16px;background:#0f172a;color:#e2e8f0">'
        + '<p>MRI demo preview — PDF/HTML/overlay downloads require a live API session.</p>'
        + '</body></html>';
      const blob = new Blob([stub], { type: 'text/html;charset=utf-8' });
      return { blob, contentType: 'text/html;charset=utf-8', filename: 'mri_demo_preview.html' };
    }
  }
  const token = getToken();
  const headers = { ...(opts.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await globalThis.fetch(`${API_BASE}${path}`, {
    method: opts.method || 'GET',
    ...opts,
    headers,
  });
  if (!res.ok) {
    let detail = `API error ${res.status}`;
    try {
      const body = await res.json();
      detail = body?.message || body?.detail || detail;
    } catch {}
    const err = new Error(detail);
    err.status = res.status;
    throw err;
  }
  const disposition = res.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename="([^"]+)"/i);
  return {
    blob: await res.blob(),
    contentType: res.headers.get('Content-Type') || '',
    filename: match?.[1] || null,
  };
}

/**
 * Strip client-only fields; map `lastSyncedServerRevision` → `lastKnownServerRevision` for PUT.
 * POST create omits revision hints.
 * @param {object} task
 * @param {{ forCreate?: boolean }} [opts]
 */
function prepareHomeProgramTaskRequestBody(task, opts = {}) {
  const forCreate = opts.forCreate === true;
  const body = { ...task };
  delete body._syncStatus;
  delete body._conflictServerTask;
  delete body._syncConflictReason;
  delete body.createDisposition;
  delete body.lastSyncedServerRevision;
  if (!forCreate) {
    if (task.lastSyncedServerRevision != null && task.lastSyncedServerRevision !== '') {
      body.lastKnownServerRevision = task.lastSyncedServerRevision;
    }
  } else {
    delete body.lastKnownServerRevision;
  }
  return body;
}

function extractHomeProgramTaskTransport(res) {
  return {
    legacyPutCreateHeader: res?.headers?.get?.('X-DS-Home-Task-Legacy-Put-Create') ?? null,
    deprecationHeader: res?.headers?.get?.('Deprecation') ?? null,
  };
}

// Audit-trail query-string builder. Skips empty/null/undefined values so the
// URL stays clean. Encodes safely for any user-supplied search text.
function _auditQs(filters = {}) {
  const out = [];
  Object.keys(filters || {}).forEach((k) => {
    const v = filters[k];
    if (v === null || v === undefined || v === '') return;
    out.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  });
  return out.join('&');
}

export const api = {
  getToken, setToken, clearToken,
  getRefreshToken, setRefreshToken, clearRefreshToken,

  // ── Auth ────────────────────────────────────────────────────────────────
  login: async (email, password) => {
    const result = await apiFetch('/api/v1/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    if (result && result.refresh_token) setRefreshToken(result.refresh_token);
    return result;
  },
  logout: () => {
    const rt = getRefreshToken();
    return apiFetch('/api/v1/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: rt || null }),
    });
  },
  register: (email, display_name, password, role = 'clinician') =>
    apiFetch('/api/v1/auth/register', { method: 'POST', body: JSON.stringify({ email, display_name, password, role }) }),
  activatePatient: (invite_code, email, display_name, password) =>
    apiFetch('/api/v1/auth/activate-patient', { method: 'POST', body: JSON.stringify({ invite_code, email, display_name, password }) }),
  refresh: (refresh_token) =>
    apiFetch('/api/v1/auth/refresh', { method: 'POST', body: JSON.stringify({ refresh_token }) }),
  forgotPassword: (email) =>
    apiFetch('/api/v1/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),
  resetPassword: (token, new_password) =>
    apiFetch('/api/v1/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, new_password }) }),
  me: () => apiFetch('/api/v1/auth/me'),
  demoLogin: (token) => apiFetch('/api/v1/auth/demo-login', { method: 'POST', body: JSON.stringify({ token }) }),

  // ── Patients ────────────────────────────────────────────────────────────
  // `arg` is optional: pass a plain object of query params (status, q,
  // condition, modality, clinician, sort, limit, offset) to activate server-
  // side filtering. Omitting it keeps backward-compat with every caller that
  // expects the full clinician cohort.
  listPatients: (arg) => {
    let qs = '';
    if (arg && typeof arg === 'object') {
      const entries = Object.entries(arg).filter(([_, v]) => v != null && v !== '');
      if (entries.length) {
        qs = '?' + new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString();
      }
    }
    return apiFetchWithRetry(`/api/v1/patients${qs}`);
  },
  patients: (arg) => api.listPatients(arg),
  getPatientsCohortSummary: () => apiFetchWithRetry('/api/v1/patients/cohort-summary'),
  getPatient: (id) => apiFetch(`/api/v1/patients/${id}`),
  createPatient: (data) => apiFetch('/api/v1/patients', { method: 'POST', body: JSON.stringify(data) }),
  updatePatient: (id, data) => apiFetch(`/api/v1/patients/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deletePatient: (id) => apiFetch(`/api/v1/patients/${id}`, { method: 'DELETE' }),
  generateInviteCode: (patientData) =>
    apiFetch('/api/v1/patients/invite', { method: 'POST', body: JSON.stringify(patientData) }),
  generatePatientInvite: (data) =>
    apiFetch('/api/v1/patients/invite', { method: 'POST', body: JSON.stringify(data) }),
  getPatientSessions: (patientId) => apiFetch(`/api/v1/patients/${patientId}/sessions`),
  getPatientCourse: (patientId) => apiFetch(`/api/v1/patients/${patientId}/courses`),
  getPatientCourses: (patientId) => apiFetch(`/api/v1/patients/${patientId}/courses`),
  getPatientAssessments: (patientId) => apiFetch(`/api/v1/patients/${patientId}/assessments`),
  getPatientReports: (patientId) => apiFetch(`/api/v1/patients/${patientId}/reports`),
  getPatientMessages: (patientId) => apiFetch(`/api/v1/patients/${patientId}/messages`),
  // ── Patient Profile launch-audit (2026-04-30) ────────────────────────────
  // Aggregated detail, real consent timeline, audit-event ingestion + listing,
  // and DEMO-prefixed CSV / NDJSON exports. Closes the per-patient regulatory
  // record loop after Audit Trail (#305), Reports Hub (#310), Documents Hub,
  // Quality Assurance (#321), IRB Manager (#334), Clinical Trials (#336),
  // Course Detail (#335).
  getPatientDetail: (patientId) => apiFetch(`/api/v1/patients/${encodeURIComponent(patientId)}/detail`),
  getPatientConsentHistory: (patientId, opts = {}) =>
    apiFetch(`/api/v1/patients/${encodeURIComponent(patientId)}/consent-history${opts.limit ? '?limit=' + encodeURIComponent(opts.limit) : ''}`),
  listPatientProfileAuditEvents: (patientId, opts = {}) =>
    apiFetch(`/api/v1/patients/${encodeURIComponent(patientId)}/audit-events${opts.limit ? '?limit=' + encodeURIComponent(opts.limit) : ''}`),
  recordPatientProfileAuditEvent: (patientId, payload) =>
    apiFetch(`/api/v1/patients/${encodeURIComponent(patientId)}/audit-events`, {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    }),
  exportPatientCsv: (patientId) =>
    apiFetchBinary(`/api/v1/patients/${encodeURIComponent(patientId)}/export.csv`),
  exportPatientNdjson: (patientId) =>
    apiFetchBinary(`/api/v1/patients/${encodeURIComponent(patientId)}/export.ndjson`),
  sendPatientMessage: (patientId, messageOrPayload) => {
    const payload = (messageOrPayload && typeof messageOrPayload === 'object')
      ? messageOrPayload
      : { body: String(messageOrPayload || '') };
    return apiFetch(`/api/v1/patients/${patientId}/messages`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  markPatientMessageRead: (patientId, messageId) =>
    apiFetch(`/api/v1/patients/${patientId}/messages/${encodeURIComponent(messageId)}/read`, { method: 'PATCH' }),
  listCallRequests: (params = {}) => {
    const q = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v != null && v !== '')
    ).toString();
    return apiFetch(`/api/v1/patients/call-requests${q ? '?' + q : ''}`);
  },
  resolveCallRequest: (messageId) =>
    apiFetch(`/api/v1/patients/call-requests/${encodeURIComponent(messageId)}/resolve`, { method: 'PATCH' }),
  submitAssessment: (patientId, assessmentData) =>
    apiFetch('/api/v1/assessments', { method: 'POST', body: JSON.stringify({ ...assessmentData, patient_id: patientId }) }),

  // ── Sessions ────────────────────────────────────────────────────────────
  // Accepts either a string patient_id (legacy) or a query-params object.
  // Always sends a default `limit` (100) so a misuse can't pull the whole
  // cohort. Callers can pass `limit`/`offset` to paginate explicitly.
  // Examples:
  //   api.listSessions('pt-123')
  //   api.listSessions({ from: '2026-04-01', to: '2026-04-30', limit: 25 })
  //   api.listSessions({ patient_id: 'pt-123', status: 'scheduled' })
  listSessions: (arg) => {
    let params = {};
    if (arg && typeof arg === 'object') {
      params = { ...arg };
    } else if (arg) {
      params = { patient_id: arg };
    }
    if (params.limit == null) params.limit = 100;
    if (params.offset == null) params.offset = 0;
    const entries = Object.entries(params).filter(([_, v]) => v != null && v !== '');
    const qs = entries.length ? '?' + new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString() : '';
    return apiFetchWithRetry(`/api/v1/sessions${qs}`);
  },
  getCurrentSession: () => apiFetch('/api/v1/sessions/current'),
  listSessionEvents: (sessionId) => apiFetch(`/api/v1/sessions/${encodeURIComponent(sessionId)}/events`),
  logSessionEvent: (sessionId, data) =>
    apiFetch(`/api/v1/sessions/${encodeURIComponent(sessionId)}/events`, {
      method: 'POST',
      body: JSON.stringify({
        type: data?.type || 'INFO',
        note: data?.note || data?.message || '',
        payload: data?.payload || {},
      }),
    }),
  sessionPhaseTransition: (sessionId, phase) =>
    apiFetch(`/api/v1/sessions/${encodeURIComponent(sessionId)}/phase`, {
      method: 'POST',
      body: JSON.stringify({ phase }),
    }),
  startVideoConsult: (sessionId) =>
    apiFetch(`/api/v1/sessions/${encodeURIComponent(sessionId)}/video/start`, { method: 'POST' }),
  endVideoConsult: (sessionId) =>
    apiFetch(`/api/v1/sessions/${encodeURIComponent(sessionId)}/video/end`, { method: 'POST' }),
  remoteMonitorSnapshot: (sessionId) =>
    apiFetch(`/api/v1/sessions/${encodeURIComponent(sessionId)}/remote-monitor-snapshot`),
  // ── Session Runner launch-audit endpoints (2026-04-30) ─────────────────
  // Live telemetry — flagged is_demo:true when no real device is attached.
  // Frontend must surface a banner so the clinician never mistakes
  // rehearsal stub values for a real measurement.
  getSessionTelemetry: (sessionId) =>
    apiFetch(`/api/v1/sessions/${encodeURIComponent(sessionId)}/telemetry`),
  // NRS-SE comfort rating (0-10). Clinician input only — AI must NEVER
  // auto-fill this.
  recordSessionComfort: (sessionId, payload) =>
    apiFetch(`/api/v1/sessions/${encodeURIComponent(sessionId)}/comfort`, {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    }),
  // Clinician sign-off — without it, downstream consumers treat the
  // session record as an unsigned draft.
  signSession: (sessionId, payload = {}) =>
    apiFetch(`/api/v1/sessions/${encodeURIComponent(sessionId)}/sign`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  setSessionImpedance: (sessionId, impedance_kohm) =>
    apiFetch(`/api/v1/sessions/${encodeURIComponent(sessionId)}/impedance`, {
      method: 'POST',
      body: JSON.stringify({ impedance_kohm }),
    }),
  createSession: (data) => apiFetch('/api/v1/sessions', { method: 'POST', body: JSON.stringify(data) }),
  updateSession: (id, data) => apiFetch(`/api/v1/sessions/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteSession: (id) => apiFetch(`/api/v1/sessions/${id}`, { method: 'DELETE' }),

  // ── Assessments ─────────────────────────────────────────────────────────
  listAssessments: (patientId) => apiFetchWithRetry(`/api/v1/assessments${patientId ? `?patient_id=${encodeURIComponent(patientId)}` : ''}`),
  createAssessment: (data) => apiFetch('/api/v1/assessments', { method: 'POST', body: JSON.stringify(data) }),
  updateAssessment: (id, data) => apiFetch(`/api/v1/assessments/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteAssessment: (id) => apiFetch(`/api/v1/assessments/${id}`, { method: 'DELETE' }),
  assignAssessment: (patientId, data) => apiFetch('/api/v1/assessments/assign', { method: 'POST', body: JSON.stringify({ patient_id: patientId, ...data }) }),
  bulkAssignAssessments: (data) => apiFetch('/api/v1/assessments/bulk-assign', { method: 'POST', body: JSON.stringify(data) }),
  listAssessmentTemplates: () => apiFetchWithRetry('/api/v1/assessments/templates'),
  listAssessmentScales: () => apiFetchWithRetry('/api/v1/assessments/scales'),
  getPatientAssessmentSummary: (patientId) => apiFetch(`/api/v1/assessments/summary/${encodeURIComponent(patientId)}`),
  getPatientAssessmentAIContext: (patientId) => apiFetch(`/api/v1/assessments/ai-context/${encodeURIComponent(patientId)}`),
  approveAssessment: (id, body) => apiFetch(`/api/v1/assessments/${id}/approve`, { method: 'POST', body: JSON.stringify(body || { approved: true }) }),
  // Best-effort stubs consumed by the design-v2 Assessments Hub. The hub wraps
  // every call in try/catch and falls back to mock/local state if the endpoint
  // is missing, so these reject cleanly on a 404.
  generateAssessmentSummary: (id) => apiFetch(`/api/v1/assessments/${encodeURIComponent(id)}/ai-summary`, { method: 'POST' }),
  exportAssessmentsCSV: (params) => apiFetch(`/api/v1/assessments/export${params ? '?' + new URLSearchParams(params).toString() : ''}`),
  getAssessmentDetail: (id) => apiFetch(`/api/v1/assessments/${encodeURIComponent(id)}`),
  escalateCrisis: (patientId, payload) => apiFetch(`/api/v1/crisis-escalations`, { method: 'POST', body: JSON.stringify({ patient_id: patientId, ...(payload || {}) }) }),
  listCohorts: () => apiFetchWithRetry('/api/v1/cohorts'),

  // ── Course-scoped reads (assessment severity, audit trail, AE roll-up) ──
  getCourseAssessmentSummary: (courseId) => apiFetch(`/api/v1/treatment-courses/${encodeURIComponent(courseId)}/assessment-summary`),
  getCourseAuditTrail: (courseId) => apiFetch(`/api/v1/treatment-courses/${encodeURIComponent(courseId)}/audit-trail`),
  getCourseAdverseEventsSummary: (courseId) => apiFetch(`/api/v1/treatment-courses/${encodeURIComponent(courseId)}/adverse-events-summary`),
  // ── Course Detail launch-audit (PR feat/course-detail-launch-audit-2026-04-30) ──
  // Aggregated detail for the page header + DEMO/terminal-state flags.
  getCourseDetail: (courseId) => apiFetch(`/api/v1/treatment-courses/${encodeURIComponent(courseId)}/detail`),
  // Roll-up: counts, interruption / deviation / tolerance breakdown.
  getCourseSessionsSummary: (courseId) => apiFetch(`/api/v1/treatment-courses/${encodeURIComponent(courseId)}/sessions/summary`),
  // Real audit timeline (treatment_course + course_detail rows merged).
  listCourseAuditEvents: (courseId, opts) => apiFetch(`/api/v1/treatment-courses/${encodeURIComponent(courseId)}/audit-events${opts && opts.limit ? '?limit=' + encodeURIComponent(opts.limit) : ''}`),
  // Page-level audit ingestion. Best-effort, soft-fails.
  recordCourseAuditEvent: (courseId, payload) =>
    apiFetch(`/api/v1/treatment-courses/${encodeURIComponent(courseId)}/audit-events`, {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    }).catch((e) => { try { console.warn('course audit event failed:', e?.message); } catch (_) {} return null; }),
  // Note-required state transitions.
  pauseCourse: (courseId, note) =>
    apiFetch(`/api/v1/treatment-courses/${encodeURIComponent(courseId)}/pause`, {
      method: 'POST',
      body: JSON.stringify({ note: note || '' }),
    }),
  resumeCourse: (courseId, note) =>
    apiFetch(`/api/v1/treatment-courses/${encodeURIComponent(courseId)}/resume`, {
      method: 'POST',
      body: JSON.stringify({ note: note || '' }),
    }),
  closeCourse: (courseId, note) =>
    apiFetch(`/api/v1/treatment-courses/${encodeURIComponent(courseId)}/close`, {
      method: 'POST',
      body: JSON.stringify({ note: note || '' }),
    }),
  // Per-course exports (DEMO-prefixed when course is demo).
  exportCourseCSV: (courseId) =>
    apiFetchBinary(`/api/v1/treatment-courses/${encodeURIComponent(courseId)}/export.csv`),
  exportCourseNDJSON: (courseId) =>
    apiFetchBinary(`/api/v1/treatment-courses/${encodeURIComponent(courseId)}/export.ndjson`),

  // ── Medical History ─────────────────────────────────────────────────────
  // Soft-fail load: returns null on error so non-critical consumers can keep rendering.
  getPatientMedicalHistory: (patientId) => apiFetch(`/api/v1/patients/${patientId}/medical-history`).catch(() => null),
  // Soft-fail legacy write (kept for fire-and-forget autosave from non-critical pages).
  savePatientMedicalHistory: (patientId, historyData) => apiFetch(`/api/v1/patients/${patientId}/medical-history`, { method: 'PATCH', body: JSON.stringify({ medical_history: historyData, mode: 'replace' }) }).catch(e => { console.warn('Medical history sync failed:', e?.message); }),
  // Fail-loud merge save: used by the Patients Hub MH form so save failures surface.
  patchPatientMedicalHistorySections: (patientId, payload) =>
    apiFetch(`/api/v1/patients/${patientId}/medical-history`, {
      method: 'PATCH',
      body: JSON.stringify({ mode: 'merge_sections', ...payload }),
    }),
  // Fail-loud replace save: full-record save path (Save All).
  replacePatientMedicalHistory: (patientId, payload) =>
    apiFetch(`/api/v1/patients/${patientId}/medical-history`, {
      method: 'PATCH',
      body: JSON.stringify({ mode: 'replace', ...payload }),
    }),
  // Prompt-safe medical-history context preview for AI consumers.
  // Permission-gated server-side (clinician + ownership). Returns null on error.
  getPatientMedicalHistoryAIContext: (patientId) =>
    apiFetch(`/api/v1/patients/${patientId}/medical-history/ai-context`).catch(() => null),

  // ── Documents Hub ───────────────────────────────────────────────────────
  // Filter-aware list. ``params`` accepts patient_id / kind / status / since /
  // until / q / clinic_id / limit / offset (Documents Hub launch-audit
  // 2026-04-30). The legacy single-arg `listDocuments(patientId)` shape is
  // preserved for back-compat.
  listDocuments: (params) => {
    if (params && typeof params === 'object' && !Array.isArray(params)) {
      const q = new URLSearchParams(
        Object.entries(params).filter(([, v]) => v != null && v !== '')
      ).toString();
      return apiFetchWithRetry('/api/v1/documents' + (q ? '?' + q : ''));
    }
    const patientId = params; // legacy positional shape
    return apiFetchWithRetry(`/api/v1/documents${patientId ? '?patient_id=' + patientId : ''}`);
  },
  createDocument: (data) => apiFetch('/api/v1/documents', { method: 'POST', body: JSON.stringify(data) }),
  updateDocument: (id, data) => apiFetch(`/api/v1/documents/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  getDocument: (id) => apiFetch(`/api/v1/documents/${id}`),
  deleteDocument: (id) => apiFetch(`/api/v1/documents/${id}`, { method: 'DELETE' }),
  listPatientDocuments: (patientId) => apiFetchWithRetry(`/api/v1/patients/${patientId}/documents`),

  // Multipart upload for clinician-owned document files. Pass in a FormData
  // holding at minimum `file` and optionally `title`, `doc_type`, `patient_id`,
  // `notes`. Returns the created DocumentOut.
  uploadDocument: (formData) => {
    const token = getToken();
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return fetch(`${API_BASE}/api/v1/documents/upload`, { method: 'POST', headers, body: formData })
      .then(async r => {
        if (!r.ok) {
          // Surface the API's `detail.message` instead of a bare status — so
          // the toast can say "File type not allowed" rather than "API error 422".
          let detail = `API error ${r.status}`;
          try {
            const body = await r.json();
            detail = body?.detail?.message || body?.message || detail;
          } catch (_) { /* fall back to status */ }
          throw new Error(detail);
        }
        return r.json();
      });
  },
  fetchDocumentDownload: (id) =>
    apiFetchBinary(`/api/v1/documents/${encodeURIComponent(id)}/download`),
  // Plain anchor href for browsers that drive download via `<a download>`.
  // The server requires Authorization, so this only works with cookie-bearer
  // setups; for token-bearer setups the caller should use fetchDocumentDownload
  // and convert to a Blob. Kept here for the Documents Hub `↓` button.
  documentDownloadUrl: (id) =>
    `${API_BASE}/api/v1/documents/${encodeURIComponent(id)}/download`,

  // ── Documents Hub launch-audit (2026-04-30) ───────────────────────────
  // Counts: total / draft / uploaded / signed / superseded / by_kind / by_status.
  getDocumentsSummary: (params = {}) => {
    const q = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v != null && v !== '')
    ).toString();
    return apiFetch('/api/v1/documents/summary' + (q ? '?' + q : ''));
  },
  // Sign-off; idempotent for same actor; 409 if already superseded.
  signDocument: (docId, note) =>
    apiFetch(`/api/v1/documents/${encodeURIComponent(docId)}/sign`, {
      method: 'POST',
      body: JSON.stringify({ note: note || null }),
    }),
  // Create a new revision; original is marked superseded with a back-pointer.
  supersedeDocument: (docId, opts = {}) =>
    apiFetch(`/api/v1/documents/${encodeURIComponent(docId)}/supersede`, {
      method: 'POST',
      body: JSON.stringify({
        reason: opts.reason || 'no reason given',
        new_title: opts.new_title || null,
        new_notes: opts.new_notes == null ? null : opts.new_notes,
      }),
    }),
  // Filtered bulk export — returns a Blob (zip).
  exportDocumentsZip: (params = {}) => {
    const q = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v != null && v !== '')
    ).toString();
    return apiFetchBinary('/api/v1/documents/export.zip' + (q ? '?' + q : ''));
  },
  // Best-effort page-level audit ingestion for the Documents Hub.
  logDocumentsAudit: (event) => {
    try {
      const body = JSON.stringify(event || {});
      return apiFetch('/api/v1/documents/audit-events', {
        method: 'POST',
        body,
      });
    } catch (_) {
      return Promise.resolve(null);
    }
  },

  // ── Session Recordings (Virtual Care Recording Studio) ──────────────────
  // Backs the ▶ button in the Recording Studio. Bytes live on the local Fly
  // volume — see apps/api/app/routers/recordings_router.py.
  listRecordings: (patientId) =>
    apiFetchWithRetry(`/api/v1/recordings${patientId ? '?patient_id=' + encodeURIComponent(patientId) : ''}`),
  uploadRecording: (file, { title, patientId, durationSeconds } = {}) => {
    const form = new FormData();
    form.append('file', file);
    if (title) form.append('title', title);
    if (patientId) form.append('patient_id', patientId);
    if (durationSeconds != null) form.append('duration_seconds', String(durationSeconds));
    return apiFetch('/api/v1/recordings', { method: 'POST', body: form });
  },
  deleteRecording: (id) =>
    apiFetch(`/api/v1/recordings/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  // Authenticated fetch → blob URL the HTML5 <audio>/<video> element can src=
  // (browsers can't attach Authorization to <audio src>, so we fetch the file
  // and hand off an object URL the caller is expected to revokeObjectURL).
  recordingPlaybackUrl: async (id) => {
    const token = getToken();
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}/api/v1/recordings/${encodeURIComponent(id)}/file`, { headers });
    if (!res.ok) {
      const err = new Error(`Recording playback failed (${res.status})`);
      err.status = res.status;
      throw err;
    }
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  },

  // ── Voice / Audio biomarker analyzer (deepsynaps-audio pipeline) ───────
  audioAnalyzeUpload: (file, { sessionId, patientId, taskProtocol, transcript } = {}) => {
    const form = new FormData();
    form.append('file', file);
    form.append('session_id', sessionId || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now())));
    if (patientId) form.append('patient_id', patientId);
    if (taskProtocol) form.append('task_protocol', taskProtocol);
    if (transcript) form.append('transcript', transcript);
    return apiFetch('/api/v1/audio/analyze-upload', { method: 'POST', body: form });
  },
  audioAnalyzeRecording: (recordingId, { sessionId, patientId, taskProtocol, transcript } = {}) => {
    const q = new URLSearchParams();
    q.set('session_id', sessionId || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now())));
    if (patientId) q.set('patient_id', patientId);
    if (taskProtocol) q.set('task_protocol', taskProtocol);
    if (transcript) q.set('transcript', transcript);
    return apiFetch(
      `/api/v1/audio/analyze-recording/${encodeURIComponent(recordingId)}?${q.toString()}`,
      { method: 'POST' },
    );
  },
  audioGetReport: (analysisId) =>
    apiFetch(`/api/v1/audio/report/${encodeURIComponent(analysisId)}`),
  audioListPatientAnalyses: (patientId, limit = 30) =>
    apiFetch(`/api/v1/audio/patients/${encodeURIComponent(patientId)}/analyses?limit=${limit}`),

  // ── Clinical text NLP (OpenMed-backed analyze / pii / deidentify) ──────
  // Backed by /api/v1/clinical-text/* in clinical_text_router.py.
  // Decision-support framing only — extracted entities are NLP candidates,
  // never validated clinical findings.
  clinicalTextHealth: () => apiFetch('/api/v1/clinical-text/health'),
  clinicalTextAnalyze: ({ text, sourceType = 'free_text', locale = 'en' } = {}) =>
    apiFetch('/api/v1/clinical-text/analyze', {
      method: 'POST',
      body: JSON.stringify({ text, source_type: sourceType, locale }),
    }),
  clinicalTextExtractPII: ({ text, sourceType = 'free_text', locale = 'en' } = {}) =>
    apiFetch('/api/v1/clinical-text/extract-pii', {
      method: 'POST',
      body: JSON.stringify({ text, source_type: sourceType, locale }),
    }),
  clinicalTextDeidentify: ({ text, sourceType = 'free_text', locale = 'en' } = {}) =>
    apiFetch('/api/v1/clinical-text/deidentify', {
      method: 'POST',
      body: JSON.stringify({ text, source_type: sourceType, locale }),
    }),

  // Custom document templates (clinician-authored, distinct from the bundled
  // DOCUMENT_TEMPLATES read-only set in apps/web/src/documents-templates.js).
  // Backed by /api/v1/documents/templates* in documents_router.py.
  listDocumentTemplates: () => apiFetchWithRetry('/api/v1/documents/templates'),
  createDocumentTemplate: (data) =>
    apiFetch('/api/v1/documents/templates', { method: 'POST', body: JSON.stringify(data) }),
  updateDocumentTemplate: (id, data) =>
    apiFetch(`/api/v1/documents/templates/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteDocumentTemplate: (id) =>
    apiFetch(`/api/v1/documents/templates/${id}`, { method: 'DELETE' }),

  // Custom home task templates (clinician-authored, distinct from the bundled
  // DEFAULT_TEMPLATES + CONDITION_HOME_TEMPLATES read-only set in
  // pages-clinical-tools.js / home-program-condition-templates.js).
  // Backed by /api/v1/home-task-templates* in home_task_templates_router.py.
  // Source of truth — localStorage('ds_home_task_templates') is now a
  // write-through cache for offline UX only.
  listHomeTaskTemplates: () => apiFetchWithRetry('/api/v1/home-task-templates'),
  createHomeTaskTemplate: (data) =>
    apiFetch('/api/v1/home-task-templates', { method: 'POST', body: JSON.stringify(data) }),
  updateHomeTaskTemplate: (id, data) =>
    apiFetch(`/api/v1/home-task-templates/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteHomeTaskTemplate: (id) =>
    apiFetch(`/api/v1/home-task-templates/${id}`, { method: 'DELETE' }),

  // AI Practice Agent skills (admin-configurable, replaces the hard-coded
  // CLINICIAN_SKILLS constant in pages-agents.js). The bundled constant is
  // kept as a fallback for offline / API-down rendering.
  // Backed by /api/v1/agent-skills* in agent_skills_router.py.
  listAgentSkills: () => apiFetchWithRetry('/api/v1/agent-skills'),
  createAgentSkill: (data) =>
    apiFetch('/api/v1/agent-skills', { method: 'POST', body: JSON.stringify(data) }),
  updateAgentSkill: (id, data) =>
    apiFetch(`/api/v1/agent-skills/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteAgentSkill: (id) =>
    apiFetch(`/api/v1/agent-skills/${id}`, { method: 'DELETE' }),

  // ── Clinical Knowledge ──────────────────────────────────────────────────
  // Retargeted: the legacy stub endpoints were never implemented. These now
  // point at the real curated sources so callers keep working.
  listEvidence: () => apiFetchWithRetry('/api/v1/literature'),
  listDevices: () => apiFetchWithRetry('/api/v1/registry/devices'),

  // ── Library Hub (page-scoped aggregate, includes trust/eligibility) ─────
  libraryOverview: () => apiFetchWithRetry('/api/v1/library/overview'),
  libraryConditionSummary: (conditionId) =>
    apiFetch(`/api/v1/library/conditions/${encodeURIComponent(conditionId)}/summary`),
  libraryExternalSearch: ({ q, condition_id = null, limit = 15 } = {}) =>
    apiFetch('/api/v1/library/external-search', {
      method: 'POST',
      body: JSON.stringify({ q, condition_id, limit }),
    }),
  librarySummarizeEvidence: ({ paper_ids, focus = null } = {}) =>
    apiFetch('/api/v1/library/ai/summarize-evidence', {
      method: 'POST',
      body: JSON.stringify({ paper_ids, focus }),
    }),

  // ── Neuromodulation research bundle (Desktop-backed enriched corpus) ────
  researchHealth: () => apiFetch('/api/v1/evidence/research/health'),
  listResearchDatasets: () => apiFetch('/api/v1/evidence/research/datasets'),
  downloadResearchDatasetUrl: (datasetKey) =>
    `${API_BASE}/api/v1/evidence/research/datasets/${encodeURIComponent(datasetKey)}/download`,
  listResearchConditions: () => apiFetch('/api/v1/evidence/research/conditions'),
  getResearchCondition: (conditionSlug) =>
    apiFetch(`/api/v1/evidence/research/conditions/${encodeURIComponent(conditionSlug)}`),
  searchResearchPapers: (params = {}) => {
    const q = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v != null && v !== '')
    ).toString();
    return apiFetch(`/api/v1/evidence/research/papers${q ? '?' + q : ''}`);
  },
  listResearchExactProtocols: (params = {}) => {
    const q = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v != null && v !== '')
    ).toString();
    return apiFetch(`/api/v1/evidence/research/exact-protocols${q ? '?' + q : ''}`);
  },
  listResearchProtocolTemplates: (params = {}) => {
    const q = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v != null && v !== '')
    ).toString();
    return apiFetch(`/api/v1/evidence/research/protocol-templates${q ? '?' + q : ''}`);
  },
  listResearchEvidenceGraph: (params = {}) => {
    const q = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v != null && v !== '')
    ).toString();
    return apiFetch(`/api/v1/evidence/research/evidence-graph${q ? '?' + q : ''}`);
  },
  listResearchSafetySignals: (params = {}) => {
    const q = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v != null && v !== '')
    ).toString();
    return apiFetch(`/api/v1/evidence/research/safety-signals${q ? '?' + q : ''}`);
  },
  getResearchSummary: (params = {}) => {
    const q = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v != null && v !== '')
    ).toString();
    return apiFetch(`/api/v1/evidence/research/summary${q ? '?' + q : ''}`);
  },
  longitudinalReport: (params = {}) => {
    const q = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v != null && v !== '')
    ).toString();
    return apiFetch(`/api/v1/outcomes/longitudinal${q ? '?' + q : ''}`);
  },
  protocolCoverage: (params = {}) => {
    const q = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v != null && v !== '')
    ).toString();
    return apiFetch(`/api/v1/evidence/research/protocol-coverage${q ? '?' + q : ''}`);
  },
  listTargets: async () => {
    const res = await api.listBrainRegions();
    return Array.isArray(res?.items) ? res.items : [];
  },
  listMontages: (params = {}) => api.listResearchExactProtocols(params),
  listProtocolEvidence: (params = {}) => api.searchResearchPapers(params),

  // Literature list alias for the Library page (same endpoint as getLiterature).
  listLiterature: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetchWithRetry(`/api/v1/literature${q ? '?' + q : ''}`);
  },

  // ── Live evidence pipeline (PubMed + OpenAlex + CT.gov + FDA) ───────────
  // Hits services/evidence-pipeline via the api's evidence_router.
  // Router returns 503 with a clear message until the evidence DB is built.
  evidenceIndications: () => apiFetch('/api/v1/evidence/indications'),
  searchEvidencePapers: ({ q = '', indication = '', grade = '', oa_only = false, limit = 20 } = {}) => {
    const params = new URLSearchParams();
    if (q)          params.set('q', q);
    if (indication) params.set('indication', indication);
    if (grade)      params.set('grade', grade);
    if (oa_only)    params.set('oa_only', 'true');
    if (limit)      params.set('limit', String(limit));
    return apiFetch(`/api/v1/evidence/papers?${params.toString()}`);
  },
  evidencePaperDetail: (id) => apiFetch(`/api/v1/evidence/papers/${encodeURIComponent(id)}`),
  searchEvidenceTrials: ({ indication = '', q = '', status = '', limit = 20 } = {}) => {
    const params = new URLSearchParams();
    if (indication) params.set('indication', indication);
    if (q)          params.set('q', q);
    if (status)     params.set('status', status);
    if (limit)      params.set('limit', String(limit));
    return apiFetch(`/api/v1/evidence/trials?${params.toString()}`);
  },
  searchEvidenceDevices: ({ indication = '', applicant = '', kind = '', limit = 30 } = {}) => {
    const params = new URLSearchParams();
    if (indication) params.set('indication', indication);
    if (applicant)  params.set('applicant', applicant);
    if (kind)       params.set('kind', kind);
    if (limit)      params.set('limit', String(limit));
    return apiFetch(`/api/v1/evidence/devices?${params.toString()}`);
  },
  // Promote an evidence paper to the doctor's personal Literature Library.
  promoteEvidencePaper: (id) =>
    apiFetch(`/api/v1/evidence/papers/${encodeURIComponent(id)}/promote-to-library`, { method: 'POST' }),

  // Suggest top papers+trials for a modality+indication pair.
  // Used by Protocol Builder "Evidence basis" panel.
  evidenceSuggest: ({ modality = '', indication = '', limit = 5 } = {}) => {
    const params = new URLSearchParams();
    if (modality)   params.set('modality', modality);
    if (indication) params.set('indication', indication);
    if (limit)      params.set('limit', String(limit));
    return apiFetch(`/api/v1/evidence/suggest?${params.toString()}`);
  },

  // Papers+trials+FDA for a specific saved protocol (Protocol Detail Evidence tab).
  evidenceForProtocol: (protocolId, { limit = 10 } = {}) =>
    apiFetch(`/api/v1/evidence/for-protocol/${encodeURIComponent(protocolId)}?limit=${limit}`),

  evidencePatientOverview: (patientId) =>
    apiFetch(`/api/v1/evidence/patient/${encodeURIComponent(patientId)}/overview`),
  evidenceQuery: (data = {}) =>
    apiFetch('/api/v1/evidence/query', { method: 'POST', body: JSON.stringify(data) }),
  evidenceByFinding: (data = {}) =>
    apiFetch('/api/v1/evidence/by-finding', { method: 'POST', body: JSON.stringify(data) }),
  saveEvidenceCitation: (data = {}) =>
    apiFetch('/api/v1/evidence/save-citation', { method: 'POST', body: JSON.stringify(data) }),
  listEvidenceSavedCitations: (arg) => {
    if (arg && typeof arg === 'object') {
      const patientId = arg.patient_id || arg.patientId || '';
      const q = new URLSearchParams(
        Object.entries({
          context_kind: arg.context_kind,
          analysis_id: arg.analysis_id,
          report_id: arg.report_id,
        }).filter(([, v]) => v != null && v !== '')
      ).toString();
      return apiFetch(`/api/v1/evidence/patient/${encodeURIComponent(patientId)}/saved-citations${q ? '?' + q : ''}`);
    }
    return apiFetch(`/api/v1/evidence/patient/${encodeURIComponent(arg)}/saved-citations`);
  },
  evidenceReportPayload: (data = {}) =>
    apiFetch('/api/v1/evidence/report-payload', { method: 'POST', body: JSON.stringify(data) }),

  // Public counts + last_updated timestamp (no auth required).
  evidenceStatus: () => apiFetch('/api/v1/evidence/status'),

  // Admin-only: trigger / inspect a full evidence refresh.
  adminRefreshEvidence: () =>
    apiFetch('/api/v1/evidence/admin/refresh', { method: 'POST' }),
  adminRefreshEvidenceStatus: () =>
    apiFetch('/api/v1/evidence/admin/refresh/status'),

  // ── Live Literature Watch (spec: docs/SPEC-live-literature-watch.md) ────
  // Per-protocol on-demand refresh + cross-protocol review queue + monthly
  // spend gauge. PubMed is free; Consensus/Apify are stubs in v1.
  litWatchRefresh: (protocolId, { source = 'pubmed', requested_by = null } = {}) =>
    apiFetch(`/api/v1/protocols/${encodeURIComponent(protocolId)}/refresh-literature`, {
      method: 'POST',
      body: JSON.stringify({ source, requested_by }),
    }),
  litWatchJobs: (protocolId) =>
    apiFetch(`/api/v1/protocols/${encodeURIComponent(protocolId)}/refresh-literature/jobs`),
  litWatchPending: ({ limit = 50, offset = 0 } = {}) =>
    apiFetch(`/api/v1/literature-watch/pending?limit=${limit}&offset=${offset}`),
  litWatchReview: (pmid, { verdict, protocol_id }) =>
    apiFetch(`/api/v1/literature-watch/${encodeURIComponent(pmid)}/review`, {
      method: 'POST',
      body: JSON.stringify({ verdict, protocol_id }),
    }),
  litWatchSpend: () => apiFetch('/api/v1/literature-watch/spend'),

  listBrainRegions: () => apiFetchWithRetry('/api/v1/brain-regions'),
  listQEEGBiomarkers: () => apiFetch('/api/v1/qeeg/biomarkers'),
  listQEEGConditionMap: () => apiFetch('/api/v1/qeeg/condition-map'),
  // Canonical clinical-target registry (DLPFC-L, mPFC, M1-L, …) used by
  // the Brain Map Planner. Deterministic anchor 10-20 site + MNI + evidence
  // grade per target.
  listBrainTargets: () => apiFetchWithRetry('/api/v1/brain-targets'),
  getBrainTarget: (id) => apiFetch(`/api/v1/brain-targets/${encodeURIComponent(id)}`),

  // ── Protocol & Handbooks ────────────────────────────────────────────────
  intakePreview: (data) =>
    apiFetch('/api/v1/intake/preview', { method: 'POST', body: JSON.stringify(data) }),
  generateProtocol: (data) =>
    apiFetch('/api/v1/protocols/generate-draft', { method: 'POST', body: JSON.stringify(data) }),
  generateBrainScanProtocol: (data) =>
    apiFetch('/api/v1/protocols/generate-brain-scan', { method: 'POST', body: JSON.stringify(data) }),
  generatePersonalizedProtocol: (data) =>
    apiFetch('/api/v1/protocols/generate-personalized', { method: 'POST', body: JSON.stringify(data) }),

  // ── Protocol Persistence ────────────────────────────────────────────────
  saveProtocol: (data) => apiFetch('/api/v1/protocols/saved', { method: 'POST', body: JSON.stringify(data) }),
  listSavedProtocols: (patientId) => apiFetchWithRetry(`/api/v1/protocols/saved${patientId ? '?patient_id=' + patientId : ''}`),
  updateSavedProtocol: (id, data) => apiFetch(`/api/v1/protocols/saved/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  generateHandbook: (data) =>
    apiFetch('/api/v1/handbooks/generate', { method: 'POST', body: JSON.stringify(data) }),
  caseSummary: (data) =>
    apiFetch('/api/v1/uploads/case-summary', { method: 'POST', body: JSON.stringify(data) }),

  // ── Export ──────────────────────────────────────────────────────────────
  exportProtocolDocx: (data) => apiFetchBlob('/api/v1/export/protocol-docx', data),
  exportHandbookDocx: (data) => apiFetchBlob('/api/v1/export/handbook-docx', data),
  exportPatientGuideDocx: (data) => apiFetchBlob('/api/v1/export/patient-guide-docx', data),

  // ── Review & Audit ──────────────────────────────────────────────────────
  // postReviewQueueAction: post approve/reject/escalate/comment to the review queue
  postReviewQueueAction: (data) =>
    apiFetch('/api/v1/review-queue/actions', { method: 'POST', body: JSON.stringify(data) }),
  // submitReview: normalises legacy { course_id, action, notes } shape to { review_item_id, action, notes }
  submitReview: (data) => {
    const body = {
      review_item_id: data.review_item_id || data.item_id || data.course_id,
      action: data.action,
      notes: data.notes || data.note || '',
    };
    return apiFetch('/api/v1/review-queue/actions', { method: 'POST', body: JSON.stringify(body) });
  },
  // ── Audit Trail (launch-audit 2026-04-30) ─────────────────────────────
  // The page reads /api/v1/audit-trail with rich filters, drills into
  // /audit-trail/{event_id}, fetches /summary for the top counts, and
  // exports through /export.csv | /export.ndjson. All five endpoints
  // share the same query-string contract; ``filters`` is an object whose
  // keys map 1:1 to the FastAPI query params.
  auditTrail: (filters = {}) => {
    const qs = _auditQs(filters);
    return apiFetch(`/api/v1/audit-trail${qs ? '?' + qs : ''}`);
  },
  auditTrailSummary: () => apiFetch('/api/v1/audit-trail/summary'),
  auditTrailEvent: (eventId) =>
    apiFetch(`/api/v1/audit-trail/${encodeURIComponent(eventId)}`),
  // Returns a {blob, contentType, filename} triple via apiFetchBinary so
  // the bearer token is attached and a real server-rendered file lands on
  // the caller's machine. No client-side fabrication.
  auditTrailExportCsv: (filters = {}) => {
    const qs = _auditQs(filters);
    return apiFetchBinary(`/api/v1/audit-trail/export.csv${qs ? '?' + qs : ''}`);
  },
  auditTrailExportNdjson: (filters = {}) => {
    const qs = _auditQs(filters);
    return apiFetchBinary(`/api/v1/audit-trail/export.ndjson${qs ? '?' + qs : ''}`);
  },
  // Authoritative governance rules (registry-backed). Used by the Governance
  // page to surface real policy items in the regulatory checklist.
  listGovernanceRules: () => apiFetchWithRetry('/api/v1/registries/governance-rules'),

  // ── Payments ────────────────────────────────────────────────────────────
  paymentConfig: () => apiFetch('/api/v1/payments/config'),
  createCheckout: (package_id) =>
    apiFetch('/api/v1/payments/create-checkout', { method: 'POST', body: JSON.stringify({ package_id }) }),
  createPortal: () =>
    apiFetch('/api/v1/payments/create-portal', { method: 'POST' }),

  // ── Chat ────────────────────────────────────────────────────────────────
  chatPublic: (messages) =>
    fetch(`${API_BASE}/api/v1/chat/public`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages }) }).then(r => r.json()),
  salesInquiry: (name, email, message, source = 'landing') =>
    fetch(`${API_BASE}/api/v1/chat/sales`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, message, source }),
    }).then(r => r.json()),
  chatAgent: (messages, provider = 'anthropic', openai_key = null, context = null) =>
    apiFetch('/api/v1/chat/agent', { method: 'POST', body: JSON.stringify({ messages, provider, openai_key, context }) }),
  chatClinician: (messages, patient_context) =>
    apiFetch('/api/v1/chat/clinician', { method: 'POST', body: JSON.stringify({ messages, patient_context }) }),
  chatPatient: (messages, patient_context, language = 'en', dashboard_context = null) =>
    apiFetch('/api/v1/chat/patient', {
      method: 'POST',
      body: JSON.stringify({ messages, patient_context, language, dashboard_context }),
    }),

  // ── Deeptwin ─────────────────────────────────────────────────────────────
  deeptwinAnalyze: (data) =>
    apiFetch('/api/v1/deeptwin/analyze', { method: 'POST', body: JSON.stringify(data) }),
  deeptwinSimulate: (data) =>
    apiFetch('/api/v1/deeptwin/simulate', { method: 'POST', body: JSON.stringify(data) }),
  // TRIBE-inspired layer (additive)
  deeptwinSimulateTribe: (data) =>
    apiFetch('/api/v1/deeptwin/simulate-tribe', { method: 'POST', body: JSON.stringify(data) }),
  deeptwinCompareProtocols: (data) =>
    apiFetch('/api/v1/deeptwin/compare-protocols', { method: 'POST', body: JSON.stringify(data) }),
  deeptwinPatientLatent: (data) =>
    apiFetch('/api/v1/deeptwin/patient-latent', { method: 'POST', body: JSON.stringify(data) }),
  deeptwinExplain: (data) =>
    apiFetch('/api/v1/deeptwin/explain', { method: 'POST', body: JSON.stringify(data) }),
  deeptwinReportPayload: (data) =>
    apiFetch('/api/v1/deeptwin/report-payload', { method: 'POST', body: JSON.stringify(data) }),
  deeptwinDashboard360: (patientId) =>
    apiFetch(`/api/v1/deeptwin/patients/${encodeURIComponent(patientId)}/dashboard`),
  deeptwinEvidence: (data) =>
    apiFetch('/api/v1/deeptwin/evidence', { method: 'POST', body: JSON.stringify(data) }),

  // ── Brain Twin (alias to Deeptwin v0 endpoints) ──────────────────────────
  brainTwinAnalyze: (data) =>
    apiFetch('/api/v1/brain-twin/analyze', { method: 'POST', body: JSON.stringify(data) }),
  brainTwinSimulate: (data) =>
    apiFetch('/api/v1/brain-twin/simulate', { method: 'POST', body: JSON.stringify(data) }),
  brainTwinEvidence: (data) =>
    apiFetch('/api/v1/brain-twin/evidence', { method: 'POST', body: JSON.stringify(data) }),

  // ── DeepTwin v1 (rich clinician page) ────────────────────────────────────
  getTwinSummary: (patientId) =>
    apiFetch(`/api/v1/deeptwin/patients/${encodeURIComponent(patientId)}/summary`),
  getTwinTimeline: (patientId, days = 90) =>
    apiFetch(`/api/v1/deeptwin/patients/${encodeURIComponent(patientId)}/timeline?days=${days}`),
  getTwinSignals: (patientId) =>
    apiFetch(`/api/v1/deeptwin/patients/${encodeURIComponent(patientId)}/signals`),
  getTwinCorrelations: (patientId) =>
    apiFetch(`/api/v1/deeptwin/patients/${encodeURIComponent(patientId)}/correlations`),
  getTwinPredictions: (patientId, horizon = '6w') =>
    apiFetch(`/api/v1/deeptwin/patients/${encodeURIComponent(patientId)}/predictions?horizon=${encodeURIComponent(horizon)}`),
  runTwinSimulation: (patientId, payload) =>
    apiFetch(`/api/v1/deeptwin/patients/${encodeURIComponent(patientId)}/simulations`, {
      method: 'POST', body: JSON.stringify(payload),
    }),
  generateTwinReport: (patientId, payload) =>
    apiFetch(`/api/v1/deeptwin/patients/${encodeURIComponent(patientId)}/reports`, {
      method: 'POST', body: JSON.stringify(payload),
    }),
  postTwinAgentHandoff: (patientId, payload) =>
    apiFetch(`/api/v1/deeptwin/patients/${encodeURIComponent(patientId)}/agent-handoff`, {
      method: 'POST', body: JSON.stringify(payload),
    }),

  // ── DeepTwin persistence & review (migration 063) ────────────────────────
  getDeepTwinDataSources: (patientId) =>
    apiFetch(`/api/v1/deeptwin/patients/${encodeURIComponent(patientId)}/data-sources`),
  createAnalysisRun: (patientId, payload) =>
    apiFetch(`/api/v1/deeptwin/patients/${encodeURIComponent(patientId)}/analysis-runs`, {
      method: 'POST', body: JSON.stringify(payload),
    }),
  listAnalysisRuns: (patientId) =>
    apiFetch(`/api/v1/deeptwin/patients/${encodeURIComponent(patientId)}/analysis-runs`),
  reviewAnalysisRun: (runId) =>
    apiFetch(`/api/v1/deeptwin/analysis-runs/${encodeURIComponent(runId)}/review`, { method: 'POST', body: '{}' }),
  createSimulationRun: (patientId, payload) =>
    apiFetch(`/api/v1/deeptwin/patients/${encodeURIComponent(patientId)}/simulation-runs`, {
      method: 'POST', body: JSON.stringify(payload),
    }),
  listSimulationRuns: (patientId) =>
    apiFetch(`/api/v1/deeptwin/patients/${encodeURIComponent(patientId)}/simulation-runs`),
  reviewSimulationRun: (runId) =>
    apiFetch(`/api/v1/deeptwin/simulation-runs/${encodeURIComponent(runId)}/review`, { method: 'POST', body: '{}' }),
  createClinicianNote: (patientId, payload) =>
    apiFetch(`/api/v1/deeptwin/patients/${encodeURIComponent(patientId)}/clinician-notes`, {
      method: 'POST', body: JSON.stringify(payload),
    }),
  listClinicianNotes: (patientId) =>
    apiFetch(`/api/v1/deeptwin/patients/${encodeURIComponent(patientId)}/clinician-notes`),

  // ── Registry endpoints (public — no auth needed but token attached if present) ──
  conditions: () => apiFetchWithRetry('/api/v1/registry/conditions'),
  listConditions: () => api.conditions(),
  modalities: () => apiFetchWithRetry('/api/v1/registry/modalities'),
  listModalities: () => api.modalities(),
  devices_registry: () => apiFetch('/api/v1/registry/devices'),
  protocols: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetchWithRetry(`/api/v1/registry/protocols${q ? '?' + q : ''}`);
  },
  protocolDetail: (id) => apiFetch(`/api/v1/registry/protocols/${id}`),
  conditionPackage: (slug) => apiFetch(`/api/v1/registry/conditions/${encodeURIComponent(slug)}/package`).catch(() => null),
  conditionPackageSlugs: () => apiFetch('/api/v1/registry/conditions/packages').catch(() => ({ slugs: [] })),
  phenotypes: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch(`/api/v1/registry/phenotypes${q ? '?' + q : ''}`);
  },

  // ── Treatment courses ────────────────────────────────────────────────────
  listCourses: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetchWithRetry(`/api/v1/treatment-courses${q ? '?' + q : ''}`);
  },
  createCourse: (data) => apiFetch('/api/v1/treatment-courses', { method: 'POST', body: JSON.stringify(data) }),
  getCourse: (id) => apiFetch(`/api/v1/treatment-courses/${id}`),
  updateCourse: (id, data) => apiFetch(`/api/v1/treatment-courses/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  activateCourse: (id, data = {}) =>
    apiFetch(`/api/v1/treatment-courses/${id}/activate`, { method: 'PATCH', body: JSON.stringify(data) }),
  // Safety preflight — returns requires_review / blocking_flags / override_required so the
  // UI can render a structured override modal instead of guessing.
  courseSafetyPreflight: (id) =>
    apiFetch(`/api/v1/treatment-courses/${id}/safety-preflight`),
  logSession: (courseId, data) =>
    apiFetch(`/api/v1/treatment-courses/${courseId}/sessions`, { method: 'POST', body: JSON.stringify(data) }),
  listCourseSessions: (courseId) => apiFetch(`/api/v1/treatment-courses/${courseId}/sessions`),

  /** List persisted home program tasks (optional patient filter: `patient_id` or `patientId`). */
  listHomeProgramTasks: (params = {}) => {
    const p = { ...params };
    if (p.patientId != null && p.patient_id == null) p.patient_id = p.patientId;
    delete p.patientId;
    const q = new URLSearchParams(p).toString();
    return apiFetchWithRetry(`/api/v1/home-program-tasks${q ? '?' + q : ''}`);
  },
  /** Clinician view of patient task completions (optional patient filter: `patient_id` or `patientId`). */
  listHomeProgramTaskCompletions: (params = {}) => {
    const p = { ...params };
    if (p.patientId != null && p.patient_id == null) p.patient_id = p.patientId;
    delete p.patientId;
    const q = new URLSearchParams(p).toString();
    return apiFetchWithRetry(`/api/v1/home-program-tasks/completions${q ? '?' + q : ''}`);
  },
  /**
   * Server-authoritative create (POST). Use when the task has never been persisted (`serverTaskId` absent).
   * @param {object} task
   */
  createHomeProgramTask: (task) =>
    apiFetch('/api/v1/home-program-tasks', {
      method: 'POST',
      body: JSON.stringify(prepareHomeProgramTaskRequestBody(task, { forCreate: true })),
    }),

  /**
   * Preferred mutation entrypoint for clients: POST for new tasks (no serverTaskId), PUT otherwise.
   * Returns a normalized mutation result (task fields stripped of transport metadata).
   *
   * @param {object} task
   * @param {{ force?: boolean }} [opts]
   */
  mutateHomeProgramTask: async (task, opts = {}) => {
    if (!task?.serverTaskId) {
      const { data, transport } = await api._homeProgramTaskMutationFetch('/api/v1/home-program-tasks', {
        method: 'POST',
        body: JSON.stringify(prepareHomeProgramTaskRequestBody(task, { forCreate: true })),
      });
      return parseHomeProgramTaskMutationResponse(data, transport);
    }
    const q = new URLSearchParams();
    if (opts.force) q.set('force', 'true');
    const qs = q.toString();
    const { data, transport } = await api._homeProgramTaskMutationFetch(
      `/api/v1/home-program-tasks/${encodeURIComponent(task.id)}${qs ? '?' + qs : ''}`,
      {
        method: 'PUT',
        body: JSON.stringify(prepareHomeProgramTaskRequestBody(task, { forCreate: false })),
      }
    );
    return parseHomeProgramTaskMutationResponse(data, transport);
  },

  /**
   * Lookup by authoritative server UUID (exports, admin, audit drill-down).
   * @param {string} serverTaskId
   */
  getHomeProgramTaskByServerId: (serverTaskId) =>
    apiFetch(`/api/v1/home-program-tasks/by-server-id/${encodeURIComponent(serverTaskId)}`),

  /**
   * Create (legacy) or update a task by external id; server validates `homeProgramSelection`.
   * Maps `lastSyncedServerRevision` → `lastKnownServerRevision` for optimistic locking.
   * @param {object} task
   * @param {{ force?: boolean }} [opts]
   */
  upsertHomeProgramTask: (task, opts = {}) => {
    const q = new URLSearchParams();
    if (opts.force) q.set('force', 'true');
    const qs = q.toString();
    const body = prepareHomeProgramTaskRequestBody(task, { forCreate: false });
    return apiFetch(`/api/v1/home-program-tasks/${encodeURIComponent(task.id)}${qs ? '?' + qs : ''}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  },

  /**
   * Internal: mutation fetch that also captures relevant transport headers.
   * @param {string} path
   * @param {object} opts
   */
  _homeProgramTaskMutationFetch: (path, opts) =>
    apiFetch(path, { ...opts, _transportExtractor: extractHomeProgramTaskTransport }),
  deleteHomeProgramTask: (taskId) =>
    apiFetch(`/api/v1/home-program-tasks/${encodeURIComponent(taskId)}`, { method: 'DELETE' }),
  /** Record client-side conflict resolution (take server) or successful retry (for audit trail). */
  postHomeProgramAuditAction: (body) =>
    apiFetch('/api/v1/home-program-tasks/audit-actions', { method: 'POST', body: JSON.stringify(body) }),
  /**
   * Back-compat alias: full task upsert (keeps prior provenance server-side when the client omits it).
   */
  syncHomeProgramTaskProvenance: (task) => {
    const run =
      !task.serverTaskId && typeof api.createHomeProgramTask === 'function'
        ? () => api.createHomeProgramTask(task)
        : () => api.upsertHomeProgramTask(task);
    return run().catch(() => null);
  },

  // ── Adverse events ────────────────────────────────────────────────────────
  reportAdverseEvent: (data) =>
    apiFetch('/api/v1/adverse-events', { method: 'POST', body: JSON.stringify(data) }),
  listAdverseEvents: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetchWithRetry(`/api/v1/adverse-events${q ? '?' + q : ''}`);
  },
  // Launch-audit 2026-04-30: detail view, summary roll-up, classification
  // override, clinician review/sign-off, escalation, exports.
  getAdverseEvent: (id) => apiFetchWithRetry(`/api/v1/adverse-events/${encodeURIComponent(id)}`),
  getAdverseEventsSummary: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetchWithRetry(`/api/v1/adverse-events/summary${q ? '?' + q : ''}`);
  },
  patchAdverseEvent: (id, data = {}) =>
    apiFetch(`/api/v1/adverse-events/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  reviewAdverseEvent: (id, data = {}) =>
    apiFetch(`/api/v1/adverse-events/${encodeURIComponent(id)}/review`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  escalateAdverseEvent: (id, data = {}) =>
    apiFetch(`/api/v1/adverse-events/${encodeURIComponent(id)}/escalate`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  resolveAdverseEvent: (id, data = {}) =>
    apiFetch(`/api/v1/adverse-events/${id}/resolve`, { method: 'PATCH', body: JSON.stringify(data) }),
  // Returns a `{ blob, contentType, filename }` triple via apiFetchBinary so
  // the UI can save / preview the filtered CSV without parsing it twice.
  exportAdverseEventsCsv: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetchBinary(`/api/v1/adverse-events/export.csv${q ? '?' + q : ''}`);
  },
  // Launch-audit 2026-05-01: NDJSON export (regulator-friendly,
  // one-record-per-line). DEMO-marked when any row is demo.
  exportAdverseEventsNdjson: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetchBinary(`/api/v1/adverse-events/export.ndjson${q ? '?' + q : ''}`);
  },
  // Aggregated AE Hub detail (drill-in aware). Surfaces source_target_type/id
  // so the filter banner can render server-side validation feedback.
  getAdverseEventsHubDetail: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetchWithRetry(`/api/v1/adverse-events/detail${q ? '?' + q : ''}`);
  },
  // Page-level audit ingestion (target_type=adverse_events_hub).
  logAdverseEventsAudit: (event) => {
    try {
      const body = JSON.stringify(event || {});
      return apiFetch('/api/v1/adverse-events/audit-events', {
        method: 'POST',
        body,
      });
    } catch (_) {
      return Promise.resolve(null);
    }
  },
  // Sign-off close (note required) and reopen (reason required). Closed AEs
  // are immutable except via reopen.
  closeAdverseEvent: (id, data = {}) =>
    apiFetch(`/api/v1/adverse-events/${encodeURIComponent(id)}/close`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  reopenAdverseEvent: (id, data = {}) =>
    apiFetch(`/api/v1/adverse-events/${encodeURIComponent(id)}/reopen`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  // CIOMS endpoint returns honest JSON until a regulator template is wired
  // up — see the router for the contract. Returned as a Blob so the UI can
  // surface the {configured:false, ...} payload via the same download path.
  exportAdverseEventCioms: (id) =>
    apiFetchBinary(`/api/v1/adverse-events/${encodeURIComponent(id)}/export.cioms`),

  // ── Population Analytics (launch-audit 2026-05-01) ─────────────────────
  // All numbers traced to real SQL aggregates over patients /
  // treatment_courses / outcome_series / adverse_events. No AI fabrication;
  // PHI is not exposed in cohort previews. See router docstring for the
  // exact aggregate SQL.
  getPopulationCohortSummary: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetchWithRetry(`/api/v1/population-analytics/cohorts/summary${q ? '?' + q : ''}`);
  },
  getPopulationCohortList: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetchWithRetry(`/api/v1/population-analytics/cohorts/list${q ? '?' + q : ''}`);
  },
  getPopulationOutcomeTrend: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetchWithRetry(`/api/v1/population-analytics/outcomes/trend${q ? '?' + q : ''}`);
  },
  getPopulationAEIncidence: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetchWithRetry(`/api/v1/population-analytics/adverse-events/incidence${q ? '?' + q : ''}`);
  },
  getPopulationTreatmentResponse: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetchWithRetry(`/api/v1/population-analytics/treatment-response${q ? '?' + q : ''}`);
  },
  exportPopulationCsv: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetchBinary(`/api/v1/population-analytics/export.csv${q ? '?' + q : ''}`);
  },
  exportPopulationNdjson: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetchBinary(`/api/v1/population-analytics/export.ndjson${q ? '?' + q : ''}`);
  },
  logPopulationAnalyticsAudit: (event) => {
    try {
      const body = JSON.stringify(event || {});
      return apiFetch('/api/v1/population-analytics/audit-events', {
        method: 'POST',
        body,
      });
    } catch (_) {
      return Promise.resolve(null);
    }
  },

  // ── Review queue ─────────────────────────────────────────────────────────
  listReviewQueue: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetchWithRetry(`/api/v1/review-queue${q ? '?' + q : ''}`);
  },
  assignReviewer: (itemId, assignedTo) =>
    apiFetch(`/api/v1/review-queue/${itemId}/assign`, {
      method: 'PATCH',
      body: JSON.stringify({ assigned_to: assignedTo || null }),
    }),

  // ── Media queue ───────────────────────────────────────────────────────────
  listMediaQueue: () => apiFetchWithRetry('/api/v1/media/review-queue'),
  reviewMediaUpload: (uploadId, action, reason = null) =>
    apiFetch(`/api/v1/media/review/${encodeURIComponent(uploadId)}/action`, {
      method: 'POST',
      body: JSON.stringify({ action, reason }),
    }),

  // ── Patient media uploads ─────────────────────────────────────────────────
  patientUploadAudio: (formData) =>
    apiFetch('/api/v1/media/patient/upload/audio', { method: 'POST', body: formData }),
  patientUploadVideo: (formData) =>
    apiFetch('/api/v1/media/patient/upload/video', { method: 'POST', body: formData }),
  patientListUploads: () => apiFetch('/api/v1/media/patient/uploads'),
  patientGetUpload: (uploadId) => apiFetch(`/api/v1/media/patient/uploads/${encodeURIComponent(uploadId)}`),
  recordMediaConsent: (data) =>
    apiFetch('/api/v1/media/consent', { method: 'POST', body: JSON.stringify(data) }),
  getMediaConsents: (patientId) => apiFetch(`/api/v1/media/consent/${encodeURIComponent(patientId)}`),

  // ── Clinician notes ───────────────────────────────────────────────────────
  createClinicianNote: (data) =>
    apiFetch('/api/v1/media/clinician/note/text', { method: 'POST', body: JSON.stringify(data) }),
  listClinicianNotes: (patientId) => apiFetch(`/api/v1/media/clinician/notes/${patientId}`),
  getClinicianNote: (noteId) => apiFetch(`/api/v1/media/clinician/note/${encodeURIComponent(noteId)}`),
  approveClinicianDraft: (draftId, data = {}) =>
    apiFetch(`/api/v1/media/clinician/draft/${encodeURIComponent(draftId)}/approve`, { method: 'POST', body: JSON.stringify(data) }),

  // ── Phenotype assignments ─────────────────────────────────────────────────
  assignPhenotype: (data) =>
    apiFetch('/api/v1/phenotype-assignments', { method: 'POST', body: JSON.stringify(data) }),
  listPhenotypeAssignments: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch(`/api/v1/phenotype-assignments${q ? '?' + q : ''}`);
  },
  deletePhenotypeAssignment: (id) =>
    apiFetch(`/api/v1/phenotype-assignments/${id}`, { method: 'DELETE' }),

  // ── Consent records ───────────────────────────────────────────────────────
  createConsent: (data) =>
    apiFetch('/api/v1/consent-records', { method: 'POST', body: JSON.stringify(data) }),
  listConsents: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch(`/api/v1/consent-records${q ? '?' + q : ''}`);
  },
  getConsent: (id) => apiFetch(`/api/v1/consent-records/${id}`),
  updateConsent: (id, data) =>
    apiFetch(`/api/v1/consent-records/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  // ── Outcomes ─────────────────────────────────────────────────────────────
  recordOutcome: (data) =>
    apiFetch('/api/v1/outcomes', { method: 'POST', body: JSON.stringify(data) }),
  listOutcomes: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetchWithRetry(`/api/v1/outcomes${q ? '?' + q : ''}`);
  },
  createOutcomeEvent: (data) =>
    apiFetch('/api/v1/outcomes/events', { method: 'POST', body: JSON.stringify(data) }),
  listOutcomeEvents: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetchWithRetry(`/api/v1/outcomes/events${q ? '?' + q : ''}`);
  },
  courseOutcomeSummary: (courseId) => apiFetch(`/api/v1/outcomes/summary/${courseId}`),
  aggregateOutcomes: () => apiFetchWithRetry('/api/v1/outcomes/aggregate'),

  // ── qEEG Records ─────────────────────────────────────────────────────────
  createQEEGRecord: (data) =>
    apiFetch('/api/v1/qeeg-records', { method: 'POST', body: JSON.stringify(data) }),
  listQEEGRecords: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch(`/api/v1/qeeg-records${q ? '?' + q : ''}`);
  },
  getQEEGRecord: (id) => apiFetch(`/api/v1/qeeg-records/${id}`),
  updateQEEGRecord: (id, data) =>
    apiFetch(`/api/v1/qeeg-records/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  // ── qEEG Analysis Pipeline ──────────────────────────────────────────────
  uploadQEEGAnalysis: (formData) =>
    apiFetch('/api/v1/qeeg-analysis/upload', { method: 'POST', body: formData }),
  analyzeQEEG: (analysisId) =>
    apiFetch(`/api/v1/qeeg-analysis/${analysisId}/analyze`, { method: 'POST' }),
  runQEEGMNEPipeline: (analysisId) =>
    apiFetch(`/api/v1/qeeg-analysis/${analysisId}/analyze-mne`, { method: 'POST' }),
  getQEEGAnalysis: (id) =>
    apiFetch(`/api/v1/qeeg-analysis/${id}`),
  getQEEGAnalysisStatus: (id) =>
    apiFetch(`/api/v1/qeeg-analysis/${id}/status`),
  listPatientQEEGAnalyses: (patientId, opts = {}) => {
    const limit = opts.limit ?? 50;
    const offset = opts.offset ?? 0;
    const qs = `?limit=${encodeURIComponent(limit)}&offset=${encodeURIComponent(offset)}`;
    return apiFetch(`/api/v1/qeeg-analysis/patient/${encodeURIComponent(patientId)}${qs}`);
  },
  generateQEEGAIReport: (analysisId, body = {}) =>
    apiFetch(`/api/v1/qeeg-analysis/${analysisId}/ai-report`, { method: 'POST', body: JSON.stringify(body) }),
  listQEEGAnalysisReports: (analysisId) =>
    apiFetch(`/api/v1/qeeg-analysis/${analysisId}/reports`),
  amendQEEGReport: (reportId, body) =>
    apiFetch(`/api/v1/qeeg-analysis/reports/${reportId}`, { method: 'PATCH', body: JSON.stringify(body) }),
  createQEEGComparison: (body) =>
    apiFetch('/api/v1/qeeg-analysis/compare', { method: 'POST', body: JSON.stringify(body) }),
  getQEEGComparison: (id) =>
    apiFetch(`/api/v1/qeeg-analysis/compare/${id}`),
  listAnnotations: ({ patientId, targetType, targetId } = {}) => {
    const params = new URLSearchParams();
    if (patientId) params.set('patient_id', patientId);
    if (targetType) params.set('target_type', targetType);
    if (targetId) params.set('target_id', targetId);
    return apiFetch(`/api/v1/annotations${params.toString() ? `?${params.toString()}` : ''}`);
  },
  createAnnotation: (body) =>
    apiFetch('/api/v1/annotations', { method: 'POST', body: JSON.stringify(body) }),
  deleteAnnotation: (id) =>
    apiFetch(`/api/v1/annotations/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  correlateQEEGWithAssessments: (analysisId) =>
    apiFetch(`/api/v1/qeeg-analysis/${analysisId}/correlate`, { method: 'POST' }),
  runAdvancedQEEGAnalyses: (analysisId) =>
    apiFetch(`/api/v1/qeeg-analysis/${analysisId}/run-advanced`, { method: 'POST' }),
  runQEEGQualityCheck: (analysisId) =>
    apiFetch(`/api/v1/qeeg-analysis/${analysisId}/quality-check`, { method: 'POST' }),
  getQEEGPrintableReport: (analysisId, reportId) =>
    apiFetchBinary(`/api/v1/qeeg-analysis/${encodeURIComponent(analysisId)}/reports/${encodeURIComponent(reportId)}/pdf`),
  // qEEG Brain Map report — server-rendered HTML/PDF from the saved
  // QEEGAIReport's brain_map payload. The backend resolves the payload via
  // _resolve_qeeg_brain_map_payload (report_payload column with legacy
  // fallback to patient_facing_report_json).
  getQEEGBrainMapReportHTML: (reportId) =>
    apiFetchBinary(`/api/v1/reports/qeeg/${encodeURIComponent(reportId)}.html`),
  getQEEGBrainMapReportPDF: (reportId) =>
    apiFetchBinary(`/api/v1/reports/qeeg/${encodeURIComponent(reportId)}.pdf`),
  // Returns the public URL for the HTML brain map report so we can open it
  // in a new tab without going through the binary helper.
  getQEEGBrainMapReportURL: (reportId, format = 'html') => {
    const ext = format === 'pdf' ? 'pdf' : 'html';
    return `${API_BASE}/api/v1/reports/qeeg/${encodeURIComponent(reportId)}.${ext}`;
  },
  getQEEGLongitudinalTrend: (patientId, metric) =>
    apiFetch('/api/v1/qeeg-analysis/longitudinal', { method: 'POST', body: JSON.stringify({ patient_id: patientId, metric }) }),
  getQEEGAssessmentCorrelation: (analysisId, assessments) =>
    apiFetch(`/api/v1/qeeg-analysis/${analysisId}/assessment-correlation`, { method: 'POST', body: JSON.stringify({ assessments }) }),

  // ── qEEG AI Upgrades (CONTRACT_V2 §4) ────────────────────────────────────
  // All endpoints are optional — each returns the updated analysis payload
  // on success. Consumers should re-fetch the analysis afterwards to pick up
  // the new field (embedding, brain_age, etc.) the backend stored.
  computeQEEGEmbedding: (analysisId) =>
    apiFetch(`/api/v1/qeeg-analysis/${analysisId}/compute-embedding`, { method: 'POST' }),
  predictQEEGBrainAge: (analysisId, opts = {}) =>
    apiFetch(`/api/v1/qeeg-analysis/${analysisId}/predict-brain-age`, {
      method: 'POST', body: JSON.stringify(opts || {}),
    }),
  scoreQEEGConditions: (analysisId) =>
    apiFetch(`/api/v1/qeeg-analysis/${analysisId}/score-conditions`, { method: 'POST' }),
  fitQEEGCentiles: (analysisId) =>
    apiFetch(`/api/v1/qeeg-analysis/${analysisId}/fit-centiles`, { method: 'POST' }),
  explainQEEGRiskScores: (analysisId) =>
    apiFetch(`/api/v1/qeeg-analysis/${analysisId}/explain`, { method: 'POST' }),
  fetchQEEGSimilarCases: (analysisId, k = 10) => {
    const q = k != null ? `?k=${encodeURIComponent(k)}` : '';
    return apiFetch(`/api/v1/qeeg-analysis/${analysisId}/similar-cases${q}`);
  },
  recommendQEEGProtocol: (analysisId) =>
    apiFetch(`/api/v1/qeeg-analysis/${analysisId}/recommend-protocol`, { method: 'POST' }),
  fetchQEEGPatientTrajectory: (patientId) =>
    apiFetch(`/api/v1/qeeg-analysis/patients/${patientId}/trajectory`),

  // ── qEEG Clinical Intelligence Workbench (Migration 048) ─────────────────
  getQEEGSafetyCockpit: (analysisId) =>
    apiFetch(`/api/v1/qeeg-analysis/${analysisId}/safety-cockpit`),
  getQEEGRedFlags: (analysisId) =>
    apiFetch(`/api/v1/qeeg-analysis/${analysisId}/red-flags`),
  getQEEGNormativeModelCard: (analysisId) =>
    apiFetch(`/api/v1/qeeg-analysis/${analysisId}/normative-model-card`),
  computeQEEGProtocolFit: (analysisId) =>
    apiFetch(`/api/v1/qeeg-analysis/${analysisId}/protocol-fit`, { method: 'POST' }),
  getQEEGProtocolFit: (analysisId) =>
    apiFetch(`/api/v1/qeeg-analysis/${analysisId}/protocol-fit`),
  transitionQEEGReportState: (reportId, body) =>
    apiFetch(`/api/v1/qeeg-analysis/reports/${reportId}/transition`, { method: 'POST', body: JSON.stringify(body) }),
  updateQEEGReportFinding: (reportId, findingId, body) =>
    apiFetch(`/api/v1/qeeg-analysis/reports/${reportId}/findings/${findingId}`, { method: 'POST', body: JSON.stringify(body) }),
  signQEEGReport: (reportId) =>
    apiFetch(`/api/v1/qeeg-analysis/reports/${reportId}/sign`, { method: 'POST' }),
  getQEEGPatientFacingReport: (reportId) =>
    apiFetch(`/api/v1/qeeg-analysis/reports/${reportId}/patient-facing`),
  getQEEGPatientTimeline: (patientId) =>
    apiFetch(`/api/v1/qeeg-analysis/patient/${patientId}/timeline`),
  exportQEEGBidsPackage: (analysisId) =>
    apiFetchBinary(`/api/v1/qeeg-analysis/${analysisId}/export-bids`),
  // Real CSV download for a single analysis (band powers + z-scores).
  // Returns { csv, rows, generated_at, analysis_id, demo }.
  exportQEEGAnalysisCSV: (analysisId) =>
    apiFetch(`/api/v1/qeeg-analysis/${encodeURIComponent(analysisId)}/export-csv`),

  // ── Audit log ingestion (qEEG Analyzer launch-audit 2026-04-30) ─────────
  // Best-effort, fire-and-forget. Promise resolves to a recorded event_id
  // (or null on rejection). Audit-trail outages must not break the UI, so
  // the caller does not need to await it.
  logAudit: (event) => {
    try {
      const body = JSON.stringify(event || {});
      return apiFetch('/api/v1/qeeg-analysis/audit-events', {
        method: 'POST',
        body,
      });
    } catch (_) {
      return Promise.resolve(null);
    }
  },

  // ── MRI Analyzer (packages/mri-pipeline; see portal_integration/api_contract.md)
  // Multipart upload (.zip DICOM or .nii.gz NIfTI). FormData must include
  //   file: File, patient_id: string
  uploadMRISession: (formData) =>
    apiFetch('/api/v1/mri/upload', { method: 'POST', body: formData }),
  // Start a background analysis. `opts` keys map to the form fields in
  // api_contract.md §2: upload_id, patient_id, condition, age, sex, run_mode.
  startMRIAnalysis: (opts = {}) => {
    const fd = new FormData();
    Object.keys(opts).forEach((k) => {
      const v = opts[k];
      if (v !== undefined && v !== null && v !== '') fd.append(k, String(v));
    });
    return apiFetch('/api/v1/mri/analyze', { method: 'POST', body: fd });
  },
  getMRIStatus: (jobId) =>
    apiFetch(`/api/v1/mri/status/${encodeURIComponent(jobId)}`),
  getMRIReport: (analysisId) =>
    apiFetch(`/api/v1/mri/report/${encodeURIComponent(analysisId)}`),
  getMRIReportPdf: (analysisId) =>
    apiFetchBinary(`/api/v1/mri/report/${encodeURIComponent(analysisId)}/pdf`),
  getMRIReportHtml: (analysisId) =>
    apiFetchBinary(`/api/v1/mri/report/${encodeURIComponent(analysisId)}/html`),
  getMRIViewerPayload: (analysisId) =>
    apiFetch(`/api/v1/mri/${encodeURIComponent(analysisId)}/viewer.json`),
  getMRIOverlayHtml: (analysisId, targetId) =>
    apiFetchBinary(`/api/v1/mri/overlay/${encodeURIComponent(analysisId)}/${encodeURIComponent(targetId)}`),
  getMRIMedRAG: (analysisId, topK = 20) =>
    apiFetch(`/api/v1/mri/medrag/${encodeURIComponent(analysisId)}?top_k=${encodeURIComponent(topK)}`),
  // Longitudinal compare — AI_UPGRADES P0 #4. Returns a LongitudinalReport:
  // { baseline_analysis_id, followup_analysis_id, days_between,
  //   structural_changes[], functional_changes[], diffusion_changes[],
  //   jacobian_determinant_s3, change_overlay_png_s3, summary }.
  compareMRI: (baselineId, followupId) =>
    apiFetch(`/api/v1/mri/compare/${encodeURIComponent(baselineId)}/${encodeURIComponent(followupId)}`),
  // Lists completed MRI analyses for a patient — used by the Compare modal
  // to let clinicians pick baseline / follow-up rows. Optional helper; the
  // frontend falls back gracefully when the endpoint is absent.
  listPatientMRIAnalyses: (patientId) =>
    apiFetch(`/api/v1/mri/patients/${encodeURIComponent(patientId)}/analyses`),
  getFusionRecommendation: (patientId) =>
    apiFetch(`/api/v1/fusion/recommend/${encodeURIComponent(patientId)}`, { method: 'POST' }),
  // Fusion Workbench (Migration 054)
  createFusionCase: (patientId, opts = {}) =>
    apiFetch('/api/v1/fusion/cases', { method: 'POST', body: JSON.stringify({ patient_id: patientId, ...opts }) }),
  listFusionCases: (patientId) =>
    apiFetch(`/api/v1/fusion/cases?patient_id=${encodeURIComponent(patientId)}`),
  getFusionCase: (caseId) =>
    apiFetch(`/api/v1/fusion/cases/${encodeURIComponent(caseId)}`),
  transitionFusionCase: (caseId, action, note, amendments) =>
    apiFetch(`/api/v1/fusion/cases/${encodeURIComponent(caseId)}/transition`, { method: 'POST', body: JSON.stringify({ action, note, amendments }) }),
  getFusionAgreement: (caseId) =>
    apiFetch(`/api/v1/fusion/cases/${encodeURIComponent(caseId)}/agreement`),
  getFusionProtocolFusion: (caseId) =>
    apiFetch(`/api/v1/fusion/cases/${encodeURIComponent(caseId)}/protocol-fusion`),
  getFusionPatientReport: (caseId) =>
    apiFetch(`/api/v1/fusion/cases/${encodeURIComponent(caseId)}/patient-report`),
  getFusionAudit: (caseId) =>
    apiFetch(`/api/v1/fusion/cases/${encodeURIComponent(caseId)}/audit`),
  exportFusionCase: (caseId) =>
    apiFetch(`/api/v1/fusion/cases/${encodeURIComponent(caseId)}/export`, { method: 'POST' }),
  getMRIPatientTimeline: (patientId) =>
    apiFetch(`/api/v1/mri/patients/${encodeURIComponent(patientId)}/timeline`),
  exportFHIRBundle: (data) =>
    apiFetchBlob('/api/v1/export/fhir-r4-bundle', data),
  exportBIDSDerivatives: (data) =>
    apiFetchBlob('/api/v1/export/bids-derivatives', data),

  // ── Patient Portal (self-service for patient-role users) ─────────────────
  patientPortalMe: () => apiFetch('/api/v1/patient-portal/me'),
  patientPortalCourses: () => apiFetch('/api/v1/patient-portal/courses'),
  patientPortalSessions: () => apiFetch('/api/v1/patient-portal/sessions'),
  patientPortalAssessments: () => apiFetch('/api/v1/patient-portal/assessments'),
  patientPortalOutcomes: () => apiFetch('/api/v1/patient-portal/outcomes'),
  patientPortalSummary: () => apiFetch('/api/v1/patient-portal/summary'),
  patientPortalReports: () => apiFetch('/api/v1/patient-portal/reports'),
  patientPortalMessages: () => apiFetch('/api/v1/patient-portal/messages'),
  patientPortalSendMessage: (data) =>
    apiFetch('/api/v1/patient-portal/messages', { method: 'POST', body: JSON.stringify(data) }),
  // Alias used by the Messages page polish (Tier B call-request + composer).
  // Spec asks for `api.sendPortalMessage`; keep both names wired so older
  // call sites don't break.
  sendPortalMessage: (data) =>
    apiFetch('/api/v1/patient-portal/messages', { method: 'POST', body: JSON.stringify(data) }),
  patientPortalMarkMessageRead: (messageId) =>
    apiFetch(`/api/v1/patient-portal/messages/${encodeURIComponent(messageId)}/read`, { method: 'PATCH' }),
  submitSelfAssessment: (data) =>
    apiFetch('/api/v1/patient-portal/self-assessments', { method: 'POST', body: JSON.stringify(data) }),

  // ── Wearable monitoring ───────────────────────────────────────────────────
  patientPortalWearables: () => apiFetch('/api/v1/patient-portal/wearables'),
  patientPortalWearableSummary: (days = 7) => apiFetch(`/api/v1/patient-portal/wearable-summary?days=${days}`),
  connectWearableSource: (data) => apiFetch('/api/v1/patient-portal/wearable-connect', { method: 'POST', body: JSON.stringify(data) }),
  disconnectWearableSource: (connectionId) => apiFetch(`/api/v1/patient-portal/wearable-connect/${connectionId}`, { method: 'DELETE' }),
  submitWearableObservations: (data) => apiFetch('/api/v1/patient-portal/wearable-sync', { method: 'POST', body: JSON.stringify(data) }),
  getPatientWearableSummary: (patientId, days = 30) => apiFetchWithRetry(`/api/v1/wearables/patients/${patientId}/summary?days=${days}`),
  getPatientAlertFlags: (patientId) => apiFetchWithRetry(`/api/v1/wearables/patients/${patientId}/alerts`),
  dismissAlertFlag: (flagId) => apiFetch(`/api/v1/wearables/alerts/${flagId}/dismiss`, { method: 'POST' }),
  getClinicAlertSummary: () => apiFetchWithRetry('/api/v1/wearables/clinic/alerts/summary'),
  monitorLiveSnapshot: () => apiFetchWithRetry('/api/v1/monitor/live'),
  monitorDataQualityIssues: () => apiFetchWithRetry('/api/v1/monitor/dq'),
  monitorIntegrations: () => apiFetchWithRetry('/api/v1/monitor/integrations'),
  monitorFleet: () => apiFetchWithRetry('/api/v1/monitor/fleet'),
  monitorConnectIntegration: (connectorId, data = {}) =>
    apiFetch(`/api/v1/monitor/integrations/${encodeURIComponent(connectorId)}/connect`, { method: 'POST', body: JSON.stringify(data) }),
  monitorSyncIntegration: (integrationId) =>
    apiFetch(`/api/v1/monitor/integrations/${encodeURIComponent(integrationId)}/sync`, { method: 'POST' }),
  monitorDisconnectIntegration: (integrationId) =>
    apiFetch(`/api/v1/monitor/integrations/${encodeURIComponent(integrationId)}/disconnect`, { method: 'POST' }),
  monitorResolveDataQualityIssue: (issueId, data = {}) =>
    apiFetch(`/api/v1/monitor/dq/${encodeURIComponent(issueId)}/resolve`, { method: 'POST', body: JSON.stringify(data) }),
  monitorLiveStreamUrl: () => {
    const token = getToken();
    const wsBase = API_BASE.replace(/^http/i, 'ws');
    const url = new URL(`${wsBase}/api/v1/monitor/live/stream`);
    if (token) url.searchParams.set('token', token);
    return url.toString();
  },
  wearableCopilotPatient: (messages, wearable_context) => apiFetch('/api/v1/chat/wearable-patient', { method: 'POST', body: JSON.stringify({ messages, patient_context: wearable_context }) }),
  wearableCopilotClinician: (patientId, messages) => apiFetch('/api/v1/chat/wearable-clinician', { method: 'POST', body: JSON.stringify({ patient_id: patientId, messages }) }),

  // ── Home Device (clinician-facing) ───────────────────────────────────────
  listHomeDeviceSources: () => apiFetch('/api/v1/home-devices/source-registry'),
  assignHomeDevice: (data) =>
    apiFetch('/api/v1/home-devices/assign', { method: 'POST', body: JSON.stringify(data) }),
  listHomeAssignments: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch(`/api/v1/home-devices/assignments${q ? '?' + q : ''}`);
  },
  getHomeAssignment: (id) => apiFetch(`/api/v1/home-devices/assignments/${id}`),
  updateHomeAssignment: (id, data) =>
    apiFetch(`/api/v1/home-devices/assignments/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  listHomeSessionLogs: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch(`/api/v1/home-devices/session-logs${q ? '?' + q : ''}`);
  },
  reviewHomeSessionLog: (id, data) =>
    apiFetch(`/api/v1/home-devices/session-logs/${id}/review`, { method: 'PATCH', body: JSON.stringify(data) }),
  listHomeAdherenceEvents: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch(`/api/v1/home-devices/adherence-events${q ? '?' + q : ''}`);
  },
  acknowledgeAdherenceEvent: (id, data) =>
    apiFetch(`/api/v1/home-devices/adherence-events/${id}/acknowledge`, { method: 'PATCH', body: JSON.stringify(data) }),
  listHomeReviewFlags: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch(`/api/v1/home-devices/review-flags${q ? '?' + q : ''}`);
  },
  dismissHomeReviewFlag: (id, data = {}) =>
    apiFetch(`/api/v1/home-devices/review-flags/${id}/dismiss`, { method: 'PATCH', body: JSON.stringify(data) }),
  generateHomeTherapySummary: (assignmentId) =>
    apiFetch(`/api/v1/home-devices/ai-summary/${assignmentId}`, { method: 'POST' }),

  // ── Home Device (patient portal) ──────────────────────────────────────────
  portalGetHomeDevice: () => apiFetch('/api/v1/patient-portal/home-device'),
  portalListHomeSessions: () => apiFetch('/api/v1/patient-portal/home-sessions'),
  portalLogHomeSession: (data) =>
    apiFetch('/api/v1/patient-portal/home-sessions', { method: 'POST', body: JSON.stringify(data) }),
  portalListAdherenceEvents: () => apiFetch('/api/v1/patient-portal/adherence-events'),
  portalSubmitAdherenceEvent: (data) =>
    apiFetch('/api/v1/patient-portal/adherence-events', { method: 'POST', body: JSON.stringify(data) }),
  portalRequestHomeDevice: (data) =>
    apiFetch('/api/v1/patient-portal/home-device-request', { method: 'POST', body: JSON.stringify(data) }),
  portalHomeAdherenceSummary: () => apiFetch('/api/v1/patient-portal/home-adherence-summary'),

  // ── Patient Home Devices launch-audit (2026-05-01) ───────────────────────
  // Patient-side device registry, separate from the clinician-side
  // /home-devices/assignments. Each helper returns null on offline / 404
  // so the page can fall back to a localStorage cache without crashing.
  homeDevicesList: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch(`/api/v1/home-devices/devices${q ? '?' + q : ''}`).catch(() => null);
  },
  homeDevicesSummary: () => apiFetch('/api/v1/home-devices/devices/summary').catch(() => null),
  homeDevicesGet: (id) => apiFetch(`/api/v1/home-devices/devices/${encodeURIComponent(id)}`).catch(() => null),
  homeDevicesRegister: (data) =>
    apiFetch('/api/v1/home-devices/devices', { method: 'POST', body: JSON.stringify(data || {}) }),
  homeDevicesUpdate: (id, data) =>
    apiFetch(`/api/v1/home-devices/devices/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(data || {}),
    }),
  homeDevicesDecommission: (id, reason) =>
    apiFetch(`/api/v1/home-devices/devices/${encodeURIComponent(id)}/decommission`, {
      method: 'POST',
      body: JSON.stringify({ reason: reason || '' }),
    }),
  homeDevicesMarkFaulty: (id, reason) =>
    apiFetch(`/api/v1/home-devices/devices/${encodeURIComponent(id)}/mark-faulty`, {
      method: 'POST',
      body: JSON.stringify({ reason: reason || '' }),
    }),
  homeDevicesCalibrate: (id, data) =>
    apiFetch(`/api/v1/home-devices/devices/${encodeURIComponent(id)}/calibrate`, {
      method: 'POST',
      body: JSON.stringify(data || { result: 'passed' }),
    }),
  homeDevicesLogSession: (id, data) =>
    apiFetch(`/api/v1/home-devices/devices/${encodeURIComponent(id)}/sessions`, {
      method: 'POST',
      body: JSON.stringify(data || {}),
    }),
  postHomeDevicesAuditEvent: (data) =>
    apiFetch('/api/v1/home-devices/audit-events', {
      method: 'POST',
      body: JSON.stringify(data || {}),
    }).catch(() => null),

  // ── Patient Adherence Events launch-audit (2026-05-01) ───────────────────
  // Sixth patient-facing launch-audit surface. Closes the home-therapy
  // patient-side regulatory chain (register → log session → adherence
  // event → side-effect → escalate to AE Hub draft). All helpers return
  // null on offline / 404 so the page can render an honest empty state.
  adherenceEventsList: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch(`/api/v1/adherence/events${q ? '?' + q : ''}`).catch(() => null);
  },
  adherenceEventsSummary: () => apiFetch('/api/v1/adherence/summary').catch(() => null),
  adherenceEventGet: (id) =>
    apiFetch(`/api/v1/adherence/events/${encodeURIComponent(id)}`).catch(() => null),
  adherenceEventLog: (data) =>
    apiFetch('/api/v1/adherence/events', { method: 'POST', body: JSON.stringify(data || {}) }),
  adherenceEventSideEffect: (id, data) =>
    apiFetch(`/api/v1/adherence/events/${encodeURIComponent(id)}/side-effect`, {
      method: 'POST',
      body: JSON.stringify(data || {}),
    }),
  adherenceEventEscalate: (id, reason) =>
    apiFetch(`/api/v1/adherence/events/${encodeURIComponent(id)}/escalate`, {
      method: 'POST',
      body: JSON.stringify({ reason: reason || '' }),
    }),
  postAdherenceAuditEvent: (data) =>
    apiFetch('/api/v1/adherence/audit-events', {
      method: 'POST',
      body: JSON.stringify(data || {}),
    }).catch(() => null),

  // ── Home Program Tasks (Homework) — patient launch-audit surface (2026-05-01)
  // Seventh patient-facing launch-audit surface. Closes the home-therapy
  // regulator loop end-to-end: clinician assigns home-program tasks →
  // patient SEES tasks here → patient LOGS completion via Adherence
  // Events (#350) → side-effect with severity >= 7 escalates to the AE
  // Hub (#342) → safety review in QA Hub (#321). All helpers return
  // null on offline / 404 so the page can render an honest empty state.
  homeProgramTasksToday: () =>
    apiFetch('/api/v1/home-program-tasks/patient/today').catch(() => null),
  homeProgramTasksUpcoming: (days = 7) =>
    apiFetch(`/api/v1/home-program-tasks/patient/upcoming?days=${encodeURIComponent(days)}`).catch(() => null),
  homeProgramTasksCompleted: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch(`/api/v1/home-program-tasks/patient/completed${q ? '?' + q : ''}`).catch(() => null);
  },
  homeProgramTasksSummary: () =>
    apiFetch('/api/v1/home-program-tasks/patient/summary').catch(() => null),
  homeProgramTasksGet: (taskId) =>
    apiFetch(`/api/v1/home-program-tasks/patient/${encodeURIComponent(taskId)}`).catch(() => null),
  homeProgramTaskStart: (taskId, data) =>
    apiFetch(`/api/v1/home-program-tasks/patient/${encodeURIComponent(taskId)}/start`, {
      method: 'POST',
      body: JSON.stringify(data || {}),
    }),
  homeProgramTaskHelpRequest: (taskId, data) =>
    apiFetch(`/api/v1/home-program-tasks/patient/${encodeURIComponent(taskId)}/help-request`, {
      method: 'POST',
      body: JSON.stringify(data || {}),
    }),
  postHomeProgramTaskAuditEvent: (data) =>
    apiFetch('/api/v1/home-program-tasks/patient/audit-events', {
      method: 'POST',
      body: JSON.stringify(data || {}),
    }).catch(() => null),

  // ── Patient Wearables launch-audit (2026-05-01) ──────────────────────────
  // EIGHTH and final patient-facing launch-audit surface. Adds the audit
  // chain, consent-revoked write gate, IDOR regression and DEMO honesty
  // layer on top of the existing /patient-portal/wearable-* connect / sync
  // helpers. All helpers return null on offline / 404 so the page can
  // render an honest empty state.
  patientWearablesDevices: () =>
    apiFetch('/api/v1/patient-wearables/devices').catch(() => null),
  patientWearablesSummary: () =>
    apiFetch('/api/v1/patient-wearables/devices/summary').catch(() => null),
  patientWearablesGet: (deviceId) =>
    apiFetch(`/api/v1/patient-wearables/devices/${encodeURIComponent(deviceId)}`).catch(() => null),
  patientWearablesObservations: (deviceId, params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch(
      `/api/v1/patient-wearables/devices/${encodeURIComponent(deviceId)}/observations${q ? '?' + q : ''}`,
    ).catch(() => null);
  },
  patientWearablesSync: (deviceId, data) =>
    apiFetch(`/api/v1/patient-wearables/devices/${encodeURIComponent(deviceId)}/sync`, {
      method: 'POST',
      body: JSON.stringify(data || {}),
    }),
  patientWearablesDisconnect: (deviceId, note) =>
    apiFetch(`/api/v1/patient-wearables/devices/${encodeURIComponent(deviceId)}/disconnect`, {
      method: 'POST',
      body: JSON.stringify({ note: note || '' }),
    }),
  postPatientWearablesAuditEvent: (data) =>
    apiFetch('/api/v1/patient-wearables/audit-events', {
      method: 'POST',
      body: JSON.stringify(data || {}),
    }).catch(() => null),

  // ── Wearables Workbench (clinician triage queue) ──────────────────────────
  // Bidirectional counterpart to Patient Wearables (#352). Surfaces the
  // server-side triage queue over wearable_alert_flags so clinicians can
  // acknowledge / escalate / resolve flags with full audit + AE-draft
  // creation on escalate. Cross-clinic blocked at the router; admins see
  // all clinics. All helpers return null on offline / 404 so the page
  // can render an honest empty state.
  wearablesWorkbenchListFlags: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch(`/api/v1/wearables/workbench/flags${q ? '?' + q : ''}`).catch(() => null);
  },
  wearablesWorkbenchSummary: () =>
    apiFetch('/api/v1/wearables/workbench/flags/summary').catch(() => null),
  wearablesWorkbenchGetFlag: (flagId) =>
    apiFetch(`/api/v1/wearables/workbench/flags/${encodeURIComponent(flagId)}`).catch(() => null),
  wearablesWorkbenchAcknowledge: (flagId, note) =>
    apiFetch(`/api/v1/wearables/workbench/flags/${encodeURIComponent(flagId)}/acknowledge`, {
      method: 'POST',
      body: JSON.stringify({ note: note || '' }),
    }),
  wearablesWorkbenchEscalate: (flagId, note, bodySystem) =>
    apiFetch(`/api/v1/wearables/workbench/flags/${encodeURIComponent(flagId)}/escalate`, {
      method: 'POST',
      body: JSON.stringify({ note: note || '', body_system: bodySystem || null }),
    }),
  wearablesWorkbenchResolve: (flagId, note) =>
    apiFetch(`/api/v1/wearables/workbench/flags/${encodeURIComponent(flagId)}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ note: note || '' }),
    }),
  wearablesWorkbenchExportCsvUrl: () =>
    `${API_BASE}/api/v1/wearables/workbench/flags/export.csv`,
  wearablesWorkbenchExportNdjsonUrl: () =>
    `${API_BASE}/api/v1/wearables/workbench/flags/export.ndjson`,
  postWearablesWorkbenchAuditEvent: (data) =>
    apiFetch('/api/v1/wearables/workbench/audit-events', {
      method: 'POST',
      body: JSON.stringify(data || {}),
    }).catch(() => null),

  // ── Home Program Tasks (patient portal — legacy completion submit) ────────
  portalListHomeProgramTasks: () => apiFetch('/api/v1/patient-portal/home-program-tasks'),
  portalCompleteHomeProgramTask: (serverTaskId, data) =>
    apiFetch(`/api/v1/patient-portal/home-program-tasks/${encodeURIComponent(serverTaskId)}/complete`, { method: 'POST', body: JSON.stringify(data || {}) }),
  portalGetHomeProgramTaskCompletion: (serverTaskId) =>
    apiFetch(`/api/v1/patient-portal/home-program-tasks/${encodeURIComponent(serverTaskId)}/completion`),

  // ── Wellness logs ─────────────────────────────────────────────────────────
  patientPortalWellnessLogs: (days = 30) => apiFetch(`/api/v1/patient-portal/wellness-logs?days=${days}`),
  patientPortalSubmitWellnessLog: (data) =>
    apiFetch('/api/v1/patient-portal/wellness-logs', { method: 'POST', body: JSON.stringify(data) }),

  // ── Dashboard aggregation ─────────────────────────────────────────────────
  patientPortalDashboard: () => apiFetch('/api/v1/patient-portal/dashboard'),

  // ── Marketplace ─────────────────────────────────────────────────────────────
  marketplaceItems: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch(`/api/v1/patient-portal/marketplace/items${q ? '?' + q : ''}`);
  },
  marketplaceItem: (id) => apiFetch(`/api/v1/patient-portal/marketplace/items/${encodeURIComponent(id)}`),
  marketplaceCreateOrder: (data) =>
    apiFetch('/api/v1/patient-portal/marketplace/orders', { method: 'POST', body: JSON.stringify(data) }),
  marketplaceMyOrders: () => apiFetch('/api/v1/patient-portal/marketplace/my-orders'),

  // ── Marketplace Seller ────────────────────────────────────────────────────
  marketplaceSellerMe: () => apiFetch('/api/v1/marketplace/seller/me'),
  marketplaceSellerCreateItem: (data) =>
    apiFetch('/api/v1/marketplace/seller/items', { method: 'POST', body: JSON.stringify(data) }),
  marketplaceSellerMyItems: () => apiFetch('/api/v1/marketplace/seller/my-items'),
  marketplaceSellerUpdateItem: (id, data) =>
    apiFetch(`/api/v1/marketplace/seller/items/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(data) }),
  marketplaceSellerDeleteItem: (id) =>
    apiFetch(`/api/v1/marketplace/seller/items/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  marketplaceEducationBrowse: (params = {}) =>
    apiFetch('/api/v1/marketplace/seller/browse?' + new URLSearchParams({ kind: 'education,course', ...params })),

  // ── Virtual Care ──────────────────────────────────────────────────────────
  virtualCareCreateSession: (data) =>
    apiFetch('/api/v1/virtual-care/sessions', { method: 'POST', body: JSON.stringify(data) }),
  virtualCareGetSession: (id) => apiFetch(`/api/v1/virtual-care/sessions/${encodeURIComponent(id)}`),
  virtualCareStartSession: (id) =>
    apiFetch(`/api/v1/virtual-care/sessions/${encodeURIComponent(id)}/start`, { method: 'PATCH' }),
  virtualCareEndSession: (id) =>
    apiFetch(`/api/v1/virtual-care/sessions/${encodeURIComponent(id)}/end`, { method: 'PATCH' }),
  virtualCareSubmitBiometrics: (id, data) =>
    apiFetch(`/api/v1/virtual-care/sessions/${encodeURIComponent(id)}/biometrics`, { method: 'POST', body: JSON.stringify(data) }),
  virtualCareListBiometrics: (id) => apiFetch(`/api/v1/virtual-care/sessions/${encodeURIComponent(id)}/biometrics`),
  virtualCareSubmitVoiceAnalysis: (id, data) =>
    apiFetch(`/api/v1/virtual-care/sessions/${encodeURIComponent(id)}/voice-analysis`, { method: 'POST', body: JSON.stringify(data) }),
  virtualCareListVoiceAnalysis: (id) => apiFetch(`/api/v1/virtual-care/sessions/${encodeURIComponent(id)}/voice-analysis`),
  virtualCareSubmitVideoAnalysis: (id, data) =>
    apiFetch(`/api/v1/virtual-care/sessions/${encodeURIComponent(id)}/video-analysis`, { method: 'POST', body: JSON.stringify(data) }),
  virtualCareListVideoAnalysis: (id) => apiFetch(`/api/v1/virtual-care/sessions/${encodeURIComponent(id)}/video-analysis`),
  virtualCareGetAnalysis: (id) => apiFetch(`/api/v1/virtual-care/sessions/${encodeURIComponent(id)}/analysis`),

  // ── Notifications ─────────────────────────────────────────────────────────
  patientPortalNotifications: () => apiFetch('/api/v1/patient-portal/notifications'),
  patientPortalMarkNotificationRead: (id) =>
    apiFetch(`/api/v1/patient-portal/notifications/${encodeURIComponent(id)}/read`, { method: 'PATCH' }),

  // ── Learn progress ────────────────────────────────────────────────────────
  patientPortalLearnProgress: () => apiFetch('/api/v1/patient-portal/learn-progress'),
  patientPortalMarkLearnRead: (articleId) =>
    apiFetch('/api/v1/patient-portal/learn-progress', { method: 'POST', body: JSON.stringify({ article_id: articleId }) }),

  // ── Forms & Assessments ───────────────────────────────────────────────────
  getForms: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetchWithRetry(`/api/v1/forms${q ? '?' + q : ''}`);
  },
  createForm: (data) => apiFetch('/api/v1/forms', { method: 'POST', body: JSON.stringify(data) }),
  getForm: (id) => apiFetch(`/api/v1/forms/${id}`),
  deployForm: (id, data) => apiFetch(`/api/v1/forms/${id}/deploy`, { method: 'POST', body: JSON.stringify(data) }),
  submitForm: (id, data) => apiFetch(`/api/v1/forms/${id}/submit`, { method: 'POST', body: JSON.stringify(data) }),
  getFormSubmissions: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetchWithRetry(`/api/v1/forms/submissions${q ? '?' + q : ''}`);
  },
  getFormSubmission: (id) => apiFetch(`/api/v1/forms/submissions/${id}`),

  // ── Medication Safety ─────────────────────────────────────────────────────
  getPatientMedications: (patientId, params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetchWithRetry(`/api/v1/medications/patient/${patientId}${q ? '?' + q : ''}`);
  },
  addMedication: (patientId, med) =>
    apiFetch(`/api/v1/medications/patient/${patientId}`, { method: 'POST', body: JSON.stringify(med) }),
  removeMedication: (patientId, medId) =>
    apiFetch(`/api/v1/medications/patient/${patientId}/${medId}`, { method: 'DELETE' }),
  checkInteractions: (medications, patientId = null) =>
    apiFetch('/api/v1/medications/check-interactions', { method: 'POST', body: JSON.stringify({ medications, patient_id: patientId }) }),
  getMedicationInteractionLog: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetchWithRetry(`/api/v1/medications/interaction-log${q ? '?' + q : ''}`);
  },

  // ── Consent Management ────────────────────────────────────────────────────
  getConsentRecords: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetchWithRetry(`/api/v1/consent/records${q ? '?' + q : ''}`);
  },
  listConsentRecords: (params = {}) => api.getConsentRecords(params),
  createConsentRecord: (data) =>
    apiFetch('/api/v1/consent/records', { method: 'POST', body: JSON.stringify(data) }),
  updateConsentRecord: (id, data) =>
    apiFetch(`/api/v1/consent/records/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  getConsentAuditLog: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetchWithRetry(`/api/v1/consent/audit-log${q ? '?' + q : ''}`);
  },
  createConsentAutomationRule: (data) =>
    apiFetch('/api/v1/consent/automation-rules', { method: 'POST', body: JSON.stringify(data) }),
  listConsentAutomationRules: () => apiFetch('/api/v1/consent/automation-rules'),
  computeConsentComplianceScore: (data = {}) =>
    apiFetch('/api/v1/consent/compliance-score', { method: 'POST', body: JSON.stringify(data) }),

  // ── Reminder Campaigns ────────────────────────────────────────────────────
  getReminderCampaigns: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetchWithRetry(`/api/v1/reminders/campaigns${q ? '?' + q : ''}`);
  },
  createReminderCampaign: (data) =>
    apiFetch('/api/v1/reminders/campaigns', { method: 'POST', body: JSON.stringify(data) }),
  updateReminderCampaign: (id, data) =>
    apiFetch(`/api/v1/reminders/campaigns/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  getReminderOutbox: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetchWithRetry(`/api/v1/reminders/outbox${q ? '?' + q : ''}`);
  },
  sendReminderMessage: (data) =>
    apiFetch('/api/v1/reminders/send', { method: 'POST', body: JSON.stringify(data) }),
  sendReminderNow: (data) => api.sendReminderMessage(data),
  getPatientAdherenceScore: (patientId) =>
    apiFetch(`/api/v1/reminders/adherence/${patientId}`),
  getAdherenceScores: () => apiFetchWithRetry('/api/v1/reminders/adherence'),

  // ── IRB Studies ───────────────────────────────────────────────────────────
  getIRBStudies: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetchWithRetry(`/api/v1/irb/studies${q ? '?' + q : ''}`);
  },
  createIRBStudy: (data) =>
    apiFetch('/api/v1/irb/studies', { method: 'POST', body: JSON.stringify(data) }),
  getIRBStudy: (id) => apiFetch(`/api/v1/irb/studies/${id}`),
  updateIRBStudy: (id, data) =>
    apiFetch(`/api/v1/irb/studies/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  requestIRBAmendment: (studyId, data) =>
    apiFetch(`/api/v1/irb/studies/${studyId}/amend`, { method: 'POST', body: JSON.stringify(data) }),
  getIRBAdverseEvents: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetchWithRetry(`/api/v1/irb/adverse-events${q ? '?' + q : ''}`);
  },
  reportIRBAdverseEvent: (data) =>
    apiFetch('/api/v1/irb/adverse-events', { method: 'POST', body: JSON.stringify(data) }),
  updateIRBAdverseEvent: (id, data) =>
    apiFetch(`/api/v1/irb/adverse-events/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  listIrbProtocols: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetchWithRetry(`/api/v1/irb/studies${q ? '?' + q : ''}`);
  },
  createIrbProtocol: (data) =>
    apiFetch('/api/v1/irb/studies', { method: 'POST', body: JSON.stringify(data) }),
  irbAdverseEvents: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetchWithRetry(`/api/v1/irb/adverse-events${q ? '?' + q : ''}`);
  },
  exportData: (data = {}) =>
    apiFetch('/api/v1/evidence/research/exports/dataset', { method: 'POST', body: JSON.stringify(data) }),
  getResearchExportSummary: (params = {}) => {
    const q = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v != null && v !== '')
    ).toString();
    return apiFetch(`/api/v1/evidence/research/exports/summary${q ? '?' + q : ''}`);
  },
  listResearchExportSchedules: () => apiFetch('/api/v1/evidence/research/exports/schedules'),
  exportResearchBundle: () =>
    apiFetch('/api/v1/evidence/research/exports/bundle', { method: 'POST' }),
  exportResearchIndividual: (data = {}) =>
    apiFetch('/api/v1/evidence/research/exports/individual', { method: 'POST', body: JSON.stringify(data) }),
  dataPrivacyExport: () => api.requestDataExport(),

  // ── Literature Library ────────────────────────────────────────────────────
  getLiterature: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetchWithRetry(`/api/v1/literature${q ? '?' + q : ''}`);
  },
  addLiteraturePaper: (data) =>
    apiFetch('/api/v1/literature', { method: 'POST', body: JSON.stringify(data) }),
  getLiteraturePaper: (id) => apiFetch(`/api/v1/literature/${id}`),
  tagPaperToProtocol: (paperId, protocolId) =>
    apiFetch('/api/v1/literature/tag-protocol', { method: 'POST', body: JSON.stringify({ paper_id: paperId, protocol_id: protocolId }) }),
  /** Persist a per-user curation verdict on a PMID surfaced by literature-watch.
   *  @param {string} pmid    PubMed ID (string).
   *  @param {'mark-relevant'|'promote'|'not-relevant'} action
   *  @param {string} [note]  Optional clinician note (≤2000 chars). */
  curateLiteraturePaper: (pmid, action, note) =>
    apiFetch(`/api/v1/literature/papers/${encodeURIComponent(pmid)}/curate`, {
      method: 'POST',
      body: JSON.stringify(note ? { action, note } : { action }),
    }),
  getReadingList: () => apiFetchWithRetry('/api/v1/literature/reading-list'),
  addToReadingList: (paperId, data = {}) =>
    apiFetch(`/api/v1/literature/reading-list/${paperId}`, { method: 'POST', body: JSON.stringify(data) }),
  removeFromReadingList: (paperId) =>
    apiFetch(`/api/v1/literature/reading-list/${paperId}`, { method: 'DELETE' }),

  // ── Telegram ────────────────────────────────────────────────────────────
  /** @param {'patient'|'clinician'} [botKind] — which Telegram bot to link (default clinician for practice settings). */
  telegramLinkCode: (botKind = 'clinician') =>
    apiFetch(`/api/v1/telegram/link-code?bot_kind=${encodeURIComponent(botKind)}`),

  // ── Health ──────────────────────────────────────────────────────────────
  health: () => apiFetch('/health'),
  aiHealth: () => apiFetch('/api/v1/health/ai'),

  // ── Presence (real-time collaboration) ──────────────────────────────────
  pingPresence: (page_id) =>
    apiFetch('/api/v1/notifications/presence', { method: 'POST', body: JSON.stringify({ page_id }) }),
  getPresence: (page_id) =>
    apiFetch(`/api/v1/notifications/presence/${encodeURIComponent(page_id)}`),
  getNotificationsUnreadCount: () =>
    apiFetchWithRetry('/api/v1/notifications/unread-count'),
  notificationsUnreadCount: () =>
    apiFetchWithRetry('/api/v1/notifications/unread-count'),

  // ── Reports (clinician report hub) ──────────────────────────────────────
  listReports: (patientId) =>
    patientId
      ? apiFetch(`/api/v1/patients/${encodeURIComponent(patientId)}/reports`)
          .then(r => (r?.items ?? r ?? []))
      : Promise.resolve([]),

  uploadReport: (formData) => {
    const token = getToken();
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return fetch(`${API_BASE}/api/v1/reports/upload`, { method: 'POST', headers, body: formData })
      .then(r => { if (!r.ok) throw new Error(`API error ${r.status}`); return r.status === 204 ? null : r.json(); });
  },

  aiSummarizeReport: (reportId) =>
    apiFetch(`/api/v1/reports/${encodeURIComponent(reportId)}/ai-summary`, { method: 'POST' }),

  // Persist a generated text report (JSON body; no multipart file). Called
  // from the Reports hub Save flow. Server stores it in PatientMediaUpload
  // with media_type="text".
  createReport: (body) =>
    apiFetch('/api/v1/reports', { method: 'POST', body: JSON.stringify(body) }),

  // List clinician's own generated reports for the Recent tab. Returns items
  // in reverse-chronological order; optional since= ISO date filter.
  listMyReports: (params = {}) => {
    const q = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v != null && v !== '')
    ).toString();
    return apiFetchWithRetry('/api/v1/reports' + (q ? '?' + q : ''));
  },
  renderStoredReport: (reportId, params = {}) => {
    const q = new URLSearchParams(
      Object.entries({
        format: params.format || 'html',
        audience: params.audience || 'both',
      }).filter(([, v]) => v != null && v !== '')
    ).toString();
    return apiFetchBinary(`/api/v1/reports/${encodeURIComponent(reportId)}/render${q ? '?' + q : ''}`);
  },

  // ── Reports Hub launch-audit (2026-04-30) ────────────────────────────────
  // Single report detail with sign / supersede / revision metadata.
  getReport: (reportId) =>
    apiFetch(`/api/v1/reports/${encodeURIComponent(reportId)}`),
  // Counts: total / draft / signed / superseded / by_kind / by_status.
  getReportsSummary: (params = {}) => {
    const q = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v != null && v !== '')
    ).toString();
    return apiFetch('/api/v1/reports/summary' + (q ? '?' + q : ''));
  },
  // Sign-off; idempotent for same actor; 409 if already superseded.
  signReport: (reportId, note) =>
    apiFetch(`/api/v1/reports/${encodeURIComponent(reportId)}/sign`, {
      method: 'POST',
      body: JSON.stringify({ note: note || null }),
    }),
  // Create a new revision; original is marked superseded with a back-pointer.
  supersedeReport: (reportId, opts = {}) =>
    apiFetch(`/api/v1/reports/${encodeURIComponent(reportId)}/supersede`, {
      method: 'POST',
      body: JSON.stringify({
        reason: opts.reason || 'no reason given',
        new_content: opts.new_content == null ? null : opts.new_content,
        new_title: opts.new_title || null,
      }),
    }),
  // CSV export for one report. Downloads as a Blob via apiFetchBinary.
  exportReportCsv: (reportId) =>
    apiFetchBinary(`/api/v1/reports/${encodeURIComponent(reportId)}/export.csv`),
  // PDF export — convenience alias of /render?format=pdf with an audit hook.
  exportReportPdf: (reportId, audience) => {
    const q = new URLSearchParams(
      Object.entries({ audience: audience || null }).filter(([, v]) => v != null && v !== '')
    ).toString();
    return apiFetchBinary(`/api/v1/reports/${encodeURIComponent(reportId)}/export.pdf${q ? '?' + q : ''}`);
  },
  // DOCX export — honest 503 stub when the renderer is not configured.
  exportReportDocx: (reportId) =>
    apiFetchBinary(`/api/v1/reports/${encodeURIComponent(reportId)}/export.docx`),
  // Best-effort page-level audit ingestion for the Reports Hub.
  logReportsAudit: (event) => {
    try {
      const body = JSON.stringify(event || {});
      return apiFetch('/api/v1/reports/audit-events', {
        method: 'POST',
        body,
      });
    } catch (_) {
      return Promise.resolve(null);
    }
  },

  // ── Quality Assurance launch-audit (2026-04-30) ────────────────────────
  // QA findings / non-conformance / CAPA register. Distinct from the
  // artifact-level QA scoring engine at /api/v1/qa/run.
  listQualityFindings: (params = {}) => {
    const q = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v != null && v !== '')
    ).toString();
    return apiFetch('/api/v1/qa/findings' + (q ? '?' + q : ''));
  },
  getQualityFindingsSummary: () => apiFetch('/api/v1/qa/findings/summary'),
  getQualityFinding: (findingId) =>
    apiFetch(`/api/v1/qa/findings/${encodeURIComponent(findingId)}`),
  createQualityFinding: (body) =>
    apiFetch('/api/v1/qa/findings', { method: 'POST', body: JSON.stringify(body || {}) }),
  patchQualityFinding: (findingId, body) =>
    apiFetch(`/api/v1/qa/findings/${encodeURIComponent(findingId)}`, {
      method: 'PATCH',
      body: JSON.stringify(body || {}),
    }),
  closeQualityFinding: (findingId, body) =>
    apiFetch(`/api/v1/qa/findings/${encodeURIComponent(findingId)}/close`, {
      method: 'POST',
      body: JSON.stringify(body || {}),
    }),
  reopenQualityFinding: (findingId, body) =>
    apiFetch(`/api/v1/qa/findings/${encodeURIComponent(findingId)}/reopen`, {
      method: 'POST',
      body: JSON.stringify(body || {}),
    }),
  exportQualityFindingsCsv: (params = {}) => {
    const q = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v != null && v !== '')
    ).toString();
    return apiFetchBinary('/api/v1/qa/findings/export.csv' + (q ? '?' + q : ''));
  },
  exportQualityFindingsNdjson: (params = {}) => {
    const q = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v != null && v !== '')
    ).toString();
    return apiFetchBinary('/api/v1/qa/findings/export.ndjson' + (q ? '?' + q : ''));
  },
  // Best-effort page-level audit ingestion for the QA Hub.
  logQualityAssuranceAudit: (event) => {
    try {
      const body = JSON.stringify(event || {});
      return apiFetch('/api/v1/qa/findings/audit-events', {
        method: 'POST',
        body,
      });
    } catch (_) {
      return Promise.resolve(null);
    }
  },

  // ── IRB Manager launch-audit (2026-04-30) ──────────────────────────────
  // IRB-approved protocol register. Distinct from /api/v1/irb/studies (legacy).
  // Real-User PI validation; closed protocols are immutable in-place; reopen
  // creates a new revision; amendments require a non-empty reason.
  listIrbProtocols: (params = {}) => {
    const q = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v != null && v !== '')
    ).toString();
    return apiFetch('/api/v1/irb/protocols' + (q ? '?' + q : ''));
  },
  getIrbProtocolsSummary: () => apiFetch('/api/v1/irb/protocols/summary'),
  getIrbProtocol: (protocolId) =>
    apiFetch(`/api/v1/irb/protocols/${encodeURIComponent(protocolId)}`),
  createIrbProtocol: (body) =>
    apiFetch('/api/v1/irb/protocols', { method: 'POST', body: JSON.stringify(body || {}) }),
  patchIrbProtocol: (protocolId, body) =>
    apiFetch(`/api/v1/irb/protocols/${encodeURIComponent(protocolId)}`, {
      method: 'PATCH',
      body: JSON.stringify(body || {}),
    }),
  createIrbProtocolAmendment: (protocolId, body) =>
    apiFetch(`/api/v1/irb/protocols/${encodeURIComponent(protocolId)}/amendments`, {
      method: 'POST',
      body: JSON.stringify(body || {}),
    }),
  closeIrbProtocol: (protocolId, body) =>
    apiFetch(`/api/v1/irb/protocols/${encodeURIComponent(protocolId)}/close`, {
      method: 'POST',
      body: JSON.stringify(body || {}),
    }),
  reopenIrbProtocol: (protocolId, body) =>
    apiFetch(`/api/v1/irb/protocols/${encodeURIComponent(protocolId)}/reopen`, {
      method: 'POST',
      body: JSON.stringify(body || {}),
    }),
  exportIrbProtocolsCsv: (params = {}) => {
    const q = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v != null && v !== '')
    ).toString();
    return apiFetchBinary('/api/v1/irb/protocols/export.csv' + (q ? '?' + q : ''));
  },
  exportIrbProtocolsNdjson: (params = {}) => {
    const q = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v != null && v !== '')
    ).toString();
    return apiFetchBinary('/api/v1/irb/protocols/export.ndjson' + (q ? '?' + q : ''));
  },
  // Best-effort page-level audit ingestion for the IRB Manager.
  logIrbManagerAudit: (event) => {
    try {
      const body = JSON.stringify(event || {});
      return apiFetch('/api/v1/irb/protocols/audit-events', {
        method: 'POST',
        body,
      });
    } catch (_) {
      return Promise.resolve(null);
    }
  },

  // ── Clinical Trials launch-audit (2026-04-30) ──────────────────────────
  // Trial register FK'd to a real IRBProtocol. Closed trials are immutable
  // and NOT reopenable. Patient enrolment requires a real Patient row +
  // same-clinic ownership; withdrawals require a non-empty reason.
  listClinicalTrials: (params = {}) => {
    const q = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v != null && v !== '')
    ).toString();
    return apiFetch('/api/v1/clinical-trials/trials' + (q ? '?' + q : ''));
  },
  getClinicalTrialsSummary: () => apiFetch('/api/v1/clinical-trials/trials/summary'),
  getClinicalTrial: (trialId) =>
    apiFetch(`/api/v1/clinical-trials/trials/${encodeURIComponent(trialId)}`),
  createClinicalTrial: (body) =>
    apiFetch('/api/v1/clinical-trials/trials', {
      method: 'POST',
      body: JSON.stringify(body || {}),
    }),
  patchClinicalTrial: (trialId, body) =>
    apiFetch(`/api/v1/clinical-trials/trials/${encodeURIComponent(trialId)}`, {
      method: 'PATCH',
      body: JSON.stringify(body || {}),
    }),
  pauseClinicalTrial: (trialId, body) =>
    apiFetch(`/api/v1/clinical-trials/trials/${encodeURIComponent(trialId)}/pause`, {
      method: 'POST',
      body: JSON.stringify(body || {}),
    }),
  resumeClinicalTrial: (trialId, body) =>
    apiFetch(`/api/v1/clinical-trials/trials/${encodeURIComponent(trialId)}/resume`, {
      method: 'POST',
      body: JSON.stringify(body || {}),
    }),
  closeClinicalTrial: (trialId, body) =>
    apiFetch(`/api/v1/clinical-trials/trials/${encodeURIComponent(trialId)}/close`, {
      method: 'POST',
      body: JSON.stringify(body || {}),
    }),
  enrollClinicalTrialPatient: (trialId, body) =>
    apiFetch(`/api/v1/clinical-trials/trials/${encodeURIComponent(trialId)}/enrollments`, {
      method: 'POST',
      body: JSON.stringify(body || {}),
    }),
  withdrawClinicalTrialEnrollment: (trialId, enrollmentId, body) =>
    apiFetch(
      `/api/v1/clinical-trials/trials/${encodeURIComponent(trialId)}/enrollments/${encodeURIComponent(enrollmentId)}/withdraw`,
      { method: 'POST', body: JSON.stringify(body || {}) },
    ),
  exportClinicalTrialsCsv: (params = {}) => {
    const q = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v != null && v !== '')
    ).toString();
    return apiFetchBinary('/api/v1/clinical-trials/trials/export.csv' + (q ? '?' + q : ''));
  },
  exportClinicalTrialsNdjson: (params = {}) => {
    const q = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v != null && v !== '')
    ).toString();
    return apiFetchBinary('/api/v1/clinical-trials/trials/export.ndjson' + (q ? '?' + q : ''));
  },
  // Best-effort page-level audit ingestion for the Clinical Trials hub.
  logClinicalTrialsAudit: (event) => {
    try {
      const body = JSON.stringify(event || {});
      return apiFetch('/api/v1/clinical-trials/trials/audit-events', {
        method: 'POST',
        body,
      });
    } catch (_) {
      return Promise.resolve(null);
    }
  },

  // ── Patient outcomes (portal alias) ─────────────────────────────────────
  patientOutcomes: () => apiFetch('/api/v1/patient-portal/outcomes'),

  // ── Leads & Reception ──────────────────────────────────────────────────
  listLeads: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetchWithRetry(`/api/v1/leads${q ? '?' + q : ''}`);
  },
  createLead: (data) => apiFetchWithRetry('/api/v1/leads', { method: 'POST', body: JSON.stringify(data) }),
  updateLead: (id, data) => apiFetchWithRetry(`/api/v1/leads/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteLead: (id) => apiFetchWithRetry(`/api/v1/leads/${id}`, { method: 'DELETE' }),
  listReceptionCalls: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetchWithRetry(`/api/v1/reception/calls${q ? '?' + q : ''}`);
  },
  createReceptionCall: (data) => apiFetchWithRetry('/api/v1/reception/calls', { method: 'POST', body: JSON.stringify(data) }),
  listReceptionTasks: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetchWithRetry(`/api/v1/reception/tasks${q ? '?' + q : ''}`);
  },
  createReceptionTask: (data) => apiFetchWithRetry('/api/v1/reception/tasks', { method: 'POST', body: JSON.stringify(data) }),
  updateReceptionTask: (id, data) => apiFetchWithRetry(`/api/v1/reception/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  // ── Finance Hub ─────────────────────────────────────────────────────────
  // Invoices, payments, insurance claims, and analytics. All endpoints are
  // auth-gated and clinician-scoped server-side.
  finance: {
    listInvoices: (params = {}) => {
      const q = new URLSearchParams(
        Object.entries(params).filter(([, v]) => v != null && v !== '')
      ).toString();
      return apiFetch('/api/v1/finance/invoices' + (q ? '?' + q : ''));
    },
    createInvoice: (body) =>
      apiFetch('/api/v1/finance/invoices', { method: 'POST', body: JSON.stringify(body) }),
    getInvoice: (id) =>
      apiFetch('/api/v1/finance/invoices/' + encodeURIComponent(id)),
    updateInvoice: (id, body) =>
      apiFetch('/api/v1/finance/invoices/' + encodeURIComponent(id), { method: 'PATCH', body: JSON.stringify(body) }),
    deleteInvoice: (id) =>
      apiFetch('/api/v1/finance/invoices/' + encodeURIComponent(id), { method: 'DELETE' }),
    markInvoicePaid: (id, body) =>
      apiFetch('/api/v1/finance/invoices/' + encodeURIComponent(id) + '/mark-paid', { method: 'POST', body: JSON.stringify(body) }),

    listPayments: () => apiFetch('/api/v1/finance/payments'),
    createPayment: (body) =>
      apiFetch('/api/v1/finance/payments', { method: 'POST', body: JSON.stringify(body) }),

    listClaims: (params = {}) => {
      const q = new URLSearchParams(
        Object.entries(params).filter(([, v]) => v != null && v !== '')
      ).toString();
      return apiFetch('/api/v1/finance/claims' + (q ? '?' + q : ''));
    },
    createClaim: (body) =>
      apiFetch('/api/v1/finance/claims', { method: 'POST', body: JSON.stringify(body) }),
    getClaim: (id) =>
      apiFetch('/api/v1/finance/claims/' + encodeURIComponent(id)),
    updateClaim: (id, body) =>
      apiFetch('/api/v1/finance/claims/' + encodeURIComponent(id), { method: 'PATCH', body: JSON.stringify(body) }),
    deleteClaim: (id) =>
      apiFetch('/api/v1/finance/claims/' + encodeURIComponent(id), { method: 'DELETE' }),

    summary: () => apiFetch('/api/v1/finance/summary'),
    monthlyAnalytics: (months = 6) =>
      apiFetch('/api/v1/finance/analytics/monthly?months=' + encodeURIComponent(months)),
  },

  // ── Profile ────────────────────────────────────────────────────────────────
  getProfile: () => apiFetch('/api/v1/profile'),
  updateProfile: (data) => apiFetch('/api/v1/profile', { method: 'PATCH', body: JSON.stringify(data) }),
  requestEmailChange: (new_email, current_password) =>
    apiFetch('/api/v1/profile/email', { method: 'PATCH', body: JSON.stringify({ new_email, current_password }) }),
  verifyEmailChange: (token) =>
    apiFetch('/api/v1/profile/email/verify', { method: 'POST', body: JSON.stringify({ token }) }),
  uploadAvatar: (file) => {  // multipart
    const form = new FormData();
    form.append('file', file);
    return apiFetch('/api/v1/profile/avatar', { method: 'POST', body: form });
  },
  deleteAvatar: () => apiFetch('/api/v1/profile/avatar', { method: 'DELETE' }),

  // ── Auth extensions (password, 2FA, sessions) ─────────────────────────────
  changePassword: (current_password, new_password) =>
    apiFetch('/api/v1/auth/password', { method: 'PATCH', body: JSON.stringify({ current_password, new_password }) }),
  setup2FA: () => apiFetch('/api/v1/auth/2fa/setup', { method: 'POST', body: '{}' }),
  verify2FA: (code) =>
    apiFetch('/api/v1/auth/2fa/verify', { method: 'POST', body: JSON.stringify({ code }) }),
  disable2FA: (password, code) =>
    apiFetch('/api/v1/auth/2fa/disable', { method: 'POST', body: JSON.stringify({ password, code }) }),
  // NOTE: named `listAuthSessions` (not `listSessions`) to avoid colliding with the
  // existing `listSessions(patient_id)` method used for treatment sessions.
  listAuthSessions: () => apiFetch('/api/v1/auth/sessions'),
  revokeAuthSession: (sid) => apiFetch(`/api/v1/auth/sessions/${encodeURIComponent(sid)}`, { method: 'DELETE' }),
  revokeOtherAuthSessions: () => apiFetch('/api/v1/auth/sessions/others', { method: 'DELETE' }),

  // ── Onboarding wizard (launch-audit 2026-05-01) ──────────────────────────
  // Server-side state + audit ingestion. Each helper swallows network
  // failures so the wizard remains usable offline (localStorage fallback).
  getOnboardingState: () => apiFetch('/api/v1/onboarding/state').catch(() => null),
  postOnboardingState: (data) =>
    apiFetch('/api/v1/onboarding/state', {
      method: 'POST',
      body: JSON.stringify(data || {}),
    }).catch(() => null),
  postOnboardingStepComplete: (data) =>
    apiFetch('/api/v1/onboarding/step-complete', {
      method: 'POST',
      body: JSON.stringify(data || {}),
    }).catch(() => null),
  postOnboardingSkip: (data) =>
    apiFetch('/api/v1/onboarding/skip', {
      method: 'POST',
      body: JSON.stringify(data || {}),
    }).catch(() => null),
  postOnboardingAuditEvent: (data) =>
    apiFetch('/api/v1/onboarding/audit-events', {
      method: 'POST',
      body: JSON.stringify(data || {}),
    }).catch(() => null),
  postOnboardingSeedDemo: (data) =>
    apiFetch('/api/v1/onboarding/seed-demo', {
      method: 'POST',
      body: JSON.stringify(data || {}),
    }).catch(() => null),

  // ── Patient Symptom Journal (launch-audit 2026-05-01) ────────────────────
  // First patient-facing surface to receive the launch-audit treatment.
  // All helpers swallow network failures so the UI keeps working offline
  // (localStorage fallback). The actor's patient_id is auto-resolved
  // server-side; the patient never needs to pass it explicitly.
  listSymptomJournalEntries: (params) => {
    const q = new URLSearchParams();
    if (params) {
      for (const k of ['since', 'until', 'tag', 'q']) {
        if (params[k]) q.set(k, params[k]);
      }
      for (const k of ['severity_min', 'severity_max', 'limit', 'offset']) {
        if (params[k] != null && params[k] !== '') q.set(k, String(params[k]));
      }
      if (params.include_deleted) q.set('include_deleted', 'true');
      if (params.patient_id) q.set('patient_id', params.patient_id);
    }
    const qs = q.toString();
    return apiFetch(`/api/v1/symptom-journal/entries${qs ? '?' + qs : ''}`).catch(() => null);
  },
  getSymptomJournalSummary: (params) => {
    const q = new URLSearchParams();
    if (params && params.patient_id) q.set('patient_id', params.patient_id);
    const qs = q.toString();
    return apiFetch(`/api/v1/symptom-journal/summary${qs ? '?' + qs : ''}`).catch(() => null);
  },
  getSymptomJournalEntry: (entryId) =>
    apiFetch(`/api/v1/symptom-journal/entries/${encodeURIComponent(entryId)}`).catch(() => null),
  createSymptomJournalEntry: (data) =>
    apiFetch('/api/v1/symptom-journal/entries', {
      method: 'POST',
      body: JSON.stringify(data || {}),
    }),
  editSymptomJournalEntry: (entryId, data) =>
    apiFetch(`/api/v1/symptom-journal/entries/${encodeURIComponent(entryId)}`, {
      method: 'PATCH',
      body: JSON.stringify(data || {}),
    }),
  deleteSymptomJournalEntry: (entryId, reason) =>
    apiFetch(`/api/v1/symptom-journal/entries/${encodeURIComponent(entryId)}`, {
      method: 'DELETE',
      body: JSON.stringify({ reason: reason || 'patient request' }),
    }),
  shareSymptomJournalEntry: (entryId, note) =>
    apiFetch(`/api/v1/symptom-journal/entries/${encodeURIComponent(entryId)}/share`, {
      method: 'POST',
      body: JSON.stringify({ note: note || null }),
    }),
  postSymptomJournalAuditEvent: (data) =>
    apiFetch('/api/v1/symptom-journal/audit-events', {
      method: 'POST',
      body: JSON.stringify(data || {}),
    }).catch(() => null),
  symptomJournalExportUrl: (kind, params) => {
    const q = new URLSearchParams();
    if (params) {
      for (const k of ['since', 'until', 'tag', 'q', 'patient_id']) {
        if (params[k]) q.set(k, params[k]);
      }
      for (const k of ['severity_min', 'severity_max']) {
        if (params[k] != null && params[k] !== '') q.set(k, String(params[k]));
      }
    }
    const qs = q.toString();
    return `/api/v1/symptom-journal/export.${kind}${qs ? '?' + qs : ''}`;
  },

  // ── Patient Wellness Hub (launch-audit 2026-05-01) ───────────────────────
  // Second patient-facing surface to receive the launch-audit treatment.
  // Mirrors the symptom-journal helper shape. All read helpers swallow
  // network failures so the UI keeps working offline (localStorage
  // fallback). The actor's patient_id is auto-resolved server-side.
  listWellnessCheckins: (params) => {
    const q = new URLSearchParams();
    if (params) {
      for (const k of ['since', 'until', 'tag', 'axis', 'q']) {
        if (params[k]) q.set(k, params[k]);
      }
      for (const k of ['axis_min', 'axis_max', 'limit', 'offset']) {
        if (params[k] != null && params[k] !== '') q.set(k, String(params[k]));
      }
      if (params.include_deleted) q.set('include_deleted', 'true');
      if (params.patient_id) q.set('patient_id', params.patient_id);
    }
    const qs = q.toString();
    return apiFetch(`/api/v1/wellness/checkins${qs ? '?' + qs : ''}`).catch(() => null);
  },
  getWellnessSummary: (params) => {
    const q = new URLSearchParams();
    if (params && params.patient_id) q.set('patient_id', params.patient_id);
    const qs = q.toString();
    return apiFetch(`/api/v1/wellness/summary${qs ? '?' + qs : ''}`).catch(() => null);
  },
  getWellnessCheckin: (checkinId) =>
    apiFetch(`/api/v1/wellness/checkins/${encodeURIComponent(checkinId)}`).catch(() => null),
  createWellnessCheckin: (data) =>
    apiFetch('/api/v1/wellness/checkins', {
      method: 'POST',
      body: JSON.stringify(data || {}),
    }),
  editWellnessCheckin: (checkinId, data) =>
    apiFetch(`/api/v1/wellness/checkins/${encodeURIComponent(checkinId)}`, {
      method: 'PATCH',
      body: JSON.stringify(data || {}),
    }),
  deleteWellnessCheckin: (checkinId, reason) =>
    apiFetch(`/api/v1/wellness/checkins/${encodeURIComponent(checkinId)}`, {
      method: 'DELETE',
      body: JSON.stringify({ reason: reason || 'patient request' }),
    }),
  shareWellnessCheckin: (checkinId, note) =>
    apiFetch(`/api/v1/wellness/checkins/${encodeURIComponent(checkinId)}/share`, {
      method: 'POST',
      body: JSON.stringify({ note: note || null }),
    }),
  postWellnessAuditEvent: (data) =>
    apiFetch('/api/v1/wellness/audit-events', {
      method: 'POST',
      body: JSON.stringify(data || {}),
    }).catch(() => null),
  wellnessExportUrl: (kind, params) => {
    const q = new URLSearchParams();
    if (params) {
      for (const k of ['since', 'until', 'tag', 'axis', 'q', 'patient_id']) {
        if (params[k]) q.set(k, params[k]);
      }
      for (const k of ['axis_min', 'axis_max']) {
        if (params[k] != null && params[k] !== '') q.set(k, String(params[k]));
      }
    }
    const qs = q.toString();
    return `/api/v1/wellness/export.${kind}${qs ? '?' + qs : ''}`;
  },

  // ── Patient Reports view-side (launch-audit 2026-05-01) ─────────────────────
  // Third patient-facing surface to receive the launch-audit treatment.
  // Mirrors the symptom-journal / wellness-hub helper shape. All read
  // helpers swallow network failures so the UI keeps working when the API
  // is unreachable. The actor's patient_id is auto-resolved server-side;
  // never pass a client-supplied patient_id here — the server will return
  // 404 if the path tries to spoof another patient.
  listPatientReports: (params) => {
    const q = new URLSearchParams();
    if (params) {
      for (const k of ['type', 'status', 'since', 'until', 'q']) {
        if (params[k]) q.set(k, params[k]);
      }
      for (const k of ['limit', 'offset']) {
        if (params[k] != null && params[k] !== '') q.set(k, String(params[k]));
      }
    }
    const qs = q.toString();
    return apiFetch(`/api/v1/reports/patient/me${qs ? '?' + qs : ''}`).catch(() => null);
  },
  getPatientReportsSummary: () =>
    apiFetch('/api/v1/reports/patient/me/summary').catch(() => null),
  getPatientReportView: (reportId) =>
    apiFetch(`/api/v1/reports/${encodeURIComponent(reportId)}/patient-view`).catch(() => null),
  acknowledgePatientReport: (reportId, note) =>
    apiFetch(`/api/v1/reports/${encodeURIComponent(reportId)}/acknowledge`, {
      method: 'POST',
      body: JSON.stringify({ note: note || null }),
    }),
  requestPatientReportShareBack: (reportId, audience, note) =>
    apiFetch(`/api/v1/reports/${encodeURIComponent(reportId)}/request-share-back`, {
      method: 'POST',
      body: JSON.stringify({ audience: audience || '', note: note || '' }),
    }),
  startPatientReportQuestion: (reportId, question) =>
    apiFetch(`/api/v1/reports/${encodeURIComponent(reportId)}/start-question`, {
      method: 'POST',
      body: JSON.stringify({ question: question || '' }),
    }),
  postPatientReportsAuditEvent: (data) =>
    apiFetch('/api/v1/reports/patient/audit-events', {
      method: 'POST',
      body: JSON.stringify(data || {}),
    }).catch(() => null),

  // ── Patient Messages launch-audit (2026-05-01) ─────────────────────────────
  // Fourth patient-facing surface to land server-side persistence + audit.
  // The thread shape is shared with Patient Reports (#346)
  // ``start-question`` (which stamps thread_id=report-{report_id} on a row
  // in the same Message table). The ``patient_messages`` surface groups by
  // ``thread_id`` server-side and emits audit rows on every action.
  listPatientMessageThreads: (params = {}) => {
    const q = new URLSearchParams();
    for (const k of ['category', 'status', 'since', 'until', 'q']) {
      if (params && params[k]) q.set(k, params[k]);
    }
    for (const k of ['limit', 'offset']) {
      if (params && params[k] != null && params[k] !== '') q.set(k, String(params[k]));
    }
    const qs = q.toString();
    return apiFetch(`/api/v1/messages/threads${qs ? '?' + qs : ''}`);
  },
  getPatientMessageThreadsSummary: () =>
    apiFetch('/api/v1/messages/threads/summary'),
  getPatientMessageThread: (threadId) =>
    apiFetch(`/api/v1/messages/threads/${encodeURIComponent(threadId)}`),
  composePatientMessageThread: (data) =>
    apiFetch('/api/v1/messages/threads', {
      method: 'POST',
      body: JSON.stringify(data || {}),
    }),
  replyPatientMessageThread: (threadId, data) =>
    apiFetch(
      `/api/v1/messages/threads/${encodeURIComponent(threadId)}/messages`,
      { method: 'POST', body: JSON.stringify(data || {}) },
    ),
  markPatientMessageThreadUrgent: (threadId, note) =>
    apiFetch(
      `/api/v1/messages/threads/${encodeURIComponent(threadId)}/mark-urgent`,
      { method: 'POST', body: JSON.stringify({ note: note || null }) },
    ),
  markPatientMessageThreadResolved: (threadId, note) =>
    apiFetch(
      `/api/v1/messages/threads/${encodeURIComponent(threadId)}/mark-resolved`,
      { method: 'POST', body: JSON.stringify({ note: note || null }) },
    ),
  markPatientMessageRead: (threadId, messageId) =>
    apiFetch(
      `/api/v1/messages/threads/${encodeURIComponent(threadId)}/messages/${encodeURIComponent(messageId)}/mark-read`,
      { method: 'POST' },
    ),
  postPatientMessagesAuditEvent: (data) =>
    apiFetch('/api/v1/messages/audit-events', {
      method: 'POST',
      body: JSON.stringify(data || {}),
    }).catch(() => null),

  // ── Clinic ─────────────────────────────────────────────────────────────────
  getClinic: () => apiFetch('/api/v1/clinic').catch(() => null),  // 404 if no clinic
  createClinic: (data) => apiFetch('/api/v1/clinic', { method: 'POST', body: JSON.stringify(data) }),
  updateClinic: (data) => apiFetch('/api/v1/clinic', { method: 'PATCH', body: JSON.stringify(data) }),
  uploadClinicLogo: (file) => {
    const form = new FormData();
    form.append('file', file);
    return apiFetch('/api/v1/clinic/logo', { method: 'POST', body: form });
  },
  updateWorkingHours: (hours) =>
    apiFetch('/api/v1/clinic/working-hours', { method: 'PUT', body: JSON.stringify(hours) }),

  // ── Team ───────────────────────────────────────────────────────────────────
  listTeam: () => apiFetch('/api/v1/team'),
  listTeamMembers: () => api.listTeam(),
  inviteTeamMember: (email, role) =>
    apiFetch('/api/v1/team/invite', { method: 'POST', body: JSON.stringify({ email, role }) }),
  revokeTeamInvite: (id) => apiFetch(`/api/v1/team/invite/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  updateTeamMemberRole: (user_id, role) =>
    apiFetch(`/api/v1/team/${encodeURIComponent(user_id)}/role`, { method: 'PATCH', body: JSON.stringify({ role }) }),
  removeTeamMember: (user_id) =>
    apiFetch(`/api/v1/team/${encodeURIComponent(user_id)}`, { method: 'DELETE' }),
  acceptTeamInvite: (token, password, display_name) =>
    apiFetch('/api/v1/team/accept-invite', { method: 'POST', body: JSON.stringify({ token, password, display_name }) }),

  // ── Preferences ────────────────────────────────────────────────────────────
  getPreferences: () => apiFetch('/api/v1/preferences'),
  updatePreferences: (data) => apiFetch('/api/v1/preferences', { method: 'PATCH', body: JSON.stringify(data) }),
  getClinicalDefaults: () => apiFetch('/api/v1/preferences/clinical-defaults'),
  updateClinicalDefaults: (data) =>
    apiFetch('/api/v1/preferences/clinical-defaults', { method: 'PATCH', body: JSON.stringify(data) }),

  // ── Privacy / Data Export ──────────────────────────────────────────────────
  requestDataExport: () => apiFetch('/api/v1/privacy/export', { method: 'POST', body: '{}' }),
  listDataExports: () => apiFetch('/api/v1/privacy/exports'),
  getDataExport: (id) => apiFetch(`/api/v1/privacy/exports/${encodeURIComponent(id)}`),
  deleteDataExport: (id) => apiFetch(`/api/v1/privacy/exports/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  // ── Scheduling hub helpers ───────────────────────────────────────────────
  // Cancel an appointment by setting status=cancelled via the sessions PATCH
  // endpoint. This preserves history (DELETE is also available but destructive).
  cancelSession: (id, data = {}) => {
    const body = { status: 'cancelled' };
    if (data && data.reason) {
      body.cancel_reason = String(data.reason);
      body.session_notes = '[Cancelled] ' + String(data.reason);
    }
    return apiFetch(`/api/v1/sessions/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
  },
  // Booking alias — backend uses POST /api/v1/sessions (createSession).
  bookSession: (data) =>
    apiFetch('/api/v1/sessions', { method: 'POST', body: JSON.stringify(data) }),

  // Endpoints not yet implemented in backend — these reject so callers can
  // try/catch and fall back to demo/seed data. When the real endpoint ships,
  // replace the stub with the real call.
  listClinicians: () =>
    api.listTeam().then((res) => ({
      items: (res?.items || []).filter((member) => ['admin', 'clinician', 'technician'].includes(String(member?.role || '').toLowerCase())),
    })),
  listRooms: () => Promise.reject(new Error('not_implemented')),
  listReferrals: () => api.listLeads(),
  listStaffSchedule: (_params) => Promise.reject(new Error('not_implemented')),
  createStaffShift: (_data) => Promise.reject(new Error('not_implemented')),
  checkSlotConflicts: (_slot) => Promise.reject(new Error('not_implemented')),
  triageReferral: (_id, _data) => Promise.reject(new Error('not_implemented')),
  dismissReferral: (_id) => Promise.reject(new Error('not_implemented')),

  // ── Home program task notifications (stub — endpoint not yet implemented) ──
  remindHomeProgramTask: (_taskId, _payload) => Promise.reject(new Error('not_implemented')),
  listHomeProgramTaskTemplates: () => Promise.reject(new Error('not_implemented')),

  // ── Patient Education Programs (stubs — backend endpoints not yet shipped) ──
  // Frontend (pgPrograms in pages-practice.js) currently persists to
  // localStorage(`ds_education_programs_v1`) and renders a DEMO DATA banner.
  // When `/api/v1/programs/...` ships, replace these rejects with apiFetch calls.
  // TODO backend: GET /api/v1/programs/modules?condition=&type=&lang=
  listEducationModules: (_params) => Promise.reject(new Error('not_implemented')),
  // TODO backend: GET /api/v1/programs/assignments?patient_id=
  listAssignments: (_params) => Promise.reject(new Error('not_implemented')),
  // TODO backend: POST /api/v1/programs/assignments  body:{ patient_id, module_id }
  assignModule: (_data) => Promise.reject(new Error('not_implemented')),
  // TODO backend: PATCH /api/v1/programs/assignments/{id}  body:{ status:'completed' }
  markModuleComplete: (_assignmentId) => Promise.reject(new Error('not_implemented')),
  // TODO backend: DELETE /api/v1/programs/assignments/{id}
  unassignModule: (_assignmentId) => Promise.reject(new Error('not_implemented')),

  // ── Risk Stratification (traffic lights) ──────────────────────────────────
  getPatientRiskProfile: (patientId) =>
    apiFetch(`/api/v1/risk/patient/${encodeURIComponent(patientId)}`),
  getClinicRiskSummary: () =>
    apiFetch('/api/v1/risk/clinic/summary'),
  overrideRiskCategory: (patientId, category, data) =>
    apiFetch(`/api/v1/risk/patient/${encodeURIComponent(patientId)}/${encodeURIComponent(category)}/override`, { method: 'POST', body: JSON.stringify(data) }),
  recomputeRisk: (patientId) =>
    apiFetch(`/api/v1/risk/patient/${encodeURIComponent(patientId)}/recompute`, { method: 'POST' }),
  getRiskAudit: (patientId) =>
    apiFetch(`/api/v1/risk/patient/${encodeURIComponent(patientId)}/audit`),

  // ── Movement Analyzer (motor side-effects of psychiatric treatment) ───────
  getMovementProfile: (patientId) =>
    apiFetch(`/api/v1/movement/analyzer/patient/${encodeURIComponent(patientId)}`),
  recomputeMovement: (patientId) =>
    apiFetch(`/api/v1/movement/analyzer/patient/${encodeURIComponent(patientId)}/recompute`, { method: 'POST' }),
  addMovementAnnotation: (patientId, body) =>
    apiFetch(`/api/v1/movement/analyzer/patient/${encodeURIComponent(patientId)}/annotation`, { method: 'POST', body: JSON.stringify(body || {}) }),
  getMovementAudit: (patientId) =>
    apiFetch(`/api/v1/movement/analyzer/patient/${encodeURIComponent(patientId)}/audit`),

  // ── Labs / Blood Biomarkers Analyzer (psych-med + neuromodulation safety) ─
  getLabsProfile: (patientId) =>
    apiFetch(`/api/v1/labs/analyzer/patient/${encodeURIComponent(patientId)}`),
  recomputeLabs: (patientId) =>
    apiFetch(`/api/v1/labs/analyzer/patient/${encodeURIComponent(patientId)}/recompute`, { method: 'POST' }),
  addLabResult: (patientId, body) =>
    apiFetch(`/api/v1/labs/analyzer/patient/${encodeURIComponent(patientId)}/results`, { method: 'POST', body: JSON.stringify(body || {}) }),
  addLabsAnnotation: (patientId, body) =>
    apiFetch(`/api/v1/labs/analyzer/patient/${encodeURIComponent(patientId)}/annotation`, { method: 'POST', body: JSON.stringify(body || {}) }),
  addLabsReviewNote: (patientId, body) =>
    apiFetch(`/api/v1/labs/analyzer/patient/${encodeURIComponent(patientId)}/review-note`, { method: 'POST', body: JSON.stringify(body || {}) }),
  getLabsAudit: (patientId) =>
    apiFetch(`/api/v1/labs/analyzer/patient/${encodeURIComponent(patientId)}/audit`),

  // ── Device Sync (clinician-facing) ─────────────────────────────────────────
  deviceSyncProviders: () => apiFetchWithRetry('/api/v1/device-sync/providers'),
  deviceSyncAuthorize: (provider) =>
    apiFetch(`/api/v1/device-sync/oauth/${encodeURIComponent(provider)}/authorize`),
  deviceSyncDashboard: (connectionId, days = 30) =>
    apiFetchWithRetry(`/api/v1/device-sync/${encodeURIComponent(connectionId)}/dashboard?days=${days}`),
  deviceSyncHistory: (connectionId, limit = 20) =>
    apiFetchWithRetry(`/api/v1/device-sync/${encodeURIComponent(connectionId)}/history?limit=${limit}`),
  deviceSyncTimeseries: (connectionId, metric = 'heart_rate', days = 30) =>
    apiFetchWithRetry(`/api/v1/device-sync/${encodeURIComponent(connectionId)}/timeseries?metric=${encodeURIComponent(metric)}&days=${days}`),
  deviceSyncTrigger: (connectionId) =>
    apiFetch(`/api/v1/device-sync/${encodeURIComponent(connectionId)}/trigger`, { method: 'POST' }),

  // ── Patient Command Center ─────────────────────────────────────────────────
  getCommandCenter: (patientId) =>
    apiFetchWithRetry(`/api/v1/command-center/${encodeURIComponent(patientId)}`),

  // ── qEEG Raw Data & Cleaning ──────────────────────────────────────────────
  getQEEGChannelInfo: (analysisId) =>
    apiFetch(`/api/v1/qeeg-raw/${encodeURIComponent(analysisId)}/channel-info`),
  getQEEGRawSignal: (analysisId, params = {}) => {
    const q = new URLSearchParams();
    if (params.tStart != null) q.set('t_start', params.tStart);
    if (params.tEnd != null) q.set('t_end', params.tEnd);
    if (params.windowSec != null) q.set('window_sec', params.windowSec);
    if (params.channels) q.set('channels', params.channels.join(','));
    if (params.maxPoints != null) q.set('max_points_per_channel', params.maxPoints);
    const qs = q.toString();
    return apiFetch(`/api/v1/qeeg-raw/${encodeURIComponent(analysisId)}/raw-signal${qs ? '?' + qs : ''}`);
  },
  getQEEGCleanedSignal: (analysisId, params = {}) => {
    const q = new URLSearchParams();
    if (params.tStart != null) q.set('t_start', params.tStart);
    if (params.tEnd != null) q.set('t_end', params.tEnd);
    if (params.windowSec != null) q.set('window_sec', params.windowSec);
    if (params.channels) q.set('channels', params.channels.join(','));
    if (params.maxPoints != null) q.set('max_points_per_channel', params.maxPoints);
    const qs = q.toString();
    return apiFetch(`/api/v1/qeeg-raw/${encodeURIComponent(analysisId)}/cleaned-signal${qs ? '?' + qs : ''}`);
  },
  getQEEGICAComponents: (analysisId) =>
    apiFetch(`/api/v1/qeeg-raw/${encodeURIComponent(analysisId)}/ica-components`),
  getQEEGICATimecourse: (analysisId, idx) =>
    apiFetch(`/api/v1/qeeg-raw/${encodeURIComponent(analysisId)}/ica-timecourse/${idx}`),
  saveQEEGCleaningConfig: (analysisId, config) =>
    apiFetch(`/api/v1/qeeg-raw/${encodeURIComponent(analysisId)}/cleaning-config`, { method: 'POST', body: JSON.stringify(config) }),
  getQEEGCleaningConfig: (analysisId) =>
    apiFetch(`/api/v1/qeeg-raw/${encodeURIComponent(analysisId)}/cleaning-config`),
  reprocessQEEGWithCleaning: (analysisId) =>
    apiFetch(`/api/v1/qeeg-raw/${encodeURIComponent(analysisId)}/reprocess`, { method: 'POST' }),

  // ── qEEG Raw Cleaning Workbench ────────────────────────────────────────────
  // Decision-support only.  All mutations preserve original raw EEG and
  // require clinician confirmation before AI suggestions become accepted.
  getQEEGWorkbenchMetadata: (analysisId) =>
    apiFetch(`/api/v1/qeeg-raw/${encodeURIComponent(analysisId)}/metadata`),
  getQEEGWorkbenchReferenceLibrary: (analysisId) =>
    apiFetch(`/api/v1/qeeg-raw/${encodeURIComponent(analysisId)}/reference-library`),
  getQEEGManualAnalysisChecklist: (analysisId) =>
    apiFetch(`/api/v1/qeeg-raw/${encodeURIComponent(analysisId)}/manual-analysis-checklist`),
  getQEEGCleaningLog: (analysisId, limit = 200) =>
    apiFetch(`/api/v1/qeeg-raw/${encodeURIComponent(analysisId)}/cleaning-log?limit=${limit}`),
  listQEEGCleaningAnnotations: (analysisId, params = {}) => {
    const q = new URLSearchParams();
    if (params.kind) q.set('kind', params.kind);
    if (params.decisionStatus) q.set('decision_status', params.decisionStatus);
    if (params.limit != null) q.set('limit', params.limit);
    const qs = q.toString();
    return apiFetch(`/api/v1/qeeg-raw/${encodeURIComponent(analysisId)}/annotations${qs ? '?' + qs : ''}`);
  },
  createQEEGCleaningAnnotation: (analysisId, body) =>
    apiFetch(`/api/v1/qeeg-raw/${encodeURIComponent(analysisId)}/annotations`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  createQEEGManualFinding: (analysisId, body) =>
    apiFetch(`/api/v1/qeeg-raw/${encodeURIComponent(analysisId)}/manual-findings`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  saveQEEGCleaningVersion: (analysisId, body) =>
    apiFetch(`/api/v1/qeeg-raw/${encodeURIComponent(analysisId)}/cleaning-version`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  listQEEGCleaningVersions: (analysisId) =>
    apiFetch(`/api/v1/qeeg-raw/${encodeURIComponent(analysisId)}/cleaning-versions`),
  getQEEGRawVsCleanedSummary: (analysisId, cleaningVersionId) => {
    const qs = cleaningVersionId ? `?cleaning_version_id=${encodeURIComponent(cleaningVersionId)}` : '';
    return apiFetch(`/api/v1/qeeg-raw/${encodeURIComponent(analysisId)}/raw-vs-cleaned-summary${qs}`);
  },
  generateQEEGAIArtefactSuggestions: (analysisId, body = null) =>
    apiFetch(`/api/v1/qeeg-raw/${encodeURIComponent(analysisId)}/ai-artefact-suggestions`, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    }),
  rerunQEEGAnalysisWithCleaning: (analysisId, cleaningVersionId) =>
    apiFetch(`/api/v1/qeeg-raw/${encodeURIComponent(analysisId)}/rerun-analysis`, {
      method: 'POST',
      body: JSON.stringify({ cleaning_version_id: cleaningVersionId }),
    }),
  // ── qEEG Raw — Phase 4 artifact tooling ───────────────────────────────────
  // Threshold-based auto-scan, ICA-template apply, spike events. Decision-
  // support only — every mutation writes a CleaningDecision audit row. The
  // /spike-events endpoint returns 200 with `{events: []}` even when no
  // detector is installed; the empty list is a valid clinical signal.
  postQEEGAutoScan: (analysisId) =>
    apiFetch(`/api/v1/qeeg-raw/${encodeURIComponent(analysisId)}/auto-scan`, { method: 'POST' }),
  decideQEEGAutoScan: (analysisId, runId, body) =>
    apiFetch(`/api/v1/qeeg-raw/${encodeURIComponent(analysisId)}/auto-scan/${encodeURIComponent(runId)}/decide`, {
      method: 'POST',
      body: JSON.stringify(body || { accepted_items: { bad_channels: [], bad_segments: [] }, rejected_items: { bad_channels: [], bad_segments: [] } }),
    }),
  applyQEEGTemplate: (analysisId, template) =>
    apiFetch(`/api/v1/qeeg-raw/${encodeURIComponent(analysisId)}/apply-template`, {
      method: 'POST',
      body: JSON.stringify({ template }),
    }),
  getQEEGSpikeEvents: (analysisId) =>
    apiFetch(`/api/v1/qeeg-raw/${encodeURIComponent(analysisId)}/spike-events`),
  // ── qEEG Raw — Phase 6 export + cleaning report ──────────────────────────
  // Both endpoints stream binary payloads. We use apiFetchBinary so the
  // caller gets back the raw blob + filename hint from Content-Disposition.
  postQEEGExportCleaned: (analysisId, body = {}) =>
    apiFetchBinary(`/api/v1/qeeg-raw/${encodeURIComponent(analysisId)}/export-cleaned`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        format: body.format || 'edf',
        interpolate_bad_channels: body.interpolate_bad_channels !== false,
      }),
    }),
  postQEEGCleaningReport: (analysisId) =>
    apiFetchBinary(`/api/v1/qeeg-raw/${encodeURIComponent(analysisId)}/cleaning-report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }),

  // ── qEEG AI co-pilot overlay — Phase 5 ────────────────────────────────────
  // Every endpoint returns `{result, reasoning, features}` so the UI can show
  // "why this suggestion" beside every AI output. Each AI proposal call also
  // writes a CleaningDecision audit row server-side at proposal time
  // (actor='ai', action='propose_*'), giving a complete audit trail of what
  // the AI said even before the clinician decides.
  getQEEGAIQualityScore: (analysisId) =>
    apiFetch(`/api/v1/qeeg-ai/${encodeURIComponent(analysisId)}/quality_score`, { method: 'POST' }),
  getQEEGAIAutoCleanPropose: (analysisId) =>
    apiFetch(`/api/v1/qeeg-ai/${encodeURIComponent(analysisId)}/auto_clean_propose`, { method: 'POST' }),
  getQEEGAIExplainBadChannel: (analysisId, channel) =>
    apiFetch(`/api/v1/qeeg-ai/${encodeURIComponent(analysisId)}/explain_bad_channel/${encodeURIComponent(channel)}`, { method: 'POST' }),
  getQEEGAIClassifyComponents: (analysisId) =>
    apiFetch(`/api/v1/qeeg-ai/${encodeURIComponent(analysisId)}/classify_components`, { method: 'POST' }),
  getQEEGAIClassifySegment: (analysisId, startSec, endSec) =>
    apiFetch(`/api/v1/qeeg-ai/${encodeURIComponent(analysisId)}/classify_segment`, {
      method: 'POST',
      body: JSON.stringify({ start_sec: Number(startSec), end_sec: Number(endSec) }),
    }),
  getQEEGAIRecommendFilters: (analysisId) =>
    apiFetch(`/api/v1/qeeg-ai/${encodeURIComponent(analysisId)}/recommend_filters`, { method: 'POST' }),
  getQEEGAIRecommendMontage: (analysisId) =>
    apiFetch(`/api/v1/qeeg-ai/${encodeURIComponent(analysisId)}/recommend_montage`, { method: 'POST' }),
  getQEEGAISegmentEoEc: (analysisId) =>
    apiFetch(`/api/v1/qeeg-ai/${encodeURIComponent(analysisId)}/segment_eo_ec`, { method: 'POST' }),
  getQEEGAINarrate: (analysisId) =>
    apiFetch(`/api/v1/qeeg-ai/${encodeURIComponent(analysisId)}/narrate`, { method: 'POST' }),

  // Dashboard endpoints
  getDashboardOverview: () => apiFetchWithRetry('/api/v1/dashboard/overview'),
  dashboardSearch: (q) => apiFetch('/api/v1/dashboard/search?q=' + encodeURIComponent(q || '')),

  // ── Clinician Inbox / Notifications Hub (top-of-day workflow surface) ─────
  // Aggregates the HIGH-priority clinician-visible mirror audit rows emitted
  // by every patient-facing launch audit (Patient Messages #347, Adherence
  // Events #350, Home Program Tasks #351, Patient Wearables #352, Wearables
  // Workbench #353). Reads the audit_events table only — no new schema.
  // Acknowledgements are stored as their own audit rows so the regulator
  // audit transcript stays single-sourced. All helpers return null on
  // offline / 404 so the page can render an honest empty state.
  clinicianInboxListItems: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch(`/api/v1/clinician-inbox/items${q ? '?' + q : ''}`).catch(() => null);
  },
  clinicianInboxSummary: () =>
    apiFetch('/api/v1/clinician-inbox/summary').catch(() => null),
  clinicianInboxGetItem: (eventId) =>
    apiFetch(`/api/v1/clinician-inbox/items/${encodeURIComponent(eventId)}`).catch(() => null),
  clinicianInboxAcknowledge: (eventId, note) =>
    apiFetch(`/api/v1/clinician-inbox/items/${encodeURIComponent(eventId)}/acknowledge`, {
      method: 'POST',
      body: JSON.stringify({ note: note || '' }),
    }),
  clinicianInboxBulkAcknowledge: (eventIds, note) =>
    apiFetch('/api/v1/clinician-inbox/items/bulk-acknowledge', {
      method: 'POST',
      body: JSON.stringify({ event_ids: eventIds || [], note: note || '' }),
    }),
  clinicianInboxExportCsvUrl: () =>
    `${API_BASE}/api/v1/clinician-inbox/export.csv`,
  postClinicianInboxAuditEvent: (data) =>
    apiFetch('/api/v1/clinician-inbox/audit-events', {
      method: 'POST',
      body: JSON.stringify(data || {}),
    }).catch(() => null),

  // ── Care Team Coverage launch-audit (2026-04-30) ──────────────────────────
  // pgCareTeamCoverage in pages-knowledge.js calls these helpers; they
  // were defined in #357 but a concurrent session reverted them. The
  // care-team-coverage-launch-audit.test.js asserts each helper name is
  // present in api.js, so restoring them here.
  careTeamCoverageSummary: () =>
    apiFetch('/api/v1/care-team-coverage/summary').catch(() => null),
  careTeamCoverageOncallNow: () =>
    apiFetch('/api/v1/care-team-coverage/oncall-now').catch(() => null),
  careTeamCoverageSlaConfig: () =>
    apiFetch('/api/v1/care-team-coverage/sla-config').catch(() => null),
  careTeamCoverageEscalationChain: () =>
    apiFetch('/api/v1/care-team-coverage/escalation-chain').catch(() => null),
  careTeamCoverageSlaBreaches: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch(`/api/v1/care-team-coverage/sla-breaches${q ? '?' + q : ''}`).catch(() => null);
  },
  careTeamCoverageRoster: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch(`/api/v1/care-team-coverage/roster${q ? '?' + q : ''}`).catch(() => null);
  },
  careTeamCoveragePages: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch(`/api/v1/care-team-coverage/pages${q ? '?' + q : ''}`).catch(() => null);
  },
  careTeamCoverageDeliveryConcerns: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch(`/api/v1/care-team-coverage/delivery-concerns${q ? '?' + q : ''}`).catch(() => null);
  },
  careTeamCoverageUpsertRoster: (body) =>
    apiFetch('/api/v1/care-team-coverage/roster', {
      method: 'POST',
      body: JSON.stringify(body || {}),
    }),
  careTeamCoverageUpsertSla: (body) =>
    apiFetch('/api/v1/care-team-coverage/sla-config', {
      method: 'POST',
      body: JSON.stringify(body || {}),
    }),
  careTeamCoverageUpsertEscalationChain: (body) =>
    apiFetch('/api/v1/care-team-coverage/escalation-chain', {
      method: 'POST',
      body: JSON.stringify(body || {}),
    }),
  careTeamCoveragePageOncall: (auditEventId, body) =>
    apiFetch(
      `/api/v1/care-team-coverage/page-oncall/${encodeURIComponent(auditEventId)}`,
      {
        method: 'POST',
        body: JSON.stringify(body || {}),
      },
    ),
  postCareTeamCoverageAuditEvent: (data) =>
    apiFetch('/api/v1/care-team-coverage/audit-events', {
      method: 'POST',
      body: JSON.stringify(data || {}),
    }).catch(() => null),

  // ── Auto-Page Worker (#367) ───────────────────────────────────────────────
  autoPageWorkerStatus: () =>
    apiFetch('/api/v1/auto-page-worker/status').catch(() => null),
  autoPageWorkerAdapterHealth: () =>
    apiFetch('/api/v1/auto-page-worker/adapters').catch(() => null),
  autoPageWorkerStart: () =>
    apiFetch('/api/v1/auto-page-worker/start', { method: 'POST' }),
  autoPageWorkerStop: () =>
    apiFetch('/api/v1/auto-page-worker/stop', { method: 'POST' }),
  autoPageWorkerTickOnce: () =>
    apiFetch('/api/v1/auto-page-worker/tick-once', { method: 'POST' }),
  autoPageWorkerTestAdapter: (data) =>
    apiFetch('/api/v1/auto-page-worker/test-adapter', {
      method: 'POST',
      body: JSON.stringify(data || {}),
    }),
  postAutoPageWorkerAuditEvent: (data) =>
    apiFetch('/api/v1/auto-page-worker/audit-events', {
      method: 'POST',
      body: JSON.stringify(data || {}),
    }).catch(() => null),

  // ── Escalation Policy (#374) ──────────────────────────────────────────────
  escalationPolicyDispatchOrder: () =>
    apiFetch('/api/v1/escalation-policy/dispatch-order').catch(() => null),
  escalationPolicySurfaceOverrides: () =>
    apiFetch('/api/v1/escalation-policy/surface-overrides').catch(() => null),
  escalationPolicyUserMappings: () =>
    apiFetch('/api/v1/escalation-policy/user-mappings').catch(() => null),
  escalationPolicySetDispatchOrder: (body) =>
    apiFetch('/api/v1/escalation-policy/dispatch-order', {
      method: 'POST',
      body: JSON.stringify(body || {}),
    }),
  escalationPolicySetSurfaceOverrides: (body) =>
    apiFetch('/api/v1/escalation-policy/surface-overrides', {
      method: 'POST',
      body: JSON.stringify(body || {}),
    }),
  escalationPolicySetUserMappings: (body) =>
    apiFetch('/api/v1/escalation-policy/user-mappings', {
      method: 'POST',
      body: JSON.stringify(body || {}),
    }),
  escalationPolicyTest: (body) =>
    apiFetch('/api/v1/escalation-policy/test', {
      method: 'POST',
      body: JSON.stringify(body || {}),
    }),
  postEscalationPolicyAuditEvent: (data) =>
    apiFetch('/api/v1/escalation-policy/audit-events', {
      method: 'POST',
      body: JSON.stringify(data || {}),
    }).catch(() => null),

  // ── Patient Digest launch-audit (2026-05-01) ─────────────────────────────
  // Patient-side daily/weekly digest. pgPatientDigest renders summary +
  // sections pulled from /api/v1/patient-digest/*, plus the caregiver-
  // delivery summary subsection (audit ingestion + per-row failure /
  // concern endpoints). Audit pings flow through the page-level surface
  // ``patient_digest``.
  postPatientDigestAuditEvent: (data) =>
    apiFetch('/api/v1/patient-digest/audit-events', {
      method: 'POST',
      body: JSON.stringify(data || {}),
    }).catch(() => null),
  patientDigestSummary: (range) =>
    apiFetch('/api/v1/patient-digest/summary' + (range ? '?range=' + encodeURIComponent(range) : '')).catch(() => null),
  patientDigestSections: (range) =>
    apiFetch('/api/v1/patient-digest/sections' + (range ? '?range=' + encodeURIComponent(range) : '')).catch(() => null),
  patientDigestSendEmail: (body) =>
    apiFetch('/api/v1/patient-digest/send-email', { method: 'POST', body: JSON.stringify(body || {}) }),
  patientDigestShareCaregiver: (body) =>
    apiFetch('/api/v1/patient-digest/share-caregiver', { method: 'POST', body: JSON.stringify(body || {}) }),
  patientDigestExportCsvUrl: (range) =>
    `${API_BASE}/api/v1/patient-digest/export.csv` + (range ? '?range=' + encodeURIComponent(range) : ''),
  patientDigestExportNdjsonUrl: (range) =>
    `${API_BASE}/api/v1/patient-digest/export.ndjson` + (range ? '?range=' + encodeURIComponent(range) : ''),
  patientDigestCaregiverDeliverySummary: (range) =>
    apiFetch(
      '/api/v1/patient-digest/caregiver-delivery-summary' +
        (range ? '?range=' + encodeURIComponent(range) : ''),
    ).catch(() => null),
  patientDigestCaregiverDeliveryFailures: (range) =>
    apiFetch(
      '/api/v1/patient-digest/caregiver-delivery-failures' +
        (range ? '?range=' + encodeURIComponent(range) : ''),
    ).catch(() => null),
  patientDigestCaregiverDeliveryConcern: (body) =>
    apiFetch('/api/v1/patient-digest/caregiver-delivery-concerns', {
      method: 'POST',
      body: JSON.stringify(body || {}),
    }),

  // ── Caregiver Consent Grants launch-audit (2026-05-01) ──────────────────────
  // Patient grants caregivers scoped read access to digest / messages /
  // reports / wearables. pgPatientCareTeam consumes /grants for the list
  // + /grants/<id> for detail, /grants for create, /grants/<id>/revoke for
  // revoke. Audit pings flow through the page-level surface
  // ``caregiver_consent``.
  caregiverConsentListGrants: (params) => {
    const usp = new URLSearchParams();
    if (params && params.patient_id) usp.set('patient_id', params.patient_id);
    const qs = usp.toString();
    return apiFetch('/api/v1/caregiver-consent/grants' + (qs ? '?' + qs : '')).catch(() => null);
  },
  caregiverConsentGetGrant: (grantId) =>
    apiFetch(`/api/v1/caregiver-consent/grants/${encodeURIComponent(grantId)}`).catch(() => null),
  caregiverConsentCreateGrant: (body) =>
    apiFetch('/api/v1/caregiver-consent/grants', { method: 'POST', body: JSON.stringify(body || {}) }),
  caregiverConsentRevokeGrant: (grantId, body) =>
    apiFetch(`/api/v1/caregiver-consent/grants/${encodeURIComponent(grantId)}/revoke`, { method: 'POST', body: JSON.stringify(body || {}) }),
  postCaregiverConsentAuditEvent: (data) =>
    apiFetch('/api/v1/caregiver-consent/audit-events', { method: 'POST', body: JSON.stringify(data || {}) }).catch(() => null),

  // ── Caregiver Portal launch-audit (2026-05-01) ──────────────────────────
  // Caregiver-side viewer for granted access. pgPatientCaregiver renders
  // the grants list, lets caregivers acknowledge revocations + log
  // per-grant access (View digest / messages / reports), and for the
  // delivery-ack loop confirms receipt of landed digests. All routes
  // scoped to actor.user_id; cross-grant 404. Audit pings flow through
  // the page-level surface ``caregiver_portal`` posted to
  // /audit-events/portal.
  caregiverConsentListByCaregiver: () =>
    apiFetch('/api/v1/caregiver-consent/list-by-caregiver').catch(() => null),
  caregiverPortalAcknowledgeRevocation: (grantId) =>
    apiFetch(
      `/api/v1/caregiver-consent/grants/${encodeURIComponent(grantId)}/acknowledge-revocation`,
      { method: 'POST' },
    ),
  caregiverPortalAccessLog: (grantId, body) =>
    apiFetch(`/api/v1/caregiver-consent/grants/${encodeURIComponent(grantId)}/access-log`, { method: 'POST', body: JSON.stringify(body || {}) }),
  caregiverPortalAcknowledgeDelivery: (grantId, body) =>
    apiFetch(`/api/v1/caregiver-consent/grants/${encodeURIComponent(grantId)}/acknowledge-delivery`, { method: 'POST', body: JSON.stringify(body || {}) }),
  caregiverPortalLastAcknowledgement: (grantId) =>
    apiFetch(`/api/v1/caregiver-consent/grants/${encodeURIComponent(grantId)}/last-acknowledgement`).catch(() => null),
  postCaregiverPortalAuditEvent: (data) =>
    apiFetch('/api/v1/caregiver-consent/audit-events/portal', {
      method: 'POST',
      body: JSON.stringify(data || {}),
    }).catch(() => null),

  // ── Caregiver Notification Hub launch-audit (2026-05-01) ──────────────────
  // Server-side notification feed for caregivers. pgPatientCaregiver
  // consumes /notifications for the feed + /notifications/summary for
  // the unread badge + /notifications/<id>/mark-read per row +
  // /notifications/bulk-mark-read for the "Mark all read" CTA. All
  // routes scoped under /api/v1/caregiver-consent/notifications.
  // notification ids carry stable prefixes: notif-rev-<n>, notif-ack-<n>, notif-aud-<n> — e.g. target_id=notif-rev-123
  caregiverNotificationsList: (params) => {
    const usp = new URLSearchParams();
    if (params && params.unread_only != null) usp.set('unread_only', String(!!params.unread_only));
    if (params && params.limit != null) usp.set('limit', String(params.limit));
    if (params && params.offset != null) usp.set('offset', String(params.offset));
    const qs = usp.toString();
    return apiFetch('/api/v1/caregiver-consent/notifications' + (qs ? '?' + qs : '')).catch(() => null);
  },
  caregiverNotificationsSummary: () =>
    apiFetch('/api/v1/caregiver-consent/notifications/summary').catch(() => null),
  caregiverNotificationsMarkRead: (notifId) =>
    apiFetch(
      `/api/v1/caregiver-consent/notifications/${encodeURIComponent(notifId)}/mark-read`,
      { method: 'POST' },
    ),
  caregiverNotificationsBulkMarkRead: (body) =>
    apiFetch('/api/v1/caregiver-consent/notifications/bulk-mark-read', {
      method: 'POST',
      body: JSON.stringify(body || {}),
    }),

  // ── Caregiver Email Digest launch-audit (2026-05-01) ──────────────────────
  // pgPatientCaregiver's "Daily digest delivery" sub-section calls these
  // helpers; they were defined in #380 but a concurrent session reverted
  // them during the PR #386 merge. Restoring here so the existing
  // caregiver-email-digest tests pass and the new clinic-admin override
  // tab below can reuse them.
  caregiverEmailDigestPreview: () =>
    apiFetch('/api/v1/caregiver-consent/email-digest/preview').catch(() => null),
  caregiverEmailDigestSendNow: () =>
    apiFetch('/api/v1/caregiver-consent/email-digest/send-now', {
      method: 'POST',
    }),
  caregiverEmailDigestPreferencesGet: () =>
    apiFetch('/api/v1/caregiver-consent/email-digest/preferences').catch(() => null),
  caregiverEmailDigestPreferencesPut: (body) =>
    apiFetch('/api/v1/caregiver-consent/email-digest/preferences', {
      method: 'PUT',
      body: JSON.stringify(body || {}),
    }),
  postCaregiverEmailDigestAuditEvent: (data) =>
    apiFetch('/api/v1/caregiver-consent/email-digest/audit-events', {
      method: 'POST',
      body: JSON.stringify(data || {}),
    }).catch(() => null),

  // ── Clinic Caregiver Channel Override launch-audit (2026-05-01) ───────────
  // Clinic-admin surface for caregiver channel preferences. Admin sees
  // every override in their clinic, can pin a misconfigured caregiver
  // back to the clinic chain, and the patient/caregiver UI gets a "Will
  // dispatch via {channel}" preview before send. All routes scoped to
  // actor.clinic_id; cross-clinic 404. See section A of PR
  // feat/clinic-caregiver-channel-override-2026-05-01.
  caregiverEmailDigestClinicPreferences: () =>
    apiFetch('/api/v1/caregiver-consent/email-digest/clinic-preferences').catch(() => null),
  caregiverEmailDigestAdminOverride: (caregiverUserId, note) =>
    apiFetch(
      '/api/v1/caregiver-consent/email-digest/clinic-preferences/' +
        encodeURIComponent(caregiverUserId) +
        '/admin-override',
      {
        method: 'POST',
        body: JSON.stringify({ note: note || '' }),
      },
    ),
  caregiverEmailDigestPreviewDispatch: (caregiverUserId) => {
    const q = caregiverUserId
      ? '?caregiver_user_id=' + encodeURIComponent(caregiverUserId)
      : '';
    return apiFetch(
      '/api/v1/caregiver-consent/email-digest/preview-dispatch' + q,
    ).catch(() => null);
  },

  // ── Channel Misconfiguration Detector launch-audit (2026-05-01) ───────────
  // Closes section I rec from #387. Nightly worker scans every
  // CaregiverDigestPreference row, evaluates adapter_available per row,
  // and emits HIGH-priority caregiver_portal.channel_misconfigured_detected
  // audit rows. The Care Team Coverage "Caregiver channels" tab consumes
  // /status for the worker panel + /tick-once for the admin "Run detector
  // now" CTA. Audit pings flow through the page-level surface
  // ``channel_misconfiguration_detector``.
  channelMisconfigDetectorStatus: () =>
    apiFetch('/api/v1/channel-misconfiguration-detector/status').catch(
      () => null,
    ),
  channelMisconfigDetectorTickOnce: () =>
    apiFetch('/api/v1/channel-misconfiguration-detector/tick-once', {
      method: 'POST',
    }),
  postChannelMisconfigDetectorAuditEvent: (data) =>
    apiFetch('/api/v1/channel-misconfiguration-detector/audit-events', {
      method: 'POST',
      body: JSON.stringify(data || {}),
    }).catch(() => null),
  // end channel-misconfig helpers — see launch-audit test slice boundary `};`

  // ── Clinician Adherence Hub launch-audit (2026-05-01) ─────────────────────
  // Cross-patient triage hub for adherence + side-effect events. The
  // pgClinicianAdherenceHub block consumes /list + /summary for the
  // table + KPI strip, /events/<id> for detail, and /events/<id>/<action>
  // for acknowledge / escalate / resolve mutations. Bulk-acknowledge
  // closes the inbox in batch. Export URLs return the documented server
  // endpoints (no client-side blob assembly). All routes scoped to
  // actor.clinic_id; cross-clinic 404. Audit pings flow through the
  // page-level surface ``clinician_adherence``.
  clinicianAdherenceList: (params) => {
    const usp = new URLSearchParams();
    if (params && params.severity) usp.set('severity', params.severity);
    if (params && params.status) usp.set('status', params.status);
    if (params && params.surface_chip) usp.set('surface_chip', params.surface_chip);
    if (params && params.patient_id) usp.set('patient_id', params.patient_id);
    if (params && params.q) usp.set('q', params.q);
    if (params && params.limit != null) usp.set('limit', String(params.limit));
    if (params && params.offset != null) usp.set('offset', String(params.offset));
    const qs = usp.toString();
    return apiFetch('/api/v1/clinician-adherence/events' + (qs ? '?' + qs : '')).catch(() => null);
  },
  clinicianAdherenceSummary: (params) => {
    const usp = new URLSearchParams();
    if (params && params.patient_id) usp.set('patient_id', params.patient_id);
    const qs = usp.toString();
    return apiFetch('/api/v1/clinician-adherence/summary' + (qs ? '?' + qs : '')).catch(() => null);
  },
  clinicianAdherenceGetEvent: (eventId) =>
    apiFetch(`/api/v1/clinician-adherence/events/${encodeURIComponent(eventId)}`).catch(() => null),
  clinicianAdherenceAcknowledge: (eventId, body) =>
    apiFetch(`/api/v1/clinician-adherence/events/${encodeURIComponent(eventId)}/acknowledge`, {
      method: 'POST',
      body: JSON.stringify(body || {}),
    }),
  clinicianAdherenceEscalate: (eventId, body) =>
    apiFetch(`/api/v1/clinician-adherence/events/${encodeURIComponent(eventId)}/escalate`, {
      method: 'POST',
      body: JSON.stringify(body || {}),
    }),
  clinicianAdherenceResolve: (eventId, body) =>
    apiFetch(`/api/v1/clinician-adherence/events/${encodeURIComponent(eventId)}/resolve`, {
      method: 'POST',
      body: JSON.stringify(body || {}),
    }),
  clinicianAdherenceBulkAcknowledge: (body) =>
    apiFetch('/api/v1/clinician-adherence/events/bulk-acknowledge', {
      method: 'POST',
      body: JSON.stringify(body || {}),
    }),
  clinicianAdherenceExportCsvUrl: () =>
    `${API_BASE}/api/v1/clinician-adherence/events/export.csv`,
  clinicianAdherenceExportNdjsonUrl: () =>
    `${API_BASE}/api/v1/clinician-adherence/events/export.ndjson`,
  postClinicianAdherenceAuditEvent: (data) =>
    apiFetch('/api/v1/clinician-adherence/audit-events', {
      method: 'POST',
      body: JSON.stringify(data || {}),
    }).catch(() => null),

  // ── Clinician Digest launch-audit (2026-05-01) ──────────────────────────────
  // Clinician-side daily digest. pgClinicianDailyDigest consumes
  // /summary for the KPI strip, /sections for the per-surface counts,
  // /events for per-row drill-out, /send-email for the queued email
  // CTA, /share-colleague for the queued share CTA, and the export URLs
  // for CSV / NDJSON downloads. Audit pings flow through the page-level
  // surface ``clinician_digest``.
  clinicianDigestSummary: (params) => {
    const usp = new URLSearchParams(params || {});
    const qs = usp.toString();
    return apiFetch('/api/v1/clinician-digest/summary' + (qs ? '?' + qs : '')).catch(() => null);
  },
  clinicianDigestSections: (params) => {
    const usp = new URLSearchParams(params || {});
    const qs = usp.toString();
    return apiFetch('/api/v1/clinician-digest/sections' + (qs ? '?' + qs : '')).catch(() => null);
  },
  clinicianDigestEvents: (params) => {
    const usp = new URLSearchParams(params || {});
    const qs = usp.toString();
    return apiFetch('/api/v1/clinician-digest/events' + (qs ? '?' + qs : '')).catch(() => null);
  },
  clinicianDigestSendEmail: (body) =>
    apiFetch('/api/v1/clinician-digest/send-email', {
      method: 'POST',
      body: JSON.stringify(body || {}),
    }),
  clinicianDigestShareColleague: (body) =>
    apiFetch('/api/v1/clinician-digest/share-colleague', {
      method: 'POST',
      body: JSON.stringify(body || {}),
    }),
  clinicianDigestExportCsvUrl: (params) => {
    const usp = new URLSearchParams(params || {});
    const qs = usp.toString();
    return `${API_BASE}/api/v1/clinician-digest/export.csv` + (qs ? '?' + qs : '');
  },
  clinicianDigestExportNdjsonUrl: (params) => {
    const usp = new URLSearchParams(params || {});
    const qs = usp.toString();
    return `${API_BASE}/api/v1/clinician-digest/export.ndjson` + (qs ? '?' + qs : '');
  },
  postClinicianDigestAuditEvent: (data) =>
    apiFetch('/api/v1/clinician-digest/audit-events', {
      method: 'POST',
      body: JSON.stringify(data || {}),
    }).catch(() => null),

  // ── Clinician Wellness Hub launch-audit (2026-05-01) ──────────────────────
  // Cross-patient triage hub for wellness check-ins. The
  // pgClinicianWellnessHub block consumes /list + /summary for the
  // table + KPI strip, /checkins/<id> for detail, and
  // /checkins/<id>/<action> for acknowledge / escalate / resolve.
  // Bulk-acknowledge closes the inbox in batch. Export URLs return the
  // documented server endpoints (no client-side blob assembly). All
  // routes scoped to actor.clinic_id; cross-clinic 404. Audit pings
  // flow through the page-level surface ``clinician_wellness``.
  clinicianWellnessList: (params) => {
    const usp = new URLSearchParams();
    if (params && params.severity_band) usp.set('severity_band', params.severity_band);
    if (params && params.axis) usp.set('axis', params.axis);
    if (params && params.surface_chip) usp.set('surface_chip', params.surface_chip);
    if (params && params.clinician_status) usp.set('clinician_status', params.clinician_status);
    if (params && params.patient_id) usp.set('patient_id', params.patient_id);
    if (params && params.q) usp.set('q', params.q);
    if (params && params.limit != null) usp.set('limit', String(params.limit));
    if (params && params.offset != null) usp.set('offset', String(params.offset));
    const qs = usp.toString();
    return apiFetch('/api/v1/clinician-wellness/checkins' + (qs ? '?' + qs : '')).catch(() => null);
  },
  clinicianWellnessSummary: (params) => {
    const usp = new URLSearchParams();
    if (params && params.patient_id) usp.set('patient_id', params.patient_id);
    const qs = usp.toString();
    return apiFetch('/api/v1/clinician-wellness/summary' + (qs ? '?' + qs : '')).catch(() => null);
  },
  clinicianWellnessGetCheckin: (checkinId) =>
    apiFetch(`/api/v1/clinician-wellness/checkins/${encodeURIComponent(checkinId)}`).catch(() => null),
  clinicianWellnessAcknowledge: (checkinId, body) =>
    apiFetch(`/api/v1/clinician-wellness/checkins/${encodeURIComponent(checkinId)}/acknowledge`, {
      method: 'POST',
      body: JSON.stringify(body || {}),
    }),
  clinicianWellnessEscalate: (checkinId, body) =>
    apiFetch(`/api/v1/clinician-wellness/checkins/${encodeURIComponent(checkinId)}/escalate`, {
      method: 'POST',
      body: JSON.stringify(body || {}),
    }),
  clinicianWellnessResolve: (checkinId, body) =>
    apiFetch(`/api/v1/clinician-wellness/checkins/${encodeURIComponent(checkinId)}/resolve`, {
      method: 'POST',
      body: JSON.stringify(body || {}),
    }),
  clinicianWellnessBulkAcknowledge: (body) =>
    apiFetch('/api/v1/clinician-wellness/checkins/bulk-acknowledge', {
      method: 'POST',
      body: JSON.stringify(body || {}),
    }),
  clinicianWellnessExportCsvUrl: () =>
    `${API_BASE}/api/v1/clinician-wellness/checkins/export.csv`,
  clinicianWellnessExportNdjsonUrl: () =>
    `${API_BASE}/api/v1/clinician-wellness/checkins/export.ndjson`,
  postClinicianWellnessAuditEvent: (data) =>
    apiFetch('/api/v1/clinician-wellness/audit-events', {
      method: 'POST',
      body: JSON.stringify(data || {}),
    }).catch(() => null),

  // ── IRB-AMD4 SLA Threshold Tuning launch-audit ──
  // (2026-05-02). Closes section I rec from IRB-AMD3 (#451):
  // surfaces a "what calibration_score floor should auto-trigger
  // an admin reassign-amendment action?" recommendation with a
  // bootstrap confidence interval, supports what-if replay, and
  // persists adopted floors with a clinic-scoped audit log.
  // Mirrors the CSAHP6 (#438) tune-a-threshold console pattern.
  // Helpers placed BEFORE IRB-AMD3's section so IRB-AMD3's
  // slice-boundary sentinel stays clean — IRB-AMD4 uses its own
  // unique header anchor + slice-boundary sentinel.
  fetchReviewerSlaCalibrationCurrentThreshold: () =>
    apiFetch(
      '/api/v1/reviewer-sla-calibration-threshold-tuning/current-threshold',
    ).catch(() => null),
  fetchReviewerSlaCalibrationRecommendation: (params) => {
    const usp = new URLSearchParams();
    if (params && params.window_days != null)
      usp.set('window_days', String(params.window_days));
    if (params && params.sla_response_days != null)
      usp.set('sla_response_days', String(params.sla_response_days));
    const qs = usp.toString();
    return apiFetch(
      '/api/v1/reviewer-sla-calibration-threshold-tuning/recommend' +
        (qs ? '?' + qs : ''),
    ).catch(() => null);
  },
  runReviewerSlaCalibrationReplay: (body) =>
    apiFetch('/api/v1/reviewer-sla-calibration-threshold-tuning/replay', {
      method: 'POST',
      body: JSON.stringify(body || {}),
    }).catch(() => null),
  adoptReviewerSlaCalibrationThreshold: (body) =>
    apiFetch('/api/v1/reviewer-sla-calibration-threshold-tuning/adopt', {
      method: 'POST',
      body: JSON.stringify(body || {}),
    }).catch(() => null),
  fetchReviewerSlaCalibrationAdoptionHistory: (params) => {
    const usp = new URLSearchParams();
    if (params && params.page != null) usp.set('page', String(params.page));
    if (params && params.page_size != null)
      usp.set('page_size', String(params.page_size));
    const qs = usp.toString();
    return apiFetch(
      '/api/v1/reviewer-sla-calibration-threshold-tuning/adoption-history' +
        (qs ? '?' + qs : ''),
    ).catch(() => null);
  },
  fetchReviewerSlaCalibrationAuditEvents: (params) => {
    const usp = new URLSearchParams();
    if (params && params.surface) usp.set('surface', params.surface);
    if (params && params.limit != null) usp.set('limit', String(params.limit));
    if (params && params.offset != null)
      usp.set('offset', String(params.offset));
    const qs = usp.toString();
    return apiFetch(
      '/api/v1/reviewer-sla-calibration-threshold-tuning/audit-events' +
        (qs ? '?' + qs : ''),
    ).catch(() => null);
  },
  postReviewerSlaCalibrationAuditEvent: (data) =>
    apiFetch(
      '/api/v1/reviewer-sla-calibration-threshold-tuning/audit-events',
      {
        method: 'POST',
        body: JSON.stringify(data || {}),
      },
    ).catch(() => null),
  // end IRB-AMD4 helpers
  // ━━ IRB-AMD4 SLICE BOUNDARY ━━ (do not remove; the launch-audit
  // test for the IRB-AMD4 section finds the header above then walks
  // to this unique sentinel substring to bound the slice).

  // ── IRB-AMD3 SLA Outcome Tracker launch-audit ──
  // (2026-05-02). Closes the loop on "did the IRB-AMD2 SLA-breach
  // signal actually nudge reviewer behavior?" Pairs each
  // irb_reviewer_sla.queue_breach_detected row at time T with the
  // same reviewer's NEXT irb.amendment_decided_* row, classifies
  // outcome (decided_within_sla / decided_late / still_pending /
  // pending), computes per-reviewer calibration_score =
  // (decided_within_sla - still_pending) / max(total - pending, 1).
  // Helpers placed BEFORE IRB-AMD2's section so IRB-AMD2's
  // slice-boundary sentinel stays clean — IRB-AMD3 uses its own
  // unique header anchor + slice-boundary sentinel.
  fetchSLAOutcomeSummary: (params) => {
    const usp = new URLSearchParams();
    if (params && params.window_days != null)
      usp.set('window_days', String(params.window_days));
    if (params && params.sla_response_days != null)
      usp.set('sla_response_days', String(params.sla_response_days));
    const qs = usp.toString();
    return apiFetch(
      '/api/v1/irb-amendment-reviewer-workload-outcome-tracker/summary' +
        (qs ? '?' + qs : ''),
    ).catch(() => null);
  },
  fetchReviewerCalibration: (params) => {
    const usp = new URLSearchParams();
    if (params && params.window_days != null)
      usp.set('window_days', String(params.window_days));
    if (params && params.sla_response_days != null)
      usp.set('sla_response_days', String(params.sla_response_days));
    if (params && params.min_breaches != null)
      usp.set('min_breaches', String(params.min_breaches));
    const qs = usp.toString();
    return apiFetch(
      '/api/v1/irb-amendment-reviewer-workload-outcome-tracker/reviewer-calibration' +
        (qs ? '?' + qs : ''),
    ).catch(() => null);
  },
  fetchSLAOutcomeList: (params) => {
    const usp = new URLSearchParams();
    if (params && params.window_days != null)
      usp.set('window_days', String(params.window_days));
    if (params && params.sla_response_days != null)
      usp.set('sla_response_days', String(params.sla_response_days));
    if (params && params.reviewer_user_id)
      usp.set('reviewer_user_id', params.reviewer_user_id);
    if (params && params.outcome) usp.set('outcome', params.outcome);
    if (params && params.page != null) usp.set('page', String(params.page));
    if (params && params.page_size != null)
      usp.set('page_size', String(params.page_size));
    const qs = usp.toString();
    return apiFetch(
      '/api/v1/irb-amendment-reviewer-workload-outcome-tracker/list' +
        (qs ? '?' + qs : ''),
    ).catch(() => null);
  },
  fetchSLAOutcomeAuditEvents: (params) => {
    const usp = new URLSearchParams();
    if (params && params.surface) usp.set('surface', params.surface);
    if (params && params.limit != null) usp.set('limit', String(params.limit));
    if (params && params.offset != null)
      usp.set('offset', String(params.offset));
    const qs = usp.toString();
    return apiFetch(
      '/api/v1/irb-amendment-reviewer-workload-outcome-tracker/audit-events' +
        (qs ? '?' + qs : ''),
    ).catch(() => null);
  },
  // end IRB-AMD3 helpers
  // ━━ IRB-AMD3 SLICE BOUNDARY ━━ (do not remove; the launch-audit
  // test for the IRB-AMD3 section finds the header above then walks
  // to this unique sentinel substring to bound the slice).

  // ── IRB-AMD2 Reviewer Workload launch-audit ──
  // (2026-05-02). Closes "workflow exists" → "workflow has SLA
  // enforcement". The IRB-AMD1 amendment workflow shipped a
  // regulator-credible lifecycle but no SLA enforcement. IRB-AMD2
  // adds per-reviewer queue snapshots, an unassigned-amendments
  // bucket, and a HIGH-priority queue_breach_detected audit row
  // routed into the existing Clinician Inbox aggregator (#354) via
  // the priority=high token. No new aggregation logic.
  // Helpers placed BEFORE IRB-AMD1's section so IRB-AMD1's
  // slice-boundary sentinel stays clean — IRB-AMD2 uses its own
  // unique header anchor + slice-boundary sentinel.
  irbAmd2Workload: (params) => {
    const usp = new URLSearchParams();
    if (params && params.clinic_id) usp.set('clinic_id', params.clinic_id);
    const qs = usp.toString();
    return apiFetch(
      '/api/v1/irb-amendment-reviewer-workload/workload' + (qs ? '?' + qs : ''),
    ).catch(() => null);
  },
  irbAmd2Unassigned: (params) => {
    const usp = new URLSearchParams();
    if (params && params.clinic_id) usp.set('clinic_id', params.clinic_id);
    if (params && params.limit != null) usp.set('limit', String(params.limit));
    const qs = usp.toString();
    return apiFetch(
      '/api/v1/irb-amendment-reviewer-workload/unassigned-amendments' +
        (qs ? '?' + qs : ''),
    ).catch(() => null);
  },
  irbAmd2SuggestReviewer: (amendmentId) => {
    const qs = new URLSearchParams({ amendment_id: amendmentId }).toString();
    return apiFetch(
      '/api/v1/irb-amendment-reviewer-workload/suggest-reviewer?' + qs,
    ).catch(() => null);
  },
  irbAmd2WorkerTick: () =>
    apiFetch('/api/v1/irb-amendment-reviewer-workload/worker/tick', {
      method: 'POST',
      body: JSON.stringify({}),
    }).catch(() => null),
  irbAmd2WorkerStatus: () =>
    apiFetch(
      '/api/v1/irb-amendment-reviewer-workload/worker/status',
    ).catch(() => null),
  irbAmd2AuditEvents: (params) => {
    const usp = new URLSearchParams();
    if (params && params.surface) usp.set('surface', params.surface);
    if (params && params.limit != null) usp.set('limit', String(params.limit));
    if (params && params.offset != null)
      usp.set('offset', String(params.offset));
    const qs = usp.toString();
    return apiFetch(
      '/api/v1/irb-amendment-reviewer-workload/audit-events' +
        (qs ? '?' + qs : ''),
    ).catch(() => null);
  },
  // end IRB-AMD2 helpers
  // ━━ IRB-AMD2 SLICE BOUNDARY ━━ (do not remove; the launch-audit
  // test for the IRB-AMD2 section finds the header above then walks
  // to this unique sentinel substring to bound the slice).

  // ── IRB-AMD1 Amendment Workflow launch-audit ──
  // (2026-05-02). Real-world clinical trials hit amendment cycles every
  // 4-6 weeks; the existing IRB Manager amendments tab only logged a
  // single 3-state row. IRB-AMD1 introduces the regulator-credible
  // lifecycle: draft → submitted → reviewer_assigned → under_review →
  // approved | rejected | revisions_requested → effective. Plus a
  // reg-binder ZIP export bundling protocol + amendments + audit trail.
  // Helpers placed BEFORE CSAHP7's section so the CSAHP7 slice-boundary
  // sentinel stays clean — IRB-AMD1 uses its own unique header anchor
  // + slice-boundary sentinel.
  irbAmdCreateDraft: (body) =>
    apiFetch('/api/v1/irb-amendment-workflow/amendments', {
      method: 'POST',
      body: JSON.stringify(body || {}),
    }),
  irbAmdSubmit: (id) =>
    apiFetch(`/api/v1/irb-amendment-workflow/amendments/${encodeURIComponent(id)}/submit`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  irbAmdAssignReviewer: (id, body) =>
    apiFetch(
      `/api/v1/irb-amendment-workflow/amendments/${encodeURIComponent(id)}/assign-reviewer`,
      { method: 'POST', body: JSON.stringify(body || {}) }
    ),
  irbAmdStartReview: (id) =>
    apiFetch(
      `/api/v1/irb-amendment-workflow/amendments/${encodeURIComponent(id)}/start-review`,
      { method: 'POST', body: JSON.stringify({}) }
    ),
  irbAmdDecide: (id, body) =>
    apiFetch(`/api/v1/irb-amendment-workflow/amendments/${encodeURIComponent(id)}/decide`, {
      method: 'POST',
      body: JSON.stringify(body || {}),
    }),
  irbAmdMarkEffective: (id) =>
    apiFetch(
      `/api/v1/irb-amendment-workflow/amendments/${encodeURIComponent(id)}/mark-effective`,
      { method: 'POST', body: JSON.stringify({}) }
    ),
  irbAmdRevertToDraft: (id) =>
    apiFetch(
      `/api/v1/irb-amendment-workflow/amendments/${encodeURIComponent(id)}/revert-to-draft`,
      { method: 'POST', body: JSON.stringify({}) }
    ),
  irbAmdList: (params) => {
    const usp = new URLSearchParams();
    if (params && params.protocol_id) usp.set('protocol_id', params.protocol_id);
    if (params && params.status) usp.set('status', params.status);
    if (params && params.page != null) usp.set('page', String(params.page));
    if (params && params.page_size != null) usp.set('page_size', String(params.page_size));
    const qs = usp.toString();
    return apiFetch('/api/v1/irb-amendment-workflow/amendments' + (qs ? '?' + qs : '')).catch(
      () => null,
    );
  },
  irbAmdGetDetail: (id) =>
    apiFetch(`/api/v1/irb-amendment-workflow/amendments/${encodeURIComponent(id)}`).catch(
      () => null,
    ),
  irbAmdGetAuditTrail: (id) =>
    apiFetch(
      `/api/v1/irb-amendment-workflow/amendments/${encodeURIComponent(id)}/audit-trail`,
    ).catch(() => null),
  irbAmdRegBinderUrl: (protocolId) =>
    `${API_BASE}/api/v1/irb-amendment-workflow/protocols/${encodeURIComponent(protocolId)}/reg-binder.zip`,
  irbAmdAuditEvents: (params) => {
    const usp = new URLSearchParams();
    if (params && params.surface) usp.set('surface', params.surface);
    if (params && params.limit != null) usp.set('limit', String(params.limit));
    if (params && params.offset != null) usp.set('offset', String(params.offset));
    const qs = usp.toString();
    return apiFetch(
      '/api/v1/irb-amendment-workflow/audit-events' + (qs ? '?' + qs : ''),
    ).catch(() => null);
  },
  postIrbAmdAuditEvent: (data) =>
    apiFetch('/api/v1/irb-amendment-workflow/audit-events', {
      method: 'POST',
      body: JSON.stringify(data || {}),
    }).catch(() => null),
  // end IRB-AMD1 helpers
  // ━━ IRB-AMD1 SLICE BOUNDARY ━━ (do not remove; the launch-audit
  // test for the IRB-AMD1 section finds the header above then walks to
  // this unique sentinel substring to bound the slice).

  // ── CSAHP7 Threshold Adoption Outcome launch-audit ──
  // (2026-05-02). Closes the meta-loop on the meta-loop opened by
  // CSAHP6 (#438). Pairs each threshold_adopted audit row at time T
  // with the same (advice_code, threshold_key)'s measured predictive
  // accuracy at T+30d versus the baseline accuracy at T. Did the
  // adopted threshold actually move the needle in production?
  // Outcome classes: improved (delta >= +5pp) / regressed (<= -5pp) /
  // flat / pending / insufficient_data. Per-adopter calibration_score
  // = (improved - regressed) / max(total, 1), range -1 to 1. Helpers
  // placed BEFORE CSAHP6's section so the CSAHP6 slice-boundary
  // sentinel stays clean — CSAHP7 uses its own unique header anchor +
  // slice-boundary sentinel.
  fetchThresholdAdoptionOutcomeSummary: (params) => {
    const usp = new URLSearchParams();
    if (params && params.window_days != null)
      usp.set('window_days', String(params.window_days));
    if (params && params.pair_lookahead_days != null)
      usp.set('pair_lookahead_days', String(params.pair_lookahead_days));
    const qs = usp.toString();
    const path =
      '/api/v1/rotation-policy-advisor-threshold-adoption-outcome-tracker/summary' +
      (qs ? '?' + qs : '');
    return apiFetch(path).catch(() => null);
  },
  fetchAdopterCalibration: (params) => {
    const usp = new URLSearchParams();
    if (params && params.window_days != null)
      usp.set('window_days', String(params.window_days));
    if (params && params.pair_lookahead_days != null)
      usp.set('pair_lookahead_days', String(params.pair_lookahead_days));
    if (params && params.min_adoptions != null)
      usp.set('min_adoptions', String(params.min_adoptions));
    const qs = usp.toString();
    const path =
      '/api/v1/rotation-policy-advisor-threshold-adoption-outcome-tracker/adopter-calibration' +
      (qs ? '?' + qs : '');
    return apiFetch(path).catch(() => null);
  },
  fetchThresholdAdoptionOutcomeList: (params) => {
    const usp = new URLSearchParams();
    if (params && params.window_days != null)
      usp.set('window_days', String(params.window_days));
    if (params && params.pair_lookahead_days != null)
      usp.set('pair_lookahead_days', String(params.pair_lookahead_days));
    if (params && params.advice_code) usp.set('advice_code', params.advice_code);
    if (params && params.outcome) usp.set('outcome', params.outcome);
    if (params && params.page != null) usp.set('page', String(params.page));
    if (params && params.page_size != null)
      usp.set('page_size', String(params.page_size));
    const qs = usp.toString();
    const path =
      '/api/v1/rotation-policy-advisor-threshold-adoption-outcome-tracker/list' +
      (qs ? '?' + qs : '');
    return apiFetch(path).catch(() => null);
  },
  fetchThresholdAdoptionOutcomeAuditEvents: (params) => {
    const usp = new URLSearchParams();
    if (params && params.surface) usp.set('surface', params.surface);
    if (params && params.limit != null) usp.set('limit', String(params.limit));
    if (params && params.offset != null) usp.set('offset', String(params.offset));
    const qs = usp.toString();
    const path =
      '/api/v1/rotation-policy-advisor-threshold-adoption-outcome-tracker/audit-events' +
      (qs ? '?' + qs : '');
    return apiFetch(path).catch(() => null);
  },
  postThresholdAdoptionOutcomeAuditEvent: (data) =>
    apiFetch('/api/v1/rotation-policy-advisor-threshold-adoption-outcome-tracker/audit-events', {
      method: 'POST',
      body: JSON.stringify(data || {}),
    }).catch(() => null),
  // end CSAHP7 helpers
  // ━━ CSAHP7 SLICE BOUNDARY ━━ (do not remove; the launch-audit
  // test for the CSAHP7 section finds the header above then walks to
  // this unique sentinel substring to bound the slice).

  // ── CSAHP6 Threshold Tuning launch-audit ──
  // (2026-05-02). Closes the recursion loop opened by CSAHP5 (#434).
  // Lets admins propose new thresholds for the 3 advice rules
  // (REFLAG_HIGH / MANUAL_REFLAG / AUTH_DOMINANT), replay them
  // against the last 90 days of frozen ``advice_snapshot`` rows, and
  // adopt the new threshold when the replay shows higher predictive
  // accuracy. Adopted values take effect immediately on the next
  // CSAHP4 ``/advice`` call. Same calibration chain logic, applied
  // recursively to the heuristic itself. Helpers placed BEFORE
  // CSAHP5's section so the CSAHP5 slice-boundary sentinel stays
  // clean — CSAHP6 uses its own unique header anchor + slice-boundary
  // sentinel.
  fetchCurrentThresholds: () =>
    apiFetch('/api/v1/rotation-policy-advisor-threshold-tuning/current-thresholds')
      .catch(() => null),
  runThresholdReplay: (params) =>
    apiFetch('/api/v1/rotation-policy-advisor-threshold-tuning/replay', {
      method: 'POST',
      body: JSON.stringify(params || {}),
    }).catch(() => null),
  adoptThreshold: (params) =>
    apiFetch('/api/v1/rotation-policy-advisor-threshold-tuning/adopt', {
      method: 'POST',
      body: JSON.stringify(params || {}),
    }),
  fetchThresholdAdoptionHistory: (params) => {
    const usp = new URLSearchParams();
    if (params && params.limit != null) usp.set('limit', String(params.limit));
    if (params && params.offset != null) usp.set('offset', String(params.offset));
    const qs = usp.toString();
    const path =
      '/api/v1/rotation-policy-advisor-threshold-tuning/adoption-history' +
      (qs ? '?' + qs : '');
    return apiFetch(path).catch(() => null);
  },
  fetchThresholdTuningAuditEvents: (params) => {
    const usp = new URLSearchParams();
    if (params && params.surface) usp.set('surface', params.surface);
    if (params && params.limit != null) usp.set('limit', String(params.limit));
    if (params && params.offset != null) usp.set('offset', String(params.offset));
    const qs = usp.toString();
    const path =
      '/api/v1/rotation-policy-advisor-threshold-tuning/audit-events' +
      (qs ? '?' + qs : '');
    return apiFetch(path).catch(() => null);
  },
  postThresholdTuningAuditEvent: (data) =>
    apiFetch('/api/v1/rotation-policy-advisor-threshold-tuning/audit-events', {
      method: 'POST',
      body: JSON.stringify(data || {}),
    }).catch(() => null),
  // end CSAHP6 helpers
  // ━━ CSAHP6 SLICE BOUNDARY ━━ (do not remove; the launch-audit
  // test for the CSAHP6 section finds the header above then walks to
  // this unique sentinel substring to bound the slice).

  // ── CSAHP5 Advisor Outcome Tracker launch-audit ──
  // (2026-05-02). Pairs each ``advice_snapshot`` audit row at time T
  // (emitted by the CSAHP5 background snapshot worker) with the
  // same-key snapshot at T+14d (±2d tolerance) and reports
  // per-advice-code predictive accuracy
  // (card_disappeared_pct = how often the card stopped appearing 14
  // days after the clinic acted on it). Mirrors the DCRO1 pattern
  // (#393) — pure read-side calibration analytics on top of the
  // existing audit_event_records table. Helpers placed BEFORE CSAHP4's
  // section so the CSAHP4 slice-boundary sentinel stays clean — CSAHP5
  // uses its own unique header anchor + slice-boundary sentinel.
  fetchAdvisorOutcomeTrackerSummary: (params) => {
    const usp = new URLSearchParams();
    if (params && params.window_days != null)
      usp.set('window_days', String(params.window_days));
    if (params && params.pair_lookahead_days != null)
      usp.set('pair_lookahead_days', String(params.pair_lookahead_days));
    const qs = usp.toString();
    const path =
      '/api/v1/rotation-policy-advisor-outcome-tracker/summary' +
      (qs ? '?' + qs : '');
    return apiFetch(path).catch(() => null);
  },
  fetchAdvisorOutcomeTrackerList: (params) => {
    const usp = new URLSearchParams();
    if (params && params.window_days != null)
      usp.set('window_days', String(params.window_days));
    if (params && params.pair_lookahead_days != null)
      usp.set('pair_lookahead_days', String(params.pair_lookahead_days));
    if (params && params.advice_code) usp.set('advice_code', params.advice_code);
    if (params && params.channel) usp.set('channel', params.channel);
    if (params && params.page != null) usp.set('page', String(params.page));
    if (params && params.page_size != null)
      usp.set('page_size', String(params.page_size));
    const qs = usp.toString();
    const path =
      '/api/v1/rotation-policy-advisor-outcome-tracker/list' +
      (qs ? '?' + qs : '');
    return apiFetch(path).catch(() => null);
  },
  runAdvisorSnapshotNow: () =>
    apiFetch('/api/v1/rotation-policy-advisor-outcome-tracker/run-snapshot-now', {
      method: 'POST',
      body: JSON.stringify({}),
    }).catch(() => null),
  fetchAdvisorOutcomeTrackerAuditEvents: (params) => {
    const usp = new URLSearchParams();
    if (params && params.surface) usp.set('surface', params.surface);
    if (params && params.limit != null) usp.set('limit', String(params.limit));
    if (params && params.offset != null) usp.set('offset', String(params.offset));
    const qs = usp.toString();
    const path =
      '/api/v1/rotation-policy-advisor-outcome-tracker/audit-events' +
      (qs ? '?' + qs : '');
    return apiFetch(path).catch(() => null);
  },
  postAdvisorOutcomeTrackerAuditEvent: (data) =>
    apiFetch('/api/v1/rotation-policy-advisor-outcome-tracker/audit-events', {
      method: 'POST',
      body: JSON.stringify(data || {}),
    }).catch(() => null),
  // end CSAHP5 helpers
  // ━━ CSAHP5 SLICE BOUNDARY ━━ (do not remove; the launch-audit
  // test for the CSAHP5 section finds the header above then walks to
  // this unique sentinel substring to bound the slice).

  // ── CSAHP4 Rotation Policy Advisor launch-audit ──
  // (2026-05-02). Read-only advisor surface that consumes the
  // leading-indicator signals already exposed by CSAHP3 (#424) and
  // emits heuristic recommendation cards (REFLAG_HIGH /
  // MANUAL_REFLAG / AUTH_DOMINANT). No new schema, no worker — pure
  // presentation building on the leading-indicator signal CSAHP3
  // already exposes. Mirrors the DCRO5 / CSAHP3 read-only advisor
  // pattern. Helpers placed BEFORE CSAHP3's section so the CSAHP3
  // slice-boundary sentinel stays clean — CSAHP4 uses its own unique
  // header anchor + slice-boundary sentinel.
  fetchRotationPolicyAdvice: (params) => {
    const usp = new URLSearchParams();
    if (params && params.window_days != null)
      usp.set('window_days', String(params.window_days));
    const qs = usp.toString();
    const path =
      '/api/v1/auth-drift-rotation-policy-advisor/advice' +
      (qs ? '?' + qs : '');
    return apiFetch(path).catch(() => null);
  },
  fetchRotationPolicyAdvisorAuditEvents: (params) => {
    const usp = new URLSearchParams();
    if (params && params.surface) usp.set('surface', params.surface);
    if (params && params.limit != null) usp.set('limit', String(params.limit));
    if (params && params.offset != null) usp.set('offset', String(params.offset));
    const qs = usp.toString();
    const path =
      '/api/v1/auth-drift-rotation-policy-advisor/audit-events' +
      (qs ? '?' + qs : '');
    return apiFetch(path).catch(() => null);
  },
  postRotationPolicyAdvisorAuditEvent: (data) =>
    apiFetch('/api/v1/auth-drift-rotation-policy-advisor/audit-events', {
      method: 'POST',
      body: JSON.stringify(data || {}),
    }).catch(() => null),
  // end CSAHP4 helpers
  // ━━ CSAHP4 SLICE BOUNDARY ━━ (do not remove; the launch-audit
  // test for the CSAHP4 section finds the header above then walks to
  // this unique sentinel substring to bound the slice).

  // ── CSAHP3 Auth Drift Resolution Audit Hub launch-audit ──
  // (2026-05-02). Cohort dashboard built on the audit trail emitted by
  // CSAHP1 (#417) and CSAHP2 (#422). Mirrors the DCR2 → DCRO1 pattern
  // (#392 / #393): pure read-side analytics, no migration, no worker.
  // Surfaces:
  //   - rotation_funnel: detected → marked → confirmed → re-flagged
  //   - rotation_funnel_pct: marked_pct / confirmed_pct / re_flag_pct
  //   - rotation_method_distribution: manual / automated_rotation /
  //     key_revoked / other
  //   - by_channel: per-channel mean / median time-to-rotate +
  //     time-to-confirm + re-flag rate
  //   - top-rotators: leaderboard of rotators by count + median TTR
  // Helpers placed BEFORE CSAHP2's section so the CSAHP2 slice-boundary
  // sentinel stays clean — CSAHP3 uses its own unique header anchor +
  // slice-boundary sentinel.
  fetchAuthDriftResolutionAuditHubSummary: (params) => {
    const usp = new URLSearchParams();
    if (params && params.window_days != null)
      usp.set('window_days', String(params.window_days));
    const qs = usp.toString();
    const path =
      '/api/v1/channel-auth-drift-resolution-audit-hub/summary' +
      (qs ? '?' + qs : '');
    return apiFetch(path).catch(() => null);
  },
  fetchAuthDriftTopRotators: (params) => {
    const usp = new URLSearchParams();
    if (params && params.window_days != null)
      usp.set('window_days', String(params.window_days));
    if (params && params.min_rotations != null)
      usp.set('min_rotations', String(params.min_rotations));
    const qs = usp.toString();
    const path =
      '/api/v1/channel-auth-drift-resolution-audit-hub/top-rotators' +
      (qs ? '?' + qs : '');
    return apiFetch(path).catch(() => null);
  },
  fetchAuthDriftResolutionAuditHubAuditEvents: (params) => {
    const usp = new URLSearchParams();
    if (params && params.surface) usp.set('surface', params.surface);
    if (params && params.limit != null) usp.set('limit', String(params.limit));
    if (params && params.offset != null) usp.set('offset', String(params.offset));
    const qs = usp.toString();
    const path =
      '/api/v1/channel-auth-drift-resolution-audit-hub/audit-events' +
      (qs ? '?' + qs : '');
    return apiFetch(path).catch(() => null);
  },
  postAuthDriftResolutionAuditHubAuditEvent: (data) =>
    apiFetch('/api/v1/channel-auth-drift-resolution-audit-hub/audit-events', {
      method: 'POST',
      body: JSON.stringify(data || {}),
    }).catch(() => null),
  // end CSAHP3 helpers
  // ━━ CSAHP3 SLICE BOUNDARY ━━ (do not remove; the launch-audit test
  // for the CSAHP3 section finds the header above then walks to this
  // unique sentinel substring to bound the slice).

  // ── CSAHP2 Auth Drift Resolution launch-audit ──
  // (2026-05-02). Closes the proactive-credential-monitoring loop opened
  // by CSAHP1 (#417). Admin marks an auth_drift_detected row as rotated
  // (with rotation_method + rotation_note); the CSAHP1 worker
  // confirmation hook pairs the rotation with the next successful probe
  // within 24h and emits auth_drift_resolved_confirmed when the cycle
  // closes. Mirrors the DCA → DCR loop (#392 → #393).
  // Helpers placed BEFORE CSAHP1's section so the CSAHP1 slice-boundary
  // sentinel stays clean — CSAHP2 uses its own unique header anchor +
  // slice-boundary sentinel.
  markAuthDriftRotated: (body) =>
    apiFetch('/api/v1/channel-auth-drift-resolution/mark-rotated', {
      method: 'POST',
      body: JSON.stringify(body || {}),
    }),
  fetchAuthDriftList: (params) => {
    const usp = new URLSearchParams();
    if (params && params.status) usp.set('status', params.status);
    if (params && params.channel) usp.set('channel', params.channel);
    if (params && params.page != null) usp.set('page', String(params.page));
    if (params && params.page_size != null)
      usp.set('page_size', String(params.page_size));
    const qs = usp.toString();
    const path =
      '/api/v1/channel-auth-drift-resolution/list' + (qs ? '?' + qs : '');
    return apiFetch(path).catch(() => null);
  },
  fetchAuthDriftResolutionAuditEvents: (params) => {
    const usp = new URLSearchParams();
    if (params && params.surface) usp.set('surface', params.surface);
    if (params && params.limit != null) usp.set('limit', String(params.limit));
    if (params && params.offset != null) usp.set('offset', String(params.offset));
    const qs = usp.toString();
    const path =
      '/api/v1/channel-auth-drift-resolution/audit-events' +
      (qs ? '?' + qs : '');
    return apiFetch(path).catch(() => null);
  },
  // end CSAHP2 helpers
  // ━━ CSAHP2 SLICE BOUNDARY ━━ (do not remove; the launch-audit test
  // for the CSAHP2 section finds the header above then walks to this
  // unique sentinel substring to bound the slice).

  // ── CSAHP1 Channel Auth Health Probe launch-audit ──
  // (2026-05-02). Proactively probes each clinic's configured adapter
  // credentials (Slack OAuth, SendGrid API key, Twilio account auth,
  // PagerDuty token) and emits an auth_drift_detected audit row BEFORE
  // the next digest dispatch fails. The DCRO5 drilldown's auth-health
  // section consumes:
  //   - status: per-channel {status, last_probed_at, error_class} grid
  //     + enabled flag for the worker disclaimer.
  //   - tick: admin-only one-shot probe (body optional {channel}).
  //   - audit-events: paginated, scoped audit-event list (surface=
  //     channel_auth_health_probe).
  // Helpers placed BEFORE DCRO5's section so the DCRO5 slice-boundary
  // sentinel stays clean — CSAHP1 uses its own unique header anchor +
  // slice-boundary sentinel.
  fetchChannelAuthHealthStatus: () =>
    apiFetch('/api/v1/channel-auth-health-probe/status').catch(() => null),
  tickChannelAuthHealthProbe: (body) =>
    apiFetch('/api/v1/channel-auth-health-probe/tick', {
      method: 'POST',
      body: JSON.stringify(body || {}),
    }),
  fetchChannelAuthHealthAuditEvents: (params) => {
    const usp = new URLSearchParams();
    if (params && params.surface) usp.set('surface', params.surface);
    if (params && params.limit != null) usp.set('limit', String(params.limit));
    if (params && params.offset != null) usp.set('offset', String(params.offset));
    const qs = usp.toString();
    const path =
      '/api/v1/channel-auth-health-probe/audit-events' +
      (qs ? '?' + qs : '');
    return apiFetch(path).catch(() => null);
  },
  // end CSAHP1 helpers
  // ━━ CSAHP1 SLICE BOUNDARY ━━ (do not remove; the launch-audit test
  // for the CSAHP1 section finds the header above then walks to this
  // unique sentinel substring to bound the slice).

  // ── DCRO5 Delivery Failure Drilldown launch-audit ──
  // (2026-05-02). Operational drill-down over the DCRO3 dispatched audit
  // row stream filtered to delivery_status=failed and grouped by (channel,
  // error_class). Three reads:
  //   - summary: per-channel + per-error-class breakdown, top-5 leaderboard,
  //     weekly-trend bucket series.
  //   - list: paginated failed-dispatches with has_matching_misconfig_flag
  //     (the click-through anchor for the Channel Misconfig Detector).
  //   - audit-events: paginated, scoped audit-event list.
  // Read-only — no companion worker. Helpers placed BEFORE DCRO4's section
  // so the DCRO4 slice-boundary sentinel stays clean — DCRO5 uses its own
  // unique header anchor + slice-boundary sentinel.
  fetchDigestDeliveryFailureSummary: (params) => {
    const usp = new URLSearchParams();
    if (params && params.window_days != null) usp.set('window_days', String(params.window_days));
    const qs = usp.toString();
    const path =
      '/api/v1/coaching-digest-delivery-failure-drilldown/summary' +
      (qs ? '?' + qs : '');
    return apiFetch(path);
  },
  fetchDigestDeliveryFailureList: (params) => {
    const usp = new URLSearchParams();
    if (params && params.channel) usp.set('channel', String(params.channel));
    if (params && params.error_class) usp.set('error_class', String(params.error_class));
    if (params && params.start) usp.set('start', String(params.start));
    if (params && params.end) usp.set('end', String(params.end));
    if (params && params.page != null) usp.set('page', String(params.page));
    if (params && params.page_size != null) usp.set('page_size', String(params.page_size));
    const qs = usp.toString();
    const path =
      '/api/v1/coaching-digest-delivery-failure-drilldown/list' +
      (qs ? '?' + qs : '');
    return apiFetch(path);
  },
  fetchDigestDeliveryFailureAuditEvents: (params) => {
    const usp = new URLSearchParams();
    if (params && params.surface) usp.set('surface', params.surface);
    if (params && params.limit != null) usp.set('limit', String(params.limit));
    if (params && params.offset != null) usp.set('offset', String(params.offset));
    const qs = usp.toString();
    const path =
      '/api/v1/coaching-digest-delivery-failure-drilldown/audit-events' +
      (qs ? '?' + qs : '');
    return apiFetch(path).catch(() => null);
  },
  postDigestDeliveryFailureAuditEvent: (data) =>
    apiFetch('/api/v1/coaching-digest-delivery-failure-drilldown/audit-events', {
      method: 'POST',
      body: JSON.stringify(data || {}),
    }).catch(() => null),
  // end DCRO5 helpers
  // ━━ DCRO5 SLICE BOUNDARY ━━ (do not remove; the launch-audit test
  // for the DCRO5 section finds the header above then walks to this
  // unique sentinel substring to bound the slice).
  // ── DCRO4 Resolver Coaching Digest Audit Hub launch-audit ──
  // (2026-05-02). Admin cohort dashboard over the DCRO3 dispatched audit
  // row stream + ResolverCoachingDigestPreference table. Three reads:
  //   - summary: opt-in / dispatch-by-channel / delivery / weekly trend
  //   - resolver-trajectory: per opted-in resolver weekly wrong-call
  //     backlog with shrinking/flat/growing classification
  //   - audit-events: paginated, scoped audit-event list
  // Read-only — no companion worker. Helpers placed BEFORE DCRO3's section
  // so the DCRO3 slice-boundary sentinel below stays clean — DCRO4 uses
  // its own unique header anchor + slice-boundary sentinel.
  fetchCoachingDigestAuditHubSummary: (params) => {
    const usp = new URLSearchParams();
    if (params && params.window_days != null) usp.set('window_days', String(params.window_days));
    const qs = usp.toString();
    const path =
      '/api/v1/resolver-coaching-digest-audit-hub/summary' +
      (qs ? '?' + qs : '');
    return apiFetch(path);
  },
  fetchResolverTrajectory: (params) => {
    const usp = new URLSearchParams();
    if (params && params.window_days != null) usp.set('window_days', String(params.window_days));
    const qs = usp.toString();
    const path =
      '/api/v1/resolver-coaching-digest-audit-hub/resolver-trajectory' +
      (qs ? '?' + qs : '');
    return apiFetch(path);
  },
  fetchCoachingDigestAuditEvents: (params) => {
    const usp = new URLSearchParams();
    if (params && params.surface) usp.set('surface', params.surface);
    if (params && params.limit != null) usp.set('limit', String(params.limit));
    if (params && params.offset != null) usp.set('offset', String(params.offset));
    const qs = usp.toString();
    const path =
      '/api/v1/resolver-coaching-digest-audit-hub/audit-events' +
      (qs ? '?' + qs : '');
    return apiFetch(path).catch(() => null);
  },
  postCoachingDigestAuditHubAuditEvent: (data) =>
    apiFetch('/api/v1/resolver-coaching-digest-audit-hub/audit-events', {
      method: 'POST',
      body: JSON.stringify(data || {}),
    }).catch(() => null),
  // end DCRO4 helpers
  // ━━ DCRO4 SLICE BOUNDARY ━━ (do not remove; the launch-audit test
  // for the DCRO4 section finds the header above then walks to this
  // unique sentinel substring to bound the slice).
  // ── DCRO3 Resolver Coaching Digest launch-audit (2026-05-02) ────────────
  // Weekly digest worker that bundles each resolver's un-self-reviewed
  // wrong false_positive calls and dispatches via their preferred on-call
  // channel (reusing EscalationPolicy + oncall_delivery adapters from
  // #374). Per-resolver weekly cooldown. Honest opt-in default off.
  // Closes the loop end-to-end: DCRO1 measures (#393) → DCRO2
  // self-corrects (#397) → DCRO3 nudges. Helpers placed BEFORE DCRO2's
  // section so the closing slice-boundary sentinel below stays clean —
  // DCRO3 uses its own unique header anchor + slice-boundary sentinel.
  fetchMyResolverDigestPreference: (params) => {
    const usp = new URLSearchParams();
    if (params && params.resolver_user_id) usp.set('resolver_user_id', String(params.resolver_user_id));
    const qs = usp.toString();
    const path =
      '/api/v1/resolver-coaching-self-review-digest/my-preference' +
      (qs ? '?' + qs : '');
    return apiFetch(path);
  },
  updateMyResolverDigestPreference: (data) =>
    apiFetch('/api/v1/resolver-coaching-self-review-digest/my-preference', {
      method: 'PUT',
      body: JSON.stringify(data || {}),
    }),
  fetchResolverDigestStatus: () =>
    apiFetch('/api/v1/resolver-coaching-self-review-digest/status').catch(() => null),
  tickResolverDigest: (data) =>
    apiFetch('/api/v1/resolver-coaching-self-review-digest/tick', {
      method: 'POST',
      body: JSON.stringify(data || {}),
    }),
  fetchResolverDigestAuditEvents: (params) => {
    const usp = new URLSearchParams();
    if (params && params.surface) usp.set('surface', params.surface);
    if (params && params.limit != null) usp.set('limit', String(params.limit));
    if (params && params.offset != null) usp.set('offset', String(params.offset));
    const qs = usp.toString();
    const path =
      '/api/v1/resolver-coaching-self-review-digest/audit-events' +
      (qs ? '?' + qs : '');
    return apiFetch(path).catch(() => null);
  },
  // end DCRO3 helpers
  // ━━ DCRO3 SLICE BOUNDARY ━━ (do not remove; the launch-audit test
  // for the DCRO3 section finds the header above then walks to this
  // unique sentinel substring to bound the slice).
  // ── Resolver Coaching Inbox launch-audit (DCRO2, 2026-05-02) ─────────────
  // Private, read-only inbox view per resolver showing THEIR OWN wrong
  // false_positive calls — i.e., resolutions where the resolver said
  // "false_positive" but the DCA worker re-flagged the same caregiver
  // within 30 days. Mirrors the Wearables Workbench → Clinician Inbox
  // handoff (#353/#354): admins do NOT drill into another resolver's
  // coaching rows; coaching is resolver-led self-correction.
  // Helpers grouped BEFORE the DCRO1 + DCR2 sections so the closing
  // slice-boundary sentinel in those sections stays clean — DCRO2 uses
  // its own unique header anchor + slice-boundary sentinel below.
  fetchMyCoachingInbox: (params) => {
    const usp = new URLSearchParams();
    if (params && params.window_days != null) usp.set('window_days', String(params.window_days));
    const qs = usp.toString();
    const path =
      '/api/v1/resolver-coaching-inbox/my-coaching-inbox' +
      (qs ? '?' + qs : '');
    return apiFetch(path);
  },
  fileSelfReviewNote: (data) =>
    apiFetch('/api/v1/resolver-coaching-inbox/self-review-note', {
      method: 'POST',
      body: JSON.stringify(data || {}),
    }),
  fetchCoachingInboxAuditEvents: (params) => {
    const usp = new URLSearchParams();
    if (params && params.surface) usp.set('surface', params.surface);
    if (params && params.limit != null) usp.set('limit', String(params.limit));
    if (params && params.offset != null) usp.set('offset', String(params.offset));
    const qs = usp.toString();
    const path =
      '/api/v1/resolver-coaching-inbox/audit-events' +
      (qs ? '?' + qs : '');
    return apiFetch(path).catch(() => null);
  },
  fetchResolverAdminOverview: (params) => {
    const usp = new URLSearchParams();
    if (params && params.window_days != null) usp.set('window_days', String(params.window_days));
    if (params && params.min_resolutions != null) usp.set('min_resolutions', String(params.min_resolutions));
    const qs = usp.toString();
    const path =
      '/api/v1/resolver-coaching-inbox/admin-overview' +
      (qs ? '?' + qs : '');
    return apiFetch(path);
  },
  // end DCRO2 helpers
  // ━━ DCRO2 SLICE BOUNDARY ━━ (do not remove; the launch-audit test
  // for the DCRO2 section finds the header above then walks to this
  // unique sentinel substring to bound the slice).
  // ── DCRO1 Outcome Tracker launch-audit (2026-05-02) ─────────────────────
  // Calibration-accuracy dashboard built on top of the DCR1 + DCR2 audit
  // trail. Pairs each caregiver_portal.delivery_concern_resolved row with
  // the NEXT caregiver_portal.delivery_concern_threshold_reached row for
  // the same caregiver to record stayed_resolved vs re_flagged_within_30d,
  // then exposes per-resolver calibration accuracy: when an admin marks
  // "false_positive", does the DCA worker re-flag them within 30 days?
  // No schema change. Helpers grouped BEFORE the DCR2 block so DCR2 keeps
  // working — DCRO1 test slices on the unique header above and the
  // closing slice-boundary sentinel found below this section.
  fetchOutcomeTrackerSummary: (params) => {
    const usp = new URLSearchParams();
    if (params && params.window_days != null) usp.set('window_days', String(params.window_days));
    const qs = usp.toString();
    const path =
      '/api/v1/caregiver-delivery-concern-resolution-outcome-tracker/summary' +
      (qs ? '?' + qs : '');
    return apiFetch(path).catch(() => null);
  },
  fetchResolverCalibration: (params) => {
    const usp = new URLSearchParams();
    if (params && params.window_days != null) usp.set('window_days', String(params.window_days));
    if (params && params.min_resolutions != null) usp.set('min_resolutions', String(params.min_resolutions));
    const qs = usp.toString();
    const path =
      '/api/v1/caregiver-delivery-concern-resolution-outcome-tracker/resolver-calibration' +
      (qs ? '?' + qs : '');
    return apiFetch(path).catch(() => null);
  },
  fetchOutcomeTrackerAuditEvents: (params) => {
    const usp = new URLSearchParams();
    if (params && params.surface) usp.set('surface', params.surface);
    if (params && params.limit != null) usp.set('limit', String(params.limit));
    if (params && params.offset != null) usp.set('offset', String(params.offset));
    const qs = usp.toString();
    const path =
      '/api/v1/caregiver-delivery-concern-resolution-outcome-tracker/audit-events' +
      (qs ? '?' + qs : '');
    return apiFetch(path).catch(() => null);
  },
  postOutcomeTrackerAuditEvent: (data) =>
    apiFetch('/api/v1/caregiver-delivery-concern-resolution-outcome-tracker/audit-events', {
      method: 'POST',
      body: JSON.stringify(data || {}),
    }).catch(() => null),
  // end DCRO1 helpers
  // }; — DCRO1 slice boundary sentinel (do not remove; the launch-audit
  // test for the DCRO1 section finds the header above then walks to
  // this literal `};` substring to bound the slice).
  // ── DCR2 Resolution Audit Hub launch-audit (2026-05-02) ─────────────────
  // Cohort dashboard built on the DCR1 audit trail: distribution of
  // resolution reasons over time + top resolvers + median time-to-resolve.
  // Read-only analytics surface (clinician minimum). The hub page consumes
  // /summary for the KPI tiles + reason chart + trend chart + top resolvers
  // leaderboard, /list for the paginated recently-resolved table, and
  // /audit-events for the regulator transcript. Helpers grouped BEFORE
  // the DCR1 + DCA sections so their `};` indexOf slice boundaries stay
  // clean — the DCR2 test does its own slice anchored on the header
  // string above.
  caregiverDeliveryConcernResolutionAuditHubSummary: (params) => {
    const usp = new URLSearchParams();
    if (params && params.window_days != null) usp.set('window_days', String(params.window_days));
    const qs = usp.toString();
    const path =
      '/api/v1/caregiver-delivery-concern-resolution-audit-hub/summary' +
      (qs ? '?' + qs : '');
    return apiFetch(path).catch(() => null);
  },
  caregiverDeliveryConcernResolutionAuditHubList: (params) => {
    const usp = new URLSearchParams();
    if (params && params.reason) usp.set('reason', params.reason);
    if (params && params.start) usp.set('start', params.start);
    if (params && params.end) usp.set('end', params.end);
    if (params && params.page != null) usp.set('page', String(params.page));
    if (params && params.page_size != null) usp.set('page_size', String(params.page_size));
    const qs = usp.toString();
    const path =
      '/api/v1/caregiver-delivery-concern-resolution-audit-hub/list' +
      (qs ? '?' + qs : '');
    return apiFetch(path).catch(() => null);
  },
  caregiverDeliveryConcernResolutionAuditHubAuditEvents: (params) => {
    const usp = new URLSearchParams();
    if (params && params.surface) usp.set('surface', params.surface);
    if (params && params.limit != null) usp.set('limit', String(params.limit));
    if (params && params.offset != null) usp.set('offset', String(params.offset));
    const qs = usp.toString();
    const path =
      '/api/v1/caregiver-delivery-concern-resolution-audit-hub/audit-events' +
      (qs ? '?' + qs : '');
    return apiFetch(path).catch(() => null);
  },
  postCaregiverDeliveryConcernResolutionAuditHubAuditEvent: (data) =>
    apiFetch('/api/v1/caregiver-delivery-concern-resolution-audit-hub/audit-events', {
      method: 'POST',
      body: JSON.stringify(data || {}),
    }).catch(() => null),
  // end DCR2 helpers
  // ── Caregiver Delivery Concern Resolution launch-audit (DCR1, 2026-05-02) ──
  // Closes the loop opened by #390. Admins / reviewers mark a flagged
  // caregiver as resolved with a structured reason + free-text note.
  // The resolution row clears the DCA cooldown so the next aggregator
  // tick re-evaluates the caregiver. Care Team Coverage "Caregiver
  // channels" tab consumes /list for the open + recently-resolved
  // subsections, /resolve for the modal submit, and /audit-events for
  // the audit transcript. Helpers grouped BEFORE the DCA section so the
  // DCA test's slice boundary stays clean.
  caregiverDeliveryConcernResolutionList: (params) => {
    const usp = new URLSearchParams();
    if (params && params.status) usp.set('status', params.status);
    const qs = usp.toString();
    const path =
      '/api/v1/caregiver-delivery-concern-resolution/list' +
      (qs ? '?' + qs : '');
    return apiFetch(path).catch(() => null);
  },
  caregiverDeliveryConcernResolutionResolve: (data) =>
    apiFetch('/api/v1/caregiver-delivery-concern-resolution/resolve', {
      method: 'POST',
      body: JSON.stringify(data || {}),
    }),
  caregiverDeliveryConcernResolutionAuditEvents: (params) => {
    const usp = new URLSearchParams();
    if (params && params.surface) usp.set('surface', params.surface);
    if (params && params.limit != null) usp.set('limit', String(params.limit));
    if (params && params.offset != null) usp.set('offset', String(params.offset));
    const qs = usp.toString();
    const path =
      '/api/v1/caregiver-delivery-concern-resolution/audit-events' +
      (qs ? '?' + qs : '');
    return apiFetch(path).catch(() => null);
  },
  postCaregiverDeliveryConcernResolutionAuditEvent: (data) =>
    apiFetch('/api/v1/caregiver-delivery-concern-resolution/audit-events', {
      method: 'POST',
      body: JSON.stringify(data || {}),
    }).catch(() => null),
  // end DCR1 helpers — see launch-audit test slice boundary `};`
  // ── Caregiver Delivery Concern Aggregator launch-audit (2026-05-01) ─────
  // Closes section I rec from #389. Rolling-window worker that flags
  // caregivers with N+ delivery concerns (filed via Patient Digest) within
  // the configured window (default 3 within 7d) and emits a HIGH-priority
  // caregiver_portal.delivery_concern_threshold_reached audit row that
  // surfaces in the Clinician Inbox aggregator (#354). The Care Team
  // Coverage "Caregiver channels" tab consumes /status for the worker
  // panel + /tick for the admin "Run aggregator now" CTA + /audit-events
  // for the flagged caregivers list. Audit pings flow through the page-
  // level surface ``caregiver_delivery_concern_aggregator``.
  caregiverDeliveryConcernAggregatorStatus: () =>
    apiFetch(
      '/api/v1/caregiver-delivery-concern-aggregator/status',
    ).catch(() => null),
  caregiverDeliveryConcernAggregatorTick: () =>
    apiFetch('/api/v1/caregiver-delivery-concern-aggregator/tick', {
      method: 'POST',
    }),
  caregiverDeliveryConcernAggregatorAuditEvents: (params) => {
    const usp = new URLSearchParams();
    if (params && params.surface) usp.set('surface', params.surface);
    if (params && params.limit != null) usp.set('limit', String(params.limit));
    if (params && params.offset != null) usp.set('offset', String(params.offset));
    const qs = usp.toString();
    const path =
      '/api/v1/caregiver-delivery-concern-aggregator/audit-events' +
      (qs ? '?' + qs : '');
    return apiFetch(path).catch(() => null);
  },
  postCaregiverDeliveryConcernAggregatorAuditEvent: (data) =>
    apiFetch('/api/v1/caregiver-delivery-concern-aggregator/audit-events', {
      method: 'POST',
      body: JSON.stringify(data || {}),
    }).catch(() => null),
};

// Home program task mutation helpers (for web + future mobile/other bundles importing from `api.js`).
export {
  parseHomeProgramTaskMutationResponse,
  mergeParsedMutationIntoLocalTask,
  applySuccessfulSync,
  HOME_PROGRAM_MUTATION_OUTCOMES,
} from './home-program-task-sync.js';

// Helper: download a blob
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
