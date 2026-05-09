// tests for pages-research.js
// The module exports a single async function pgResearch.
// All render tabs call async API methods and write into the DOM.
// We test: the export exists, the module-internal _esc helper, the tab list
// shape, and that render gracefully degrades when the DOM has no #content el.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// ── Minimal DOM + fetch shim ────────────────────────────────────────────────
let savedDocument, savedFetch;

before(() => {
  savedDocument = globalThis.document;
  savedFetch = globalThis.fetch;

  // Minimal document stub — #content element is absent so pgResearch early-returns.
  globalThis.document = {
    getElementById: (id) => (id === 'content' ? null : null),
    createElement: (tag) => ({ tag, textContent: '', style: {} }),
    head: { appendChild() {} },
  };

  // fetch returns a safe empty payload for any API call
  globalThis.fetch = () =>
    Promise.resolve(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
});

after(() => {
  globalThis.document = savedDocument;
  globalThis.fetch = savedFetch;
});

const mod = await import('./pages-research.js');

describe('pgResearch export', () => {
  it('is exported as an async function', () => {
    assert.strictEqual(typeof mod.pgResearch, 'function');
  });

  it('does not throw when no #content element exists', async () => {
    let threw = false;
    try {
      await mod.pgResearch(() => {}, () => {});
    } catch {
      threw = true;
    }
    assert.ok(!threw, 'pgResearch must not throw when DOM element is absent');
  });

  it('calls setTopbar with a string title including "Research"', async () => {
    let capturedTitle = null;
    await mod.pgResearch((title) => { capturedTitle = title; }, () => {});
    assert.ok(
      String(capturedTitle).toLowerCase().includes('research'),
      `setTopbar title should include "Research", got: ${capturedTitle}`,
    );
  });
});

describe('pages-research tab definitions', () => {
  // pages-research.js uses the bare `window` global for handler registration.
  // In Node there is no `window`, so we must stub it on globalThis before calling pgResearch.
  it('registers window._researchSetTab as a function after render', async () => {
    const host = { innerHTML: '' };
    const savedDoc = globalThis.document;
    const hadWindow = 'window' in globalThis;
    if (!hadWindow) globalThis.window = globalThis;
    globalThis.document = {
      getElementById: (id) => (id === 'content' ? host : null),
      createElement: (tag) => ({ tag, textContent: '', style: {} }),
      head: { appendChild() {} },
    };
    try {
      await mod.pgResearch(() => {}, () => {});
      assert.strictEqual(typeof globalThis._researchSetTab, 'function');
    } finally {
      globalThis.document = savedDoc;
      if (!hadWindow) delete globalThis.window;
    }
  });

  it('registers window._researchRender as a function after render', async () => {
    const host = { innerHTML: '' };
    const savedDoc = globalThis.document;
    const hadWindow = 'window' in globalThis;
    if (!hadWindow) globalThis.window = globalThis;
    globalThis.document = {
      getElementById: (id) => (id === 'content' ? host : null),
      createElement: (tag) => ({ tag, textContent: '', style: {} }),
      head: { appendChild() {} },
    };
    try {
      await mod.pgResearch(() => {}, () => {});
      assert.strictEqual(typeof globalThis._researchRender, 'function');
    } finally {
      globalThis.document = savedDoc;
      if (!hadWindow) delete globalThis.window;
    }
  });

  it('registers window._researchSetCohort, _researchSetFrom, _researchSetTo', async () => {
    const host = { innerHTML: '' };
    const savedDoc = globalThis.document;
    const hadWindow = 'window' in globalThis;
    if (!hadWindow) globalThis.window = globalThis;
    globalThis.document = {
      getElementById: (id) => (id === 'content' ? host : null),
      createElement: (tag) => ({ tag, textContent: '', style: {} }),
      head: { appendChild() {} },
    };
    try {
      await mod.pgResearch(() => {}, () => {});
      assert.strictEqual(typeof globalThis._researchSetCohort, 'function');
      assert.strictEqual(typeof globalThis._researchSetFrom, 'function');
      assert.strictEqual(typeof globalThis._researchSetTo, 'function');
    } finally {
      globalThis.document = savedDoc;
      if (!hadWindow) delete globalThis.window;
    }
  });
});

describe('pages-research preview banner wording', () => {
  // Preview banner must use the word "Preview Data" (visible in the template literal).
  // We test by importing the module source — the string is load-bearing because
  // clinicians see it when the live API is unavailable.
  it('preview-data banner text is in the module source', () => {
    const src = readFileSync(fileURLToPath(new URL('./pages-research.js', import.meta.url)), 'utf8');
    assert.ok(src.includes('Preview Data'), 'Expected "Preview Data" in _previewBanner label');
  });

  it('GDPR Article 20 export wording is present', () => {
    const src = readFileSync(fileURLToPath(new URL('./pages-research.js', import.meta.url)), 'utf8');
    assert.ok(src.includes('GDPR Article 20'), 'Expected GDPR Article 20 wording in data export section');
  });

  it('IRB adverse-event escalation section is present', () => {
    const src = readFileSync(fileURLToPath(new URL('./pages-research.js', import.meta.url)), 'utf8');
    assert.ok(src.includes('Adverse-event escalation'), 'Expected adverse-event escalation section in IRB tab');
  });

  it('QA coverage audit section is present', () => {
    const src = readFileSync(fileURLToPath(new URL('./pages-research.js', import.meta.url)), 'utf8');
    assert.ok(src.includes('Protocol coverage audit'), 'Expected protocol coverage audit section in QA tab');
  });
});

describe('pages-research _esc (XSS guard)', () => {
  // Verify the escaping function in pages-research.js handles HTML special chars.
  // We test the _esc function behaviour indirectly by checking that the module
  // source code includes the canonical escaping replacements.
  it('module source escapes & < > " characters', () => {
    const src = readFileSync(fileURLToPath(new URL('./pages-research.js', import.meta.url)), 'utf8');
    assert.ok(src.includes('&amp;'), 'Expected &amp; escape in _esc');
    assert.ok(src.includes('&lt;'), 'Expected &lt; escape in _esc');
    assert.ok(src.includes('&gt;'), 'Expected &gt; escape in _esc');
    assert.ok(src.includes('&quot;'), 'Expected &quot; escape in _esc');
  });
});
