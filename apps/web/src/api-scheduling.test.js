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
  assert.equal(body.session_notes, '[Cancelled] Patient requested reschedule');
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
