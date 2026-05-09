// pages-practice.test.js — pins the public surface of pages-practice.js
//
// Strategy:
//   • Install a minimal JSDOM environment before importing the module.
//   • Cover all named exports: re-exported constants, sync page functions,
//     and async page functions.
//   • Pin clinical/AI safety strings that must not be silently removed.
//   • Skip canvas/WebGL — no canvas API usage in this module.
//
// Run: node --test src/pages-practice.test.js

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';

// ── Install DOM globals BEFORE any module import ──────────────────────────────
const _dom = new JSDOM(
  `<!doctype html>
   <html><body>
     <div id="content"></div>
     <div id="page-content"></div>
     <div id="topbar-title"></div>
     <div id="topbar-actions"></div>
   </body></html>`,
  { url: 'https://example.test/' },
);

const _ls = {};
const _lsShim = {
  getItem:    (k) => Object.prototype.hasOwnProperty.call(_ls, k) ? _ls[k] : null,
  setItem:    (k, v) => { _ls[k] = String(v); },
  removeItem: (k) => { delete _ls[k]; },
  clear:      () => { Object.keys(_ls).forEach(k => delete _ls[k]); },
  key:        (i) => Object.keys(_ls)[i] ?? null,
  get length() { return Object.keys(_ls).length; },
};
globalThis.localStorage = _lsShim;
try {
  Object.defineProperty(_dom.window, 'localStorage', { value: _lsShim, configurable: true });
} catch (_) { /* JSDOM may already define it */ }

globalThis.window    = _dom.window;
globalThis.document  = _dom.window.document;
globalThis.Event     = _dom.window.Event;
globalThis.HTMLElement  = _dom.window.HTMLElement;
globalThis.Node      = _dom.window.Node;
globalThis.MutationObserver  = _dom.window.MutationObserver;
globalThis.IntersectionObserver = _dom.window.IntersectionObserver || class {
  constructor() {} observe() {} unobserve() {} disconnect() {}
};
globalThis.ResizeObserver = _dom.window.ResizeObserver || class {
  constructor() {} observe() {} unobserve() {} disconnect() {}
};
globalThis.requestAnimationFrame  = _dom.window.requestAnimationFrame  || ((cb) => setTimeout(cb, 0));
globalThis.cancelAnimationFrame   = _dom.window.cancelAnimationFrame   || clearTimeout;

if (typeof globalThis.fetch === 'undefined') {
  globalThis.fetch = () => Promise.reject(new Error('fetch not available in test'));
}

// ── Dynamic import AFTER globals installed ────────────────────────────────────
const mod = await import('./pages-practice.js');

// ── 1. Re-exported constants from academy-clinic-constants.js ─────────────────
describe('pages-practice.js — re-exported constants', () => {
  it('re-exports ACADEMY_GOVERNANCE_DISCLAIMER as a non-empty string', () => {
    assert.strictEqual(typeof mod.ACADEMY_GOVERNANCE_DISCLAIMER, 'string');
    assert.ok(mod.ACADEMY_GOVERNANCE_DISCLAIMER.length > 0);
  });

  it('ACADEMY_GOVERNANCE_DISCLAIMER contains key governance phrase', () => {
    assert.ok(
      mod.ACADEMY_GOVERNANCE_DISCLAIMER.includes('does not diagnose') ||
      mod.ACADEMY_GOVERNANCE_DISCLAIMER.includes('training and reference'),
      'Governance disclaimer must reference training/reference and non-diagnostic nature',
    );
  });

  it('re-exports ACADEMY_CLINIC_LINKED_MODULES as a non-empty array', () => {
    assert.ok(Array.isArray(mod.ACADEMY_CLINIC_LINKED_MODULES));
    assert.ok(mod.ACADEMY_CLINIC_LINKED_MODULES.length > 0);
  });

  it('ACADEMY_CLINIC_LINKED_MODULES entries have page and label fields', () => {
    for (const m of mod.ACADEMY_CLINIC_LINKED_MODULES) {
      assert.ok(typeof m.page === 'string' && m.page.length > 0, `page field missing or empty in ${JSON.stringify(m)}`);
      assert.ok(typeof m.label === 'string' && m.label.length > 0, `label field missing or empty in ${JSON.stringify(m)}`);
    }
  });
});

// ── 2. Sync page function exports ────────────────────────────────────────────
describe('pages-practice.js — sync page function exports', () => {
  it('exports pgSchedule as a function', () => {
    assert.strictEqual(typeof mod.pgSchedule, 'function');
  });

  it('exports pgTelehealth as a function', () => {
    assert.strictEqual(typeof mod.pgTelehealth, 'function');
  });

  it('exports pgMsg as a function', () => {
    assert.strictEqual(typeof mod.pgMsg, 'function');
  });
});

// ── 3. Async page function exports ───────────────────────────────────────────
describe('pages-practice.js — async page function exports', () => {
  const ASYNC_PAGE_FNS = [
    'pgPrograms',
    'pgBilling',
    'pgReports',
    'pgSettings',
    'pgAIAssistant',
    'pgAdmin',
    'pgReferrals',
    'pgClinicSettings',
    'pgTelehealthRecorder',
    'pgInsuranceVerification',
    'pgWearableIntegration',
    'pgReminderAutomation',
    'pgMediaQueue',
    'pgHomeTaskManager',
    'pgGovernance',
    'pgSettingsHub',
    'pgTickets',
    'pgClinicianAccount',
    'pgClinicAcademy',
  ];

  for (const name of ASYNC_PAGE_FNS) {
    it(`exports ${name} as a function`, () => {
      assert.strictEqual(typeof mod[name], 'function', `${name} should be exported`);
    });
  }
});

// ── 4. Function arity contracts ───────────────────────────────────────────────
describe('pages-practice.js — function arity contracts', () => {
  it('pgSchedule accepts (setTopbar)', () => {
    assert.strictEqual(mod.pgSchedule.length, 1);
  });

  it('pgTelehealth accepts (setTopbar)', () => {
    assert.strictEqual(mod.pgTelehealth.length, 1);
  });

  it('pgMsg accepts (setTopbar)', () => {
    assert.strictEqual(mod.pgMsg.length, 1);
  });

  it('pgPrograms accepts (setTopbar)', () => {
    assert.strictEqual(mod.pgPrograms.length, 1);
  });

  it('pgBilling accepts (setTopbar)', () => {
    assert.strictEqual(mod.pgBilling.length, 1);
  });

  it('pgSettings accepts (setTopbar, currentUser)', () => {
    assert.strictEqual(mod.pgSettings.length, 2);
  });

  it('pgAdmin accepts (setTopbar, currentUser)', () => {
    assert.strictEqual(mod.pgAdmin.length, 2);
  });

  it('pgGovernance accepts (setTopbar, _navigate)', () => {
    assert.strictEqual(mod.pgGovernance.length, 2);
  });

  it('pgSettingsHub accepts (setTopbar, navigate)', () => {
    assert.strictEqual(mod.pgSettingsHub.length, 2);
  });

  it('pgTickets accepts (setTopbar, navigate)', () => {
    assert.strictEqual(mod.pgTickets.length, 2);
  });

  it('pgClinicianAccount accepts (setTopbar, currentUser)', () => {
    assert.strictEqual(mod.pgClinicianAccount.length, 2);
  });
});

// ── 5. pgTelehealth renders topbar + content ──────────────────────────────────
describe('pages-practice.js — pgTelehealth renders', () => {
  it('pgTelehealth calls setTopbar with "Telehealth" title', () => {
    let title = '';
    mod.pgTelehealth((t) => { title = t; });
    assert.strictEqual(title, 'Telehealth');
  });

  it('pgTelehealth writes non-empty HTML to #content', () => {
    const el = globalThis.document.getElementById('content');
    mod.pgTelehealth(() => {});
    assert.ok(el.innerHTML.length > 0, '#content should have HTML after pgTelehealth');
  });
});

// ── 6. pgMsg renders topbar + content ────────────────────────────────────────
describe('pages-practice.js — pgMsg renders', () => {
  it('pgMsg calls setTopbar with "Secure Messaging" title', () => {
    let title = '';
    mod.pgMsg((t) => { title = t; });
    assert.strictEqual(title, 'Secure Messaging');
  });

  it('pgMsg writes non-empty HTML to #content', () => {
    const el = globalThis.document.getElementById('content');
    mod.pgMsg(() => {});
    assert.ok(el.innerHTML.length > 0, '#content should have HTML after pgMsg');
  });
});

// ── 7. pgSchedule renders ────────────────────────────────────────────────────
describe('pages-practice.js — pgSchedule renders', () => {
  it('pgSchedule calls setTopbar with "Scheduling" title', () => {
    let title = '';
    mod.pgSchedule((t) => { title = t; });
    assert.strictEqual(title, 'Scheduling');
  });
});

// ── 8. Clinical / AI safety strings pinned (source-level) ────────────────────
describe('pages-practice.js — clinical safety strings', () => {
  it('source contains "Clinical AI Notice" heading', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('./pages-practice.js', import.meta.url), 'utf8');
    assert.ok(src.includes('Clinical AI Notice'), '"Clinical AI Notice" must be present');
  });

  it('source contains "draft only and must be reviewed" disclaimer', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('./pages-practice.js', import.meta.url), 'utf8');
    assert.ok(
      src.includes('draft only and must be reviewed'),
      '"draft only and must be reviewed" disclaimer must be present',
    );
  });

  it('source contains "not emergency triage" ticket disclaimer', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('./pages-practice.js', import.meta.url), 'utf8');
    assert.ok(
      src.includes('not emergency triage') || src.includes('not emergency'),
      'Ticket page must carry "not emergency triage" disclaimer',
    );
  });

  it('source contains "follow your clinic" safety escalation copy', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('./pages-practice.js', import.meta.url), 'utf8');
    assert.ok(
      src.includes('follow your clinic'),
      'Safety escalation copy "follow your clinic" must be present',
    );
  });

  it('source contains "imminent risk" patient safety copy', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('./pages-practice.js', import.meta.url), 'utf8');
    assert.ok(
      src.includes('imminent risk'),
      '"imminent risk" patient safety copy must be present',
    );
  });

  it('ACADEMY_GOVERNANCE_DISCLAIMER contains "clinician judgement" phrase', () => {
    assert.ok(
      mod.ACADEMY_GOVERNANCE_DISCLAIMER.includes('clinician judgement'),
      'Academy disclaimer must reference clinician judgement',
    );
  });
});

// ── 9. pgAdmin access-gate enforces admin role ───────────────────────────────
describe('pages-practice.js — pgAdmin access gate', () => {
  it('pgAdmin renders access-restricted notice for non-admin user', async () => {
    const el = globalThis.document.getElementById('content');
    const nonAdmin = { role: 'clinician', id: 'u1' };
    const { api } = await import('./api.js');
    try {
      await mod.pgAdmin(() => {}, nonAdmin);
    } catch (_) { /* ignore backend calls */ }
    assert.ok(
      el.innerHTML.includes('Access restricted') || el.innerHTML.includes('restricted'),
      'Non-admin users should see access-restricted message',
    );
  });
});
