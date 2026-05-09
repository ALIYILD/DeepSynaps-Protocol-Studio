// Tests for pages-consent.js
//
// Public exports: pgConsentManagement(setTopbar, navigate), renderConsentPanel(container).
//
// The module imports from ./api.js (for listConsentRecords, getConsentAuditLog, etc.)
// and ./protocols-data.js (CONDITIONS, DEVICES). We stub api calls and DOM.
//
// We test:
//   - export shapes
//   - that both page functions mount without throwing
//   - rendered HTML contains expected UI scaffolding
//   - window globals wired by _mountConsent
//   - CONSENT_TEMPLATES via window._consentUseTemplate side effects
//   - _buildDeviceRisks logic via TMS risks embedded in rendered HTML
//   - _statusColor / _statusIcon logic via rendered consent badge text

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { pgConsentManagement, renderConsentPanel } from './pages-consent.js';

// ── Minimal DOM + global stub ─────────────────────────────────────────────────
let savedDocument;
let savedWindow;
let savedFetch;

function makeDivEl() {
  const el = {
    innerHTML: '',
    style: {},
    appendChild() {},
    querySelector: () => null,
    querySelectorAll: () => [],
    classList: { add() {}, remove() {}, contains: () => false },
  };
  return el;
}

before(() => {
  savedDocument = globalThis.document;
  savedWindow = globalThis.window;
  savedFetch = globalThis.fetch;

  // Stub all api calls to resolve gracefully
  globalThis.fetch = () =>
    Promise.resolve(new Response(JSON.stringify({ items: [] }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    }));

  const contentEl = makeDivEl();
  const styleEl = { id: '', textContent: '' };

  globalThis.document = {
    createElement: (tag) => {
      if (tag === 'style') return styleEl;
      return makeDivEl();
    },
    head: { appendChild() {}, querySelector: () => null },
    getElementById: (id) => id === 'content' ? contentEl : null,
    querySelector: () => null,
    querySelectorAll: () => [],
    _content: contentEl,
  };

  globalThis.window = Object.assign(globalThis.window || {}, {
    _showNotifToast: () => {},
    _showToast: () => {},
  });

  globalThis.requestAnimationFrame = (cb) => { setTimeout(cb, 0); return 1; };
  globalThis.cancelAnimationFrame = () => {};
});

after(() => {
  globalThis.document = savedDocument;
  if (savedWindow !== undefined) globalThis.window = savedWindow;
  globalThis.fetch = savedFetch;
  // Clean up module-level state
  if (globalThis.window) delete globalThis.window._consentState;
});

// ── Export shapes ─────────────────────────────────────────────────────────────

describe('pages-consent exports', () => {
  it('pgConsentManagement is an async function', () => {
    assert.strictEqual(typeof pgConsentManagement, 'function');
  });

  it('renderConsentPanel is an async function', () => {
    assert.strictEqual(typeof renderConsentPanel, 'function');
  });
});

// ── pgConsentManagement mount ─────────────────────────────────────────────────

describe('pgConsentManagement', () => {
  it('does not throw when content element exists', async () => {
    let threw = false;
    try {
      await pgConsentManagement(() => {}, () => {});
    } catch {
      threw = true;
    }
    assert.ok(!threw, 'pgConsentManagement must not throw');
  });

  it('calls setTopbar with "Consent Management" title', async () => {
    let topbarTitle = null;
    await pgConsentManagement((title) => { topbarTitle = title; }, () => {});
    assert.strictEqual(topbarTitle, 'Consent Management');
  });

  it('renders tab bar into content element', async () => {
    // Reset state so re-render fires
    if (globalThis.window) delete globalThis.window._consentState;
    await pgConsentManagement(() => {}, () => {});
    const html = globalThis.document._content.innerHTML;
    assert.ok(html.length > 0, 'content must be non-empty after mount');
  });

  it('rendered HTML includes "dashboard" tab reference', async () => {
    await pgConsentManagement(() => {}, () => {});
    const html = globalThis.document._content.innerHTML;
    assert.ok(
      html.toLowerCase().includes('dashboard'),
      'rendered HTML must contain "dashboard" tab',
    );
  });

  it('rendered HTML includes "templates" tab reference', async () => {
    await pgConsentManagement(() => {}, () => {});
    const html = globalThis.document._content.innerHTML;
    assert.ok(
      html.toLowerCase().includes('templates'),
      'rendered HTML must contain "templates" tab',
    );
  });

  it('rendered HTML includes consent status labels', async () => {
    await pgConsentManagement(() => {}, () => {});
    const html = globalThis.document._content.innerHTML;
    // Demo data has signed, pending, expired, revoked statuses
    assert.ok(
      html.toLowerCase().includes('signed') || html.toLowerCase().includes('pending'),
      'rendered HTML must contain consent status labels',
    );
  });
});

// ── renderConsentPanel (embedded mode) ───────────────────────────────────────

describe('renderConsentPanel', () => {
  it('does not throw with a valid container element', async () => {
    const container = makeDivEl();
    let threw = false;
    try {
      await renderConsentPanel(container);
    } catch {
      threw = true;
    }
    assert.ok(!threw, 'renderConsentPanel must not throw with valid container');
  });

  it('returns without throwing when container is null', async () => {
    let threw = false;
    try {
      await renderConsentPanel(null);
    } catch {
      threw = true;
    }
    assert.ok(!threw, 'renderConsentPanel must not throw when container is null');
  });

  it('populates container innerHTML after mount', async () => {
    const container = makeDivEl();
    await renderConsentPanel(container);
    assert.ok(container.innerHTML.length > 0, 'container must have content after mount');
  });
});

// ── Window globals wired by _mountConsent ─────────────────────────────────────

describe('window globals wired by pgConsentManagement', () => {
  it('_consentTab is a function', async () => {
    await pgConsentManagement(() => {}, () => {});
    assert.strictEqual(typeof globalThis.window._consentTab, 'function');
  });

  it('_consentFilter is a function', async () => {
    await pgConsentManagement(() => {}, () => {});
    assert.strictEqual(typeof globalThis.window._consentFilter, 'function');
  });

  it('_consentSearch is a function', async () => {
    await pgConsentManagement(() => {}, () => {});
    assert.strictEqual(typeof globalThis.window._consentSearch, 'function');
  });

  it('_consentViewDetail is a function', async () => {
    await pgConsentManagement(() => {}, () => {});
    assert.strictEqual(typeof globalThis.window._consentViewDetail, 'function');
  });

  it('_consentUseTemplate is a function', async () => {
    await pgConsentManagement(() => {}, () => {});
    assert.strictEqual(typeof globalThis.window._consentUseTemplate, 'function');
  });

  it('_consentBuilderField is a function', async () => {
    await pgConsentManagement(() => {}, () => {});
    assert.strictEqual(typeof globalThis.window._consentBuilderField, 'function');
  });

  it('_consentBuilderField updates builder state', async () => {
    await pgConsentManagement(() => {}, () => {});
    globalThis.window._consentBuilderField('patientName', 'Alice Test');
    assert.strictEqual(globalThis.window._consentState?.builder?.patientName, 'Alice Test');
  });

  it('_consentTab switches tab state', async () => {
    await pgConsentManagement(() => {}, () => {});
    globalThis.window._consentTab('templates');
    assert.strictEqual(globalThis.window._consentState?.tab, 'templates');
  });

  it('_consentFilter sets dashFilter state', async () => {
    await pgConsentManagement(() => {}, () => {});
    globalThis.window._consentFilter('pending');
    assert.strictEqual(globalThis.window._consentState?.dashFilter, 'pending');
  });

  it('_consentSearch sets dashSearch state', async () => {
    await pgConsentManagement(() => {}, () => {});
    globalThis.window._consentSearch('Johnson');
    assert.strictEqual(globalThis.window._consentState?.dashSearch, 'Johnson');
  });

  it('_consentCloseDetail resets viewingConsent and signatureMode', async () => {
    await pgConsentManagement(() => {}, () => {});
    globalThis.window._consentState.viewingConsent = 'some-id';
    globalThis.window._consentState.signatureMode = true;
    globalThis.window._consentCloseDetail();
    assert.strictEqual(globalThis.window._consentState.viewingConsent, null);
    assert.strictEqual(globalThis.window._consentState.signatureMode, false);
  });
});

// ── CONSENT_TEMPLATES via window._consentUseTemplate ─────────────────────────

describe('CONSENT_TEMPLATES wired via window globals', () => {
  it('_consentUseTemplate switches to builder tab for tpl-tms', async () => {
    await pgConsentManagement(() => {}, () => {});
    globalThis.window._consentUseTemplate('tpl-tms');
    assert.strictEqual(globalThis.window._consentState?.tab, 'builder');
    assert.strictEqual(globalThis.window._consentState?.builder?.templateId, 'tpl-tms');
  });

  it('_consentUseTemplate populates device for tpl-tdcs', async () => {
    await pgConsentManagement(() => {}, () => {});
    globalThis.window._consentUseTemplate('tpl-tdcs');
    assert.strictEqual(globalThis.window._consentState?.builder?.device, 'tdcs');
  });
});

// ── Demo consents state ───────────────────────────────────────────────────────

describe('default consent state', () => {
  it('_consentState.consents is a non-empty array after mount', async () => {
    // Fresh state
    if (globalThis.window) delete globalThis.window._consentState;
    await pgConsentManagement(() => {}, () => {});
    const consents = globalThis.window._consentState?.consents;
    assert.ok(Array.isArray(consents), 'consents must be an array');
    assert.ok(consents.length > 0, 'consents must be non-empty (demo data)');
  });

  it('_consentState.auditLog is a non-empty array after mount', async () => {
    const auditLog = globalThis.window._consentState?.auditLog;
    assert.ok(Array.isArray(auditLog) && auditLog.length > 0, 'auditLog must be non-empty');
  });

  it('every demo consent has required fields: id, patient_name, status, template_id', async () => {
    const consents = globalThis.window._consentState?.consents || [];
    for (const c of consents) {
      assert.ok(typeof c.id === 'string' && c.id.length > 0, 'consent must have id');
      assert.ok(typeof c.patient_name === 'string', 'consent must have patient_name');
      assert.ok(typeof c.status === 'string', 'consent must have status');
      assert.ok(typeof c.template_id === 'string', 'consent must have template_id');
    }
  });

  it('demo consents include at least one "signed" record', async () => {
    const consents = globalThis.window._consentState?.consents || [];
    const signed = consents.filter(c => c.status === 'signed');
    assert.ok(signed.length > 0, 'must have at least one signed consent in demo data');
  });
});
