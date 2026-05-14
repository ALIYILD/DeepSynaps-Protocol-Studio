// pages-patient-dashboard-outcomes.runtime.test.js
// Runtime coverage for patient-side surfaces re-exported / hosted in
// `pages-patient.js`:
//   - pgPatientDashboard (re-exported from ./pages-patient/dashboard.js)
//   - pgPatientSessions  (re-exported from ./pages-patient/sessions.js)
//   - pgPatientOutcomePortal (in pages-patient.js)
//   - pgGuardianPortal       (in pages-patient.js)
//
// Setup copied verbatim from `pages-patient.runtime.test.js`. We also
// surface a `content` element because `_gpRender()` in pages-patient.js
// writes the guardian portal markup into `#content` (matches the real
// `apps/web/index.html`, which has `<div id="content" tabindex="-1">`).
// PR #908 moved `_gpRender`'s mount point off `#app-content`; the
// assertions and the JSDOM container here were updated to match.
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM(
  `<!doctype html>
   <html><body>
     <div id="patient-content"></div>
     <div id="app-content"></div>
     <div id="content"></div>
     <ul id="patient-nav-list"></ul>
     <div id="pt-bottom-nav"></div>
     <div id="patient-page-title"></div>
     <div id="patient-topbar-actions"></div>
   </body></html>`,
  { url: 'https://example.test/patient' },
);

const localStore = {};
const localStorageShim = {
  getItem: (key) => Object.prototype.hasOwnProperty.call(localStore, key) ? localStore[key] : null,
  setItem: (key, value) => { localStore[key] = String(value); },
  removeItem: (key) => { delete localStore[key]; },
  clear: () => { Object.keys(localStore).forEach((key) => delete localStore[key]); },
};

globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.Event = dom.window.Event;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Node = dom.window.Node;
globalThis.localStorage = localStorageShim;
globalThis.FormData = dom.window.FormData;
globalThis.CSS = globalThis.CSS || {};
if (!globalThis.CSS.escape) {
  globalThis.CSS.escape = (value) => String(value);
}
globalThis.MutationObserver = dom.window.MutationObserver || class MutationObserver {
  constructor() {}
  observe() {}
  disconnect() {}
  takeRecords() { return []; }
};
globalThis.IntersectionObserver = dom.window.IntersectionObserver || class IntersectionObserver {
  constructor() {}
  observe() {}
  unobserve() {}
  disconnect() {}
};
globalThis.ResizeObserver = dom.window.ResizeObserver || class ResizeObserver {
  constructor() {}
  observe() {}
  unobserve() {}
  disconnect() {}
};
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame || ((cb) => setTimeout(cb, 0));
globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame || clearTimeout;
Object.defineProperty(dom.window, 'localStorage', { value: localStorageShim, configurable: true });
dom.window.HTMLElement.prototype.scrollIntoView = function scrollIntoView() {};
// jsdom does not implement HTMLCanvasElement.getContext (it would require the
// native canvas module). pgGuardianPortal's signature modal opens a canvas in
// `_gpInitSig`; we stub `getContext` so the re-sign flow can be exercised
// without pulling in the optional canvas dep.
if (dom.window.HTMLCanvasElement) {
  dom.window.HTMLCanvasElement.prototype.getContext = function getContext() {
    return {
      beginPath() {},
      moveTo() {},
      lineTo() {},
      stroke() {},
      clearRect() {},
      strokeStyle: '',
      lineWidth: 0,
      lineCap: '',
    };
  };
}

if (typeof globalThis.fetch === 'undefined') {
  globalThis.fetch = () => Promise.reject(new Error('fetch unavailable'));
}

const mod = await import('./pages-patient.js');
const { api } = await import('./api.js');
const { setCurrentUser } = await import('./auth.js');
const { resetEvidenceUiStatsCache } = await import('./evidence-ui-live.js');
if (!globalThis.URL.createObjectURL) globalThis.URL.createObjectURL = () => 'blob:mock';
if (!globalThis.URL.revokeObjectURL) globalThis.URL.revokeObjectURL = () => {};
dom.window.HTMLAnchorElement.prototype.click = function click() {};

function resetHarness() {
  localStorageShim.clear();
  document.getElementById('patient-content').innerHTML = '';
  document.getElementById('app-content').innerHTML = '';
  document.getElementById('content').innerHTML = '';
  document.getElementById('patient-nav-list').innerHTML = '';
  document.getElementById('pt-bottom-nav').innerHTML = '';
  document.getElementById('patient-page-title').textContent = '';
  document.getElementById('patient-topbar-actions').textContent = '';
  document.body.querySelectorAll('#pt-acad-modal').forEach((node) => node.remove());
  document.body.querySelectorAll('#ed-detail-modal, #ed-acad-modal, #mp-details-panel, #mp-seller-panel').forEach((node) => node.remove());
  document.body.querySelectorAll('#gp-resign-modal').forEach((node) => node.remove());
  window._showNotifToastCalls = [];
  window._navPatientCalls = [];
  window._openCalls = [];
  window._promptCalls = [];
  window._anchorClicks = [];
  window._showNotifToast = (payload) => { window._showNotifToastCalls.push(payload); };
  window._navPatient = (page) => { window._navPatientCalls.push(page); };
  window.open = (...args) => { window._openCalls.push(args); return null; };
  window.prompt = (...args) => { window._promptCalls.push(args); return 'prompt-default'; };
  window.confirm = () => true;
  globalThis.confirm = window.confirm;
  globalThis.URL.createObjectURL = () => 'blob:mock';
  globalThis.URL.revokeObjectURL = () => {};
  dom.window.HTMLAnchorElement.prototype.click = function click() {
    window._anchorClicks.push({ href: this.href, download: this.download });
  };
  window._ptTicketFilter = 'all';
  setCurrentUser(null);
  resetEvidenceUiStatsCache();
}

function flushUi() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

const DASHBOARD_API_KEYS = [
  'patientPortalSessions',
  'patientPortalCourses',
  'patientPortalOutcomes',
  'patientPortalMessages',
  'patientPortalWearableSummary',
  'listHomeProgramTasks',
  'portalListHomeProgramTasks',
  'patientPortalWellnessLogs',
  'patientPortalDashboard',
  'patientPortalSummary',
  'patientPortalReports',
];

function snapshotApi(keys) {
  const snap = {};
  keys.forEach((k) => { snap[k] = api[k]; });
  return snap;
}

function stubAllNull(keys) {
  keys.forEach((k) => { api[k] = async () => null; });
}

// pgPatientDashboard is re-exported from `pages-patient/dashboard.js`. Its
// body uses `import.meta.env.DEV` (Vite-specific) without optional chaining,
// which throws under node --test. The re-export line itself in
// `pages-patient.js` is a static `export { ... }` and is covered by the
// import below. We verify the export surface here without invoking the body
// (invoking it would not add coverage to `pages-patient.js` anyway — the
// function body lives in a different module).
test('pgPatientDashboard is exported from pages-patient.js (re-export)', () => {
  assert.equal(typeof mod.pgPatientDashboard, 'function');
});

const SESSIONS_API_KEYS = [
  'patientPortalSessions',
  'patientPortalCourses',
  'patientPortalOutcomes',
  'patientPortalAssessments',
];

test('pgPatientSessions renders demo seed when backend returns empty arrays', async () => {
  resetHarness();
  const originals = snapshotApi(SESSIONS_API_KEYS);
  api.patientPortalSessions = async () => [];
  api.patientPortalCourses = async () => [];
  api.patientPortalOutcomes = async () => [];
  api.patientPortalAssessments = async () => [];
  try {
    await mod.pgPatientSessions();
    const html = document.getElementById('patient-content').innerHTML;
    assert.ok(html.length > 0);
  } finally {
    Object.assign(api, originals);
  }
});

test('pgPatientSessions renders backend sessions when arrays are populated', async () => {
  resetHarness();
  const originals = snapshotApi(SESSIONS_API_KEYS);
  api.patientPortalSessions = async () => [
    { id: 's-real-1', session_number: 5, status: 'completed', delivered_at: '2026-04-15T10:00:00Z', modality_slug: 'tdcs', course_id: 'c-real' },
    { id: 's-real-2', session_number: 6, status: 'scheduled', scheduled_at: '2026-05-22T10:00:00Z', modality_slug: 'tdcs', course_id: 'c-real' },
  ];
  api.patientPortalCourses = async () => [
    { id: 'c-real', name: 'Real tDCS Course', condition_slug: 'depression-mdd', modality_slug: 'tdcs', status: 'active', total_sessions_planned: 20, session_count: 5 },
  ];
  api.patientPortalOutcomes = async () => [];
  api.patientPortalAssessments = async () => [];
  try {
    await mod.pgPatientSessions();
    const html = document.getElementById('patient-content').innerHTML;
    assert.ok(html.length > 0);
  } finally {
    Object.assign(api, originals);
  }
});

test('pgPatientSessions handles all-null backend response without throwing', async () => {
  resetHarness();
  const originals = snapshotApi(SESSIONS_API_KEYS);
  api.patientPortalSessions = async () => null;
  api.patientPortalCourses = async () => null;
  api.patientPortalOutcomes = async () => null;
  api.patientPortalAssessments = async () => null;
  try {
    await mod.pgPatientSessions();
    assert.ok(document.getElementById('patient-content').innerHTML.length > 0);
  } finally {
    Object.assign(api, originals);
  }
});

test('pgPatientSessions tolerates rejected backend promises (catch -> null)', async () => {
  resetHarness();
  const originals = snapshotApi(SESSIONS_API_KEYS);
  api.patientPortalSessions = async () => { throw new Error('boom'); };
  api.patientPortalCourses = async () => { throw new Error('boom'); };
  api.patientPortalOutcomes = async () => { throw new Error('boom'); };
  api.patientPortalAssessments = async () => { throw new Error('boom'); };
  try {
    await mod.pgPatientSessions();
    assert.ok(document.getElementById('patient-content').innerHTML.length > 0);
  } finally {
    Object.assign(api, originals);
  }
});

const OUTCOME_API_KEYS = [
  'patientPortalOutcomes',
  'patientPortalWearableSummary',
  'patientPortalWellnessLogs',
  'portalListHomeProgramTasks',
  'portalListHomeSessions',
  'patientPortalLearnProgress',
  'patientPortalAssessments',
];

test('pgPatientOutcomePortal uses default setTopbar when no fn is passed and renders skeleton/page', async () => {
  resetHarness();
  const originals = snapshotApi(OUTCOME_API_KEYS);
  stubAllNull(OUTCOME_API_KEYS);
  try {
    await mod.pgPatientOutcomePortal();
    assert.equal(document.getElementById('patient-page-title').textContent, 'My progress');
    assert.ok(document.getElementById('patient-content').innerHTML.length > 0);
  } finally {
    Object.assign(api, originals);
  }
});

test('pgPatientOutcomePortal forwards title + actions html to a custom setTopbarFn', async () => {
  resetHarness();
  const calls = [];
  const setTopbarFn = (title, html) => { calls.push({ title, html }); };
  const originals = snapshotApi(OUTCOME_API_KEYS);
  stubAllNull(OUTCOME_API_KEYS);
  try {
    await mod.pgPatientOutcomePortal(setTopbarFn);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].title, 'My progress');
    assert.match(calls[0].html, /Copy summary/);
    assert.match(calls[0].html, /Download report/);
    assert.equal(document.getElementById('patient-page-title').textContent, '');
  } finally {
    Object.assign(api, originals);
  }
});

test('pgPatientOutcomePortal renders against live API payloads (PHQ-9 + GAD-7)', async () => {
  resetHarness();
  const originals = snapshotApi(OUTCOME_API_KEYS);
  api.patientPortalOutcomes = async () => ({
    items: [
      { id: 'o-1', template_title: 'PHQ-9', score_numeric: 14, administered_at: '2026-03-01T00:00:00Z', course_id: 'c-1' },
      { id: 'o-2', template_title: 'PHQ-9', score_numeric: 9,  administered_at: '2026-04-01T00:00:00Z', course_id: 'c-1' },
      { id: 'o-3', template_title: 'GAD-7', score_numeric: 10, administered_at: '2026-04-01T00:00:00Z', course_id: 'c-1' },
    ],
  });
  api.patientPortalWearableSummary = async () => ({
    daily: [
      { date: '2026-04-30', sleep_duration_h: 7.4, hrv_ms: 52, rhr_bpm: 61, steps: 8400, readiness_score: 78 },
      { date: '2026-05-01', sleep_duration_h: 7.1, hrv_ms: 49, rhr_bpm: 63, steps: 7900, readiness_score: 75 },
    ],
  });
  api.patientPortalWellnessLogs = async () => [
    { date: '2026-04-30', mood: 7, energy: 6 },
  ];
  api.portalListHomeProgramTasks = async () => [];
  api.portalListHomeSessions = async () => [];
  api.patientPortalLearnProgress = async () => ({ read_article_ids: ['a1'], total_available: 5 });
  api.patientPortalAssessments = async () => [];
  try {
    await mod.pgPatientOutcomePortal(() => {});
    const html = document.getElementById('patient-content').innerHTML;
    assert.ok(html.length > 0);
    assert.match(html, /pgp-page|My progress|PHQ|Progress/i);
  } finally {
    Object.assign(api, originals);
  }
});

test('pgPatientOutcomePortal falls back to seed when API returns no items (empty list branch)', async () => {
  resetHarness();
  const originals = snapshotApi(OUTCOME_API_KEYS);
  api.patientPortalOutcomes = async () => ({ items: [] });
  api.patientPortalWearableSummary = async () => null;
  api.patientPortalWellnessLogs = async () => null;
  api.portalListHomeProgramTasks = async () => null;
  api.portalListHomeSessions = async () => null;
  api.patientPortalLearnProgress = async () => null;
  api.patientPortalAssessments = async () => null;
  try {
    await mod.pgPatientOutcomePortal(() => {});
    const html = document.getElementById('patient-content').innerHTML;
    assert.ok(html.length > 0);
  } finally {
    Object.assign(api, originals);
  }
});

test('pgPatientOutcomePortal tolerates outright rejection on every endpoint', async () => {
  resetHarness();
  const originals = snapshotApi(OUTCOME_API_KEYS);
  OUTCOME_API_KEYS.forEach((k) => {
    api[k] = async () => { throw new Error('boom'); };
  });
  try {
    await mod.pgPatientOutcomePortal(() => {});
    assert.ok(document.getElementById('patient-content').innerHTML.length > 0);
  } finally {
    Object.assign(api, originals);
  }
});

test('pgPatientOutcomePortal _ptoCopyProgress and _outcomeDownloadReport window helpers exist and run', async () => {
  resetHarness();
  const originals = snapshotApi(OUTCOME_API_KEYS);
  stubAllNull(OUTCOME_API_KEYS);
  try {
    await mod.pgPatientOutcomePortal(() => {});
    assert.equal(typeof window._ptoCopyProgress, 'function');
    assert.equal(typeof window._outcomeDownloadReport, 'function');
    try { window._ptoCopyProgress(); } catch (_e) { /* clipboard may not exist in jsdom */ }
    try { window._outcomeDownloadReport(); } catch (_e) { /* anchor side-effects */ }
    await flushUi();
  } finally {
    Object.assign(api, originals);
  }
});

test('pgGuardianPortal uses default setTopbar and seeds + renders the guardian page', async () => {
  resetHarness();
  await mod.pgGuardianPortal();
  assert.equal(document.getElementById('patient-page-title').textContent, 'Guardian Portal');
  const html = document.getElementById('content').innerHTML;
  assert.ok(html.length > 0);
  assert.match(html, /Family &amp; Guardian Portal|Welcome, Maria Santos|Demo Guardian Portal/);
  // Render-readiness marker (PR #926 pattern) so e2e waits resolve deterministically.
  assert.ok(
    document.querySelector('[data-page="guardian-portal"]'),
    'guardian portal should emit a [data-page="guardian-portal"] marker',
  );
});

test('pgGuardianPortal forwards to a custom setTopbarFn with Crisis Plan action', async () => {
  resetHarness();
  const calls = [];
  await mod.pgGuardianPortal((title, html) => { calls.push({ title, html }); });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].title, 'Guardian Portal');
  assert.match(calls[0].html, /Crisis Plan/);
  assert.equal(document.getElementById('patient-page-title').textContent, '');
});

test('pgGuardianPortal exposes window helpers for patient switch, hw mark, and crisis toggle', async () => {
  resetHarness();
  await mod.pgGuardianPortal(() => {});

  assert.equal(typeof window._gpSwitch, 'function');
  window._gpSwitch('p_adult');
  assert.equal(localStorage.getItem('ds_active_guardian_patient'), 'p_adult');
  assert.match(document.getElementById('content').innerHTML, /Carlos Santos/);

  window._gpSwitch('p_child');

  assert.equal(typeof window._gpMarkHw, 'function');
  window._gpMarkHw('hw1', 'completed');
  const hwAfter = JSON.parse(localStorage.getItem('ds_homework_plans'));
  const hw1After = hwAfter.find((h) => h.id === 'hw1');
  assert.equal(hw1After.status, 'completed');

  window._gpMarkHw('hw3', 'assisted');
  const hwAfter2 = JSON.parse(localStorage.getItem('ds_homework_plans'));
  const hw3After = hwAfter2.find((h) => h.id === 'hw3');
  assert.equal(hw3After.assisted, true);

  assert.equal(typeof window._gpToggleCrisis, 'function');
  const det1 = document.getElementById('gp-crisis-detail');
  assert.ok(det1, 'crisis detail element should exist after render');
  window._gpToggleCrisis();
  assert.equal(document.getElementById('gp-crisis-detail').style.display, 'block');
  window._gpToggleCrisis();
  assert.equal(document.getElementById('gp-crisis-detail').style.display, 'none');
});

test('pgGuardianPortal send-message helper appends a guardian message and re-renders', async () => {
  resetHarness();
  await mod.pgGuardianPortal(() => {});
  const input = document.getElementById('gp-msg-input');
  assert.ok(input, 'message input should exist');
  input.value = 'Thanks for the update.';
  window._gpSendMsg();
  const msgs = JSON.parse(localStorage.getItem('ds_guardian_messages'));
  const latest = msgs[msgs.length - 1];
  assert.equal(latest.from, 'guardian');
  assert.match(latest.text, /Thanks for the update\./);
});

test('pgGuardianPortal encouragement helper appends an encouragement record', async () => {
  resetHarness();
  await mod.pgGuardianPortal(() => {});
  const before = JSON.parse(localStorage.getItem('ds_guardian_messages')).length;
  window._gpEncourage();
  const after = JSON.parse(localStorage.getItem('ds_guardian_messages'));
  assert.equal(after.length, before + 1);
  assert.equal(after[after.length - 1].type, 'encouragement');
});

test('pgGuardianPortal consent re-sign + category toggle helpers update localStorage', async () => {
  resetHarness();
  await mod.pgGuardianPortal(() => {});
  window._gpToggleCat('con1', 'sessionNotes');
  const cons1 = JSON.parse(localStorage.getItem('ds_guardian_consents')).find((c) => c.id === 'con1');
  assert.equal(cons1.categories.sessionNotes, false);
  window._gpToggleCat('con1', 'sessionNotes');
  const cons2 = JSON.parse(localStorage.getItem('ds_guardian_consents')).find((c) => c.id === 'con1');
  assert.equal(cons2.categories.sessionNotes, true);

  window._gpResign('con3');
  const modal = document.getElementById('gp-resign-modal');
  assert.ok(modal, 'modal should exist after _gpResign');
  assert.equal(modal.style.display, 'flex');
  window._gpDoResign();
  const cons3After = JSON.parse(localStorage.getItem('ds_guardian_consents')).find((c) => c.id === 'con3');
  assert.equal(cons3After.status, 'valid');
});
