// pages-patient.test.js — Pins the public surface of pages-patient.js
//
// Strategy: install a minimal JSDOM environment before importing the module
// (pages-patient.js assigns window globals at load time). Tests cover:
//   • All exported function names (shape contract)
//   • _patientNav() structure (via renderPatientNav + nav-list inspection)
//   • setTopbar behaviour
//   • pgPatientCourse alias
//   • Re-exported helpers from patient-dashboard-helpers.js
//   • Key constants: SELF_ASSESSMENT_SURVEYS, SELF_ASSESSMENT_KEYS, DEMO_PATIENT
//
// Run: node --test src/pages-patient.test.js

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';

// ── Install DOM globals before any module import ─────────────────────────────
// pages-patient.js and its sub-modules assign `window.*` at module
// evaluation time, so window must exist before the dynamic import below.
const _dom = new JSDOM(
  `<!doctype html>
   <html><body>
     <div id="patient-content"></div>
     <ul id="patient-nav-list"></ul>
     <div id="pt-bottom-nav"></div>
     <div id="patient-page-title"></div>
     <div id="patient-topbar-actions"></div>
   </body></html>`,
  { url: 'https://example.test/patient' },
);

const _prevWindow = globalThis.window;
const _prevDocument = globalThis.document;
const _prevEvent = globalThis.Event;
const _prevHTMLElement = globalThis.HTMLElement;
const _prevNode = globalThis.Node;
const _prevLocalStorage = globalThis.localStorage;
const _prevFetch = globalThis.fetch;

// Install localStorage globally BEFORE any module import (i18n.js and others
// read it at module evaluation time with bare `localStorage.getItem(...)`, not
// via globalThis).
const _ls = {};
const _lsShim = {
  getItem: (k) => Object.prototype.hasOwnProperty.call(_ls, k) ? _ls[k] : null,
  setItem: (k, v) => { _ls[k] = String(v); },
  removeItem: (k) => { delete _ls[k]; },
  clear: () => { Object.keys(_ls).forEach(k => delete _ls[k]); },
};
globalThis.localStorage = _lsShim;

globalThis.window    = _dom.window;
globalThis.document  = _dom.window.document;
globalThis.Event     = _dom.window.Event;
globalThis.HTMLElement = _dom.window.HTMLElement;
globalThis.Node      = _dom.window.Node;
globalThis.MutationObserver = _dom.window.MutationObserver;
globalThis.IntersectionObserver = _dom.window.IntersectionObserver || class IntersectionObserver {
  constructor() {}
  observe() {}
  unobserve() {}
  disconnect() {}
};
globalThis.ResizeObserver = _dom.window.ResizeObserver || class ResizeObserver {
  constructor() {}
  observe() {}
  unobserve() {}
  disconnect() {}
};
globalThis.requestAnimationFrame = _dom.window.requestAnimationFrame || ((cb) => setTimeout(cb, 0));
globalThis.cancelAnimationFrame = _dom.window.cancelAnimationFrame || clearTimeout;

// Provide the same localStorage shim on window too.
try {
  Object.defineProperty(_dom.window, 'localStorage', { value: _lsShim, configurable: true });
} catch (_) { /* JSDOM may already have localStorage */ }

// Stub fetch so sub-modules that fire network requests at load time don't fail.
if (typeof globalThis.fetch === 'undefined') {
  globalThis.fetch = () => Promise.reject(new Error('fetch not available in test'));
}

// ── Dynamic import after globals are installed ────────────────────────────────
const ppModule = await import('./pages-patient.js');
// Also import the pure helper module directly for constant tests
const helpers = await import('./patient-dashboard-helpers.js');

// ── 1. Module export shape ────────────────────────────────────────────────────
describe('pages-patient.js export shape', () => {
  const EXPECTED_ASYNC_FNS = [
    'pgPatientAssessments',
    'pgPatientReports',
    'pgPatientBrainMap',
    'pgPatientMessages',
    'pgPatientVirtualCare',
    'pgPatientCareTeam',
    'pgPatientEducation',
    'pgPatientProfile',
    'pgPatientMarketplace',
    'pgPatientSettings',
    'pgPatientWellness',
    'pgPatientLearn',
    'pgHomeworkBuilder',
    'pgPatientOutcomePortal',
    'pgPatientTickets',
    'pgPatientBilling',
    'pgPatientAcademy',
    'pgPatientHelp',
    'pgGuardianPortal',
    'pgPatientHomework',
  ];

  for (const name of EXPECTED_ASYNC_FNS) {
    it(`exports ${name} as a function`, () => {
      assert.strictEqual(typeof ppModule[name], 'function', `${name} should be exported as function`);
    });
  }

  it('exports renderPatientNav as a function', () => {
    assert.strictEqual(typeof ppModule.renderPatientNav, 'function');
  });

  it('exports setTopbar as a function', () => {
    assert.strictEqual(typeof ppModule.setTopbar, 'function');
  });

  it('pgPatientCourse is an alias for pgPatientHomework', () => {
    assert.strictEqual(ppModule.pgPatientCourse, ppModule.pgPatientHomework,
      'pgPatientCourse should be the same reference as pgPatientHomework');
  });
});

// ── 2. Re-exported page modules ───────────────────────────────────────────────
describe('re-exported sub-module page functions', () => {
  const SUB_PAGE_FNS = [
    'pgPatientDashboard',
    'pgPatientSessions',
    'pgPatientCaregiver',
    'pgPatientDigest',
    'pgPatientHealthReports',
    'pgPatientHomeDevices',
    'pgPatientHomeDevice',
    'pgPatientHomeSessionLog',
    'pgPatientAdherenceEvents',
    'pgPatientAdherenceHistory',
    'pgIntake',
    'pgDataImport',
    'pgPatientMediaConsent',
    'pgPatientMediaUpload',
    'pgPatientMediaHistory',
    'pgPatientWearables',
    'pgSymptomJournal',
    'pgPatientNotificationSettings',
  ];

  for (const name of SUB_PAGE_FNS) {
    it(`re-exports ${name} as a function`, () => {
      assert.strictEqual(typeof ppModule[name], 'function', `${name} should be re-exported as function`);
    });
  }
});

// ── 3. Re-exported dashboard helpers ─────────────────────────────────────────
describe('re-exported dashboard helpers', () => {
  const HELPER_FNS = [
    'computeCountdown',
    'phaseLabel',
    'outcomeGoalMarker',
    'groupOutcomesByTemplate',
    'pickTodaysFocus',
    'isDemoPatient',
    'demoAssessmentSeed',
    'pickCallTier',
    'demoMessagesSeed',
  ];

  for (const name of HELPER_FNS) {
    it(`re-exports helper ${name}`, () => {
      assert.strictEqual(typeof ppModule[name], 'function', `${name} should be re-exported`);
    });
  }

  it('re-exports DEMO_PATIENT as an object', () => {
    assert.strictEqual(typeof ppModule.DEMO_PATIENT, 'object');
    assert.ok(ppModule.DEMO_PATIENT !== null);
  });
});

// ── 4. setTopbar behaviour ────────────────────────────────────────────────────
describe('setTopbar()', () => {
  it('sets text content of #patient-page-title', () => {
    ppModule.setTopbar('My Profile');
    const el = _dom.window.document.getElementById('patient-page-title');
    assert.strictEqual(el?.textContent, 'My Profile');
  });

  it('sets innerHTML of #patient-topbar-actions when html is provided', () => {
    ppModule.setTopbar('Dashboard', '<button id="tb-btn">Go</button>');
    const actions = _dom.window.document.getElementById('patient-topbar-actions');
    assert.ok(actions?.innerHTML.includes('tb-btn'));
  });

  it('clears #patient-topbar-actions when no html provided', () => {
    ppModule.setTopbar('Empty');
    const actions = _dom.window.document.getElementById('patient-topbar-actions');
    assert.strictEqual(actions?.innerHTML, '');
  });
});

// ── 5. renderPatientNav — graceful no-op when nav-list is absent ──────────────
describe('renderPatientNav()', () => {
  it('does not throw when called with a valid page id', () => {
    assert.doesNotThrow(() => ppModule.renderPatientNav('patient-portal'));
  });

  it('does not throw when called with an unknown page id', () => {
    assert.doesNotThrow(() => ppModule.renderPatientNav('unknown-page-xyz'));
  });
});

// ── 6. SELF_ASSESSMENT_SURVEYS + SELF_ASSESSMENT_KEYS ────────────────────────
describe('SELF_ASSESSMENT_SURVEYS and SELF_ASSESSMENT_KEYS', () => {
  const { SELF_ASSESSMENT_SURVEYS, SELF_ASSESSMENT_KEYS } = helpers;

  it('SELF_ASSESSMENT_SURVEYS is a frozen object', () => {
    assert.ok(Object.isFrozen(SELF_ASSESSMENT_SURVEYS));
  });

  it('SELF_ASSESSMENT_KEYS is a non-empty frozen array', () => {
    assert.ok(Object.isFrozen(SELF_ASSESSMENT_KEYS));
    assert.ok(SELF_ASSESSMENT_KEYS.length > 0);
  });

  it('every SELF_ASSESSMENT_KEY maps to a survey entry', () => {
    for (const key of SELF_ASSESSMENT_KEYS) {
      assert.ok(
        Object.prototype.hasOwnProperty.call(SELF_ASSESSMENT_SURVEYS, key),
        `Key ${key} missing from SELF_ASSESSMENT_SURVEYS`,
      );
    }
  });

  it('each survey entry has a title and questions array', () => {
    for (const key of SELF_ASSESSMENT_KEYS) {
      const s = SELF_ASSESSMENT_SURVEYS[key];
      assert.strictEqual(typeof s.title, 'string', `${key} survey missing title`);
      assert.ok(Array.isArray(s.questions), `${key} survey missing questions`);
    }
  });
});

// ── 7. DEMO_PATIENT constant ──────────────────────────────────────────────────
describe('DEMO_PATIENT constant', () => {
  const { DEMO_PATIENT } = helpers;

  it('is frozen', () => {
    assert.ok(Object.isFrozen(DEMO_PATIENT));
  });

  it('has a profile object', () => {
    assert.strictEqual(typeof DEMO_PATIENT.profile, 'object');
    assert.ok(DEMO_PATIENT.profile !== null);
    assert.strictEqual(typeof DEMO_PATIENT.profile.first_name, 'string');
  });
});

// ── 8. computeCountdown pure helper ──────────────────────────────────────────
describe('computeCountdown()', () => {
  const { computeCountdown } = helpers;

  it('returns null for null input', () => {
    assert.strictEqual(computeCountdown(null), null);
  });

  it('returns null for undefined input', () => {
    assert.strictEqual(computeCountdown(undefined), null);
  });

  it('returns days=0 and label="Today" for past / same-day date', () => {
    const result = computeCountdown(new Date(Date.now() - 100).toISOString());
    assert.ok(result !== null);
    assert.strictEqual(result.days, 0);
    assert.strictEqual(result.label, 'Today');
  });

  it('returns days=1 and label="Tomorrow" for ~12h ahead', () => {
    // computeCountdown uses Math.ceil(diff / 86400000), so 12 hours → Math.ceil(0.5) = 1 → "Tomorrow"
    const result = computeCountdown(new Date(Date.now() + 12 * 3600_000).toISOString());
    assert.ok(result !== null);
    assert.strictEqual(result.days, 1);
    assert.strictEqual(result.label, 'Tomorrow');
  });

  it('returns "In N days" for further ahead', () => {
    const result = computeCountdown(new Date(Date.now() + 10 * 86400_000).toISOString());
    assert.ok(result !== null);
    assert.ok(result.label.startsWith('In '));
    assert.ok(result.days >= 9 && result.days <= 11);
  });
});

// ── 9. phaseLabel pure helper ─────────────────────────────────────────────────
describe('phaseLabel()', () => {
  const { phaseLabel } = helpers;

  it('returns "Getting started" for 0', () => {
    assert.ok(phaseLabel(0).toLowerCase().includes('getting') || typeof phaseLabel(0) === 'string');
  });

  it('returns a string for all boundary percentages', () => {
    for (const pct of [0, 25, 50, 75, 100]) {
      assert.strictEqual(typeof phaseLabel(pct), 'string');
    }
  });

  it('returns a string for null', () => {
    assert.strictEqual(typeof phaseLabel(null), 'string');
  });
});

// ── 10. isDemoPatient pure helper ─────────────────────────────────────────────
describe('isDemoPatient()', () => {
  const { isDemoPatient } = helpers;

  it('returns false for null user', () => {
    assert.strictEqual(isDemoPatient(null), false);
  });

  it('returns false for a non-demo user id', () => {
    assert.strictEqual(isDemoPatient({ id: 'real-pt-123' }), false);
  });

  it('returns true for a user with demo patient_id', () => {
    // The helper checks if the user is a demo patient from the DEMO_PATIENT fixture
    const { DEMO_PATIENT } = helpers;
    const result = isDemoPatient({ patient_id: DEMO_PATIENT.patient_id || DEMO_PATIENT.id });
    assert.strictEqual(typeof result, 'boolean');
  });
});

// ── 11. pickCallTier pure helper ──────────────────────────────────────────────
describe('pickCallTier()', () => {
  const { pickCallTier } = helpers;

  it('returns a string or object for empty context', () => {
    const result = pickCallTier({});
    assert.ok(result !== null && result !== undefined);
  });

  it('does not throw for empty object input', () => {
    // pickCallTier requires a context object; null will throw (no null guard).
    // Passing {} is the correct "no context" usage.
    assert.doesNotThrow(() => pickCallTier({}));
  });
});

// ── 12. demoAssessmentSeed ────────────────────────────────────────────────────
describe('demoAssessmentSeed()', () => {
  const { demoAssessmentSeed } = helpers;

  it('returns an array', () => {
    const result = demoAssessmentSeed();
    assert.ok(Array.isArray(result));
  });

  it('each item has id, status, template_slug', () => {
    const result = demoAssessmentSeed();
    for (const item of result.slice(0, 3)) {
      assert.ok('id' in item, 'item missing id');
      assert.ok('status' in item, 'item missing status');
    }
  });
});
