// Logic / source-contract tests for Monitor / Biometrics Analyzer (2026-05-03).
// Run: node --test src/pages-monitor-launch-audit.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function src() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return fs.readFileSync(path.join(here, 'pages-monitor.js'), 'utf8');
}

test('Monitor page exposes Biometrics Analyzer tab and patient wearable wiring', () => {
  const s = src();
  assert.ok(s.includes("'biometrics'"), 'valid tab biometrics');
  assert.ok(s.includes('getPatientWearableSummary'), 'loads wearable summary API');
  assert.ok(s.includes('loadPatientWearableDetail'), 'patient detail loader');
  assert.ok(s.includes('renderBiometricsWorkspace'), 'biometrics workspace renderer');
});

test('Caseload copy avoids crisis / suicide simulation labels', () => {
  const s = src();
  assert.ok(s.includes('Priority review queue'), 'priority queue heading');
  assert.equal(/suicidal_ideation/i.test(s), false, 'no fabricated suicidal ideation demo labels');
  assert.equal(/Crisis queue/i.test(s), false, 'avoid crisis queue wording');
});

test('Deep links helper navigates with optional navigate injection', () => {
  const s = src();
  assert.ok(s.includes('window._monitorLink'));
  assert.ok(s.includes('pgMonitor(setTopbar, navigate)'));
});
