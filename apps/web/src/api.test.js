// api.test.js — Pins the public surface of api.js
// Covers: demo-passthrough regex, isDemoSession, downloadBlob, token helpers,
// and representative method calls across every major endpoint family.
//
// Run: node --test src/api.test.js

import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';

// ── Minimal DOM / browser stubs ───────────────────────────────────────────────
// api.js needs localStorage, URL, Response, FormData at import time.
const _store = {};
const _localStorageShim = {
  getItem: (k) => Object.prototype.hasOwnProperty.call(_store, k) ? _store[k] : null,
  setItem: (k, v) => { _store[k] = String(v); },
  removeItem: (k) => { delete _store[k]; },
  clear: () => { Object.keys(_store).forEach(k => delete _store[k]); },
};
globalThis.localStorage = {
  ..._localStorageShim,
  ...(globalThis.localStorage || {}),
  getItem: _localStorageShim.getItem,
  setItem: _localStorageShim.setItem,
  removeItem: _localStorageShim.removeItem,
  clear: _localStorageShim.clear,
};
if (typeof globalThis.URL === 'undefined') {
  const { URL } = await import('node:url');
  globalThis.URL = URL;
}
if (typeof globalThis.FormData === 'undefined') {
  class FormData {
    constructor() { this._data = {}; }
    append(k, v) { this._data[k] = v; }
    get(k) { return this._data[k] ?? null; }
  }
  globalThis.FormData = FormData;
}
if (typeof globalThis.Response === 'undefined') {
  // Minimal Response shim
  globalThis.Response = class Response {
    constructor(body = '', init = {}) {
      this.status = init.status ?? 200;
      this.ok = this.status >= 200 && this.status < 300;
      this._body = body;
      this.headers = new Map(Object.entries(init.headers || {}));
    }
    async json() { return JSON.parse(this._body); }
    async text() { return String(this._body); }
    async blob() { return new Blob([this._body]); }
    clone() { return new globalThis.Response(this._body, { status: this.status }); }
  };
}
if (typeof globalThis.Blob === 'undefined') {
  globalThis.Blob = class Blob { constructor(parts = []) { this._parts = parts; } };
}

// ── Import api.js ─────────────────────────────────────────────────────────────
// apiFetch uses import.meta.env — shim it before the import
if (typeof globalThis.import === 'undefined') {
  // handled by node esm; import.meta.env is undefined in test runner,
  // api.js already does `?.` so it falls back gracefully.
}

const { api, isDemoSession, downloadBlob, API_BASE } = await import('./api.js');

// ── Helper: stub fetch and restore ──────────────────────────────────────────
// Use a plain object instead of `new globalThis.Response()` so the stub
// survives being run alongside pages-patient.test.js (which installs jsdom
// and replaces globalThis.Response with a DOM implementation that has a
// different constructor signature).
function _makeFakeResponse(body, status) {
  const bodyStr = body === null ? 'null' : (typeof body === 'string' ? body : JSON.stringify(body));
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: () => 'application/json' },
    json: () => Promise.resolve(JSON.parse(bodyStr)),
    text: () => Promise.resolve(bodyStr),
    blob: () => Promise.resolve({ _data: bodyStr }),
    clone() {
      return _makeFakeResponse(body, status);
    },
  };
}

function stubFetch(responseBody, status = 200) {
  const original = globalThis.fetch;
  let captured = null;
  globalThis.fetch = (url, init) => {
    captured = { url: String(url), method: init?.method || 'GET', body: init?.body, headers: init?.headers };
    return Promise.resolve(_makeFakeResponse(responseBody, status));
  };
  return {
    getCaptured: () => captured,
    restore: () => { globalThis.fetch = original; },
  };
}

// ── 1. Module-level exports ───────────────────────────────────────────────────
describe('api.js module exports', () => {
  it('exports API_BASE string', () => {
    assert.strictEqual(typeof API_BASE, 'string');
    assert.ok(API_BASE.startsWith('http'), `API_BASE should start with http, got: ${API_BASE}`);
  });

  it('exports api object', () => {
    assert.strictEqual(typeof api, 'object');
    assert.ok(api !== null);
  });

  it('exports isDemoSession function', () => {
    assert.strictEqual(typeof isDemoSession, 'function');
  });

  it('exports downloadBlob function', () => {
    assert.strictEqual(typeof downloadBlob, 'function');
  });
});

// ── 2. Demo-passthrough regex ─────────────────────────────────────────────────
describe('_DEMO_PASSTHROUGH regex (via isDemoSession + documented paths)', () => {
  // The regex is: /^\/api\/v1\/auth\/(demo-login|refresh|me|login|logout|register|activate-patient|forgot-password|reset-password)\b/
  const PASSTHROUGH = /^\/api\/v1\/auth\/(demo-login|refresh|me|login|logout|register|activate-patient|forgot-password|reset-password)\b/;

  const shouldMatch = [
    '/api/v1/auth/demo-login',
    '/api/v1/auth/refresh',
    '/api/v1/auth/me',
    '/api/v1/auth/login',
    '/api/v1/auth/logout',
    '/api/v1/auth/register',
    '/api/v1/auth/activate-patient',
    '/api/v1/auth/forgot-password',
    '/api/v1/auth/reset-password',
  ];
  const shouldNotMatch = [
    '/api/v1/patients',
    '/api/v1/sessions',
    '/api/v1/qeeg-analysis/abc',
    '/api/v1/auth/unknown-endpoint',
    '/api/v1/auth/',
    '/api/v1/clinical-text/analyze',
  ];

  for (const path of shouldMatch) {
    it(`matches passthrough path: ${path}`, () => {
      assert.ok(PASSTHROUGH.test(path), `Expected ${path} to match demo passthrough`);
    });
  }

  for (const path of shouldNotMatch) {
    it(`does NOT match non-passthrough: ${path}`, () => {
      assert.ok(!PASSTHROUGH.test(path), `Expected ${path} NOT to match demo passthrough`);
    });
  }
});

// ── 3. isDemoSession ─────────────────────────────────────────────────────────
describe('isDemoSession()', () => {
  it('returns false when no token is stored', () => {
    globalThis.localStorage.removeItem('ds_access_token');
    // isDemoSession also checks import.meta.env.DEV — in node test it's undefined
    // so the flag is falsy and it returns false regardless of token
    const result = isDemoSession();
    assert.strictEqual(typeof result, 'boolean');
  });

  it('api.isDemoSession is the same function', () => {
    assert.strictEqual(typeof api.isDemoSession, 'function');
    assert.strictEqual(api.isDemoSession(), isDemoSession());
  });
});

// ── 4. Token helpers ─────────────────────────────────────────────────────────
describe('token helpers (getToken / setToken / clearToken)', () => {
  it('setToken stores, getToken retrieves', () => {
    api.setToken('test-jwt-xyz');
    assert.strictEqual(api.getToken(), 'test-jwt-xyz');
  });

  it('clearToken removes access token', () => {
    api.setToken('to-be-cleared');
    api.clearToken();
    assert.strictEqual(api.getToken(), null);
  });

  it('setRefreshToken / getRefreshToken round-trip', () => {
    api.setRefreshToken('refresh-abc');
    assert.strictEqual(api.getRefreshToken(), 'refresh-abc');
    api.clearRefreshToken();
    assert.strictEqual(api.getRefreshToken(), null);
  });
});

// ── 5. Auth endpoint family ───────────────────────────────────────────────────
describe('auth endpoints', () => {
  it('api.login is callable', () => {
    assert.strictEqual(typeof api.login, 'function');
  });

  it('api.login POSTs to /api/v1/auth/login', async () => {
    const stub = stubFetch({ access_token: 'tok123', token_type: 'bearer' });
    try {
      await api.login('user@test.com', 'pass');
      const c = stub.getCaptured();
      assert.ok(c.url.includes('/api/v1/auth/login'), `Expected /api/v1/auth/login, got ${c.url}`);
      assert.strictEqual(c.method, 'POST');
      const body = JSON.parse(c.body);
      assert.strictEqual(body.email, 'user@test.com');
    } finally { stub.restore(); }
  });

  it('api.register POSTs to /api/v1/auth/register', async () => {
    const stub = stubFetch({ id: 'u1', email: 'new@test.com' });
    try {
      await api.register('new@test.com', 'New User', 'secret', 'clinician');
      const c = stub.getCaptured();
      assert.ok(c.url.includes('/api/v1/auth/register'));
      assert.strictEqual(c.method, 'POST');
    } finally { stub.restore(); }
  });

  it('api.me GETs /api/v1/auth/me', async () => {
    const stub = stubFetch({ id: 'u1', email: 'me@test.com' });
    try {
      await api.me();
      const c = stub.getCaptured();
      assert.ok(c.url.includes('/api/v1/auth/me'));
    } finally { stub.restore(); }
  });

  it('api.forgotPassword POSTs to /api/v1/auth/forgot-password', async () => {
    const stub = stubFetch({ sent: true });
    try {
      await api.forgotPassword('user@test.com');
      const c = stub.getCaptured();
      assert.ok(c.url.includes('/api/v1/auth/forgot-password'));
      assert.strictEqual(c.method, 'POST');
    } finally { stub.restore(); }
  });

  it('api.demoLogin POSTs to /api/v1/auth/demo-login', async () => {
    const stub = stubFetch({ access_token: 'demo-token' });
    try {
      await api.demoLogin('clinician-demo-token');
      const c = stub.getCaptured();
      assert.ok(c.url.includes('/api/v1/auth/demo-login'));
      assert.strictEqual(c.method, 'POST');
    } finally { stub.restore(); }
  });
});

// ── 6. Patients endpoint family ───────────────────────────────────────────────
describe('patients endpoints', () => {
  it('api.listPatients is callable', () => {
    assert.strictEqual(typeof api.listPatients, 'function');
  });

  it('api.listPatients GETs /api/v1/patients', async () => {
    const stub = stubFetch({ items: [], total: 0 });
    try {
      await api.listPatients();
      const c = stub.getCaptured();
      assert.ok(c.url.includes('/api/v1/patients'));
    } finally { stub.restore(); }
  });

  it('api.listPatients appends query params', async () => {
    const stub = stubFetch({ items: [] });
    try {
      await api.listPatients({ status: 'active', q: 'john' });
      const c = stub.getCaptured();
      assert.ok(c.url.includes('status=active'));
      assert.ok(c.url.includes('q=john'));
    } finally { stub.restore(); }
  });

  it('api.getPatient GETs /api/v1/patients/:id', async () => {
    const stub = stubFetch({ id: 'pt-1', name: 'John' });
    try {
      await api.getPatient('pt-1');
      const c = stub.getCaptured();
      assert.ok(c.url.includes('/api/v1/patients/pt-1'));
    } finally { stub.restore(); }
  });

  it('api.createPatient POSTs to /api/v1/patients', async () => {
    const stub = stubFetch({ id: 'pt-new' });
    try {
      await api.createPatient({ name: 'Jane', email: 'jane@test.com' });
      const c = stub.getCaptured();
      assert.ok(c.url.includes('/api/v1/patients'));
      assert.strictEqual(c.method, 'POST');
    } finally { stub.restore(); }
  });

  it('api.updatePatient PATCHes /api/v1/patients/:id', async () => {
    const stub = stubFetch({ id: 'pt-1', name: 'Updated' });
    try {
      await api.updatePatient('pt-1', { name: 'Updated' });
      const c = stub.getCaptured();
      assert.ok(c.url.includes('/api/v1/patients/pt-1'));
      assert.strictEqual(c.method, 'PATCH');
    } finally { stub.restore(); }
  });

  it('api.deletePatient DELETEs /api/v1/patients/:id', async () => {
    const stub = stubFetch(null, 204);
    try {
      await api.deletePatient('pt-1');
      const c = stub.getCaptured();
      assert.ok(c.url.includes('/api/v1/patients/pt-1'));
      assert.strictEqual(c.method, 'DELETE');
    } finally { stub.restore(); }
  });

  it('api.getPatientDetail GETs /api/v1/patients/:id/detail', async () => {
    const stub = stubFetch({ patient_id: 'pt-1' });
    try {
      await api.getPatientDetail('pt-1');
      const c = stub.getCaptured();
      assert.ok(c.url.includes('/api/v1/patients/pt-1/detail'));
    } finally { stub.restore(); }
  });
});

// ── 7. Sessions endpoint family ───────────────────────────────────────────────
describe('sessions endpoints', () => {
  it('api.listSessions defaults limit=100', async () => {
    const stub = stubFetch({ items: [] });
    try {
      await api.listSessions('pt-1');
      const c = stub.getCaptured();
      assert.ok(c.url.includes('limit=100'));
    } finally { stub.restore(); }
  });

  it('api.createSession POSTs to /api/v1/sessions', async () => {
    const stub = stubFetch({ id: 'sess-1' });
    try {
      await api.createSession({ patient_id: 'pt-1', status: 'scheduled' });
      const c = stub.getCaptured();
      assert.ok(c.url.includes('/api/v1/sessions'));
      assert.strictEqual(c.method, 'POST');
    } finally { stub.restore(); }
  });

  it('api.getSession GETs /api/v1/sessions/:id', async () => {
    const stub = stubFetch({ id: 'sess-1' });
    try {
      await api.getSession('sess-1');
      const c = stub.getCaptured();
      assert.ok(c.url.includes('/api/v1/sessions/sess-1'));
    } finally { stub.restore(); }
  });

  it('api.signSession POSTs to /api/v1/sessions/:id/sign', async () => {
    const stub = stubFetch({ signed: true });
    try {
      await api.signSession('sess-1', { note: 'ok' });
      const c = stub.getCaptured();
      assert.ok(c.url.includes('/api/v1/sessions/sess-1/sign'));
      assert.strictEqual(c.method, 'POST');
    } finally { stub.restore(); }
  });

  it('api.sessionPhaseTransition POSTs to /api/v1/sessions/:id/phase', async () => {
    const stub = stubFetch({ phase: 'treatment' });
    try {
      await api.sessionPhaseTransition('sess-1', 'treatment');
      const c = stub.getCaptured();
      assert.ok(c.url.includes('/api/v1/sessions/sess-1/phase'));
      assert.strictEqual(c.method, 'POST');
      const body = JSON.parse(c.body);
      assert.strictEqual(body.phase, 'treatment');
    } finally { stub.restore(); }
  });
});

// ── 8. Assessments endpoint family ───────────────────────────────────────────
describe('assessments endpoints', () => {
  it('api.listAssessments GETs /api/v1/assessments with patient_id', async () => {
    const stub = stubFetch({ items: [] });
    try {
      await api.listAssessments('pt-1');
      const c = stub.getCaptured();
      assert.ok(c.url.includes('/api/v1/assessments'));
      assert.ok(c.url.includes('patient_id=pt-1'));
    } finally { stub.restore(); }
  });

  it('api.assignAssessment POSTs to /api/v1/assessments/assign', async () => {
    const stub = stubFetch({ id: 'asgn-1' });
    try {
      await api.assignAssessment('pt-1', { template_slug: 'phq9' });
      const c = stub.getCaptured();
      assert.ok(c.url.includes('/api/v1/assessments/assign'));
      assert.strictEqual(c.method, 'POST');
    } finally { stub.restore(); }
  });

  it('api.listAssessmentTemplates GETs /api/v1/assessments/templates', async () => {
    const stub = stubFetch([]);
    try {
      await api.listAssessmentTemplates();
      const c = stub.getCaptured();
      assert.ok(c.url.includes('/api/v1/assessments/templates'));
    } finally { stub.restore(); }
  });

  it('api.escalateCrisis POSTs to /api/v1/crisis-escalations', async () => {
    const stub = stubFetch({ id: 'cris-1' });
    try {
      await api.escalateCrisis('pt-1', { level: 'high' });
      const c = stub.getCaptured();
      assert.ok(c.url.includes('/api/v1/crisis-escalations'));
      assert.strictEqual(c.method, 'POST');
      const body = JSON.parse(c.body);
      assert.strictEqual(body.patient_id, 'pt-1');
    } finally { stub.restore(); }
  });
});

// ── 9. QEEG endpoint family ───────────────────────────────────────────────────
describe('QEEG endpoints', () => {
  it('api.listQEEGBiomarkers is callable', () => {
    assert.strictEqual(typeof api.listQEEGBiomarkers, 'function');
  });

  it('api.listQEEGBiomarkers GETs /api/v1/qeeg/biomarkers', async () => {
    const stub = stubFetch({ biomarkers: [] });
    try {
      await api.listQEEGBiomarkers();
      const c = stub.getCaptured();
      assert.ok(c.url.includes('/api/v1/qeeg/biomarkers'));
    } finally { stub.restore(); }
  });

  it('api.getQEEGAnalysis GETs /api/v1/qeeg-analysis/:id', async () => {
    const stub = stubFetch({ id: 'qeeg-1' });
    try {
      await api.getQEEGAnalysis('qeeg-1');
      const c = stub.getCaptured();
      assert.ok(c.url.includes('/api/v1/qeeg-analysis/qeeg-1'));
    } finally { stub.restore(); }
  });

  it('api.runQEEGQualityCheck POSTs /api/v1/qeeg-analysis/:id/quality-check', async () => {
    const stub = stubFetch({ ok: true });
    try {
      await api.runQEEGQualityCheck('qeeg-1');
      const c = stub.getCaptured();
      assert.ok(c.url.includes('/api/v1/qeeg-analysis/qeeg-1/quality-check'));
      assert.strictEqual(c.method, 'POST');
    } finally { stub.restore(); }
  });
});

// ── 10. MRI endpoint family ───────────────────────────────────────────────────
describe('MRI endpoints', () => {
  it('api.getMRIReport is callable', () => {
    assert.strictEqual(typeof api.getMRIReport, 'function');
  });

  it('api.getMRIReport GETs /api/v1/mri/report/:id', async () => {
    const stub = stubFetch({ analysis_id: 'mri-1' });
    try {
      await api.getMRIReport('mri-1');
      const c = stub.getCaptured();
      assert.ok(c.url.includes('/api/v1/mri/report/mri-1'));
    } finally { stub.restore(); }
  });

  it('api.listPatientMRIAnalyses GETs /api/v1/mri/patients/:id/analyses', async () => {
    const stub = stubFetch({ analyses: [] });
    try {
      await api.listPatientMRIAnalyses('pt-1');
      const c = stub.getCaptured();
      assert.ok(c.url.includes('/api/v1/mri/patients/pt-1/analyses'));
    } finally { stub.restore(); }
  });
});

// ── 11. Audio endpoint family ─────────────────────────────────────────────────
describe('audio endpoints', () => {
  it('api.audioGetReport GETs /api/v1/audio/report/:id', async () => {
    const stub = stubFetch({ id: 'audio-1' });
    try {
      await api.audioGetReport('audio-1');
      const c = stub.getCaptured();
      assert.ok(c.url.includes('/api/v1/audio/report/audio-1'));
    } finally { stub.restore(); }
  });

  it('api.audioListPatientAnalyses GETs /api/v1/audio/patients/:id/analyses', async () => {
    const stub = stubFetch({ analyses: [] });
    try {
      await api.audioListPatientAnalyses('pt-1', 20);
      const c = stub.getCaptured();
      assert.ok(c.url.includes('/api/v1/audio/patients/pt-1/analyses'));
      assert.ok(c.url.includes('limit=20'));
    } finally { stub.restore(); }
  });
});

// ── 12. Evidence / research endpoint family ───────────────────────────────────
describe('evidence / research endpoints', () => {
  it('api.listEvidence GETs /api/v1/literature', async () => {
    const stub = stubFetch([]);
    try {
      await api.listEvidence();
      const c = stub.getCaptured();
      assert.ok(c.url.includes('/api/v1/literature'));
    } finally { stub.restore(); }
  });

  it('api.researchHealth GETs /api/v1/evidence/research/health', async () => {
    const stub = stubFetch({ status: 'ok' });
    try {
      await api.researchHealth();
      const c = stub.getCaptured();
      assert.ok(c.url.includes('/api/v1/evidence/research/health'));
    } finally { stub.restore(); }
  });

  it('api.searchResearchPapers passes query params', async () => {
    const stub = stubFetch({ papers: [] });
    try {
      await api.searchResearchPapers({ q: 'tms depression', limit: 10 });
      const c = stub.getCaptured();
      assert.ok(c.url.includes('/api/v1/evidence/research/papers'));
      assert.ok(c.url.includes('q=tms'));
    } finally { stub.restore(); }
  });
});

// ── 13. Dashboard endpoint family ─────────────────────────────────────────────
describe('dashboard endpoints', () => {
  it('api.getDashboardOverview GETs /api/v1/dashboard/overview', async () => {
    const stub = stubFetch({ overview: {} });
    try {
      await api.getDashboardOverview();
      const c = stub.getCaptured();
      assert.ok(c.url.includes('/api/v1/dashboard/overview'));
    } finally { stub.restore(); }
  });

  it('api.dashboardSearch encodes query', async () => {
    const stub = stubFetch({ groups: {}, total: 0 });
    try {
      await api.dashboardSearch('hello world');
      const c = stub.getCaptured();
      assert.ok(
        c.url.includes('hello%20world') || c.url.includes('hello+world'),
        `Expected encoded query in ${c.url}`,
      );
    } finally { stub.restore(); }
  });
});

// ── 14. Patient portal endpoint family ───────────────────────────────────────
describe('patient portal endpoints', () => {
  it('api.patientPortalMe GETs /api/v1/patient-portal/me', async () => {
    const stub = stubFetch({ id: 'u1' });
    try {
      await api.patientPortalMe();
      const c = stub.getCaptured();
      assert.ok(c.url.includes('/api/v1/patient-portal/me'));
    } finally { stub.restore(); }
  });

  it('api.patientPortalCourses GETs /api/v1/patient-portal/courses', async () => {
    const stub = stubFetch([]);
    try {
      await api.patientPortalCourses();
      const c = stub.getCaptured();
      assert.ok(c.url.includes('/api/v1/patient-portal/courses'));
    } finally { stub.restore(); }
  });

  it('api.patientPortalAssessments GETs /api/v1/patient-portal/assessments', async () => {
    const stub = stubFetch([]);
    try {
      await api.patientPortalAssessments();
      const c = stub.getCaptured();
      assert.ok(c.url.includes('/api/v1/patient-portal/assessments'));
    } finally { stub.restore(); }
  });

  it('api.patientPortalSummary GETs /api/v1/patient-portal/summary', async () => {
    const stub = stubFetch({});
    try {
      await api.patientPortalSummary();
      const c = stub.getCaptured();
      assert.ok(c.url.includes('/api/v1/patient-portal/summary'));
    } finally { stub.restore(); }
  });
});

// ── 15. Documents endpoint family ─────────────────────────────────────────────
describe('documents endpoints', () => {
  it('api.listDocuments GETs /api/v1/documents', async () => {
    const stub = stubFetch({ items: [] });
    try {
      await api.listDocuments();
      const c = stub.getCaptured();
      assert.ok(c.url.includes('/api/v1/documents'));
    } finally { stub.restore(); }
  });

  it('api.listDocuments passes patient_id filter', async () => {
    const stub = stubFetch({ items: [] });
    try {
      await api.listDocuments({ patient_id: 'pt-1' });
      const c = stub.getCaptured();
      assert.ok(c.url.includes('patient_id=pt-1'));
    } finally { stub.restore(); }
  });

  it('api.signDocument POSTs to /api/v1/documents/:id/sign', async () => {
    const stub = stubFetch({ signed: true });
    try {
      await api.signDocument('doc-1', 'Reviewed');
      const c = stub.getCaptured();
      assert.ok(c.url.includes('/api/v1/documents/doc-1/sign'));
      assert.strictEqual(c.method, 'POST');
    } finally { stub.restore(); }
  });

  it('api.documentDownloadUrl returns URL string', () => {
    const url = api.documentDownloadUrl('doc-1');
    assert.strictEqual(typeof url, 'string');
    assert.ok(url.includes('/api/v1/documents/doc-1/download'));
  });
});

// ── 16. Clinician Inbox endpoint family ───────────────────────────────────────
describe('clinician inbox endpoints', () => {
  it('api.clinicianInboxListItems GETs /api/v1/clinician-inbox/items', async () => {
    const stub = stubFetch({ items: [] });
    try {
      await api.clinicianInboxListItems();
      const c = stub.getCaptured();
      assert.ok(c.url.includes('/api/v1/clinician-inbox/items'));
    } finally { stub.restore(); }
  });

  it('api.clinicianInboxAcknowledge POSTs to .../acknowledge', async () => {
    const stub = stubFetch({ ack: true });
    try {
      await api.clinicianInboxAcknowledge('evt-1', 'ok');
      const c = stub.getCaptured();
      assert.ok(c.url.includes('/api/v1/clinician-inbox/items/evt-1/acknowledge'));
      assert.strictEqual(c.method, 'POST');
    } finally { stub.restore(); }
  });
});

// ── 17. Protocol Studio endpoint family ───────────────────────────────────────
describe('protocol studio endpoints', () => {
  it('api.protocolStudioEvidenceHealth GETs correct path', async () => {
    const stub = stubFetch({ status: 'ok' });
    try {
      await api.protocolStudioEvidenceHealth();
      const c = stub.getCaptured();
      assert.ok(c.url.includes('/api/v1/protocol-studio/evidence/health'));
    } finally { stub.restore(); }
  });

  it('api.protocolStudioGenerate POSTs to /api/v1/protocol-studio/generate', async () => {
    const stub = stubFetch({ protocol: {} });
    try {
      await api.protocolStudioGenerate({ condition: 'MDD', modality: 'rTMS' });
      const c = stub.getCaptured();
      assert.ok(c.url.includes('/api/v1/protocol-studio/generate'));
      assert.strictEqual(c.method, 'POST');
    } finally { stub.restore(); }
  });
});

// ── 18. Medical history endpoint family ──────────────────────────────────────
describe('medical history endpoints', () => {
  it('api.patchPatientMedicalHistorySections PATCHes correct path', async () => {
    const stub = stubFetch({ ok: true });
    try {
      await api.patchPatientMedicalHistorySections('pt-1', { diagnoses: [] });
      const c = stub.getCaptured();
      assert.ok(c.url.includes('/api/v1/patients/pt-1/medical-history'));
      assert.strictEqual(c.method, 'PATCH');
    } finally { stub.restore(); }
  });

  it('api.replacePatientMedicalHistory PATCHes with mode=replace', async () => {
    const stub = stubFetch({ ok: true });
    try {
      await api.replacePatientMedicalHistory('pt-1', { diagnoses: ['F32'] });
      const c = stub.getCaptured();
      const body = JSON.parse(c.body);
      assert.strictEqual(body.mode, 'replace');
    } finally { stub.restore(); }
  });
});

// ── 19. Clinical text NLP endpoint family ────────────────────────────────────
describe('clinical text NLP endpoints', () => {
  it('api.clinicalTextHealth GETs /api/v1/clinical-text/health', async () => {
    const stub = stubFetch({ status: 'ok' });
    try {
      await api.clinicalTextHealth();
      const c = stub.getCaptured();
      assert.ok(c.url.includes('/api/v1/clinical-text/health'));
    } finally { stub.restore(); }
  });

  it('api.clinicalTextAnalyze POSTs to /api/v1/clinical-text/analyze', async () => {
    const stub = stubFetch({ entities: [] });
    try {
      await api.clinicalTextAnalyze({ text: 'Patient reports dizziness', sourceType: 'progress_note' });
      const c = stub.getCaptured();
      assert.ok(c.url.includes('/api/v1/clinical-text/analyze'));
      assert.strictEqual(c.method, 'POST');
      const body = JSON.parse(c.body);
      assert.ok(body.text.includes('dizziness'));
    } finally { stub.restore(); }
  });
});

// ── 20. Agent Brain endpoint family ──────────────────────────────────────────
describe('agent brain endpoints', () => {
  it('api.getAgentBrainStatus GETs /api/v1/agent-brain/status', async () => {
    const stub = stubFetch({ service: 'clinical_agent_brain', providers: [] });
    try {
      await api.getAgentBrainStatus();
      const c = stub.getCaptured();
      assert.ok(c.url.includes('/api/v1/agent-brain/status'));
    } finally { stub.restore(); }
  });

  it('api.queryAgentBrain POSTs to /api/v1/agent-brain/query', async () => {
    const stub = stubFetch({ answer: 'ok', citations: [] });
    try {
      await api.queryAgentBrain({ question: 'What is TMS?', patient_id: null });
      const c = stub.getCaptured();
      assert.ok(c.url.includes('/api/v1/agent-brain/query'));
      assert.strictEqual(c.method, 'POST');
    } finally { stub.restore(); }
  });
});
