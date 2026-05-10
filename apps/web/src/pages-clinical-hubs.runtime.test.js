import test from 'node:test';
import assert from 'node:assert/strict';

process.on('unhandledRejection', () => {});

function makeNode(id = '', extra = {}) {
  const classes = new Set();
  let innerHTML = '';
  const node = {
    id,
    tagName: 'DIV',
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
      if (typeof extra._onAppendChild === 'function') extra._onAppendChild(child);
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
  Object.defineProperty(node, 'innerHTML', {
    get() {
      return innerHTML;
    },
    set(value) {
      innerHTML = String(value ?? '');
      if (typeof extra._onInnerHTML === 'function') extra._onInnerHTML(innerHTML);
    },
  });
  if (extra.innerHTML != null) node.innerHTML = extra.innerHTML;
  return node;
}

function installDomHarness() {
  const saved = {
    window: globalThis.window,
    document: globalThis.document,
    localStorage: globalThis.localStorage,
    confirm: globalThis.confirm,
    prompt: globalThis.prompt,
    URL: globalThis.URL,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
  };

  const nodes = new Map();
  const anonymousNodes = [];
  const listeners = new Map();
  const localStore = new Map();
  const navCalls = [];
  const toastCalls = [];
  const bodyChildren = [];
  const urls = [];
  let clickedDownload = null;
  let confirmResult = true;
  let promptResult = '';
  let promptQueue = [];

  function registerNode(node) {
    if (node?.id) nodes.set(node.id, node);
    else if (node) anonymousNodes.push(node);
    return node;
  }

  function registerMarkup(markup) {
    if (typeof markup !== 'string' || !markup) return;
    const tagPattern = /<([a-z0-9-]+)([^>]*?)>/gi;
    let match;
    while ((match = tagPattern.exec(markup))) {
      const [, tagName, attrs] = match;
      const idMatch = attrs.match(/\bid="([^"]+)"/i);
      const classMatch = attrs.match(/\bclass="([^"]+)"/i);
      const testIdMatch = attrs.match(/\bdata-testid="([^"]+)"/i);
      const valueMatch = attrs.match(/\bvalue="([^"]*)"/i);
      const node = makeNode(idMatch?.[1] || '', {
        tagName: String(tagName).toUpperCase(),
        className: classMatch?.[1] || '',
        dataset: testIdMatch ? { testid: testIdMatch[1] } : {},
        value: valueMatch?.[1] || '',
        _onInnerHTML: registerMarkup,
        _onAppendChild(child) {
          registerNode(child);
          if (typeof child?.innerHTML === 'string') registerMarkup(child.innerHTML);
        },
      });
      if (classMatch?.[1]) {
        node.classList.add(...classMatch[1].split(/\s+/).filter(Boolean));
        node.className = classMatch[1];
      }
      registerNode(node);
    }
  }

  const content = makeNode('content', {
    _onInnerHTML: registerMarkup,
    _onAppendChild(child) {
      registerNode(child);
      if (typeof child?.innerHTML === 'string') registerMarkup(child.innerHTML);
    },
  });
  nodes.set('content', content);

  const body = makeNode('body', {
    appendChild(child) {
      bodyChildren.push(child);
      registerNode(child);
      if (typeof child?.innerHTML === 'string') registerMarkup(child.innerHTML);
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
      const el = makeNode('', {
        tagName: String(tag).toUpperCase(),
        _onInnerHTML: registerMarkup,
        _onAppendChild(child) {
          registerNode(child);
          if (typeof child?.innerHTML === 'string') registerMarkup(child.innerHTML);
        },
      });
      if (tag === 'a') {
        el.click = () => {
          clickedDownload = { href: el.href, download: el.download };
          el.clicked = true;
        };
      }
      return el;
    },
    addEventListener(type, fn) {
      listeners.set(type, fn);
    },
    removeEventListener(type, fn) {
      if (!fn || listeners.get(type) === fn) listeners.delete(type);
    },
    dispatchEvent(event) {
      const fn = listeners.get(event?.type);
      if (typeof fn === 'function') {
        fn(event);
        return true;
      }
      return false;
    },
    querySelector(selector) {
      const allNodes = [...nodes.values(), ...anonymousNodes];
      if (selector === '.d2p7-wrap') {
        return allNodes.find((node) => (node.className || '').split(/\s+/).includes('d2p7-wrap')) || null;
      }
      const testIdMatch = /^\[data-testid="([^"]+)"\]$/.exec(selector);
      if (testIdMatch) {
        return allNodes.find((node) => node?.dataset?.testid === testIdMatch[1]) || null;
      }
      return null;
    },
    querySelectorAll(selector) {
      if (selector === '.lib-ai-pick:checked') {
        return [...nodes.values(), ...anonymousNodes].filter((node) =>
          node && (node.className || '').split(/\s+/).includes('lib-ai-pick') && node.checked
        );
      }
      if (selector === '.d2p7-tabrow button') return [];
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
  globalThis.prompt = () => (promptQueue.length ? promptQueue.shift() : promptResult);
  globalThis.URL = { ...saved.URL, ...urlStub };
  globalThis.requestAnimationFrame = (fn) => setTimeout(() => fn?.(), 0);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
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
    prompt: (...args) => globalThis.prompt(...args),
    confirm: (...args) => globalThis.confirm(...args),
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
      promptQueue = [];
    },
    setPromptResults(values) {
      promptQueue = Array.isArray(values) ? values.slice() : [];
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
      globalThis.requestAnimationFrame = saved.requestAnimationFrame;
      globalThis.cancelAnimationFrame = saved.cancelAnimationFrame;
    },
  };
}

const authMod = await import('./auth.js');
const { api } = await import('./api.js');
const {
  pgClinicalHub,
  pgFinanceHub,
  pgPatientHub,
  pgProtocolStudio,
  pgReportsHubNew,
  pgSchedulingHub,
  pgLibraryHub,
  pgMonitorHub,
  pgMarketplaceHub,
  pgDocumentsHubNew,
  pgVirtualCareHub,
} = await import('./pages-clinical-hubs.js');

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
    marketplaceItems: async () => ({
      items: [
        {
          id: 'mp-1',
          kind: 'device',
          name: 'TMS Coil',
          provider: 'Neuro Supply',
          description: 'Clinic hardware listing',
          icon: '🧲',
          featured: true,
          price: 2500,
          price_unit: 'GBP',
          external_url: 'https://example.com/tms',
          clinical: true,
          source: 'marketplace',
        },
        {
          id: 'mp-2',
          kind: 'software',
          name: 'Outcome Tracker',
          provider: 'DS Studio',
          description: 'Outcome monitoring dashboard',
          icon: '💻',
          featured: false,
          price: 0,
          price_unit: 'USD',
          external_url: '',
          clinical: false,
          source: 'marketplace',
        },
        {
          id: 'mp-3',
          kind: 'course',
          name: 'Protocol Safety Course',
          provider: 'Education Lab',
          description: 'Training resource',
          icon: '📚',
          featured: false,
          price: 99,
          price_unit: 'GBP',
          external_url: 'https://example.com/course',
          clinical: false,
          source: 'marketplace',
        },
      ],
    }),
    marketplaceSellerMyItems: async () => ({ items: [] }),
    marketplaceSellerCreateItem: async (payload) => ({ ok: true, payload }),
    marketplaceSellerUpdateItem: async (id, payload) => ({ ok: true, id, payload }),
    marketplaceSellerDeleteItem: async () => ({ ok: true }),
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

test('pgReportsHubNew recent branch executes rendered export, sign, supersede, modal, and print flows', async () => {
  const dom = installDomHarness();
  const originalUser = authMod.currentUser;
  const originals = {
    listMyReports: api.listMyReports,
    getReportsSummary: api.getReportsSummary,
    renderStoredReport: api.renderStoredReport,
    exportReportDocx: api.exportReportDocx,
    exportReportCsv: api.exportReportCsv,
    signReport: api.signReport,
    supersedeReport: api.supersedeReport,
    logReportsAudit: api.logReportsAudit,
  };
  const auditEvents = [];
  authMod.setCurrentUser({ role: 'clinician' });
  globalThis.window._reportsHubTab = 'recent';
  globalThis.window._repStatusFilter = '';
  globalThis.window._repKindFilter = '';
  globalThis.window._repSearch = '';
  globalThis.localStorage.setItem('ds_reports_v1', JSON.stringify([
    {
      id: 'local-9',
      name: 'Local Draft',
      patient: 'Local Patient',
      type: 'Outcome',
      date: '2026-05-01',
      status: 'local-only',
      content: 'Local content',
      _source: 'local',
    },
  ]));
  api.listMyReports = async () => ({
    items: [
      {
        id: 'rep-1',
        name: 'Backend Outcome Report',
        patient: 'Alex Harper',
        type: 'Outcome',
        date: '2026-05-09',
        status: 'generated',
        content: 'Rendered content body',
        _source: 'backend',
      },
    ],
  });
  api.getReportsSummary = async () => ({ total: 2, draft: 1, signed: 0, superseded: 0 });
  api.renderStoredReport = async (id, params = {}) => ({
    blob: new Blob([`${id}:${params.format}`], { type: params.format === 'pdf' ? 'application/pdf' : 'text/html' }),
    filename: `report-${id}.${params.format}`,
  });
  api.exportReportDocx = async (id) => ({
    blob: new Blob([id], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }),
    filename: `report-${id}.docx`,
  });
  api.exportReportCsv = async (id) => ({
    blob: new Blob([id], { type: 'text/csv' }),
    filename: `report-${id}.csv`,
  });
  api.signReport = async (id, note) => ({ id, signed_by: note ? 'Dr Signoff' : 'Unknown' });
  api.supersedeReport = async (id) => ({ id: `${id}-v2` });
  api.logReportsAudit = async (payload) => { auditEvents.push(payload); };

  const openedWindows = [];
  globalThis.window.open = (url = '', target = '', features = '') => {
    const opened = {
      url,
      target,
      features,
      focused: false,
      printed: false,
      documentWrites: '',
      document: {
        write(html) {
          opened.documentWrites += html;
        },
        close() {},
      },
      focus() {
        opened.focused = true;
      },
      print() {
        opened.printed = true;
      },
    };
    openedWindows.push(opened);
    return opened;
  };

  try {
    await pgReportsHubNew(() => {}, globalThis.window._nav);
    assert.match(dom.content.innerHTML, /Recent Reports/);
    assert.match(dom.content.innerHTML, /Outcome report/);
    assert.match(dom.content.innerHTML, /Local Draft/);

    globalThis.window._reportsHubAudit('filter_changed', 'status=signed');
    assert.equal(auditEvents.at(-1).event, 'filter_changed');

    await globalThis.window._repDownloadDocx('rep-1');
    assert.equal(dom.clickedDownload?.download, 'report-rep-1.docx');
    assert.equal(dom.toastCalls.at(-1).title, 'DOCX ready');

    await globalThis.window._repDownloadCsv('rep-1');
    assert.equal(dom.clickedDownload?.download, 'report-rep-1.csv');
    assert.equal(dom.toastCalls.at(-1).title, 'CSV ready');

    dom.setPromptResult('Signed after review');
    await globalThis.window._repSign('rep-1');
    assert.equal(dom.toastCalls.at(-1).title, 'Signed');
    assert.equal(dom.navCalls.at(-1), 'reports-v2');

    dom.setPromptResult('no');
    await globalThis.window._repSupersede('rep-1');
    assert.equal(dom.toastCalls.at(-1).title, 'Reason required');

    dom.setPromptResult('Updated evidence synthesis');
    await globalThis.window._repSupersede('rep-1');
    assert.equal(dom.toastCalls.at(-1).title, 'Superseded');
    assert.equal(dom.navCalls.at(-1), 'reports-v2');

    await globalThis.window._repOpenRenderedHtml('rep-1');
    assert.equal(openedWindows.at(-1).url.startsWith('blob:mock-'), true);

    await globalThis.window._repDownloadPdf('rep-1');
    assert.equal(dom.clickedDownload?.download, 'report-rep-1.pdf');
    assert.equal(dom.toastCalls.at(-1).title, 'PDF ready');

    globalThis.window._repViewSaved('rep-1');
    assert.match(dom.bodyChildren.at(-1).innerHTML, /Rendered content body/);

    await globalThis.window._repPrintSaved('local-9');
    assert.match(openedWindows.at(-1).documentWrites, /Local Draft/);

    await globalThis.window._repOpenRenderedHtml('local-9');
    assert.equal(dom.toastCalls.at(-1).title, 'HTML unavailable');
  } finally {
    api.listMyReports = originals.listMyReports;
    api.getReportsSummary = originals.getReportsSummary;
    api.renderStoredReport = originals.renderStoredReport;
    api.exportReportDocx = originals.exportReportDocx;
    api.exportReportCsv = originals.exportReportCsv;
    api.signReport = originals.signReport;
    api.supersedeReport = originals.supersedeReport;
    api.logReportsAudit = originals.logReportsAudit;
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

test('pgPatientHub covers registry actions, quick filters, note submit, and drill-outs', async () => {
  const dom = installDomHarness();
  const originalUser = authMod.currentUser;
  const originals = {
    getPatientsCohortSummary: api.getPatientsCohortSummary,
    listPatients: api.listPatients,
    createClinicianNote: api.createClinicianNote,
    recordPatientProfileAuditEvent: api.recordPatientProfileAuditEvent,
    getNotificationsUnreadCount: api.getNotificationsUnreadCount,
  };
  const listCalls = [];
  const notePayloads = [];
  const auditEvents = [];
  const todayAt = (hour) => {
    const d = new Date();
    d.setHours(hour, 0, 0, 0);
    return d.toISOString();
  };
  const patients = [
    {
      id: 'pat-1',
      first_name: 'Alex',
      last_name: 'Harper',
      status: 'active',
      primary_modality: 'tms',
      condition_slug: 'depression',
      planned_sessions_total: 20,
      sessions_delivered: 8,
      primary_scale: 'PHQ-9',
      baseline_score: 18,
      current_score: 10,
      next_session_at: todayAt(9),
      assigned_clinician_name: 'Dr Ada',
      home_adherence: 0.88,
      created_at: new Date(Date.now() - (2 * 86400000)).toISOString(),
    },
    {
      id: 'pat-2',
      first_name: 'Bianca',
      last_name: 'Stone',
      status: 'active',
      primary_modality: 'tdcs',
      condition_slug: 'anxiety',
      planned_sessions_total: 12,
      sessions_delivered: 12,
      outcome_trend: 'improved',
      next_session_id: 'sess-200',
      assigned_clinician_name: 'Dr Turing',
      created_at: new Date(Date.now() - (20 * 86400000)).toISOString(),
      is_responder: true,
    },
    {
      id: 'pat-3',
      first_name: 'Jordan',
      last_name: 'Miles',
      status: 'intake',
      primary_modality: 'qeeg',
      condition_slug: 'adhd',
      planned_sessions_total: 0,
      sessions_delivered: 0,
      has_adverse_event: true,
      assessment_overdue: true,
      assigned_clinician_name: 'Dr Ada',
      created_at: new Date(Date.now() - 86400000).toISOString(),
    },
  ];

  authMod.setCurrentUser({ role: 'clinician', id: 'clin-1' });
  Object.assign(api, {
    getPatientsCohortSummary: async () => ({
      total: 60,
      status_counts: { all: 60, active: 42, intake: 8, discharging: 5, on_hold: 3, archived: 2 },
      distinct: {
        conditions: [{ value: 'depression', label: 'Depression', count: 20 }],
        modalities: [{ value: 'tms', label: 'TMS', count: 18 }],
        clinicians: [{ value: 'Dr Ada', label: 'Dr Ada', count: 22 }],
      },
      kpis: {
        active_courses: 42,
        active_courses_delta_7d: 3,
        phq_delta_avg: -5.4,
        phq_delta_n: 17,
        responder_rate_pct: 61,
        responder_n: 17,
        homework_adherence_pct: 81,
        homework_adherence_n: 28,
        follow_up_count: 4,
        follow_up_overdue_7d: 1,
        discharged_this_quarter: 6,
      },
    }),
    listPatients: async (params = {}) => {
      listCalls.push({ ...params });
      return { items: patients, total: 60 };
    },
    createClinicianNote: async (payload) => {
      notePayloads.push(payload);
      return { id: `note-${notePayloads.length}`, ...payload };
    },
    recordPatientProfileAuditEvent: async (pid, payload) => {
      auditEvents.push({ pid, ...payload });
      return { ok: true };
    },
    getNotificationsUnreadCount: async () => ({ count: 2 }),
  });

  let topbarTitle = '';
  let topbarActions = '';
  try {
    await pgPatientHub((title, actions = '') => {
      topbarTitle = title;
      topbarActions = actions;
    }, globalThis.window._nav);
    for (let i = 0; i < 10; i += 1) {
      if (globalThis.document.getElementById('d2p7-list')?.innerHTML) break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }

    assert.equal(topbarTitle, 'Patients');
    assert.match(topbarActions, /DeepTwin/);
    assert.match(topbarActions, /Add patient/);
    assert.match(globalThis.document.getElementById('d2p7-list').innerHTML, /Alex Harper/);
    assert.match(globalThis.document.getElementById('d2p7-list').innerHTML, /Jordan Miles/);
    assert.match(globalThis.document.getElementById('d2p7-kpi-grid').innerHTML, /Active course/);
    assert.match(globalThis.document.getElementById('ds-pt-right').innerHTML, /Today's Queue/);

    window._phSetQuickFilter('adverse');
    assert.equal(window._phState.activeQuickFilter, 'adverse');
    assert.match(globalThis.document.getElementById('d2p7-list').innerHTML, /Jordan Miles/);

    window._phToggleDensity();
    assert.equal(globalThis.localStorage.getItem('ds.patients.density'), 'comfortable');

    await window._phSetStatus('active');
    await window._phSetFacet('condition', 'depression');
    await window._phSetFacet('sort', 'name');
    await window._phGoPage(1);
    assert.equal(window._phState.page, 2);
    assert.deepEqual(listCalls.at(-1), {
      status: 'active',
      q: undefined,
      condition: 'depression',
      modality: undefined,
      clinician: undefined,
      sort: 'name',
      limit: 10,
      offset: 10,
    });

    window._phQuickNote('pat-1');
    const quickNote = globalThis.document.getElementById('ds-pt-quicknote-text');
    assert.ok(quickNote);
    quickNote.value = 'Sleep improved after session.';
    await window._phSubmitQuickNote('pat-1');
    assert.deepEqual(notePayloads, [{
      patient_id: 'pat-1',
      content: 'Sleep improved after session.',
      body: 'Sleep improved after session.',
    }]);
    assert.equal(dom.toastCalls.at(-1).title, 'Patients');
    assert.match(dom.toastCalls.at(-1).body, /clinician-notes pipeline/);

    window._phStartSession('pat-2');
    assert.equal(dom.navCalls.at(-1), 'session-runner');
    window._phStartSession('pat-1');
    assert.equal(dom.navCalls.at(-1), 'scheduling-hub');
    window._phStartSession('pat-3');
    assert.equal(dom.toastCalls.at(-1).title, 'Patients');
    assert.match(dom.toastCalls.at(-1).body, /No session scheduled for Jordan Miles today/);

    window._phMessage('pat-3');
    assert.equal(dom.navCalls.at(-1), 'messaging');
    window._phOpenChart('pat-1');
    assert.equal(dom.navCalls.at(-1), 'patient-profile');
    window._phOpenAnalytics('pat-2');
    assert.equal(dom.navCalls.at(-1), 'patient-analytics');
    window._phNavigatePatientModule('pat-1', 'protocol-studio', 'registry_open_protocol');
    assert.equal(dom.navCalls.at(-1), 'protocol-studio');
    window._phNavigatePatientModule('pat-1', 'not-a-real-route', 'registry_bad_route');
    assert.ok(dom.toastCalls.some((toast) =>
      toast?.title === 'Module unavailable'
      || /module is not available/i.test(toast?.body || '')
    ));

    window._phToggleShortcuts();
    assert.equal(window._phState.shortcutsOpen, true);
    assert.match(globalThis.document.getElementById('ds-pt-overlay').innerHTML, /Keyboard shortcuts/);
    window._phOpenNotifications();
    assert.equal(dom.navCalls.at(-1), 'review-queue');

    assert.ok(auditEvents.some((event) => event.event === 'registry_open_profile' && event.pid === 'pat-1'));
    assert.ok(auditEvents.some((event) => event.event === 'registry_open_analytics' && event.pid === 'pat-2'));
    assert.ok(auditEvents.some((event) => event.event === 'registry_open_protocol' && event.pid === 'pat-1'));
  } finally {
    await new Promise((resolve) => setTimeout(resolve, 20));
    api.getPatientsCohortSummary = originals.getPatientsCohortSummary;
    api.listPatients = originals.listPatients;
    api.createClinicianNote = originals.createClinicianNote;
    api.recordPatientProfileAuditEvent = originals.recordPatientProfileAuditEvent;
    api.getNotificationsUnreadCount = originals.getNotificationsUnreadCount;
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

test('pgMarketplaceHub covers governance, seller gate, no-url booking, and empty seller dashboard', async () => {
  const dom = installDomHarness();
  const originalUser = authMod.currentUser;
  const originals = {
    marketplaceItems: api.marketplaceItems,
    marketplaceSellerMyItems: api.marketplaceSellerMyItems,
    marketplaceSellerCreateItem: api.marketplaceSellerCreateItem,
    marketplaceSellerUpdateItem: api.marketplaceSellerUpdateItem,
    marketplaceSellerDeleteItem: api.marketplaceSellerDeleteItem,
    logAudit: api.logAudit,
  };
  const stubApi = sampleLibraryApi();
  Object.assign(api, {
    marketplaceItems: stubApi.marketplaceItems,
    marketplaceSellerMyItems: stubApi.marketplaceSellerMyItems,
    marketplaceSellerCreateItem: stubApi.marketplaceSellerCreateItem,
    marketplaceSellerUpdateItem: stubApi.marketplaceSellerUpdateItem,
    marketplaceSellerDeleteItem: stubApi.marketplaceSellerDeleteItem,
    logAudit: async () => ({ ok: true }),
  });

  try {
    globalThis.window._showToast = (msg, kind) => {
      dom.toastCalls.push({ title: msg, kind });
    };

    authMod.setCurrentUser({ role: 'guest' });
    let topbarTitle = '';
    await pgMarketplaceHub((title) => { topbarTitle = title; }, globalThis.window._nav);
    assert.equal(topbarTitle, 'Marketplace');
    assert.match(dom.content.innerHTML, /mp-governance-copy/);
    assert.match(dom.content.innerHTML, /Listing management requires a clinician/);
    globalThis.window._mpBook('mp-2');
    assert.equal(dom.toastCalls.at(-1).kind, 'info');
    globalThis.window._mpListNew();
    assert.equal(dom.toastCalls.at(-1).kind, 'error');

    authMod.setCurrentUser({ role: 'admin', package_id: 'pro' });
    await pgMarketplaceHub((title) => { topbarTitle = title; }, globalThis.window._nav);
    assert.equal(topbarTitle, 'Marketplace');
    assert.match(dom.content.innerHTML, /Clinic marketplace/);
    assert.match(dom.content.innerHTML, /Featured/);
    assert.match(dom.content.innerHTML, /No external link/);
    await globalThis.window._mpMyListings();
    assert.ok(dom.bodyChildren.some((child) => child.id === 'mp-list-modal'));
    assert.match(globalThis.document.getElementById('mp-mylistings-content').innerHTML, /You have no listings yet/);
    globalThis.window._mpBook('mp-2');
    assert.equal(dom.toastCalls.at(-1).kind, 'info');
    await new Promise((resolve) => setTimeout(resolve, 0));
  } finally {
    api.marketplaceItems = originals.marketplaceItems;
    api.marketplaceSellerMyItems = originals.marketplaceSellerMyItems;
    api.marketplaceSellerCreateItem = originals.marketplaceSellerCreateItem;
    api.marketplaceSellerUpdateItem = originals.marketplaceSellerUpdateItem;
    api.marketplaceSellerDeleteItem = originals.marketplaceSellerDeleteItem;
    api.logAudit = originals.logAudit;
    authMod.setCurrentUser(originalUser);
    dom.restore();
  }
});

test('pgClinicalHub covers outcomes, scoring, and registry tabs', async () => {
  const dom = installDomHarness();
  const originalUser = authMod.currentUser;
  const originals = {
    listCourses: api.listCourses,
    listPatients: api.listPatients,
  };
  authMod.setCurrentUser({ role: 'clinician' });
  api.listCourses = async () => ({
    items: [
      { id: 'course-1', status: 'active', patient_id: 'pat-1', condition_slug: 'major-depression', sessions_delivered: 8, planned_sessions_total: 20 },
      { id: 'course-2', status: 'completed', patient_id: 'pat-2', condition_slug: 'ocd', sessions_delivered: 12, planned_sessions_total: 12 },
    ],
  });
  api.listPatients = async () => ({
    items: [
      { id: 'pat-1', first_name: 'Alex', last_name: 'Harper' },
      { id: 'pat-2', first_name: 'Bianca', last_name: 'Stone' },
    ],
  });

  try {
    globalThis.window._clinicalHubTab = 'outcomes';
    await pgClinicalHub((title) => { dom.lastTopbar = title; }, globalThis.window._nav);
    assert.equal(dom.lastTopbar, 'Clinical Hub');
    assert.match(dom.content.innerHTML, /Patient Outcomes/);
    assert.match(dom.content.innerHTML, /Alex Harper/);

    globalThis.window._clinicalHubTab = 'scoring';
    await pgClinicalHub(() => {}, globalThis.window._nav);
    assert.match(dom.content.innerHTML, /Scale Calculator/);
    dom.setNode('sc-score-input', { value: '17' });
    globalThis.window._scScoringRender();
    assert.match(globalThis.document.getElementById('sc-result').innerHTML, /Mod\. Severe|Severe/);

    globalThis.window._clinicalHubTab = 'registry';
    await pgClinicalHub(() => {}, globalThis.window._nav);
    assert.match(dom.content.innerHTML, /Assessment Registry/);
    dom.setNode('reg-search', { value: 'PHQ' });
    globalThis.window._regSetDomain('Depression');
    globalThis.window._regSetType('Self-report');
    assert.match(globalThis.document.getElementById('reg-list').innerHTML, /PHQ-9/);
  } finally {
    api.listCourses = originals.listCourses;
    api.listPatients = originals.listPatients;
    authMod.setCurrentUser(originalUser);
    dom.restore();
  }
});

test('pgProtocolStudio covers patient restriction, generate, save, export, and drafts flows', async () => {
  const dom = installDomHarness();
  const originalUser = authMod.currentUser;
  const originals = {
    listConditions: api.listConditions,
    listDevices: api.listDevices,
    listModalities: api.listModalities,
    listSavedProtocols: api.listSavedProtocols,
    protocolStudioEvidenceHealth: api.protocolStudioEvidenceHealth,
    protocolStudioProtocols: api.protocolStudioProtocols,
    protocolStudioPatientContext: api.protocolStudioPatientContext,
    protocolStudioEvidenceSearch: api.protocolStudioEvidenceSearch,
    protocolStudioProtocol: api.protocolStudioProtocol,
    protocolStudioGenerate: api.protocolStudioGenerate,
    saveProtocol: api.saveProtocol,
    exportProtocolDocx: api.exportProtocolDocx,
    exportHandbookDocx: api.exportHandbookDocx,
    exportPatientGuideDocx: api.exportPatientGuideDocx,
    recordPatientProfileAuditEvent: api.recordPatientProfileAuditEvent,
  };
  const savedPayloads = [];
  const auditEvents = [];
  const originalNotifToast = globalThis.window._showNotifToast;
  const originalShowToast = globalThis.window._showToast;
  authMod.setCurrentUser({ role: 'clinician', email: 'clinician@example.test' });
  globalThis.window._showNotifToast = (payload) => dom.toastCalls.push(payload);
  globalThis.window._showToast = (msg, kind) => {
    dom.toastCalls.push({ title: msg, kind });
  };
  globalThis.window._protocolHubTab = 'generate';
  globalThis.window._protocolHubCondition = { id: 'major-depression', name: 'Major Depression' };

  try {
    await pgProtocolStudio((title) => { dom.lastTopbar = title; }, globalThis.window._nav);
    globalThis.window._builderPatientId = 'pat-1';
    globalThis.window._protocolHubTab = 'generate';
    api.listConditions = async () => ({
      items: [
        { id: 'major-depression', name: 'Major Depression', abbr: 'MDD', evidence_grade: 'A', rcts: 41, description: 'Major depressive disorder', category: 'Mood' },
      ],
    });
    api.listDevices = async () => ({
      items: [
        { id: 'dev-1', name: 'NeuroLoop 3000', manufacturer: 'Acme', modality: 'tDCS', evidence_grade: 'A', fda_clearance: true },
      ],
    });
    api.listModalities = async () => ({
      items: [
        { id: 'tdcs', name: 'tDCS', grade: 'A', rcts: 32, sub: 'Transcranial direct current stimulation', meta: 'Recommended' },
      ],
    });
    api.listSavedProtocols = async () => ({
      items: [
        {
          id: 'draft-1',
          name: 'Draft One',
          condition: 'major-depression',
          device_slug: 'dev-1',
          governance_state: 'approved',
          created_at: '2026-05-08T12:00:00Z',
          parameters_json: { modality: 'tdcs', phenotype: 'anxious', target: 'DLPFC-L', montage: 'classic' },
        },
      ],
    });
    api.protocolStudioEvidenceHealth = async () => ({
      local_evidence_available: true,
      fallback_mode: 'indexed',
      safe_user_message: 'Indexed corpus available.',
    });
    api.protocolStudioProtocols = async () => ({
      items: [
        { id: 'prot-1', title: 'MDD tDCS Standard', status: 'approved', condition: 'major-depression', modality: 'tDCS', target: 'DLPFC-L', evidence_refs: ['ref-1'], evidence_grade: 'A' },
      ],
    });
    api.protocolStudioPatientContext = async () => ({
      completeness_score: '80%',
      sources: {
        eeg: { available: true, count: 1, last_updated: '2026-05-08T12:00:00Z' },
        meds: { available: false, count: 0 },
      },
      missing_data: ['meds'],
      safety_flags: { seizure_history: false },
    });
    api.protocolStudioEvidenceSearch = async () => ({
      status: 'ok',
      message: 'Search complete',
      results: [
        { id: 'ev-1', title: 'tDCS for depression', year: '2024', source: 'PMC', link: 'https://example.com/t1', summary: 'Positive trial.' },
      ],
    });
    api.protocolStudioProtocol = async () => ({ title: 'MDD tDCS Standard', off_label: false, evidence_refs: ['ref-1'] });
    api.protocolStudioGenerate = async (payload) => ({
      status: 'ok',
      evidence_grade: 'A',
      approval_status_badge: 'draft',
      rationale: `${payload.condition} / ${payload.modality}`,
      target_region: 'DLPFC',
      session_frequency: '3 / week',
      duration: '6 weeks',
      monitoring_plan: ['Monitor mood weekly'],
      contraindications: [],
      evidence_links: ['ref-1'],
      disclaimers: { general_disclaimer: 'Decision-support only.' },
      parameters: { modality_id: 'tdcs', target_region: 'DLPFC', sessions_per_week: 3, session_duration: 20, total_course: 18 },
      protocol_summary: 'Registry-backed draft',
      off_label_review_required: false,
    });
    api.saveProtocol = async (payload) => {
      savedPayloads.push(payload);
      return { ok: true, id: 'saved-1', ...payload };
    };
    api.exportProtocolDocx = async () => new Blob(['protocol-docx']);
    api.exportHandbookDocx = async () => new Blob(['handbook-docx']);
    api.exportPatientGuideDocx = async () => new Blob(['patient-guide-docx']);
    api.recordPatientProfileAuditEvent = async (pid, payload) => {
      auditEvents.push({ pid, ...payload });
      return { ok: true };
    };

    await pgProtocolStudio((title) => { dom.lastTopbar = title; }, globalThis.window._nav);
    assert.match(dom.lastTopbar, /Protocol Studio/);
    await globalThis.window._studioRenderDrafts();
    assert.match(globalThis.document.getElementById('studio-drafts-list').innerHTML, /Draft One/);

    globalThis.window._studioState.patientMeta = '34F · seizure history';
    globalThis.window._studioPick('condition', 'major-depression');
    globalThis.window._studioPick('phenotype', 'anxious');
    globalThis.window._studioPick('modality', 'rtms');
    globalThis.window._studioPick('device', 'dev-1');
    globalThis.window._studioPick('target', 'DLPFC-L');
    globalThis.window._studioPick('montage', 'bilateral');
    assert.match(dom.content.innerHTML, /Safety warnings|Safety engine/);
    assert.equal(globalThis.window._studioState.target, 'DLPFC-L');

    globalThis.window._studioState.patientId = null;
    await globalThis.window._studioSave();
    assert.equal(dom.toastCalls.at(-1).kind, 'warning');

    globalThis.window._studioState.patientId = 'pat-1';
    await globalThis.window._studioSave();
    assert.equal(savedPayloads.at(-1).governance_state, 'draft');
    assert.equal(dom.toastCalls.at(-1).kind, 'success');

    await globalThis.window._studioExport();
    assert.equal(savedPayloads.at(-1).governance_state, 'submitted');
    assert.equal(dom.toastCalls.at(-1).kind, 'success');

    globalThis.window._studioState.patientId = 'pat-1';
    globalThis.window._studioRefreshDrafts();
    await globalThis.window._studioRenderDrafts();
    assert.match(globalThis.document.getElementById('studio-drafts-list').innerHTML, /Draft One/);
  } finally {
    api.listConditions = originals.listConditions;
    api.listDevices = originals.listDevices;
    api.listModalities = originals.listModalities;
    api.listSavedProtocols = originals.listSavedProtocols;
    api.protocolStudioEvidenceHealth = originals.protocolStudioEvidenceHealth;
    api.protocolStudioProtocols = originals.protocolStudioProtocols;
    api.protocolStudioPatientContext = originals.protocolStudioPatientContext;
    api.protocolStudioEvidenceSearch = originals.protocolStudioEvidenceSearch;
    api.protocolStudioProtocol = originals.protocolStudioProtocol;
    api.protocolStudioGenerate = originals.protocolStudioGenerate;
    api.saveProtocol = originals.saveProtocol;
    api.exportProtocolDocx = originals.exportProtocolDocx;
    api.exportHandbookDocx = originals.exportHandbookDocx;
    api.exportPatientGuideDocx = originals.exportPatientGuideDocx;
    api.recordPatientProfileAuditEvent = originals.recordPatientProfileAuditEvent;
    authMod.setCurrentUser(originalUser);
    globalThis.window._showNotifToast = originalNotifToast;
    globalThis.window._showToast = originalShowToast;
    dom.restore();
  }
});

test('pgDocumentsHubNew covers documents lifecycle, template flows, downloads, and export', async () => {
  const dom = installDomHarness();
  const originals = {
    listDocuments: api.listDocuments,
    listPatients: api.listPatients,
    getDocumentsSummary: api.getDocumentsSummary,
    logDocumentsAudit: api.logDocumentsAudit,
    listDocumentTemplates: api.listDocumentTemplates,
    createDocumentTemplate: api.createDocumentTemplate,
    deleteDocumentTemplate: api.deleteDocumentTemplate,
    createDocument: api.createDocument,
    documentDownloadUrl: api.documentDownloadUrl,
    getDocument: api.getDocument,
    signDocument: api.signDocument,
    supersedeDocument: api.supersedeDocument,
    deleteDocument: api.deleteDocument,
    exportDocumentsZip: api.exportDocumentsZip,
  };
  const auditEvents = [];
  const createdTemplates = [];
  const createdDocuments = [];
  const signCalls = [];
  const supersedeCalls = [];
  const deleteCalls = [];
  const deleteTemplateCalls = [];

  try {
    globalThis.window._docsHubTab = 'all';
    globalThis.window.location.href = 'https://studio.local/?page=documents-v2';
    globalThis.window.location.search = '?page=documents-v2';

    api.listDocuments = async () => ({
      items: [
        {
          id: '123e4567-e89b-12d3-a456-426614174000',
          title: 'Intake Note',
          doc_type: 'clinical',
          patient_id: 'pat-1',
          updated_at: '2026-05-10T08:00:00Z',
          status: 'pending',
          file_ref: 'file-1',
          notes: 'Observed stable mood and adequate sleep.',
          revision: 1,
        },
      ],
    });
    api.listPatients = async () => ({
      items: [{ id: 'pat-1', first_name: 'Alex', last_name: 'Harper' }],
    });
    api.getDocumentsSummary = async () => ({
      total: 1,
      draft: 1,
      signed: 0,
      superseded: 0,
      demo: 0,
      disclaimers: ['Custom disclaimer'],
    });
    api.logDocumentsAudit = async (payload) => {
      auditEvents.push(payload);
      return { ok: true };
    };
    api.listDocumentTemplates = async () => ({
      items: [
        {
          id: 'tpl-custom-1',
          name: 'GP Letter Custom',
          doc_type: 'letter',
          body_markdown: 'Dear {{patient_name}},\\n\\nFollow-up note.',
        },
      ],
    });
    api.createDocumentTemplate = async (payload) => {
      createdTemplates.push(payload);
      return { id: 'tpl-created' };
    };
    api.deleteDocumentTemplate = async (id) => {
      deleteTemplateCalls.push(id);
      return { ok: true };
    };
    api.createDocument = async (payload) => {
      createdDocuments.push(payload);
      return { id: `doc-${createdDocuments.length}` };
    };
    api.documentDownloadUrl = (id) => `https://download.local/${id}`;
    api.getDocument = async () => ({
      id: '123e4567-e89b-12d3-a456-426614174000',
      title: 'Intake Note',
      notes: 'Observed stable mood and adequate sleep.',
    });
    api.signDocument = async (docId, note) => {
      signCalls.push({ docId, note });
      return { ok: true };
    };
    api.supersedeDocument = async (docId, payload) => {
      supersedeCalls.push({ docId, payload });
      return { revision: 2 };
    };
    api.deleteDocument = async (docId) => {
      deleteCalls.push(docId);
      return { ok: true };
    };
    api.exportDocumentsZip = async () => new Blob(['zip']);

    let topbarTitle = '';
    await pgDocumentsHubNew((title) => { topbarTitle = title; }, globalThis.window._nav);
    assert.equal(topbarTitle, 'Documents');
    assert.match(dom.content.innerHTML, /Clinical document workspace/);
    assert.match(dom.content.innerHTML, /Intake Note/);
    assert.match(dom.content.innerHTML, /Custom disclaimer/);

    await globalThis.window._docsPreviewNotes('123e4567-e89b-12d3-a456-426614174000');
    assert.ok(dom.bodyChildren.some((child) => child.id === 'docs-notes-preview-modal'));

    globalThis.window._docsOpenPatient('pat-1');
    assert.equal(dom.navCalls.at(-1), 'patients-v2');

    globalThis.window._docsOpenSourceModule('schedule');
    assert.equal(dom.navCalls.at(-1), 'schedule-v2');
    globalThis.window._docsOpenSourceModule('unknown');
    assert.equal(dom.toastCalls.at(-1).title, 'Open module');

    globalThis.window._docsDownload('123e4567-e89b-12d3-a456-426614174000', 'Intake Note', true);
    assert.equal(dom.clickedDownload?.href, 'https://download.local/123e4567-e89b-12d3-a456-426614174000');
    assert.equal(dom.clickedDownload?.download, 'Intake Note');

    globalThis.window._docsDownload('tpl-custom-1', 'Custom Template', false);
    assert.equal(dom.clickedDownload?.download, 'Custom Template.txt');

    dom.setPromptResult('Final clinician review');
    await globalThis.window._docsSign('123e4567-e89b-12d3-a456-426614174000');
    assert.deepStrictEqual(signCalls.at(-1), {
      docId: '123e4567-e89b-12d3-a456-426614174000',
      note: 'Final clinician review',
    });
    assert.equal(dom.toastCalls.at(-1).title, 'Signed');

    dom.setPromptResult('no');
    await globalThis.window._docsSupersede('123e4567-e89b-12d3-a456-426614174000', 'Intake Note');
    assert.equal(dom.toastCalls.at(-1).title, 'Reason required');

    dom.setPromptResults(['Correction after review', 'Intake Note v2']);
    await globalThis.window._docsSupersede('123e4567-e89b-12d3-a456-426614174000', 'Intake Note');
    assert.deepStrictEqual(supersedeCalls.at(-1), {
      docId: '123e4567-e89b-12d3-a456-426614174000',
      payload: { reason: 'Correction after review', new_title: 'Intake Note v2' },
    });
    assert.equal(dom.toastCalls.at(-1).title, 'Revision created');

    dom.setConfirmResult(true);
    await globalThis.window._docsDelete('123e4567-e89b-12d3-a456-426614174000', 'Intake Note');
    assert.equal(deleteCalls.at(-1), '123e4567-e89b-12d3-a456-426614174000');
    assert.equal(dom.toastCalls.at(-1).title, 'Deleted');

    await globalThis.window._docsExport();
    assert.equal(dom.clickedDownload?.download, 'documents-export.zip');
    assert.equal(dom.toastCalls.at(-1).title, 'Export ready');
    assert.ok(auditEvents.some((evt) => evt?.event === 'exported'));

    globalThis.window._docsHubTab = 'templates';
    await pgDocumentsHubNew(() => {}, globalThis.window._nav);
    assert.match(dom.content.innerHTML, /Document Templates/);
    assert.match(dom.content.innerHTML, /GP Letter Custom/);

    globalThis.window._docOpenTemplateBuilder();
    await globalThis.window._docSaveTemplate();
    assert.equal(dom.toastCalls.at(-1).title, 'Name required');

    globalThis.document.getElementById('tpl-builder-name').value = 'Clinic Summary Template';
    globalThis.document.getElementById('tpl-builder-type').value = 'report';
    globalThis.document.getElementById('tpl-builder-body').value = '## Summary';
    await globalThis.window._docSaveTemplate();
    assert.deepStrictEqual(createdTemplates.at(-1), {
      name: 'Clinic Summary Template',
      doc_type: 'report',
      body_markdown: '## Summary',
    });
    assert.equal(dom.toastCalls.at(-1).title, 'Template saved');

    globalThis.window._docsPreview('tpl-custom-1');
    assert.ok(dom.bodyChildren.some((child) => child.id === 'docs-preview-modal'));

    await globalThis.window._docsSendTemplate('tpl-custom-1');
    assert.deepStrictEqual(createdDocuments.at(-1), {
      title: 'GP Letter Custom',
      doc_type: 'clinical',
      template_id: 'tpl-custom-1',
      status: 'pending',
      notes: 'Sent from Documents Hub template',
    });
    assert.equal(dom.toastCalls.at(-1).title, 'Sent');

    await globalThis.window._docDeleteTemplate('tpl-custom-1');
    assert.equal(deleteTemplateCalls.at(-1), 'tpl-custom-1');
    assert.equal(dom.toastCalls.at(-1).title, 'Template deleted');
  } finally {
    Object.assign(api, originals);
    dom.restore();
  }
});

test('pgDocumentsHubNew covers letters generation, draft save, uploads, and file-post success toasts', async () => {
  const dom = installDomHarness();
  const originals = {
    listDocuments: api.listDocuments,
    listPatients: api.listPatients,
    getDocumentsSummary: api.getDocumentsSummary,
    chatClinician: api.chatClinician,
    createDocument: api.createDocument,
    uploadDocument: api.uploadDocument,
    logDocumentsAudit: api.logDocumentsAudit,
    listDocumentTemplates: api.listDocumentTemplates,
  };
  const createdDocuments = [];
  const uploadCalls = [];
  const auditEvents = [];

  try {
    globalThis.window._docsHubTab = 'letters';
    globalThis.window.location.href = 'https://studio.local/?page=documents-v2';
    globalThis.window.location.search = '?page=documents-v2';

    api.listDocuments = async () => ({
      items: [
        {
          id: 'letter-1',
          title: 'Prior Letter',
          doc_type: 'letter',
          patient_id: 'pat-1',
          updated_at: '2026-05-10T08:00:00Z',
          status: 'pending',
          notes: 'Stored draft body',
        },
      ],
    });
    api.listPatients = async () => ({
      items: [{ id: 'pat-1', first_name: 'Alex', last_name: 'Harper' }],
    });
    api.getDocumentsSummary = async () => ({ total: 1, draft: 1, signed: 0, superseded: 0 });
    api.chatClinician = async () => ({ message: 'Draft GP letter for Alex Harper' });
    api.createDocument = async (payload) => {
      createdDocuments.push(payload);
      return { id: `doc-${createdDocuments.length}` };
    };
    api.uploadDocument = async (formData) => {
      uploadCalls.push(formData.get('title'));
      return { id: `upload-${uploadCalls.length}` };
    };
    api.logDocumentsAudit = async (payload) => {
      auditEvents.push(payload);
      return { ok: true };
    };
    api.listDocumentTemplates = async () => ({ items: [] });

    await pgDocumentsHubNew(() => {}, globalThis.window._nav);
    assert.match(dom.content.innerHTML, /AI-assisted letter draft/);
    assert.match(dom.content.innerHTML, /Letter records/);

    dom.setNode('letter-patient', {
      value: 'pat-1',
      selectedIndex: 0,
      options: [{ text: 'Alex Harper', value: 'pat-1' }],
    });
    dom.setNode('letter-template', {
      value: 'gp-letter',
      selectedIndex: 0,
      options: [{ text: 'GP Letter', value: 'gp-letter' }],
    });
    globalThis.document.getElementById('letter-recipient').value = 'Dr GP';
    globalThis.document.getElementById('letter-notes').value = 'Please mention sleep improvement.';
    await globalThis.window._genLetter();
    assert.equal(globalThis.document.getElementById('letter-output').style.display, '');
    assert.match(globalThis.document.getElementById('letter-content').textContent, /Draft GP letter/);

    await globalThis.window._docsSaveGenerated(
      'letter',
      'Referral Letter',
      globalThis.document.getElementById('letter-content').textContent,
      'pat-1',
      globalThis.document.getElementById('letter-template')?.value
    );
    assert.equal(dom.toastCalls.at(-1).title, 'Saved as draft');
    assert.match(createdDocuments.at(-1).notes, /AI-assisted draft/);
    assert.equal(createdDocuments.at(-1).doc_type, 'generated');

    globalThis.window._docsHubTab = 'uploads';
    await pgDocumentsHubNew(() => {}, globalThis.window._nav);
    assert.match(dom.content.innerHTML, /Upload Document/);
    assert.match(dom.content.innerHTML, /Recent Uploads/);

    const fakeFiles = [
      new File(['visit summary'], 'visit-summary.pdf', { type: 'application/pdf' }),
      new File(['consent image'], 'consent.png', { type: 'image/png' }),
    ];
    await globalThis.window._docsHandleUpload(fakeFiles);
    assert.equal(uploadCalls.length, 2);
    assert.equal(dom.toastCalls.at(-1).title, 'Uploaded');
    assert.ok(auditEvents.some((evt) => evt?.event === 'uploaded'));
  } finally {
    Object.assign(api, originals);
    dom.restore();
  }
});

test('pgVirtualCareHub delegates into unified virtual care and renders the live-session empty state', async () => {
  const dom = installDomHarness();
  const originals = {
    getCurrentSession: api.getCurrentSession,
  };
  let topbarTitle = '';

  try {
    globalThis.window._vcUnifiedDefaultTab = 'livesession';
    api.getCurrentSession = async () => null;

    await pgVirtualCareHub((title) => { topbarTitle = title; }, globalThis.window._nav);

    assert.match(dom.content.innerHTML, /Virtual Care/);
    assert.match(globalThis.document.getElementById('vc-panel-livesession').innerHTML, /No active or upcoming session/);
    assert.match(topbarTitle, /Virtual Care — Live Session/);

    await globalThis.window._vcSwitchTab('dashboard');
    assert.match(topbarTitle, /Virtual Care — Dashboard/);
  } finally {
    Object.assign(api, originals);
    dom.restore();
  }
});
