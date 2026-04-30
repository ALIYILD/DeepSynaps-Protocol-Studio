// Phase 12 — admin Prompt-override version-history drawer.
//
// Mirrors the node:test + globalThis.fetch stub style used by
// `agents-prompt-overrides.test.js` and `webhook-replay-ui.test.js`. We
// drive `pages-agents.js` through its `__promptHistoryTestApi__` testing
// seam rather than the live DOM, so these tests don't depend on a
// `<div id="content">` host or the surrounding hub chrome.

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

// Pre-install a default localStorage so the module-load side effects don't
// blow up on `JSON.parse(localStorage.getItem('ds_user'))`.
installLocalStorageStub();

const mod = await import('../src/pages-agents.js');
const api = mod.__promptHistoryTestApi__;

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

// Catalog rows used across the history tests. Two agents is enough to
// confirm the drawer is per-row and only one is open at a time.
const TWO_AGENTS = [
  { id: 'clinic.reception', name: 'Reception Agent' },
  { id: 'clinic.reporting', name: 'Reporting Agent' },
];

// Three-version DESC fixture matching the Phase 11C contract:
//   GET /api/v1/agents/admin/prompt-overrides/{agent_id}/history
const THREE_VERSION_HISTORY = {
  agent_id: 'clinic.reception',
  history: [
    {
      id: 'h-3', version: 3, system_prompt: 'You are a friendly receptionist.\nAlways thank the patient.\nClose with a warm sign-off.',
      created_at: '2026-04-25T11:00:00Z', created_by_id: 'admin-1', deactivated_at: null, is_active: true,
    },
    {
      id: 'h-2', version: 2, system_prompt: 'You are a friendly receptionist.\nAlways thank the patient.',
      created_at: '2026-04-22T09:30:00Z', created_by_id: 'admin-1', deactivated_at: '2026-04-25T11:00:00Z', is_active: false,
    },
    {
      id: 'h-1', version: 1, system_prompt: 'You are a receptionist.',
      created_at: '2026-04-19T08:00:00Z', created_by_id: 'admin-2', deactivated_at: '2026-04-22T09:30:00Z', is_active: false,
    },
  ],
};

// Wait for an in-flight `_fetchPromptHistory` to settle. The toggle handler
// fires the fetch but the test wraps it with `.finally()` for the re-render —
// awaiting on the next tick is enough since our fetch stubs resolve synchronously.
async function flush() {
  await new Promise(r => setImmediate(r));
  await new Promise(r => setImmediate(r));
}

// ─── Tests ──────────────────────────────────────────────────────────────────

test('History button renders for super-admin in the Prompts table', () => {
  setSuperAdminUser();
  api.reset();
  api.seedOverrides([]);
  assert.equal(api.isSuperAdmin(), true);
  const html = api.renderSection(TWO_AGENTS);
  // Both rows render a History button.
  assert.match(html, /data-test="prompts-history-btn-clinic\.reception"/);
  assert.match(html, /data-test="prompts-history-btn-clinic\.reporting"/);
});

test('Clicking History opens the drawer and calls the history endpoint', async () => {
  setSuperAdminUser();
  api.reset();
  api.seedOverrides([]);

  let calledUrl = null;
  globalThis.fetch = async (url, opts = {}) => {
    if ((opts.method || 'GET') === 'GET' && /\/admin\/prompt-overrides\/clinic\.reception\/history/.test(String(url))) {
      calledUrl = String(url);
      return { ok: true, status: 200, json: async () => THREE_VERSION_HISTORY };
    }
    throw new Error('unexpected fetch: ' + url);
  };

  globalThis.window._agentPromptHistoryToggle('clinic.reception');
  await flush();

  assert.equal(api.getState().openAgentId, 'clinic.reception');
  assert.ok(calledUrl, 'history endpoint was hit');
  assert.match(calledUrl, /\/api\/v1\/agents\/admin\/prompt-overrides\/clinic\.reception\/history(\?|$)/);
  assert.match(calledUrl, /limit=20/);
});

test('Empty-history response renders the empty-state copy', async () => {
  setSuperAdminUser();
  api.reset();
  api.seedOverrides([]);

  globalThis.fetch = async () => ({
    ok: true, status: 200,
    json: async () => ({ agent_id: 'clinic.reception', history: [] }),
  });

  globalThis.window._agentPromptHistoryToggle('clinic.reception');
  await flush();

  const html = api.renderSection(TWO_AGENTS);
  assert.match(html, /data-test="prompts-history-empty"/);
  assert.match(html, /No history yet/);
  assert.match(html, /default prompt/);
});

test('Three-version response renders three rows in DESC order with the right buttons', async () => {
  setSuperAdminUser();
  api.reset();
  api.seedOverrides([]);

  globalThis.fetch = async () => ({
    ok: true, status: 200, json: async () => THREE_VERSION_HISTORY,
  });

  globalThis.window._agentPromptHistoryToggle('clinic.reception');
  await flush();

  const html = api.renderSection(TWO_AGENTS);

  // Three rows present.
  assert.match(html, /data-test="prompts-history-version-row-clinic\.reception-3"/);
  assert.match(html, /data-test="prompts-history-version-row-clinic\.reception-2"/);
  assert.match(html, /data-test="prompts-history-version-row-clinic\.reception-1"/);

  // DESC ordering: v3 should appear before v2, which appears before v1.
  const idx3 = html.indexOf('prompts-history-version-row-clinic.reception-3');
  const idx2 = html.indexOf('prompts-history-version-row-clinic.reception-2');
  const idx1 = html.indexOf('prompts-history-version-row-clinic.reception-1');
  assert.ok(idx3 >= 0 && idx2 > idx3 && idx1 > idx2, 'rows render DESC by version');

  // The active version (v3) shows the "active" pill.
  assert.match(html, /data-test="prompts-history-active"/);
});

test('Diff-vs-previous button is disabled on the oldest row, enabled on the rest', async () => {
  setSuperAdminUser();
  api.reset();
  api.seedOverrides([]);

  globalThis.fetch = async () => ({
    ok: true, status: 200, json: async () => THREE_VERSION_HISTORY,
  });

  globalThis.window._agentPromptHistoryToggle('clinic.reception');
  await flush();

  const html = api.renderSection(TWO_AGENTS);

  // Slice each diff button out of the rendered HTML and assert disabled flag.
  function diffBtnFor(version) {
    const re = new RegExp(`data-test="prompts-history-diff-btn-clinic\\.reception-${version}"[^>]*>`);
    const m = html.match(re);
    assert.ok(m, `diff button for v${version} missing`);
    return m[0];
  }
  assert.ok(/\bdisabled\b/.test(diffBtnFor(1)), 'oldest (v1) diff button should be disabled');
  assert.ok(!/\bdisabled\b/.test(diffBtnFor(2)), 'v2 diff button should be enabled');
  assert.ok(!/\bdisabled\b/.test(diffBtnFor(3)), 'v3 (newest) diff button should be enabled');
});

test('Clicking Diff vs previous renders both added and removed lines', async () => {
  setSuperAdminUser();
  api.reset();
  api.seedOverrides([]);

  globalThis.fetch = async () => ({
    ok: true, status: 200, json: async () => THREE_VERSION_HISTORY,
  });

  globalThis.window._agentPromptHistoryToggle('clinic.reception');
  await flush();

  // Open the diff for v2 (vs v1: "You are a receptionist." → "You are a
  // friendly receptionist.\nAlways thank the patient.").
  globalThis.window._agentPromptHistoryDiffToggle('clinic.reception', 2);
  const html = api.renderSection(TWO_AGENTS);

  assert.match(html, /data-test="prompts-history-diff-row-clinic\.reception-2"/);
  // The diff fixture differs in both directions: v1's "You are a receptionist."
  // is removed, and v2 adds the friendlier prompt + a thank-you line.
  assert.match(html, /data-test="prompt-diff-add"/);
  assert.match(html, /data-test="prompt-diff-del"/);

  // Sanity: diff helper produces both kinds standalone too.
  const lines = api.diffLines('alpha\nbeta', 'alpha\ngamma');
  assert.ok(lines.some(l => l.kind === 'add'), 'diffLines produces an add');
  assert.ok(lines.some(l => l.kind === 'del'), 'diffLines produces a del');
  assert.ok(lines.some(l => l.kind === 'eq'), 'diffLines produces an eq for unchanged lines');
});

test('Re-clicking History collapses the drawer (toggle behaviour)', async () => {
  setSuperAdminUser();
  api.reset();
  api.seedOverrides([]);

  globalThis.fetch = async () => ({
    ok: true, status: 200, json: async () => THREE_VERSION_HISTORY,
  });

  globalThis.window._agentPromptHistoryToggle('clinic.reception');
  await flush();
  assert.equal(api.getState().openAgentId, 'clinic.reception');

  globalThis.window._agentPromptHistoryToggle('clinic.reception');
  assert.equal(api.getState().openAgentId, null, 'second click closes the drawer');

  const html = api.renderSection(TWO_AGENTS);
  assert.doesNotMatch(html, /data-test="prompts-history-row-clinic\.reception"/);
});

test('Network error surfaces a red inline message inside the drawer', async () => {
  setSuperAdminUser();
  api.reset();
  api.seedOverrides([]);

  globalThis.fetch = async () => ({
    ok: false, status: 500,
    json: async () => ({ detail: 'kaboom' }),
  });

  globalThis.window._agentPromptHistoryToggle('clinic.reception');
  await flush();

  const html = api.renderSection(TWO_AGENTS);
  assert.match(html, /data-test="prompts-history-error"/);
  assert.match(html, /Failed to load history/);
});
