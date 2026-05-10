import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM(
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
  document.getElementById('patient-nav-list').innerHTML = '';
  document.getElementById('pt-bottom-nav').innerHTML = '';
  document.getElementById('patient-page-title').textContent = '';
  document.getElementById('patient-topbar-actions').textContent = '';
  document.body.querySelectorAll('#pt-acad-modal').forEach((node) => node.remove());
  window._showNotifToastCalls = [];
  window._navPatientCalls = [];
  window._openCalls = [];
  window._promptCalls = [];
  window._anchorClicks = [];
  window._showNotifToast = (payload) => { window._showNotifToastCalls.push(payload); };
  window._navPatient = (page) => { window._navPatientCalls.push(page); };
  window.open = (...args) => { window._openCalls.push(args); return null; };
  window.prompt = (...args) => { window._promptCalls.push(args); return 'prompt-default'; };
  globalThis.URL.createObjectURL = () => 'blob:mock';
  globalThis.URL.revokeObjectURL = () => {};
  dom.window.HTMLAnchorElement.prototype.click = function click() {
    window._anchorClicks.push({ href: this.href, download: this.download });
  };
  window._ptTicketFilter = 'all';
  setCurrentUser(null);
  resetEvidenceUiStatsCache();
}

test('pgPatientTickets covers local draft create, reply, and backend reply branches', async () => {
  resetHarness();

  const originals = {
    patientTickets: api.patientTickets,
    patientTicketReply: api.patientTicketReply,
    patientTicketCreate: api.patientTicketCreate,
  };

  localStorage.setItem('ds_patient_tickets_local', JSON.stringify([
    {
      id: 'TK-1001',
      title: 'Portal question',
      category: 'question',
      status: 'open',
      priority: 'medium',
      created: '2026-05-10T09:00:00Z',
      messages: [{ from: 'Clinic', text: 'How can we help?', ts: '2026-05-10T09:00:00Z' }],
    },
  ]));

  delete api.patientTickets;
  delete api.patientTicketReply;
  delete api.patientTicketCreate;

  try {
    await mod.pgPatientTickets();
    assert.match(document.getElementById('patient-content').innerHTML, /stored only on this device/i);

    window._ptFilterTickets('resolved');
    assert.match(document.getElementById('patient-content').innerHTML, /No local draft requests yet/i);
    window._ptFilterTickets('all');

    window._ptNewTicket();
    document.getElementById('pt-tk-title').value = '';
    document.getElementById('pt-tk-body').value = '';
    window._ptSubmitTicket();
    assert.equal(window._showNotifToastCalls.at(-1).title, 'Missing info');

    document.getElementById('pt-tk-title').value = 'Need scheduling help';
    document.getElementById('pt-tk-body').value = 'Please confirm my next appointment.';
    document.getElementById('pt-tk-cat').value = 'question';
    await window._ptSubmitTicket();
    assert.equal(window._showNotifToastCalls.at(-1).title, 'Request saved in this browser');
    let localTickets = JSON.parse(localStorage.getItem('ds_patient_tickets_local') || '[]');
    assert.equal(localTickets[0].title, 'Need scheduling help');

    document.getElementById('pt-tk-reply').value = 'Thank you';
    await window._ptReplyTicket();
    assert.equal(window._showNotifToastCalls.at(-1).title, 'Reply saved in this browser');
    localTickets = JSON.parse(localStorage.getItem('ds_patient_tickets_local') || '[]');
    assert.equal(localTickets[0].messages.at(-1).text, 'Thank you');

    api.patientTickets = async () => ([
      {
        id: 'TK-2001',
        title: 'Live support thread',
        category: 'bug',
        status: 'open',
        priority: 'high',
        created: '2026-05-10T11:00:00Z',
        messages: [{ from: 'Clinic', text: 'Please send a screenshot.', ts: '2026-05-10T11:05:00Z' }],
      },
    ]);
    const replyCalls = [];
    api.patientTicketReply = async (id, message) => {
      replyCalls.push({ id, message });
      return { ok: true };
    };
    api.patientTicketCreate = async () => ({ ok: true });

    await mod.pgPatientTickets();
    assert.match(document.getElementById('patient-content').innerHTML, /Track your questions and requests to the care team/i);
    document.getElementById('pt-tk-reply').value = 'Uploaded the screenshot.';
    await window._ptReplyTicket();
    assert.deepEqual(replyCalls[0], { id: 'TK-2001', message: 'Uploaded the screenshot.' });
    assert.equal(window._showNotifToastCalls.at(-1).title, 'Reply submitted');
  } finally {
    Object.assign(api, originals);
  }
});

test('pgPatientBilling covers unavailable, invoice, and payment-tab branches', async () => {
  resetHarness();

  const originals = {
    patientInvoices: api.patientInvoices,
    patientPayments: api.patientPayments,
  };

  delete api.patientInvoices;
  delete api.patientPayments;

  try {
    await mod.pgPatientBilling();
    assert.match(document.getElementById('patient-content').innerHTML, /Not available in beta/);

    api.patientInvoices = async () => ([
      { id: 'INV-1', description: 'Course deposit', amount: 150, vat: 30, currency: 'GBP', status: 'sent', date: '2026-05-01', due: '2026-05-15' },
      { id: 'INV-2', description: 'Follow-up review', amount: 75, vat: 0, currency: 'GBP', status: 'paid', date: '2026-04-15', due: '2026-04-30' },
    ]);
    api.patientPayments = async () => ([
      { amount: 75, method: 'Card', ref: 'PAY-1', invoice: 'INV-2', date: '2026-04-20' },
    ]);

    await mod.pgPatientBilling();
    assert.match(document.getElementById('patient-content').innerHTML, /Course deposit/);
    assert.match(document.getElementById('patient-content').innerHTML, /Outstanding/);
    window._ptBillingTab('payments');
    assert.match(document.getElementById('patient-content').innerHTML, /PAY-1/);
    assert.match(document.getElementById('patient-content').innerHTML, /Payment History/);
  } finally {
    Object.assign(api, originals);
  }
});

test('pgPatientAcademy covers search, filter, modal open, completion, and no-match state', async () => {
  resetHarness();

  await mod.pgPatientAcademy();
  assert.match(document.getElementById('patient-content').innerHTML, /Academy/);
  assert.match(document.getElementById('patient-content').innerHTML, /Understanding Neuromodulation/);

  window._ptAcadFilter('courses');
  assert.match(document.getElementById('patient-content').innerHTML, /Home Device Safety Training/);

  window._ptAcadSearch('zzzz-no-match');
  assert.match(document.getElementById('patient-content').innerHTML, /No resources match your search/);

  window._ptAcadFilter('all');
  window._ptAcadSearch('Sleep');
  assert.match(document.getElementById('patient-content').innerHTML, /Sleep Hygiene for Better Outcomes/);

  window._ptAcadOpen('c2');
  assert.match(document.body.innerHTML, /Sleep Hygiene for Better Outcomes/);
  window._ptAcadComplete('c2');
  assert.equal(window._showNotifToastCalls.at(-1).title, 'Saved on this device');
  assert.deepEqual(JSON.parse(localStorage.getItem('ds_pt_academy_completed') || '[]'), ['c2']);
  assert.match(document.getElementById('patient-content').innerHTML, /local: 1 marked/);
});

test('pgPatientLearn covers backend progress, filtering, article open, and mark-read branches', async () => {
  resetHarness();

  const originals = {
    patientPortalLearnProgress: api.patientPortalLearnProgress,
    patientPortalMarkLearnRead: api.patientPortalMarkLearnRead,
  };

  api.patientPortalLearnProgress = async () => ({ read_article_ids: ['journal-network-depression'] });

  const markCalls = [];
  api.patientPortalMarkLearnRead = async (articleId) => {
    markCalls.push(articleId);
    return { ok: true };
  };

  try {
    await mod.pgPatientLearn();
    assert.match(document.getElementById('patient-content').innerHTML, /Education Library/);
    assert.match(document.getElementById('patient-content').innerHTML, /peer-reviewed papers/i);
    assert.match(document.getElementById('patient-content').innerHTML, /✓ Read/);

    document.getElementById('learn-search').value = 'course';
    window._learnSearch();
    assert.match(document.getElementById('patient-content').innerHTML, /Udemy course: neuromodulation basics for patients and families/);

    window._learnCat('Courses');
    assert.match(document.getElementById('patient-content').innerHTML, /edX mini-course: brain stimulation and plasticity/);

    window._openArticle('udemy-family-course');
    assert.match(document.body.innerHTML, /Udemy course: neuromodulation basics for patients and families/);
    assert.match(document.body.innerHTML, /Mark as Read|Already read/);

    window._markArticleRead('udemy-family-course');
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(markCalls, ['udemy-family-course']);
    assert.deepEqual(JSON.parse(localStorage.getItem('ds_read_articles') || '[]').sort(), [
      'journal-network-depression',
      'udemy-family-course',
    ].sort());
    assert.match(document.getElementById('learn-mark-read-wrap').innerHTML, /Marked as read!/);
  } finally {
    Object.assign(api, originals);
  }
});

test('pgPatientHelp renders support content and FAQ entries', async () => {
  resetHarness();

  await mod.pgPatientHelp();
  assert.match(document.getElementById('patient-content').innerHTML, /Help &amp; Support/);
  assert.match(document.getElementById('patient-content').innerHTML, /How do I complete an assessment\?/);
  assert.match(document.getElementById('patient-content').innerHTML, /How do I contact my care team\?/);
  assert.match(document.getElementById('patient-content').innerHTML, /988/);
  assert.match(document.getElementById('patient-content').innerHTML, /Message your care team/);
});

test('pgPatientSettings covers dirty state, save, nav, action, and export branches', async () => {
  resetHarness();

  const originals = {
    updatePatientPreferences: api.updatePatientPreferences,
  };
  const prefCalls = [];
  api.updatePatientPreferences = async (prefs) => {
    prefCalls.push(prefs);
    return { ok: true };
  };

  try {
    await mod.pgPatientSettings({ display_name: 'Alice Patient', email: 'alice@example.test' });
    assert.equal(document.getElementById('patient-page-title').textContent, 'Settings');
    assert.match(document.getElementById('patient-content').innerHTML, /Alice Patient/);

    const saveBar = document.getElementById('st-savebar');
    assert.equal(saveBar.classList.contains('show'), false);

    const displayNameInput = document.querySelector('#st-account input[data-st-change]');
    displayNameInput.value = 'Alice Updated';
    displayNameInput.dispatchEvent(new Event('input', { bubbles: true }));
    assert.equal(saveBar.classList.contains('show'), true);

    const toggle = document.querySelector('[data-st-toggle]');
    toggle.click();
    assert.equal(toggle.classList.contains('on'), false);

    document.querySelector('[data-st-seg] button:last-child').click();
    assert.equal(document.querySelector('[data-st-seg] button:last-child').classList.contains('active'), true);

    document.querySelector('[data-st-pills] .st-pill').click();
    assert.equal(document.querySelector('[data-st-pills] .st-pill').classList.contains('active'), true);

    document.querySelector('[data-st-action="change-password"]').click();
    assert.equal(document.getElementById('st-toast-text').textContent, 'Password changes are unavailable from this beta portal.');

    document.querySelector('[data-st-export="summary"]').click();
    assert.equal(document.getElementById('st-toast-text').textContent, 'Session summary is unavailable from this beta portal.');

    document.querySelector('.st-nav-item[data-target="st-security"]').click();
    assert.equal(document.querySelector('.st-nav-item[data-target="st-security"]').classList.contains('active'), true);

    document.getElementById('st-save').click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(prefCalls.length, 1);
    assert.equal(saveBar.classList.contains('show'), false);
    assert.equal(document.getElementById('st-toast-text').textContent, 'Settings saved in this browser');
  } finally {
    api.updatePatientPreferences = originals.updatePatientPreferences;
  }
});

test('pgPatientWellness covers save, share, delete, export, and journal-link branches', async () => {
  resetHarness();

  const originals = {
    listWellnessCheckins: api.listWellnessCheckins,
    getWellnessSummary: api.getWellnessSummary,
    createWellnessCheckin: api.createWellnessCheckin,
    shareWellnessCheckin: api.shareWellnessCheckin,
    deleteWellnessCheckin: api.deleteWellnessCheckin,
    wellnessExportUrl: api.wellnessExportUrl,
    postWellnessAuditEvent: api.postWellnessAuditEvent,
  };

  const today = new Date();
  const isoToday = today.toISOString();
  const isoYesterday = new Date(today.getTime() - 86400000).toISOString();
  const items = [
    {
      id: 'w-1',
      created_at: isoToday,
      mood: 6,
      energy: 5,
      sleep: 4,
      anxiety: 3,
      focus: 4,
      pain: 2,
      note: 'Today note',
      tags: ['steady'],
      shared_at: null,
    },
    {
      id: 'w-2',
      created_at: isoYesterday,
      mood: 4,
      energy: 4,
      sleep: 3,
      anxiety: 5,
      focus: 3,
      pain: 1,
      note: 'Yesterday note',
      tags: ['poor_sleep'],
      shared_at: null,
    },
  ];
  const auditEvents = [];
  const createCalls = [];
  const shareCalls = [];
  const deleteCalls = [];

  api.listWellnessCheckins = async () => ({ items, consent_active: true, is_demo: false });
  api.getWellnessSummary = async () => ({
    checkins_7d: 2,
    missed_days_7d: 5,
    top_tags_30d: [{ tag: 'steady' }],
    mood_series_7d: [{ avg_mood: 4 }, { avg_mood: 6 }],
  });
  api.createWellnessCheckin = async (payload) => {
    createCalls.push(payload);
    const entry = {
      id: 'w-3',
      created_at: new Date().toISOString(),
      ...payload,
      tags: payload.tags || [],
      shared_at: null,
    };
    items.unshift(entry);
    return entry;
  };
  api.shareWellnessCheckin = async (id) => {
    shareCalls.push(id);
    const target = items.find((item) => item.id === id);
    if (target) target.shared_at = new Date().toISOString();
    return { ok: true };
  };
  api.deleteWellnessCheckin = async (id, reason) => {
    deleteCalls.push({ id, reason });
    const target = items.find((item) => item.id === id);
    if (target) target.deleted_at = new Date().toISOString();
    return { ok: true };
  };
  api.wellnessExportUrl = (format) => `https://example.test/export.${format}`;
  api.postWellnessAuditEvent = async (payload) => {
    auditEvents.push(payload);
    return { ok: true };
  };
  window.prompt = (...args) => {
    window._promptCalls.push(args);
    return 'duplicate entry';
  };

  try {
    await mod.pgPatientWellness();
    assert.equal(document.getElementById('patient-page-title').textContent, 'Wellness Hub');
    assert.match(document.getElementById('patient-content').innerHTML, /Today&#39;s snapshot|Today's snapshot/);
    assert.match(document.getElementById('patient-content').innerHTML, /Recent check-ins/);

    document.getElementById('w-note').value = 'Rough morning, better later.';
    document.getElementById('w-mood').value = '8';
    document.getElementById('w-anxiety').value = '7';
    document.getElementById('w-focus').value = '2';
    document.getElementById('w-save-btn').click();
    await new Promise((resolve) => setTimeout(resolve, 320));
    assert.equal(createCalls.length, 1);
    assert.equal(createCalls[0].note, 'Rough morning, better later.');
    assert.deepEqual(createCalls[0].tags.sort(), ['anxiety', 'low_focus'].sort());

    document.querySelector('button[data-w-share-id="w-3"]').click();
    await new Promise((resolve) => setTimeout(resolve, 260));
    assert.deepEqual(shareCalls, ['w-3']);

    document.querySelector('button[data-w-delete-id="w-1"]').click();
    await new Promise((resolve) => setTimeout(resolve, 260));
    assert.deepEqual(deleteCalls, [{ id: 'w-1', reason: 'duplicate entry' }]);
    assert.equal(window._promptCalls.length, 1);

    document.getElementById('w-export-csv-btn').click();
    document.getElementById('w-export-ndjson-btn').click();
    assert.deepEqual(window._openCalls, [
      ['https://example.test/export.csv', '_blank', 'noopener'],
      ['https://example.test/export.ndjson', '_blank', 'noopener'],
    ]);

    document.getElementById('w-link-journal-btn').click();
    assert.deepEqual(window._navPatientCalls.at(-1), 'pt-journal');

    assert.equal(auditEvents.some((event) => event.event === 'view'), true);
    assert.equal(auditEvents.some((event) => event.event === 'checkin_logged'), true);
    assert.equal(auditEvents.some((event) => event.event === 'share_clicked'), true);
    assert.equal(auditEvents.some((event) => event.event === 'delete_clicked'), true);
    assert.equal(auditEvents.filter((event) => event.event === 'export_clicked').length, 2);
    assert.equal(auditEvents.some((event) => event.event === 'cross_link_journal_clicked'), true);
  } finally {
    Object.assign(api, originals);
  }
});

test('pgPatientHomework covers demo filters, mood, export, modal, walk, library, and deep-link branches', async () => {
  resetHarness();

  const originals = {
    listHomeProgramTasks: api.listHomeProgramTasks,
    portalListHomeProgramTasks: api.portalListHomeProgramTasks,
    patientPortalCourses: api.patientPortalCourses,
    patientPortalSessions: api.patientPortalSessions,
    homeProgramTasksToday: api.homeProgramTasksToday,
    homeProgramTasksSummary: api.homeProgramTasksSummary,
    portalGetHomeProgramTaskCompletion: api.portalGetHomeProgramTaskCompletion,
    submitAssessment: api.submitAssessment,
    mutateHomeProgramTask: api.mutateHomeProgramTask,
    homeProgramTaskHelpRequest: api.homeProgramTaskHelpRequest,
    postHomeProgramTaskAuditEvent: api.postHomeProgramTaskAuditEvent,
  };

  const auditCalls = [];
  const helpCalls = [];
  api.listHomeProgramTasks = async () => [];
  api.portalListHomeProgramTasks = async () => [];
  api.patientPortalCourses = async () => [];
  api.patientPortalSessions = async () => [];
  api.homeProgramTasksToday = async () => null;
  api.homeProgramTasksSummary = async () => null;
  api.portalGetHomeProgramTaskCompletion = async () => null;
  api.submitAssessment = async () => ({ ok: true });
  api.mutateHomeProgramTask = async () => ({ ok: true });
  api.homeProgramTaskHelpRequest = async (taskId, payload) => {
    helpCalls.push({ taskId, payload });
    return { thread_id: 'thread-help-1' };
  };
  api.postHomeProgramTaskAuditEvent = async (payload) => {
    auditCalls.push(payload);
    return { ok: true };
  };
  window.prompt = (...args) => {
    window._promptCalls.push(args);
    return 'Need guidance';
  };

  try {
    await mod.pgPatientHomework();
    assert.equal(document.getElementById('patient-page-title').textContent, 'Homework');
    assert.match(document.getElementById('patient-content').innerHTML, /20-Minute Walk/);

    window._hwFilter('device');
    assert.equal(document.querySelector('[data-task-id="dm-hw-3"]').style.display, '');
    assert.equal(document.querySelector('[data-task-id="dm-hw-4"]').style.display, 'none');

    window._hwSearch('tingling');
    assert.equal(document.querySelector('[data-task-id="dm-hw-3"]').style.display, '');
    assert.equal(document.querySelector('[data-task-id="dm-hw-5"]').style.display, 'none');

    window._hwMoodPick(4);
    const todayIso = new Date().toISOString().slice(0, 10);
    assert.equal(JSON.parse(localStorage.getItem(`ds_checkin_${todayIso}`)).mood, 8);
    assert.equal(document.getElementById('hw-toast-text').textContent, 'Mood logged');

    window._hwOpen('dm-hw-3');
    assert.match(document.body.innerHTML, /Synaps One/);
    window._hwHelp('dm-hw-3');
    await new Promise((resolve) => setTimeout(resolve, 650));
    assert.deepEqual(helpCalls, [{ taskId: 'dm-hw-3', payload: { reason: 'Need guidance', is_urgent: false } }]);
    assert.equal(window._navPatientCalls.at(-1), 'patient-messages?thread_id=thread-help-1');

    window._hwLogNow('dm-hw-3');
    assert.equal(window._navPatientCalls.at(-1), 'pt-adherence-events?task_id=dm-hw-3');

    window._hwStart('dm-hw-1', 'walk');
    assert.match(document.body.innerHTML, /Start 20 min walk/);
    window._hwWalkDone('dm-hw-1');
    assert.match(document.querySelector('[data-task-id="dm-hw-1"] .hw-task-foot').innerHTML, /Completed/);

    window._hwAddLibrary('lib-walk');
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(JSON.parse(localStorage.getItem('ds_hw_library_tasks')).length, 1);
    assert.match(document.querySelector('.hw-today-grid').innerHTML, /lib-walk/);

    window._hwBrowseLibrary();
    assert.equal(window._navPatientCalls.at(-1), 'patient-education');

    window._hwExport();
    assert.equal(window._anchorClicks.length, 1);
    assert.equal(window._anchorClicks[0].download.startsWith('homework-'), true);
    assert.equal(document.getElementById('hw-toast-text').textContent, 'Plan exported');

    assert.equal(auditCalls.some((payload) => payload.event === 'view'), true);
    assert.equal(auditCalls.some((payload) => payload.event === 'task_viewed'), true);
    assert.equal(auditCalls.some((payload) => payload.event === 'task_help_requested'), true);
    assert.equal(auditCalls.some((payload) => payload.event === 'deep_link_followed'), true);
  } finally {
    Object.assign(api, originals);
  }
});

test('pgPatientMessages covers demo thread rendering, call launch, composer validation, and send flow', async () => {
  resetHarness();

  const originals = {
    patientPortalMessages: api.patientPortalMessages,
    patientPortalCourses: api.patientPortalCourses,
    patientPortalMe: api.patientPortalMe,
    listPatientMessageThreads: api.listPatientMessageThreads,
    getPatientMessageThreadsSummary: api.getPatientMessageThreadsSummary,
    sendPortalMessage: api.sendPortalMessage,
    markPatientMessageRead: api.markPatientMessageRead,
    patientPortalMarkMessageRead: api.patientPortalMarkMessageRead,
    getToken: api.getToken,
    postPatientMessagesAuditEvent: api.postPatientMessagesAuditEvent,
  };

  const sendCalls = [];
  const auditCalls = [];
  api.patientPortalMessages = async () => [];
  api.patientPortalCourses = async () => [];
  api.patientPortalMe = async () => ({ patient_id: 'demo-patient' });
  api.listPatientMessageThreads = async () => null;
  api.getPatientMessageThreadsSummary = async () => null;
  api.sendPortalMessage = async (payload) => {
    sendCalls.push(payload);
    return {
      id: `msg-${sendCalls.length}`,
      thread_id: 'demo-thread-kolmar',
      sender_type: 'patient',
      sender_name: 'You',
      body: payload.body,
      subject: payload.subject || 'Check-in notes',
      category: payload.category,
      created_at: new Date().toISOString(),
      is_read: true,
    };
  };
  api.markPatientMessageRead = async () => ({ ok: true });
  api.patientPortalMarkMessageRead = async () => ({ ok: true });
  api.getToken = () => 'demo-token';
  api.postPatientMessagesAuditEvent = async (payload) => {
    auditCalls.push(payload);
    return { ok: true };
  };
  setCurrentUser({ id: 'patient-1', patient_id: 'patient-1' });

  try {
    await mod.pgPatientMessages();
    assert.match(document.getElementById('patient-content').innerHTML, /Your care team/);
    assert.match(document.getElementById('patient-content').innerHTML, /Dr\. Kolmar/);
    assert.match(document.getElementById('patient-content').innerHTML, /demo/);

    window._ptmsgSelectThread(0);
    assert.match(document.getElementById('patient-content').innerHTML, /Scalp tingling is common/);

    await window._ptmsgStartCall('video');
    assert.deepEqual(window._openCalls.at(-1), ['https://meet.jit.si/deepsynaps-demo-demo-patient', '_blank', 'noopener,noreferrer']);

    await window._ptmsgSend();
    assert.equal(document.getElementById('ptmsg-composer-err').hidden, false);
    assert.match(document.getElementById('ptmsg-composer-err').textContent, /Type a message before sending/);

    document.getElementById('ptmsg-body').value = 'Can we talk about Tuesday?';
    await window._ptmsgSend();
    assert.equal(sendCalls.length, 1);
    assert.equal(sendCalls[0].body, 'Can we talk about Tuesday?');
    assert.match(document.getElementById('patient-content').innerHTML, /Can we talk about Tuesday\?/);

    assert.equal(auditCalls.some((payload) => payload.event === 'view'), true);
    assert.equal(auditCalls.some((payload) => payload.event === 'thread_opened'), true);
    assert.equal(auditCalls.some((payload) => payload.event === 'message_sent_clicked'), true);
  } finally {
    Object.assign(api, originals);
    setCurrentUser(null);
  }
});

test('pgPatientAssessments covers tabs, daily check-in, history export, and self-assessment submit', async () => {
  resetHarness();

  const originals = {
    patientPortalAssessments: api.patientPortalAssessments,
    patientPortalCourses: api.patientPortalCourses,
    patientPortalSessions: api.patientPortalSessions,
    patientPortalOutcomes: api.patientPortalOutcomes,
    submitAssessment: api.submitAssessment,
    submitSelfAssessment: api.submitSelfAssessment,
  };
  const submitCalls = [];
  const selfSubmitCalls = [];
  api.patientPortalAssessments = async () => [];
  api.patientPortalCourses = async () => [];
  api.patientPortalSessions = async () => [];
  api.patientPortalOutcomes = async () => [];
  api.submitAssessment = async (...args) => {
    submitCalls.push(args);
    return { ok: true };
  };
  api.submitSelfAssessment = async (payload) => {
    selfSubmitCalls.push(payload);
    return { ok: true };
  };
  setCurrentUser({ id: 'patient-1', patient_id: 'patient-1' });

  try {
    await mod.pgPatientAssessments();
    assert.match(document.getElementById('patient-content').innerHTML, /Assessments/);
    assert.match(document.getElementById('patient-content').innerHTML, /PHQ-9/);

    window._asTab('history');
    assert.equal(document.getElementById('as-panel-history').style.display, '');
    assert.equal(document.getElementById('as-panel-due').style.display, 'none');

    window._asHistFilter('phq-9');
    assert.equal(document.querySelector('#as-hist-chips button[data-f="phq-9"]').classList.contains('active'), true);

    await window._asDailyPick('mood', 4);
    await new Promise((resolve) => setTimeout(resolve, 400));
    await window._asDailyPick('energy', 5);
    await new Promise((resolve) => setTimeout(resolve, 400));
    await window._asDailyPick('sleep', 3);
    await new Promise((resolve) => setTimeout(resolve, 400));
    await window._asDailyPick('anxiety', 2);
    await new Promise((resolve) => setTimeout(resolve, 400));
    await window._asDailyPick('stress', 1);
    await new Promise((resolve) => setTimeout(resolve, 450));
    assert.match(document.getElementById('as-daily-summary').style.display, /block/);
    assert.equal(submitCalls.length, 0);
    const todayIso = new Date().toISOString().slice(0, 10);
    assert.equal(JSON.parse(localStorage.getItem(`ds_checkin_${todayIso}`)).mood, 4);

    window._asDailyReset();
    assert.equal(document.querySelector('.as-daily-step[data-step="mood"]').style.display, 'block');

    window._asExport();
    assert.equal(window._anchorClicks.some((click) => click.download.startsWith('assessment-history-')), true);
    assert.equal(document.getElementById('as-toast-text').textContent, 'History exported');

    window._asSelfStart('weekly_wellness');
    assert.match(document.getElementById('as-selfassess-form-wrap').innerHTML, /Weekly Wellness Check-in/);
    window._asSelfPick('weekly_wellness', 'overall', 4);
    window._asSelfSlider('weekly_wellness', 'stress', 6);
    window._asSelfText('weekly_wellness', 'note', 'Steadier this week.');
    await window._asSelfSubmit('weekly_wellness');
    assert.equal(selfSubmitCalls.length, 1);
    assert.equal(selfSubmitCalls[0].responses.note, 'Steadier this week.');
    assert.match(document.getElementById('as-toast-text').textContent, /submitted for processing/);

    window._asToggleRaw();
    assert.match(document.getElementById('as-toast-text').textContent, /Raw score view is not yet available/);
    window._asViewHistory('dm-h1');
    assert.match(document.getElementById('as-toast-text').textContent, /Assessment history details are unavailable/);
  } finally {
    Object.assign(api, originals);
    setCurrentUser(null);
  }
});
