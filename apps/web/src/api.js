import { parseHomeProgramTaskMutationResponse } from './home-program-task-sync.js';

const API_BASE = import.meta.env?.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000';
const TOKEN_KEY = 'ds_access_token';
const REFRESH_KEY = 'ds_refresh_token';

function getToken() { return localStorage.getItem(TOKEN_KEY); }
function setToken(t) { localStorage.setItem(TOKEN_KEY, t); }
function clearToken() { localStorage.removeItem(TOKEN_KEY); clearRefreshToken(); }

function getRefreshToken() { return localStorage.getItem(REFRESH_KEY); }
function setRefreshToken(t) { localStorage.setItem(REFRESH_KEY, t); }
function clearRefreshToken() { localStorage.removeItem(REFRESH_KEY); }

// ── 401 interceptor ───────────────────────────────────────────────────────────
let _401InFlight = false;
function _on401() {
  if (_401InFlight) return;
  _401InFlight = true;
  window._handleSessionExpired?.();
  setTimeout(() => { _401InFlight = false; }, 5000);
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
  const fetchFn = opts._fetch || globalThis.fetch;
  // Detect multipart uploads: when body is FormData, omit the JSON content-type
  // so the browser can set the correct multipart/form-data boundary automatically.
  const _isFormData = (typeof FormData !== 'undefined') && (opts.body instanceof FormData);
  try {
    const token = getToken();
    const headers = { ...(opts.headers || {}) };
    if (!_isFormData && !('Content-Type' in headers) && !('content-type' in headers)) {
      headers['Content-Type'] = 'application/json';
    }
    if (token) headers['Authorization'] = `Bearer ${token}`;
    res = await fetchFn(`${API_BASE}${path}`, { ...opts, headers });
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
        const retryHeaders = { ...(opts.headers || {}) };
        if (!_isFormData && !('Content-Type' in retryHeaders) && !('content-type' in retryHeaders)) {
          retryHeaders['Content-Type'] = 'application/json';
        }
        retryHeaders['Authorization'] = `Bearer ${refreshResult.access_token}`;
        let retryRes;
        try {
          retryRes = await fetchFn(`${API_BASE}${path}`, { ...opts, headers: retryHeaders });
        } catch (networkErr) {
          const err = new Error('Network error');
          err.status = 0;
          throw err;
        }
        if (retryRes.status === 204) {
          if (opts._transportExtractor) return { data: null, transport: _extractTransport(retryRes, opts._transportExtractor) };
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
        if (opts._transportExtractor) {
          return { data: retryData, transport: _extractTransport(retryRes, opts._transportExtractor) };
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
    // Refresh failed or unavailable — session truly expired
    clearToken();
    _on401();
    const expiredErr = new Error('API error 401');
    expiredErr.status = 401;
    return Promise.reject(expiredErr);
  }
  if (res.status === 204) {
    if (opts._transportExtractor) return { data: null, transport: _extractTransport(res, opts._transportExtractor) };
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
  if (opts._transportExtractor) {
    return { data, transport: _extractTransport(res, opts._transportExtractor) };
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

export const api = {
  getToken, setToken, clearToken,
  getRefreshToken, setRefreshToken, clearRefreshToken,

  // ── Auth ────────────────────────────────────────────────────────────────
  login: async (email, password) => {
    const result = await apiFetch('/api/v1/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    if (result && result.refresh_token) setRefreshToken(result.refresh_token);
    return result;
  },
  logout: () => apiFetch('/api/v1/auth/logout', { method: 'POST' }),
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
  listPatients: () => apiFetchWithRetry('/api/v1/patients'),
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
  getPatientAssessments: (patientId) => apiFetch(`/api/v1/patients/${patientId}/assessments`),
  getPatientReports: (patientId) => apiFetch(`/api/v1/patients/${patientId}/reports`),
  getPatientMessages: (patientId) => apiFetch(`/api/v1/patients/${patientId}/messages`),
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
  submitAssessment: (patientId, assessmentData) =>
    apiFetch('/api/v1/assessments', { method: 'POST', body: JSON.stringify({ ...assessmentData, patient_id: patientId }) }),

  // ── Sessions ────────────────────────────────────────────────────────────
  // Accepts either a string patient_id (legacy) or a query-params object.
  // Examples:
  //   api.listSessions('pt-123')
  //   api.listSessions({ from: '2026-04-01', to: '2026-04-30' })
  //   api.listSessions({ patient_id: 'pt-123', status: 'scheduled' })
  listSessions: (arg) => {
    let qs = '';
    if (arg && typeof arg === 'object') {
      const entries = Object.entries(arg).filter(([_, v]) => v != null && v !== '');
      if (entries.length) qs = '?' + new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString();
    } else if (arg) {
      qs = `?patient_id=${encodeURIComponent(arg)}`;
    }
    return apiFetchWithRetry(`/api/v1/sessions${qs}`);
  },
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
  listDocuments: (patientId) => apiFetchWithRetry(`/api/v1/documents${patientId ? '?patient_id=' + patientId : ''}`),
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
      .then(r => { if (!r.ok) throw new Error(`API error ${r.status}`); return r.json(); });
  },

  // Absolute URL for a document's stored file — used as <a href=> for downloads.
  documentDownloadUrl: (id) => `${API_BASE}/api/v1/documents/${encodeURIComponent(id)}/download`,

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

  // ── Protocol & Handbooks ────────────────────────────────────────────────
  intakePreview: (data) =>
    apiFetch('/api/v1/intake/preview', { method: 'POST', body: JSON.stringify(data) }),
  generateProtocol: (data) =>
    apiFetch('/api/v1/protocols/generate-draft', { method: 'POST', body: JSON.stringify(data) }),

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
  auditTrail: () => apiFetch('/api/v1/audit-trail'),
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

  // ── Registry endpoints (public — no auth needed but token attached if present) ──
  conditions: () => apiFetchWithRetry('/api/v1/registry/conditions'),
  modalities: () => apiFetchWithRetry('/api/v1/registry/modalities'),
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
  resolveAdverseEvent: (id, data = {}) =>
    apiFetch(`/api/v1/adverse-events/${id}/resolve`, { method: 'PATCH', body: JSON.stringify(data) }),

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

  // ── Clinician notes ───────────────────────────────────────────────────────
  createClinicianNote: (data) =>
    apiFetch('/api/v1/media/clinician/note/text', { method: 'POST', body: JSON.stringify(data) }),
  listClinicianNotes: (patientId) => apiFetch(`/api/v1/media/clinician/notes/${patientId}`),

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

  // ── Patient Portal (self-service for patient-role users) ─────────────────
  patientPortalMe: () => apiFetch('/api/v1/patient-portal/me'),
  patientPortalCourses: () => apiFetch('/api/v1/patient-portal/courses'),
  patientPortalSessions: () => apiFetch('/api/v1/patient-portal/sessions'),
  patientPortalAssessments: () => apiFetch('/api/v1/patient-portal/assessments'),
  patientPortalOutcomes: () => apiFetch('/api/v1/patient-portal/outcomes'),
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

  // ── Home Program Tasks (patient portal) ───────────────────────────────────
  portalListHomeProgramTasks: () => apiFetch('/api/v1/patient-portal/home-program-tasks'),
  portalCompleteHomeProgramTask: (serverTaskId, data) =>
    apiFetch(`/api/v1/patient-portal/home-program-tasks/${encodeURIComponent(serverTaskId)}/complete`, { method: 'POST', body: JSON.stringify(data || {}) }),
  portalGetHomeProgramTaskCompletion: (serverTaskId) =>
    apiFetch(`/api/v1/patient-portal/home-program-tasks/${encodeURIComponent(serverTaskId)}/completion`),

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

  // ── Presence (real-time collaboration) ──────────────────────────────────
  pingPresence: (page_id) =>
    apiFetch('/api/v1/notifications/presence', { method: 'POST', body: JSON.stringify({ page_id }) }),
  getPresence: (page_id) =>
    apiFetch(`/api/v1/notifications/presence/${encodeURIComponent(page_id)}`),

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
    if (data && data.reason) body.session_notes = '[Cancelled] ' + String(data.reason);
    return apiFetch(`/api/v1/sessions/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
  },
  // Booking alias — backend uses POST /api/v1/sessions (createSession).
  bookSession: (data) =>
    apiFetch('/api/v1/sessions', { method: 'POST', body: JSON.stringify(data) }),

  // Endpoints not yet implemented in backend — these reject so callers can
  // try/catch and fall back to demo/seed data. When the real endpoint ships,
  // replace the stub with the real call.
  listClinicians: () => Promise.reject(new Error('not_implemented')),
  listRooms: () => Promise.reject(new Error('not_implemented')),
  listReferrals: () => Promise.reject(new Error('not_implemented')),
  listStaffSchedule: (_params) => Promise.reject(new Error('not_implemented')),
  createStaffShift: (_data) => Promise.reject(new Error('not_implemented')),
  checkSlotConflicts: (_slot) => Promise.reject(new Error('not_implemented')),
  triageReferral: (_id, _data) => Promise.reject(new Error('not_implemented')),
  dismissReferral: (_id) => Promise.reject(new Error('not_implemented')),

  // ── Home program task notifications (stub — endpoint not yet implemented) ──
  remindHomeProgramTask: (_taskId, _payload) => Promise.reject(new Error('not_implemented')),
  listHomeProgramTaskTemplates: () => Promise.reject(new Error('not_implemented')),
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
