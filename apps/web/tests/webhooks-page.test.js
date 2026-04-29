// Phase 13 — admin Stripe webhook event browser page.
//
// Mirrors the node:test + globalThis.fetch stub style used by
// `billing-page.test.js`. We exercise `pages-webhooks.js` through its
// `__webhooksPageTestApi__` testing seam plus a minimal DOM stub so handler
// side-effects (renders, fetch URL params, replay flow) are observable
// without a real browser.

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

function installSessionStorageStub() {
  if (typeof globalThis.sessionStorage === 'undefined') {
    globalThis.sessionStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  }
}

// Minimal DOM — enough for innerHTML assignment and getElementById lookups.
function installDomStub() {
  const elements = new Map();
  const make = (id) => {
    let html = '';
    const el = {
      id,
      style: {},
      set innerHTML(v) { html = String(v); },
      get innerHTML() { return html; },
      addEventListener() {},
      removeEventListener() {},
      appendChild() {},
      querySelector: () => null,
      querySelectorAll: () => [],
    };
    elements.set(id, el);
    return el;
  };
  const content = make('content');
  globalThis.document = {
    getElementById(id) { return elements.get(id) || null; },
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => ({ style: {}, addEventListener() {}, appendChild() {} }),
    body: { appendChild() {} },
    _ensureEl: make,
    _content: content,
  };
}

if (typeof globalThis.window === 'undefined') {
  globalThis.window = globalThis;
}
installSessionStorageStub();
installLocalStorageStub();
installDomStub();

// Default fetch stub that fails — every test that hits the network installs
// its own. Catches accidental hidden network calls.
globalThis.fetch = async () => {
  throw new Error('fetch not stubbed');
};

const mod = await import('../src/pages-webhooks.js');
const api = mod.__webhooksPageTestApi__;

function setSuperAdminUser() {
  installLocalStorageStub({
    ds_user: JSON.stringify({ role: 'admin', clinic_id: null, name: 'Root Admin' }),
    ds_token: 'demo-token-webhooks',
  });
}
function setClinicianUser() {
  installLocalStorageStub({
    ds_user: JSON.stringify({ role: 'clinician', clinic_id: 'clinic-oxford', name: 'Dr Demo' }),
    ds_token: 'demo-token-clinician',
  });
}

function resetAll() {
  api.reset();
  setSuperAdminUser();
}

// Helper: install a fetch stub that records every call and returns
// successive responses from the queue (or the last one repeated).
function installFetchQueue(responses) {
  const calls = [];
  const queue = responses.slice();
  globalThis.fetch = async (url, opts = {}) => {
    calls.push({ url: String(url), opts });
    const next = queue.length > 1 ? queue.shift() : queue[0];
    return typeof next === 'function' ? next() : next;
  };
  return calls;
}

const okJson = (body) => ({
  ok: true,
  status: 200,
  json: async () => body,
});

// ─── Tests ──────────────────────────────────────────────────────────────────

test('Page renders heading + filter row + empty table message for super-admin', () => {
  resetAll();
  const html = api.mount();
  assert.match(html, /data-test="webhooks-page"/);
  assert.match(html, /data-test="webhooks-heading"/);
  assert.match(html, /Stripe webhook events/);
  assert.match(html, /data-test="webhooks-filters"/);
  assert.match(html, /data-test="webhooks-since-7d"/);
  assert.match(html, /data-test="webhooks-event-type-input"/);
  assert.match(html, /data-test="webhooks-empty"/);
  // No fetch error or table rendered yet.
  assert.doesNotMatch(html, /data-test="webhooks-fetch-error"/);
  assert.doesNotMatch(html, /data-test="webhooks-table"/);
});

test('Non-super-admin sees the forbidden notice instead of the table', () => {
  api.reset();
  setClinicianUser();
  const html = api.mount();
  assert.match(html, /data-test="webhooks-forbidden"/);
  assert.doesNotMatch(html, /data-test="webhooks-filters"/);
  assert.doesNotMatch(html, /data-test="webhooks-table"/);
});

test('Initial fetch hits the listing endpoint with default params', async () => {
  resetAll();
  const calls = installFetchQueue([okJson({ since_days: 7, rows: [] })]);

  await api.fetchList();

  assert.equal(calls.length, 1, 'exactly one GET issued');
  const req = calls[0];
  assert.match(req.url, /\/api\/v1\/agent-billing\/admin\/webhook-events\?/);
  assert.match(req.url, /limit=50/);
  assert.match(req.url, /since_days=7/);
  // No event_type filter on the default fetch.
  assert.doesNotMatch(req.url, /event_type=/);
  // Bearer token forwarded.
  assert.equal(req.opts.headers['Authorization'], 'Bearer demo-token-webhooks');
});

test('Selecting "30d" pill + Apply re-fetches with since_days=30', async () => {
  resetAll();
  const calls = installFetchQueue([okJson({ since_days: 30, rows: [] })]);

  api.setSince(30);
  await api.apply();

  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /since_days=30/);
  assert.equal(api.getState().sinceDays, 30);
});

test('Typing in event_type input + Apply re-fetches with the filter', async () => {
  resetAll();
  const calls = installFetchQueue([okJson({ since_days: 7, rows: [] })]);

  api.setEventTypeInput('checkout.session.completed');
  await api.apply();

  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /event_type=checkout\.session\.completed/);
  assert.equal(api.getState().appliedEventType, 'checkout.session.completed');
});

test('Click Replay → confirm() true → POSTs to replay endpoint with event_id', async () => {
  resetAll();
  // Seed a row so the replay handler has something to act on.
  api.setRows([
    { id: 'evt_seeded', event_id: 'evt_seeded', event_type: 'checkout.session.completed', received_at: '2026-04-28T12:00:00Z', processed: true },
  ]);
  globalThis.window.confirm = () => true;

  const calls = installFetchQueue([
    okJson({ ok: true, event_id: 'evt_seeded', result: { applied: true } }),
    okJson({ since_days: 7, rows: [] }),  // refresh fetch after success
  ]);

  await api.replay('evt_seeded');

  // First call is the replay POST.
  assert.ok(calls.length >= 1);
  const replayCall = calls[0];
  assert.match(replayCall.url, /\/api\/v1\/agent-billing\/admin\/webhook-replay$/);
  assert.equal(replayCall.opts.method, 'POST');
  const body = JSON.parse(replayCall.opts.body || '{}');
  assert.deepEqual(body, { event_id: 'evt_seeded' });
});

test('Replay confirm() returns false → no POST issued', async () => {
  resetAll();
  api.setRows([
    { id: 'evt_x', event_id: 'evt_x', event_type: 'foo', received_at: '2026-04-28T12:00:00Z', processed: true },
  ]);
  globalThis.window.confirm = () => false;

  let called = false;
  globalThis.fetch = async () => {
    called = true;
    return okJson({});
  };

  await api.replay('evt_x');
  assert.equal(called, false, 'no fetch was issued when confirm returned false');
});

test('Replay success refreshes the list and shows a green toast', async () => {
  resetAll();
  api.setRows([
    { id: 'evt_seeded', event_id: 'evt_seeded', event_type: 'checkout.session.completed', received_at: '2026-04-28T12:00:00Z', processed: true },
  ]);
  globalThis.window.confirm = () => true;

  const calls = installFetchQueue([
    okJson({ ok: true, event_id: 'evt_seeded', result: { applied: true } }),
    okJson({
      since_days: 7,
      rows: [
        { id: 'evt_seeded', event_id: 'evt_seeded', event_type: 'checkout.session.completed', received_at: '2026-04-28T12:30:00Z', processed: true },
      ],
    }),
  ]);

  await api.replay('evt_seeded');

  // Two calls: the replay POST + the refresh GET.
  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /webhook-replay$/);
  assert.match(calls[1].url, /webhook-events\?/);

  const state = api.getState();
  assert.ok(state.toast, 'toast should be set on success');
  assert.equal(state.toast.kind, 'ok');

  const html = api.render();
  assert.match(html, /data-test="webhooks-toast"/);
  assert.match(html, /Replayed evt_seeded/);
});

test('Replay error response → red inline row error, list NOT refreshed', async () => {
  resetAll();
  api.setRows([
    { id: 'evt_bad', event_id: 'evt_bad', event_type: 'foo', received_at: '2026-04-28T12:00:00Z', processed: true },
  ]);
  globalThis.window.confirm = () => true;

  const calls = installFetchQueue([
    {
      ok: false,
      status: 404,
      json: async () => ({ code: 'event_not_found', message: 'Stripe has no event with id evt_bad.' }),
    },
  ]);

  await api.replay('evt_bad');

  // Only the replay call — no refresh on failure.
  assert.equal(calls.length, 1);
  const state = api.getState();
  assert.ok(state.rowError, 'rowError should be set');
  assert.equal(state.rowError.event_id, 'evt_bad');
  assert.match(state.rowError.message, /Stripe has no event/);

  const html = api.render();
  assert.match(html, /data-test="webhooks-row-error"/);
});

test('Load more button appears when rows.length === limit, click doubles the limit', async () => {
  resetAll();
  // Seed exactly `limit` rows so the "Load more" button shows.
  const seeded = Array.from({ length: 50 }, (_, i) => ({
    id: `evt_${i}`,
    event_id: `evt_${i}`,
    event_type: 'checkout.session.completed',
    received_at: '2026-04-28T12:00:00Z',
    processed: true,
  }));
  api.setRows(seeded);

  const html = api.render();
  assert.match(html, /data-test="webhooks-load-more-btn"/);

  const calls = installFetchQueue([okJson({ since_days: 7, rows: seeded })]);
  await api.loadMore();

  assert.equal(api.getState().limit, 100);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /limit=100/);
});

test('Load more button is hidden when rows.length < limit', () => {
  resetAll();
  api.setRows([
    { id: 'evt_only', event_id: 'evt_only', event_type: 'foo', received_at: '2026-04-28T12:00:00Z', processed: true },
  ]);
  const html = api.render();
  assert.doesNotMatch(html, /data-test="webhooks-load-more-btn"/);
});

test('buildListUrl reflects current state (limit, since_days, applied event_type)', () => {
  resetAll();
  api.setState({ limit: 25, sinceDays: 30, appliedEventType: 'invoice.paid' });
  const url = api.buildListUrl();
  assert.match(url, /limit=25/);
  assert.match(url, /since_days=30/);
  assert.match(url, /event_type=invoice\.paid/);
});
