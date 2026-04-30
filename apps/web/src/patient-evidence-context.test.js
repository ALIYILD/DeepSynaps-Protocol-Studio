import test from 'node:test';
import assert from 'node:assert/strict';

import { api } from './api.js';

const originalApi = {
  evidencePatientOverview: api.evidencePatientOverview,
  listReports: api.listReports,
};

async function loadFreshModule(tag) {
  return import(`./patient-evidence-context.js?case=${tag}`);
}

test.afterEach(() => {
  api.evidencePatientOverview = originalApi.evidencePatientOverview;
  api.listReports = originalApi.listReports;
});

test('loadPatientEvidenceContext uses supplied reports and derives patient evidence counts', async () => {
  api.evidencePatientOverview = async () => ({
    saved_citations: [{ id: 'c1' }, { id: 'c2' }],
    highlights: [{ id: 'h1' }],
    contradictory_findings: [{ id: 'x1' }, { id: 'x2' }, { id: 'x3' }],
    evidence_used_in_report: [{ id: 'r1' }],
    compare_with_literature_phenotype: {
      matched_tags: ['alpha-asymmetry', 'sleep-disruption'],
    },
  });
  api.listReports = async () => {
    throw new Error('listReports should not be called when reports are supplied');
  };

  const mod = await loadFreshModule(`provided-${Date.now()}`);
  const reports = [{ id: 'rep-1' }, { id: 'rep-2' }];
  const context = await mod.loadPatientEvidenceContext('pat-1', { reports });

  assert.equal(context.live, true);
  assert.equal(context.patientId, 'pat-1');
  assert.equal(context.reportCount, 2);
  assert.equal(context.savedCitationCount, 2);
  assert.equal(context.highlightCount, 1);
  assert.equal(context.contradictionCount, 3);
  assert.equal(context.reportCitationCount, 1);
  assert.deepEqual(context.phenotypeTags, ['alpha-asymmetry', 'sleep-disruption']);
  assert.equal(context.latestReport, reports[0]);
  assert.equal(context.reports, reports);
});

test('loadPatientEvidenceContext fetches reports when requested and falls back cleanly', async () => {
  api.evidencePatientOverview = async () => { throw new Error('overview unavailable'); };
  api.listReports = async () => ([{ id: 'rep-9', title: 'Latest report' }]);

  const mod = await loadFreshModule(`fetched-${Date.now()}`);
  const context = await mod.loadPatientEvidenceContext('pat-2', { fetchReports: true });

  assert.equal(context.live, true);
  assert.equal(context.patientId, 'pat-2');
  assert.equal(context.reportCount, 1);
  assert.equal(context.savedCitationCount, 0);
  assert.equal(context.highlightCount, 0);
  assert.equal(context.contradictionCount, 0);
  assert.equal(context.reportCitationCount, 0);
  assert.deepEqual(context.phenotypeTags, []);
  assert.equal(context.latestReport?.id, 'rep-9');
  assert.equal(context.reports.length, 1);
});

test('loadPatientEvidenceContext returns an empty shape for missing patient ids', async () => {
  api.evidencePatientOverview = async () => ({ unexpected: true });
  api.listReports = async () => ([{ id: 'rep-1' }]);

  const mod = await loadFreshModule(`empty-${Date.now()}`);
  const reports = [{ id: 'rep-local' }];
  const context = await mod.loadPatientEvidenceContext('', { reports });

  assert.equal(context.live, false);
  assert.equal(context.patientId, '');
  assert.equal(context.reportCount, 1);
  assert.equal(context.latestReport?.id, 'rep-local');
  assert.deepEqual(context.reports, reports);
  assert.equal(context.savedCitationCount, 0);
  assert.equal(context.highlightCount, 0);
});
