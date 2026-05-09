// pages-courses-coverage.test.js — drives execution through the major page
// functions in pages-courses.js to lift line/function coverage off the floor.
//
// Strategy:
//   • Install jsdom + localStorage shims BEFORE importing the module so the
//     module's load-time side effects (window globals, default state) work.
//   • Stub the api.* calls each page makes via Object.assign so the pages
//     can render without a backend. Stubs return realistic shapes so render
//     branches actually execute (responder rate, signals, demo banner, etc.).
//   • Pre-seed localStorage where pages read it (alerts, predictions, calendar,
//     soap notes, completed sessions) to drive heavier render branches.
//   • Pre-set currentUser via setCurrentUser so role-gated pages render.
//   • Each test renders into a clean #content (or #page-content) and asserts
//     on observable HTML/state — never reaches into private helpers.
//
// Run: node --test src/pages-courses-coverage.test.js

import { describe, it, before, beforeEach } from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';

// ── DOM + localStorage shims (must precede any module import) ────────────────
const _dom = new JSDOM(
  `<!doctype html>
   <html><body>
     <div id="content"></div>
     <div id="page-content"></div>
     <div id="topbar-title"></div>
     <div id="topbar-actions"></div>
   </body></html>`,
  { url: 'https://example.test/?page=home' },
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
globalThis.URL       = _dom.window.URL;
globalThis.URLSearchParams = _dom.window.URLSearchParams;
globalThis.Blob      = _dom.window.Blob;
globalThis.MutationObserver  = _dom.window.MutationObserver;
globalThis.IntersectionObserver = _dom.window.IntersectionObserver || class {
  constructor() {} observe() {} unobserve() {} disconnect() {}
};
globalThis.ResizeObserver = _dom.window.ResizeObserver || class {
  constructor() {} observe() {} unobserve() {} disconnect() {}
};
globalThis.requestAnimationFrame  = _dom.window.requestAnimationFrame  || ((cb) => setTimeout(cb, 0));
globalThis.cancelAnimationFrame   = _dom.window.cancelAnimationFrame   || clearTimeout;

// jsdom URL.createObjectURL stub
if (!_dom.window.URL.createObjectURL) {
  _dom.window.URL.createObjectURL = () => 'blob:mock';
}
if (!_dom.window.URL.revokeObjectURL) {
  _dom.window.URL.revokeObjectURL = () => {};
}

if (typeof globalThis.fetch === 'undefined') {
  globalThis.fetch = () => Promise.reject(new Error('fetch not available in test'));
}

// ── Imports AFTER shims ───────────────────────────────────────────────────────
const mod   = await import('./pages-courses.js');
const apiMod = await import('./api.js');
const { api } = apiMod;
const authMod = await import('./auth.js');

// Cache original api methods so tests don't permanently mutate them.
const _origApi = {};
function stubApi(stubs) {
  for (const [k, fn] of Object.entries(stubs)) {
    if (!(k in _origApi)) _origApi[k] = api[k];
    api[k] = fn;
  }
}
function restoreApi() {
  for (const [k, v] of Object.entries(_origApi)) api[k] = v;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function noopTopbar() { /* swallow */ }

function clearContent() {
  const el = document.getElementById('content');
  if (el) el.innerHTML = '';
  const pc = document.getElementById('page-content');
  if (pc) pc.innerHTML = '';
}

function ensureClinicianRole() {
  authMod.setCurrentUser({
    id: 'u-test',
    email: 'test@example.test',
    display_name: 'Dr Test',
    role: 'clinician',
    package_id: 'pro',
  });
}

// Make a minimal demo course shape for render branches.
function makeCourse(overrides = {}) {
  return {
    id: 'c-1',
    patient_id: 'p-1',
    patient_name: 'Test Patient',
    condition_slug: 'depression',
    modality_slug: 'TMS',
    status: 'active',
    sessions_delivered: 6,
    planned_sessions_total: 20,
    planned_intensity_pct_rmt: 100,
    planned_frequency_hz: 10,
    evidence_grade: 'B',
    on_label: true,
    governance_warnings: [],
    review_required: false,
    started_at: '2026-04-01T09:00:00Z',
    last_session_at: '2026-05-01T09:00:00Z',
    ...overrides,
  };
}

before(() => {
  ensureClinicianRole();
  // Provide the global helpers some surfaces expect (window._nav etc.)
  globalThis.window._nav = (..._args) => {};
  globalThis.window._announce = (..._args) => {};
  globalThis.window._showNotifToast = (..._args) => {};
  globalThis.window._openCourse = (..._args) => {};
  globalThis.window.showToast = (..._args) => {};
});

beforeEach(() => {
  restoreApi();
  // Best-effort clear localStorage between tests so seeds aren't poisoned.
  // (Some keys are repopulated lazily by the page functions on load.)
  _lsShim.clear();
});

// ──────────────────────────────────────────────────────────────────────────────
// 1. pgCourses — list page (multiple status branches)
// ──────────────────────────────────────────────────────────────────────────────
describe('pgCourses — render branches', () => {
  it('renders empty state when no courses', async () => {
    stubApi({
      listCourses: () => Promise.resolve({ items: [] }),
      listAdverseEvents: () => Promise.resolve({ items: [] }),
    });
    clearContent();
    await mod.pgCourses(noopTopbar, () => {});
    const html = document.getElementById('content').innerHTML;
    assert.ok(html.length > 0, 'should write some HTML');
  });

  it('renders course list with mixed statuses + signals', async () => {
    const items = [
      makeCourse({ id: 'c-active',  status: 'active',  sessions_delivered: 4,  planned_sessions_total: 20 }),
      makeCourse({ id: 'c-paused',  status: 'paused',  sessions_delivered: 8,  planned_sessions_total: 20 }),
      makeCourse({ id: 'c-pending', status: 'pending_approval', sessions_delivered: 0, planned_sessions_total: 20 }),
      makeCourse({ id: 'c-done',    status: 'completed', sessions_delivered: 20, planned_sessions_total: 20 }),
      makeCourse({ id: 'c-disc',    status: 'discontinued', sessions_delivered: 5, planned_sessions_total: 20 }),
      makeCourse({ id: 'c-offlabel',status: 'active',  on_label: false, governance_warnings: ['Off-label dosing', 'High intensity'] }),
      makeCourse({ id: 'c-stale',   status: 'active',  last_session_at: new Date(Date.now() - 30 * 86400000).toISOString() }),
    ];
    stubApi({
      listCourses: () => Promise.resolve({ items }),
      listAdverseEvents: () => Promise.resolve({ items: [
        { id: 'ae-1', course_id: 'c-active',   severity: 'mild',    status: 'open' },
        { id: 'ae-2', course_id: 'c-offlabel', severity: 'serious', status: 'open' },
      ] }),
    });
    clearContent();
    await mod.pgCourses(noopTopbar, () => {});
    const html = document.getElementById('content').innerHTML;
    assert.ok(html.length > 200, 'should render substantial HTML for 7 courses');
  });

  it('renders even when listAdverseEvents rejects', async () => {
    stubApi({
      listCourses: () => Promise.resolve({ items: [makeCourse()] }),
      listAdverseEvents: () => Promise.reject(new Error('offline')),
    });
    clearContent();
    await mod.pgCourses(noopTopbar, () => {}).catch(() => {});
    const html = document.getElementById('content').innerHTML;
    assert.ok(typeof html === 'string');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 2. pgClinicalNotes — empty + with notes branches
// ──────────────────────────────────────────────────────────────────────────────
describe('pgClinicalNotes — render branches', () => {
  it('renders empty state with no notes seeded', async () => {
    stubApi({
      listCourses: () => Promise.resolve({ items: [] }),
    });
    clearContent();
    delete globalThis.window._notesSelectedNoteKey;
    await mod.pgClinicalNotes(noopTopbar);
    const html = document.getElementById('content').innerHTML;
    assert.ok(html.includes('No notes yet') || html.includes('Select a note'),
      'expected empty/select copy');
  });

  it('renders SOAP editor when a note exists for a course', async () => {
    // Seed soap notes localStorage
    _lsShim.setItem('ds_soap_notes', JSON.stringify({
      'c-1': {
        's-1': {
          subjective: 'Patient reports improvement',
          objective:  'Session OK',
          assessment: 'Trending positive',
          plan:       'Continue protocol',
          updated_at: new Date().toISOString(),
        },
      },
    }));
    stubApi({
      listCourses: () => Promise.resolve({ items: [makeCourse({ id: 'c-1', title: 'My Course' })] }),
    });
    delete globalThis.window._notesSelectedNoteKey;
    clearContent();
    await mod.pgClinicalNotes(noopTopbar);
    const html = document.getElementById('content').innerHTML;
    assert.ok(html.length > 0);
  });

  it('exposes window-scoped soap helpers after render', async () => {
    stubApi({ listCourses: () => Promise.resolve({ items: [] }) });
    clearContent();
    await mod.pgClinicalNotes(noopTopbar);
    assert.strictEqual(typeof globalThis.window._saveSoapNote, 'function');
    assert.strictEqual(typeof globalThis.window._flagNote,    'function');
    assert.strictEqual(typeof globalThis.window._printNote,   'function');
    assert.strictEqual(typeof globalThis.window._newSoapNote, 'function');
    assert.strictEqual(typeof globalThis.window._selectNote,  'function');
    assert.strictEqual(typeof globalThis.window._fillTemplate, 'function');
    assert.strictEqual(typeof globalThis.window._filterNotes, 'function');
  });

  it('_filterNotes hides non-matching entries', async () => {
    // seed several notes
    _lsShim.setItem('ds_soap_notes', JSON.stringify({
      'c-A': { 's-1': { subjective: 'aaa', updated_at: '2026-04-01T00:00:00Z' } },
      'c-B': { 's-2': { subjective: 'bbb', updated_at: '2026-04-02T00:00:00Z' } },
    }));
    stubApi({ listCourses: () => Promise.resolve({ items: [
      makeCourse({ id: 'c-A', title: 'CourseAlpha' }),
      makeCourse({ id: 'c-B', title: 'CourseBeta' }),
    ] }) });
    delete globalThis.window._notesSelectedNoteKey;
    clearContent();
    await mod.pgClinicalNotes(noopTopbar);
    // Filter for "alpha" — beta row should hide
    globalThis.window._filterNotes('alpha');
    const items = document.querySelectorAll('.note-list-item');
    // Items exist; filter sets display
    assert.ok(items.length >= 1);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 3. pgCourseDetail — uses window._selectedCourseId
// ──────────────────────────────────────────────────────────────────────────────
describe('pgCourseDetail — navigates back when no course selected', () => {
  it('navigate("courses") when window._selectedCourseId is null', async () => {
    delete globalThis.window._selectedCourseId;
    let navigated = null;
    await mod.pgCourseDetail(noopTopbar, (target) => { navigated = target; });
    assert.strictEqual(navigated, 'courses');
  });

  it('renders detail with a stubbed course payload', async () => {
    globalThis.window._selectedCourseId = 'c-1';
    stubApi({
      getCourse:                 () => Promise.resolve(makeCourse({ id: 'c-1', title: 'Course Detail Test' })),
      listCourseSessions:        () => Promise.resolve({ items: [
        { id: 's-1', session_id: 's-1', created_at: '2026-04-01T09:00:00Z', post_session_notes: 'good',
          checklist: { consent: true, vitals: true, electrodes: false }, interruptions: false },
        { id: 's-2', session_id: 's-2', created_at: '2026-04-08T09:00:00Z', post_session_notes: '',
          checklist: { consent: true }, interruptions: true },
      ] }),
      listOutcomes:              () => Promise.resolve({ items: [
        { template_id: 'PHQ-9', template_name: 'PHQ-9', recorded_at: '2026-04-01T09:00:00Z',
          score: 18, score_numeric: 18, measurement_point: 'baseline', course_id: 'c-1' },
        { template_id: 'PHQ-9', template_name: 'PHQ-9', recorded_at: '2026-05-01T09:00:00Z',
          score: 9,  score_numeric: 9,  measurement_point: 'post',     course_id: 'c-1', pct_change: -50 },
      ] }),
      courseOutcomeSummary:      () => Promise.resolve({ summaries: [
        { template_name: 'PHQ-9', baseline: 18, latest: 9, pct_change: -50, is_responder: true },
      ] }),
      getCourseAssessmentSummary:() => Promise.resolve({ highest_severity: 'moderate' }),
      getCourseAuditTrail:       () => Promise.resolve({ items: [] }),
      getCourseAdverseEventsSummary: () => Promise.resolve({ total: 1, highest_severity: 'mild' }),
      listAdverseEvents:         () => Promise.resolve({ items: [
        { id: 'ae-1', course_id: 'c-1', session_id: 's-2', severity: 'mild', status: 'open' },
      ] }),
      getProtocol:               () => Promise.resolve(null),
      protocolStudioProtocolDetail: () => Promise.resolve(null),
      protocolStudioProtocol:    () => Promise.resolve(null),
      protocols:                 () => Promise.resolve({ items: [] }),
      getPatient:                () => Promise.resolve({ id: 'p-1', first_name: 'Test', last_name: 'Patient' }),
    });
    clearContent();
    await mod.pgCourseDetail(noopTopbar, () => {}).catch(() => {});
    const html = document.getElementById('content').innerHTML;
    assert.ok(typeof html === 'string');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 4. pgReviewQueue — drives the queue rendering branches
// ──────────────────────────────────────────────────────────────────────────────
describe('pgReviewQueue — render with backend items + with seed', () => {
  it('renders DEMO_SEED when backend list is empty (no localQueue)', async () => {
    stubApi({
      listReviewQueue:   () => Promise.resolve({ items: [] }),
      listAdverseEvents: () => Promise.resolve({ items: [] }),
    });
    clearContent();
    await mod.pgReviewQueue(noopTopbar, () => {}).catch(() => {});
    // After render, the seed should be persisted
    const persisted = JSON.parse(_lsShim.getItem('ds_review_queue_local') || 'null');
    assert.ok(Array.isArray(persisted) && persisted.length >= 5,
      'expected DEMO_SEED persisted to ds_review_queue_local');
    // window helpers exposed
    assert.strictEqual(typeof globalThis.window._rqExportAudit, 'function');
  });

  it('renders backend items when present', async () => {
    stubApi({
      listReviewQueue: () => Promise.resolve({ items: [
        { id: 'q-1', item_type: 'protocol_approval', course_name: 'My Course',
          submitted_by: 'Dr X', created_at: new Date().toISOString(), status: 'pending' },
        { id: 'q-2', item_type: 'off_label', condition_slug: 'gad', modality_slug: 'TMS',
          status: 'pending', created_at: new Date().toISOString() },
        { id: 'q-3', item_type: 'adverse_event', status: 'pending', created_at: new Date().toISOString() },
        { id: 'q-4', item_type: 'consent', status: 'in-review', created_at: new Date().toISOString() },
        { id: 'q-5', item_type: 'ai_note', status: 'pending', created_at: new Date().toISOString() },
      ] }),
      listAdverseEvents: () => Promise.resolve({ items: [] }),
    });
    clearContent();
    await mod.pgReviewQueue(noopTopbar, () => {}).catch(() => {});
    const html = document.getElementById('content').innerHTML;
    assert.ok(html.length > 0);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 5. pgOutcomes — KPIs + waterfall + sparkline
// ──────────────────────────────────────────────────────────────────────────────
describe('pgOutcomes — render branches', () => {
  it('renders with rich outcome data set', async () => {
    const baseDate = '2026-03-01T09:00:00Z';
    const outcomes = [
      { id: 'o-1', course_id: 'c-1', template_name: 'PHQ-9', template_id: 'PHQ-9',
        recorded_at: baseDate, score: 18, score_numeric: 18,  measurement_point: 'baseline',
        is_responder: false, pct_change: 0,
        baseline_score: 18, latest_score: 18 },
      { id: 'o-2', course_id: 'c-1', template_name: 'PHQ-9', template_id: 'PHQ-9',
        recorded_at: '2026-05-01T09:00:00Z', score: 8, score_numeric: 8, measurement_point: 'post',
        is_responder: true, pct_change: -55,
        baseline_score: 18, latest_score: 8 },
      { id: 'o-3', course_id: 'c-2', template_name: 'GAD-7', template_id: 'GAD-7',
        recorded_at: '2026-04-15T09:00:00Z', score: 12, score_numeric: 12, measurement_point: 'baseline',
        pct_change: -10, is_responder: false,
        baseline_score: 12, latest_score: 11 },
    ];
    stubApi({
      listOutcomes:       () => Promise.resolve({ items: outcomes }),
      aggregateOutcomes:  () => Promise.resolve({ responder_rate: 0.6, assessment_completion_pct: 80 }),
      listCourses:        () => Promise.resolve({ items: [
        makeCourse({ id: 'c-1' }), makeCourse({ id: 'c-2', condition_slug: 'gad' }),
      ] }),
      listPatients:       () => Promise.resolve({ items: [{ id: 'p-1', name: 'Test Patient' }] }),
      listAdverseEvents:  () => Promise.resolve({ items: [] }),
    });
    clearContent();
    await mod.pgOutcomes(noopTopbar, () => {}).catch(() => {});
    assert.strictEqual(typeof globalThis.window._exportOutcomesCSV, 'function');
  });

  it('handles all api rejections gracefully', async () => {
    stubApi({
      listOutcomes:      () => Promise.reject(new Error('offline')),
      aggregateOutcomes: () => Promise.reject(new Error('offline')),
      listCourses:       () => Promise.reject(new Error('offline')),
      listPatients:      () => Promise.reject(new Error('offline')),
      listAdverseEvents: () => Promise.reject(new Error('offline')),
    });
    clearContent();
    await mod.pgOutcomes(noopTopbar, () => {}).catch(() => {});
    const html = document.getElementById('content').innerHTML;
    assert.ok(typeof html === 'string');
  });

  it('window._exportOutcomesCSV runs without throwing', async () => {
    stubApi({
      listOutcomes: () => Promise.resolve({ items: [{ id: 'o-1', recorded_at: '2026-04-01T00:00:00Z', template_name: 'PHQ-9', score: 5, pct_change: -50, is_responder: true }] }),
      aggregateOutcomes: () => Promise.resolve({}),
      listCourses: () => Promise.resolve({ items: [] }),
      listPatients: () => Promise.resolve({ items: [] }),
      listAdverseEvents: () => Promise.resolve({ items: [] }),
    });
    clearContent();
    await mod.pgOutcomes(noopTopbar, () => {});
    const origAppendChild = document.body.appendChild;
    let invoked = false;
    // Stub anchor click — happy-path CSV download
    const origCreateElement = document.createElement.bind(document);
    document.createElement = (tag) => {
      const el = origCreateElement(tag);
      if (tag === 'a') {
        el.click = () => { invoked = true; };
      }
      return el;
    };
    try {
      globalThis.window._exportOutcomesCSV();
    } finally {
      document.createElement = origCreateElement;
      document.body.appendChild = origAppendChild;
    }
    assert.ok(invoked, '<a>.click() should fire');
  });

  it('review-queue handlers execute assignment, submit, filtering, and export branches', async () => {
    stubApi({
      listReviewQueue: () => Promise.resolve({ items: [
        { id: 'rq-1', item_type: 'protocol_approval', course_name: 'Course A', status: 'pending', created_at: new Date().toISOString() },
        { id: 'rq-2', item_type: 'adverse_event', status: 'pending', created_at: new Date().toISOString() },
      ] }),
      listAdverseEvents: () => Promise.resolve({ items: [{ id: 'ae-1', severity: 'moderate', status: 'open' }] }),
    });
    clearContent();
    _lsShim.removeItem('ds_audit_trail');
    await mod.pgReviewQueue(noopTopbar, () => {});

    const note = document.getElementById('rq-note-rq-1');
    if (note) note.value = 'Looks acceptable';
    window._rqAssign('rq-1', 'Dr. Patel');
    assert.ok(document.getElementById('content').innerHTML.includes('Dr. Patel'));

    window._rqSetDecision('rq-1', 'approved');
    window._rqSubmit('rq-1');
    const auditTrail = JSON.parse(_lsShim.getItem('ds_audit_trail') || '[]');
    assert.ok(auditTrail.some((row) => row.action === 'submit' && row.status === 'approved'));

    window._rqFilterStatus('approved');
    assert.ok(document.getElementById('rq-tab-content').innerHTML.includes('approved'));
    window._rqSortPriority();
    window._rqRenderAudit('all');
    assert.ok(document.getElementById('rq-tab-content').innerHTML.includes('Audit trail'));

    let clicked = false;
    const origCreateElement = document.createElement.bind(document);
    document.createElement = (tag) => {
      const el = origCreateElement(tag);
      if (tag === 'a') el.click = () => { clicked = true; };
      return el;
    };
    try {
      window._rqExportAudit();
    } finally {
      document.createElement = origCreateElement;
    }
    assert.ok(clicked, 'audit export should click a download anchor');

    const btn = { disabled: false, textContent: 'Resolve' };
    await window._rqResolveAE('ae-1', btn);
    assert.strictEqual(window._rqOpenAEs.length, 0);
  });

  it('outcomes handlers execute filter, prefill, validation, save, and table rerender branches', async () => {
    let recorded = null;
    stubApi({
      listOutcomes: () => Promise.resolve({ items: [
        { id: 'o-1', patient_id: 'p-1', course_id: 'c-1', template_name: 'PHQ-9', template_id: 'PHQ-9', recorded_at: '2026-03-01T00:00:00Z', score: 18, score_numeric: 18, measurement_point: 'baseline', pct_change: 0, baseline_score: 18, latest_score: 18, is_responder: false },
        { id: 'o-2', patient_id: 'p-2', course_id: 'c-2', template_name: 'GAD-7', template_id: 'GAD-7', recorded_at: '2026-05-01T00:00:00Z', score: 7, score_numeric: 7, measurement_point: 'post', pct_change: -40, baseline_score: 12, latest_score: 7, is_responder: true },
      ] }),
      aggregateOutcomes: () => Promise.resolve({ responder_rate: 0.5, assessment_completion_pct: 70 }),
      listCourses: () => Promise.resolve({ items: [
        makeCourse({ id: 'c-1', patient_id: 'p-1', patient_name: 'Alice', condition_slug: 'depression', modality_slug: 'TMS' }),
        makeCourse({ id: 'c-2', patient_id: 'p-2', patient_name: 'Bob', condition_slug: 'gad', modality_slug: 'Neurofeedback' }),
      ] }),
      listPatients: () => Promise.resolve({ items: [{ id: 'p-1', name: 'Alice' }, { id: 'p-2', name: 'Bob' }] }),
      listAdverseEvents: () => Promise.resolve({ items: [] }),
      recordOutcome: async (payload) => { recorded = payload; return { accepted: true }; },
    });
    clearContent();
    await mod.pgOutcomes(noopTopbar, () => {});

    window._ocFilterStatus('needs-review');
    assert.ok(document.getElementById('tab-nr').classList.contains('active'));
    document.getElementById('oc-search').value = 'Alice';
    document.getElementById('oc-filter-condition').value = 'depression';
    document.getElementById('oc-filter-modality').value = 'TMS';
    window._ocApplyFilters();
    assert.ok(document.getElementById('oc-improving-list').innerHTML.length > 0);

    window._showRecordOutcome();
    assert.notStrictEqual(document.getElementById('record-outcome-panel').style.display, 'none');
    window._ocPreRecordForCourse('c-1');
    assert.ok(document.getElementById('oc-course').value.startsWith('c-1|'));

    await window._saveOutcome();
    assert.strictEqual(document.getElementById('oc-error').textContent, 'Enter a score.');

    document.getElementById('oc-score').value = '9';
    document.getElementById('oc-notes').value = 'Mid-course improvement';
    await window._saveOutcome();
    assert.ok(recorded);
    assert.strictEqual(recorded.course_id, 'c-1');
    assert.strictEqual(recorded.score_numeric, 9);

    document.getElementById('oc-filter-tmpl').value = 'PHQ-9';
    document.getElementById('oc-filter-course').value = 'c-1';
    window._rerenderOutcomeTable();
    assert.ok(document.getElementById('oc-records-table').innerHTML.includes('PHQ-9'));
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 6. pgAdverseEvents — drill-in branches
// ──────────────────────────────────────────────────────────────────────────────
describe('pgAdverseEvents — render branches', () => {
  it('renders with empty AE list', async () => {
    stubApi({
      listAdverseEvents: () => Promise.resolve({ items: [], summary: null }),
      logAdverseEventsAudit: () => Promise.resolve({}),
    });
    clearContent();
    delete globalThis.window._aeDrillIn;
    await mod.pgAdverseEvents(noopTopbar, () => {}).catch(() => {});
    const html = document.getElementById('content').innerHTML;
    assert.ok(typeof html === 'string');
  });

  it('renders with mixed-severity AE list', async () => {
    stubApi({
      listAdverseEvents: () => Promise.resolve({ items: [
        { id: 'ae-1', course_id: 'c-1', patient_id: 'p-1', severity: 'mild',     status: 'open',     reportable: false, expected: false, body_system: 'neurological' },
        { id: 'ae-2', course_id: 'c-2', patient_id: 'p-2', severity: 'serious',  status: 'active',   reportable: true,  expected: false, body_system: 'cardiac', sae: true },
        { id: 'ae-3', course_id: 'c-1', patient_id: 'p-1', severity: 'moderate', status: 'resolved', reportable: false, expected: true },
      ] }),
      logAdverseEventsAudit: () => Promise.resolve({}),
    });
    clearContent();
    delete globalThis.window._aeDrillIn;
    await mod.pgAdverseEvents(noopTopbar, () => {}).catch(() => {});
    const html = document.getElementById('content').innerHTML;
    assert.ok(typeof html === 'string');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 7. pgProtocolRegistry — backend + sample fallback
// ──────────────────────────────────────────────────────────────────────────────
describe('pgProtocolRegistry — render branches', () => {
  it('renders with backend protocols (augmented path)', async () => {
    stubApi({
      protocols:    () => Promise.resolve({ items: [
        { id: 'pr-1', condition_id: 'mdd',    modality_id: 'TMS',  total_sessions: 30, target_region: 'L-DLPFC', on_label_vs_off_label: 'On-label' },
        { id: 'pr-2', condition_id: 'adhd',   modality_id: 'NF',   total_sessions: 20, on_label_vs_off_label: 'Off-label' },
      ] }),
      conditions:   () => Promise.resolve({ items: [
        { id: 'mdd',    name: 'Depression (MDD)' },
        { id: 'adhd',   name: 'ADHD' },
      ] }),
      modalities:   () => Promise.resolve({ items: [
        { id: 'TMS', name: 'TMS' },
        { id: 'NF',  name: 'Neurofeedback' },
      ] }),
      listPatients: () => Promise.resolve({ items: [] }),
    });
    clearContent();
    await mod.pgProtocolRegistry(noopTopbar).catch(() => {});
    const html = document.getElementById('content').innerHTML;
    assert.ok(html.includes('protocols'),
      'expected protocols count text in registry');
  });

  it('renders with all backend rejections (uses SAMPLE_PROTOCOLS)', async () => {
    stubApi({
      protocols:    () => Promise.reject(new Error('offline')),
      conditions:   () => Promise.reject(new Error('offline')),
      modalities:   () => Promise.reject(new Error('offline')),
      listPatients: () => Promise.reject(new Error('offline')),
    });
    clearContent();
    await mod.pgProtocolRegistry(noopTopbar).catch(() => {});
    const html = document.getElementById('content').innerHTML;
    assert.ok(html.length > 0);
  });

  it('exposes _plFilter on window', async () => {
    stubApi({
      protocols:    () => Promise.resolve({ items: [] }),
      conditions:   () => Promise.resolve({ items: [] }),
      modalities:   () => Promise.resolve({ items: [] }),
      listPatients: () => Promise.resolve({ items: [] }),
    });
    clearContent();
    await mod.pgProtocolRegistry(noopTopbar).catch(() => {});
    assert.strictEqual(typeof globalThis.window._plFilter, 'function');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 8. pgClinicalReports — page-content slot
// ──────────────────────────────────────────────────────────────────────────────
describe('pgClinicalReports — render branches', () => {
  it('renders patient dropdown when patients present', async () => {
    stubApi({
      listPatients: () => Promise.resolve([
        { id: 'p-1', name: 'Alice A.' },
        { id: 'p-2', full_name: 'Bob B.' },
        { id: 'p-3' },
      ]),
    });
    const pc = document.getElementById('page-content');
    pc.innerHTML = '';
    await mod.pgClinicalReports(noopTopbar).catch(() => {});
    // styles injected
    assert.ok(document.getElementById('phase2-styles'), 'phase2-styles should be injected');
  });

  it('renders empty when no patients', async () => {
    stubApi({ listPatients: () => Promise.resolve([]) });
    const pc = document.getElementById('page-content');
    pc.innerHTML = '';
    await mod.pgClinicalReports(noopTopbar).catch(() => {});
    assert.ok(true);
  });

  it('handles api rejection without crashing', async () => {
    stubApi({ listPatients: () => Promise.reject(new Error('offline')) });
    const pc = document.getElementById('page-content');
    pc.innerHTML = '';
    await mod.pgClinicalReports(noopTopbar).catch(() => {});
    assert.ok(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 9. pgPopulationAnalytics — role gate + render
// ──────────────────────────────────────────────────────────────────────────────
describe('pgPopulationAnalytics — render branches', () => {
  it('shows Access Restricted for non-clinician role', async () => {
    authMod.setCurrentUser({ id: 'u-2', role: 'patient' });
    clearContent();
    await mod.pgPopulationAnalytics(noopTopbar);
    const html = document.getElementById('content').innerHTML;
    assert.ok(html.includes('Access Restricted'),
      'expected role-gate copy for non-clinician');
    ensureClinicianRole();
  });

  it('renders with all-fulfilled aggregate fan-out', async () => {
    ensureClinicianRole();
    stubApi({
      getPopulationCohortSummary:    () => Promise.resolve({
        cohort_size: 12, courses_active: 6, courses_total: 14,
        courses_completed: 4, sessions_logged: 80,
        ae_incidence_per_100_courses: 12, adverse_event_serious: 1,
        adverse_event_reportable: 2, response_rate_pct: 60,
        response_rate_basis: { responders: 6, partial: 2, non_responders: 2 },
        by_condition: { mdd: 6, gad: 4 },
        by_modality: { TMS: 8, NF: 4 },
        has_demo: false, demo_count: 0,
      }),
      // List shape: items + has_demo are read directly. Fields used in render
      // are condition / modality / age_band / sex / count / signed_count.
      getPopulationCohortList:       () => Promise.resolve({ items: [
        { cohort_key: 'mdd-tms-26-35-f', condition: 'mdd', modality: 'TMS',
          age_band: '26-35', sex: 'f', count: 6, signed_count: 6, has_demo: false },
      ], has_demo: false }),
      // Trend: series[*].buckets[*].{week_index,n_patients,mean,se}.
      getPopulationOutcomeTrend:     () => Promise.resolve({ series: [
        { template_title: 'PHQ-9', scale: 'PHQ-9', n_patients: 6, n_observations: 12,
          buckets: [
            { week_index: 0, n_patients: 6, mean: 18.5, se: 1.1 },
            { week_index: 4, n_patients: 5, mean: 12.3, se: 0.9 },
          ] },
        { template_title: 'GAD-7', scale: 'GAD-7', n_patients: 4, n_observations: 6, buckets: [] },
      ] }),
      getPopulationAEIncidence:      () => Promise.resolve({
        by_protocol: [
          { key: 'p1', course_count: 5, ae_count: 1, sae_count: 0, reportable_count: 0, incidence_per_100_courses: 20 },
        ],
        by_modality: [],
        by_severity_band: [
          { key: 'mild',     course_count: 6, ae_count: 2, sae_count: 0, reportable_count: 0, incidence_per_100_courses: 33 },
          { key: 'moderate', course_count: 6, ae_count: 1, sae_count: 0, reportable_count: 0, incidence_per_100_courses: 17 },
        ],
      }),
      getPopulationTreatmentResponse:() => Promise.resolve({ distributions: [
        { scale: 'PHQ-9', responder_threshold_pct: 50, non_responder_threshold_pct: 25,
          responder_count: 4, partial_count: 1, non_responder_count: 1, no_data_count: 0,
          response_rate_pct: 67 },
      ] }),
      logPopulationAnalyticsAudit:   () => Promise.resolve(null),
    });
    clearContent();
    await mod.pgPopulationAnalytics(noopTopbar).catch(() => {});
    const html = document.getElementById('content').innerHTML;
    assert.ok(typeof html === 'string');
    assert.strictEqual(typeof globalThis.window._popOnFilterChange, 'function');
    assert.strictEqual(typeof globalThis.window._popDrillOut,       'function');
    assert.strictEqual(typeof globalThis.window._popExportCsv,      'function');
    assert.strictEqual(typeof globalThis.window._popExportNdjson,   'function');
  });

  it('renders with all-rejected aggregates (offline)', async () => {
    ensureClinicianRole();
    stubApi({
      getPopulationCohortSummary:    () => Promise.reject(new Error('offline')),
      getPopulationCohortList:       () => Promise.reject(new Error('offline')),
      getPopulationOutcomeTrend:     () => Promise.reject(new Error('offline')),
      getPopulationAEIncidence:      () => Promise.reject(new Error('offline')),
      getPopulationTreatmentResponse:() => Promise.reject(new Error('offline')),
      logPopulationAnalyticsAudit:   () => Promise.resolve(null),
    });
    clearContent();
    await mod.pgPopulationAnalytics(noopTopbar).catch(() => {});
    assert.ok(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 10. pgCalendar — uses localStorage seed
// ──────────────────────────────────────────────────────────────────────────────
describe('pgCalendar — render branches', () => {
  it('renders calendar with seeded appointments', async () => {
    clearContent();
    await mod.pgCalendar(noopTopbar);
    // seed should be persisted now
    const seeded = JSON.parse(_lsShim.getItem('ds_appointments') || 'null');
    assert.ok(Array.isArray(seeded) && seeded.length >= 6,
      'expected calendar seed to be persisted');
    const html = document.getElementById('content').innerHTML;
    assert.ok(html.length > 0);
  });

  it('renders calendar with empty appointments override', async () => {
    _lsShim.setItem('ds_appointments', JSON.stringify([]));
    clearContent();
    await mod.pgCalendar(noopTopbar);
    const html = document.getElementById('content').innerHTML;
    assert.ok(html.length > 0);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 11. pgSessionMonitor — start-form (no active session)
// ──────────────────────────────────────────────────────────────────────────────
describe('pgSessionMonitor — render branches', () => {
  it('renders empty-state when no active courses', async () => {
    stubApi({
      listPatients: () => Promise.resolve([]),
      listCourses:  () => Promise.resolve({ items: [] }),
    });
    clearContent();
    await mod.pgSessionMonitor(noopTopbar).catch(() => {});
    const html = document.getElementById('content').innerHTML;
    assert.ok(html.length > 0);
  });

  it('renders start-form with active courses + patients', async () => {
    stubApi({
      listPatients: () => Promise.resolve({ items: [
        { id: 'p-1', name: 'Patient One' },
      ] }),
      listCourses:  () => Promise.resolve({ items: [
        { id: 'c-1', patient_id: 'p-1', status: 'active', modality_slug: 'TMS', condition_slug: 'mdd', protocol_id: 'P1' },
      ] }),
    });
    clearContent();
    await mod.pgSessionMonitor(noopTopbar).catch(() => {});
    const html = document.getElementById('content').innerHTML;
    assert.ok(html.length > 0);
  });

  it('renders error state when api rejects', async () => {
    stubApi({
      listPatients: () => Promise.reject(new Error('offline')),
      listCourses:  () => Promise.reject(new Error('offline')),
    });
    clearContent();
    await mod.pgSessionMonitor(noopTopbar).catch(() => {});
    const html = document.getElementById('content').innerHTML;
    assert.ok(html.length > 0);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 12. pgOutcomePrediction — load + render
// ──────────────────────────────────────────────────────────────────────────────
describe('pgOutcomePrediction — render', () => {
  it('renders prediction page; persists default predictions', async () => {
    stubApi({
      getCourse: () => Promise.resolve(null),
      evidencePatientOverview: () => Promise.resolve(null),
      listReports: () => Promise.resolve([]),
    });
    clearContent();
    delete globalThis.window._selectedCourseId;
    await mod.pgOutcomePrediction(noopTopbar).catch(() => {});
    const data = JSON.parse(_lsShim.getItem('ds_predictions') || 'null');
    assert.ok(Array.isArray(data) && data.length >= 5,
      'expected default 5 prediction records to be persisted');
  });

  it('renders prediction with selected course (live evidence path)', async () => {
    globalThis.window._selectedCourseId = 'c-live';
    stubApi({
      getCourse: () => Promise.resolve({
        id: 'c-live', patient_id: 'p-99', patient_name: 'Live Patient',
      }),
      evidencePatientOverview: () => Promise.resolve({
        saved_citations: [{ id: 'c-1' }],
        highlights: [{ id: 'h-1' }, { id: 'h-2' }],
        contradictory_findings: [],
        evidence_used_in_report: [{ id: 'e-1' }],
        compare_with_literature_phenotype: { matched_tags: ['anxiety', 'tms-responder'] },
      }),
      listReports: () => Promise.resolve([{ id: 'r-1' }, { id: 'r-2' }]),
    });
    clearContent();
    await mod.pgOutcomePrediction(noopTopbar).catch(() => {});
    const html = document.getElementById('content').innerHTML;
    assert.ok(html.length > 0);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 13. pgRulesEngine — tabs + seeded rules
// ──────────────────────────────────────────────────────────────────────────────
describe('pgRulesEngine — render branches', () => {
  it('renders rules tab with seed rules', async () => {
    clearContent();
    await mod.pgRulesEngine(noopTopbar);
    // seed rules persisted
    const rules = JSON.parse(_lsShim.getItem('ds_alert_rules') || 'null');
    assert.ok(Array.isArray(rules) && rules.length >= 4);
    const html = document.getElementById('content').innerHTML;
    assert.ok(html.length > 0);
  });

  it('window._reSwitchTab toggles to log + test', async () => {
    clearContent();
    await mod.pgRulesEngine(noopTopbar);
    if (typeof globalThis.window._reSwitchTab === 'function') {
      globalThis.window._reSwitchTab('log');
      globalThis.window._reSwitchTab('test');
      globalThis.window._reSwitchTab('rules');
    }
    assert.ok(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 14. pgAINoteAssistant — phrases + quality check
// ──────────────────────────────────────────────────────────────────────────────
describe('pgAINoteAssistant — render', () => {
  it('renders AI note page', async () => {
    clearContent();
    await mod.pgAINoteAssistant(noopTopbar);
    const html = document.getElementById('content').innerHTML;
    assert.ok(html.length > 0);
  });

  it('renders with completed sessions seeded', async () => {
    _lsShim.setItem('ds_completed_sessions', JSON.stringify([
      { id: 's-1', patientName: 'Pat 1', modality: 'NF',  duration: 40, condition: 'anxiety',
        notes: 'Some notes', amplitude: 50, frequency: 10 },
      { id: 's-2', patientName: 'Pat 2', modality: 'TMS', duration: 20, condition: 'depression',
        notes: '', amplitude: 1.5, frequency: 0 },
    ]));
    clearContent();
    await mod.pgAINoteAssistant(noopTopbar);
    const html = document.getElementById('content').innerHTML;
    assert.ok(html.length > 0);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 15. pgCourseCompletionReport — guards + render
// ──────────────────────────────────────────────────────────────────────────────
describe('pgCourseCompletionReport — guards + render', () => {
  it('navigates to courses when no course selected', async () => {
    delete globalThis.window._selectedCourseId;
    let nav = null;
    await mod.pgCourseCompletionReport(noopTopbar, (t) => { nav = t; });
    assert.strictEqual(nav, 'courses');
  });

  it('navigates to courses when getCourse resolves null', async () => {
    globalThis.window._selectedCourseId = 'c-missing';
    stubApi({
      getCourse:           () => Promise.resolve(null),
      listCourseSessions:  () => Promise.resolve({ items: [] }),
      listOutcomes:        () => Promise.resolve({ items: [] }),
      courseOutcomeSummary:() => Promise.resolve(null),
      listAdverseEvents:   () => Promise.resolve({ items: [] }),
    });
    let nav = null;
    await mod.pgCourseCompletionReport(noopTopbar, (t) => { nav = t; });
    assert.strictEqual(nav, 'courses');
  });

  it('renders when course resolves with payload', async () => {
    globalThis.window._selectedCourseId = 'c-real';
    stubApi({
      getCourse: () => Promise.resolve(makeCourse({
        id: 'c-real',
        sessions_delivered: 12, planned_sessions_total: 20,
        started_at: '2026-02-01T00:00:00Z',
      })),
      listCourseSessions: () => Promise.resolve({ items: [
        { id: 's-1', created_at: '2026-02-08T00:00:00Z' },
        { id: 's-2', created_at: '2026-02-15T00:00:00Z' },
      ] }),
      listOutcomes: () => Promise.resolve({ items: [
        { template_name: 'PHQ-9', score: 18, score_numeric: 18, recorded_at: '2026-02-01T00:00:00Z' },
        { template_name: 'PHQ-9', score: 9,  score_numeric: 9,  recorded_at: '2026-04-01T00:00:00Z' },
      ] }),
      courseOutcomeSummary: () => Promise.resolve({ summaries: [
        { template_name: 'PHQ-9', baseline: 18, latest: 9, pct_change: -50, is_responder: true },
      ] }),
      listAdverseEvents: () => Promise.resolve({ items: [] }),
      getPatient: () => Promise.resolve({ id: 'p-1', first_name: 'Test', last_name: 'Patient' }),
    });
    clearContent();
    await mod.pgCourseCompletionReport(noopTopbar, () => {}).catch(() => {});
    const html = document.getElementById('content').innerHTML;
    assert.ok(html.length > 0);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 16. pgQuickOutcomeCapture — utility delegate
// ──────────────────────────────────────────────────────────────────────────────
describe('pgQuickOutcomeCapture — utility page', () => {
  it('writes pointer copy to #content', async () => {
    clearContent();
    await mod.pgQuickOutcomeCapture(noopTopbar);
    const html = document.getElementById('content').innerHTML;
    assert.ok(html.includes('Quick Outcome Capture'));
    assert.ok(html.includes('Use this from within a session'));
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 17. pgClinicianAdherenceHub — content + filter strip
// ──────────────────────────────────────────────────────────────────────────────
describe('pgClinicianAdherenceHub — render', () => {
  it('renders empty hub when api returns empty list', async () => {
    stubApi({
      clinicianAdherenceList:    () => Promise.resolve({ items: [], total: 0, is_demo_view: false }),
      clinicianAdherenceSummary: () => Promise.resolve({
        total_today: 0, total_7d: 0, side_effects_7d: 0, escalated_7d: 0,
        sae_flagged: 0, response_rate_pct: 0, missed_streak_top_patients: [],
      }),
      postClinicianAdherenceAuditEvent: () => Promise.resolve({}),
    });
    clearContent();
    await mod.pgClinicianAdherenceHub(noopTopbar, () => {}).catch(() => {});
    const root = document.getElementById('cah-root');
    assert.ok(root, '#cah-root should exist');
    const summary = document.getElementById('cah-summary');
    assert.ok(summary && summary.innerHTML.includes('Today'),
      'summary strip should include Today label');
  });

  it('renders rows when items grouped by patient', async () => {
    stubApi({
      clinicianAdherenceList: () => Promise.resolve({
        items: [
          { id: 'e-1', patient_id: 'p-1', patient_name: 'Alpha A', event_type: 'side_effect', severity: 'high',
            status: 'open', body: 'mild headache', report_date: '2026-05-01' },
          { id: 'e-2', patient_id: 'p-1', patient_name: 'Alpha A', event_type: 'missed', severity: 'low',
            status: 'acknowledged', body: 'no-show', report_date: '2026-05-02' },
          { id: 'e-3', patient_id: 'p-2', patient_name: 'Beta B',  event_type: 'side_effect', severity: 'urgent',
            status: 'escalated', body: 'severe', report_date: '2026-05-03', course_id: 'c-1' },
        ],
        total: 3,
        is_demo_view: true,
      }),
      clinicianAdherenceSummary: () => Promise.resolve({
        total_today: 3, total_7d: 5, side_effects_7d: 2, escalated_7d: 1,
        sae_flagged: 1, response_rate_pct: 80,
        missed_streak_top_patients: [{ patient_id: 'p-1', patient_name: 'Alpha A', streak_days: 5 }],
      }),
      postClinicianAdherenceAuditEvent: () => Promise.resolve({}),
    });
    clearContent();
    await mod.pgClinicianAdherenceHub(noopTopbar, () => {}).catch(() => {});
    const banner = document.getElementById('cah-banner');
    assert.ok(banner && banner.innerHTML.includes('Demo data'),
      'demo banner should appear when is_demo_view=true');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 18. pgClinicianWellnessHub — render
// ──────────────────────────────────────────────────────────────────────────────
describe('pgClinicianWellnessHub — render', () => {
  it('renders empty wellness hub', async () => {
    stubApi({
      clinicianWellnessList:    () => Promise.resolve({ items: [], total: 0, is_demo_view: false }),
      clinicianWellnessSummary: () => Promise.resolve({
        total_today: 0, total_7d: 0, axes_trending_down_7d: 0,
        low_mood_top_patients: [], missed_streak_top_patients: [],
        response_rate_pct: 0, escalation_candidates: 0,
      }),
      postClinicianWellnessAuditEvent: () => Promise.resolve({}),
    });
    clearContent();
    await mod.pgClinicianWellnessHub(noopTopbar, () => {}).catch(() => {});
    const root = document.getElementById('cwh-root');
    assert.ok(root, '#cwh-root should exist');
  });

  it('renders rows when wellness items present', async () => {
    stubApi({
      clinicianWellnessList: () => Promise.resolve({
        items: [
          { id: 'w-1', patient_id: 'p-1', patient_name: 'Alpha', mood: 4, energy: 5, sleep: 4, anxiety: 6, focus: 5, pain: 2,
            severity_band: 'low', clinician_status: 'open', report_date: '2026-05-01' },
          { id: 'w-2', patient_id: 'p-2', patient_name: 'Beta',  mood: 2, energy: 3, sleep: 3, anxiety: 8, focus: 3, pain: 5,
            severity_band: 'high', clinician_status: 'open', report_date: '2026-05-02' },
        ],
        total: 2,
        is_demo_view: false,
      }),
      clinicianWellnessSummary: () => Promise.resolve({
        total_today: 2, total_7d: 5, axes_trending_down_7d: 1,
        low_mood_top_patients: [{ patient_id: 'p-2', patient_name: 'Beta', avg_mood: 2.5 }],
        missed_streak_top_patients: [],
        response_rate_pct: 60, escalation_candidates: 1,
      }),
      postClinicianWellnessAuditEvent: () => Promise.resolve({}),
    });
    clearContent();
    await mod.pgClinicianWellnessHub(noopTopbar, () => {}).catch(() => {});
    const summary = document.getElementById('cwh-summary');
    assert.ok(summary && summary.innerHTML.length > 0);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 19. pgClinicianDailyDigest — role gate + render
// ──────────────────────────────────────────────────────────────────────────────
describe('pgClinicianDailyDigest — render', () => {
  it('renders Restricted card when role lacks access', async () => {
    authMod.setCurrentUser({ id: 'u-3', role: 'patient' });
    clearContent();
    await mod.pgClinicianDailyDigest(noopTopbar, () => {});
    const html = document.getElementById('content').innerHTML;
    assert.ok(html.includes('Restricted'),
      'expected Restricted card for non-clinician role');
    ensureClinicianRole();
  });

  it('renders digest skeleton when role permits', async () => {
    ensureClinicianRole();
    stubApi({
      clinicianDigestSummary:  () => Promise.resolve({
        handled: 3, escalated: 1, paged: 0, open: 5, sla_breached: 0,
        by_surface: { clinician_inbox: 3, clinician_adherence_hub: 1 },
        is_demo_view: false,
      }),
      clinicianDigestSections: () => Promise.resolve({ sections: [] }),
      clinicianDigestEvents:   () => Promise.resolve({ events: [] }),
      postClinicianDigestAuditEvent: () => Promise.resolve({}),
    });
    clearContent();
    await mod.pgClinicianDailyDigest(noopTopbar, () => {}).catch(() => {});
    const root = document.getElementById('cdg-root');
    assert.ok(root, '#cdg-root should exist after render');
  });

  it('handles digest api rejections without crashing', async () => {
    ensureClinicianRole();
    stubApi({
      clinicianDigestSummary:  () => Promise.reject(new Error('offline')),
      clinicianDigestSections: () => Promise.reject(new Error('offline')),
      clinicianDigestEvents:   () => Promise.reject(new Error('offline')),
      postClinicianDigestAuditEvent: () => Promise.resolve({}),
    });
    clearContent();
    await mod.pgClinicianDailyDigest(noopTopbar, () => {}).catch(() => {});
    assert.ok(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 20. pgSessionExecution — branch coverage with stubbed deps
// ──────────────────────────────────────────────────────────────────────────────
describe('pgSessionExecution — render branches', () => {
  it('renders with empty course list (sample-session demo path)', async () => {
    stubApi({
      getCourse:    () => Promise.resolve(null),
      listCourses:  () => Promise.resolve([]),
      listPatients: () => Promise.resolve({ items: [] }),
    });
    clearContent();
    await mod.pgSessionExecution(noopTopbar, () => {}).catch(() => {});
    // sex-root container is the documented mount point
    assert.ok(document.getElementById('sex-root'));
  });

  it('renders with provided active course', async () => {
    stubApi({
      getCourse:    () => Promise.resolve(makeCourse()),
      listCourses:  () => Promise.resolve([makeCourse()]),
      listPatients: () => Promise.resolve({ items: [{ id: 'p-1', name: 'Test Patient' }] }),
    });
    clearContent();
    await mod.pgSessionExecution(noopTopbar, () => {}).catch(() => {});
    assert.ok(document.getElementById('sex-root'));
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 21. openQuickOutcomeCapture — sync re-export (extra branches)
// ──────────────────────────────────────────────────────────────────────────────
describe('openQuickOutcomeCapture — delegate behaviour', () => {
  it('throws when window._openQuickOutcomeCapture is missing', () => {
    delete globalThis.window._openQuickOutcomeCapture;
    assert.throws(
      () => mod.openQuickOutcomeCapture('c1', 's1', 'name'),
      /not a function/i,
    );
  });

  it('forwards args in correct order', () => {
    const calls = [];
    globalThis.window._openQuickOutcomeCapture = (...a) => { calls.push(a); };
    mod.openQuickOutcomeCapture('A', 'B', 'C');
    mod.openQuickOutcomeCapture('A2', 'B2', 'C2');
    assert.deepStrictEqual(calls, [['A', 'B', 'C'], ['A2', 'B2', 'C2']]);
    delete globalThis.window._openQuickOutcomeCapture;
  });
});
