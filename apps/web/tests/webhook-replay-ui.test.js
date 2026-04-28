// Phase 11 — admin Stripe webhook replay UI in the Ops tab.
//
// Mirrors the node:test + globalThis.fetch stub style used by
// `agents-prompt-overrides.test.js`. We exercise `pages-agents.js` through
// its `__webhookReplayTestApi__` testing seam rather than driving a full
// DOM, so these tests don't depend on a `<div id="content">` host or the
// surrounding hub chrome.

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

const mod = await import('../src/pages-agents.js');
const api = mod.__webhookReplayTestApi__;

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

// Helper: extract the rendered card's `disabled` attribute from the Replay
// button. Returns true if the button is disabled, false otherwise.
function buttonIsDisabled(html) {
  const m = html.match(/data-test="webhook-replay-btn"[^>]*>/);
  assert.ok(m, 'webhook-replay-btn not found in rendered HTML');
  return /\bdisabled\b/.test(m[0]);
}

// ─── Tests ──────────────────────────────────────────────────────────────────

test('Ops tab is rendered for super-admin (gate matches the existing Ops pattern)', () => {
  setSuperAdminUser();
  api.reset();
  assert.equal(api.isSuperAdmin(), true);
  const strip = api.renderTabStrip();
  assert.match(strip, /Ops/);
  // The replay card itself only renders inside the Ops tab body — verify the
  // card markup is well-formed for super-admin.
  const html = api.renderCard();
  assert.match(html, /data-test="webhook-replay-card"/);
  assert.match(html, /Replay Stripe webhook event/);
});

test('Ops tab (and the replay card with it) is hidden for clinician', () => {
  setClinicianUser();
  api.reset();
  assert.equal(api.isSuperAdmin(), false);
  const strip = api.renderTabStrip();
  // The clinician never sees the Ops tab button — so the card cannot be
  // reached through the UI. This matches the existing pattern asserted by
  // agents-prompt-overrides.test.js.
  assert.doesNotMatch(strip, /Ops/);
  assert.doesNotMatch(strip, /Activation/);
  assert.doesNotMatch(strip, /Prompts/);
});

test('Replay button is disabled when the input is empty', () => {
  setSuperAdminUser();
  api.reset();
  const html = api.renderCard();
  assert.equal(buttonIsDisabled(html), true);
});

test('Replay button is disabled when the input is "foo" (no evt_ prefix)', () => {
  setSuperAdminUser();
  api.reset();
  api.setInput('foo');
  const html = api.renderCard();
  assert.equal(buttonIsDisabled(html), true);
});

test('Replay button is enabled when the input is "evt_test123"', () => {
  setSuperAdminUser();
  api.reset();
  api.setInput('evt_test123');
  const html = api.renderCard();
  assert.equal(buttonIsDisabled(html), false);
});

test('Click Replay → confirm() returns true → POST is called with {event_id}', async () => {
  setSuperAdminUser();
  api.reset();
  api.setInput('evt_test123');
  globalThis.window.confirm = () => true;

  const requests = [];
  globalThis.fetch = async (url, opts = {}) => {
    requests.push({ url: String(url), opts });
    return {
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        event_type: 'invoice.payment_succeeded',
        replayed_at: '2026-04-28T12:00:00Z',
        result: { handled: true },
      }),
    };
  };

  await globalThis.window._agentOpsWebhookReplaySubmit();

  assert.equal(requests.length, 1, 'exactly one POST issued');
  const req = requests[0];
  assert.match(req.url, /\/api\/v1\/agent-billing\/admin\/webhook-replay$/);
  assert.equal((req.opts.method || 'GET'), 'POST');
  const body = JSON.parse(req.opts.body || '{}');
  assert.deepEqual(body, { event_id: 'evt_test123' });
});

test('Click Replay → confirm() returns false → no POST issued', async () => {
  setSuperAdminUser();
  api.reset();
  api.setInput('evt_test123');
  globalThis.window.confirm = () => false;

  let called = false;
  globalThis.fetch = async () => {
    called = true;
    return { ok: true, status: 200, json: async () => ({}) };
  };

  await globalThis.window._agentOpsWebhookReplaySubmit();
  assert.equal(called, false, 'no fetch was issued when confirm returned false');
  // And no result panel has been populated.
  assert.equal(api.getState().result, null);
});

test('Successful response renders a green panel with ok: true content', async () => {
  setSuperAdminUser();
  api.reset();
  api.setInput('evt_ok_1');
  globalThis.window.confirm = () => true;

  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      ok: true,
      event_type: 'invoice.payment_succeeded',
      replayed_at: '2026-04-28T12:00:00Z',
      result: { handled: true },
    }),
  });

  await globalThis.window._agentOpsWebhookReplaySubmit();

  const html = api.renderCard();
  assert.match(html, /data-test="webhook-replay-result"/);
  // Green panel — backed by --green CSS variable.
  assert.match(html, /var\(--green/);
  // OK badge text.
  assert.match(html, />OK</);
  // JSON body surfaced.
  assert.match(html, /data-test="webhook-replay-json"/);
  assert.match(html, /&quot;ok&quot;: true/);
  assert.match(html, /invoice\.payment_succeeded/);
});

test('404 response renders an amber panel with "Event not found" message', async () => {
  setSuperAdminUser();
  api.reset();
  api.setInput('evt_missing');
  globalThis.window.confirm = () => true;

  globalThis.fetch = async () => ({
    ok: false,
    status: 404,
    json: async () => ({ ok: false, error: 'event_not_found' }),
  });

  await globalThis.window._agentOpsWebhookReplaySubmit();

  const html = api.renderCard();
  assert.match(html, /data-test="webhook-replay-result"/);
  // Amber panel.
  assert.match(html, /var\(--amber/);
  assert.match(html, /Event not found/);
  // Body still rendered for diagnostic context.
  assert.match(html, /event_not_found/);
});

test('500 response renders a red panel with the error envelope', async () => {
  setSuperAdminUser();
  api.reset();
  api.setInput('evt_boom');
  globalThis.window.confirm = () => true;

  globalThis.fetch = async () => ({
    ok: false,
    status: 500,
    json: async () => ({ ok: false, error: 'handler_crashed' }),
  });

  await globalThis.window._agentOpsWebhookReplaySubmit();

  const html = api.renderCard();
  assert.match(html, /data-test="webhook-replay-result"/);
  // Red panel.
  assert.match(html, /var\(--red/);
  assert.match(html, /HTTP 500/);
  assert.match(html, /handler_crashed/);
});

test('Network error renders a red panel with the error message', async () => {
  setSuperAdminUser();
  api.reset();
  api.setInput('evt_neterr');
  globalThis.window.confirm = () => true;

  globalThis.fetch = async () => {
    throw new Error('network down');
  };

  await globalThis.window._agentOpsWebhookReplaySubmit();

  const html = api.renderCard();
  assert.match(html, /data-test="webhook-replay-result"/);
  assert.match(html, /var\(--red/);
  assert.match(html, /Error/);
  assert.match(html, /network down/);
});
