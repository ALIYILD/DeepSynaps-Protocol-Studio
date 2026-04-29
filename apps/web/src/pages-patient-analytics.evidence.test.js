import test from 'node:test';
import assert from 'node:assert/strict';

function makeNode(id = '') {
  return {
    id,
    innerHTML: '',
    textContent: '',
    className: '',
    style: {},
    dataset: {},
    hidden: false,
    value: '',
    children: [],
    classList: { add() {}, remove() {}, contains() { return false; } },
    appendChild(child) { this.children.push(child); return child; },
    remove() {},
    addEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    getAttribute() { return null; },
    setAttribute() {},
  };
}

const byId = new Map();

function installDom() {
  if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
  globalThis.document = {
    getElementById(id) {
      if (!byId.has(id)) byId.set(id, makeNode(id));
      return byId.get(id);
    },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    createElement(tag) { return makeNode(tag); },
    addEventListener() {},
    body: makeNode('body'),
  };
  const storage = {};
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: {
      getItem: (k) => (k in storage ? storage[k] : null),
      setItem: (k, v) => { storage[k] = String(v); },
      removeItem: (k) => { delete storage[k]; },
      clear: () => { for (const k of Object.keys(storage)) delete storage[k]; },
    },
  });
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    writable: true,
    value: {
      getItem: () => null,
      setItem() {},
      removeItem() {},
      clear() {},
    },
  });
}

installDom();

const { api } = await import('./api.js');
const { pgPatientAnalyticsDetail } = await import('./pages-patient-analytics.js');

const originalApi = {
  evidencePatientOverview: api.evidencePatientOverview,
  listReports: api.listReports,
};

test.afterEach(() => {
  api.evidencePatientOverview = originalApi.evidencePatientOverview;
  api.listReports = originalApi.listReports;
  byId.clear();
  delete globalThis._paActiveTab;
  delete globalThis._paPatientId;
});

test('pgPatientAnalyticsDetail renders live evidence banner and strip stats', async () => {
  api.evidencePatientOverview = async () => ({
    saved_citations: [{ id: 'c1' }, { id: 'c2' }],
    highlights: [{ id: 'h1' }, { id: 'h2' }, { id: 'h3' }, { id: 'h4' }],
    contradictory_findings: [],
    evidence_used_in_report: [{ id: 'r1' }],
    compare_with_literature_phenotype: { matched_tags: ['alpha-asymmetry', 'sleep-disruption'] },
  });
  api.listReports = async () => ([
    { id: 'rep-1', title: 'Latest saved report' },
    { id: 'rep-2', title: 'Older report' },
  ]);

  const topbarCalls = [];
  await pgPatientAnalyticsDetail((title, actions) => {
    topbarCalls.push({ title, actions });
  }, 'db-p1');

  const html = byId.get('content')?.innerHTML || '';
  assert.equal(topbarCalls.length > 0, true);
  assert.match(html, /Mixed-source patient analytics\./);
  assert.match(html, />4<\/strong> evidence highlights/);
  assert.match(html, />2<\/strong> saved citations/);
  assert.match(html, />2<\/strong> saved reports/);
  assert.match(html, />1<\/strong> report citations/);
  assert.match(html, /Telemetry preview · evidence context live/);
  assert.match(html, /Phenotype tags: alpha-asymmetry/);
  assert.match(html, /Latest saved report/);
});

test('pgPatientAnalyticsDetail renders demo-preview evidence banner when no live context exists', async () => {
  api.evidencePatientOverview = async () => null;
  api.listReports = async () => ([]);

  await pgPatientAnalyticsDetail(() => {}, 'db-p2');

  const html = byId.get('content')?.innerHTML || '';
  assert.match(html, /Demo telemetry preview only\./);
  assert.match(html, /Demo preview/);
  assert.doesNotMatch(html, /Telemetry preview · evidence context live/);
});
