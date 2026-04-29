import test from 'node:test';
import assert from 'node:assert/strict';

import { api } from './api.js';

const originalApi = {
  getResearchSummary: api.getResearchSummary,
  protocolCoverage: api.protocolCoverage,
  listResearchProtocolTemplates: api.listResearchProtocolTemplates,
  listResearchExactProtocols: api.listResearchExactProtocols,
  listResearchSafetySignals: api.listResearchSafetySignals,
  listResearchEvidenceGraph: api.listResearchEvidenceGraph,
};

async function loadFreshModule(tag) {
  return import(`./research-bundle-workspace.js?case=${tag}`);
}

test.afterEach(() => {
  api.getResearchSummary = originalApi.getResearchSummary;
  api.protocolCoverage = originalApi.protocolCoverage;
  api.listResearchProtocolTemplates = originalApi.listResearchProtocolTemplates;
  api.listResearchExactProtocols = originalApi.listResearchExactProtocols;
  api.listResearchSafetySignals = originalApi.listResearchSafetySignals;
  api.listResearchEvidenceGraph = originalApi.listResearchEvidenceGraph;
});

test('loadResearchBundleWorkspace normalizes the heavier research workspace bundle', async () => {
  api.getResearchSummary = async ({ limit }) => ({ paper_count: 100, asked: limit });
  api.protocolCoverage = async ({ limit }) => ({ rows: [{ coverage: 75, asked: limit }] });
  api.listResearchProtocolTemplates = async ({ limit }) => ([{ id: 'tpl-1', asked: limit }]);
  api.listResearchExactProtocols = async ({ limit }) => ([{ id: 'exact-1', asked: limit }]);
  api.listResearchSafetySignals = async ({ limit }) => ([{ id: 'sig-1', asked: limit }]);
  api.listResearchEvidenceGraph = async ({ limit }) => ([{ id: 'graph-1', asked: limit }]);

  const mod = await loadFreshModule(`workspace-${Date.now()}`);
  const data = await mod.loadResearchBundleWorkspace({
    summaryLimit: 6,
    coverageLimit: 8,
    templateLimit: 9,
    exactProtocolLimit: 10,
    safetyLimit: 11,
    evidenceGraphLimit: 12,
  });

  assert.equal(data.live, true);
  assert.equal(data.summary?.asked, 6);
  assert.equal(data.coverageRows[0]?.asked, 8);
  assert.equal(data.templates[0]?.asked, 9);
  assert.equal(data.exactProtocols[0]?.asked, 10);
  assert.equal(data.safetySignals[0]?.asked, 11);
  assert.equal(data.evidenceGraph[0]?.asked, 12);
});

test('loadResearchBundleWorkspace falls back to empty structures on failure', async () => {
  api.getResearchSummary = async () => { throw new Error('down'); };
  api.protocolCoverage = async () => null;
  api.listResearchProtocolTemplates = async () => ([]);
  api.listResearchExactProtocols = async () => ([]);
  api.listResearchSafetySignals = async () => ([]);
  api.listResearchEvidenceGraph = async () => ([]);

  const mod = await loadFreshModule(`workspace-fallback-${Date.now()}`);
  const data = await mod.loadResearchBundleWorkspace();

  assert.equal(data.live, false);
  assert.equal(data.summary, null);
  assert.deepEqual(data.coverageRows, []);
  assert.deepEqual(data.templates, []);
  assert.deepEqual(data.exactProtocols, []);
  assert.deepEqual(data.safetySignals, []);
  assert.deepEqual(data.evidenceGraph, []);
});
