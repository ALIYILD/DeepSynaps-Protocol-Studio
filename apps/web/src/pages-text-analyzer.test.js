/**
 * Text Analyzer: API shape mapping, demo labelling, and source_type wiring.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyTextAnalyzerPatientContext,
  canRunTextAnalyzerLiveOperation,
  canUseTextAnalyzerWorkspace,
  normaliseEntityRows,
  redactTextAnalyzerDeidentifyAuditResponse,
  resolveTextAnalyzerPatientId,
  toApiSourceType,
} from './pages-text-analyzer.js';

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

test('canUseTextAnalyzerWorkspace matches clinician-only backend access', () => {
  assert.equal(canUseTextAnalyzerWorkspace('clinician'), true);
  assert.equal(canUseTextAnalyzerWorkspace('admin'), true);
  assert.equal(canUseTextAnalyzerWorkspace('patient'), false);
  assert.equal(canUseTextAnalyzerWorkspace('reviewer'), false);
  assert.equal(canUseTextAnalyzerWorkspace(''), false);
  assert.equal(canUseTextAnalyzerWorkspace('', { allowUnknown: true }), true);
});

test('resolveTextAnalyzerPatientId prefers selected patient then profile fallback', () => {
  assert.equal(resolveTextAnalyzerPatientId({ _selectedPatientId: 'pt-selected', _profilePatientId: 'pt-profile' }), 'pt-selected');
  assert.equal(resolveTextAnalyzerPatientId({ _profilePatientId: 'pt-profile' }), 'pt-profile');
  assert.equal(resolveTextAnalyzerPatientId({}), '');
});

test('applyTextAnalyzerPatientContext seeds downstream patient context', () => {
  const win = {};
  applyTextAnalyzerPatientContext('deeptwin', 'pt-42', win);
  assert.equal(win._selectedPatientId, 'pt-42');
  assert.equal(win._profilePatientId, 'pt-42');
  assert.equal(win._deeptwinPatientId, 'pt-42');
});

test('canRunTextAnalyzerLiveOperation requires patient context outside demo mode', () => {
  assert.equal(canRunTextAnalyzerLiveOperation('pt-42'), true);
  assert.equal(canRunTextAnalyzerLiveOperation(''), false);
  assert.equal(canRunTextAnalyzerLiveOperation('', { allowPatientlessDemo: true }), true);
});

test('redactTextAnalyzerDeidentifyAuditResponse removes original replacement text', () => {
  const redacted = redactTextAnalyzerDeidentifyAuditResponse({
    deidentified_text: 'Call [REDACTED]',
    replacements: [
      { text: '555-1212', value: '555-1212', span_text: '555-1212', label: 'phone' },
    ],
  });
  assert.deepEqual(redacted.replacements, [
    { text: '[redacted]', value: '[redacted]', span_text: '[redacted]', label: 'phone' },
  ]);
});
