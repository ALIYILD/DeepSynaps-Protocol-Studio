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
