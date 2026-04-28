// Phase 9 — admin Prompt Overrides UI tab.
//
// Mirrors the node:test + globalThis.fetch stub style used by the other
// pages-* tests in this folder. We exercise `pages-agents.js` through its
// `__promptOverridesTestApi__` testing seam rather than driving the live
// DOM, so these tests don't depend on a full `<div id="content">` host or
// the surrounding hub chrome.

import test from 'node:test';
import assert from 'node:assert/strict';

// ─── globalThis stubs ───────────────────────────────────────────────────────
function installLocalStorageStub(initial = {}) {
  const store = { ...initial };
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: {
      getItem(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
      setItem(k, v) { store[k] = String(v); },
      removeItem(k) { delete store[k]; },
      _store: store,
    },
  });
}

if (typeof globalThis.window === 'undefined') {
  globalThis.window = globalThis;
}
if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => ({ style: {}, addEventListener() {}, appendChild() {} }),
    body: { appendChild() {} },
  };
}
if (typeof globalThis.sessionStorage === 'undefined') {
  globalThis.sessionStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
}

// Default fetch stub that fails — every test that hits the network installs
// its own. Catches accidental hidden network calls.
globalThis.fetch = async () => {
  throw new Error('fetch not stubbed');
};

// Pre-install a default localStorage so the module-load side effects (which
// read `ds_agent_provider`, `ds_agent_oa_key`, etc.) don't blow up.
installLocalStorageStub();

const mod = await import('./pages-agents.js');
const api = mod.__promptOverridesTestApi__;

// Convenience setters for the per-test localStorage user role. Super-admin =
// role==='admin' AND clinic_id is null/undefined; clinician = anything else.
function setSuperAdminUser() {
  installLocalStorageStub({
    ds_user: JSON.stringify({ role: 'admin', clinic_id: null, name: 'Root Admin' }),
  });
}
function setClinicianUser() {
  installLocalStorageStub({
    ds_user: JSON.stringify({ role: 'clinician', clinic_id: 'clinic-oxford', name: 'Dr Demo' }),
  });
}

// 7 catalog agents — matches the Phase 9 brief's "table of all 7 agents".
const SEVEN_AGENTS = [
  { id: 'clinic.reception', name: 'Reception Agent' },
  { id: 'clinic.reporting', name: 'Reporting Agent' },
  { id: 'clinic.drclaw_telegram', name: 'DrClaw (Telegram)' },
  { id: 'patient.care_companion', name: 'Care Companion' },
  { id: 'patient.adherence', name: 'Adherence' },
  { id: 'patient.education', name: 'Education' },
  { id: 'patient.crisis', name: 'Crisis' },
];

// ─── Tests ──────────────────────────────────────────────────────────────────

test('Prompts tab is rendered for super-admin', () => {
  setSuperAdminUser();
  api.reset();
  assert.equal(api.isSuperAdmin(), true);
  const html = api.renderTabStrip();
  assert.match(html, /Prompts/);
  // Sanity — Activation and Ops still there too.
  assert.match(html, /Activation/);
  assert.match(html, /Ops/);
});

test('Prompts tab is hidden for non-super-admin (clinician)', () => {
  setClinicianUser();
  api.reset();
  assert.equal(api.isSuperAdmin(), false);
  const html = api.renderTabStrip();
  assert.doesNotMatch(html, /Prompts/);
  assert.doesNotMatch(html, /Activation/);
  assert.doesNotMatch(html, /Ops/);
});

test('Initial fetch populates the table; rows show "Default" badge when no override exists', async () => {
  setSuperAdminUser();
  api.reset();

  // Stub the GET — empty overrides list.
  let getUrl = null;
  globalThis.fetch = async (url, opts = {}) => {
    if ((opts.method || 'GET') === 'GET' && /\/admin\/prompt-overrides$/.test(String(url))) {
      getUrl = url;
      return {
        ok: true,
        status: 200,
        json: async () => ({ overrides: [] }),
      };
    }
    throw new Error('unexpected fetch: ' + url);
  };

  await api.fetchOverrides();
  assert.match(String(getUrl), /\/api\/v1\/agents\/admin\/prompt-overrides$/);

  const html = api.renderSection(SEVEN_AGENTS);
  // Every agent renders a Default badge and no Custom badge.
  for (const a of SEVEN_AGENTS) {
    assert.match(html, new RegExp(`prompts-row-${a.id.replace('.', '\\.')}`));
  }
  const defaultMatches = html.match(/data-test="prompts-badge-default"/g) || [];
  const customMatches = html.match(/data-test="prompts-badge-custom"/g) || [];
  assert.equal(defaultMatches.length, SEVEN_AGENTS.length, 'every row should show Default');
  assert.equal(customMatches.length, 0, 'no row should show Custom when list is empty');
});

test('Rows show "Custom" badge when an enabled override exists for the agent', async () => {
  setSuperAdminUser();
  api.reset();

  globalThis.fetch = async (url, opts = {}) => {
    if ((opts.method || 'GET') === 'GET') {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          overrides: [
            {
              id: 'ovr-1',
              agent_id: 'clinic.reception',
              clinic_id: null,
              system_prompt: 'You are a friendlier reception agent.',
              version: 2,
              enabled: true,
              created_at: '2026-04-20T10:00:00Z',
              created_by: 'admin-1',
            },
          ],
        }),
      };
    }
    throw new Error('unexpected fetch: ' + url);
  };

  await api.fetchOverrides();
  const html = api.renderSection(SEVEN_AGENTS);
  // The reception row should be Custom.
  const receptionRowIdx = html.indexOf('prompts-row-clinic.reception');
  assert.ok(receptionRowIdx >= 0);
  const receptionRowSlice = html.slice(receptionRowIdx, receptionRowIdx + 600);
  assert.match(receptionRowSlice, /data-test="prompts-badge-custom"/);

  // The reporting row should still be Default.
  const reportingRowIdx = html.indexOf('prompts-row-clinic.reporting');
  const reportingRowSlice = html.slice(reportingRowIdx, reportingRowIdx + 600);
  assert.match(reportingRowSlice, /data-test="prompts-badge-default"/);
});

test('Save flow: clicking Save POSTs with the right body', async () => {
  setSuperAdminUser();
  api.reset();

  // Seed list with empty overrides so Save POSTs a fresh row.
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ overrides: [] }),
  });
  await api.fetchOverrides();

  // Open the editor for clinic.reception.
  globalThis.window._agentPromptOverrideEdit('clinic.reception');
  assert.equal(api.getState().editingAgentId, 'clinic.reception');

  // Type a draft (mirrors the textarea oninput handler).
  globalThis.window._agentPromptOverrideDraftInput('Be precise. Cite sources.');

  // Capture the POST.
  const requests = [];
  globalThis.fetch = async (url, opts = {}) => {
    requests.push({ url: String(url), opts });
    if ((opts.method || 'GET') === 'POST') {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: 'ovr-new',
          agent_id: 'clinic.reception',
          clinic_id: null,
          system_prompt: 'Be precise. Cite sources.',
          version: 1,
          enabled: true,
          created_at: '2026-04-28T12:00:00Z',
          created_by: 'admin-1',
        }),
      };
    }
    // GET re-fetch after save.
    return {
      ok: true,
      status: 200,
      json: async () => ({
        overrides: [
          {
            id: 'ovr-new',
            agent_id: 'clinic.reception',
            clinic_id: null,
            system_prompt: 'Be precise. Cite sources.',
            version: 1,
            enabled: true,
            created_at: '2026-04-28T12:00:00Z',
            created_by: 'admin-1',
          },
        ],
      }),
    };
  };

  await globalThis.window._agentPromptOverrideSave('clinic.reception');

  // The first request should be the POST.
  const post = requests.find(r => (r.opts.method || 'GET') === 'POST');
  assert.ok(post, 'a POST request was issued');
  assert.match(post.url, /\/api\/v1\/agents\/admin\/prompt-overrides$/);
  const body = JSON.parse(post.opts.body || '{}');
  assert.equal(body.agent_id, 'clinic.reception');
  assert.equal(body.system_prompt, 'Be precise. Cite sources.');

  // After save the editor is closed and a success notice shown.
  const state = api.getState();
  assert.equal(state.editingAgentId, null);
  assert.ok(state.notice, 'a notice is set');
  assert.equal(state.notice.kind, 'success');
});

test('Reset flow: clicking Reset (after confirm()) DELETEs the override', async () => {
  setSuperAdminUser();
  api.reset();

  // Seed an existing enabled override.
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      overrides: [
        {
          id: 'ovr-42',
          agent_id: 'clinic.reception',
          clinic_id: null,
          system_prompt: 'old prompt',
          version: 3,
          enabled: true,
          created_at: '2026-04-19T10:00:00Z',
          created_by: 'admin-1',
        },
      ],
    }),
  });
  await api.fetchOverrides();

  // Stub confirm() to true — user proceeds.
  globalThis.window.confirm = () => true;

  const requests = [];
  globalThis.fetch = async (url, opts = {}) => {
    requests.push({ url: String(url), opts });
    if ((opts.method || 'GET') === 'DELETE') {
      return { ok: true, status: 200, json: async () => ({}) };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ overrides: [] }),
    };
  };

  await globalThis.window._agentPromptOverrideReset('clinic.reception');

  const del = requests.find(r => (r.opts.method || 'GET') === 'DELETE');
  assert.ok(del, 'a DELETE request was issued');
  // DELETE path uses the override row id.
  assert.match(del.url, /\/api\/v1\/agents\/admin\/prompt-overrides\/ovr-42$/);

  const state = api.getState();
  assert.ok(state.notice, 'a notice is set after reset');
  assert.equal(state.notice.kind, 'success');
});

test('Reset flow: confirm() returning false skips the DELETE', async () => {
  setSuperAdminUser();
  api.reset();

  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      overrides: [
        {
          id: 'ovr-9',
          agent_id: 'clinic.reception',
          clinic_id: null,
          system_prompt: 'old',
          version: 1,
          enabled: true,
          created_at: '2026-04-19T10:00:00Z',
          created_by: 'admin-1',
        },
      ],
    }),
  });
  await api.fetchOverrides();

  globalThis.window.confirm = () => false;

  let called = false;
  globalThis.fetch = async () => { called = true; return { ok: true, status: 200, json: async () => ({}) }; };

  await globalThis.window._agentPromptOverrideReset('clinic.reception');
  assert.equal(called, false, 'no fetch was issued when confirm returned false');
});

test('Save flow: API error surfaces as inline editor error', async () => {
  setSuperAdminUser();
  api.reset();

  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ overrides: [] }),
  });
  await api.fetchOverrides();

  globalThis.window._agentPromptOverrideEdit('clinic.reception');
  globalThis.window._agentPromptOverrideDraftInput('A new prompt that fails to save.');

  globalThis.fetch = async (url, opts = {}) => {
    if ((opts.method || 'GET') === 'POST') {
      return {
        ok: false,
        status: 500,
        json: async () => ({ detail: 'Database write failed.' }),
      };
    }
    return { ok: true, status: 200, json: async () => ({ overrides: [] }) };
  };

  await globalThis.window._agentPromptOverrideSave('clinic.reception');

  const state = api.getState();
  assert.equal(state.editingAgentId, 'clinic.reception', 'editor stays open on error');
  assert.match(state.editorError || '', /Database write failed/);

  // The render path surfaces it inline below the editor.
  const html = api.renderSection(SEVEN_AGENTS);
  assert.match(html, /data-test="prompts-editor-error"/);
  assert.match(html, /Database write failed/);
});

test('Empty draft is rejected client-side without a network call', async () => {
  setSuperAdminUser();
  api.reset();

  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ overrides: [] }),
  });
  await api.fetchOverrides();

  globalThis.window._agentPromptOverrideEdit('clinic.reception');
  globalThis.window._agentPromptOverrideDraftInput('   '); // whitespace only

  let called = false;
  globalThis.fetch = async () => { called = true; return { ok: true, status: 200, json: async () => ({}) }; };

  await globalThis.window._agentPromptOverrideSave('clinic.reception');
  assert.equal(called, false, 'empty draft does not POST');
  assert.match(api.getState().editorError || '', /cannot be empty/i);
});

test('Editor is opened with the existing system prompt pre-filled when the override is Custom', async () => {
  setSuperAdminUser();
  api.reset();

  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      overrides: [
        {
          id: 'ovr-7',
          agent_id: 'clinic.reporting',
          clinic_id: null,
          system_prompt: 'Be terse. Numbers only.',
          version: 5,
          enabled: true,
          created_at: '2026-04-25T10:00:00Z',
          created_by: 'admin-1',
        },
      ],
    }),
  });
  await api.fetchOverrides();

  globalThis.window._agentPromptOverrideEdit('clinic.reporting');
  const state = api.getState();
  assert.equal(state.editingAgentId, 'clinic.reporting');
  assert.equal(state.draft, 'Be terse. Numbers only.');

  // Render contains the textarea seeded with the prompt.
  const html = api.renderSection(SEVEN_AGENTS);
  assert.match(html, /prompts-textarea/);
  assert.match(html, /Be terse\. Numbers only\./);
  // Reset button only renders for Custom rows in the open editor.
  assert.match(html, /data-test="prompts-reset-btn"/);
});
