import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function read(rel) {
  return readFileSync(resolve(__dirname, rel), 'utf8');
}

test('Clinical Dashboard (pgDash) includes required demo + safety disclosures', () => {
  const src = read('./pages-clinical.js');
  assert.match(src, /DEMO BUILD — demo data only, not real patient data/i);
  assert.match(src, /Clinical decision support only/i);
  assert.match(src, /Not autonomous diagnosis, prescribing, dosing, or treatment planning/i);
  assert.match(src, /Clinician review/i);
});

test('Clinical Dashboard inventory includes required visible buttons/labels', () => {
  const src = read('./pages-clinical.js');
  // Topbar + head
  assert.match(src, /\+ Walk-in/);
  assert.match(src, /Risk Analyzer/);
  assert.match(src, /DeepTwin/);
  assert.match(src, /Start Session/);
  assert.match(src, /Report AE/);
  assert.match(src, /Day board/);
  assert.match(src, /Week view/);
  assert.match(src, /Month reports/);
  assert.match(src, /Quarter reports/);
  assert.match(src, /Export data/);
  // Attention strip chips
  assert.match(src, /Awaiting sign-off/);
  assert.match(src, /New messages/);
  assert.match(src, /Today's sessions/);
  assert.match(src, /Pending reviews/);
  assert.match(src, /Critical flags/);
  // Key cards
  assert.match(src, /Today's schedule/);
  assert.match(src, /Open schedule/);
  assert.match(src, /Active targets · today/);
  assert.match(src, /Open planner/);
  assert.match(src, /Active patient caseload/);
  assert.match(src, /All patients/);
  assert.match(src, /Evidence governance/);
  assert.match(src, /Browse protocols/);
  assert.match(src, /Generate protocol/);
  assert.match(src, /Evidence library/);
  assert.match(src, /Labs \/ meds \/ diet evidence/);
  // Agents
  assert.match(src, /Clinic specialist agents/);
});

test('Clinical Dashboard read-only mode disables write actions (honest disable)', () => {
  const src = read('./pages-clinical.js');
  // We build these as conditional strings containing `disabled aria-disabled="true"` when _isReadonly.
  assert.match(src, /Read-only access: adding walk-ins is disabled/i);
  assert.match(src, /Read-only access: starting sessions is disabled/i);
  assert.match(src, /Read-only access: adverse event reporting is disabled/i);
});

