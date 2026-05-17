// Behavioural smoke tests for pgPatientAnalyticsDetail.
//
// PR #840 (Clinical data infrastructure foundation, 2026-05-10) replaced
// the pre-existing demo-telemetry / evidence-banner surface on
// pages-patient-analytics.js with a real-API read-only clinical analytics
// dashboard. The previous tests in this file pinned the deleted
// evidence-banner copy ("Demo telemetry preview only.", "Telemetry
// preview · evidence context live", "Phenotype tags: …", "evidence
// highlights" / "saved citations" / "report citations" strings) and the
// stubbed `api.evidencePatientOverview` / `api.listReports` surface,
// none of which exist on the post-#840 page. The page now fetches:
//
//   - api.getPatientAnalyticsSummary(patientId)
//   - api.getPatientAnalyticsTimeline(patientId, { days, limit })
//   - api.getPatientAnalyticsAuditLog(patientId, { days, limit })
//
// and renders summary cards, a 90-day activity timeline, an active-risk
// flags dashboard, and a PHI audit trail.
//
// These two tests assert that pgPatientAnalyticsDetail:
//   1. calls updateTopbar with a heading + actions array, and
//   2. renders an error block (not a crash) when an API fetch rejects,
//      proving the failure-mode UX path the original tests were
//      partially exercising via the "no live context" branch.
import test from 'node:test';
import assert from 'node:assert/strict';

function makeNode(id = '') {
  const node = {
    id,
    innerHTML: '',
    textContent: '',
    className: '',
    style: {},
    dataset: {},
    hidden: false,
    children: [],
    parentNode: null,
    firstChild: null,
    classList: { add() {}, remove() {}, contains() { return false; } },
    appendChild(child) {
      this.children.push(child);
      if (child && typeof child === 'object') child.parentNode = this;
      return child;
    },
    insertBefore(newNode, refNode) {
      if (newNode && typeof newNode === 'object') newNode.parentNode = this;
      const idx = this.children.indexOf(refNode);
      if (idx === -1) this.children.push(newNode);
      else this.children.splice(idx, 0, newNode);
      return newNode;
    },
    removeChild(child) {
      const idx = this.children.indexOf(child);
      if (idx !== -1) this.children.splice(idx, 1);
      if (child && typeof child === 'object') child.parentNode = null;
      return child;
    },
    replaceChild(newNode, oldNode) {
      const idx = this.children.indexOf(oldNode);
      if (idx !== -1) this.children[idx] = newNode;
      if (newNode && typeof newNode === 'object') newNode.parentNode = this;
      if (oldNode && typeof oldNode === 'object') oldNode.parentNode = null;
      return oldNode;
    },
    contains() { return false; },
    remove() { if (this.parentNode) this.parentNode.removeChild(this); },
    addEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    getAttribute() { return null; },
    setAttribute() {},
  };
  return node;
}

const byId = new Map();

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

const { api } = await import('./api.js');
const { pgPatientAnalyticsDetail } = await import('./pages-patient-analytics.js');

const orig = {
  getPatientAnalyticsSummary: api.getPatientAnalyticsSummary,
  getPatientAnalyticsTimeline: api.getPatientAnalyticsTimeline,
  getPatientAnalyticsAuditLog: api.getPatientAnalyticsAuditLog,
};

test.afterEach(() => {
  api.getPatientAnalyticsSummary = orig.getPatientAnalyticsSummary;
  api.getPatientAnalyticsTimeline = orig.getPatientAnalyticsTimeline;
  api.getPatientAnalyticsAuditLog = orig.getPatientAnalyticsAuditLog;
  byId.clear();
});

test('pgPatientAnalyticsDetail calls updateTopbar and mounts the dashboard frame', async () => {
  api.getPatientAnalyticsSummary = async () => ({ ai_analysis: { total_count: 3 }, risk_flags: {}, consent: {} });
  api.getPatientAnalyticsTimeline = async () => ({ events: [] });
  api.getPatientAnalyticsAuditLog = async () => ({ events: [] });

  const topbarCalls = [];
  await pgPatientAnalyticsDetail((title, actions) => {
    topbarCalls.push({ title, actions });
  }, 'pt-smoke-1');

  assert.equal(topbarCalls.length > 0, true, 'updateTopbar should have been invoked');
  assert.match(topbarCalls[0].title, /Patient Analytics/, 'topbar title should reference Patient Analytics');
  assert.ok(Array.isArray(topbarCalls[0].actions), 'topbar actions argument should be an array');
});

test('pgPatientAnalyticsDetail renders an honest error block when summary fetch rejects', async () => {
  api.getPatientAnalyticsSummary = async () => { throw new Error('Network error'); };
  api.getPatientAnalyticsTimeline = async () => ({ events: [] });
  api.getPatientAnalyticsAuditLog = async () => ({ events: [] });

  await pgPatientAnalyticsDetail(() => {}, 'pt-smoke-2');

  const html = byId.get('content')?.innerHTML || '';
  // Honest error UX rather than a silent crash. Loading/empty/error states
  // are the documented behaviour of the post-#840 page when an analytics
  // slice fails.
  assert.match(html, /Error loading summary/i);
  assert.match(html, /Network error/);
});
