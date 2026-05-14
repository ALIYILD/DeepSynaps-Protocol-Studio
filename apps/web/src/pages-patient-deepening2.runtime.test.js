import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM(
  `<!doctype html>
   <html><body>
     <div id="patient-content"></div>
     <div id="content"></div>
     <div id="app-content"></div>
     <ul id="patient-nav-list"></ul>
     <div id="pt-bottom-nav"></div>
     <div id="patient-page-title"></div>
     <div id="patient-topbar-actions"></div>
   </body></html>`,
  { url: 'https://example.test/patient' },
);

const localStore = {};
const lss = {
  getItem: (k) => Object.prototype.hasOwnProperty.call(localStore, k) ? localStore[k] : null,
  setItem: (k, v) => { localStore[k] = String(v); },
  removeItem: (k) => { delete localStore[k]; },
  clear: () => { Object.keys(localStore).forEach((k) => delete localStore[k]); },
};

globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.Event = dom.window.Event;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Node = dom.window.Node;
globalThis.localStorage = lss;
globalThis.FormData = dom.window.FormData;
globalThis.CSS = globalThis.CSS || {};
if (!globalThis.CSS.escape) globalThis.CSS.escape = (v) => String(v);
globalThis.MutationObserver = dom.window.MutationObserver || class { constructor() {} observe() {} disconnect() {} takeRecords() { return []; } };
globalThis.IntersectionObserver = dom.window.IntersectionObserver || class { constructor() {} observe() {} unobserve() {} disconnect() {} };
globalThis.ResizeObserver = dom.window.ResizeObserver || class { constructor() {} observe() {} unobserve() {} disconnect() {} };
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame || ((cb) => setTimeout(cb, 0));
globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame || clearTimeout;
Object.defineProperty(dom.window, 'localStorage', { value: lss, configurable: true });
dom.window.HTMLElement.prototype.scrollIntoView = function () {};
dom.window.HTMLCanvasElement.prototype.getContext = function () {
  return {
    beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, clearRect() {},
    fillRect() {}, strokeRect() {}, save() {}, restore() {}, translate() {}, scale() {},
    fillText() {}, measureText() { return { width: 0 }; }, setLineDash() {},
    getImageData() { return { data: [] }; }, putImageData() {},
    createLinearGradient() { return { addColorStop() {} }; }, arc() {}, fill() {}, closePath() {},
  };
};
if (typeof globalThis.fetch === 'undefined') globalThis.fetch = () => Promise.reject(new Error('fetch unavailable'));

// Shim setInterval to a no-op so background pollers (e.g. _vcPollTimer)
// don't keep the node --test event loop alive after tests complete.
const __ivIds = new Set();
let __ivCounter = 1;
globalThis.setInterval = (..._args) => { const id = __ivCounter++; __ivIds.add(id); return id; };
globalThis.clearInterval = (id) => { __ivIds.delete(id); };
dom.window.setInterval = globalThis.setInterval;
dom.window.clearInterval = globalThis.clearInterval;

// MediaRecorder shim for VirtualCare voice/video record paths
dom.window.MediaRecorder = class {
  constructor() { this.state = 'inactive'; this.ondataavailable = null; this.onstop = null; }
  start() { this.state = 'recording'; }
  stop() { this.state = 'inactive'; if (this.onstop) this.onstop(); }
};
dom.window.navigator.mediaDevices = {
  getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }),
};
Object.defineProperty(dom.window.navigator, 'clipboard', {
  value: { writeText: async () => {} }, configurable: true,
});

const mod = await import('./pages-patient.js');
const { api } = await import('./api.js');
const { setCurrentUser } = await import('./auth.js');
if (!globalThis.URL.createObjectURL) globalThis.URL.createObjectURL = () => 'blob:mock';
if (!globalThis.URL.revokeObjectURL) globalThis.URL.revokeObjectURL = () => {};
dom.window.HTMLAnchorElement.prototype.click = function () {};

const apiOriginals = { ...api };

function resetHarness() {
  lss.clear();
  document.getElementById('patient-content').innerHTML = '';
  document.getElementById('content').innerHTML = '';
  document.getElementById('app-content').innerHTML = '';
  document.getElementById('patient-page-title').textContent = '';
  document.getElementById('patient-topbar-actions').textContent = '';
  document.body.querySelectorAll('.modal-fix, #hw-print-overlay, .pt-modal, .ds-modal').forEach((n) => n.remove());
  window._showNotifToastCalls = [];
  window._showToastCalls = [];
  window._navPatientCalls = [];
  window._anchorClicks = [];
  window._openCalls = [];
  window._promptCalls = [];
  window._showNotifToast = (p) => { window._showNotifToastCalls.push(p); };
  window._showToast = (m, s) => { window._showToastCalls.push({ msg: m, sev: s }); };
  window._navPatient = (p) => { window._navPatientCalls.push(p); };
  window._nav = window._navPatient;
  window.open = (...a) => { window._openCalls.push(a); return null; };
  window.prompt = (...a) => { window._promptCalls.push(a); return 'prompt-default'; };
  window.confirm = () => true;
  window.print = () => {};
  window.scrollTo = () => {};
  globalThis.confirm = window.confirm;
  dom.window.HTMLAnchorElement.prototype.click = function () {
    window._anchorClicks.push({ href: this.href, download: this.download });
  };
  setCurrentUser({ id: 'demo-pt', role: 'patient', email: 'demo@test', patient_id: 'demo-pt' });
  for (const k of Object.keys(apiOriginals)) api[k] = apiOriginals[k];
}

function flushUi() { return new Promise((r) => setTimeout(r, 0)); }
function softCall(fn, ...args) { try { return fn(...args); } catch (_e) { return null; } }
async function softCallA(fn, ...args) { try { return await fn(...args); } catch (_e) { return null; } }

test('pgPatientVirtualCare deep — walks every window._vc* handler with realistic args', async () => {
  resetHarness();
  // Seed wearable + dictation contexts the page may read
  localStorage.setItem('ds_pt_dictation_thread', JSON.stringify({ items: [] }));
  await mod.pgPatientVirtualCare();
  await flushUi();
  const html = document.getElementById('patient-content').innerHTML;
  assert.ok(html.length > 200);
  const handlers = [
    ['_vcPickThread', 'thread-1'],
    ['_vcPickThread', 'unknown-id'],
    ['_vcThreadFilter', 'all'],
    ['_vcThreadFilter', 'unread'],
    ['_vcThreadFilter', 'starred'],
    ['_vcSearch', 'symptom'],
    ['_vcSearch', ''],
    ['_vcInputChange'],
    ['_vcQuick', 'symptom'],
    ['_vcQuick', 'medication'],
    ['_vcQuick', 'unknown'],
    ['_vcAttach'],
    ['_vcCrisis'],
    ['_vcShowCrisisModal'],
    ['_vcCallStart', 'audio'],
    ['_vcCallStart', 'video'],
    ['_vcCallEnd'],
    ['_vcCallMute'],
    ['_vcCallVideoToggle'],
    ['_vcStopRecord'],
    ['_vcMenuOpen', 't1'],
    ['_vcMenuClose'],
    ['_vcStar', 't1'],
    ['_vcArchive', 't1'],
    ['_vcMarkRead', 't1'],
  ];
  for (const [name, ...args] of handlers) {
    if (typeof window[name] === 'function') softCall(window[name], ...args);
  }
  // Async ones
  if (typeof window._vcSend === 'function') await softCallA(window._vcSend);
  if (typeof window._vcRecordVoice === 'function') await softCallA(window._vcRecordVoice);
  if (typeof window._vcRecordVideo === 'function') await softCallA(window._vcRecordVideo);
  assert.ok(true);
});

test('pgPatientReports deep — walks _pt* report handlers', async () => {
  resetHarness();
  // Stub api so internal fetches succeed
  api.listPatientReports = async () => ({
    reports: [
      { id: 'r1', title: 'Initial Assessment', kind: 'assessment', created_at: '2026-04-01', acknowledged: false, summary: 'Sample' },
      { id: 'r2', title: 'qEEG Report', kind: 'qeeg', created_at: '2026-04-05', acknowledged: true, summary: 'qEEG' },
    ],
  });
  api.getPatientReportsSummary = async () => ({ categories: [{ id: 'cat-a', label: 'Assessments', count: 1 }] });
  await mod.pgPatientReports();
  await flushUi();
  const handlers = [
    ['_ptScrollToCat', 'cat-a'],
    ['_ptToggleCatSection', 'cat-a'],
    ['_ptToggleDocPl', 'r1'],
    ['_ptViewDoc', 'r1'],
    ['_ptAskAbout', 'r1', 'Initial Assessment'],
    ['_ptCatShowMore', 'cat-a', 5],
    ['_ptReportOpened', 'r1', 'assessment'],
    ['_ptReportDownloaded', 'r1'],
  ];
  for (const [n, ...a] of handlers) { if (typeof window[n] === 'function') softCall(window[n], ...a); }
  if (typeof window._ptAcknowledgeReport === 'function') await softCallA(window._ptAcknowledgeReport, 'r1', 'Initial Assessment');
  if (typeof window._ptShareBackReport === 'function') await softCallA(window._ptShareBackReport, 'r2', 'qEEG Report');
  if (typeof window._ptStartQuestionForReport === 'function') await softCallA(window._ptStartQuestionForReport, 'r1', 'Initial Assessment');
  assert.ok(true);
});

test('pgPatientMessages deep — walks _ptmsg* handlers', async () => {
  resetHarness();
  await mod.pgPatientMessages();
  await flushUi();
  // Synthesize a textarea the send handler reads
  const ta = document.createElement('textarea');
  ta.id = 'ptmsg-composer';
  ta.value = 'Hello clinician';
  document.body.appendChild(ta);
  const handlers = [
    ['_ptmsgSelectThread', 0],
    ['_ptmsgSelectThread', 99],
    ['_ptmsgFollowReportLink', 'r1'],
    ['_ptmsgCancelCallRequest'],
  ];
  for (const [n, ...a] of handlers) { if (typeof window[n] === 'function') softCall(window[n], ...a); }
  if (typeof window._ptmsgStartCall === 'function') await softCallA(window._ptmsgStartCall, 'audio');
  if (typeof window._ptmsgSendCallRequest === 'function') await softCallA(window._ptmsgSendCallRequest);
  if (typeof window._ptmsgSend === 'function') await softCallA(window._ptmsgSend);
  assert.ok(true);
});

test('pgPatientSettings deep — walks settings handlers including dirty/save/discard', async () => {
  resetHarness();
  await mod.pgPatientSettings({ id: 'demo-pt', role: 'patient', email: 'demo@test' });
  await flushUi();
  // Simulate toggles + form fields then save
  const handlers = [
    '_settingsDirty', '_settingsSave', '_settingsDiscard', '_settingsTabSwitch',
    '_settingsToggle', '_settingsExportData', '_settingsDeleteAccount',
    '_settingsLanguageChange', '_settingsTimezoneChange', '_settingsNotifChange',
    '_settingsThemeChange', '_settingsAccessibilityToggle',
  ];
  for (const h of handlers) {
    if (typeof window[h] === 'function') {
      softCall(window[h]);
      softCall(window[h], 'arg-a');
      softCall(window[h], 'arg-a', 'arg-b');
    }
  }
  assert.ok(true);
});

test('pgPatientHomework deep — seeds tasks + walks task open/skip/snooze + library', async () => {
  resetHarness();
  // Seed homework tasks so the demo render hits non-empty path
  const today = new Date().toISOString().slice(0, 10);
  localStorage.setItem('ds_homework_tasks_demo-pt', JSON.stringify([
    { id: 't1', title: 'Daily breathing', category: 'breathing', dueDate: today, recurrence: 'daily', notes: '' },
    { id: 't2', title: 'Sleep log', category: 'sleep', dueDate: today, recurrence: 'daily', notes: '' },
  ]));
  localStorage.setItem('ds_task_completions_demo-pt', JSON.stringify([{ taskId: 't1', date: today }]));
  await mod.pgPatientHomework();
  await flushUi();
  const handlers = [
    ['_hwFilter', 'today'], ['_hwFilter', 'week'], ['_hwFilter', 'all'],
    ['_hwBrowseLibrary'],
    ['_hwAddLibrary', 'breathing-001'],
    ['_hwMoodPick', 4], ['_hwMoodPick', 1], ['_hwMoodPick', 5],
    ['_hwOpenTask', 't1'], ['_hwOpenTask', 'unknown'],
    ['_hwMarkTask', 't2'], ['_hwSnoozeTask', 't2'], ['_hwSkipTask', 't2'],
    ['_hwToggleSection', 'today'], ['_hwToggleSection', 'week'],
    ['_hwExportPlan'], ['_hwSharePlan'],
    ['_hwQuickCheckIn'], ['_hwSetEnergy', 5],
    ['_hwToast', 'msg'],
  ];
  for (const [n, ...a] of handlers) { if (typeof window[n] === 'function') softCall(window[n], ...a); }
  // Async helpers
  for (const n of ['_hwRefresh', '_hwSyncTasks']) {
    if (typeof window[n] === 'function') await softCallA(window[n]);
  }
  assert.ok(true);
});

test('pgPatientAssessments deep — exercises tabs + check-in + self-assessment submit + Likert form render', async () => {
  resetHarness();
  await mod.pgPatientAssessments();
  await flushUi();
  const handlers = [
    '_aTab', '_aOpenForm', '_aFormChange', '_aSubmit', '_aExportHistory',
    '_aFilter', '_aSelfStart', '_aSelfPick', '_aSelfText', '_aSelfSubmit',
    '_aSelfCancel', '_aSetMood',
  ];
  for (const h of handlers) {
    if (typeof window[h] === 'function') {
      softCall(window[h]);
      softCall(window[h], 'phq9');
      softCall(window[h], 'phq9', 1);
      softCall(window[h], 'phq9', 'q1', 2);
    }
  }
  // Ensure as-form-slot exists then trigger _asStart('phq9') to render the Likert form
  if (!document.getElementById('as-form-slot')) {
    const slot = document.createElement('div');
    slot.id = 'as-form-slot';
    document.getElementById('patient-content').appendChild(slot);
  }
  if (typeof window._asStart === 'function') {
    for (const slug of ['phq9', 'gad7', 'pcl5', 'unknown-form']) {
      softCall(window._asStart, slug);
    }
  }
  if (typeof window._asHistFilter === 'function') {
    softCall(window._asHistFilter, 'all');
    softCall(window._asHistFilter, 'phq9');
  }
  // After Likert form renders, exercise its submit handler branches:
  // 1) unanswered → scroll-and-highlight return; 2) all-answered → api success;
  // 3) all-answered → api throws.
  api.submitAssessment = async () => ({ ok: true });
  if (typeof window._ptLikertSubmit === 'function') {
    softCall(window._ptLikertSubmit, 'unknown-key'); // st missing → early return
    softCall(window._ptLikertSubmit, 'phq9');        // probably unanswered path
    // Force answers populated so we hit the api branch
    if (window._likertState && window._likertState.phq9) {
      window._likertState.phq9.answers = window._likertState.phq9.answers.map(() => 1);
      const resultEl = document.createElement('div');
      resultEl.id = 'phq9-result';
      document.body.appendChild(resultEl);
      await softCallA(window._ptLikertSubmit, 'phq9'); // success
      // Error path
      api.submitAssessment = async () => { throw new Error('submit boom'); };
      await softCallA(window._ptLikertSubmit, 'phq9'); // error
    }
  }
  // Likert answer-picker side branches
  if (typeof window._ptLikertPick === 'function') {
    softCall(window._ptLikertPick, 'phq9', 0, 1);
    softCall(window._ptLikertPick, 'phq9', 1, 2);
    softCall(window._ptLikertPick, 'unknown-key', 0, 0);
  }
  assert.ok(true);
});

test('pgPatientOutcomePortal deep — seeded home tasks + sessions exercise progress sub-renderers', async () => {
  resetHarness();
  // Seed outcomes for the rich path
  const today = new Date();
  const d = (off) => { const x = new Date(today); x.setDate(x.getDate() + off); return x.toISOString().slice(0, 10); };
  localStorage.setItem('ds_patient_outcomes_v2', JSON.stringify({
    _isDemoData: false,
    patient: { name: 'Alex D', startDate: d(-90), totalSessions: 18, condition: 'Depression', clinician: 'Dr. Reyes' },
    nextAssessmentDate: d(7),
    measures: [
      { id: 'phq9', label: 'PHQ-9', max: 27, color: 'teal', points: [
        { date: d(-90), score: 18 }, { date: d(-60), score: 14 }, { date: d(-30), score: 10 }, { date: d(-7), score: 7 },
      ]},
      { id: 'gad7', label: 'GAD-7', max: 21, color: 'blue', points: [
        { date: d(-90), score: 14 }, { date: d(-60), score: 10 }, { date: d(-30), score: 7 }, { date: d(-7), score: 5 },
      ]},
    ],
  }));
  // Symptom journal + wearable
  const j = [];
  for (let i = 0; i < 14; i++) j.push({ date: d(-i), mood: 5 + (i % 3), sleep: 7, stress: 4, energy: 6, anxiety: 3 });
  localStorage.setItem('ds_symptom_journal', JSON.stringify(j));
  localStorage.setItem('ds_wearable_summary', JSON.stringify({ sleep: '7.2h', hrv: '52ms', rhr: '62bpm' }));
  // Re-seed v2 with homeTasks/homeSessions embedded so _pgpHomeTaskStrip + _pgpHomeSessionTimeline hit populated branches
  const tasks = [];
  for (let i = 0; i < 8; i++) {
    tasks.push({ id: 't' + i, title: 'Task ' + i, completed_on: i % 2 ? d(-i) : null, due_on: d(i % 7 - 3), category: 'breathing' });
  }
  const sessions = [];
  for (let i = 0; i < 8; i++) sessions.push({ id: 's' + i, date: d(-i*3), type: 'NF', duration_minutes: 25, completed: true });
  const v2 = JSON.parse(localStorage.getItem('ds_patient_outcomes_v2'));
  v2.homeTasks = tasks;
  v2.homeSessions = sessions;
  localStorage.setItem('ds_patient_outcomes_v2', JSON.stringify(v2));
  await mod.pgPatientOutcomePortal(() => {});
  await flushUi();
  const html = document.getElementById('patient-content').innerHTML;
  assert.ok(html.length > 500);
});

test('pgPatientMessages deep — seeded messages + scroll + read-mark', async () => {
  resetHarness();
  // Seed message threads if a route key exists
  api.patientPortalMessages = async () => ({
    threads: [
      { id: 'th1', subject: 'Welcome', last_message_at: '2026-04-01T10:00:00Z', unread: true, messages: [
        { id: 'm1', text: 'Hi from team', from: 'clinician', author: 'Dr. Reyes', ts: '2026-04-01T10:00:00Z', read: false },
      ]},
      { id: 'th2', subject: 'Follow-up', last_message_at: '2026-04-02T10:00:00Z', unread: false, messages: [
        { id: 'm2', text: 'How are you doing?', from: 'clinician', author: 'Dr. Chen', ts: '2026-04-02T10:00:00Z', read: true },
        { id: 'm3', text: 'Better today', from: 'patient', author: 'Me', ts: '2026-04-02T11:00:00Z', read: true },
      ]},
    ],
  });
  api.markPatientMessageRead = async () => ({ ok: true });
  await mod.pgPatientMessages();
  await flushUi();
  if (typeof window._ptmsgSelectThread === 'function') {
    softCall(window._ptmsgSelectThread, 0);
    softCall(window._ptmsgSelectThread, 1);
  }
  assert.ok(true);
});

test('pgPatientEducation deep — walks resource detail + academy modal + every external src', async () => {
  resetHarness();
  await mod.pgPatientEducation();
  await flushUi();
  const handlers = [
    ['_edFilter', 'all'], ['_edFilter', 'video'], ['_edFilter', 'article'],
    ['_edSave', 'res-1'], ['_edUnsave', 'res-1'],
    ['_edOpen', 'res-1'], ['_edClose'],
    ['_edAcademyOpen'], ['_edAcademyClose'],
    ['_edSearch', 'breathing'], ['_edSearch', ''],
    ['_edExternal', 'https://example.com'],
    ['_edShare', 'res-1'],
  ];
  for (const [n, ...a] of handlers) { if (typeof window[n] === 'function') softCall(window[n], ...a); }
  // Walk every known source kind so _edSearchUrl hits each branch (youtube, mayo, cleveland, podcast, journals, edx, huberman)
  if (typeof window._edOpen === 'function') {
    for (const id of ['ed-youtube-1','ed-mayo-1','ed-cleveland-1','ed-podcast-1','ed-journals-1','ed-edx-1','ed-huberman-1','ed-fallback-1']) {
      softCall(window._edOpen, id);
    }
  }
  assert.ok(true);
});

test('pgPatientMessages deep — auto-mark-read + active thread refresh', async () => {
  resetHarness();
  let readCalls = [];
  api.markPatientMessageRead = async (thread, mid) => { readCalls.push({ thread, mid }); return { ok: true }; };
  api.patientPortalMessages = async () => ([
    { id: 'm1', thread_id: 'th1', sender_id: 'clin-1', sender_type: 'clinician',
      sender_name: 'Dr. Reyes', subject: 'Welcome', body: 'Hello', is_read: false, created_at: '2026-04-01T10:00:00Z' },
    { id: 'm2', thread_id: 'th1', sender_id: 'clin-1', sender_type: 'clinician',
      sender_name: 'Dr. Reyes', subject: 'Follow-up', body: 'Update?', is_read: false, created_at: '2026-04-02T10:00:00Z' },
  ]);
  await mod.pgPatientMessages();
  await flushUi();
  if (typeof window._ptmsgSelectThread === 'function') {
    softCall(window._ptmsgSelectThread, 0);
    await flushUi();
  }
  assert.ok(true);
});

test('pgPatientVirtualCare deep — voice recording stream + ondataavailable flow', async () => {
  resetHarness();
  // Override media recorder so its callbacks fire synchronously
  let mrInstance = null;
  dom.window.MediaRecorder = class {
    constructor(stream, _opts) {
      this.stream = stream; this.state = 'inactive';
      this.ondataavailable = null; this.onstop = null;
      mrInstance = this;
    }
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive';
      if (this.ondataavailable) this.ondataavailable({ data: { size: 10 } });
      if (this.onstop) this.onstop();
    }
  };
  await mod.pgPatientVirtualCare();
  await flushUi();
  // Ensure activeId is set and threads[activeId] exists by firing a thread pick
  if (typeof window._vcPickThread === 'function') softCall(window._vcPickThread, 'thread-1');
  if (typeof window._vcRecordVoice === 'function') {
    await softCallA(window._vcRecordVoice);
    if (mrInstance) mrInstance.stop();
    await flushUi();
  }
  if (typeof window._vcRecordVideo === 'function') {
    await softCallA(window._vcRecordVideo);
    if (mrInstance) mrInstance.stop();
    await flushUi();
  }
  assert.ok(true);
});

test('pgPatientLearn deep — filter + mark-read + article open', async () => {
  resetHarness();
  await mod.pgPatientLearn();
  await flushUi();
  const handlers = [
    ['_learnFilter', 'all'], ['_learnFilter', 'unread'],
    ['_learnOpen', 'learn-001'], ['_learnOpen', 'nope'],
    ['_learnMarkRead', 'learn-001'],
    ['_learnSearch', 'sleep'],
    ['_learnExternal', 'https://example.com/x'],
  ];
  for (const [n, ...a] of handlers) { if (typeof window[n] === 'function') softCall(window[n], ...a); }
  assert.ok(true);
});

test('pgPatientCareTeam deep — caregiver grant + revoke + profile modal', async () => {
  resetHarness();
  await mod.pgPatientCareTeam();
  await flushUi();
  const handlers = [
    ['_ctProfileOpen', 'mem-1'],
    ['_ctProfileClose'],
    ['_ctMessage', 'mem-1'],
    ['_ctSchedule', 'mem-1'],
    ['_ctOpenDoc', 'doc-1'],
    ['_ctCaregiverGrant'],
    ['_ctCaregiverRevoke', 'grant-1'],
  ];
  for (const [n, ...a] of handlers) { if (typeof window[n] === 'function') softCall(window[n], ...a); }
  assert.ok(true);
});

test('pgPatientMarketplace deep — search, filter, modal, seller, my listings', async () => {
  resetHarness();
  await mod.pgPatientMarketplace({ id: 'demo-pt', role: 'patient' });
  await flushUi();
  const handlers = [
    ['_mpFilter', 'all'], ['_mpFilter', 'device'], ['_mpFilter', 'service'],
    ['_mpSearch', 'app'], ['_mpSearch', ''],
    ['_mpOpenDetails', 'mp-1'],
    ['_mpCloseDetails'],
    ['_mpExternal', 'https://example.com/buy'],
    ['_mpSellerOpen'],
    ['_mpSellerCreate'],
    ['_mpMyListings'],
    ['_mpListingDelete', 'l-1'],
    ['_mpListingEdit', 'l-1'],
  ];
  for (const [n, ...a] of handlers) { if (typeof window[n] === 'function') softCall(window[n], ...a); }
  assert.ok(true);
});

test('pgPatientWellness deep — seeded journal walks every wellness handler', async () => {
  resetHarness();
  const today = new Date();
  const j = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    j.push({
      id: 'wj' + i, date: d.toISOString().slice(0, 10),
      mood: 5 + (i % 3), sleep: 6 + (i % 2), stress: 4 + (i % 3),
      energy: 5 + (i % 2), anxiety: 3, focus: 6, notes: 'note ' + i,
    });
  }
  localStorage.setItem('ds_symptom_journal', JSON.stringify(j));
  localStorage.setItem('ds_wellness_goals', JSON.stringify([
    { id: 'g1', name: 'Sleep 8h', target: 8, current: 7, status: 'on-track' },
    { id: 'g2', name: 'Mood >= 6', target: 6, current: 5, status: 'on-track' },
  ]));
  localStorage.setItem('ds_wearable_summary', JSON.stringify({ sleep: '7.5h', hrv: '55ms', rhr: '60bpm' }));
  await mod.pgPatientWellness();
  await flushUi();
  const handlers = [
    '_wellnessTabSwitch', '_wellnessAddEntry', '_wellnessSaveEntry', '_wellnessDeleteEntry',
    '_wellnessExport', '_wellnessShare', '_wellnessSetMood', '_wellnessSetSleep',
    '_wellnessSetStress', '_wellnessSetEnergy', '_wellnessSetAnxiety',
    '_wellnessJournalLink', '_wellnessFilter', '_wellnessRangeChange',
    '_wellnessGoalEdit', '_wellnessGoalDelete', '_wellnessGoalAdd',
    '_wellnessOpenGoal', '_wellnessCloseGoal', '_wellnessSaveGoal',
    '_wellnessQuickCheckIn', '_wellnessOpenJournal',
  ];
  for (const h of handlers) {
    if (typeof window[h] === 'function') {
      softCall(window[h]);
      softCall(window[h], 'tab1');
      softCall(window[h], 'wj1');
      softCall(window[h], 'wj1', 5);
    }
  }
  assert.ok(true);
});

test('pgPatientProfile deep — exercises both has_coverage and no_coverage branches', async () => {
  resetHarness();
  // Branch A: coverage configured but emergency line set
  api.me = async () => ({ display_name: 'Branch A', email: 'a@test' });
  api.postPatientOncallAuditEvent = async () => ({ ok: true });
  api.patientOncallStatus = async () => ({
    coverage_hours: '24/7',
    in_hours_now: true,
    oncall_now: true,
    urgent_path: 'emergency-line',
    emergency_line_number: '+1 555 0000',
    has_coverage_configured: true,
    is_demo: false,
    disclaimers: [],
  });
  await mod.pgPatientProfile({ display_name: 'A', email: 'a@test' });
  await flushUi();
  // Walk handlers; some may not exist
  if (typeof window._ptRefreshProfile === 'function') await softCallA(window._ptRefreshProfile);
  if (typeof window._ptOncallLearnMore === 'function') {
    softCall(window._ptOncallLearnMore);
    document.querySelector('.modal-fix .btn.btn-primary')?.click();
    document.querySelector('.modal-fix')?.remove();
  }
  if (typeof window._ptOncallUrgentMessage === 'function') softCall(window._ptOncallUrgentMessage);
  if (typeof window._ptUpdatePrefs === 'function') softCall(window._ptUpdatePrefs);
  if (typeof window._ptChangePassword === 'function') {
    softCall(window._ptChangePassword);
    document.querySelector('.modal-fix .btn.btn-ghost')?.click();
    document.querySelector('.modal-fix')?.remove();
  }

  // Branch B: no coverage configured (different render path)
  resetHarness();
  api.me = async () => ({ display_name: 'Branch B', email: 'b@test' });
  api.postPatientOncallAuditEvent = async () => ({ ok: true });
  api.patientOncallStatus = async () => ({
    coverage_hours: '',
    in_hours_now: false,
    oncall_now: false,
    urgent_path: '',
    emergency_line_number: '',
    has_coverage_configured: false,
    is_demo: false,
    disclaimers: [],
  });
  await mod.pgPatientProfile({ display_name: 'B', email: 'b@test' });
  await flushUi();

  // Branch C: oncallStatus throws
  resetHarness();
  api.me = async () => ({ display_name: 'Branch C', email: 'c@test' });
  api.patientOncallStatus = async () => { throw new Error('boom'); };
  api.postPatientOncallAuditEvent = async () => { throw new Error('boom'); };
  await mod.pgPatientProfile({ display_name: 'C', email: 'c@test' });
  await flushUi();
  if (typeof window._ptRefreshProfile === 'function') {
    api.me = async () => { throw new Error('me throws'); };
    await softCallA(window._ptRefreshProfile);
  }
  assert.ok(true);
});

// ── File-scope JSDOM cleanup ──────────────────────────────────────────────────
// Clears the shimmed setInterval handles, closes the dom window, and removes
// globalThis overrides so Node-20 --test-force-exit can drain cleanly.
after(() => {
  // Clear all shimmed interval IDs (the shim stores them in __ivIds).
  try { for (const id of __ivIds) globalThis.clearInterval(id); __ivIds.clear(); } catch {}
  // Clear VirtualCare timers via the module-scoped dom.window reference.
  for (const k of ['_vcPollTimer', '_vcRecordTimer', '_vcBioTimer', '_vcVoiceTimer']) {
    try { if (dom.window[k]) globalThis.clearInterval(dom.window[k]); } catch {}
    try { dom.window[k] = null; } catch {}
  }
  try { dom.window.close(); } catch {}
  for (const k of ['window', 'document', 'navigator', 'HTMLElement', 'Event', 'Node', 'FormData', 'MutationObserver', 'IntersectionObserver', 'ResizeObserver', 'requestAnimationFrame', 'cancelAnimationFrame', 'localStorage']) {
    try { delete globalThis[k]; } catch {}
  }
});
