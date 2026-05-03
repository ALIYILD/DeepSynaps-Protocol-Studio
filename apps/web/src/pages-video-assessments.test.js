// ─────────────────────────────────────────────────────────────────────────────
// pages-video-assessments.test.js — structural / safety checks for Video Assessments
// Run: npm run test:unit (included in apps/web/package.json)
// ─────────────────────────────────────────────────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const VA_SRC = readFileSync(join(__dirname, 'pages-video-assessments.js'), 'utf8');

test('Video Assessments source advertises governance and honest analyzer status', () => {
  assert.match(VA_SRC, /Evidence, governance & limitations/);
  assert.match(VA_SRC, /Not connected/);
  assert.match(VA_SRC, /browser-only/i);
  assert.match(VA_SRC, /clinical record/i);
});

test('Video Assessments source wires linked module navigation ids', () => {
  assert.match(VA_SRC, /va-link-profile/);
  assert.match(VA_SRC, /navWithPatient\('deeptwin'/);
  assert.match(VA_SRC, /protocol-studio/);
});

test('Video Assessments blocks patient accounts from clinician scoring panel', () => {
  assert.match(VA_SRC, /currentUser\?\.role/);
  assert.match(VA_SRC, /Structured clinician scoring is limited/);
});

test('protocol tasks include softened instruction placeholder (no fake demo clip)', async () => {
  const { VIDEO_ASSESSMENT_TASKS } = await import('./video-assessment-protocol.js');
  const blob = VIDEO_ASSESSMENT_TASKS.map((t) => JSON.stringify(t.script || '')).join('\n');
  assert.equal(/Demo clip placeholder/i.test(blob), false);
});
