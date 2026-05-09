import test from 'node:test';
import assert from 'node:assert/strict';

function makeNode(id = '', extra = {}) {
  const classes = new Set();
  return {
    id,
    tagName: 'DIV',
    innerHTML: '',
    textContent: '',
    value: '',
    checked: false,
    disabled: false,
    href: '',
    download: '',
    style: {},
    children: [],
    _listeners: {},
    classList: {
      add: (...names) => names.forEach((name) => classes.add(name)),
      remove: (...names) => names.forEach((name) => classes.delete(name)),
      contains: (name) => classes.has(name),
      toggle: (name) => {
        if (classes.has(name)) classes.delete(name);
        else classes.add(name);
      },
    },
    setAttribute(name, value) {
      this[name] = value;
    },
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    removeChild(child) {
      this.children = this.children.filter((row) => row !== child);
    },
    addEventListener(type, fn) {
      this._listeners[type] = fn;
    },
    focus() {
      this.focused = true;
    },
    remove() {
      this.removed = true;
    },
    click() {
      this.clicked = true;
    },
    closest() {
      return null;
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    ...extra,
  };
}

function installDomHarness() {
  const saved = {
    window: globalThis.window,
    document: globalThis.document,
    localStorage: globalThis.localStorage,
    confirm: globalThis.confirm,
    prompt: globalThis.prompt,
    URL: globalThis.URL,
  };

  const nodes = new Map();
  const localStore = new Map();
  const navCalls = [];
  const toastCalls = [];
  const bodyChildren = [];
  const urls = [];
  let clickedDownload = null;
  let confirmResult = true;
  let promptResult = '';

  const content = makeNode('content');
  nodes.set('content', content);

  const body = makeNode('body', {
    appendChild(child) {
      bodyChildren.push(child);
      if (child?.id) nodes.set(child.id, child);
      if (typeof child?.innerHTML === 'string') {
        const idPattern = /id="([^"]+)"/g;
        let match;
        while ((match = idPattern.exec(child.innerHTML))) {
          const nestedId = match[1];
          if (!nodes.has(nestedId)) nodes.set(nestedId, makeNode(nestedId));
        }
      }
      return child;
    },
    removeChild(child) {
      const idx = bodyChildren.indexOf(child);
      if (idx >= 0) bodyChildren.splice(idx, 1);
      child.removed = true;
    },
  });

  const documentStub = {
    body,
    head: makeNode('head'),
    getElementById(id) {
      return nodes.get(id) || null;
    },
    createElement(tag) {
      const el = makeNode('', { tagName: String(tag).toUpperCase() });
      if (tag === 'a') {
        el.click = () => {
          clickedDownload = { href: el.href, download: el.download };
          el.clicked = true;
        };
      }
      return el;
    },
    querySelector() {
      return null;
    },
    querySelectorAll(selector) {
      if (selector === '.lib-ai-pick:checked') {
        return Array.from(nodes.values()).filter((node) =>
          node && (node.className || '').split(/\s+/).includes('lib-ai-pick') && node.checked
        );
      }
      return [];
    },
  };

  const localStorageStub = {
    getItem(key) {
      return localStore.has(key) ? localStore.get(key) : null;
    },
    setItem(key, value) {
      localStore.set(key, String(value));
    },
    removeItem(key) {
      localStore.delete(key);
    },
  };

  const urlStub = {
    createObjectURL(blob) {
      const url = `blob:mock-${urls.length + 1}`;
      urls.push({ url, blob });
      return url;
    },
    revokeObjectURL(url) {
      urls.push({ revoked: url });
    },
  };

  globalThis.document = documentStub;
  globalThis.localStorage = localStorageStub;
  globalThis.confirm = () => confirmResult;
  globalThis.prompt = () => promptResult;
  globalThis.URL = { ...saved.URL, ...urlStub };
  globalThis.window = {
    _nav(page) {
      navCalls.push(page);
    },
    _dsToast(payload) {
      toastCalls.push(payload);
    },
    addEventListener() {},
    removeEventListener() {},
    location: { href: 'https://studio.local/?page=reports-v2' },
    open() {
      return null;
    },
  };

  return {
    content,
    navCalls,
    toastCalls,
    bodyChildren,
    urls,
    get clickedDownload() {
      return clickedDownload;
    },
    setConfirmResult(value) {
      confirmResult = value;
    },
    setPromptResult(value) {
      promptResult = value;
    },
    setNode(id, extra = {}) {
      const node = makeNode(id, extra);
      nodes.set(id, node);
      return node;
    },
    restore() {
      globalThis.window = saved.window;
      globalThis.document = saved.document;
      globalThis.localStorage = saved.localStorage;
      globalThis.confirm = saved.confirm;
      globalThis.prompt = saved.prompt;
      globalThis.URL = saved.URL;
    },
  };
}

const authMod = await import('./auth.js');
const { api } = await import('./api.js');
const { pgFinanceHub, pgReportsHubNew, pgSchedulingHub, pgLibraryHub, pgMonitorHub } = await import('./pages-clinical-hubs.js');

function sampleFinanceApi() {
  return {
    summary: async () => ({
      revenue_paid: 6400,
      outstanding: 1200,
      overdue: 300,
      total_invoices: 3,
      total_payments: 2,
      claims_approved: 1,
      claims_pending: 1,
      claims_value: 1500,
    }),
    listInvoices: async () => ({
      items: [
        {
          id: 'inv-1',
          invoice_number: 'INV-001',
          patient_name: 'Alex Harper',
          service: 'TMS Course',
          status: 'sent',
          amount: 1000,
          vat: 200,
          vat_rate: 0.2,
          total: 1200,
          paid: 200,
          currency: 'GBP',
          issue_date: '2026-05-01',
          due_date: '2026-05-20',
          notes: 'Installment plan',
        },
        {
          id: 'inv-2',
          invoice_number: 'INV-002',
          patient_name: 'Bianca Stone',
          service: 'qEEG Review',
          status: 'draft',
          amount: 500,
          vat: 100,
          vat_rate: 0.2,
          total: 600,
          paid: 0,
          currency: 'USD',
          issue_date: '2026-05-03',
          due_date: '2026-05-24',
          notes: '',
        },
        {
          id: 'inv-3',
          invoice_number: 'INV-003',
          patient_name: 'Chris Reed',
          service: 'Follow-up',
          status: 'paid',
          amount: 300,
          vat: 0,
          vat_rate: 0,
          total: 300,
          paid: 300,
          currency: 'EUR',
          issue_date: '2026-05-02',
          due_date: '2026-05-12',
        },
      ],
    }),
    listPayments: async () => ({
      items: [
        { id: 'pay-1', patient_name: 'Alex Harper', amount: 200, payment_date: '2026-05-05', method: 'card', reference: 'TXN-1', currency: 'GBP' },
        { id: 'pay-2', patient_name: 'Chris Reed', amount: 300, payment_date: '2026-05-06', method: 'bacs', reference: 'TXN-2', currency: 'GBP' },
      ],
    }),
    listClaims: async () => ({
      items: [
        {
          id: 'clm-1',
          patient_name: 'Alex Harper',
          insurer: 'BUPA',
          claim_number: 'CLM-001',
          status: 'pending',
          amount: 900,
          submitted_date: '2026-05-04',
          description: 'TMS pre-auth',
          policy_number: 'POL-77',
          notes: 'Awaiting reviewer',
        },
      ],
    }),
    monthlyAnalytics: async () => ({
      items: [
        { month: '2026-03', revenue: 1800, invoiced: 2100 },
        { month: '2026-04', revenue: 2200, invoiced: 2600 },
        { month: '2026-05', revenue: 2400, invoiced: 2500 },
      ],
    }),
    markInvoicePaid: async (id) => ({
      id,
      invoice_number: 'INV-001',
      total: 1200,
      currency: 'GBP',
    }),
    deleteInvoice: async () => ({ ok: true }),
    createInvoice: async (body) => ({
      id: 'inv-new',
      invoice_number: 'INV-NEW',
      total: body.amount * (1 + body.vat_rate),
      currency: 'GBP',
    }),
    createPayment: async () => ({ ok: true }),
    createClaim: async () => ({ ok: true }),
  };
}

function sampleSchedulingApi() {
  return {
    listClinicians: async () => ({
      items: [
        { id: 'clin-1', name: 'Dr Ada Lovelace' },
      ],
    }),
    listRooms: async () => ({
      items: [
        { id: 'room-1', name: 'Room A' },
        { id: 'room-2', name: 'Room B' },
      ],
    }),
    listSessions: async () => ({
      items: [
        {
          id: 'sess-1',
          patient_id: 'pat-1',
          patient_name: 'Alex Harper',
          clinician_id: 'clin-1',
          room_id: 'room-1',
          scheduled_at: '2026-05-05T09:00:00',
          duration_minutes: 60,
          appointment_type: 'session',
          modality: 'tdcs',
          session_notes: 'Maintenance session',
          status: 'scheduled',
        },
        {
          id: 'sess-2',
          patient_id: 'pat-2',
          patient_name: 'Bianca Stone',
          clinician_id: 'clin-2',
          room_id: 'room-2',
          scheduled_at: '2026-05-05T10:00:00',
          duration_minutes: 30,
          appointment_type: 'consultation',
          modality: 'tele',
          session_notes: 'Follow-up call',
          status: 'scheduled',
        },
      ],
    }),
    listCourses: async () => ({ items: [{ id: 'course-1', status: 'active' }] }),
    listPatients: async () => ({
      items: [
        { id: 'pat-1', first_name: 'Alex', last_name: 'Harper' },
        { id: 'pat-2', first_name: 'Bianca', last_name: 'Stone' },
        { id: 'pat-3', first_name: 'Jordan', last_name: 'Miles' },
      ],
    }),
    listReferrals: async () => ({
      items: [
        { id: 'lead-1', name: 'Jordan Miles', condition: 'Depression', urgency: 'routine', stage: 'new' },
        { id: 'lead-2', name: 'Elliot Park', condition: 'OCD', urgency: 'urgent', stage: 'triage' },
      ],
    }),
    checkSlotConflicts: async () => ({
      conflicts: [{ id: 'conf-1', patient_id: 'pat-2', appointment_id: 'sess-2' }],
    }),
    updateSession: async (id, body) => ({ id, ...body }),
    cancelSession: async (id, body) => ({ id, ...body }),
    listSessionEvents: async () => ([{ id: 'evt-1' }, { id: 'evt-2' }]),
    triageReferral: async () => ({ ok: true }),
    dismissReferral: async () => ({ ok: true }),
    updateLead: async () => ({ ok: true }),
    createStaffShift: async () => ({ ok: true }),
    createPatient: async (body) => ({ id: 'pat-new', ...body }),
    bookSession: async (body) => ({ id: 'sess-new', ...body }),
  };
}

function sampleLibraryApi() {
  return {
    libraryOverview: async () => ({
      evidence_db_available: true,
      condition_count: 2,
      neuromod_eligible_count: 1,
      condition_package_count: 1,
      curated_paper_count: 12,
      curated_trial_count: 3,
      conditions: [
        {
          id: 'cond-1',
          name: 'Major Depression',
          category: 'Mood',
          icd_10: 'F32',
          review_status: 'reviewed',
          highest_evidence_level: 'A',
          reviewed_protocol_count: 2,
          total_protocol_count: 4,
          curated_evidence_paper_count: 6,
          compatible_device_count: 2,
          assessment_count: 3,
          has_condition_package: true,
          package_slug: 'major-depression',
          neuromod_eligible: true,
          eligibility_reasons: ['Reviewed protocol', 'Grade A evidence'],
        },
        {
          id: 'cond-2',
          name: 'OCD',
          category: 'Anxiety',
          icd_10: 'F42',
          review_status: 'draft',
          highest_evidence_level: 'C',
          reviewed_protocol_count: 0,
          total_protocol_count: 1,
          curated_evidence_paper_count: 2,
          compatible_device_count: 1,
          assessment_count: 1,
          has_condition_package: false,
          neuromod_eligible: false,
          eligibility_blockers: ['No reviewed protocol'],
        },
      ],
    }),
    listDevices: async () => ({
      items: [
        { id: 'dev-1', name: 'Alpha Stim', manufacturer: 'Acme', modality: 'rTMS', regulatory_status: 'cleared', regulatory_pathway: '510k', review_status: 'reviewed', official_indication: 'MDD' },
        { id: 'dev-2', name: 'Theta Pad', manufacturer: 'Acme', modality: 'tDCS', regulatory_status: 'reviewed', review_status: 'reviewed' },
      ],
    }),
    conditionPackageSlugs: async () => ({ slugs: ['major-depression'] }),
    listLiterature: async () => ({
      items: [
        { id: 'lit-1', title: 'Trial paper', year: '2025', journal: 'Brain Stimulation', evidence_grade: 'A', condition: 'Major Depression', url: 'https://example.com/paper' },
      ],
    }),
    adminRefreshEvidence: async () => ({ pid: 321 }),
    promoteEvidencePaper: async () => ({ ok: true }),
    libraryExternalSearch: async () => ({
      notice: 'Curated ingest results',
      provenance: 'evidence-broker',
      last_checked_at: '2026-05-08T12:00:00Z',
      items: [
        { id: 11, title: 'rTMS review', year: '2024', journal: 'Neuromodulation', pub_types: ['Review'], authors: 'A. Author', source_trust: 'high', review_status: 'unreviewed', pmid: '123456', doi: '10.1000/xyz' },
        { id: 12, title: 'tDCS trial', year: '2023', journal: 'BMJ', pub_types: ['Trial'], authors: 'B. Author', source_trust: 'medium', review_status: 'unreviewed', url: 'https://example.com/fulltext' },
      ],
    }),
    librarySummarizeEvidence: async ({ paper_ids }) => ({
      draft_text: `Draft for ${paper_ids.join(', ')}`,
      source_paper_ids: paper_ids,
      source_citations: paper_ids.map((paper_id) => ({ paper_id, title: `Paper ${paper_id}`, journal: 'Neuromodulation', year: '2024' })),
      reviewer_notice: 'Review before clinical use.',
    }),
    curateLiteraturePaper: async () => ({ ok: true }),
  };
}

function sampleMonitorApi() {
  return {
    listPatients: async () => ({
      items: [
        { id: 'pat-1', first_name: 'Alex', last_name: 'Harper' },
        { id: 'pat-2', first_name: 'Bianca', last_name: 'Stone' },
      ],
    }),
    getClinicAlertSummary: async () => ({
      total_active: 2,
      urgent_count: 1,
      warning_count: 1,
      info_count: 0,
      patient_ids_with_alerts: ['pat-1'],
    }),
    getPatientWearableSummary: async () => ({
      connections: [{ status: 'connected', source: 'Apple Health', last_sync_at: '2026-05-08T12:00:00Z' }],
      recent_alerts: [
        { id: 'alert-1', severity: 'urgent', flag_type: 'tachycardia', detail: 'Heart rate spike', triggered_at: '2026-05-08T11:00:00Z' },
      ],
    }),
    dismissAlertFlag: async () => ({ ok: true }),
    listAdverseEvents: async () => ({
      items: [
        {
          id: 'ae-1',
          patient_id: 'pat-1',
          event_type: 'headache',
          severity: 'moderate',
          reported_at: '2026-05-08T10:00:00Z',
          body_system: 'nervous',
          expectedness: 'expected',
          relatedness: 'possible',
          reportable: true,
          is_serious: false,
          description: 'Headache after session',
        },
      ],
    }),
    getAdverseEventsSummary: async () => ({ total: 1, open: 1, sae: 0, reportable: 1, awaiting_review: 1 }),
    exportAdverseEventsCsv: async () => ({ blob: new Blob(['csv']), filename: 'adverse-events.csv' }),
    getAdverseEvent: async () => ({
      id: 'ae-1',
      patient_id: 'pat-1',
      event_type: 'headache',
      severity: 'moderate',
      reported_at: '2026-05-08T10:00:00Z',
      onset_timing: 'during',
      body_system: 'nervous',
      expectedness: 'expected',
      expectedness_source: 'protocol',
      relatedness: 'possible',
      reportable: true,
      sae_criteria: 'none',
      action_taken: 'none',
      meddra_pt: 'Headache',
      meddra_soc: 'Nervous system disorders',
      description: 'Headache after session',
    }),
    reviewAdverseEvent: async () => ({ ok: true }),
    escalateAdverseEvent: async () => ({ ok: true }),
    resolveAdverseEvent: async () => ({ ok: true }),
    patchAdverseEvent: async () => ({ ok: true }),
    exportAdverseEventCioms: async () => ({ blob: new Blob(['cioms']), filename: 'cioms.pdf' }),
    reportAdverseEvent: async () => ({ id: 'ae-new', is_serious: false, reportable: false }),
  };
}

test('pgFinanceHub invoices branch renders live rows and executes invoice handlers', async () => {
  const dom = installDomHarness();
  const originalFinance = api.finance;
  const originalUser = authMod.currentUser;
  authMod.setCurrentUser({ role: 'admin' });
  api.finance = { ...sampleFinanceApi() };
  globalThis.window._financeHubTab = 'invoices';

  let topbarTitle = '';
  let topbarActions = '';
  try {
    await pgFinanceHub((title, actions) => {
      topbarTitle = title;
      topbarActions = actions;
    }, globalThis.window._nav);

    assert.equal(topbarTitle, 'Finance');
    assert.match(topbarActions, /\+ New Invoice/);
    assert.match(dom.content.innerHTML, /Invoices/);
    assert.match(dom.content.innerHTML, /INV-001/);
    assert.match(dom.content.innerHTML, /Mark Paid/);
    assert.match(dom.content.innerHTML, /Delete/);
    assert.equal(typeof globalThis.window._finViewInvoice, 'function');

    globalThis.window._finViewInvoice('inv-1');
    assert.equal(dom.bodyChildren.length > 0, true);
    assert.match(dom.bodyChildren.at(-1).innerHTML, /Alex Harper/);
    assert.match(dom.bodyChildren.at(-1).innerHTML, /Installment plan/);

    await globalThis.window._finMarkPaid('inv-1');
    assert.equal(dom.toastCalls.at(-1).title, 'Marked paid');
    assert.equal(dom.navCalls.at(-1), 'finance-v2');

    dom.setConfirmResult(true);
    await globalThis.window._finDeleteInvoice('inv-2', 'INV-002');
    assert.equal(dom.toastCalls.at(-1).title, 'Draft deleted');
    assert.equal(dom.navCalls.at(-1), 'finance-v2');

    globalThis.window._finViewInvoice('missing');
    assert.equal(dom.toastCalls.at(-1).title, 'Invoice not found');
  } finally {
    api.finance = originalFinance;
    authMod.setCurrentUser(originalUser);
    dom.restore();
  }
});

test('pgFinanceHub shared save handlers cover validation, success, exports, payments, claims, and analytics branches', async () => {
  const dom = installDomHarness();
  const originalFinance = api.finance;
  const originalUser = authMod.currentUser;
  authMod.setCurrentUser({ role: 'admin' });
  api.finance = { ...sampleFinanceApi() };

  let topbarTitle = '';
  try {
    globalThis.window._financeHubTab = 'payments';
    await pgFinanceHub((title) => {
      topbarTitle = title;
    }, globalThis.window._nav);

    assert.equal(topbarTitle, 'Finance');
    assert.match(dom.content.innerHTML, /Payment Log/);
    assert.match(dom.content.innerHTML, /Alex Harper/);
    assert.match(dom.content.innerHTML, /Transactions/);

    const payPatient = dom.setNode('pay-patient', { value: '' });
    const payAmount = dom.setNode('pay-amount', { value: '' });
    dom.setNode('pay-method', { value: 'manual' });
    dom.setNode('pay-ref', { value: 'MANUAL-7' });
    dom.setNode('pay-date', { value: '2026-05-07' });
    dom.setNode('pay-invoice', { value: 'inv-1' });
    dom.setNode('fin-log-pay-modal');
    globalThis.window._finSelectInvoiceForPayment('inv-1');
    assert.equal(payPatient.value, 'Alex Harper');
    assert.equal(payAmount.value, '1000');

    payPatient.value = '';
    payAmount.value = '';
    await globalThis.window._finSavePayment();
    assert.equal(dom.toastCalls.at(-1).title, 'Fill required fields');

    payPatient.value = 'Alex Harper';
    payAmount.value = '250';
    await globalThis.window._finSavePayment();
    assert.equal(dom.toastCalls.at(-1).title, 'Payment logged');
    assert.equal(globalThis.window._financeHubTab, 'payments');

    const invPatient = dom.setNode('inv-patient', { value: '' });
    const invService = dom.setNode('inv-service', { value: '' });
    dom.setNode('inv-amount', { value: '' });
    dom.setNode('inv-vat', { value: '20' });
    dom.setNode('inv-date', { value: '2026-05-09' });
    dom.setNode('inv-due', { value: '2026-05-30' });
    dom.setNode('fin-new-inv-modal');
    await globalThis.window._finSaveInvoice();
    assert.equal(dom.toastCalls.at(-1).title, 'Fill required fields');

    invPatient.value = 'Dora Vale';
    invService.value = 'Course Retainer';
    dom.setNode('inv-amount', { value: '500' });
    await globalThis.window._finSaveInvoice();
    assert.equal(dom.toastCalls.at(-1).title, 'Invoice created');
    assert.equal(globalThis.window._financeHubTab, 'invoices');

    const clmPatient = dom.setNode('clm-patient', { value: '' });
    const clmInsurer = dom.setNode('clm-insurer', { value: '' });
    dom.setNode('clm-policy', { value: 'POL-9' });
    const clmDesc = dom.setNode('clm-desc', { value: '' });
    dom.setNode('clm-amount', { value: '' });
    dom.setNode('clm-status', { value: 'submitted' });
    dom.setNode('fin-new-claim-modal');
    await globalThis.window._finSaveClaim();
    assert.equal(dom.toastCalls.at(-1).title, 'Fill required fields');

    clmPatient.value = 'Dora Vale';
    clmInsurer.value = 'AXA';
    clmDesc.value = 'Course authorisation';
    dom.setNode('clm-amount', { value: '875' });
    await globalThis.window._finSaveClaim();
    assert.equal(dom.toastCalls.at(-1).title, 'Claim created');
    assert.equal(globalThis.window._financeHubTab, 'insurance');

    globalThis.window._financeHubTab = 'payments';
    await pgFinanceHub(() => {}, globalThis.window._nav);
    globalThis.window._finExportLedgerCsv();
    assert.equal(dom.clickedDownload?.download.startsWith('finance-payments-'), true);
    assert.equal(dom.toastCalls.at(-1).title, 'Export ready');

    globalThis.window._financeHubTab = 'analytics';
    await pgFinanceHub(() => {}, globalThis.window._nav);
    assert.match(dom.content.innerHTML, /Monthly Revenue/);
    assert.match(dom.content.innerHTML, /Collection ratio/);
    assert.match(dom.content.innerHTML, /Revenue by Status/);
  } finally {
    api.finance = originalFinance;
    authMod.setCurrentUser(originalUser);
    dom.restore();
  }
});

test('pgReportsHubNew analytics branch renders real KPIs and finance-backed trend cards', async () => {
  const dom = installDomHarness();
  const originalUser = authMod.currentUser;
  const originals = {
    listMyReports: api.listMyReports,
    getReportsSummary: api.getReportsSummary,
    aggregateOutcomes: api.aggregateOutcomes,
    listCourses: api.listCourses,
    finance: api.finance,
  };
  authMod.setCurrentUser({ role: 'clinician' });
  globalThis.window._reportsHubTab = 'analytics';
  api.listMyReports = async () => ({ items: [] });
  api.getReportsSummary = async () => ({ total: 0, draft: 0, signed: 0, superseded: 0 });
  api.aggregateOutcomes = async () => ({
    responder_rate_pct: 67,
    avg_phq9_drop: 5.2,
    courses_with_outcomes: 11,
    assessment_completion_pct: 82,
    assessments_overdue_count: 2,
  });
  api.listCourses = async () => ({
    items: [
      { id: 'c1', status: 'active', condition_slug: 'major-depressive-disorder', created_at: '2026-03-02' },
      { id: 'c2', status: 'completed', condition_slug: 'major-depressive-disorder', created_at: '2026-04-03' },
      { id: 'c3', status: 'active', condition_slug: 'obsessive-compulsive-disorder', created_at: '2026-05-01' },
    ],
  });
  api.finance = {
    ...sampleFinanceApi(),
    summary: async () => ({ revenue_paid: 7000, outstanding: 900, overdue: 200 }),
    monthlyAnalytics: async () => ({
      items: [
        { month: '2026-03', revenue: 1200, invoiced: 1500 },
        { month: '2026-04', revenue: 1800, invoiced: 2100 },
      ],
    }),
  };

  let topbarTitle = '';
  try {
    await pgReportsHubNew((title) => {
      topbarTitle = title;
    }, globalThis.window._nav);

    assert.equal(topbarTitle, 'Reports');
    assert.match(dom.content.innerHTML, /Clinical decision-support only/);
    assert.match(dom.content.innerHTML, /Responder Rate/);
    assert.match(dom.content.innerHTML, /67%/);
    assert.match(dom.content.innerHTML, /Courses by Condition/);
    assert.match(dom.content.innerHTML, /Major Depressive Disorder/);
    assert.match(dom.content.innerHTML, /Finance Summary/);
    assert.match(dom.content.innerHTML, /Monthly Revenue/);
  } finally {
    api.listMyReports = originals.listMyReports;
    api.getReportsSummary = originals.getReportsSummary;
    api.aggregateOutcomes = originals.aggregateOutcomes;
    api.listCourses = originals.listCourses;
    api.finance = originals.finance;
    authMod.setCurrentUser(originalUser);
    dom.restore();
  }
});

test('pgReportsHubNew export branch downloads outcome CSV and reports real empty-range warnings', async () => {
  const dom = installDomHarness();
  const originalUser = authMod.currentUser;
  const originals = {
    listMyReports: api.listMyReports,
    getReportsSummary: api.getReportsSummary,
    listOutcomes: api.listOutcomes,
    listCourses: api.listCourses,
  };
  authMod.setCurrentUser({ role: 'clinician' });
  globalThis.window._reportsHubTab = 'export';
  api.listMyReports = async () => ({ items: [] });
  api.getReportsSummary = async () => ({ total: 1, draft: 1, signed: 0, superseded: 0 });
  api.listOutcomes = async () => ({
    items: [
      {
        id: 'o1',
        patient_id: 'p1',
        course_id: 'c1',
        template_id: 'PHQ-9',
        score_numeric: 8,
        measurement_point: 'baseline',
        administered_at: '2026-05-06T08:00:00Z',
      },
    ],
  });
  api.listCourses = async () => ({ items: [] });
  globalThis.localStorage.setItem('ds_reports_v1', JSON.stringify([
    { id: 'local-1', name: 'Draft report', patient: 'Alex Harper', type: 'Outcome', date: '2026-05-05', status: 'generated' },
  ]));

  try {
    await pgReportsHubNew(() => {}, globalThis.window._nav);
    assert.match(dom.content.innerHTML, /Export Reports/);
    assert.equal(typeof globalThis.window._repExportCsv, 'function');

    dom.setNode('rep-exp-from', { value: '2026-05-01' });
    dom.setNode('rep-exp-to', { value: '2026-05-09' });
    dom.setNode('rep-exp-source', { value: 'outcomes' });
    await globalThis.window._repExportCsv();
    assert.equal(dom.clickedDownload?.download, 'reports-outcomes-2026-05-01_to_2026-05-09.csv');
    assert.equal(dom.toastCalls.at(-1).title, 'Export ready');

    dom.setNode('rep-exp-source', { value: 'courses' });
    await globalThis.window._repExportCsv();
    assert.equal(dom.toastCalls.at(-1).title, 'No rows');
  } finally {
    api.listMyReports = originals.listMyReports;
    api.getReportsSummary = originals.getReportsSummary;
    api.listOutcomes = originals.listOutcomes;
    api.listCourses = originals.listCourses;
    authMod.setCurrentUser(originalUser);
    dom.restore();
  }
});

test('pgSchedulingHub covers calendar, referrals, wizard, and shift actions', async () => {
  const dom = installDomHarness();
  const originalUser = authMod.currentUser;
  const originals = {
    listClinicians: api.listClinicians,
    listRooms: api.listRooms,
    listSessions: api.listSessions,
    listCourses: api.listCourses,
    listPatients: api.listPatients,
    listReferrals: api.listReferrals,
    checkSlotConflicts: api.checkSlotConflicts,
    updateSession: api.updateSession,
    cancelSession: api.cancelSession,
    listSessionEvents: api.listSessionEvents,
    triageReferral: api.triageReferral,
    dismissReferral: api.dismissReferral,
    updateLead: api.updateLead,
    createStaffShift: api.createStaffShift,
    createPatient: api.createPatient,
    bookSession: api.bookSession,
  };
  const sample = sampleSchedulingApi();
  authMod.setCurrentUser({ role: 'clinician' });
  Object.assign(api, sample);
  window._schedAnchor = '2026-05-05';
  window._schedView = 'week';
  window._schedHubTab = 'appointments';

  let topbarTitle = '';
  let topbarActions = '';
  try {
    await pgSchedulingHub((title, actions) => { topbarTitle = title; topbarActions = actions; }, globalThis.window._nav);
    assert.equal(topbarTitle, 'Schedule');
    assert.match(dom.content.innerHTML, /Calendar/);
    assert.match(topbarActions, /Booking unavailable|New booking/);

    window._schedToggleRealMode();
    assert.equal(dom.navCalls.at(-1), 'scheduling-hub');

    window._schedToggleClinician('clin-1');
    window._schedToggleRoom('Room A');
    window._schedToggleType('tdcs');
    window._schedToggleConflicts();
    window._schedShift(7);
    window._schedToday();
    window._schedSetView('day');
    window._schedSetView('month');

    window._schedHubTab = 'referrals';
    await pgSchedulingHub(() => {}, globalThis.window._nav);
    assert.match(dom.content.innerHTML, /Booking queue/);

    await window._schedTriageLead('lead-1');
    assert.equal(dom.toastCalls.at(-1).title, 'Triage updated');
    dom.setConfirmResult(true);
    await window._schedDismissLead('lead-2');
    assert.equal(dom.toastCalls.at(-1).title, 'Dismissed');

    window._schedOpenShiftModal();
    dom.setNode('dv2s-shift-clin', { value: 'clin-1' });
    dom.setNode('dv2s-shift-day', { value: '2026-05-05' });
    dom.setNode('dv2s-shift-type', { value: 'clinic' });
    dom.setNode('dv2s-shift-hrs', { value: '8' });
    await window._schedSubmitShift('shift');
    assert.equal(dom.toastCalls.at(-1).title, 'Shift added');

    window._schedOpenPtoModal();
    dom.setNode('dv2s-shift-clin', { value: 'clin-1' });
    dom.setNode('dv2s-shift-day', { value: '2026-05-06' });
    dom.setNode('dv2s-shift-hrs', { value: '0' });
    await window._schedSubmitShift('pto');
    assert.equal(dom.toastCalls.at(-1).title, 'Shift added');

    await window._schedCheckConflictsBtn('sess-1');
    assert.match(dom.toastCalls.at(-1).title, /conflict/);

    dom.setPromptResult('no_show');
    await window._schedMarkAttended('sess-2');
    assert.equal(dom.toastCalls.at(-1).title, 'Sign in required');

    dom.setConfirmResult(true);
    dom.setPromptResult('moving slot');
    await window._schedCancelEvent('sess-2');
    assert.equal(dom.toastCalls.at(-1).title, 'Cancelled');

    await window._schedSessionAudit('sess-1');
    assert.match(dom.toastCalls.at(-1).title, /session events/);

    window._schedReschedule('sess-1');
    assert.ok(window._schedWiz);
    window._schedWizSetStep(4);
    await window._schedWizConfirm();
    assert.equal(dom.toastCalls.at(-1).title, 'Rescheduled');

    window._schedBookLead('lead-1');
    assert.ok(window._schedWiz);
    window._schedWizSetStep(4);
    await window._schedWizConfirm();
    assert.equal(dom.toastCalls.at(-1).title, 'Booked');

    window._schedOpenAssessments('sess-1');
    assert.equal(dom.navCalls.at(-1), 'assessments-v2');
    window._schedOpenProtocol('sess-1');
    assert.equal(dom.navCalls.at(-1), 'protocol-studio');
    window._schedOpenSessionPrep('sess-1');
    assert.equal(dom.navCalls.at(-1), 'session-execution');
    window._schedOpenChart('sess-1');
    assert.equal(dom.navCalls.at(-1), 'patient-hub');

    window._schedHubTab = 'staff';
    await pgSchedulingHub(() => {}, globalThis.window._nav);
    assert.match(dom.content.innerHTML, /Workload/);
  } finally {
    api.listClinicians = originals.listClinicians;
    api.listRooms = originals.listRooms;
    api.listSessions = originals.listSessions;
    api.listCourses = originals.listCourses;
    api.listPatients = originals.listPatients;
    api.listReferrals = originals.listReferrals;
    api.checkSlotConflicts = originals.checkSlotConflicts;
    api.updateSession = originals.updateSession;
    api.cancelSession = originals.cancelSession;
    api.listSessionEvents = originals.listSessionEvents;
    api.triageReferral = originals.triageReferral;
    api.dismissReferral = originals.dismissReferral;
    api.updateLead = originals.updateLead;
    api.createStaffShift = originals.createStaffShift;
    api.createPatient = originals.createPatient;
    api.bookSession = originals.bookSession;
    authMod.setCurrentUser(originalUser);
    dom.restore();
  }
});

test('pgLibraryHub covers redirects, registry tabs, external search, and AI drafts', async () => {
  const dom = installDomHarness();
  const originalUser = authMod.currentUser;
  const originals = {
    libraryOverview: api.libraryOverview,
    listDevices: api.listDevices,
    conditionPackageSlugs: api.conditionPackageSlugs,
    listLiterature: api.listLiterature,
    adminRefreshEvidence: api.adminRefreshEvidence,
    promoteEvidencePaper: api.promoteEvidencePaper,
    libraryExternalSearch: api.libraryExternalSearch,
    librarySummarizeEvidence: api.librarySummarizeEvidence,
    curateLiteraturePaper: api.curateLiteraturePaper,
  };
  authMod.setCurrentUser({ role: 'admin' });
  const sampleApi = sampleLibraryApi();
  Object.assign(api, sampleApi);
  const sampleExternalSearch = sampleApi.libraryExternalSearch;
  window._libraryHubTab = 'conditions';

  let topbarTitle = '';
  try {
    await pgLibraryHub((title) => { topbarTitle = title; }, globalThis.window._nav);
    assert.equal(dom.navCalls.at(-1), 'protocol-hub');
    assert.equal(window._protocolHubTab, 'conditions');

    window._libraryHubTab = 'devices';
    await pgLibraryHub((title) => { topbarTitle = title; }, globalThis.window._nav);
    assert.equal(topbarTitle, 'Library');
    assert.match(dom.content.innerHTML, /Device Registry/);
    window._libFindProtocol('cond-1', 'Major Depression');
    assert.equal(dom.navCalls.at(-1), 'protocol-hub');
    window._libOpenPackage('major-depression');
    assert.equal(dom.navCalls.at(-1), 'condition-packages');
    dom.setConfirmResult(true);
    await window._libAdminRefresh();
    assert.equal(dom.toastCalls.at(-1).title, 'Refresh started');
    await window._libPromoteExternal(11, 'rTMS review');
    assert.equal(dom.toastCalls.at(-1).title, 'Promoted to library');
    window._libOpenPackage('');
    assert.equal(dom.toastCalls.at(-1).title, 'No package');

    window._libraryHubTab = 'evidence';
    await pgLibraryHub(() => {}, globalThis.window._nav);
    assert.match(dom.content.innerHTML, /External evidence search/);

    dom.setNode('lib-ext-q', { value: 'a' });
    dom.setNode('lib-ext-cond', { value: 'cond-1' });
    const results = dom.setNode('lib-ext-results');
    const draftPanel = dom.setNode('lib-ai-draft-panel');
    await window._libExternalSearch();
    assert.match(results.innerHTML, /Type at least 2 characters/);

    api.libraryExternalSearch = async () => ({ items: [] });
    dom.setNode('lib-ext-q', { value: 'rt' });
    await window._libExternalSearch();
    assert.match(results.innerHTML, /No matches in the curated ingest/);

    api.libraryExternalSearch = sampleExternalSearch;
    dom.setNode('lib-ext-q', { value: 'tms' });
    dom.setNode('lib-ext-cond', { value: 'cond-1' });
    await window._libExternalSearch();
    assert.match(results.innerHTML, /Unreviewed external results/);
    assert.match(results.innerHTML, /rTMS review/);

    draftPanel.innerHTML = '';
    await window._libAiDraft();
    assert.match(draftPanel.innerHTML, /Select at least one paper/);

    dom.setNode('lib-ai-1', { className: 'lib-ai-pick', checked: true, value: '11' });
    dom.setNode('lib-ai-2', { className: 'lib-ai-pick', checked: true, value: '12' });
    await window._libAiDraft();
    assert.match(draftPanel.innerHTML, /AI Evidence Draft/);
    assert.match(draftPanel.innerHTML, /Draft for 11, 12/);
  } finally {
    api.libraryOverview = originals.libraryOverview;
    api.listDevices = originals.listDevices;
    api.conditionPackageSlugs = originals.conditionPackageSlugs;
    api.listLiterature = originals.listLiterature;
    api.adminRefreshEvidence = originals.adminRefreshEvidence;
    api.promoteEvidencePaper = originals.promoteEvidencePaper;
    api.libraryExternalSearch = originals.libraryExternalSearch;
    api.librarySummarizeEvidence = originals.librarySummarizeEvidence;
    api.curateLiteraturePaper = originals.curateLiteraturePaper;
    authMod.setCurrentUser(originalUser);
    dom.restore();
  }
});

test('pgMonitorHub covers monitoring, adverse-event detail, classification, export, and reporting', async () => {
  const dom = installDomHarness();
  const originalUser = authMod.currentUser;
  const originals = {
    listPatients: api.listPatients,
    getClinicAlertSummary: api.getClinicAlertSummary,
    getPatientWearableSummary: api.getPatientWearableSummary,
    dismissAlertFlag: api.dismissAlertFlag,
    listAdverseEvents: api.listAdverseEvents,
    getAdverseEventsSummary: api.getAdverseEventsSummary,
    exportAdverseEventsCsv: api.exportAdverseEventsCsv,
    getAdverseEvent: api.getAdverseEvent,
    reviewAdverseEvent: api.reviewAdverseEvent,
    escalateAdverseEvent: api.escalateAdverseEvent,
    resolveAdverseEvent: api.resolveAdverseEvent,
    patchAdverseEvent: api.patchAdverseEvent,
    exportAdverseEventCioms: api.exportAdverseEventCioms,
    reportAdverseEvent: api.reportAdverseEvent,
  };
  authMod.setCurrentUser({ role: 'clinician' });
  Object.assign(api, sampleMonitorApi());
  window._monitorHubTab = 'monitoring';

  let topbarTitle = '';
  try {
    await pgMonitorHub((title) => { topbarTitle = title; }, globalThis.window._nav);
    assert.equal(topbarTitle, 'Monitor');
    assert.match(dom.content.innerHTML, /Alert Feed/);
    assert.match(dom.content.innerHTML, /Wearable Status/);
    await window._mhDismissAlert('alert-1');
    assert.equal(dom.toastCalls.at(-1).title, 'Alert dismissed');

    window._monitorHubTab = 'adverse';
    await pgMonitorHub((title) => { topbarTitle = title; }, globalThis.window._nav);
    assert.equal(topbarTitle, 'Monitor');
    assert.match(dom.content.innerHTML, /Adverse Events/);
    await window._mhAeExportCsv();
    assert.equal(dom.clickedDownload?.download, 'adverse-events.csv');
    assert.equal(dom.toastCalls.at(-1).title, 'CSV exported');

    await window._mhAeOpenDetail('ae-1');
    assert.ok(dom.bodyChildren.some((child) => child.id === 'mh-ae-detail-modal'));
    await window._mhAeReview('ae-1', false);
    assert.equal(dom.toastCalls.at(-1).title, 'Reviewed');
    await window._mhAeExportCioms('ae-1');
    assert.equal(dom.clickedDownload?.download, 'cioms.pdf');

    await window._mhAeOpenClassify('ae-1');
    dom.setNode('mh-cls-body', { value: 'nervous' });
    dom.setNode('mh-cls-exp', { value: 'expected' });
    dom.setNode('mh-cls-rel', { value: 'possible' });
    dom.setNode('mh-cls-sae', { value: 'hospitalization' });
    dom.setNode('mh-cls-pt', { value: 'Headache' });
    dom.setNode('mh-cls-soc', { value: 'Nervous system disorders' });
    await window._mhAeSubmitClassify('ae-1');
    assert.equal(dom.toastCalls.at(-1).title, 'Classification saved');

    window._mhAeOpenReport();
    await new Promise((resolve) => setTimeout(resolve, 75));
    dom.setNode('mh-ae-patient', { value: 'pat-1' });
    dom.setNode('mh-ae-type', { value: 'headache' });
    dom.setNode('mh-ae-sev', { value: 'moderate' });
    dom.setNode('mh-ae-onset', { value: 'during' });
    dom.setNode('mh-ae-body', { value: 'nervous' });
    dom.setNode('mh-ae-exp', { value: 'expected' });
    dom.setNode('mh-ae-rel', { value: 'possible' });
    dom.setNode('mh-ae-action', { value: 'none' });
    dom.setNode('mh-ae-saecrit', { value: 'hospitalization' });
    dom.setNode('mh-ae-desc', { value: 'Headache after session' });
    window._mhAeSuggestBody();
    await window._mhAeSubmit();
    assert.equal(dom.toastCalls.at(-1).title, 'Adverse event reported');
  } finally {
    api.listPatients = originals.listPatients;
    api.getClinicAlertSummary = originals.getClinicAlertSummary;
    api.getPatientWearableSummary = originals.getPatientWearableSummary;
    api.dismissAlertFlag = originals.dismissAlertFlag;
    api.listAdverseEvents = originals.listAdverseEvents;
    api.getAdverseEventsSummary = originals.getAdverseEventsSummary;
    api.exportAdverseEventsCsv = originals.exportAdverseEventsCsv;
    api.getAdverseEvent = originals.getAdverseEvent;
    api.reviewAdverseEvent = originals.reviewAdverseEvent;
    api.escalateAdverseEvent = originals.escalateAdverseEvent;
    api.resolveAdverseEvent = originals.resolveAdverseEvent;
    api.patchAdverseEvent = originals.patchAdverseEvent;
    api.exportAdverseEventCioms = originals.exportAdverseEventCioms;
    api.reportAdverseEvent = originals.reportAdverseEvent;
    authMod.setCurrentUser(originalUser);
    dom.restore();
  }
});
