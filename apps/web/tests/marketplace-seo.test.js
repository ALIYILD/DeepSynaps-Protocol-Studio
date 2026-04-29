// Phase 12 — SEO + OG/Twitter card meta tag injection on the marketplace
// landing page. Mirrors the node:test + globalThis stub pattern used by
// marketplace-landing.test.js. We exercise `_mlSetSeoTags` (and friends)
// through the `__marketplaceLandingTestApi__` test seam against a
// hand-rolled minimal DOM that supports `<head>.querySelector` /
// `appendChild` / `createElement`.

import test from 'node:test';
import assert from 'node:assert/strict';

// ─── DOM stub with a working <head> + createElement -----------------------
// The marketplace test file uses a barebones DOM that does not model
// document.head — sufficient for innerHTML assertions but not for meta-tag
// injection. We need slightly more here, but still keep it dependency-free
// so the test runs under bare `node --test`.
function installDomWithHead() {
  const headChildren = []; // Array<{tagName, attrs, ...}>

  function makeMeta() {
    const attrs = {};
    return {
      tagName: 'META',
      attrs,
      setAttribute(k, v) { attrs[k] = String(v); },
      getAttribute(k) { return Object.prototype.hasOwnProperty.call(attrs, k) ? attrs[k] : null; },
      get content() { return attrs.content; },
      set content(v) { attrs.content = String(v); },
    };
  }

  const head = {
    children: headChildren,
    querySelector(selector) {
      // Only handle the meta[attr="value"] selectors emitted by _mlUpsertMeta.
      const m = String(selector).match(/^meta\[([a-zA-Z:_-]+)="([^"]+)"\]$/);
      if (!m) return null;
      const [, attr, value] = m;
      for (const child of headChildren) {
        if (child.tagName === 'META' && child.attrs && child.attrs[attr] === value) {
          return child;
        }
      }
      return null;
    },
    appendChild(node) {
      headChildren.push(node);
      return node;
    },
    querySelectorAll() { return [...headChildren]; },
  };

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
  make('content');

  globalThis.document = {
    head,
    title: '',
    getElementById(id) { return elements.get(id) || null; },
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement(tag) {
      if (String(tag).toLowerCase() === 'meta') return makeMeta();
      return { tagName: String(tag).toUpperCase(), style: {}, setAttribute() {}, appendChild() {} };
    },
    body: { appendChild() {} },
    _head: head,
  };
}

if (typeof globalThis.window === 'undefined') {
  globalThis.window = globalThis;
}
// Force-replace storage globals — Node 25 ships a built-in `localStorage`
// that throws unless `--localstorage-file` is set, so the usual
// `typeof === 'undefined'` guard is not enough.
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  writable: true,
  value: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
});
Object.defineProperty(globalThis, 'sessionStorage', {
  configurable: true,
  writable: true,
  value: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
});
installDomWithHead();
globalThis.fetch = async () => {
  throw new Error('fetch not stubbed');
};

const mod = await import('../src/pages-marketplace.js');
const api = mod.__marketplaceLandingTestApi__;

function resetAll() {
  api.reset();
  installDomWithHead();
}

function metaContent(attrName, attrValue) {
  const el = document.head.querySelector(`meta[${attrName}="${attrValue}"]`);
  return el ? el.getAttribute('content') : null;
}

// ─── Tests ------------------------------------------------------------------

test('setSeoTags sets document.title to the marketplace landing title', () => {
  resetAll();
  api.setSeoTags();
  assert.equal(document.title, 'DeepSynaps Studio — Agents that run your clinic');
  assert.equal(api.SEO.title, document.title);
});

test('setSeoTags injects a description meta tag containing the hero pitch', () => {
  resetAll();
  api.setSeoTags();
  const desc = metaContent('name', 'description');
  assert.ok(desc, 'description meta present');
  assert.match(desc, /Decision-support agents for neuromodulation clinics/);
});

test('setSeoTags injects all required Open Graph tags', () => {
  resetAll();
  api.setSeoTags();
  assert.equal(metaContent('property', 'og:title'),
    'DeepSynaps Studio — Agents that run your clinic');
  assert.match(metaContent('property', 'og:description'),
    /Decision-support agents for neuromodulation clinics/);
  assert.equal(metaContent('property', 'og:type'), 'website');
  assert.equal(metaContent('property', 'og:url'),
    'https://deepsynaps-studio-preview.netlify.app/?page=marketplace-landing');
  assert.equal(metaContent('property', 'og:image'),
    'https://deepsynaps-studio-preview.netlify.app/og-marketplace.png');
});

test('setSeoTags injects all required Twitter card tags', () => {
  resetAll();
  api.setSeoTags();
  assert.equal(metaContent('name', 'twitter:card'), 'summary_large_image');
  assert.equal(metaContent('name', 'twitter:title'),
    'DeepSynaps Studio — Agents that run your clinic');
  assert.match(metaContent('name', 'twitter:description'),
    /Decision-support agents for neuromodulation clinics/);
  assert.equal(metaContent('name', 'twitter:image'),
    'https://deepsynaps-studio-preview.netlify.app/og-marketplace.png');
});

test('setSeoTags is idempotent — re-running updates existing tags in place, never duplicates', () => {
  resetAll();
  api.setSeoTags();
  const firstCount = document.head.children.length;
  // Re-run two more times — the count of <head> children must not grow.
  api.setSeoTags();
  api.setSeoTags();
  assert.equal(document.head.children.length, firstCount,
    'no duplicate meta tags created on repeated calls');

  // Each canonical (attr, value) pair should resolve to a single tag.
  for (const [attrName, attrValue] of api.seoTagSpecs()) {
    const matches = document.head.children.filter(
      (el) => el.tagName === 'META' && el.attrs && el.attrs[attrName] === attrValue,
    );
    assert.equal(matches.length, 1,
      `exactly one meta tag for ${attrName}="${attrValue}"`);
  }
});

test('upsertMeta updates content of a pre-existing tag rather than appending', () => {
  resetAll();
  // Pre-seed the description tag with stale content (mimicking the static
  // index.html default that ships with the SPA shell).
  const stale = document.createElement('meta');
  stale.setAttribute('name', 'description');
  stale.setAttribute('content', 'STALE — will be overwritten');
  document.head.appendChild(stale);
  const before = document.head.children.length;

  api.upsertMeta('name', 'description', 'fresh content');
  assert.equal(document.head.children.length, before,
    'no new tag appended when one already exists');
  assert.equal(metaContent('name', 'description'), 'fresh content');
});

test('renderPage applies SEO tags as a side effect', async () => {
  resetAll();
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ agents: [] }),
  });
  await api.renderPage(() => {});
  assert.equal(document.title, 'DeepSynaps Studio — Agents that run your clinic');
  assert.ok(metaContent('property', 'og:title'),
    'og:title injected during full page render');
  assert.ok(metaContent('name', 'twitter:card'),
    'twitter:card injected during full page render');
});

test('clearSeoTags is exposed for future router teardown wiring (no-op today)', () => {
  resetAll();
  api.setSeoTags();
  const before = document.head.children.length;
  // Documented as a no-op — must not throw and must not mutate <head>.
  assert.doesNotThrow(() => api.clearSeoTags());
  assert.equal(document.head.children.length, before);
});
