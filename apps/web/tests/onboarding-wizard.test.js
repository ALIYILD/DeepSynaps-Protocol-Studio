// Phase 10 — first-login clinic admin onboarding wizard.
//
// Mirrors the node:test + globalThis.fetch stub style used by the other
// pages-* tests in this folder. We exercise `pages-onboarding.js` through
// its `__agentOnboardingTestApi__` testing seam plus a minimal DOM stub
// so handler side-effects (renders, redirects) are observable without a
// real browser.

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

// Minimal DOM — enough for innerHTML assignment and getElementById lookups
// inside handlers that read field values. We don't actually parse HTML; we
// just store the most recent innerHTML so tests can grep it.
function installDomStub() {
  const elements = new Map();
  const make = (id) => {
    let html = '';
    let text = '';
    const el = {
      id,
      style: {},
      _value: '',
      get value() { return this._value; },
      set value(v) { this._value = v; },
      set innerHTML(v) { html = String(v); },
      get innerHTML() { return html; },
      set textContent(v) { text = String(v); },
      get textContent() { return text; },
      addEventListener() {},
      removeEventListener() {},
      appendChild() {},
      querySelector: () => null,
      querySelectorAll: () => [],
    };
    elements.set(id, el);
    return el;
  };
  // Prime a #content host so render writes land somewhere we can read.
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

// Track navigation side-effects.
const _navCalls = [];
globalThis.window._nav = (page) => { _navCalls.push(page); };
// window.location stub — handlers may also call assign() as a fallback.
const _locAssigns = [];
globalThis.window.location = {
  origin: 'https://example.test',
  pathname: '/app',
  assign(url) { _locAssigns.push(String(url)); },
};

// Default fetch stub that fails — every test that hits the network installs
// its own. Catches accidental hidden network calls.
globalThis.fetch = async () => {
  throw new Error('fetch not stubbed');
};

// Import the agent-onboarding wizard module directly. `pages-onboarding.js`
// re-exports it for the SPA route, but here we skip that re-export to avoid
// dragging in legacy auth.js (which assumes Vite's `import.meta.env`).
const mod = await import('../src/agent-onboarding-wizard.js');
const api = mod.__agentOnboardingTestApi__;

function resetAll() {
  api.reset();
  _navCalls.length = 0;
  _locAssigns.length = 0;
  installLocalStorageStub();
}

// ─── Tests ──────────────────────────────────────────────────────────────────

test('Step 1 renders by default and shows the three package cards', () => {
  resetAll();
  const html = api.renderStep(1);
  assert.match(html, /agent-onb-step-1/);
  assert.match(html, /agent-onb-progress/);
  assert.match(html, /Step 1 of 4/);
  assert.match(html, /agent-onb-pkg-solo/);
  assert.match(html, /agent-onb-pkg-pro/);
  assert.match(html, /agent-onb-pkg-enterprise/);
  // Continue button is disabled until a package is chosen.
  assert.match(html, /agent-onb-step1-continue[^>]*disabled/);
});

test('Continue advances to step 2; Back returns to step 1', async () => {
  resetAll();
  // Select a package, then press Continue via the global handler.
  globalThis.window._agentOnbSelectPackage('solo');
  assert.equal(api.getState().step, 1);
  assert.equal(api.getState().packageId, 'solo');

  await globalThis.window._agentOnbContinue();
  assert.equal(api.getState().step, 2);

  globalThis.window._agentOnbBack();
  assert.equal(api.getState().step, 1);
});

test('Selecting a paid package disables the "Skip for now" button on step 2', () => {
  resetAll();
  // Solo → skip enabled.
  api.setState({ packageId: 'solo', step: 2 });
  let html = api.renderStep(2);
  assert.match(html, /agent-onb-skip-billing/);
  // The skip button has `disabled` attr only for non-solo — assert it's NOT
  // present in the skip-billing button when packageId='solo'.
  const soloBtn = html.match(/agent-onb-skip-billing[^>]*>/);
  assert.ok(soloBtn, 'skip button rendered');
  assert.doesNotMatch(soloBtn[0], /\bdisabled\b/);

  // Pro → skip disabled.
  api.setState({ packageId: 'pro', step: 2 });
  html = api.renderStep(2);
  const proBtn = html.match(/agent-onb-skip-billing[^>]*>/);
  assert.ok(proBtn, 'skip button rendered for pro');
  assert.match(proBtn[0], /\bdisabled\b/);

  // Enterprise → also disabled.
  api.setState({ packageId: 'enterprise', step: 2 });
  html = api.renderStep(2);
  const entBtn = html.match(/agent-onb-skip-billing[^>]*>/);
  assert.match(entBtn[0], /\bdisabled\b/);
});

test('Step 3 fetches catalog and renders toggles', async () => {
  resetAll();

  let getUrl = null;
  globalThis.fetch = async (url, opts = {}) => {
    if ((opts.method || 'GET') === 'GET' && /\/api\/v1\/agents\/?$/.test(String(url))) {
      getUrl = String(url);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          agents: [
            { id: 'clinic.reception', name: 'Reception Agent',  description: 'Books appointments.' },
            { id: 'clinic.reporting', name: 'Reporting Agent',  description: 'Builds outcome reports.' },
            { id: 'patient.adherence', name: 'Adherence',        description: 'Nudges patients to stick to plans.' },
          ],
        }),
      };
    }
    throw new Error('unexpected fetch: ' + url);
  };

  await api.fetchCatalog();
  assert.match(getUrl || '', /\/api\/v1\/agents\/$/);

  const html = api.renderStep(3);
  assert.match(html, /agent-onb-step-3/);
  assert.match(html, /agent-onb-catalog-list/);
  assert.match(html, /agent-onb-agent-clinic\.reception/);
  assert.match(html, /agent-onb-agent-clinic\.reporting/);
  assert.match(html, /agent-onb-agent-patient\.adherence/);
  // Three toggle inputs.
  const toggles = html.match(/data-test="agent-onb-toggle"/g) || [];
  assert.equal(toggles.length, 3);
});

test('Step 4 done button writes a localStorage marker and emits a redirect side-effect', () => {
  resetAll();
  api.setState({ step: 4, packageId: 'solo', enabledAgents: { 'clinic.reception': true } });

  globalThis.window._agentOnbDone();

  // Marker written.
  const done = globalThis.localStorage.getItem(api.STORAGE_KEYS.done);
  assert.equal(done, '1');
  // Enabled-agents hint persisted.
  const enabled = JSON.parse(globalThis.localStorage.getItem(api.STORAGE_KEYS.enabled) || '{}');
  assert.equal(enabled['clinic.reception'], true);
  // Redirect side-effect: window._nav called with 'agents'.
  assert.deepEqual(_navCalls, ['agents']);
});

test('Done falls back to window.location.assign when _nav is missing', () => {
  resetAll();
  api.setState({ step: 4, packageId: 'solo', enabledAgents: {} });
  // Remove _nav to force the fallback path.
  const savedNav = globalThis.window._nav;
  delete globalThis.window._nav;
  try {
    globalThis.window._agentOnbDone();
    assert.equal(_locAssigns.length, 1, 'window.location.assign called once');
    assert.match(_locAssigns[0], /\?page=agents$/);
  } finally {
    globalThis.window._nav = savedNav;
  }
});

test('Skip wizard link sets the skipped marker and redirects', () => {
  resetAll();
  globalThis.window._agentOnbSkipWizard({ preventDefault: () => {} });
  assert.equal(globalThis.localStorage.getItem(api.STORAGE_KEYS.skipped), '1');
  assert.deepEqual(_navCalls, ['agents']);
});


// ── Launch-audit (2026-05-01) cross-wizard regression checks ───────────────
// The full pgOnboardingWizard module is not directly importable under node:test
// (transitive dep on Vite's import.meta.env via api.js), so audit-event /
// resume-from-step / skip-with-reason / first-patient-demo logic is exercised
// in src/onboarding-wizard-launch-audit.test.js as logic-only mirrors. The
// regressions below pin behaviour that could be silently broken if the agent-
// onboarding wizard's `reportOnboardingEvent` path is removed or the funnel
// telemetry contract drifts.

test('Funnel telemetry path remains intact for the package-selection wizard', async () => {
  // The agent-onboarding wizard posts `started` / `package_selected` /
  // `completed` to the funnel endpoint; without this the launch-audit
  // dashboard loses the conversion baseline. We verify by stubbing fetch
  // and asserting that selecting a package eventually lands a POST.
  resetAll();
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    calls.push({ url: String(url), method: (opts.method || 'GET').toUpperCase() });
    if ((opts.method || 'GET') === 'POST' && /\/onboarding\/events/.test(String(url))) {
      return { ok: true, status: 201, json: async () => ({ id: 1, recorded_at: 'now' }) };
    }
    if (/\/api\/v1\/agents\/?$/.test(String(url))) {
      return { ok: true, status: 200, json: async () => ({ agents: [] }) };
    }
    throw new Error('unexpected fetch: ' + url);
  };
  // Trigger a package selection — this must eventually emit a funnel POST.
  // (The wizard fires it best-effort; we only assert the URL was queried,
  // not that it succeeded — telemetry must never block UX.)
  globalThis.window._agentOnbSelectPackage('solo');
  // Allow the microtask queue to drain.
  await new Promise((r) => setTimeout(r, 0));
  const onbPosts = calls.filter((c) => /\/onboarding\/events/.test(c.url) && c.method === 'POST');
  assert.ok(
    onbPosts.length >= 1,
    'expected at least one POST to /api/v1/onboarding/events for the funnel'
  );
});
