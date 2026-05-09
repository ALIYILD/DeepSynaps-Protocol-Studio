/**
 * Live-readiness helpers for qEEG Analysis: synthetic demo detection and
 * safety copy — avoids presenting bundled preview data as clinical findings.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const mod = await import('./pages-qeeg-analysis.js');

test('_qeegAnalysisIsSyntheticDemo detects demo bundle shape', () => {
  assert.equal(mod._qeegAnalysisIsSyntheticDemo(null), false);
  assert.equal(mod._qeegAnalysisIsSyntheticDemo({}), false);
  assert.equal(mod._qeegAnalysisIsSyntheticDemo({ id: 'demo' }), true);
  assert.equal(mod._qeegAnalysisIsSyntheticDemo({ norm_db_version: 'toy-0.1' }), true);
  assert.equal(mod._qeegAnalysisIsSyntheticDemo({ is_synthetic_demo: true }), true);
});

test('_qeegReportIsSyntheticDemo pairs report + analysis', () => {
  assert.equal(mod._qeegReportIsSyntheticDemo({}, { id: 'real-uuid' }), false);
  assert.equal(mod._qeegReportIsSyntheticDemo({ id: 'demo-report' }, null), true);
  assert.equal(mod._qeegReportIsSyntheticDemo({}, { id: 'demo' }), true);
});

test('clinical safety footer lists non-diagnosis and non-prescriptive language', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const src = fs.readFileSync(path.join(import.meta.dirname, 'pages-qeeg-analysis.js'), 'utf8');
  assert.match(src, /function _qeegClinicalSafetyFooter/);
  assert.ok(src.includes('not autonomous diagnosis'), 'explicit non-diagnosis');
  assert.ok(src.includes('draft ideas for clinician review'), 'protocol draft wording');
});

test('evidence-qeeg integration module exports required functions', async () => {
  const evMod = await import('./evidence-qeeg.js');
  assert.ok(typeof evMod.fetchQEEGEvidenceForAnalysis === 'function');
  assert.ok(typeof evMod.renderQEEGEvidenceCitations === 'function');
  assert.ok(typeof evMod.isEvidenceAvailable === 'function');
  assert.ok(typeof evMod.summarizeQEEGFlaggedConditions === 'function');
});

test('evidence rendering includes honest unavailable / error / empty states', async () => {
  const evMod = await import('./evidence-qeeg.js');
  
  // Test unavailable state — never misleads clinician
  const unavail = evMod.renderQEEGEvidenceCitations({ status: 'unavailable', items: [] });
  assert.ok(unavail.includes('unavailable'));
  assert.ok(unavail.includes('Clinician judgment'));
  
  // Test error state — honest about retrieval failure
  const errState = evMod.renderQEEGEvidenceCitations({ status: 'error', items: [] });
  assert.ok(errState.includes('Could not retrieve') || errState.includes('could not retrieve'));
  
  // Test empty result state — no false confidence
  const empty = evMod.renderQEEGEvidenceCitations({ status: 'ok', items: [] });
  assert.ok(empty.includes('Clinician review'));
});
