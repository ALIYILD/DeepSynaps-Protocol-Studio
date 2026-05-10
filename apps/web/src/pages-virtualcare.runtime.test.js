import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM(
  `<!doctype html><html><body><div id="main-content"></div><div id="content"></div></body></html>`,
  { url: 'https://example.test/' },
);

const store = {};
const storage = {
  getItem(key) {
    return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
  },
  setItem(key, value) {
    store[key] = String(value);
  },
  removeItem(key) {
    delete store[key];
  },
  clear() {
    for (const key of Object.keys(store)) delete store[key];
  },
};

globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = storage;
globalThis.sessionStorage = storage;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Node = dom.window.Node;
globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);
globalThis.cancelAnimationFrame = clearTimeout;
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  writable: true,
  value: dom.window.navigator,
});
globalThis.SpeechRecognition = undefined;
globalThis.webkitSpeechRecognition = undefined;
globalThis.fetch = async () => ({ ok: true, json: async () => ({ items: [], summary: { totalPapers: 0 }, paperCount: 0, conditionCount: 0, coverageRows: [], safetySignals: [], templates: [] }) });

window.requestAnimationFrame = globalThis.requestAnimationFrame;
window.cancelAnimationFrame = globalThis.cancelAnimationFrame;
window.openPatient = () => {};
window.confirm = () => true;
window._navCalls = [];
window._nav = (page) => {
  window._navCalls.push(page);
};
window._showNotifToastCalls = [];
window._showNotifToast = (payload) => {
  window._showNotifToastCalls.push(payload);
};
window.print = () => {};

if (typeof dom.window.HTMLElement.prototype.scrollIntoView !== 'function') {
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
}

const { api } = await import('./api.js');
const mod = await import('./pages-virtualcare.js');

const original = {
  me: api.me,
  listSessions: api.listSessions,
  listPatients: api.listPatients,
  getPatientsCohortSummary: api.getPatientsCohortSummary,
  aggregateOutcomes: api.aggregateOutcomes,
  auditTrail: api.auditTrail,
  getClinicAlertSummary: api.getClinicAlertSummary,
  loadResearchBundleOverview: null,
  listCallRequests: api.listCallRequests,
  listClinicianNotes: api.listClinicianNotes,
  listMediaQueue: api.listMediaQueue,
  sendPatientMessage: api.sendPatientMessage,
  getCurrentSession: api.getCurrentSession,
  getPatient: api.getPatient,
  listSessionEvents: api.listSessionEvents,
  getConsentRecords: api.getConsentRecords,
  getSessionTelemetry: api.getSessionTelemetry,
  startVideoConsult: api.startVideoConsult,
  endVideoConsult: api.endVideoConsult,
  getPatientWearableSummary: api.getPatientWearableSummary,
  chatAgent: api.chatAgent,
  createClinicianNote: api.createClinicianNote,
  approveClinicianDraft: api.approveClinicianDraft,
  virtualCareGetAnalysis: api.virtualCareGetAnalysis,
};

function resetHarness() {
  storage.clear();
  document.getElementById('main-content').innerHTML = '';
  document.getElementById('content').innerHTML = '';
  window._navCalls = [];
  window._showNotifToastCalls = [];
  window._selectedPatientId = null;
  window._profilePatientId = null;
  window._vcUnifiedDefaultTab = null;
  window._lsSessionSeed = null;
}

function restoreApi() {
  for (const [key, value] of Object.entries(original)) {
    if (value !== null) api[key] = value;
  }
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test.beforeEach(() => {
  resetHarness();
  restoreApi();
});

test('pgVirtualCare renders dashboard, switches to messaging, and sends a message', async () => {
  api.me = async () => ({ display_name: 'Dr Demo' });
  api.listPatients = async () => ({
    items: [
      { id: 'p001', first_name: 'Emma', last_name: 'Larson', primary_condition: 'MDD', primary_modality: 'tDCS' },
      { id: 'p002', first_name: 'James', last_name: 'Okafor', primary_condition: 'GAD', primary_modality: 'rTMS' },
    ],
  });
  api.listSessions = async () => ({
    items: [
      { id: 's1', patient_id: 'p001', patient_name: 'Emma Larson', appointment_type: 'consultation', modality: 'tDCS', session_number: 12, total_sessions: 20 },
      { id: 's2', patient_id: 'p002', patient_name: 'James Okafor', appointment_type: 'phone', modality: 'voice', session_number: 4, total_sessions: 10 },
    ],
  });
  api.getPatientsCohortSummary = async () => ({ total: 2 });
  api.aggregateOutcomes = async () => ({ items: [] });
  api.auditTrail = async () => ({ items: [] });
  api.getClinicAlertSummary = async () => ({ alerts: [] });
  api.listCallRequests = async () => ([{ id: 'cr-1', patient_id: 'p001', patient_name: 'Emma Larson', urgency: 'routine', type: 'video', modality: 'tDCS', purpose: 'Check-in' }]);
  api.listClinicianNotes = async () => ([{ id: 'n1', patient_id: 'p001', note_type: 'text', status: 'draft', created_at: '2026-05-10T10:00:00Z' }]);
  api.listMediaQueue = async () => ([{ id: 'mq1', patient_id: 'p002', patient_name: 'James Okafor', media_type: 'video', created_at: '2026-05-10T10:00:00Z', flagged_urgent: false }]);
  api.sendPatientMessage = async () => true;
  api.loadResearchBundleOverview = async () => ({ summary: { totalPapers: 3 }, paperCount: 3, conditionCount: 2, coverageRows: [], safetySignals: [], templates: [] });

  let topbarTitle = '';
  await mod.pgVirtualCare((title) => { topbarTitle = title; }, window._nav);
  await tick();
  await tick();

  assert.match(topbarTitle, /^Virtual Care/);
  assert.match(document.getElementById('main-content').innerHTML, /Dashboard/);
  assert.match(document.getElementById('main-content').innerHTML, /Emma Larson/);

  await window._vcSwitchTab('messaging');
  await tick();
  await tick();
  assert.match(document.getElementById('main-content').innerHTML, /Communications/);
  assert.match(document.getElementById('main-content').innerHTML, /New Message/);

  await window._vcSelectThread('p001');
  await tick();
  window._vcCompose();
  await tick();
  await tick();
  const input = document.getElementById('vc-msg-input');
  input.value = 'Please review tomorrow follow-up.';
  await window._vcSendMsg('p001');
  await tick();
  assert.equal(window._showNotifToastCalls.at(-1).title, 'Sent');
  assert.match(document.getElementById('main-content').innerHTML, /Please review tomorrow follow-up/);
});

test('pgLiveSession renders telehealth session, starts video, and saves notes locally', async () => {
  api.getCurrentSession = async () => ({
    id: 'sess-1',
    patient_id: 'p1',
    patient_name: 'Alice Brown',
    session_type: 'consultation',
    modality: 'telehealth',
    duration_min: 30,
    started_at: '2026-05-10T10:00:00Z',
    status: 'scheduled',
  });
  api.getPatient = async () => ({
    id: 'p1',
    display_name: 'Alice Brown',
    initials: 'AB',
    condition: 'MDD',
    age: 33,
    sex: 'F',
  });
  api.listSessionEvents = async () => ({ items: [{ created_at: '2026-05-10T10:00:00Z', type: 'INFO', note: 'Session opened' }] });
  api.getConsentRecords = async () => ({ items: [{ consent_type: 'Telehealth', status: 'active', title: 'Telehealth consent' }] });
  api.getSessionTelemetry = async () => ({ impedance_kohm: 4.8, is_demo: false });
  api.startVideoConsult = async () => ({ room_name: 'clinic-room-1' });
  api.endVideoConsult = async () => ({ ok: true });
  api.chatAgent = async () => ({ reply: 'Summary ready.' });
  api.createClinicianNote = async () => ({ note_id: 'note-1', draft_id: 'draft-1', draft: { session_note: 'SOAP draft' } });
  api.approveClinicianDraft = async () => ({ ok: true });
  api.getPatientWearableSummary = async () => ([{ rhr_bpm: 62, hrv_ms: 41, spo2_pct: 98, stress_score: 30 }]);
  api.virtualCareGetAnalysis = async () => ({ voice_summary: { avg_stress: 32, sentiment_distribution: { neutral: 1 } }, video_summary: { avg_engagement: 71, expression_distribution: { neutral: 1 } }, session: { ai_summary: 'AI summary.' } });

  let topbarTitle = '';
  await mod.pgLiveSession((title) => { topbarTitle = title; }, window._nav);
  await tick();
  assert.match(document.getElementById('main-content').innerHTML, /Clinic-managed video room/);
  assert.match(document.getElementById('main-content').innerHTML, /Start video/);

  await window._lsStartVideo();
  await tick();
  assert.match(document.getElementById('main-content').innerHTML, /Preview Active|End call/);

  const noteText = document.getElementById('ls-session-notes');
  assert.ok(noteText);
  noteText.value = 'Clinical note content';
  await window._lsSaveNotes();
  assert.ok(storage.getItem('ds_vc_ls_notes_sess-1'));

  await window._lsEndVideo();
  await tick();
  window._lsEndSession();
  await tick();
});
