/**
 * Text Analyzer: API shape mapping, demo labelling, and source_type wiring.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { toApiSourceType, normaliseEntityRows } from './pages-text-analyzer.js';

test('toApiSourceType maps UI values to API SourceType literals', () => {
  assert.equal(toApiSourceType('free_text'), 'free_text');
  assert.equal(toApiSourceType('clinical_note'), 'clinician_note');
  assert.equal(toApiSourceType('discharge_summary'), 'document_text');
  assert.equal(toApiSourceType('referral_letter'), 'referral');
  assert.equal(toApiSourceType('research_note'), 'transcript');
  assert.equal(toApiSourceType('unknown'), 'free_text');
});

test('normaliseEntityRows reads backend span objects and pii list', () => {
  const analyze = {
    entities: [
      {
        label: 'medication',
        text: 'sertraline',
        span: { start: 10, end: 20 },
        confidence: 0.55,
        source: 'heuristic',
      },
    ],
    pii: [{ label: 'email', text: 'a@b.co', span: { start: 0, end: 8 }, confidence: 0.9 }],
  };
  const ent = normaliseEntityRows(analyze, 'entity');
  assert.equal(ent.length, 1);
  assert.ok(ent[0].span.includes('10'));
  assert.equal(ent[0].label, 'medication');

  const pii = normaliseEntityRows(analyze, 'pii');
  assert.equal(pii.length, 1);
  assert.equal(pii[0].label, 'email');
});

test('normaliseEntityRows deidentify PII list path', () => {
  const piiRes = {
    pii: [{ label: 'phone', text: '+1 2', span: { start: 3, end: 7 }, confidence: 0.6 }],
  };
  const rows = normaliseEntityRows(piiRes, 'pii');
  assert.equal(rows.length, 1);
  assert.match(rows[0].span, /chars 3/);
});
