// pages-handbooks.test.js — Handbooks v2 static checks (no full DOM).
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEntries, curatedHandbookStatus } from './pages-handbooks.js';

test('buildEntries attaches modality and protocol facets for filtering', function () {
  const entries = buildEntries();
  assert.ok(entries.length > 0, 'expected handbook entries');
  const mdd = entries.find((e) => e.id === 'mdd' && e.kind === 'condition');
  assert.ok(mdd, 'expected MDD condition handbook');
  assert.ok(Array.isArray(mdd.modalities) && mdd.modalities.length > 0, 'condition should expose modalities');
  assert.ok(Array.isArray(mdd.protocolIds), 'condition should expose protocolIds array');
  assert.ok(entries.length >= 10, 'library should have meaningful breadth');
});

test('curatedHandbookStatus distinguishes ops/train templates', function () {
  const ops = curatedHandbookStatus({ kind: 'ops', version: 'v1' });
  assert.match(ops.label, /SOP|template/i);

  const draftTrain = curatedHandbookStatus({ kind: 'train', version: 'draft' });
  assert.match(draftTrain.label, /draft/i);
});
