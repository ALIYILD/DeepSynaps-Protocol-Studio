// Phase 11A — Public marketplace landing page (anonymous-visible).
//
// Mirrors the node:test + globalThis.fetch stub style used by
// onboarding-wizard.test.js. We exercise the page through its
// `__marketplaceLandingTestApi__` testing seam plus a minimal DOM stub so
// the public render path is observable without a real browser.

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

const mod = await import('../src/pages-marketplace.js');
const api = mod.__marketplaceLandingTestApi__;

function resetAll() {
  api.reset();
  installLocalStorageStub();
  installDomStub();
}

// ─── Tests ──────────────────────────────────────────────────────────────────

test('Hero renders H1, sub-line, and both CTAs', () => {
  resetAll();
  const html = api.renderHero();
  assert.match(html, /data-test="ml-hero"/);
  assert.match(html, /data-test="ml-hero-h1"/);
  assert.match(html, /Agents that run your clinic, not your inbox/);
  assert.match(html, /data-test="ml-hero-sub"/);
  assert.match(html, /data-test="ml-cta-trial"/);
  assert.match(html, /data-test="ml-cta-demo"/);
});

test('Hero trial CTA points to ?page=agent-onboarding', () => {
  resetAll();
  const html = api.renderHero();
  // The Start-a-trial link is the only CTA pointing at the onboarding wizard.
  const trialMatch = html.match(/data-test="ml-cta-trial"[^>]*href="([^"]+)"/);
  assert.ok(trialMatch, 'trial CTA href present');
  assert.equal(trialMatch[1], '?page=agent-onboarding');
});

test('Hero demo CTA is a mailto link to the configured demo email', () => {
  resetAll();
  const html = api.renderHero();
  const demoMatch = html.match(/data-test="ml-cta-demo"[^>]*href="([^"]+)"/);
  assert.ok(demoMatch, 'demo CTA href present');
  assert.match(demoMatch[1], /^mailto:dr\.aliyildirim123@gmail\.com/);
  // The constant the page uses is exposed via the test seam — defensive
  // guard so a future rename doesn't silently drift.
  assert.equal(api.DEMO_EMAIL, 'dr.aliyildirim123@gmail.com');
});

test('Pricing table renders three columns matching the wizard packages', () => {
  resetAll();
  const html = api.renderPricing();
  assert.match(html, /data-test="ml-pricing"/);
  assert.match(html, /data-test="ml-pricing-grid"/);
  assert.match(html, /data-test="ml-pkg-solo"/);
  assert.match(html, /data-test="ml-pkg-pro"/);
  assert.match(html, /data-test="ml-pkg-enterprise"/);
  // Each card surfaces its display price.
  assert.match(html, /£0/);
  assert.match(html, /£99/);
  assert.match(html, /Custom/);
  // Confirm exactly three pkg tiles render — guards against accidental dup.
  const cards = html.match(/data-test="ml-pkg-/g) || [];
  assert.equal(cards.length, 3);
});

test('Catalog renders all 7 hardcoded agent tiles', () => {
  resetAll();
  const html = api.renderCatalog();
  assert.match(html, /data-test="ml-catalog"/);
  assert.match(html, /data-test="ml-catalog-grid"/);
  const tiles = html.match(/data-test="ml-agent-/g) || [];
  assert.equal(tiles.length, 7, 'one tile per AGENT_REGISTRY entry');
  // Every catalog id from the test seam must appear in the markup.
  for (const a of api.AGENT_CATALOG) {
    assert.ok(html.includes(`data-test="ml-agent-${a.id}"`), `tile rendered for ${a.id}`);
  }
});

test('Patient-side tiles render the "Pending clinical sign-off" badge; clinic tiles do not', () => {
  resetAll();
  const html = api.renderCatalog();
  assert.match(html, /Pending clinical sign-off/);
  // There are 4 patient agents in AGENT_REGISTRY (care_companion, adherence,
  // education, crisis) — one badge per patient tile.
  const badges = html.match(/data-test="ml-pending-signoff"/g) || [];
  assert.equal(badges.length, 4);

  // Spot-check: the reception tile (clinic-side) should NOT carry the badge.
  const receptionStart = html.indexOf('data-test="ml-agent-clinic.reception"');
  const receptionEnd = html.indexOf('</div>', receptionStart + 100);
  const receptionSlice = html.slice(receptionStart, receptionEnd + 200);
  assert.doesNotMatch(receptionSlice, /Pending clinical sign-off/);
});

test('Every catalog tile carries the decision-support micro-footer', () => {
  resetAll();
  const html = api.renderCatalog();
  const footers = html.match(/data-test="ml-decision-support"/g) || [];
  assert.equal(footers.length, 7);
});

test('Anonymous fetch returning empty agents list still renders the hardcoded catalog', async () => {
  resetAll();
  let called = false;
  globalThis.fetch = async (url, opts = {}) => {
    if ((opts.method || 'GET') === 'GET' && /\/api\/v1\/agents\/?$/.test(String(url))) {
      called = true;
      return {
        ok: true,
        status: 200,
        json: async () => ({ agents: [] }),
      };
    }
    throw new Error('unexpected fetch: ' + url);
  };

  await api.fetchAnonymousCatalog();
  assert.equal(called, true, 'the anonymous catalog endpoint was hit');
  // State reflects the empty server response.
  assert.deepEqual(api.getState().fetchedAgents, []);

  // The catalog render path is independent of the live fetch — the 7
  // hardcoded tiles still render.
  const html = api.renderCatalog();
  const tiles = html.match(/data-test="ml-agent-/g) || [];
  assert.equal(tiles.length, 7);
});

test('renderPage renders hero + pricing + catalog + trust + footer in one pass', async () => {
  resetAll();
  // Stub fetch so the best-effort anonymous catalog call doesn't blow up.
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ agents: [] }),
  });
  const html = await api.renderPage(() => {});
  assert.match(html, /data-test="ml-page"/);
  assert.match(html, /data-test="ml-hero"/);
  assert.match(html, /data-test="ml-pricing"/);
  assert.match(html, /data-test="ml-catalog"/);
  assert.match(html, /data-test="ml-trust"/);
  assert.match(html, /data-test="ml-footer-cta"/);
  // 7 agent tiles end-to-end.
  const tiles = html.match(/data-test="ml-agent-/g) || [];
  assert.equal(tiles.length, 7);
});

test('Trust block surfaces all three required bullet points', () => {
  resetAll();
  const html = api.renderTrust();
  assert.match(html, /Built with NHS clinicians/);
  assert.match(html, /Decision-support, not autonomous diagnosis/);
  assert.match(html, /GDPR-aligned, UK-hosted/);
  const bullets = html.match(/data-test="ml-trust-bullet"/g) || [];
  assert.equal(bullets.length, 3);
});

test('Footer CTA repeats the Start-a-trial link to the onboarding wizard', () => {
  resetAll();
  const html = api.renderFooterCta();
  assert.match(html, /data-test="ml-footer-cta"/);
  const m = html.match(/data-test="ml-cta-trial-footer"[^>]*href="([^"]+)"/);
  assert.ok(m, 'footer trial CTA present');
  assert.equal(m[1], '?page=agent-onboarding');
});
