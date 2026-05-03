import test from 'node:test';
import assert from 'node:assert/strict';

function installLocalStorageStub() {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    },
  });
}

test('cancelSession sends backend-native cancellation fields', async () => {
  installLocalStorageStub();
  let request = null;
  globalThis.fetch = async (url, opts = {}) => {
    request = { url, opts };
    return {
      status: 200,
      ok: true,
      json: async () => ({ id: 'sess-1', status: 'cancelled' }),
    };
  };
  const { api } = await import('./api.js');
  await api.cancelSession('sess-1', { reason: 'Patient requested reschedule' });
  assert.equal(request?.url, 'http://127.0.0.1:8000/api/v1/sessions/sess-1');
  assert.equal(request?.opts?.method, 'PATCH');
  const body = JSON.parse(request?.opts?.body || '{}');
  assert.equal(body.status, 'cancelled');
  assert.equal(body.cancel_reason, 'Patient requested reschedule');
  assert.equal('session_notes' in body, false);
});

test('listClinicians reuses team members with clinician-capable roles', async () => {
  installLocalStorageStub();
  const { api } = await import('./api.js');
  const orig = api.listTeam;
  api.listTeam = async () => ({
    items: [
      { id: 'c-1', display_name: 'Dr. Ada', role: 'clinician' },
      { id: 'a-1', display_name: 'Admin User', role: 'admin' },
      { id: 'r-1', display_name: 'Viewer', role: 'read-only' },
    ],
  });
  try {
    const res = await api.listClinicians();
    assert.deepEqual(res.items.map((row) => row.id), ['c-1', 'a-1']);
  } finally {
    api.listTeam = orig;
  }
});

test('listSessions maps from/to query params to backend start_date/end_date', async () => {
  installLocalStorageStub();
  let requestUrl = null;
  globalThis.fetch = async (url) => {
    requestUrl = url;
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ items: [], total: 0 }),
    };
  };
  const { api } = await import('./api.js');
  await api.listSessions({ from: '2026-05-01', to: '2026-05-07', limit: 100, offset: 0 });
  assert.ok(String(requestUrl).includes('start_date=2026-05-01'));
  assert.ok(String(requestUrl).includes('end_date=2026-05-08'));
});

test('listReferrals delegates to the real leads endpoint', async () => {
  installLocalStorageStub();
  const { api } = await import('./api.js');
  const orig = api.listLeads;
  api.listLeads = async () => ({ items: [{ id: 'lead-1', name: 'Jane Doe' }] });
  try {
    const res = await api.listReferrals();
    assert.deepEqual(res, { items: [{ id: 'lead-1', name: 'Jane Doe' }] });
  } finally {
    api.listLeads = orig;
  }
});

test('renderStoredReport requests the backend HTML/PDF render endpoint with auth', async () => {
  installLocalStorageStub();
  globalThis.localStorage.getItem = (key) => key === 'ds_access_token' ? 'token-123' : null;
  let request = null;
  globalThis.fetch = async (url, opts = {}) => {
    request = { url, opts };
    return {
      ok: true,
      status: 200,
      headers: {
        get: (name) => {
          if (name === 'Content-Type') return 'application/pdf';
          if (name === 'Content-Disposition') return 'attachment; filename="report-abc.pdf"';
          return null;
        },
      },
      blob: async () => new Blob(['pdf-bytes'], { type: 'application/pdf' }),
    };
  };
  const { api } = await import('./api.js');
  const res = await api.renderStoredReport('abc', { format: 'pdf', audience: 'patient' });
  assert.equal(request?.url, 'http://127.0.0.1:8000/api/v1/reports/abc/render?format=pdf&audience=patient');
  assert.equal(request?.opts?.method, 'GET');
  assert.equal(request?.opts?.headers?.Authorization, 'Bearer token-123');
  assert.equal(res.filename, 'report-abc.pdf');
  assert.equal(res.contentType, 'application/pdf');
});

test('MRI report and overlay fetches use authenticated binary requests', async () => {
  installLocalStorageStub();
  globalThis.localStorage.getItem = (key) => key === 'ds_access_token' ? 'token-xyz' : null;
  const requests = [];
  globalThis.fetch = async (url, opts = {}) => {
    requests.push({ url, opts });
    return {
      ok: true,
      status: 200,
      headers: {
        get: (name) => {
          if (name === 'Content-Type') return url.includes('/pdf') ? 'application/pdf' : 'text/html';
          if (name === 'Content-Disposition') return url.includes('/pdf') ? 'inline; filename="mri_report_a1.pdf"' : null;
          return null;
        },
      },
      blob: async () => new Blob(['artifact'], { type: 'application/octet-stream' }),
    };
  };
  const { api } = await import('./api.js');
  const pdf = await api.getMRIReportPdf('a1');
  const html = await api.getMRIReportHtml('a1');
  const overlay = await api.getMRIOverlayHtml('a1', 'target-7');
  assert.equal(requests[0]?.url, 'http://127.0.0.1:8000/api/v1/mri/report/a1/pdf');
  assert.equal(requests[1]?.url, 'http://127.0.0.1:8000/api/v1/mri/report/a1/html');
  assert.equal(requests[2]?.url, 'http://127.0.0.1:8000/api/v1/mri/overlay/a1/target-7');
  assert.equal(requests.every((req) => req.opts?.headers?.Authorization === 'Bearer token-xyz'), true);
  assert.equal(pdf.filename, 'mri_report_a1.pdf');
  assert.equal(html.contentType, 'text/html');
  assert.equal(overlay.contentType, 'text/html');
});

test('qEEG printable report fetch uses authenticated binary request metadata', async () => {
  installLocalStorageStub();
  globalThis.localStorage.getItem = (key) => key === 'ds_access_token' ? 'token-qeeg' : null;
  let request = null;
  globalThis.fetch = async (url, opts = {}) => {
    request = { url, opts };
    return {
      ok: true,
      status: 200,
      headers: {
        get: (name) => {
          if (name === 'Content-Type') return 'text/html; charset=utf-8';
          if (name === 'Content-Disposition') return 'attachment; filename="qeeg_report_r9.html"';
          return null;
        },
      },
      blob: async () => new Blob(['<html></html>'], { type: 'text/html' }),
    };
  };
  const { api } = await import('./api.js');
  const res = await api.getQEEGPrintableReport('a1', 'r9');
  assert.equal(request?.url, 'http://127.0.0.1:8000/api/v1/qeeg-analysis/a1/reports/r9/pdf');
  assert.equal(request?.opts?.method, 'GET');
  assert.equal(request?.opts?.headers?.Authorization, 'Bearer token-qeeg');
  assert.equal(res.filename, 'qeeg_report_r9.html');
  assert.equal(res.contentType, 'text/html; charset=utf-8');
});

test('DeepTwin patient report generation uses the backend patient report endpoint', async () => {
  installLocalStorageStub();
  let request = null;
  globalThis.fetch = async (url, opts = {}) => {
    request = { url, opts };
    return {
      ok: true,
      status: 200,
      json: async () => ({
        patient_id: 'pt-1',
        kind: 'prediction',
        title: 'Prediction report',
        generated_at: '2026-04-27T12:00:00Z',
        data_sources_used: ['qEEG'],
        date_range_days: 90,
        audit_refs: [],
        limitations: ['Demo limitation'],
        review_points: ['Review with clinician'],
        evidence_grade: 'moderate',
        body: { executive_summary: 'Backend report summary.' },
      }),
    };
  };
  const { api } = await import('./api.js');
  const res = await api.generateTwinReport('pt-1', { kind: 'prediction', horizon: '6w', simulation: { scenario_id: 'sim-1' } });
  assert.equal(request?.url, 'http://127.0.0.1:8000/api/v1/deeptwin/patients/pt-1/reports');
  assert.equal(request?.opts?.method, 'POST');
  assert.deepEqual(JSON.parse(request?.opts?.body || '{}'), {
    kind: 'prediction',
    horizon: '6w',
    simulation: { scenario_id: 'sim-1' },
  });
  assert.equal(res.kind, 'prediction');
  assert.equal(res.body.executive_summary, 'Backend report summary.');
});

test('document download fetch uses authenticated binary request metadata', async () => {
  installLocalStorageStub();
  globalThis.localStorage.getItem = (key) => key === 'ds_access_token' ? 'token-doc' : null;
  let request = null;
  globalThis.fetch = async (url, opts = {}) => {
    request = { url, opts };
    return {
      ok: true,
      status: 200,
      headers: {
        get: (name) => {
          if (name === 'Content-Type') return 'application/pdf';
          if (name === 'Content-Disposition') return 'attachment; filename="signed-consent.pdf"';
          return null;
        },
      },
      blob: async () => new Blob(['pdf'], { type: 'application/pdf' }),
    };
  };
  const { api } = await import('./api.js');
  const res = await api.fetchDocumentDownload('doc-7');
  assert.equal(request?.url, 'http://127.0.0.1:8000/api/v1/documents/doc-7/download');
  assert.equal(request?.opts?.method, 'GET');
  assert.equal(request?.opts?.headers?.Authorization, 'Bearer token-doc');
  assert.equal(res.filename, 'signed-consent.pdf');
  assert.equal(res.contentType, 'application/pdf');
});
