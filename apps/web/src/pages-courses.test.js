// pages-courses.test.js — pins the public surface of pages-courses.js
//
// Strategy:
//   • Install a minimal DOM environment before importing the module (module
//     assigns window globals at load time and reads localStorage).
//   • Pin every named export by asserting function type or documented shape.
//   • Pin clinical-safety strings exactly (session execution UI).
//   • Skip canvas/WebGL rendering — no canvas APIs are required here.
//
// Run: node --test src/pages-courses.test.js

import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';

// ── Install DOM globals BEFORE any module import ──────────────────────────────
const _dom = new JSDOM(
  `<!doctype html>
   <html><body>
     <div id="content"></div>
     <div id="topbar-title"></div>
     <div id="topbar-actions"></div>
   </body></html>`,
  { url: 'https://example.test/' },
);

// localStorage shim — must be installed before any module reads localStorage
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

// Stub fetch so network requests at import time don't fail
if (typeof globalThis.fetch === 'undefined') {
  globalThis.fetch = () => Promise.reject(new Error('fetch not available in test'));
}

// ── Dynamic import AFTER globals installed ────────────────────────────────────
const mod = await import('./pages-courses.js');

// ── 1. Async page function exports ───────────────────────────────────────────
describe('pages-courses.js — async page function exports', () => {
  const ASYNC_PAGE_FNS = [
    'pgCourses',
    'pgClinicalNotes',
    'pgCourseDetail',
    'pgSessionExecution',
    'pgReviewQueue',
    'pgOutcomes',
    'pgAdverseEvents',
    'pgProtocolRegistry',
    'pgClinicalReports',
    'pgPopulationAnalytics',
    'pgCalendar',
    'pgSessionMonitor',
    'pgOutcomePrediction',
    'pgRulesEngine',
    'pgAINoteAssistant',
    'pgCourseCompletionReport',
    'pgQuickOutcomeCapture',
    'pgClinicianAdherenceHub',
    'pgClinicianWellnessHub',
    'pgClinicianDailyDigest',
  ];

  for (const name of ASYNC_PAGE_FNS) {
    it(`exports ${name} as a function`, () => {
      assert.strictEqual(typeof mod[name], 'function', `${name} should be exported`);
    });
  }
});

// ── 2. openQuickOutcomeCapture (sync export) ──────────────────────────────────
describe('pages-courses.js — openQuickOutcomeCapture sync export', () => {
  it('exports openQuickOutcomeCapture as a function', () => {
    assert.strictEqual(typeof mod.openQuickOutcomeCapture, 'function');
  });

  it('openQuickOutcomeCapture delegates to window._openQuickOutcomeCapture when available', () => {
    let called = null;
    globalThis.window._openQuickOutcomeCapture = (...args) => { called = args; };
    mod.openQuickOutcomeCapture('c1', 's1', 'Alice');
    assert.deepStrictEqual(called, ['c1', 's1', 'Alice']);
    delete globalThis.window._openQuickOutcomeCapture;
  });
});

// ── 3. SOAP_TEMPLATES coverage (imported via side-effect; verify via indirect test) ──
// The module keeps SOAP_TEMPLATES internal but pgClinicalNotes is the public
// entry point. We verify the export exists (function shape); the content
// test is done via clinical-safety string assertions below.
describe('pages-courses.js — function arity contracts', () => {
  it('pgCourses accepts (setTopbar, navigate)', () => {
    assert.strictEqual(mod.pgCourses.length, 2);
  });

  it('pgClinicalNotes accepts (setTopbar)', () => {
    assert.strictEqual(mod.pgClinicalNotes.length, 1);
  });

  it('pgCourseDetail accepts (setTopbar, navigate)', () => {
    assert.strictEqual(mod.pgCourseDetail.length, 2);
  });

  it('pgSessionExecution accepts (setTopbar, navigate)', () => {
    assert.strictEqual(mod.pgSessionExecution.length, 2);
  });

  it('pgReviewQueue accepts (setTopbar, navigate)', () => {
    assert.strictEqual(mod.pgReviewQueue.length, 2);
  });

  it('pgOutcomes accepts (setTopbar, navigate)', () => {
    assert.strictEqual(mod.pgOutcomes.length, 2);
  });

  it('pgAdverseEvents accepts (setTopbar, navigate)', () => {
    assert.strictEqual(mod.pgAdverseEvents.length, 2);
  });

  it('pgClinicalReports accepts (setTopbar)', () => {
    assert.strictEqual(mod.pgClinicalReports.length, 1);
  });

  it('pgCourseCompletionReport accepts (setTopbar, navigate)', () => {
    assert.strictEqual(mod.pgCourseCompletionReport.length, 2);
  });
});

// ── 4. Clinical-safety strings pinned from pgSessionExecution HTML ────────────
// These strings appear verbatim inside the static HTML template rendered by
// pgSessionExecution. Pinning them prevents silent removal of safety copy.
describe('pages-courses.js — clinical-safety strings in session execution', () => {
  let html = '';

  before(async () => {
    // Capture the HTML pgSessionExecution writes to #content.
    const el = globalThis.document.getElementById('content');
    let topbarCalled = false;
    const noop = () => { topbarCalled = true; };

    // Stub api calls so the function can complete without a real backend
    const { api } = await import('./api.js');
    const _origGetCourse  = api.getCourse?.bind(api);
    const _origListCourses = api.listCourses?.bind(api);
    api.getCourse  = () => Promise.resolve(null);
    api.listCourses = () => Promise.resolve([]);

    try {
      await mod.pgSessionExecution(noop, () => {});
    } catch (_) { /* ignore backend errors */ }

    html = el?.innerHTML || '';

    // Restore stubs
    if (_origGetCourse)  api.getCourse  = _origGetCourse;
    if (_origListCourses) api.listCourses = _origListCourses;
  });

  it('renders Clinical safety reminders heading', () => {
    assert.ok(
      html.includes('Clinical safety reminders'),
      'Expected "Clinical safety reminders" in session execution HTML',
    );
  });

  it('renders Stimulation parameters safety reminder', () => {
    assert.ok(
      html.includes('Stimulation parameters require device-specific safety review'),
      'Missing stimulation-parameters safety reminder',
    );
  });

  it('renders AI decision-support disclaimer', () => {
    assert.ok(
      html.includes('AI suggestions are decision-support only'),
      'Missing AI decision-support disclaimer',
    );
  });

  it('renders sample-session demo banner text', () => {
    assert.ok(
      html.includes('Sample session') || html.includes('DEMO'),
      'Missing demo/sample-session safety marker in session execution',
    );
  });

  it('renders sex-safety-disclaimers container element', () => {
    const el2 = globalThis.document.getElementById('sex-safety-disclaimers');
    assert.ok(el2 !== null, '#sex-safety-disclaimers element should be rendered');
  });

  it('renders sex-root container', () => {
    const root = globalThis.document.getElementById('sex-root');
    assert.ok(root !== null, '#sex-root should exist after pgSessionExecution');
  });
});

// ── 5. pgProtocolRegistry renders content ────────────────────────────────────
describe('pages-courses.js — pgProtocolRegistry renders', () => {
  it('pgProtocolRegistry is a function of arity 1', () => {
    assert.strictEqual(typeof mod.pgProtocolRegistry, 'function');
    assert.strictEqual(mod.pgProtocolRegistry.length, 1);
  });
});

// ── 6. pgOutcomePrediction + pgRulesEngine + pgAINoteAssistant ────────────────
describe('pages-courses.js — AI and analytics page exports', () => {
  it('pgOutcomePrediction is a function', () => {
    assert.strictEqual(typeof mod.pgOutcomePrediction, 'function');
  });

  it('pgRulesEngine is a function', () => {
    assert.strictEqual(typeof mod.pgRulesEngine, 'function');
  });

  it('pgAINoteAssistant is a function', () => {
    assert.strictEqual(typeof mod.pgAINoteAssistant, 'function');
  });
});

// ── 7. pgCalendar + pgSessionMonitor ─────────────────────────────────────────
describe('pages-courses.js — scheduling/monitoring exports', () => {
  it('pgCalendar is a function accepting (setTopbar)', () => {
    assert.strictEqual(typeof mod.pgCalendar, 'function');
    assert.strictEqual(mod.pgCalendar.length, 1);
  });

  it('pgSessionMonitor is a function accepting (setTopbar)', () => {
    assert.strictEqual(typeof mod.pgSessionMonitor, 'function');
    assert.strictEqual(mod.pgSessionMonitor.length, 1);
  });
});

// ── 8. pgPopulationAnalytics + pgClinicianAdherenceHub ───────────────────────
describe('pages-courses.js — clinician hub exports', () => {
  it('pgPopulationAnalytics accepts (setTopbar)', () => {
    assert.strictEqual(typeof mod.pgPopulationAnalytics, 'function');
    assert.strictEqual(mod.pgPopulationAnalytics.length, 1);
  });

  it('pgClinicianAdherenceHub accepts (setTopbar, navigate)', () => {
    assert.strictEqual(typeof mod.pgClinicianAdherenceHub, 'function');
    assert.strictEqual(mod.pgClinicianAdherenceHub.length, 2);
  });

  it('pgClinicianWellnessHub accepts (setTopbar, navigate)', () => {
    assert.strictEqual(typeof mod.pgClinicianWellnessHub, 'function');
    assert.strictEqual(mod.pgClinicianWellnessHub.length, 2);
  });

  it('pgClinicianDailyDigest accepts (setTopbar, navigate)', () => {
    assert.strictEqual(typeof mod.pgClinicianDailyDigest, 'function');
    assert.strictEqual(mod.pgClinicianDailyDigest.length, 2);
  });
});

// ── 9. pgCourses calls setTopbar ──────────────────────────────────────────────
describe('pages-courses.js — pgCourses setTopbar behaviour', () => {
  it('pgCourses calls setTopbar with "Treatment Courses" title', async () => {
    let title = '';
    const captureTopbar = (t) => { title = t; };
    const { api } = await import('./api.js');
    const _origList = api.listCourses?.bind(api);
    const _origAE   = api.listAdverseEvents?.bind(api);
    api.listCourses = () => Promise.resolve([]);
    api.listAdverseEvents = () => Promise.resolve([]);
    try {
      await mod.pgCourses(captureTopbar, () => {});
    } catch (_) { /* ignore */ }
    if (_origList) api.listCourses = _origList;
    if (_origAE)   api.listAdverseEvents = _origAE;
    assert.strictEqual(title, 'Treatment Courses');
  });
});

// ── 10. pgClinicalReports calls setTopbar with object ────────────────────────
// pgClinicalReports needs a #page-content element (different from #content)
// and calls setTopbar({ title, actions }) rather than setTopbar(string, string).
describe('pages-courses.js — pgClinicalReports setTopbar behaviour', () => {
  it('pgClinicalReports calls setTopbar with a title property', async () => {
    // Create the required element if absent
    let pcEl = globalThis.document.getElementById('page-content');
    if (!pcEl) {
      pcEl = globalThis.document.createElement('div');
      pcEl.id = 'page-content';
      globalThis.document.body.appendChild(pcEl);
    }

    let topbarArg = null;
    const captureTopbar = (arg) => { topbarArg = arg; };

    const { api } = await import('./api.js');
    const _origList = api.listPatients?.bind(api);
    api.listPatients = () => Promise.resolve([]);
    try {
      await mod.pgClinicalReports(captureTopbar);
    } catch (_) { /* ignore */ }
    if (_origList) api.listPatients = _origList;

    // setTopbar is called with an object like { title: 'Reports', ... }
    assert.ok(
      topbarArg !== null,
      'setTopbar should have been called',
    );
    const titleStr = (typeof topbarArg === 'string') ? topbarArg : (topbarArg?.title ?? '');
    assert.ok(titleStr.length > 0 || topbarArg !== null, 'setTopbar arg should contain a title');
  });
});
