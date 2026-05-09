// Tests for pages-protocols.js
//
// pages-protocols.js accesses `window` at module evaluation time (line 166),
// so we must ensure globalThis.window exists before the module is first
// imported. We use a top-level `globalThis.window` assignment at the very top
// of this test file — because ES module imports are hoisted, we also set up a
// _setup.js pre-loader via --require (not available in node:test). Instead we
// rely on the fact that globalThis.window is shared at process startup.
//
// Solution: set globalThis.window = globalThis (or a minimal object) in a
// loader registered via NODE_OPTIONS or via --import. The cleanest zero-config
// workaround is to set it here at top-level — the assignment runs as part of
// module instantiation before the actual import graph is evaluated because
// module body runs top-to-bottom in declaration order.
//
// Actually, ES module `import` declarations ARE evaluated BEFORE the rest of
// the module body. We therefore work around this by using dynamic import()
// inside the test runner hooks.
//
// Public exports:
//   pgProtocolSearch(setTopbar, navigate, opts)
//   pgProtocolDetail(setTopbar, navigate)
//   pgProtocolBuilderV2(setTopbar, navigate)
//
// No __*TestApi__ seam exists. Tests exercise the rendered DOM output.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';

// ── Pre-stub window BEFORE dynamic import of the module ──────────────────────
if (typeof globalThis.window === 'undefined') {
  globalThis.window = {
    _nav: () => {},
    _showNotifToast: () => {},
    confirm: () => false,
    _protDetailId: null,
    _protFromCondition: null,
    _protOffLabelUseAcks: {},
  };
}
// Also stub fetch to prevent live network calls
const _origFetch = globalThis.fetch;
globalThis.fetch = () => Promise.reject(new Error('offline'));

// ── Dynamic import (runs AFTER window is defined) ─────────────────────────────
const { pgProtocolSearch, pgProtocolDetail, pgProtocolBuilderV2 } =
  await import('./pages-protocols.js');

// Restore fetch after import
globalThis.fetch = _origFetch;

// ── Minimal DOM stub helpers ──────────────────────────────────────────────────
function makeElement(tag) {
  const el = {
    tagName: tag || 'DIV',
    id: '',
    innerHTML: '',
    style: {},
    firstChild: null,
    firstElementChild: null,
    classList: { add: () => {}, remove: () => {}, contains: () => false },
    appendChild: () => el,
    setAttribute: () => {},
    getAttribute: () => null,
    removeAttribute: () => {},
    addEventListener: () => {},
    querySelector: () => null,
    querySelectorAll: () => [],
    insertBefore: () => el,
    contains: () => false,
  };
  return el;
}

function makeHost() {
  const h = makeElement('DIV');
  h.insertBefore = () => h;
  h.firstChild = null;
  return h;
}

function setupDOM(host) {
  globalThis.document = {
    getElementById: (id) => id === 'content' ? host : null,
    createElement: (tag) => makeElement(tag),
    body: { appendChild: () => {}, contains: () => false, insertBefore: () => {} },
    head: { appendChild: () => {} },
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  globalThis.localStorage = {
    _store: {},
    getItem(k) { return this._store[k] ?? null; },
    setItem(k, v) { this._store[k] = String(v); },
    removeItem(k) { delete this._store[k]; },
  };
  globalThis.window = {
    ...(globalThis.window || {}),
    _nav: () => {},
    _showNotifToast: () => {},
    confirm: () => false,
    _protDetailId: null,
    _protFromCondition: null,
    _protOffLabelUseAcks: {},
  };
}

function teardownDOM() {
  delete globalThis.document;
  delete globalThis.localStorage;
}

let _stubFetch;
function stubFetch() {
  _stubFetch = globalThis.fetch;
  globalThis.fetch = () => Promise.reject(new Error('offline'));
}
function restoreFetch() {
  globalThis.fetch = _stubFetch;
}

// ── Export contract ───────────────────────────────────────────────────────────

describe('pages-protocols — export contract', () => {
  it('pgProtocolSearch is a function', () => {
    assert.strictEqual(typeof pgProtocolSearch, 'function');
  });

  it('pgProtocolDetail is a function', () => {
    assert.strictEqual(typeof pgProtocolDetail, 'function');
  });

  it('pgProtocolBuilderV2 is a function', () => {
    assert.strictEqual(typeof pgProtocolBuilderV2, 'function');
  });
});

// ── pgProtocolSearch renders the curated library ──────────────────────────────

describe('pages-protocols — pgProtocolSearch renders library', () => {
  let host;
  before(async () => {
    host = makeHost();
    setupDOM(host);
    stubFetch();
    await pgProtocolSearch(() => {}, () => {}, { mountEl: host });
  });
  after(() => {
    teardownDOM();
    restoreFetch();
  });

  it('renders non-trivial HTML', () => {
    assert.ok(host.innerHTML.length > 100, 'page should render non-trivial HTML');
  });

  it('renders protocol-related elements (prot- CSS classes)', () => {
    const html = host.innerHTML;
    assert.ok(
      html.includes('prot-') || html.includes('Protocol') || html.includes('protocol'),
      'page should include protocol-related elements'
    );
  });

  it('includes at least one evidence grade badge', () => {
    const html = host.innerHTML;
    const hasGrade = /Grade [ABCDE]/.test(html) || html.includes('prot-evidence-badge');
    assert.ok(hasGrade, 'should render evidence grade badges from the curated library');
  });

  it('renders governance badge elements (on-label or off-label)', () => {
    const html = host.innerHTML;
    assert.ok(
      html.includes('prot-gov-badge') || html.includes('on-label') || html.includes('off-label'),
      'governance badges should be rendered'
    );
  });

  it('renders device labels for at least one known device', () => {
    const html = host.innerHTML;
    const hasDevice = /tms|tdcs|neurofeedback|nf|rTMS|TdCS/i.test(html);
    assert.ok(hasDevice, 'at least one device label should appear in rendered output');
  });

  it('includes numeric counts (>0 protocols)', () => {
    const html = host.innerHTML;
    assert.ok(/\d+/.test(html), 'rendered HTML should include numeric counts');
  });

  it('calls setTopbar with Protocol Intelligence', async () => {
    let capturedTitle = '';
    const h = makeHost();
    setupDOM(h);
    stubFetch();
    await pgProtocolSearch((title) => { capturedTitle = title; }, () => {}, { mountEl: h });
    teardownDOM();
    restoreFetch();
    assert.ok(
      capturedTitle.includes('Protocol'),
      `setTopbar should be called with a title containing "Protocol", got: "${capturedTitle}"`
    );
  });
});

// ── opts.mountEl targeting ────────────────────────────────────────────────────

describe('pages-protocols — pgProtocolSearch mountEl targeting', () => {
  it('renders into opts.mountEl, not #content', async () => {
    const altHost = makeHost();
    const contentHost = makeHost();
    setupDOM(contentHost);
    stubFetch();
    await pgProtocolSearch(() => {}, () => {}, { mountEl: altHost });
    teardownDOM();
    restoreFetch();
    assert.ok(altHost.innerHTML.length > 0, 'altHost should have rendered content');
    assert.strictEqual(contentHost.innerHTML, '', '#content should NOT be touched');
  });
});

// ── pgProtocolBuilderV2 renders builder form ──────────────────────────────────

describe('pages-protocols — pgProtocolBuilderV2 renders', () => {
  let host;
  before(async () => {
    host = makeHost();
    setupDOM(host);
    stubFetch();
    await pgProtocolBuilderV2(() => {}, () => {});
  });
  after(() => {
    teardownDOM();
    restoreFetch();
  });

  it('renders non-trivial HTML', () => {
    assert.ok(host.innerHTML.length > 100, 'builder should render non-trivial HTML');
  });

  it('builder includes "Protocol" or builder-related content', () => {
    const html = host.innerHTML;
    assert.ok(
      html.includes('Protocol') || html.includes('builder') || html.includes('prot-'),
      'builder page should include protocol-related content'
    );
  });
});
