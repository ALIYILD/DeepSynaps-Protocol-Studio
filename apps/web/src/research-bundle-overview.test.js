import test from 'node:test';
import assert from 'node:assert/strict';

import { api } from './api.js';

const originalApi = {
  getResearchSummary: api.getResearchSummary,
  evidenceStatus: api.evidenceStatus,
  protocolCoverage: api.protocolCoverage,
  listResearchProtocolTemplates: api.listResearchProtocolTemplates,
  listResearchSafetySignals: api.listResearchSafetySignals,
  listResearchConditions: api.listResearchConditions,
};

async function loadFreshModule(tag) {
  return import(`./research-bundle-overview.js?case=${tag}`);
}

test.afterEach(() => {
  api.getResearchSummary = originalApi.getResearchSummary;
  api.evidenceStatus = originalApi.evidenceStatus;
  api.protocolCoverage = originalApi.protocolCoverage;
  api.listResearchProtocolTemplates = originalApi.listResearchProtocolTemplates;
  api.listResearchSafetySignals = originalApi.listResearchSafetySignals;
  api.listResearchConditions = originalApi.listResearchConditions;
});

test('loadResearchBundleOverview normalizes summary, counts, and row arrays', async () => {
  api.getResearchSummary = async ({ limit }) => ({ paper_count: 120, condition_count: 14, asked: limit });
  api.evidenceStatus = async () => ({ total_papers: '184670', total_trials: '4235', total_fda: '39' });
  api.protocolCoverage = async ({ limit }) => ({ rows: [{ coverage: 88, paper_count: 200, asked: limit }] });
  api.listResearchProtocolTemplates = async ({ limit }) => ([{ modality: 'rTMS', asked: limit }]);
  api.listResearchSafetySignals = async ({ limit }) => ([{ title: 'Seizure screen', asked: limit }]);
  api.listResearchConditions = async () => ([{ slug: 'depression' }, { slug: 'ptsd' }]);

  const mod = await loadFreshModule(`live-${Date.now()}`);
  const overview = await mod.loadResearchBundleOverview({
    summaryLimit: 6,
    coverageLimit: 8,
    templateLimit: 4,
    safetyLimit: 5,
  });

  assert.equal(overview.live, true);
  assert.equal(overview.paperCount, 184670);
  assert.equal(overview.trialCount, 4235);
  assert.equal(overview.fdaCount, 39);
  assert.equal(overview.conditionCount, 2);
  assert.equal(overview.summary?.asked, 6);
  assert.equal(overview.coverageRows[0]?.asked, 8);
  assert.equal(overview.templates[0]?.asked, 4);
  assert.equal(overview.safetySignals[0]?.asked, 5);
  assert.equal(overview.conditions.length, 2);
});

test('loadResearchBundleOverview falls back safely when endpoints fail or conditions are skipped', async () => {
  api.getResearchSummary = async () => { throw new Error('down'); };
  api.evidenceStatus = async () => ({ total_papers: 90, total_trials: 7, total_fda: 1 });
  api.protocolCoverage = async () => null;
  api.listResearchProtocolTemplates = async () => ([]);
  api.listResearchSafetySignals = async () => ([]);
  api.listResearchConditions = async () => { throw new Error('should not be called'); };

  const mod = await loadFreshModule(`fallback-${Date.now()}`);
  const overview = await mod.loadResearchBundleOverview({
    includeConditions: false,
  });

  assert.equal(overview.live, true);
  assert.equal(overview.paperCount, 90);
  assert.equal(overview.trialCount, 7);
  assert.equal(overview.fdaCount, 1);
  assert.equal(overview.conditionCount, 0);
  assert.deepEqual(overview.coverageRows, []);
  assert.deepEqual(overview.templates, []);
  assert.deepEqual(overview.safetySignals, []);
  assert.deepEqual(overview.conditions, []);
});
