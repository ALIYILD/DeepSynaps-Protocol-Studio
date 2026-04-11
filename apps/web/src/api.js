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

async function apiFetch(path, opts = {}) {
  let res;
  try {
    const token = getToken();
    const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
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
          retryRes = await fetch(`${API_BASE}${path}`, { ...opts, headers: retryHeaders });
        } catch (networkErr) {
          const err = new Error('Network error');
          err.status = 0;
          throw err;
        }
        if (retryRes.status === 204) return null;
        if (!retryRes.ok) {
          const retryErr = new Error(`API error ${retryRes.status}`);
          retryErr.status = retryRes.status;
          try { const e = await retryRes.json(); retryErr.message = e.detail || retryErr.message; } catch {}
          if (retryRes.status === 403) { console.warn('[api] 403 Forbidden:', path); }
          throw retryErr;
        }
        return retryRes.json();
      }
    }
    // Refresh failed or unavailable — session truly expired
    clearToken();
    _on401();
    const expiredErr = new Error('API error 401');
    expiredErr.status = 401;
    return Promise.reject(expiredErr);
  }
  if (res.status === 204) return null;
  if (!res.ok) {
    const err = new Error(`API error ${res.status}`);
    err.status = res.status;
    try { const e = await res.json(); err.message = e.detail || err.message; err.body = e; } catch {}
    if (res.status === 403) { console.warn('[api] 403 Forbidden:', path); }
    throw err;
  }
  return res.json();
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
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Export error ${res.status}`);
  return res.blob();
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
  chatAgent: (messages, provider = 'anthropic', openai_key = null, context = null) =>
    apiFetch('/api/v1/chat/agent', { method: 'POST', body: JSON.stringify({ messages, provider, openai_key, context }) }),
  chatClinician: (messages, patient_context) =>
    apiFetch('/api/v1/chat/clinician', { method: 'POST', body: JSON.stringify({ messages, patient_context }) }),
  chatPatient: (messages, patient_context, language = 'en') =>
    apiFetch('/api/v1/chat/patient', { method: 'POST', body: JSON.stringify({ messages, patient_context, language }) }),

  // ── Registry endpoints (public — no auth needed but token attached if present) ──
  conditions: () => apiFetchWithRetry('/api/v1/registry/conditions'),
  modalities: () => apiFetchWithRetry('/api/v1/registry/modalities'),
  devices_registry: () => apiFetch('/api/v1/registry/devices'),
  protocols: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetchWithRetry(`/api/v1/registry/protocols${q ? '?' + q : ''}`);
  },
  protocolDetail: (id) => apiFetch(`/api/v1/registry/protocols/${id}`),
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
  telegramLinkCode: () => apiFetch('/api/v1/telegram/link-code'),

  // ── Health ──────────────────────────────────────────────────────────────
  health: () => apiFetch('/health'),

  // ── Presence (real-time collaboration) ──────────────────────────────────
  pingPresence: (page_id) =>
    apiFetch('/api/v1/notifications/presence', { method: 'POST', body: JSON.stringify({ page_id }) }),
  getPresence: (page_id) =>
    apiFetch(`/api/v1/notifications/presence/${encodeURIComponent(page_id)}`),
};

// Helper: download a blob
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
