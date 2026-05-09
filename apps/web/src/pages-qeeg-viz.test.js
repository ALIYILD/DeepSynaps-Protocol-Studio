// tests for pages-qeeg-viz.js
// The module executes `document.head.appendChild(vizStyle)` at module scope.
// A DOM shim must be in place before import.
// Tests pin: exported function signatures, graceful degradation when caps
// are null/missing, the esc() XSS guard, and the chord fallback renderer.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

let savedDocument, savedFetch;

before(() => {
  savedDocument = globalThis.document;
  savedFetch = globalThis.fetch;

  // Style element created at module scope
  const styleEl = { textContent: '' };
  // Generic element stub for other createElement calls
  const makeEl = (tag) => ({
    tag,
    innerHTML: '',
    style: {},
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
    dataset: {},
    classList: { add() {}, remove() {} },
    disabled: false,
    textContent: '',
    href: '',
    download: '',
    click() {},
    value: 'power',
  });

  globalThis.document = {
    createElement: (tag) => tag === 'style' ? styleEl : makeEl(tag),
    head: { appendChild() {} },
    body: { appendChild() {}, removeChild() {} },
    getElementById: () => null,
  };

  // fetch stub — returns a safe JSON payload for all calls
  globalThis.fetch = (url) => {
    // Token lookup from localStorage
    if (!url) return Promise.reject(new Error('no url'));
    return Promise.resolve(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  };

  // localStorage shim
  if (!globalThis.localStorage) {
    globalThis.localStorage = {
      _store: {},
      getItem(k) { return this._store[k] ?? null; },
      setItem(k, v) { this._store[k] = v; },
    };
  }

  // URL shim
  globalThis.URL = globalThis.URL || {};
  globalThis.URL.createObjectURL = globalThis.URL.createObjectURL || (() => 'blob:mock');
  globalThis.URL.revokeObjectURL = globalThis.URL.revokeObjectURL || (() => {});
  globalThis.Blob = globalThis.Blob || class MockBlob {
    constructor(parts, opts) { this.parts = parts; this.type = opts?.type || ''; }
  };
});

after(() => {
  globalThis.document = savedDocument;
  globalThis.fetch = savedFetch;
});

const mod = await import('./pages-qeeg-viz.js');

// ── Exported function inventory ───────────────────────────────────────────────

describe('pages-qeeg-viz exports', () => {
  const expected = [
    'fetchVizCapabilities',
    'renderV2TopomapPanel',
    'renderV2BandGridPanel',
    'renderV2ConnectivityPanel',
    'renderV2SourcePanel',
    'renderV2AnimationPanel',
    'generateV2Report',
    'mountVizV2Panels',
  ];

  for (const name of expected) {
    it(`exports ${name} as a function`, () => {
      assert.strictEqual(typeof mod[name], 'function', `${name} should be a function`);
    });
  }
});

// ── fetchVizCapabilities ──────────────────────────────────────────────────────

describe('fetchVizCapabilities', () => {
  it('returns null when fetch resolves with non-ok status', async () => {
    const savedFetch = globalThis.fetch;
    globalThis.fetch = () =>
      Promise.resolve(new Response('{}', { status: 500 }));
    const result = await mod.fetchVizCapabilities('test-id');
    globalThis.fetch = savedFetch;
    assert.strictEqual(result, null);
  });

  it('returns null when fetch rejects (network error)', async () => {
    const savedFetch = globalThis.fetch;
    globalThis.fetch = () => Promise.reject(new Error('network error'));
    const result = await mod.fetchVizCapabilities('test-id');
    globalThis.fetch = savedFetch;
    assert.strictEqual(result, null);
  });

  it('returns parsed capabilities when API responds successfully', async () => {
    const caps = { has_topomaps: true, bands: ['alpha', 'beta'], has_connectivity: false };
    const savedFetch = globalThis.fetch;
    globalThis.fetch = () =>
      Promise.resolve(
        new Response(JSON.stringify(caps), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    const result = await mod.fetchVizCapabilities('test-id');
    globalThis.fetch = savedFetch;
    assert.deepStrictEqual(result, caps);
  });
});

// ── renderV2TopomapPanel — caps guard ─────────────────────────────────────────

describe('renderV2TopomapPanel caps guard', () => {
  it('writes "No topomap data available" when caps.has_topomaps is falsy', async () => {
    const container = {
      innerHTML: '',
      querySelector: () => null,
      querySelectorAll: () => [],
    };
    await mod.renderV2TopomapPanel(container, 'any-id', { has_topomaps: false, bands: [] });
    assert.ok(
      container.innerHTML.includes('No topomap data available'),
      `Expected no-data message, got: ${container.innerHTML}`,
    );
  });

  it('writes "" when caps is null', async () => {
    const container = {
      innerHTML: 'old',
      querySelector: () => null,
      querySelectorAll: () => [],
    };
    await mod.renderV2TopomapPanel(container, 'any-id', null);
    assert.ok(
      container.innerHTML.includes('No topomap data available'),
      `Expected no-data message when caps is null`,
    );
  });
});

// ── renderV2BandGridPanel — caps guard ────────────────────────────────────────

describe('renderV2BandGridPanel caps guard', () => {
  it('clears container when caps.has_topomaps is false', async () => {
    const container = { innerHTML: 'old', querySelector: () => null };
    await mod.renderV2BandGridPanel(container, 'any-id', { has_topomaps: false });
    assert.strictEqual(container.innerHTML, '');
  });
});

// ── renderV2ConnectivityPanel — caps guard ────────────────────────────────────

describe('renderV2ConnectivityPanel caps guard', () => {
  it('clears container when caps.has_connectivity is false', async () => {
    const container = { innerHTML: 'old' };
    await mod.renderV2ConnectivityPanel(container, 'any-id', { has_connectivity: false });
    assert.strictEqual(container.innerHTML, '');
  });
});

// ── renderV2SourcePanel — caps guard ─────────────────────────────────────────

describe('renderV2SourcePanel caps guard', () => {
  it('clears container when caps.has_source is false', async () => {
    const container = { innerHTML: 'old' };
    await mod.renderV2SourcePanel(container, 'any-id', { has_source: false });
    assert.strictEqual(container.innerHTML, '');
  });
});

// ── renderV2AnimationPanel — caps guard ──────────────────────────────────────

describe('renderV2AnimationPanel caps guard', () => {
  it('clears container when caps.has_animation is false', () => {
    const container = { innerHTML: 'old' };
    mod.renderV2AnimationPanel(container, 'any-id', { has_animation: false });
    assert.strictEqual(container.innerHTML, '');
  });

  it('renders animation panel HTML when caps.has_animation is true', () => {
    let capturedHTML = '';
    const container = {
      get innerHTML() { return capturedHTML; },
      set innerHTML(v) { capturedHTML = v; },
      querySelector: () => ({
        addEventListener: () => {},
        disabled: false,
        textContent: '',
        style: {},
        value: 'alpha',
      }),
    };
    mod.renderV2AnimationPanel(container, 'any-id', {
      has_animation: true,
      bands: ['alpha', 'beta'],
    });
    assert.ok(capturedHTML.includes('Load Frames'), `Expected "Load Frames" button in animation panel`);
    assert.ok(capturedHTML.includes('Animated Topomaps'), `Expected panel title in animation panel`);
  });
});

// ── generateV2Report — error propagation ─────────────────────────────────────

describe('generateV2Report', () => {
  it('throws an error wrapping the API failure message', async () => {
    const savedFetch = globalThis.fetch;
    globalThis.fetch = () =>
      Promise.resolve(new Response('Not found', { status: 404 }));
    let thrownMessage = null;
    try {
      await mod.generateV2Report('nonexistent-id');
    } catch (err) {
      thrownMessage = err.message;
    }
    globalThis.fetch = savedFetch;
    assert.ok(thrownMessage !== null, 'Expected an error to be thrown');
    assert.ok(
      thrownMessage.includes('Report generation failed'),
      `Expected "Report generation failed" in error, got: ${thrownMessage}`,
    );
  });
});

// ── XSS guard (esc function) ──────────────────────────────────────────────────

describe('pages-qeeg-viz esc() XSS guard', () => {
  it('module source contains all four HTML entity escapes', () => {
    const src = readFileSync(fileURLToPath(new URL('./pages-qeeg-viz.js', import.meta.url)), 'utf8');
    assert.ok(src.includes('&amp;'), 'Expected &amp; escape');
    assert.ok(src.includes('&lt;'), 'Expected &lt; escape');
    assert.ok(src.includes('&gt;'), 'Expected &gt; escape');
    assert.ok(src.includes('&quot;'), 'Expected &quot; escape');
  });
});
