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

if (typeof globalThis.fetch === 'undefined') {
  globalThis.fetch = () => Promise.reject(new Error('fetch unavailable'));
}

const mod = await import('./pages-patient.js');
const { api } = await import('./api.js');

function resetHarness() {
  localStorageShim.clear();
  document.getElementById('patient-content').innerHTML = '';
  document.getElementById('patient-page-title').textContent = '';
  document.getElementById('patient-topbar-actions').textContent = '';
  window._showNotifToastCalls = [];
  window._navPatientCalls = [];
  window._showNotifToast = (payload) => { window._showNotifToastCalls.push(payload); };
  window._navPatient = (page) => { window._navPatientCalls.push(page); };
  window._ptTicketFilter = 'all';
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
