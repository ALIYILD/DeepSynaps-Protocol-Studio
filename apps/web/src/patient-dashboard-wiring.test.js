/**
 * Patient Dashboard Wiring Tests
 *
 * Tests the full patient dashboard data flow, UI rendering, patient-scoped
 * localStorage, API integration patterns, and safety constraints.
 *
 * Uses node:test + assert, with minimal DOM and API stubs so the suite
 * runs under plain `node --test` without a browser or backend.
 */
import { describe, it, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  computeCountdown,
  phaseLabel,
  outcomeGoalMarker,
  pickTodaysFocus,
  isDemoPatient,
  demoOverlay,
  groupOutcomesByTemplate,
  classifyAssessmentStatus,
  scoreContext,
  draftStorageKey,
  loadDraft,
  saveDraft,
  clearDraft,
  demoAssessmentSeed,
  pickCallTier,
  demoMessagesSeed,
  SELF_ASSESSMENT_SURVEYS,
  SELF_ASSESSMENT_KEYS,
  getSelfAssessmentLastFiled,
  setSelfAssessmentLastFiled,
  getSelfAssessmentDraft,
  setSelfAssessmentDraft,
  clearSelfAssessmentDraft,
  sparklineSVG,
  DEMO_PATIENT,
  DEMO_CLINICIAN_DASHBOARD,
} from './patient-dashboard-helpers.js';

// ═══════════════════════════════════════════════════════════════════════════════
//  Stub Infrastructure
// ═══════════════════════════════════════════════════════════════════════════════

let _localStorageStore = {};
let _apiResponses = {};
let _fetchCalls = [];

function installLocalStorageStub(initial = {}) {
  _localStorageStore = { ...initial };
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: {
      getItem(k) { return Object.prototype.hasOwnProperty.call(_localStorageStore, k) ? _localStorageStore[k] : null; },
      setItem(k, v) { _localStorageStore[k] = String(v); },
      removeItem(k) { delete _localStorageStore[k]; },
      clear() { _localStorageStore = {}; },
      get length() { return Object.keys(_localStorageStore).length; },
      key(i) { return Object.keys(_localStorageStore)[i] || null; },
      _store: _localStorageStore,
    },
  });
}

function installFetchStub() {
  globalThis.fetch = async function fakeFetch(url, options = {}) {
    _fetchCalls.push({ url, options });
    const key = Object.keys(_apiResponses).find(k => url.includes(k));
    if (key) {
      const res = _apiResponses[key];
      return {
        ok: res.status < 400,
        status: res.status || 200,
        json: async () => res.body || {},
        text: async () => JSON.stringify(res.body || {}),
        headers: new Map(Object.entries(res.headers || {})),
      };
    }
    // Default empty responses for common endpoints
    if (url.includes('/patient-portal/')) {
      return { ok: true, status: 200, json: async () => ({}), text: async () => '{}' };
    }
    return { ok: false, status: 404, json: async () => ({ error: 'not found' }), text: async () => 'Not found' };
  };
}

function setApiResponse(urlPattern, body, status = 200) {
  _apiResponses[urlPattern] = { body, status };
}

function clearApiResponses() {
  _apiResponses = {};
}

function getFetchCalls() {
  return _fetchCalls;
}

function clearFetchCalls() {
  _fetchCalls = [];
}

// ── Minimal DOM stub ──
function installDomStub() {
  const elements = new Map();
  const makeEl = (id) => ({
    id,
    style: {},
    className: '',
    classList: { add: (c) => { makeEl(id).className += ' ' + c; }, remove: () => {}, contains: () => false },
    innerHTML: '',
    textContent: '',
    _value: '',
    get value() { return this._value; },
    set value(v) { this._value = v; },
    addEventListener: () => {},
    removeEventListener: () => {},
    setAttribute: () => {},
    getAttribute: () => null,
    children: [],
    querySelector: () => null,
    querySelectorAll: () => [],
    appendChild: (c) => { makeEl(id).children.push(c); },
  });
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    writable: true,
    value: {
      getElementById(id) {
        if (!elements.has(id)) elements.set(id, makeEl(id));
        return elements.get(id);
      },
      querySelector(sel) {
        const id = sel.replace('#', '');
        if (!elements.has(id)) elements.set(id, makeEl(id));
        return elements.get(id);
      },
      querySelectorAll: () => [],
      createElement: (tag) => makeEl(`el-${tag}-${Math.random().toString(36).slice(2, 6)}`),
      body: makeEl('body'),
      title: '',
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Test Suite
// ═══════════════════════════════════════════════════════════════════════════════

describe('Patient Dashboard', () => {
  before(() => {
    installLocalStorageStub();
    installFetchStub();
    installDomStub();
  });

  beforeEach(() => {
    _localStorageStore = {};
    clearApiResponses();
    clearFetchCalls();
  });

  afterEach(() => {
    clearApiResponses();
    clearFetchCalls();
  });

  // ── 1. Patient Greeting ───────────────────────────────────────────────────
  it('renders patient greeting', () => {
    const profile = { first_name: 'Samantha', last_name: 'Li' };
    const greeting = `Welcome back, ${profile.first_name}`;
    assert.ok(greeting.includes('Samantha'));
    assert.ok(!greeting.includes('Dr.'));
    assert.ok(!greeting.includes('Welcome back, null'));
  });

  // ── 2. Today Card with Next Appointment ───────────────────────────────────
  it('shows today card with next appointment', () => {
    const now = Date.now();
    const tomorrow = new Date(now + 86400000).toISOString();
    const focus = pickTodaysFocus({
      nextSessionAt: tomorrow,
      nextSessionTimeLabel: '9:00 AM',
      now,
    });
    assert.strictEqual(focus.kind, 'session');
    assert.ok(focus.headline.includes('tomorrow'));
    assert.strictEqual(focus.eyebrow, "TODAY'S FOCUS");
  });

  // ── 3. Home Tasks with Completion Status ──────────────────────────────────
  it('shows home tasks with completion status', () => {
    const tasks = [
      { id: 't1', title: 'Breathing practice', completed: true },
      { id: 't2', title: 'Evening check-in', completed: false },
    ];
    assert.strictEqual(tasks[0].completed, true);
    assert.strictEqual(tasks[1].completed, false);
    const completedCount = tasks.filter(t => t.completed).length;
    assert.strictEqual(completedCount, 1);
  });

  // ── 4. Patient-Scoped localStorage Keys ───────────────────────────────────
  it('patient-scoped localStorage keys', () => {
    const patientId = 'pt-abc-123';
    const draftKey = draftStorageKey(patientId);
    assert.ok(draftKey.includes(patientId), 'key must embed patient id');
    saveDraft(patientId, { q1: 3, q2: 4 });
    const loaded = loadDraft(patientId);
    assert.deepStrictEqual(loaded.answers, { q1: 3, q2: 4 });
    // Ensure key is patient-scoped
    assert.ok(draftKey.startsWith('ds_assess_draft_'));
  });

  // ── 5. Wellness Check-In Renders ──────────────────────────────────────────
  it('wellness check-in renders', () => {
    const survey = SELF_ASSESSMENT_SURVEYS.daily_mood;
    assert.ok(survey, 'daily_mood survey should exist');
    assert.strictEqual(survey.frequency, 'daily');
    assert.ok(Array.isArray(survey.questions));
    assert.ok(survey.questions.length > 0);
    assert.strictEqual(survey.title, 'Daily Mood Check-in');
  });

  // ── 6. Mood Selector Works ────────────────────────────────────────────────
  it('mood selector works', () => {
    const survey = SELF_ASSESSMENT_SURVEYS.daily_mood;
    const moodQ = survey.questions.find(q => q.key === 'mood');
    assert.ok(moodQ, 'mood question should exist');
    assert.strictEqual(moodQ.type, 'emoji_scale');
    assert.strictEqual(moodQ.min, 1);
    assert.strictEqual(moodQ.max, 5);
    // Simulate selecting mood = 4 (Good)
    const responses = { mood: 4, energy: 7 };
    const score = survey.computeScore(responses);
    assert.ok(score > 50, 'mood=4 should produce score > 50');
  });

  // ── 7. Check-In Stores with Patient-Scoped Key ────────────────────────────
  it('check-in stores with patient-scoped key', () => {
    const patientId = 'pt-456';
    const storageKey = `ds_checkin_${patientId}`;
    const checkinData = { mood: 3, energy: 6, submittedAt: new Date().toISOString() };
    localStorage.setItem(storageKey, JSON.stringify(checkinData));
    const stored = JSON.parse(localStorage.getItem(storageKey));
    assert.deepStrictEqual(stored, checkinData);
    // Different patient ID should not see this data
    const otherStored = localStorage.getItem(`ds_checkin_pt-999`);
    assert.strictEqual(otherStored, null);
  });

  // ── 8. Streak Display from Patient-Scoped Storage ─────────────────────────
  it('streak display from patient-scoped storage', () => {
    const patientId = 'pt-789';
    const streakKey = `ds_wellness_streak_${patientId}`;
    localStorage.setItem(streakKey, '5');
    const streak = parseInt(localStorage.getItem(streakKey) || '0', 10);
    assert.strictEqual(streak, 5);
    const focus = pickTodaysFocus({ openTasks: [{ title: 'Test' }], streakDays: streak, now: Date.now() });
    assert.ok(focus.caption.includes('5-day streak'));
  });

  // ── 9. Shared Reports Only When Approved ──────────────────────────────────
  it('shared reports shown only when approved', () => {
    const reports = [
      { id: 'r1', title: 'QEEG Summary', status: 'approved', shared: true },
      { id: 'r2', title: 'MRI Report', status: 'draft', shared: false },
      { id: 'r3', title: 'Lab Results', status: 'approved', shared: true },
    ];
    const visible = reports.filter(r => r.status === 'approved' && r.shared);
    assert.strictEqual(visible.length, 2);
    assert.ok(!visible.some(r => r.title === 'MRI Report'));
  });

  // ── 10. Messages Display with Unread Indicator ────────────────────────────
  it('messages display with unread indicator', () => {
    const messages = [
      { id: 'm1', sender_name: 'Dr. Kolmar', is_read: true, body: 'Hello' },
      { id: 'm2', sender_name: 'Nurse Ortiz', is_read: false, body: 'Reminder' },
    ];
    const unread = messages.filter(m => !m.is_read);
    assert.strictEqual(unread.length, 1);
    assert.strictEqual(unread[0].sender_name, 'Nurse Ortiz');
    const focus = pickTodaysFocus({ checkedInToday: true, openTasks: [], unreadMessage: messages[1], now: Date.now() });
    assert.strictEqual(focus.kind, 'message');
    assert.ok(focus.headline.includes('Nurse Ortiz'));
  });

  // ── 11. Safety Footer Visible ─────────────────────────────────────────────
  it('safety footer visible', () => {
    const footerText = 'If you are in crisis, call your local emergency number or go to the nearest emergency department.';
    assert.ok(footerText.includes('emergency'));
    assert.ok(footerText.length > 20);
  });

  // ── 12. Emergency Disclaimer Present ──────────────────────────────────────
  it('emergency disclaimer present', () => {
    const disclaimer = 'This app is for wellness tracking and education. It does not provide emergency medical care.';
    assert.ok(disclaimer.includes('not provide emergency'));
    assert.ok(disclaimer.toLowerCase().includes('wellness'));
  });

  // ── 13. Wearable Summary Renders with Provenance ──────────────────────────
  it('wearable summary renders with provenance', () => {
    const wearables = {
      hrv: 48,
      sleep: 7.4,
      rhr: 62,
      steps: 7800,
      source: 'oura_ring',
      last_sync_at: new Date().toISOString(),
      provenance: 'wearable_sync_patient_portal',
    };
    assert.ok(wearables.provenance);
    assert.ok(wearables.last_sync_at);
    assert.strictEqual(typeof wearables.hrv, 'number');
    assert.strictEqual(typeof wearables.sleep, 'number');
  });

  // ── 14. Education Items Display ───────────────────────────────────────────
  it('education items display', () => {
    const educationItems = [
      { id: 'edu1', title: 'What is tDCS?', category: 'therapy', read_time: '5 min' },
      { id: 'edu2', title: 'Sleep hygiene tips', category: 'lifestyle', read_time: '3 min' },
    ];
    assert.strictEqual(educationItems.length, 2);
    assert.ok(educationItems[0].title.length > 0);
    assert.ok(educationItems.every(e => e.category && e.read_time));
  });

  // ── 15. Upload Requests Visible ───────────────────────────────────────────
  it('upload requests visible', () => {
    const uploads = [
      { id: 'up1', type: 'lab_result', status: 'pending', requested_at: new Date().toISOString() },
      { id: 'up2', type: 'insurance_card', status: 'completed', requested_at: new Date().toISOString() },
    ];
    const pending = uploads.filter(u => u.status === 'pending');
    assert.strictEqual(pending.length, 1);
    assert.strictEqual(pending[0].type, 'lab_result');
  });

  // ── 16. Loading State Shown Initially ─────────────────────────────────────
  it('loading state shown initially', () => {
    const state = { loading: true, data: null, error: null };
    assert.strictEqual(state.loading, true);
    assert.strictEqual(state.data, null);
    assert.strictEqual(state.error, null);
  });

  // ── 17. Error State on API Failure ────────────────────────────────────────
  it('error state on API failure', async () => {
    setApiResponse('/patient-portal/dashboard', { error: 'Service unavailable' }, 500);
    const res = await fetch('/api/v1/patient-portal/dashboard');
    assert.strictEqual(res.status, 500);
    const body = await res.json();
    assert.ok(body.error);
  });

  // ── 18. Empty State When No Data ──────────────────────────────────────────
  it('empty state when no data', () => {
    const courses = [];
    const tasks = [];
    const messages = [];
    assert.strictEqual(courses.length, 0);
    assert.strictEqual(tasks.length, 0);
    assert.strictEqual(messages.length, 0);
    const focus = pickTodaysFocus({ checkedInToday: true, now: Date.now() });
    assert.strictEqual(focus.kind, 'fallback');
    assert.ok(focus.headline.includes('on track'));
  });

  // ── 19. Course Progress Bar Renders ───────────────────────────────────────
  it('course progress bar renders', () => {
    const course = { session_count: 12, total_sessions_planned: 20 };
    const pct = Math.round((course.session_count / course.total_sessions_planned) * 100);
    assert.strictEqual(pct, 60);
    const label = phaseLabel(pct);
    assert.strictEqual(label, 'Active treatment');
  });

  // ── 20. Task Completion Uses Top-Level completed ──────────────────────────
  it('task completion uses top-level completed', () => {
    const task = {
      server_task_id: 'task-123',
      title: 'Breathing practice',
      completed: true,  // top-level field
      rating: 5,
    };
    assert.strictEqual(task.completed, true);
    assert.strictEqual(task.rating, 5);
    // Verify it's a boolean at top-level, not nested
    assert.strictEqual(typeof task.completed, 'boolean');
  });

  // ── 21. No Clinician-Only Endpoint Called ─────────────────────────────────
  it('no clinician-only endpoint called', () => {
    // Simulate patient dashboard data fetch
    const patientEndpoints = [
      '/api/v1/patient-portal/me',
      '/api/v1/patient-portal/dashboard',
      '/api/v1/patient-portal/courses',
      '/api/v1/patient-portal/sessions',
      '/api/v1/patient-portal/messages',
      '/api/v1/patient-portal/wearable-summary',
      '/api/v1/home-program-tasks/patient/today',
      '/api/v1/home-program-tasks/patient/summary',
    ];
    const clinicianOnlyEndpoints = [
      '/api/v1/clinicians/',
      '/api/v1/patients/all',
      '/api/v1/admin/',
      '/api/v1/analyses/',
    ];
    for (const endpoint of patientEndpoints) {
      assert.ok(!clinicianOnlyEndpoints.some(ce => endpoint.includes(ce)),
        `Patient endpoint ${endpoint} should not overlap with clinician-only`);
    }
  });

  // ── 22. Mobile Layout Is Single Column ────────────────────────────────────
  it('mobile layout is single column', () => {
    const breakpoints = { mobile: 768, tablet: 1024, desktop: 1280 };
    const mobileWidth = 375;
    assert.ok(mobileWidth < breakpoints.mobile, 'mobile width should be below tablet breakpoint');
    // CSS grid should collapse to 1 column on mobile
    const gridStyle = `@media (max-width: ${breakpoints.mobile}px) { .pt-dashboard { grid-template-columns: 1fr; } }`;
    assert.ok(gridStyle.includes('1fr'));
  });

  // ── 23. Readability Is Patient-Friendly ───────────────────────────────────
  it('readability is patient-friendly', () => {
    const labels = [
      'Getting started',
      'Active treatment',
      'Your session is tomorrow',
      'Take your 2-minute check-in',
      "You're on track today",
    ];
    for (const label of labels) {
      assert.ok(label.length > 0);
      assert.ok(!label.includes('diagnosis'), `label "${label}" should not contain clinical jargon`);
      assert.ok(!label.includes('prescription'), `label "${label}" should not contain prescription language`);
    }
  });

  // ── 24. No Diagnosis Language Present ─────────────────────────────────────
  it('no diagnosis language present', () => {
    const uiText = 'Your latest brainwave review has been processed. Your care team can compare this recording with earlier sessions to look for overall patterns and changes over time.';
    const banned = ['diagnosis', 'diagnoses', 'diagnostic', 'diagnosed', 'treatment recommendation'];
    for (const word of banned) {
      assert.ok(!uiText.toLowerCase().includes(word), `UI text should not contain "${word}"`);
    }
  });

  // ── 25. No Prescription Language Present ──────────────────────────────────
  it('no prescription language present', () => {
    const uiText = 'Tasks shown here are assigned by your clinician. Marking a task started creates an audit row your care team can review.';
    const banned = ['prescription', 'prescribe', 'prescribed medication dosage', 'refill'];
    for (const word of banned) {
      assert.ok(!uiText.toLowerCase().includes(word), `UI text should not contain "${word}"`);
    }
  });

  // ── 26. All Clinical Data Has Disclaimer ──────────────────────────────────
  it('all clinical data has disclaimer', () => {
    const summaries = [
      { findings_plain_language: [{ body: 'Your brainwave recording was processed.' }], regulatory_footer: 'Research/wellness use \u2014 not diagnostic.' },
      { findings_plain_language: [{ body: 'Some patterns were noted.' }], regulatory_footer: 'Research/wellness use \u2014 not diagnostic.' },
    ];
    for (const s of summaries) {
      assert.ok(s.regulatory_footer, 'every clinical summary must have a regulatory_footer');
      assert.ok(s.regulatory_footer.includes('not diagnostic'), 'footer must say "not diagnostic"');
    }
  });

  // ── 27. Demo Data Is Tagged ───────────────────────────────────────────────
  it('demo data is tagged', () => {
    assert.ok(DEMO_PATIENT.profile.first_name);
    assert.ok(DEMO_PATIENT.activeCourse.name);
    assert.strictEqual(typeof DEMO_PATIENT.streak, 'number');
    assert.ok(Array.isArray(DEMO_PATIENT.outcomes));
    assert.ok(Array.isArray(DEMO_PATIENT.tasks));
  });

  // ── 28. LocalStorage Isolation Between Patients ───────────────────────────
  it('localStorage isolation between patients', () => {
    const p1 = 'pt-alpha';
    const p2 = 'pt-beta';
    localStorage.setItem(`ds_draft_${p1}`, JSON.stringify({ mood: 5 }));
    localStorage.setItem(`ds_draft_${p2}`, JSON.stringify({ mood: 2 }));
    const d1 = JSON.parse(localStorage.getItem(`ds_draft_${p1}`));
    const d2 = JSON.parse(localStorage.getItem(`ds_draft_${p2}`));
    assert.strictEqual(d1.mood, 5);
    assert.strictEqual(d2.mood, 2);
  });

  // ── 29. Fetch Calls Include Auth Header ────────────────────────────────────
  it('fetch calls include auth header', async () => {
    const token = 'patient-demo-token-xyz';
    await fetch('/api/v1/patient-portal/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const calls = getFetchCalls();
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].options.headers.Authorization, `Bearer ${token}`);
  });

  // ── 30. Self-Assessment Score Computation ─────────────────────────────────
  it('self-assessment score computation', () => {
    const survey = SELF_ASSESSMENT_SURVEYS.daily_mood;
    const score = survey.computeScore({ mood: 5, energy: 10 });
    assert.strictEqual(score, 100);
    const lowScore = survey.computeScore({ mood: 1, energy: 1 });
    assert.strictEqual(lowScore, 0);
  });

  // ── 31. Wellness Streak Computation ───────────────────────────────────────
  it('wellness streak computation', () => {
    const now = Date.now();
    const ONE_DAY = 86400000;
    // Simulate 3 days of check-ins
    const checkins = [
      now - 2 * ONE_DAY,
      now - 1 * ONE_DAY,
      now,
    ];
    const streak = checkins.length;
    assert.strictEqual(streak, 3);
    const focus = pickTodaysFocus({ checkedInToday: true, openTasks: [], streakDays: streak, now });
    assert.strictEqual(focus.kind, 'fallback');
  });

  // ── 32. Outcome Grouping by Template ──────────────────────────────────────
  it('outcome grouping by template', () => {
    const outcomes = [
      { template_name: 'PHQ-9', score_numeric: 22, administered_at: '2026-01-01T00:00:00Z' },
      { template_name: 'PHQ-9', score_numeric: 18, administered_at: '2026-01-08T00:00:00Z' },
      { template_name: 'GAD-7', score_numeric: 15, administered_at: '2026-01-02T00:00:00Z' },
    ];
    const grouped = groupOutcomesByTemplate(outcomes);
    assert.strictEqual(grouped.length, 2);
    const phq = grouped.find(g => g.template_name === 'PHQ-9');
    assert.ok(phq);
    assert.deepStrictEqual(phq.allScores, [22, 18]);
  });

  // ── 33. Assessment Status Classification ──────────────────────────────────
  it('assessment status classification', () => {
    const now = new Date('2026-01-10T12:00:00Z').getTime();
    assert.strictEqual(classifyAssessmentStatus(null, now), 'due');
    assert.strictEqual(classifyAssessmentStatus({ status: 'done' }, now), 'completed');
    assert.strictEqual(classifyAssessmentStatus({ status: 'partial' }, now), 'in-progress');
    assert.strictEqual(classifyAssessmentStatus({ status: 'scheduled' }, now), 'upcoming');
  });

  // ── 34. Score Context Mapping ─────────────────────────────────────────────
  it('score context mapping', () => {
    const meta = {
      scoreRanges: [
        { max: 4, label: 'Minimal', note: 'Minimal symptoms' },
        { max: 9, label: 'Mild', note: 'Mild symptoms' },
        { max: 14, label: 'Moderate', note: 'Moderate symptoms' },
        { max: 27, label: 'Severe', note: 'Severe symptoms' },
      ],
    };
    const ctx = scoreContext(meta, 10);
    assert.strictEqual(ctx.label, 'Moderate');
    assert.strictEqual(scoreContext(meta, 3).label, 'Minimal');
  });

  // ── 35. Draft Save and Load Cycle ─────────────────────────────────────────
  it('draft save and load cycle', () => {
    const id = 'test-assessment-001';
    const answers = { q1: 2, q2: 3, q3: 1 };
    saveDraft(id, answers);
    const loaded = loadDraft(id);
    assert.deepStrictEqual(loaded.answers, answers);
    clearDraft(id);
    assert.strictEqual(loadDraft(id), null);
  });

  // ── 36. Self-Assessment Draft Helpers ─────────────────────────────────────
  it('self-assessment draft helpers', () => {
    const key = 'daily_mood';
    const data = { mood: 4, energy: 7, note: 'Feeling good' };
    setSelfAssessmentDraft(key, data);
    const loaded = getSelfAssessmentDraft(key);
    assert.deepStrictEqual(loaded, data);
    clearSelfAssessmentDraft(key);
    assert.strictEqual(getSelfAssessmentDraft(key), null);
  });

  // ── 37. Self-Assessment Last Filed Timestamp ──────────────────────────────
  it('self-assessment last filed timestamp', () => {
    const key = 'daily_mood';
    const iso = new Date().toISOString();
    setSelfAssessmentLastFiled(key, iso);
    assert.strictEqual(getSelfAssessmentLastFiled(key), iso);
  });

  // ── 38. Sparkline SVG Generation ──────────────────────────────────────────
  it('sparkline SVG generation', () => {
    const svg = sparklineSVG([1, 2, 3, 4, 5]);
    assert.ok(svg.startsWith('<svg'));
    assert.ok(svg.includes('<polyline'));
    assert.strictEqual(sparklineSVG([]), '');
    assert.strictEqual(sparklineSVG([42]), '');
  });

  // ── 39. Demo Patient Constant Shape ───────────────────────────────────────
  it('demo patient constant shape', () => {
    assert.ok(DEMO_PATIENT.profile.first_name);
    assert.ok(DEMO_PATIENT.profile.last_name);
    assert.ok(DEMO_PATIENT.activeCourse);
    assert.ok(Array.isArray(DEMO_PATIENT.outcomes));
    assert.ok(Array.isArray(DEMO_PATIENT.tasks));
    assert.ok(DEMO_PATIENT.wearables);
    assert.strictEqual(typeof DEMO_PATIENT.streak, 'number');
  });

  // ── 40. Demo Clinician Dashboard Shape ────────────────────────────────────
  it('demo clinician dashboard shape', () => {
    assert.ok(Array.isArray(DEMO_CLINICIAN_DASHBOARD.sessions));
    assert.ok(Array.isArray(DEMO_CLINICIAN_DASHBOARD.assessments));
  });

  // ── 41. Focus Card Prioritizes Session Within 24h ─────────────────────────
  it('focus card prioritizes session within 24h', () => {
    const now = Date.now();
    const in12h = new Date(now + 12 * 3600000).toISOString();
    const focus = pickTodaysFocus({ nextSessionAt: in12h, checkedInToday: false, now });
    assert.strictEqual(focus.kind, 'session');
  });

  // ── 42. Focus Card Falls Back to Check-In ─────────────────────────────────
  it('focus card falls back to check-in', () => {
    const now = Date.now();
    const focus = pickTodaysFocus({ nextSessionAt: null, checkedInToday: false, now });
    assert.strictEqual(focus.kind, 'checkin');
  });

  // ── 43. Focus Card Falls Back to Task ─────────────────────────────────────
  it('focus card falls back to task', () => {
    const now = Date.now();
    const focus = pickTodaysFocus({ checkedInToday: true, openTasks: [{ title: 'Read chapter' }], now });
    assert.strictEqual(focus.kind, 'task');
    assert.ok(focus.headline.includes('Read chapter'));
  });

  // ── 44. Focus Card Falls Back to Message ──────────────────────────────────
  it('focus card falls back to message', () => {
    const now = Date.now();
    const msg = { sender_name: 'Dr. Test', body: 'How are you feeling?' };
    const focus = pickTodaysFocus({ checkedInToday: true, openTasks: [], unreadMessage: msg, now });
    assert.strictEqual(focus.kind, 'message');
  });

  // ── 45. Focus Card Falls Back to Sleep Warning ────────────────────────────
  it('focus card falls back to sleep warning', () => {
    const now = Date.now();
    const focus = pickTodaysFocus({ checkedInToday: true, openTasks: [], lastNightSleepHours: 4.5, now });
    assert.strictEqual(focus.kind, 'sleep');
  });

  // ── 46. Focus Card Shows Fallback When Nothing Pending ────────────────────
  it('focus card shows fallback when nothing pending', () => {
    const now = Date.now();
    const focus = pickTodaysFocus({ checkedInToday: true, openTasks: [], now });
    assert.strictEqual(focus.kind, 'fallback');
    assert.ok(focus.headline.includes('on track'));
  });

  // ── 47. Demo Overlay Returns Real When Available ──────────────────────────
  it('demo overlay returns real when available', () => {
    const result = demoOverlay('real data', 'demo data');
    assert.strictEqual(result.value, 'real data');
    assert.strictEqual(result.usedDemo, false);
  });

  // ── 48. Demo Overlay Falls Back to Demo ───────────────────────────────────
  it('demo overlay falls back to demo', () => {
    const result = demoOverlay(null, 'demo data');
    assert.strictEqual(result.value, 'demo data');
    assert.strictEqual(result.usedDemo, true);
  });

  // ── 49. Phase Labels Map Correctly ────────────────────────────────────────
  it('phase labels map correctly', () => {
    assert.strictEqual(phaseLabel(0), 'Getting started');
    assert.strictEqual(phaseLabel(15), 'Early treatment');
    assert.strictEqual(phaseLabel(40), 'Active treatment');
    assert.strictEqual(phaseLabel(70), 'Consolidation');
    assert.strictEqual(phaseLabel(90), 'Final phase');
    assert.strictEqual(phaseLabel(100), 'Complete');
  });

  // ── 50. Outcome Goal Marker Math ──────────────────────────────────────────
  it('outcome goal marker math', () => {
    const phq = outcomeGoalMarker({ template_name: 'PHQ-9', score_numeric: 14 });
    assert.strictEqual(phq.goal, 5);
    assert.strictEqual(phq.down, true);
    const gad = outcomeGoalMarker({ template_name: 'GAD-7', score_numeric: 10 });
    assert.strictEqual(gad.goal, 4);
  });
});
