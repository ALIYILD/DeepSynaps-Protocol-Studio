import test from 'node:test';
import assert from 'node:assert/strict';

import { api } from './api.js';

const originalApi = {
  listResearchProtocolTemplates: api.listResearchProtocolTemplates,
  listResearchSafetySignals: api.listResearchSafetySignals,
};

async function loadFreshModule(tag) {
  return import(`./modality-evidence-context.js?case=${tag}`);
}

test.afterEach(() => {
  api.listResearchProtocolTemplates = originalApi.listResearchProtocolTemplates;
  api.listResearchSafetySignals = originalApi.listResearchSafetySignals;
});

test('loadModalityEvidenceContext groups template and safety rows by modality', async () => {
  api.listResearchProtocolTemplates = async ({ modality, limit }) => ([{ modality, indication: 'depression', target: 'L-DLPFC', evidence_tier: 'A', asked: limit }]);
  api.listResearchSafetySignals = async ({ modality, limit }) => ([{ modality, safety_signal_tags: [`${modality}-screen`], asked: limit }]);

  const mod = await loadFreshModule(`modalities-${Date.now()}`);
  const bundle = await mod.loadModalityEvidenceContext(['tms', 'tdcs', 'tms'], { templateLimit: 3, safetyLimit: 2 });

  assert.deepEqual(Object.keys(bundle).sort(), ['tdcs', 'tms']);
  assert.equal(bundle.tms.templates[0].asked, 3);
  assert.equal(bundle.tms.safety[0].asked, 2);
  assert.equal(mod.getModalityTemplateHint(bundle, 'tms'), 'Live template: depression · L-DLPFC · A.');
  assert.equal(mod.getModalitySignalTitle(bundle.tdcs.safety[0]), 'tdcs-screen');
});

test('loadModalityEvidenceContext falls back to empty rows and safe labels', async () => {
  api.listResearchProtocolTemplates = async () => { throw new Error('templates down'); };
  api.listResearchSafetySignals = async () => ([]);

  const mod = await loadFreshModule(`modalities-fallback-${Date.now()}`);
  const bundle = await mod.loadModalityEvidenceContext(['biofeedback']);

  assert.deepEqual(bundle, {
    biofeedback: { templates: [], safety: [] },
  });
  assert.equal(mod.getModalityTemplateHint(bundle, 'biofeedback'), '');
  assert.equal(mod.getModalitySignalTitle({ title: 'Manual title' }), 'Manual title');
  assert.equal(mod.getModalitySignalTitle({ example_titles: 'Example title' }), 'Example title');
  assert.equal(mod.getModalitySignalTitle(null), 'Safety signal');
});
