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
  assert.match(src, /protocolCoverage\(\{ condition: course\.condition_slug, modality: course\.modality_slug, limit: 8 \}\)/);
});
