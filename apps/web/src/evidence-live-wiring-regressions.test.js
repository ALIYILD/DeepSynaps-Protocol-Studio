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

test('Research Evidence route keeps live bundle watch sections wired', () => {
  const src = read('./pages-research-evidence.js');
  assert.match(src, /_ensureResearchBundleData\(/);
  assert.match(src, /Live Coverage Watch/);
  assert.match(src, /Live Safety Signals/);
  assert.match(src, /Live Evidence Graph Links/);
});

test('Clinical route keeps live evidence watch in wizard and builder flows', () => {
  const src = read('./pages-clinical.js');
  assert.match(src, /generatedLiveEvidenceContext/);
  assert.match(src, /Live evidence watch/);
  assert.match(src, /listResearchProtocolTemplates\(\{ modality, limit: 4 \}\)/);
  assert.match(src, /protocolCoverage\(\{ condition: conditionName, modality: modalityName, limit: 8 \}\)/);
});

test('Courses route keeps live protocol watch in detail and session execution', () => {
  const src = read('./pages-courses.js');
  assert.match(src, /Live protocol watch:/);
  assert.match(src, /sex-live-evidence-watch/);
  assert.match(src, /Live Protocol Watch/);
  assert.match(src, /api\.protocolCoverage\(\{ condition: course\.condition_slug \|\| '', modality: course\.modality_slug \|\| '', limit: 8 \}\)/);
});

test('Patient route keeps live evidence context on Home and Reports surfaces', () => {
  const src = read('./pages-patient.js');
  assert.match(src, /api\.evidencePatientOverview\?\.\(patientId\)/);
  assert.match(src, /For you today/);
  assert.match(src, /live evidence highlights/);
  assert.match(src, /Evidence linked to your reports/);
});

test('Patient Analytics route keeps live evidence and report context wiring', () => {
  const src = read('./pages-patient-analytics.js');
  assert.match(src, /api\.evidencePatientOverview\?\.\(patientId\)/);
  assert.match(src, /Evidence highlights/);
  assert.match(src, /saved citations/);
  assert.match(src, /saved reports/);
  assert.match(src, /live patient evidence\/report store/);
});
