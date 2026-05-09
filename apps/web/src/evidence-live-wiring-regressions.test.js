// evidence-live-wiring-regressions.test.js
// Regression suite for live evidence wiring across key routes.
// Updated 2026-05-09: added indication seed completeness + evidence-linked claims (DeepDive 2/4 + 3/4).
//
// Run with: node --test apps/web/src/evidence-live-wiring-regressions.test.js

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

// resolve path to services/evidence-pipeline from apps/web/src
function readPipeline(rel) {
  return readFileSync(resolve(__dirname, '../../../services/evidence-pipeline', rel), 'utf8');
}

test('Research Evidence route keeps live bundle watch sections wired', () => {
  const src = read('./pages-research-evidence.js');
  assert.match(src, /_ensureResearchBundleData\(/);
  assert.match(src, /Live Coverage Watch/);
  assert.match(src, /Live Safety Signals/);
  assert.match(src, /Live Evidence Graph/);
  assert.match(src, /Live indexed search unavailable|Live evidence service|live.*evidence/i);
  assert.match(src, /Ranked Research Context/);
  assert.match(src, /api\.searchEvidencePapers/);
  assert.match(src, /api\.evidenceIndicationDetail/);
  assert.match(src, /api\.searchResearchPapers/);
  assert.match(src, /api\.evidenceIndications/);
  assert.match(src, /api\.listResearchConditions\(/);
  assert.match(src, /api\.getResearchCondition\(/);
  assert.match(src, /async function renderAssessments/);
  assert.match(src, /async function renderNeuro/);
  assert.match(src, /PubMed/);
  assert.match(src, /Europe PMC/);
});

test('Clinical route keeps live evidence watch in wizard and builder flows', () => {
  const src = read('./pages-clinical.js');
  assert.match(src, /generatedLiveEvidenceContext/);
  assert.match(src, /Live evidence watch/);
  assert.match(src, /loadModalityEvidenceContext\(liveModalities, \{ templateLimit: 4, safetyLimit: 4 \}\)/);
  assert.match(src, /modality-evidence-context\.js/);
  assert.match(src, /loadProtocolWatchContext\(\{/);
  assert.match(src, /protocol-watch-context\.js/);
});

test('Courses route keeps live protocol watch in detail and session execution', () => {
  const src = read('./pages-courses.js');
  assert.match(src, /Live protocol watch:/);
  assert.match(src, /sex-live-evidence-watch/);
  assert.match(src, /Live Protocol Watch/);
  assert.match(src, /loadProtocolWatchContext\(\{/);
  assert.match(src, /protocol-watch-context\.js/);
});

test('Patient route keeps live evidence context on Home and Reports surfaces', () => {
  // pgPatientDashboard was extracted to pages-patient/dashboard.js on
  // 2026-05-02 (continuation of #403). Concatenate both files so the
  // source-grep keeps catching the Home + Reports wiring regardless of
  // which module currently hosts the literal.
  const src = read('./pages-patient.js') + '\n' + read('./pages-patient/dashboard.js');
  assert.match(src, /loadPatientEvidenceContext/);
  assert.match(src, /patient-evidence-context\.js/);
  assert.match(src, /For you today/);
  assert.match(src, /live evidence highlights/);
  assert.match(src, /Evidence linked to your reports/);
});

test('Patient Analytics route keeps live evidence and report context wiring', () => {
  const src = read('./pages-patient-analytics.js');
  assert.match(src, /loadPatientEvidenceContext\(patientId, \{ fetchReports: true \}\)/);
  assert.match(src, /patient-evidence-context\.js/);
  assert.match(src, /Evidence highlights/);
  assert.match(src, /saved citations/);
  assert.match(src, /saved reports/);
  assert.match(src, /live patient evidence\/report store/);
});

// ── Indication seed completeness (added 2026-05-09, DeepDive 2/4 + 3/4) ───────

test('indications_seed.py contains tdcs_asd indication with Grade C and no-FDA-clearance note', () => {
  const seed = readPipeline('indications_seed.py');
  assert.match(seed, /tdcs_asd/, 'tdcs_asd slug must be present in seed');
  assert.match(seed, /Grade C/, 'tdcs_asd must carry Grade C (investigational)');
  assert.match(seed, /No FDA clearance.*ASD|FDA clearance.*ASD.*No/i, 'regulatory note must state no FDA clearance for ASD');
});

test('indications_seed.py contains tps_chronic_pain indication with Grade D and CE-for-Alzheimer-only note', () => {
  const seed = readPipeline('indications_seed.py');
  assert.match(seed, /tps_chronic_pain/, 'tps_chronic_pain slug must be present in seed');
  assert.match(seed, /Grade D/, 'tps_chronic_pain must carry Grade D (experimental)');
  assert.match(
    seed,
    /Alzheimer/i,
    'regulatory note must call out CE mark is for Alzheimer, not chronic pain'
  );
});

// ── Evidence-linked claims wiring regression (added 2026-05-09, DeepDive 3/4) ─

test('Research Evidence indication spine calls evidenceIndicationDetail and renders evidence-linked claims', () => {
  const src = read('./pages-research-evidence.js');
  assert.match(src, /api\.evidenceIndicationDetail/, 'must call evidenceIndicationDetail API');
  assert.match(src, /_renderEvidenceLinkedClaims/, 'must call _renderEvidenceLinkedClaims');
  assert.match(src, /No evidence — clinician judgment required/, 'must have honest empty-evidence state');
});
