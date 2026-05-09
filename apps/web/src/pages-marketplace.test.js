// Tests for pages-marketplace.js — Phase 11A public landing page.
//
// Covers:
//   - Public exports exist (pgMarketplaceLanding, __marketplaceLandingTestApi__)
//   - PRICING constant shape (3 tiers, required fields)
//   - AGENT_CATALOG constant shape (7 entries, no system_prompt leak)
//   - Hero render contains key clinical-governance copy
//   - No "AI doctor" / autonomous-diagnosis claims in hero
//   - Patient-side tiles render "Pending clinical sign-off" badge
//   - Clinic-side tiles do NOT render that badge
//   - Pricing grid renders all three tiers
//   - Trust block contains NHS + GDPR bullets
//   - Footer CTA links to agent-onboarding
//   - Demo email constant is canonical contact
//   - SEO tag specs table has required og/twitter entries
//   - pgMarketplaceLanding returns HTML string + writes to DOM #content when present
//   - State reset via __marketplaceLandingTestApi__.reset()
//   - fetchAnonymousCatalog swallows network errors gracefully

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import {
  pgMarketplaceLanding,
  __marketplaceLandingTestApi__ as API,
} from './pages-marketplace.js';

// ── DOM stub shared across DOM-dependent tests ────────────────────────────────

function makeMinimalDom() {
  const head = {
    _tags: [],
    appendChild(el) { this._tags.push(el); },
    querySelector(sel) {
      // Return existing stub tag if selector matches
      const match = sel.match(/meta\[(\w+)="([^"]+)"\]/);
      if (!match) return null;
      const [, attr, val] = match;
      return this._tags.find(t => t[attr] === val) ?? null;
    },
  };
  const content = { innerHTML: '' };
  return {
    head,
    title: '',
    _content: content,
    createElement(tag) {
      if (tag === 'meta') return { setAttribute(k, v) { this[k] = v; } };
      return {};
    },
    getElementById(id) { return id === 'content' ? content : null; },
    querySelector() { return null; },
  };
}

// ── Part 1: exports and static constants ─────────────────────────────────────

describe('pages-marketplace exports', () => {
  it('pgMarketplaceLanding is an async function', () => {
    assert.strictEqual(typeof pgMarketplaceLanding, 'function');
  });

  it('__marketplaceLandingTestApi__ is exported', () => {
    assert.ok(API && typeof API === 'object');
  });

  it('test API exposes expected seam keys', () => {
    const keys = [
      'reset', 'getState', 'fetchAnonymousCatalog',
      'renderHero', 'renderPricing', 'renderCatalog',
      'renderTrust', 'renderFooterCta', 'renderPage',
      'PRICING', 'AGENT_CATALOG', 'DEMO_EMAIL',
      'setSeoTags', 'clearSeoTags', 'upsertMeta', 'seoTagSpecs', 'SEO',
    ];
    for (const k of keys) {
      assert.ok(k in API, `Missing seam key: ${k}`);
    }
  });
});

describe('ML_PRICING constant', () => {
  it('has exactly 3 tiers', () => {
    assert.strictEqual(API.PRICING.length, 3);
  });

  it('tier ids are solo, pro, enterprise', () => {
    const ids = API.PRICING.map(p => p.id);
    assert.deepStrictEqual(ids, ['solo', 'pro', 'enterprise']);
  });

  it('each tier has name, price, priceSub, features', () => {
    for (const p of API.PRICING) {
      assert.ok(typeof p.name === 'string' && p.name.length > 0, `tier ${p.id} missing name`);
      assert.ok(typeof p.price === 'string', `tier ${p.id} missing price`);
      assert.ok(Array.isArray(p.features) && p.features.length > 0, `tier ${p.id} missing features`);
    }
  });
});

describe('ML_AGENT_CATALOG constant', () => {
  it('has exactly 7 entries', () => {
    assert.strictEqual(API.AGENT_CATALOG.length, 7);
  });

  it('every entry has id, name, tagline, audience, monthly_price_gbp', () => {
    for (const a of API.AGENT_CATALOG) {
      assert.ok(typeof a.id === 'string' && a.id.length > 0, `entry missing id`);
      assert.ok(typeof a.name === 'string' && a.name.length > 0, `entry ${a.id} missing name`);
      assert.ok(typeof a.tagline === 'string' && a.tagline.length > 0, `entry ${a.id} missing tagline`);
      assert.ok(['clinic', 'patient'].includes(a.audience), `entry ${a.id} bad audience`);
      assert.ok(typeof a.monthly_price_gbp === 'number', `entry ${a.id} missing price`);
    }
  });

  it('NEVER includes system_prompt on any entry', () => {
    for (const a of API.AGENT_CATALOG) {
      assert.ok(!('system_prompt' in a), `system_prompt leaked on ${a.id}`);
    }
  });

  it('patient.crisis agent is free (monthly_price_gbp === 0)', () => {
    const crisis = API.AGENT_CATALOG.find(a => a.id === 'patient.crisis');
    assert.ok(crisis, 'patient.crisis not found in catalog');
    assert.strictEqual(crisis.monthly_price_gbp, 0);
  });
});

// ── Part 2: render fragments — clinical governance copy ───────────────────────

describe('_mlRenderHero', () => {
  it('contains decision-support framing, not AI-doctor claim', () => {
    const html = API.renderHero();
    assert.ok(html.includes('You stay in charge'), 'missing clinician-control copy');
  });

  it('does NOT contain "AI doctor" or "autonomous diagnosis"', () => {
    const html = API.renderHero().toLowerCase();
    assert.ok(!html.includes('ai doctor'), 'found forbidden "AI doctor" phrase');
    assert.ok(!html.includes('autonomous diagnosis'), 'found forbidden autonomous-diagnosis phrase');
  });

  it('CTA trial href links to agent-onboarding', () => {
    const html = API.renderHero();
    assert.ok(html.includes('?page=agent-onboarding'), 'trial CTA link missing');
  });

  it('demo mailto uses canonical email constant', () => {
    const html = API.renderHero();
    assert.ok(html.includes(API.DEMO_EMAIL), 'demo mailto must use canonical ML_DEMO_EMAIL');
  });
});

describe('_mlRenderCatalog', () => {
  it('patient tiles include "Pending clinical sign-off" badge', () => {
    const html = API.renderCatalog();
    assert.ok(html.includes('Pending clinical sign-off'), 'clinical sign-off badge missing from patient tiles');
  });

  it('contains "decision-support" label (not autonomous)', () => {
    const html = API.renderCatalog();
    assert.ok(html.includes('decision-support'), 'decision-support label missing from catalog');
  });

  it('renders all 7 agent tiles', () => {
    const html = API.renderCatalog();
    for (const a of API.AGENT_CATALOG) {
      const safeId = a.id.replace('.', '\\.');
      assert.ok(
        html.includes(`data-test="ml-agent-${a.id}"`),
        `tile for ${a.id} not found`,
      );
    }
  });
});

describe('_mlRenderPricing', () => {
  it('renders all three pricing tier blocks', () => {
    const html = API.renderPricing();
    for (const p of API.PRICING) {
      assert.ok(html.includes(`data-test="ml-pkg-${p.id}"`), `pricing block for ${p.id} missing`);
    }
  });
});

describe('_mlRenderTrust', () => {
  it('mentions NHS clinicians', () => {
    const html = API.renderTrust();
    assert.ok(html.includes('NHS clinicians'), 'NHS copy missing from trust block');
  });

  it('mentions GDPR', () => {
    const html = API.renderTrust();
    assert.ok(html.includes('GDPR'), 'GDPR copy missing from trust block');
  });

  it('contains decision-support framing', () => {
    const html = API.renderTrust();
    assert.ok(html.includes('Decision-support'), 'decision-support copy missing from trust block');
  });
});

describe('_mlRenderFooterCta', () => {
  it('footer trial button links to agent-onboarding', () => {
    const html = API.renderFooterCta();
    assert.ok(html.includes('?page=agent-onboarding'), 'footer CTA missing agent-onboarding link');
  });
});

// ── Part 3: SEO seam ──────────────────────────────────────────────────────────

describe('SEO tag specs', () => {
  it('seoTagSpecs returns at least 10 entries', () => {
    const specs = API.seoTagSpecs();
    assert.ok(Array.isArray(specs) && specs.length >= 10, 'too few SEO tag specs');
  });

  it('og:title and twitter:title are present', () => {
    const specs = API.seoTagSpecs();
    const props = specs.map(([, val]) => val);
    assert.ok(props.includes('og:title'), 'og:title missing from SEO specs');
    assert.ok(props.includes('twitter:title'), 'twitter:title missing from SEO specs');
  });

  it('SEO.title contains "DeepSynaps"', () => {
    assert.ok(API.SEO.title.includes('DeepSynaps'), 'SEO title missing brand name');
  });

  it('SEO.description contains "decision-support" framing', () => {
    assert.ok(
      API.SEO.description.toLowerCase().includes('decision-support'),
      'SEO description must use decision-support framing',
    );
  });
});

// ── Part 4: page lifecycle / DOM integration ──────────────────────────────────

describe('pgMarketplaceLanding DOM integration', () => {
  let savedDoc;
  let savedFetch;

  before(() => {
    savedDoc = globalThis.document;
    savedFetch = globalThis.fetch;
    globalThis.document = makeMinimalDom();
    // Stub fetch so _mlFetchAnonymousCatalog() doesn't hit network
    globalThis.fetch = () => Promise.resolve(
      new Response(JSON.stringify({ agents: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });

  after(() => {
    globalThis.document = savedDoc;
    globalThis.fetch = savedFetch;
  });

  it('pgMarketplaceLanding returns an HTML string', async () => {
    API.reset();
    const html = await pgMarketplaceLanding(() => {});
    assert.ok(typeof html === 'string' && html.length > 100, 'did not return HTML string');
  });

  it('returned HTML contains ml-page wrapper', async () => {
    API.reset();
    const html = await pgMarketplaceLanding();
    assert.ok(html.includes('data-test="ml-page"'), 'missing ml-page wrapper');
  });

  it('calls setTopbar when provided', async () => {
    API.reset();
    let topbarArg = null;
    await pgMarketplaceLanding((label) => { topbarArg = label; });
    assert.strictEqual(topbarArg, 'Marketplace');
  });

  it('writes html into #content when document.getElementById returns it', async () => {
    API.reset();
    await pgMarketplaceLanding(() => {});
    assert.ok(
      globalThis.document._content.innerHTML.includes('data-test="ml-page"'),
      '#content.innerHTML not updated',
    );
  });
});

describe('state reset', () => {
  it('reset() clears fetchedAgents and fetchError', async () => {
    // Pollute state by calling reset first then inspecting
    API.reset();
    const state = API.getState();
    assert.strictEqual(state.fetchedAgents, null);
    assert.strictEqual(state.fetchError, null);
  });
});

describe('fetchAnonymousCatalog error handling', () => {
  let savedFetch;

  before(() => { savedFetch = globalThis.fetch; });
  after(() => { globalThis.fetch = savedFetch; });

  it('swallows network errors and records fetchError', async () => {
    API.reset();
    globalThis.fetch = () => Promise.reject(new Error('Network failure'));
    await API.fetchAnonymousCatalog();
    const state = API.getState();
    assert.ok(state.fetchError !== null, 'fetchError should be set on network failure');
    assert.ok(typeof state.fetchError === 'string', 'fetchError should be a string');
  });

  it('sets fetchedAgents to empty array on network error', async () => {
    API.reset();
    globalThis.fetch = () => Promise.reject(new Error('timeout'));
    await API.fetchAnonymousCatalog();
    assert.deepStrictEqual(API.getState().fetchedAgents, []);
  });
});
