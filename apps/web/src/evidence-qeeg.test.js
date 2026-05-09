/**
 * Tests for evidence-qeeg.js — qEEG evidence integration.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const mod = await import('./evidence-qeeg.js');

test('evidence-qeeg: renderQEEGEvidenceCitations renders unavailable state', () => {
  const html = mod.renderQEEGEvidenceCitations({ status: 'unavailable', items: [] });
  assert.ok(html.includes('unavailable'));
  assert.ok(html.includes('Clinician judgment'));
  assert.ok(html.includes('qeeg-evidence-unavailable'));
});

test('evidence-qeeg: renderQEEGEvidenceCitations renders error state', () => {
  const html = mod.renderQEEGEvidenceCitations({ status: 'error', items: [] });
  assert.ok(html.includes('error'));
  assert.ok(html.includes('retrieve evidence'));
  assert.ok(html.includes('qeeg-evidence-error'));
});

test('evidence-qeeg: renderQEEGEvidenceCitations renders empty result', () => {
  const html = mod.renderQEEGEvidenceCitations({ status: 'ok', items: [] });
  assert.ok(html.includes('empty'));
  assert.ok(html.includes('Clinician review'));
  assert.ok(html.includes('qeeg-evidence-empty'));
});

test('evidence-qeeg: renderQEEGEvidenceCitations renders citation with PMID', () => {
  const html = mod.renderQEEGEvidenceCitations({
    status: 'ok',
    items: [
      { pmid: '12345678', title: 'Test Study', journal: 'Nature', year: 2024 },
    ],
  });
  assert.ok(html.includes('Test Study'));
  assert.ok(html.includes('Nature'));
  assert.ok(html.includes('2024'));
  assert.ok(html.includes('pubmed.ncbi.nlm.nih.gov'));
  assert.ok(html.includes('12345678'));
  assert.ok(html.includes('qeeg-evidence-item'));
});

test('evidence-qeeg: renderQEEGEvidenceCitations renders citation with DOI', () => {
  const html = mod.renderQEEGEvidenceCitations({
    status: 'ok',
    items: [
      { doi: '10.1234/test', title: 'DOI Study', journal: 'Journal', year: 2023 },
    ],
  });
  assert.ok(html.includes('DOI Study'));
  assert.ok(html.includes('10.1234/test'));
  assert.ok(html.includes('doi.org'));
});

test('evidence-qeeg: renderQEEGEvidenceCitations escapes HTML in titles', () => {
  const html = mod.renderQEEGEvidenceCitations({
    status: 'ok',
    items: [
      { pmid: '1', title: '<script>alert("xss")</script>', journal: 'Test', year: 2024 },
    ],
  });
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('<script>'));
});

test('evidence-qeeg: summarizeQEEGFlaggedConditions returns readable list', () => {
  const result = mod.summarizeQEEGFlaggedConditions(
    { flagged_conditions: ['depression', 'anxiety', 'adhd'] },
    2
  );
  assert.ok(result.includes('depression'));
  assert.ok(result.includes('anxiety'));
  assert.ok(result.includes('+1 more'));
});

test('evidence-qeeg: summarizeQEEGFlaggedConditions handles empty list', () => {
  const result = mod.summarizeQEEGFlaggedConditions({ flagged_conditions: [] });
  assert.equal(result, 'No flagged conditions');
});

test('evidence-qeeg: summarizeQEEGFlaggedConditions handles missing flagged_conditions', () => {
  const result = mod.summarizeQEEGFlaggedConditions({});
  assert.equal(result, 'No flagged conditions');
});

test('evidence-qeeg: fetchQEEGEvidenceForAnalysis returns error for missing analysis', async () => {
  const result = await mod.fetchQEEGEvidenceForAnalysis(null);
  assert.equal(result.status, 'unavailable');
  assert.deepEqual(result.items, []);
});

test('evidence-qeeg: fetchQEEGEvidenceForAnalysis returns ok with empty items when no flagged conditions', async () => {
  const result = await mod.fetchQEEGEvidenceForAnalysis({ flagged_conditions: [] });
  assert.equal(result.status, 'ok');
  assert.deepEqual(result.items, []);
});
