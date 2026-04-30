// Phase 12 — billing page (Stripe Customer Portal launcher).
//
// Mirrors the node:test + globalThis.fetch stub style used by
// `marketplace-landing.test.js` and `webhook-replay-ui.test.js`. We exercise
// `pages-billing.js` through its `__billingPageTestApi__` testing seam plus
// a minimal DOM stub so handler side-effects (renders, redirects) are
// observable without a real browser.

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

// Track navigation side-effects via window.location.assign.
const _locAssigns = [];
globalThis.window.location = {
  origin: 'https://example.test',
  pathname: '/app',
  href: 'https://example.test/app?page=billing',
  assign(url) { _locAssigns.push(String(url)); },
};

// Default fetch stub that fails — every test that hits the network installs
// its own. Catches accidental hidden network calls.
globalThis.fetch = async () => {
  throw new Error('fetch not stubbed');
};

const mod = await import('../src/pages-billing.js');
const api = mod.__billingPageTestApi__;

function resetAll() {
  api.reset();
  _locAssigns.length = 0;
  installLocalStorageStub({ ds_token: 'demo-token-billing' });
}

// ─── Tests ──────────────────────────────────────────────────────────────────

test('Page renders heading, sub-text, and the portal button', () => {
  resetAll();
  const html = api.mount();
  assert.match(html, /data-test="billing-page"/);
  assert.match(html, /data-test="billing-heading"/);
  assert.match(html, /Billing &amp; subscriptions/);
  assert.match(html, /data-test="billing-subtext"/);
  assert.match(html, /Manage payment methods/);
  assert.match(html, /data-test="billing-portal-btn"/);
  assert.match(html, /Open Stripe customer portal/);
  // No error block by default.
  assert.doesNotMatch(html, /data-test="billing-error-/);
});

test('Click → POST /portal is fired with the current href as return_url', async () => {
  resetAll();

  const requests = [];
  globalThis.fetch = async (url, opts = {}) => {
    requests.push({ url: String(url), opts });
    return {
      ok: true,
      status: 200,
      json: async () => ({ url: 'https://billing.stripe.com/p/session/cs_xyz' }),
    };
  };

  await globalThis.window._billingOpenPortal();

  assert.equal(requests.length, 1, 'exactly one POST issued');
  const req = requests[0];
  assert.match(req.url, /\/api\/v1\/agent-billing\/portal$/);
  assert.equal(req.opts.method, 'POST');
  const body = JSON.parse(req.opts.body || '{}');
  assert.equal(body.return_url, 'https://example.test/app?page=billing');
  // Bearer token forwarded.
  assert.equal(req.opts.headers['Authorization'], 'Bearer demo-token-billing');
  assert.equal(req.opts.headers['Content-Type'], 'application/json');
});

test('Success → window.location.assign called with returned URL', async () => {
  resetAll();
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ url: 'https://billing.stripe.com/p/session/redirect_target' }),
  });

  await globalThis.window._billingOpenPortal();

  assert.equal(_locAssigns.length, 1, 'exactly one redirect issued');
  assert.equal(_locAssigns[0], 'https://billing.stripe.com/p/session/redirect_target');
});

test('404 response → renders the "Start a subscription first" amber notice', async () => {
  resetAll();
  globalThis.fetch = async () => ({
    ok: false,
    status: 404,
    json: async () => ({ code: 'no_stripe_customer', message: 'No Stripe customer found — start a subscription first' }),
  });

  await globalThis.window._billingOpenPortal();

  // No redirect happened.
  assert.equal(_locAssigns.length, 0);
  // Re-render to inspect the rendered HTML for the error block.
  const html = api.render();
  assert.match(html, /data-test="billing-error-no-subscription"/);
  assert.match(html, /Start a subscription first/);
  assert.match(html, /data-test="billing-link-marketplace"/);
  assert.match(html, /\?page=marketplace-landing/);
  // The generic-error block must NOT also be rendered.
  assert.doesNotMatch(html, /data-test="billing-error-generic"/);
});

test('Generic error response → renders the red error notice with the message', async () => {
  resetAll();
  globalThis.fetch = async () => ({
    ok: false,
    status: 503,
    json: async () => ({
      code: 'billing_portal_unavailable',
      message: 'Billing portal is temporarily unavailable. Please try again.',
    }),
  });

  await globalThis.window._billingOpenPortal();

  assert.equal(_locAssigns.length, 0);
  const html = api.render();
  assert.match(html, /data-test="billing-error-generic"/);
  assert.match(html, /Billing portal is temporarily unavailable/);
  // Red panel — backed by --red CSS variable.
  assert.match(html, /var\(--red/);
  // No-subscription block must NOT also be rendered.
  assert.doesNotMatch(html, /data-test="billing-error-no-subscription"/);
});

test('Network error (fetch throws) → renders the red error notice', async () => {
  resetAll();
  globalThis.fetch = async () => { throw new Error('connection refused'); };

  await globalThis.window._billingOpenPortal();

  assert.equal(_locAssigns.length, 0);
  const html = api.render();
  assert.match(html, /data-test="billing-error-generic"/);
  assert.match(html, /connection refused/);
  assert.match(html, /var\(--red/);
});
