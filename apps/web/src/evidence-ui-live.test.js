import test from 'node:test';
import assert from 'node:assert/strict';

import { api } from './api.js';

const originalApi = {
  getResearchSummary: api.getResearchSummary,
  evidenceStatus: api.evidenceStatus,
  listResearchConditions: api.listResearchConditions,
};

async function loadFreshModule(tag) {
  return import(`./evidence-ui-live.js?case=${tag}`);
}

test.afterEach(() => {
  api.getResearchSummary = originalApi.getResearchSummary;
  api.evidenceStatus = originalApi.evidenceStatus;
  api.listResearchConditions = originalApi.listResearchConditions;
});

test('getEvidenceUiStats normalizes live evidence counts and tier keys', async () => {
  api.getResearchSummary = async () => ({
    paper_count: 120,
    open_access_paper_count: 33,
    top_modalities: [
      { key: 'TMS / rTMS', count: '41' },
      { key: 'EEG Neurofeedback', count: 9 },
    ],
    top_indications: [{ key: 'depression', count: 12 }],
    top_evidence_tiers: [
      { key: 'EV-A', count: '8' },
      { key: 'b', count: 3 },
    ],
    top_study_types: [{ key: 'systematic review', count: 5 }],
    top_safety_tags: [{ key: 'headache', count: 2 }],
  });
  api.evidenceStatus = async () => ({
    total_papers: '184670',
    total_trials: '4235',
    total_fda: '39',
  });
  api.listResearchConditions = async () => ([{ slug: 'depression' }, { slug: 'adhd' }, { slug: 'ptsd' }]);

  const mod = await loadFreshModule(`live-${Date.now()}`);
  const stats = await mod.getEvidenceUiStats({
    fallbackSummary: {
      totalPapers: 10,
      totalTrials: 2,
      totalConditions: 1,
      totalMetaAnalyses: 7,
      sources: ['bundle'],
    },
    fallbackConditionCount: 99,
    fallbackMetaAnalyses: 11,
  });

  assert.equal(stats.live, true);
  assert.equal(stats.totalPapers, 184670);
  assert.equal(stats.totalTrials, 4235);
  assert.equal(stats.totalFda, 39);
  assert.equal(stats.totalConditions, 3);
  assert.equal(stats.totalMetaAnalyses, 7);
  assert.equal(stats.openAccessPaperCount, 33);
  assert.deepEqual(stats.modalityDistribution, {
    'TMS / rTMS': 41,
    'EEG Neurofeedback': 9,
  });
  assert.deepEqual(stats.gradeDistribution, {
    A: 8,
    B: 3,
  });
  assert.deepEqual(stats.sources, ['bundle']);
  assert.equal(stats.topConditions.length, 1);
  assert.equal(stats.topEvidenceTiers.length, 2);
});

test('getEvidenceUiStats falls back cleanly when live aggregation fails', async () => {
  api.getResearchSummary = async () => ({
    top_evidence_tiers: 5,
  });
  api.evidenceStatus = async () => ({
    total_papers: 999999,
    total_trials: 888,
    total_fda: 777,
  });
  api.listResearchConditions = async () => ([{ slug: 'depression' }]);

  const mod = await loadFreshModule(`fallback-${Date.now()}`);
  const stats = await mod.getEvidenceUiStats({
    fallbackSummary: {
      totalPapers: 10,
      totalTrials: 4,
      totalConditions: 6,
      totalMetaAnalyses: 2,
      modalityDistribution: { TMS: 7 },
      gradeDistribution: { A: 3 },
      sources: ['seed'],
    },
    fallbackConditionCount: 8,
    fallbackMetaAnalyses: 11,
  });

  assert.equal(stats.live, false);
  assert.equal(stats.totalPapers, 10);
  assert.equal(stats.totalTrials, 4);
  assert.equal(stats.totalFda, 0);
  assert.equal(stats.totalConditions, 6);
  assert.equal(stats.totalMetaAnalyses, 2);
  assert.deepEqual(stats.modalityDistribution, { TMS: 7 });
  assert.deepEqual(stats.gradeDistribution, { A: 3 });
  assert.deepEqual(stats.sources, ['seed']);
  assert.deepEqual(stats.topModalities, []);
  assert.deepEqual(stats.topConditions, []);
});
