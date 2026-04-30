// Phase 13 — admin Onboarding funnel dashboard card in the Ops tab.
//
// Mirrors the node:test + globalThis.fetch stub style used by
// `agents-prompt-overrides.test.js` and `webhook-replay-ui.test.js`. We
// exercise `pages-agents.js` through its `__onboardingFunnelTestApi__`
// testing seam rather than driving a full DOM, so these tests don't depend
// on a `<div id="content">` host or the surrounding hub chrome.

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
const api = mod.__onboardingFunnelTestApi__;

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

// Build a fetch stub that records every call and returns the supplied body.
function makeFetchRecorder(body, status = 200) {
  const calls = [];
  const stub = async (url, opts = {}) => {
    calls.push({ url: String(url), opts });
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    };
  };
  return { calls, stub };
}

function totalsWithCompleted(rate, started = 100) {
  // Build a totals object whose started→completed rate equals `rate`.
  const completed = Math.round(started * rate);
  return {
    started,
    package_selected: Math.max(0, started - 5),
    stripe_initiated: Math.max(0, started - 15),
    stripe_skipped: 5,
    agents_enabled: Math.max(0, started - 20),
    team_invited: Math.max(0, started - 30),
    completed,
    skipped: 0,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

test('Funnel card is reachable inside Ops section for super-admin', () => {
  setSuperAdminUser();
  api.reset();
  assert.equal(api.isSuperAdmin(), true);
  const strip = api.renderTabStrip();
  assert.match(strip, /Ops/);
  // Card markup is present in the Ops section render.
  const opsHtml = api.renderOpsSection([]);
  assert.match(opsHtml, /data-test="funnel-card"/);
  assert.match(opsHtml, /Onboarding funnel/);
});

test('Card hidden for clinician (Ops tab itself is gated and never rendered)', () => {
  setClinicianUser();
  api.reset();
  assert.equal(api.isSuperAdmin(), false);
  const strip = api.renderTabStrip();
  // The clinician never sees the Ops tab button — so the card cannot be
  // reached through the UI. This matches the existing pattern in
  // webhook-replay-ui.test.js / agents-prompt-overrides.test.js.
  assert.doesNotMatch(strip, /Ops/);
  assert.doesNotMatch(strip, /Onboarding funnel/);
});

test('Initial fetch hits /api/v1/onboarding/funnel?days=7', async () => {
  setSuperAdminUser();
  api.reset();

  const payload = {
    since_days: 7,
    totals: totalsWithCompleted(0.3),
    conversion: { started_to_completed: 0.30, started_to_skipped: 0.05 },
  };
  const { calls, stub } = makeFetchRecorder(payload, 200);
  globalThis.fetch = stub;

  const res = await api.fetchFunnel(7);
  assert.ok(res, 'a payload was returned');
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/api\/v1\/onboarding\/funnel\?days=7$/);
  assert.equal((calls[0].opts.method || 'GET'), 'GET');
});

test('Switching to the 30d pill refetches with days=30', async () => {
  setSuperAdminUser();
  api.reset();

  // Seed cache for default 7d so the initial render has data.
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      since_days: 7,
      totals: totalsWithCompleted(0.4),
      conversion: { started_to_completed: 0.40, started_to_skipped: 0.05 },
    }),
  });
  await api.fetchFunnel(7);

  // Now the pill click — install a recorder so we can assert the URL.
  const { calls, stub } = makeFetchRecorder({
    since_days: 30,
    totals: totalsWithCompleted(0.20, 200),
    conversion: { started_to_completed: 0.20, started_to_skipped: 0.05 },
  }, 200);
  globalThis.fetch = stub;

  await globalThis.window._agentOpsSetFunnelWindow(30);
  // Allow the awaited promise inside the handler to resolve.
  await Promise.resolve();
  await Promise.resolve();

  assert.ok(calls.length >= 1, 'pill change triggered a fetch');
  assert.match(calls[0].url, /\/api\/v1\/onboarding\/funnel\?days=30$/);
  assert.equal(api.getState().days, 30);
});

test('Re-clicking the same pill does NOT re-fetch (cached per window)', async () => {
  setSuperAdminUser();
  api.reset();

  // Prime the 7d cache.
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      since_days: 7,
      totals: totalsWithCompleted(0.35),
      conversion: { started_to_completed: 0.35, started_to_skipped: 0.05 },
    }),
  });
  await api.fetchFunnel(7);

  // Switch to 30d and prime that cache too.
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      since_days: 30,
      totals: totalsWithCompleted(0.20, 200),
      conversion: { started_to_completed: 0.20, started_to_skipped: 0.05 },
    }),
  });
  await globalThis.window._agentOpsSetFunnelWindow(30);
  await Promise.resolve();
  await Promise.resolve();

  // Now install a recorder and re-click 30d — must NOT fire fetch.
  let called = 0;
  globalThis.fetch = async () => {
    called += 1;
    return { ok: true, status: 200, json: async () => ({}) };
  };
  await globalThis.window._agentOpsSetFunnelWindow(30);
  await Promise.resolve();
  assert.equal(called, 0, 're-clicking the active pill must be a no-op');

  // And switching back to 7d must also be a cache hit (no fetch).
  await globalThis.window._agentOpsSetFunnelWindow(7);
  await Promise.resolve();
  assert.equal(called, 0, 'switching back to a cached window must be a cache hit');
});

test('Empty totals (all zeros) renders without error', async () => {
  setSuperAdminUser();
  api.reset();

  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      since_days: 7,
      totals: {
        started: 0, package_selected: 0, stripe_initiated: 0, stripe_skipped: 0,
        agents_enabled: 0, team_invited: 0, completed: 0, skipped: 0,
      },
      conversion: { started_to_completed: 0, started_to_skipped: 0 },
    }),
  });
  await api.fetchFunnel(7);

  const html = api.renderCard();
  assert.match(html, /data-test="funnel-card"/);
  // Conversion shown as 0.0% in red (< 10%).
  assert.match(html, /data-test="funnel-stat-completed-value"/);
  assert.match(html, />0\.0%</);
  // 8 bars rendered, all with count 0.
  for (const key of [
    'started', 'package_selected', 'stripe_initiated', 'stripe_skipped',
    'agents_enabled', 'team_invited', 'completed', 'skipped',
  ]) {
    assert.match(html, new RegExp(`data-test="funnel-bar-${key}"`));
    assert.match(html, new RegExp(`data-test="funnel-bar-count-${key}"[^>]*>0<`));
  }
});

test('Conversion >25% shown green', async () => {
  setSuperAdminUser();
  api.reset();
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      since_days: 7,
      totals: totalsWithCompleted(0.30),
      conversion: { started_to_completed: 0.30, started_to_skipped: 0.04 },
    }),
  });
  await api.fetchFunnel(7);

  const html = api.renderCard();
  // Locate the completed-value cell and verify the green color is applied.
  const m = html.match(/data-test="funnel-stat-completed-value"[^>]*style="([^"]+)"/);
  assert.ok(m, 'completed-value cell found');
  assert.match(m[1], /var\(--green/);
  assert.match(html, /data-test="funnel-stat-completed-value"[^>]*>30\.0%</);
});

test('Conversion 10–25% shown amber', async () => {
  setSuperAdminUser();
  api.reset();
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      since_days: 7,
      totals: totalsWithCompleted(0.18),
      conversion: { started_to_completed: 0.18, started_to_skipped: 0.04 },
    }),
  });
  await api.fetchFunnel(7);

  const html = api.renderCard();
  const m = html.match(/data-test="funnel-stat-completed-value"[^>]*style="([^"]+)"/);
  assert.ok(m, 'completed-value cell found');
  assert.match(m[1], /var\(--amber/);
});

test('Conversion <10% shown red', async () => {
  setSuperAdminUser();
  api.reset();
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      since_days: 7,
      totals: totalsWithCompleted(0.05),
      conversion: { started_to_completed: 0.05, started_to_skipped: 0.04 },
    }),
  });
  await api.fetchFunnel(7);

  const html = api.renderCard();
  const m = html.match(/data-test="funnel-stat-completed-value"[^>]*style="([^"]+)"/);
  assert.ok(m, 'completed-value cell found');
  assert.match(m[1], /var\(--red/);
});

test('422 response renders an inline red error message', async () => {
  setSuperAdminUser();
  api.reset();
  globalThis.fetch = async () => ({
    ok: false,
    status: 422,
    json: async () => ({ detail: 'invalid' }),
  });
  await api.fetchFunnel(7);

  const html = api.renderCard();
  assert.match(html, /data-test="funnel-error"/);
  assert.match(html, /HTTP 422|Invalid window/);
});

test('Network error renders an inline red error message', async () => {
  setSuperAdminUser();
  api.reset();
  globalThis.fetch = async () => {
    throw new Error('network down');
  };
  await api.fetchFunnel(7);

  const html = api.renderCard();
  assert.match(html, /data-test="funnel-error"/);
  assert.match(html, /network down/);
});
