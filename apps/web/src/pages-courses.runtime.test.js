import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM(
  `<!doctype html>
   <html><body>
     <div id="content"></div>
     <div id="page-content"></div>
     <div id="topbar-title"></div>
     <div id="topbar-actions"></div>
   </body></html>`,
  { url: 'https://example.test/courses' },
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
Object.defineProperty(dom.window, 'localStorage', { value: localStorageShim, configurable: true });
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });

let lastDownload = null;
globalThis.URL.createObjectURL = () => 'blob:mock-runtime';
globalThis.URL.revokeObjectURL = () => {};
dom.window.HTMLAnchorElement.prototype.click = function click() {
  lastDownload = { href: this.href, download: this.download };
};

const clipboardWrites = [];
globalThis.navigator.clipboard = {
  writeText: async (value) => { clipboardWrites.push(value); },
};

const mod = await import('./pages-courses.js');
const { api } = await import('./api.js');

const flush = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
};

function resetHarness() {
  localStorageShim.clear();
  document.getElementById('content').innerHTML = '';
  document.getElementById('page-content').innerHTML = '';
  document.getElementById('topbar-title').textContent = '';
  document.getElementById('topbar-actions').textContent = '';
  window._notesSelectedNoteKey = null;
  window._qocOnSave = null;
  window._showNotifToastCalls = [];
  window._navCalls = [];
  window._ccrRedrawCount = 0;
  window._showNotifToast = (payload) => { window._showNotifToastCalls.push(payload); };
  window._nav = (page) => { window._navCalls.push(page); };
  window._ccrRedrawCharts = () => { window._ccrRedrawCount += 1; };
  clipboardWrites.length = 0;
  lastDownload = null;
  globalThis.prompt = () => '';
  window.prompt = globalThis.prompt;
}

test('pgClinicalNotes executes note creation, templating, save, flag, print, and filter flows', async () => {
  resetHarness();

  const originals = {
    listCourses: api.listCourses,
  };

  const openedWindows = [];
  window.open = () => {
    const opened = {
      printed: false,
      html: '',
      document: {
        write(markup) { opened.html += markup; },
        close() {},
      },
      print() { opened.printed = true; },
    };
    openedWindows.push(opened);
    return opened;
  };

  localStorage.setItem('ds_soap_notes', JSON.stringify({
    'course-1': {
      'sess-1': {
        subjective: 'Existing subjective',
        objective: 'Existing objective',
        assessment: 'Existing assessment',
        plan: 'Existing plan',
        adverse: '',
        clinician: 'Dr Existing',
        updated_at: '2026-05-10T10:00:00Z',
        flagged: false,
      },
    },
  }));

  api.listCourses = async () => ({
    items: [
      { id: 'course-1', title: 'Course Alpha', condition_slug: 'depression' },
      { id: 'course-2', title: 'Course Beta', condition_slug: 'anxiety' },
    ],
  });

  globalThis.prompt = () => 'course-2';
  window.prompt = globalThis.prompt;

  try {
    await mod.pgClinicalNotes(() => {});
    assert.match(document.getElementById('content').innerHTML, /Course Alpha/);

    document.getElementById('notes-search').value = 'missing';
    window._filterNotes('missing');
    assert.equal(document.querySelector('.note-list-item').style.display, 'none');
    window._filterNotes('existing');
    assert.equal(document.querySelector('.note-list-item').style.display, '');

    window._newSoapNote();
    await flush();
    assert.match(document.getElementById('content').innerHTML, /Course Beta|Course course-2|Select a note/);
    assert.match(JSON.stringify(JSON.parse(localStorage.getItem('ds_soap_notes'))), /manual-/);

    const notes = JSON.parse(localStorage.getItem('ds_soap_notes'));
    const newSessionId = Object.keys(notes['course-2']).find((key) => key.startsWith('manual-'));
    assert.ok(newSessionId);

    window._selectNote(`course-2:${newSessionId}`);
    await flush();
    document.getElementById('soap-subjective').value = '';
    document.getElementById('soap-objective').value = '';
    document.getElementById('soap-assessment').value = '';
    document.getElementById('soap-plan').value = '';
    window._useNoteTemplate('course-2', newSessionId);
    assert.notEqual(document.getElementById('soap-subjective').value, '');

    document.getElementById('soap-plan').value = '';
    window._fillTemplate('plan', 'course-2', newSessionId);
    assert.notEqual(document.getElementById('soap-plan').value, '');

    document.getElementById('soap-adverse').value = 'Mild headache';
    document.getElementById('soap-clinician').value = 'Dr Runtime';
    window._saveSoapNote('course-2', newSessionId);
    assert.equal(window._showNotifToastCalls.at(-1).title, 'Note Saved');

    const savedNotes = JSON.parse(localStorage.getItem('ds_soap_notes'));
    assert.equal(savedNotes['course-2'][newSessionId].clinician, 'Dr Runtime');
    assert.equal(savedNotes['course-2'][newSessionId].adverse, 'Mild headache');

    window._flagNote('course-2', newSessionId);
    const flaggedNotes = JSON.parse(localStorage.getItem('ds_soap_notes'));
    assert.equal(flaggedNotes['course-2'][newSessionId].flagged, true);

    window._printNote('course-2', newSessionId);
    assert.equal(openedWindows.at(-1).printed, true);
    assert.match(openedWindows.at(-1).html, /Clinical SOAP Note/);
    assert.match(openedWindows.at(-1).html, /Dr Runtime/);
  } finally {
    Object.assign(api, originals);
  }
});

test('quick outcome capture validates, falls back locally, and saves through backend', async () => {
  resetHarness();

  const originals = {
    getCourse: api.getCourse,
    recordOutcome: api.recordOutcome,
  };

  try {
    mod.openQuickOutcomeCapture('course-9', 'session-9', 'Mina Vale');
    assert.match(document.body.innerHTML, /Record Outcome/);
    assert.match(document.body.innerHTML, /Mina Vale/);

    window._qocUpdateMax();
    assert.equal(document.getElementById('qoc-score').max, '27');

    await window._qocSave('course-9', 'session-9');
    assert.equal(window._showNotifToastCalls.at(-1).title, 'Validation');

    document.getElementById('qoc-measure').value = 'GAD-7';
    window._qocUpdateMax();
    assert.equal(document.getElementById('qoc-score').max, '21');
    document.getElementById('qoc-score').value = '99';
    await window._qocSave('course-9', 'session-9');
    assert.equal(window._showNotifToastCalls.at(-1).title, 'Invalid Score');

    api.getCourse = async () => ({ id: 'course-9', patient_id: null });
    api.recordOutcome = async () => null;
    document.getElementById('qoc-score').value = '12';
    document.getElementById('qoc-point').value = 'Week 4';
    document.getElementById('qoc-notes').value = 'Offline capture note';
    await window._qocSave('course-9', 'session-9');
    assert.equal(window._showNotifToastCalls.at(-1).title, 'Outcome Saved');
    const offlineOutcomes = JSON.parse(localStorage.getItem('ds_local_outcomes') || '[]');
    assert.equal(offlineOutcomes.at(-1).notes, 'Offline capture note');

    document.getElementById('content').innerHTML = '<div id="ccr-root"></div>';
    mod.openQuickOutcomeCapture('course-10', 'session-10', 'Riley Stone');
    api.getCourse = async () => ({ id: 'course-10', patient_id: 'patient-10' });
    api.recordOutcome = async (payload) => ({ ok: true, payload });
    let callbackPayload = null;
    window._qocOnSave = (payload) => { callbackPayload = payload; };
    document.getElementById('qoc-score').value = '6';
    document.getElementById('qoc-point').value = 'Baseline';
    await window._qocSave('course-10', 'session-10');
    assert.equal(window._showNotifToastCalls.at(-1).title, 'Outcome Saved');
    assert.deepEqual(callbackPayload, {
      courseId: 'course-10',
      sessionId: 'session-10',
      measure: 'PHQ-9',
      score: 6,
      point: 'Baseline',
    });
    await new Promise((resolve) => setTimeout(resolve, 350));
    assert.equal(window._ccrRedrawCount, 1);
    assert.equal(document.getElementById('qoc-overlay'), null);
  } finally {
    Object.assign(api, originals);
  }
});
