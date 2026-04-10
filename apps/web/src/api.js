const API_BASE = (import.meta.env && import.meta.env.VITE_API_BASE_URL) || 'http://127.0.0.1:8000';
const TOKEN_KEY = 'ds_access_token';

function getToken() { return localStorage.getItem(TOKEN_KEY); }
function setToken(t) { localStorage.setItem(TOKEN_KEY, t); }
function clearToken() { localStorage.removeItem(TOKEN_KEY); }

async function apiFetch(path, opts = {}) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
  if (res.status === 401) { clearToken(); return null; }
  if (res.status === 204) return null;
  if (!res.ok) {
    let msg = `API error ${res.status}`;
    try { const e = await res.json(); msg = e.detail || msg; } catch {}
    throw new Error(msg);
  }
  return res.json();
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

  // ── Auth ────────────────────────────────────────────────────────────────
  login: (email, password) =>
    apiFetch('/api/v1/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  register: (email, display_name, password) =>
    apiFetch('/api/v1/auth/register', { method: 'POST', body: JSON.stringify({ email, display_name, password }) }),
  refresh: (refresh_token) =>
    apiFetch('/api/v1/auth/refresh', { method: 'POST', body: JSON.stringify({ refresh_token }) }),
  me: () => apiFetch('/api/v1/auth/me'),

  // ── Patients ────────────────────────────────────────────────────────────
  listPatients: () => apiFetch('/api/v1/patients'),
  getPatient: (id) => apiFetch(`/api/v1/patients/${id}`),
  createPatient: (data) => apiFetch('/api/v1/patients', { method: 'POST', body: JSON.stringify(data) }),
  updatePatient: (id, data) => apiFetch(`/api/v1/patients/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deletePatient: (id) => apiFetch(`/api/v1/patients/${id}`, { method: 'DELETE' }),

  // ── Sessions ────────────────────────────────────────────────────────────
  listSessions: (patient_id) =>
    apiFetch(`/api/v1/sessions${patient_id ? `?patient_id=${patient_id}` : ''}`),
  createSession: (data) => apiFetch('/api/v1/sessions', { method: 'POST', body: JSON.stringify(data) }),
  updateSession: (id, data) => apiFetch(`/api/v1/sessions/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteSession: (id) => apiFetch(`/api/v1/sessions/${id}`, { method: 'DELETE' }),

  // ── Assessments ─────────────────────────────────────────────────────────
  listAssessments: () => apiFetch('/api/v1/assessments'),
  createAssessment: (data) => apiFetch('/api/v1/assessments', { method: 'POST', body: JSON.stringify(data) }),
  updateAssessment: (id, data) => apiFetch(`/api/v1/assessments/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteAssessment: (id) => apiFetch(`/api/v1/assessments/${id}`, { method: 'DELETE' }),

  // ── Clinical Knowledge ──────────────────────────────────────────────────
  listEvidence: () => apiFetch('/api/v1/evidence'),
  listDevices: () => apiFetch('/api/v1/devices'),
  listBrainRegions: () => apiFetch('/api/v1/brain-regions'),
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
  submitReview: (data) =>
    apiFetch('/api/v1/review-actions', { method: 'POST', body: JSON.stringify(data) }),
  auditTrail: () => apiFetch('/api/v1/audit-trail'),

  // ── Payments ────────────────────────────────────────────────────────────
  paymentConfig: () => apiFetch('/api/v1/payments/config'),
  createCheckout: (package_id) =>
    apiFetch('/api/v1/payments/create-checkout', { method: 'POST', body: JSON.stringify({ package_id }) }),
  createPortal: () =>
    apiFetch('/api/v1/payments/create-portal', { method: 'POST' }),

  // ── Chat ────────────────────────────────────────────────────────────────
  chatClinician: (messages, patient_context) =>
    apiFetch('/api/v1/chat/clinician', { method: 'POST', body: JSON.stringify({ messages, patient_context }) }),
  chatPatient: (messages, patient_context) =>
    apiFetch('/api/v1/chat/patient', { method: 'POST', body: JSON.stringify({ messages, patient_context }) }),

  // ── Registry endpoints (public — no auth needed but token attached if present) ──
  conditions: () => apiFetch('/api/v1/registry/conditions'),
  modalities: () => apiFetch('/api/v1/registry/modalities'),
  devices_registry: () => apiFetch('/api/v1/registry/devices'),
  protocols: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch(`/api/v1/registry/protocols${q ? '?' + q : ''}`);
  },
  protocolDetail: (id) => apiFetch(`/api/v1/registry/protocols/${id}`),
  phenotypes: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch(`/api/v1/registry/phenotypes${q ? '?' + q : ''}`);
  },

  // ── Treatment courses ────────────────────────────────────────────────────
  listCourses: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch(`/api/v1/treatment-courses${q ? '?' + q : ''}`);
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
    return apiFetch(`/api/v1/adverse-events${q ? '?' + q : ''}`);
  },

  // ── Review queue ─────────────────────────────────────────────────────────
  listReviewQueue: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch(`/api/v1/review-queue${q ? '?' + q : ''}`);
  },

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
    return apiFetch(`/api/v1/outcomes${q ? '?' + q : ''}`);
  },
  courseOutcomeSummary: (courseId) => apiFetch(`/api/v1/outcomes/summary/${courseId}`),
  aggregateOutcomes: () => apiFetch('/api/v1/outcomes/aggregate'),

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

  // ── Telegram ────────────────────────────────────────────────────────────
  telegramLinkCode: () => apiFetch('/api/v1/telegram/link-code'),

  // ── Health ──────────────────────────────────────────────────────────────
  health: () => apiFetch('/health'),
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
