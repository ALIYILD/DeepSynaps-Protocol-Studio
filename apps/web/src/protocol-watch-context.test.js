import test from 'node:test';
import assert from 'node:assert/strict';

import { api } from './api.js';

const originalApi = {
  protocolCoverage: api.protocolCoverage,
  listResearchProtocolTemplates: api.listResearchProtocolTemplates,
  listResearchSafetySignals: api.listResearchSafetySignals,
};

async function loadFreshModule(tag) {
  return import(`./protocol-watch-context.js?case=${tag}`);
}

test.afterEach(() => {
  api.protocolCoverage = originalApi.protocolCoverage;
  api.listResearchProtocolTemplates = originalApi.listResearchProtocolTemplates;
  api.listResearchSafetySignals = originalApi.listResearchSafetySignals;
});

test('loadProtocolWatchContext shapes first coverage, template, and safety rows', async () => {
  api.protocolCoverage = async ({ condition, modality, limit }) => {
    assert.equal(condition, 'depression');
    assert.equal(modality, 'rtms');
    assert.equal(limit, 8);
    return {
      rows: [
        { coverage: 82, paper_count: 143, gap: 'None' },
        { coverage: 40, paper_count: 12, gap: 'Thin evidence' },
      ],
    };
  };
  api.listResearchProtocolTemplates = async ({ indication, modality, limit }) => {
    assert.equal(indication, 'depression');
    assert.equal(modality, 'rtms');
    assert.equal(limit, 4);
    return [
      { modality: 'rTMS', indication: 'depression', target: 'L-DLPFC', evidence_tier: 'A' },
      { modality: 'rTMS', indication: 'depression', target: 'dmPFC', evidence_tier: 'B' },
    ];
  };
  api.listResearchSafetySignals = async ({ indication, modality, limit }) => {
    assert.equal(indication, 'depression');
    assert.equal(modality, 'rtms');
    assert.equal(limit, 4);
    return [
      { safety_signal_tags: ['seizure-screen'], title: 'Should not be preferred over tags' },
      { title: 'Second signal' },
    ];
  };

  const mod = await loadFreshModule(`shape-${Date.now()}`);
  const ctx = await mod.loadProtocolWatchContext({ condition: 'depression', modality: 'rtms' });

  assert.deepEqual(ctx, {
    coverage: { coverage: 82, paper_count: 143, gap: 'None' },
    template: { modality: 'rTMS', indication: 'depression', target: 'L-DLPFC', evidence_tier: 'A' },
    safety: { safety_signal_tags: ['seizure-screen'], title: 'Should not be preferred over tags' },
  });
  assert.equal(mod.getProtocolWatchSignalTitle(ctx.safety), 'seizure-screen');
});

test('loadProtocolWatchContext falls back to nulls when sources fail or return empty arrays', async () => {
  api.protocolCoverage = async () => { throw new Error('coverage down'); };
  api.listResearchProtocolTemplates = async () => ([]);
  api.listResearchSafetySignals = async () => ([]);

  const mod = await loadFreshModule(`fallback-${Date.now()}`);
  const ctx = await mod.loadProtocolWatchContext({ condition: 'adhd', modality: 'tdcs' });

  assert.deepEqual(ctx, {
    coverage: null,
    template: null,
    safety: null,
  });
  assert.equal(mod.getProtocolWatchSignalTitle({ title: 'Manual title' }), 'Manual title');
  assert.equal(mod.getProtocolWatchSignalTitle({ example_titles: 'Fallback title' }), 'Fallback title');
  assert.equal(mod.getProtocolWatchSignalTitle(null), 'Safety signal');
});
