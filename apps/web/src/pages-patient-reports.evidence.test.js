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
const { setCurrentUser } = await import('./auth.js');
const { pgPatientReports } = await import('./pages-patient.js');

const originalApi = {
  patientPortalOutcomes: api.patientPortalOutcomes,
  patientPortalAssessments: api.patientPortalAssessments,
  patientPortalCourses: api.patientPortalCourses,
  patientPortalSessions: api.patientPortalSessions,
  patientPortalWearableSummary: api.patientPortalWearableSummary,
  patientPortalReports: api.patientPortalReports,
  evidencePatientOverview: api.evidencePatientOverview,
};

test.afterEach(() => {
  api.patientPortalOutcomes = originalApi.patientPortalOutcomes;
  api.patientPortalAssessments = originalApi.patientPortalAssessments;
  api.patientPortalCourses = originalApi.patientPortalCourses;
  api.patientPortalSessions = originalApi.patientPortalSessions;
  api.patientPortalWearableSummary = originalApi.patientPortalWearableSummary;
  api.patientPortalReports = originalApi.patientPortalReports;
  api.evidencePatientOverview = originalApi.evidencePatientOverview;
  setCurrentUser(null);
  byId.clear();
});

test('pgPatientReports renders the live evidence-linked panel when patient evidence exists', async () => {
  setCurrentUser({ id: 'pat-1', patient_id: 'pat-1', display_name: 'Pat One', role: 'patient' });
  api.patientPortalOutcomes = async () => ([]);
  api.patientPortalAssessments = async () => ([]);
  api.patientPortalCourses = async () => ([]);
  api.patientPortalSessions = async () => ([]);
  api.patientPortalWearableSummary = async () => ([]);
  api.patientPortalReports = async () => ([
    { id: 'rep-1', title: 'qEEG Progress Report', report_type: 'patientguide', created_at: '2026-04-29T10:00:00Z', file_url: 'https://example.test/report.pdf', status: 'available' },
  ]);
  api.evidencePatientOverview = async () => ({
    saved_citations: [
      { id: 'c1', paper_title: 'Alpha asymmetry and depression', finding_label: 'Depression risk', citation_payload: { inline_citation: '(Smith, 2024)' } },
      { id: 'c2', paper_title: 'Sleep and neuromodulation', finding_label: 'Sleep disruption' },
    ],
    highlights: [{ id: 'h1' }, { id: 'h2' }, { id: 'h3' }],
    contradictory_findings: [{ id: 'x1' }],
    evidence_used_in_report: [{ id: 'r1', title: 'Report citation 1', inline_citation: '(Jones, 2023)' }],
    compare_with_literature_phenotype: { matched_tags: ['alpha-asymmetry', 'sleep-disruption'] },
  });

  await pgPatientReports();

  const html = byId.get('patient-content')?.innerHTML || '';
  assert.match(html, /Evidence linked to your reports/);
  assert.match(html, /3 evidence highlights/);
  assert.match(html, /2 saved citations/);
  assert.match(html, /1 citation already staged for report payloads/);
  assert.match(html, /Phenotype tags: alpha-asymmetry/);
  assert.match(html, /Alpha asymmetry and depression/);
  assert.match(html, /Report citation 1/);
});

test('pgPatientReports omits the evidence-linked panel when no live evidence or saved citations exist', async () => {
  setCurrentUser({ id: 'pat-2', patient_id: 'pat-2', display_name: 'Pat Two', role: 'patient' });
  api.patientPortalOutcomes = async () => ([]);
  api.patientPortalAssessments = async () => ([]);
  api.patientPortalCourses = async () => ([]);
  api.patientPortalSessions = async () => ([]);
  api.patientPortalWearableSummary = async () => ([]);
  api.patientPortalReports = async () => ([]);
  api.evidencePatientOverview = async () => null;

  await pgPatientReports();

  const html = byId.get('patient-content')?.innerHTML || '';
  assert.doesNotMatch(html, /Evidence linked to your reports/);
});
