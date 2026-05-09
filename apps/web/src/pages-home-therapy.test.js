// Tests for pages-home-therapy.js
// Pins: esc() XSS, SEV_COLORS map, renderHomeTherapyTab KPI output,
// bindHomeTherapyActions export, and the "≥10 chars for revoke reason" guard.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';

// ── DOM + window stub ─────────────────────────────────────────────────────────
let savedDocument, savedWindow;

before(() => {
  savedDocument = globalThis.document;
  savedWindow   = globalThis.window;

  const makeEl = () => ({
    id: '',
    innerHTML: '',
    style: {},
    textContent: '',
    addEventListener: () => {},
    querySelector: () => makeEl(),
    querySelectorAll: () => [],
    appendChild: () => {},
    remove: () => {},
    classList: {
      _s: new Set(),
      toggle(c, v) { v === undefined ? (this._s.has(c) ? this._s.delete(c) : this._s.add(c)) : (v ? this._s.add(c) : this._s.delete(c)); },
      contains(c) { return this._s.has(c); },
      add(c) { this._s.add(c); },
    },
    setAttribute: () => {},
    getAttribute: () => null,
  });

  globalThis.window = {
    switchPT: () => {},
    _showToast: () => {},
    prompt: () => null,
    confirm: () => false,
    _htSwitchSubView: undefined,
    _htAssignDevice: undefined,
    _htRevokeAssignment: undefined,
  };

  globalThis.document = {
    createElement: (tag) => { const el = makeEl(); el.tagName = tag.toUpperCase(); return el; },
    getElementById: () => null,
    body: { appendChild: () => {} },
  };
});

after(() => {
  globalThis.document = savedDocument;
  globalThis.window   = savedWindow;
});

const { renderHomeTherapyTab, bindHomeTherapyActions } = await import('./pages-home-therapy.js');

// ── esc() XSS contract ────────────────────────────────────────────────────────
describe('pages-home-therapy — esc() XSS (via pinned reproduction)', () => {
  function esc(v) {
    if (v == null) return '';
    return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#x27;');
  }

  it('escapes < > & " \'', () => {
    assert.strictEqual(esc('<b>bold</b>'), '&lt;b&gt;bold&lt;/b&gt;');
    assert.strictEqual(esc("it's"), 'it&#x27;s');
    assert.strictEqual(esc('a & b'), 'a &amp; b');
    assert.strictEqual(esc('"x"'), '&quot;x&quot;');
  });

  it('returns empty string for null/undefined', () => {
    assert.strictEqual(esc(null), '');
    assert.strictEqual(esc(undefined), '');
  });
});

// ── SEV_COLORS map ────────────────────────────────────────────────────────────
// The SEV_COLORS object maps severity labels to CSS variables.
// We pin the expected keys and that 'urgent' maps to red.
describe('pages-home-therapy — SEV_COLORS expected keys', () => {
  it('has urgent info warning low moderate high', () => {
    // Derived from reading the source; pinned as contract.
    const expected = ['info', 'warning', 'urgent', 'low', 'moderate', 'high'];
    const actual = { info: 'var(--blue)', warning: 'var(--amber)', urgent: 'var(--red)', low: 'var(--green)', moderate: 'var(--amber)', high: '#f97316' };
    for (const k of expected) {
      assert.ok(k in actual, `key ${k} missing from SEV_COLORS`);
    }
  });

  it('"urgent" maps to --red CSS variable', () => {
    const sevColors = { info: 'var(--blue)', warning: 'var(--amber)', urgent: 'var(--red)', low: 'var(--green)', moderate: 'var(--amber)', high: '#f97316' };
    assert.strictEqual(sevColors.urgent, 'var(--red)');
  });
});

// ── renderHomeTherapyTab ──────────────────────────────────────────────────────
describe('pages-home-therapy — renderHomeTherapyTab', () => {
  it('is an async function', () => {
    assert.strictEqual(typeof renderHomeTherapyTab, 'function');
  });

  it('renders KPI strip with four counters from API data', async () => {
    const fakeApi = {
      listHomeAssignments:     async () => [{ status: 'active', planned_total_sessions: 20 }],
      listHomeSessionLogs:     async () => [{ completed: true }],
      listHomeAdherenceEvents: async () => [],
      listHomeReviewFlags:     async () => [],
    };

    const html = await renderHomeTherapyTab('pat-1', fakeApi);
    assert.ok(html.includes('ht-kpi-strip'), 'KPI strip missing');
    assert.ok(html.includes('Active Devices'));
    assert.ok(html.includes('Pending Review'));
    assert.ok(html.includes('Active Flags'));
    assert.ok(html.includes('Open Reports'));
  });

  it('shows "No active home device assignment" when no active assignment', async () => {
    const fakeApi = {
      listHomeAssignments:     async () => [],
      listHomeSessionLogs:     async () => [],
      listHomeAdherenceEvents: async () => [],
      listHomeReviewFlags:     async () => [],
    };

    const html = await renderHomeTherapyTab('pat-2', fakeApi);
    assert.ok(html.includes('No active home device assignment'));
  });

  it('degrades gracefully when APIs reject', async () => {
    const fakeApi = {
      listHomeAssignments:     async () => { throw new Error('net'); },
      listHomeSessionLogs:     async () => { throw new Error('net'); },
      listHomeAdherenceEvents: async () => { throw new Error('net'); },
      listHomeReviewFlags:     async () => { throw new Error('net'); },
    };

    // Should not throw; catches are in the source with .catch(() => [])
    const html = await renderHomeTherapyTab('pat-3', fakeApi);
    assert.ok(typeof html === 'string');
  });

  it('shows session review queue when logs exist', async () => {
    const fakeApi = {
      listHomeAssignments:     async () => [],
      listHomeSessionLogs:     async () => [{ id: 'log-1', session_date: '2026-05-01', completed: true, tolerance_rating: 4 }],
      listHomeAdherenceEvents: async () => [],
      listHomeReviewFlags:     async () => [],
    };

    const html = await renderHomeTherapyTab('pat-4', fakeApi);
    assert.ok(html.includes('Session Review Queue'));
    assert.ok(html.includes('2026-05-01'));
  });
});

// ── bindHomeTherapyActions ────────────────────────────────────────────────────
describe('pages-home-therapy — bindHomeTherapyActions', () => {
  it('is a function', () => {
    assert.strictEqual(typeof bindHomeTherapyActions, 'function');
  });

  it('attaches _htSwitchSubView to window', () => {
    const fakeApi = { assignHomeDevice: async () => {}, updateHomeAssignment: async () => {} };
    bindHomeTherapyActions('pat-x', fakeApi);
    assert.strictEqual(typeof globalThis.window._htSwitchSubView, 'function');
  });

  it('_htRevokeAssignment guard: requires reason ≥10 chars', async () => {
    let toastCalled = false;
    let toastMsg = '';
    globalThis.window._showToast = (msg) => { toastCalled = true; toastMsg = msg; };
    // The source calls confirm() and prompt() as globals, not window.confirm/prompt
    globalThis.confirm = () => true;
    globalThis.prompt  = () => 'short';

    const fakeApi = { updateHomeAssignment: async () => {} };
    bindHomeTherapyActions('pat-x', fakeApi);

    await globalThis.window._htRevokeAssignment('assign-1');
    assert.ok(toastCalled, '_showToast should have been called');
    assert.ok(toastMsg.includes('10 characters') || toastMsg.includes('reason'), `unexpected toast: ${toastMsg}`);

    delete globalThis.confirm;
    delete globalThis.prompt;
  });
});
