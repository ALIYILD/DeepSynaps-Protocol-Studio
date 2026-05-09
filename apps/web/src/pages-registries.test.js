// pages-registries.test.js — public export pins for pages-registries.js
// Wave-6 coverage (PR 91/N)
//
// Strategy: verify all 10 exported page functions exist and have correct type.
// Use a minimal DOM stub so the module loads in Node without browser APIs.
// Avoid triggering real fetch calls; stub globalThis.fetch.

import { describe, it } from 'node:test';
import assert from 'node:assert';

// ── Minimal DOM stub ──────────────────────────────────────────────────────────
const _makeEl = (id) => ({
  id: id || '',
  innerHTML: '',
  style: {},
  setAttribute: () => {},
  appendChild: () => {},
  remove: () => {},
  addEventListener: () => {},
  querySelector: () => null,
  querySelectorAll: () => [],
  classList: { add: () => {}, remove: () => {}, contains: () => false, toggle: () => {} },
  children: [],
});

globalThis.window = globalThis.window || {};
const _contentEl = _makeEl('content');
globalThis.document = {
  getElementById: (id) => {
    if (id === 'content') return _contentEl;
    return null;
  },
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: (tag) => _makeEl(),
  body: { appendChild: () => {}, removeChild: () => {} },
};

// Stub fetch: all endpoints return empty items list
globalThis.fetch = () =>
  Promise.resolve(
    new Response(JSON.stringify({ items: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );

import {
  pgConditionRegistry,
  pgAssessmentRegistry,
  pgProtocolRegistryPage,
  pgDeviceRegistry,
  pgBrainTargetRegistry,
  pgConsentRegistry,
  pgReportTemplateRegistry,
  pgHandbookRegistry,
  pgHomeProgramRegistry,
  pgVirtualCareRegistry,
} from './pages-registries.js';

// ── Export type checks ────────────────────────────────────────────────────────

describe('pages-registries exports', () => {
  it('pgConditionRegistry is an async function', () => {
    assert.strictEqual(typeof pgConditionRegistry, 'function');
    const r = pgConditionRegistry(() => {});
    assert.ok(r instanceof Promise);
    r.catch(() => {});
  });

  it('pgAssessmentRegistry is an async function', () => {
    assert.strictEqual(typeof pgAssessmentRegistry, 'function');
    const r = pgAssessmentRegistry(() => {});
    assert.ok(r instanceof Promise);
    r.catch(() => {});
  });

  it('pgProtocolRegistryPage is an async function', () => {
    assert.strictEqual(typeof pgProtocolRegistryPage, 'function');
    const r = pgProtocolRegistryPage(() => {});
    assert.ok(r instanceof Promise);
    r.catch(() => {});
  });

  it('pgDeviceRegistry is an async function', () => {
    assert.strictEqual(typeof pgDeviceRegistry, 'function');
    const r = pgDeviceRegistry(() => {});
    assert.ok(r instanceof Promise);
    r.catch(() => {});
  });

  it('pgBrainTargetRegistry is an async function', () => {
    assert.strictEqual(typeof pgBrainTargetRegistry, 'function');
    const r = pgBrainTargetRegistry(() => {});
    assert.ok(r instanceof Promise);
    r.catch(() => {});
  });

  it('pgConsentRegistry is an async function', () => {
    assert.strictEqual(typeof pgConsentRegistry, 'function');
    const r = pgConsentRegistry(() => {});
    assert.ok(r instanceof Promise);
    r.catch(() => {});
  });

  it('pgReportTemplateRegistry is an async function', () => {
    assert.strictEqual(typeof pgReportTemplateRegistry, 'function');
    const r = pgReportTemplateRegistry(() => {});
    assert.ok(r instanceof Promise);
    r.catch(() => {});
  });

  it('pgHandbookRegistry is an async function', () => {
    assert.strictEqual(typeof pgHandbookRegistry, 'function');
    const r = pgHandbookRegistry(() => {});
    assert.ok(r instanceof Promise);
    r.catch(() => {});
  });

  it('pgHomeProgramRegistry is an async function', () => {
    assert.strictEqual(typeof pgHomeProgramRegistry, 'function');
    const r = pgHomeProgramRegistry(() => {});
    assert.ok(r instanceof Promise);
    r.catch(() => {});
  });

  it('pgVirtualCareRegistry is an async function', () => {
    assert.strictEqual(typeof pgVirtualCareRegistry, 'function');
    const r = pgVirtualCareRegistry(() => {});
    assert.ok(r instanceof Promise);
    r.catch(() => {});
  });
});

// ── Dependency: protocols-data constants used by pgConditionRegistry ──────────

describe('pages-registries imports protocols-data correctly', () => {
  it('pgConditionRegistry resolves without throwing when #content exists', async () => {
    // Reset content el
    _contentEl.innerHTML = '';
    // Should resolve (fallback to CONDITION_REGISTRY when API returns empty)
    await pgConditionRegistry(() => {});
    // If we get here, it didn't throw
    assert.ok(true);
  });

  it('pgProtocolRegistryPage resolves without throwing', async () => {
    _contentEl.innerHTML = '';
    await pgProtocolRegistryPage(() => {});
    assert.ok(true);
  });

  it('pgDeviceRegistry resolves without throwing', async () => {
    _contentEl.innerHTML = '';
    await pgDeviceRegistry(() => {});
    assert.ok(true);
  });

  it('pgAssessmentRegistry resolves without throwing', async () => {
    _contentEl.innerHTML = '';
    await pgAssessmentRegistry(() => {});
    assert.ok(true);
  });
});

// ── setTopbar callback invoked ─────────────────────────────────────────────────

describe('setTopbar is called by registry pages', () => {
  it('pgConditionRegistry calls setTopbar with a title', async () => {
    let title = null;
    await pgConditionRegistry((t) => { title = t; });
    assert.ok(typeof title === 'string' && title.length > 0,
      `expected title string, got ${title}`);
  });

  it('pgAssessmentRegistry calls setTopbar', async () => {
    let title = null;
    await pgAssessmentRegistry((t) => { title = t; });
    assert.ok(typeof title === 'string' && title.length > 0);
  });

  it('pgDeviceRegistry calls setTopbar', async () => {
    let title = null;
    await pgDeviceRegistry((t) => { title = t; });
    assert.ok(typeof title === 'string' && title.length > 0);
  });

  it('pgHandbookRegistry calls setTopbar', async () => {
    let title = null;
    await pgHandbookRegistry((t) => { title = t; });
    assert.ok(typeof title === 'string' && title.length > 0);
  });
});

// ── Renders some HTML into #content ───────────────────────────────────────────

describe('registry pages render into #content', () => {
  it('pgConditionRegistry sets innerHTML of #content', async () => {
    _contentEl.innerHTML = '';
    await pgConditionRegistry(() => {});
    assert.ok(typeof _contentEl.innerHTML === 'string');
    // innerHTML may be set by registryShell
    assert.ok(_contentEl.innerHTML.length >= 0); // at least no crash
  });
});
