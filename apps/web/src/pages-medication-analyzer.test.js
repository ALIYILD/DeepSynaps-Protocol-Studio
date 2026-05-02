/**
 * Medication Analyzer page — smoke render & disclaimer visibility.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { pgMedicationAnalyzer } from './pages-medication-analyzer.js';

test('pgMedicationAnalyzer renders disclaimer and test id', async () => {
  document.body.innerHTML = '<div id="content"></div>';
  const calls = [];
  await pgMedicationAnalyzer((a, b) => calls.push([a, b]), () => {});
  const el = document.getElementById('content');
  assert.ok(el);
  const html = el.innerHTML;
  assert.ok(html.includes('data-testid="medication-analyzer-page"'));
  assert.ok(html.includes('Clinical decision-support'));
  assert.ok(html.includes('Does not prescribe'));
  assert.ok(html.includes('Save note'));
  assert.ok(html.includes('Add timeline annotation'));
  assert.ok(html.includes('Patient profile'));
  assert.ok(html.includes('Export IRB JSON'));
  assert.ok(html.includes('Research Evidence'));
  assert.ok(html.includes('qEEG Analyzer'));
  assert.ok(html.includes('Biomarker reference'));
});
