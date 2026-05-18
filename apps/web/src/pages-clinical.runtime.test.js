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
  { url: 'https://example.test/' },
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
globalThis.FileReader = class FileReader {
  readAsDataURL() {
    this.onload?.({ target: { result: 'data:image/png;base64,abc123' } });
  }
};
globalThis.localStorage = localStorageShim;
Object.defineProperty(dom.window, 'localStorage', { value: localStorageShim, configurable: true });

let lastDownload = null;
globalThis.URL.createObjectURL = () => 'blob:mock-download';
globalThis.URL.revokeObjectURL = () => {};
dom.window.HTMLAnchorElement.prototype.click = function click() {
  lastDownload = { href: this.href, download: this.download };
};

const flush = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
};

const { api } = await import('./api.js');
const mod = await import('./pages-clinical.js');

function resetHarness() {
  localStorageShim.clear();
  document.getElementById('content').innerHTML = '';
  document.getElementById('page-content').innerHTML = '';
  document.getElementById('topbar-title').textContent = '';
  document.getElementById('topbar-actions').textContent = '';
  window._patientRoster = null;
  window._profilePatientId = null;
  window._selectedPatientId = null;
  window._patientHubTab = null;
  window._coursesPatientFilter = null;
  window._documentsHubPatientFilter = null;
  window._reportsHubPatientFilter = null;
  window._auditTrailPatientFilter = null;
  window._clinicalTrialsPatientFilter = null;
  window._irbManagerPatientFilter = null;
  window._adverseEventsPatientFilter = null;
  window._assessmentsHubPatientFilter = null;
  window._clinicalNotesPatientFilter = null;
  window._cdCourseId = null;
  window._announceCalls = [];
  window._toastCalls = [];
  window._navCalls = [];
  window._announce = (msg) => { window._announceCalls.push(msg); };
  window._showNotifToast = (payload) => { window._toastCalls.push(payload); };
  window._nav = (page) => { window._navCalls.push(page); };
  lastDownload = null;
}

test('pages-clinical assign modal loads roster, filters, and assigns selected patient', async () => {
  resetHarness();
  window._patientRoster = [
    { id: 'p1', name: 'Alice Brown', condition: 'Depression' },
    { id: 'p2', name: 'Ben Carter', condition: 'OCD' },
  ];

  let assigned = null;
  window._dsShowAssignModal({
    templateName: 'Protocol Alpha',
    onAssign: async (id, name) => {
      assigned = { id, name };
    },
  });

  await flush();

  const overlay = document.querySelector('.ds-assign-modal-overlay');
  assert.ok(overlay);
  assert.match(overlay.innerHTML, /Protocol Alpha/);
  assert.match(overlay.innerHTML, /Alice Brown/);
  assert.match(overlay.innerHTML, /Ben Carter/);

  const search = document.querySelector('.ds-assign-search');
  search.value = 'ocd';
  search.dispatchEvent(new Event('input', { bubbles: true }));
  assert.match(document.querySelector('.ds-assign-list').innerHTML, /Ben Carter/);
  assert.doesNotMatch(document.querySelector('.ds-assign-list').innerHTML, /Alice Brown/);

  const row = document.querySelector('.ds-assign-pat-row');
  row.dispatchEvent(new Event('click', { bubbles: true }));
  const assignBtn = document.querySelector('.ds-assign-btn-primary');
  assert.equal(assignBtn.disabled, false);
  assignBtn.dispatchEvent(new Event('click', { bubbles: true }));

  await flush();

  assert.deepEqual(assigned, { id: 'p2', name: 'Ben Carter' });
  assert.equal(document.querySelector('.ds-assign-modal-overlay'), null);
});

test('pgPatientProfile executes server-detail, drill-out, local save, and export flows', async () => {
  resetHarness();
  window._profilePatientId = 'srv-1';

  const originals = {
    getPatientDetail: api.getPatientDetail,
    getPatientCourses: api.getPatientCourses,
    getPatientConsentHistory: api.getPatientConsentHistory,
    listPatientProfileAuditEvents: api.listPatientProfileAuditEvents,
    recordPatientProfileAuditEvent: api.recordPatientProfileAuditEvent,
    updatePatient: api.updatePatient,
    exportPatientCsv: api.exportPatientCsv,
    exportPatientNdjson: api.exportPatientNdjson,
  };

  const auditCalls = [];
  const updateCalls = [];

  api.getPatientDetail = async () => ({
    header: {
      id: 'srv-1',
      first_name: 'Riley',
      last_name: 'Stone',
      dob: '1991-05-05',
      gender: 'female',
      mrn: 'MRN-22',
      is_demo: false,
    },
    counts: {
      active_courses: 2,
      active_irb_protocols: 1,
      active_trials: 1,
      adverse_events: 1,
      open_adverse_events: 1,
      outcome_assessments: 3,
      pending_assessments: 1,
    },
  });
  api.getPatientCourses = async () => ({
    items: [
      { id: 'course-1', title: 'rTMS Course', modality: 'rTMS', status: 'active' },
    ],
  });
  api.getPatientConsentHistory = async () => ({
    items: [
      { created_at: '2026-05-01', consent_type: 'Treatment consent', status: 'signed', version_label: 'v2' },
    ],
  });
  api.listPatientProfileAuditEvents = async () => ({
    items: [
      { created_at: '2026-05-02', actor_name: 'Dr Gray', event: 'view', note: 'opened chart' },
    ],
  });
  api.recordPatientProfileAuditEvent = async (id, payload) => {
    auditCalls.push({ id, payload });
    return { ok: true };
  };
  api.updatePatient = async (id, payload) => {
    updateCalls.push({ id, payload });
    return { ok: true };
  };
  api.exportPatientCsv = async () => ({ blob: new Blob(['csv']), filename: 'DEMO-srv-1.csv' });
  api.exportPatientNdjson = async () => ({ blob: new Blob(['ndjson']), filename: 'DEMO-srv-1.ndjson' });

  let topbarTitle = '';
  let topbarActions = '';
  try {
    await mod.pgPatientProfile((title, actions) => {
      topbarTitle = title;
      topbarActions = actions;
    });
    await flush();

    assert.equal(topbarTitle, 'Patient Profile');
    assert.match(topbarActions, /All Patients/);
    assert.match(document.getElementById('content').innerHTML, /Riley Stone/);
    assert.match(document.getElementById('content').innerHTML, /Clinical Record/);
    assert.match(document.getElementById('content').innerHTML, /Treatment consent/);
    assert.match(document.getElementById('content').innerHTML, /opened chart/);
    assert.equal(auditCalls[0].payload.event, 'view');

    window._profileTab('demographics');
    window._profileToggleEdit();
    document.getElementById('pp-d-name').value = 'Riley Stone MD';
    document.getElementById('pp-d-dob').value = '1991-05-06';
    document.getElementById('pp-d-gender').value = 'female';
    document.getElementById('pp-d-phone').value = '+1-555-1111';
    document.getElementById('pp-d-email').value = 'riley@example.test';
    document.getElementById('pp-d-address').value = 'Clinic Street';
    document.getElementById('pp-d-ec-name').value = 'Jordan Stone';
    document.getElementById('pp-d-ec-phone').value = '+1-555-2222';
    document.getElementById('pp-d-ec-rel').value = 'Partner';
    await window._profileSaveDemographics();
    assert.equal(updateCalls.length, 1);
    assert.deepEqual(updateCalls[0], {
      id: 'srv-1',
      payload: {
        first_name: 'Riley',
        last_name: 'Stone MD',
        dob: '1991-05-06',
        email: 'riley@example.test',
        phone: '+1-555-1111',
        gender: 'female',
      },
    });
    assert.equal(window._toastCalls.at(-1).title, 'Saved');

    window._profileTab('medications');
    window._profileToggleEdit();
    window._profileAddMedication();
    document.getElementById('pp-m-name').value = 'Lamotrigine';
    document.getElementById('pp-m-dose').value = '25mg';
    document.getElementById('pp-m-freq').value = 'daily';
    window._profileSaveMedication();
    assert.equal(window._announceCalls.at(-1), 'Medication added in this browser view');
    assert.match(document.getElementById('pp-tab-content').innerHTML, /Lamotrigine/);

    await window._ppDrillOut('reports-hub', 'srv-1');
    assert.equal(window._reportsHubPatientFilter, 'srv-1');
    assert.equal(window._navCalls.at(-1), 'reports-hub');
    assert.equal(auditCalls.at(-1).payload.event, 'drill_out');

    await window._ppExportCsv();
    assert.equal(lastDownload.download, 'DEMO-srv-1.csv');
    assert.equal(window._announceCalls.at(-1), 'CSV export complete');

    await window._ppExportNdjson();
    assert.equal(lastDownload.download, 'DEMO-srv-1.ndjson');
    assert.equal(window._announceCalls.at(-1), 'NDJSON export complete');
  } finally {
    Object.assign(api, originals);
  }
});

test('pgPatientProfile local-only tabs cover insurance, allergies, history, notes, flags, photo/card upload, and extra drill-outs', async () => {
  resetHarness();
  window._profilePatientId = 'srv-3';

  const originals = {
    getPatientDetail: api.getPatientDetail,
    getPatientCourses: api.getPatientCourses,
    getPatientConsentHistory: api.getPatientConsentHistory,
    listPatientProfileAuditEvents: api.listPatientProfileAuditEvents,
    recordPatientProfileAuditEvent: api.recordPatientProfileAuditEvent,
  };

  const auditCalls = [];
  api.getPatientDetail = async () => ({
    header: {
      id: 'srv-3',
      first_name: 'Mina',
      last_name: 'Vale',
      dob: '1990-01-01',
      gender: 'female',
      mrn: 'MRN-24',
      is_demo: true,
    },
    counts: {
      active_courses: 0,
      consent_records: 0,
      adverse_events: 0,
      outcome_assessments: 0,
    },
    disclaimers: ['Demo disclaimer'],
  });
  api.getPatientCourses = async () => ({ items: [] });
  api.getPatientConsentHistory = async () => ({ items: [] });
  api.listPatientProfileAuditEvents = async () => ({ items: [] });
  api.recordPatientProfileAuditEvent = async (id, payload) => {
    auditCalls.push({ id, payload });
    return { ok: true };
  };

  try {
    await mod.pgPatientProfile(() => {});
    await flush();

    assert.match(document.getElementById('content').innerHTML, /DEMO patient/);
    assert.match(document.getElementById('content').innerHTML, /No consent records yet/);
    assert.match(document.getElementById('content').innerHTML, /No audit events for this patient yet/);

    window._profileToggleEdit();
    window._profileTab('insurance');
    document.getElementById('pp-i-payer').value = 'Aetna';
    document.getElementById('pp-i-member').value = 'MEM-1';
    document.getElementById('pp-i-group').value = 'GRP-1';
    document.getElementById('pp-i-copay').value = '35';
    window._profileSaveInsurance();
    assert.equal(window._announceCalls.at(-1), 'Insurance saved in this browser view');

    window._profileHandlePhoto({ files: [{}] });
    assert.match(document.getElementById('content').innerHTML, /data:image\/png;base64,abc123/);

    window._profileTab('insurance');
    window._profileToggleEdit();
    window._profileHandleCardScan({ files: [{}] });
    assert.match(document.getElementById('pp-card-preview').innerHTML, /data:image\/png;base64,abc123/);

    window._profileTab('allergies');
    window._profileToggleEdit();
    window._profileAddAllergy();
    document.getElementById('pp-a-substance').value = 'Pollen';
    document.getElementById('pp-a-reaction').value = 'Sneezing';
    document.getElementById('pp-a-severity').value = 'Mild';
    window._profileSaveAllergy();
    assert.match(document.getElementById('pp-tab-content').innerHTML, /Pollen/);
    const storedProfiles = JSON.parse(globalThis.localStorage.getItem('ds_patient_profiles') || '[]');
    const srv3AllergyIdx = storedProfiles.find((profile) => profile.id === 'srv-3')?.allergies?.findIndex((item) => item.substance === 'Pollen');
    window._profileDeleteAllergy(srv3AllergyIdx);
    const storedProfilesAfterDelete = JSON.parse(globalThis.localStorage.getItem('ds_patient_profiles') || '[]');
    assert.equal(storedProfilesAfterDelete.find((profile) => profile.id === 'srv-3')?.allergies?.some((item) => item.substance === 'Pollen'), false);
    window._profileTab('allergies');
    assert.doesNotMatch(document.getElementById('pp-tab-content').innerHTML, /Pollen/);

    window._profileTab('history');
    window._profileToggleEdit();
    window._profileAddHistory();
    document.getElementById('pp-h-date').value = '2026-05-09';
    document.getElementById('pp-h-type').value = 'consultation';
    document.getElementById('pp-h-provider').value = 'Dr Hart';
    document.getElementById('pp-h-notes').value = 'Initial history note';
    document.getElementById('pp-h-outcome').value = '88';
    window._profileSaveHistory();
    assert.match(document.getElementById('pp-tab-content').innerHTML, /Dr Hart/);

    window._profileAddFlag('high-risk');
    window._profileAddFlag('high-risk');
    assert.match(document.getElementById('pp-flags-display').innerHTML, /high-risk/i);
    window._profileRemoveFlag('high-risk');
    assert.doesNotMatch(document.getElementById('pp-flags-display').innerHTML, /high-risk/i);

    window._ppAddNoteQuick('srv-3');
    document.getElementById('pp-notes-area').value = 'Updated note';
    window._profileSaveNotes();
    assert.equal(window._announceCalls.at(-1), 'Notes saved in this browser view');

    await window._ppDrillOut('course-detail', 'srv-3', 'course-9');
    assert.equal(window._cdCourseId, 'course-9');
    assert.equal(window._navCalls.at(-1), 'course-detail');

    await window._ppDrillOut('courses', 'srv-3');
    assert.equal(window._patientHubTab, 'courses');
    assert.equal(window._coursesPatientFilter, 'srv-3');
    assert.equal(window._navCalls.at(-1), 'patients-hub');

    await window._ppDrillOut('audit-trail', 'srv-3');
    assert.equal(window._auditTrailPatientFilter, 'srv-3');
    assert.equal(window._navCalls.at(-1), 'audittrail');
    assert.equal(auditCalls.filter((row) => row.payload.event === 'drill_out').length >= 3, true);
  } finally {
    Object.assign(api, originals);
  }
});

test('pgPatientProfile surfaces unavailable export endpoints and failed demographic sync honestly', async () => {
  resetHarness();
  window._profilePatientId = 'srv-2';

  const originals = {
    getPatientDetail: api.getPatientDetail,
    recordPatientProfileAuditEvent: api.recordPatientProfileAuditEvent,
    updatePatient: api.updatePatient,
    exportPatientCsv: api.exportPatientCsv,
    exportPatientNdjson: api.exportPatientNdjson,
  };

  api.getPatientDetail = async () => ({
    header: {
      id: 'srv-2',
      first_name: 'Dana',
      last_name: 'Cole',
      dob: '1988-04-11',
      gender: 'male',
      mrn: 'MRN-23',
      is_demo: false,
    },
    counts: {},
  });
  api.recordPatientProfileAuditEvent = async () => ({ ok: true });
  api.updatePatient = async () => {
    throw new Error('write blocked');
  };
  delete api.exportPatientCsv;
  delete api.exportPatientNdjson;

  try {
    await mod.pgPatientProfile(() => {});
    await flush();

    window._profileTab('demographics');
    window._profileToggleEdit();
    document.getElementById('pp-d-name').value = 'Dana Cole';
    document.getElementById('pp-d-dob').value = '1988-04-11';
    document.getElementById('pp-d-gender').value = 'male';
    await window._profileSaveDemographics();
    assert.equal(window._toastCalls.at(-1).title, 'Save failed');

    await window._ppExportCsv();
    assert.equal(window._toastCalls.at(-1).title, 'Export unavailable');
    await window._ppExportNdjson();
    assert.equal(window._toastCalls.at(-1).title, 'Export unavailable');
  } finally {
    Object.assign(api, originals);
  }
});
