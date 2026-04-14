import { parseHomeProgramTaskMutationResponse } from './home-program-task-sync.js';

const API_BASE = (import.meta.env && import.meta.env.VITE_API_BASE_URL) || 'http://127.0.0.1:8000';
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
  try {
    const token = getToken();
    const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    res = await fetchFn(`${API_BASE}${path}`, { ...opts, headers });
  } catch (networkErr) {
    const err = new Error('Network error');
    err.status = 0;
    err.message = 'Network error';
    throw err;
  }
  if (res.status === 401) {
    // Avoid infinite loop — never attempt refresh when the refresh call itself 401s
    if (path === '/api/v1/auth/refresh') { clearToken(); _on401(); const e = new Error('API error 401'); e.status = 401; return Promise.reject(e); }
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
        const retryHeaders = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
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

  // ── Patients ────────────────────────────────────────────────────────────
  listPatients: () => apiFetchWithRetry('/api/v1/patients'),
  getPatient: (id) => apiFetch(`/api/v1/patients/${id}`),
  createPatient: (data) => apiFetch('/api/v1/patients', { method: 'POST', body: JSON.stringify(data) }),
  updatePatient: (id, data) => apiFetch(`/api/v1/patients/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deletePatient: (id) => apiFetch(`/api/v1/patients/${id}`, { method: 'DELETE' }),
  generateInviteCode: (patientData) =>
    apiFetch('/api/v1/patients/invite', { method: 'POST', body: JSON.stringify(patientData) }),
  getPatientSessions: (patientId) => apiFetch(`/api/v1/patients/${patientId}/sessions`),
  getPatientCourse: (patientId) => apiFetch(`/api/v1/patients/${patientId}/courses`),
  getPatientAssessments: (patientId) => apiFetch(`/api/v1/patients/${patientId}/assessments`),
  getPatientReports: (patientId) => apiFetch(`/api/v1/patients/${patientId}/reports`),
  getPatientMessages: (patientId) => apiFetch(`/api/v1/patients/${patientId}/messages`),
  sendPatientMessage: (patientId, message) =>
    apiFetch(`/api/v1/patients/${patientId}/messages`, { method: 'POST', body: JSON.stringify({ body: message }) }),
  submitAssessment: (patientId, assessmentData) =>
    apiFetch('/api/v1/assessments', { method: 'POST', body: JSON.stringify({ ...assessmentData, patient_id: patientId }) }),

  // ── Sessions ────────────────────────────────────────────────────────────
  listSessions: (patient_id) =>
    apiFetchWithRetry(`/api/v1/sessions${patient_id ? `?patient_id=${patient_id}` : ''}`),
  createSession: (data) => apiFetch('/api/v1/sessions', { method: 'POST', body: JSON.stringify(data) }),
  updateSession: (id, data) => apiFetch(`/api/v1/sessions/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteSession: (id) => apiFetch(`/api/v1/sessions/${id}`, { method: 'DELETE' }),

  // ── Assessments ─────────────────────────────────────────────────────────
  listAssessments: () => apiFetchWithRetry('/api/v1/assessments'),
  createAssessment: (data) => apiFetch('/api/v1/assessments', { method: 'POST', body: JSON.stringify(data) }),
  updateAssessment: (id, data) => apiFetch(`/api/v1/assessments/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteAssessment: (id) => apiFetch(`/api/v1/assessments/${id}`, { method: 'DELETE' }),

  // ── Clinical Knowledge ──────────────────────────────────────────────────
  listEvidence: () => apiFetchWithRetry('/api/v1/evidence'),
  listDevices: () => apiFetchWithRetry('/api/v1/devices'),

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

  listBrainRegions: () => apiFetchWithRetry('/api/v1/brain-regions'),
  listQEEGBiomarkers: () => apiFetch('/api/v1/qeeg/biomarkers'),
  listQEEGConditionMap: () => apiFetch('/api/v1/qeeg/condition-map'),

  // ── Protocol & Handbooks ────────────────────────────────────────────────
  intakePreview: (data) =>
    apiFetch('/api/v1/intake/preview', { method: 'POST', body: JSON.stringify(data) }),
  generateProtocol: (data) =>
    apiFetch('/api/v1/protocols/generate-draft', { method: 'POST', body: JSON.stringify(data) }),
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

  // ── Patient outcomes (portal alias) ─────────────────────────────────────
  patientOutcomes: () => apiFetch('/api/v1/patient-portal/outcomes'),
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
