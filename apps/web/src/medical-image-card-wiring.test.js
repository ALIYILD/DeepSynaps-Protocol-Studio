// Static-source wiring tests for the Medical Imaging Preview card.
//
// Protects the 2-line surgical-edit pattern that wires
// `mountMedicalImageCard` into the Patient Analytics dashboard and the
// DeepTwin page. If a future refactor silently drops the import, the
// placeholder div, or the try/catch-wrapped mount call, these tests
// fail.
//
// Run with `node --test src/medical-image-card-wiring.test.js`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const PATIENT_ANALYTICS_PATH = resolve(__dirname, 'pages-patient-analytics.js');
const DEEPTWIN_PATH = resolve(__dirname, 'pages-deeptwin.js');

const PA_SRC = readFileSync(PATIENT_ANALYTICS_PATH, 'utf8');
const DT_SRC = readFileSync(DEEPTWIN_PATH, 'utf8');

const PA_MOUNT_ID = 'ds-medical-image-card-patient-analytics';
const DT_MOUNT_ID = 'ds-medical-image-card-deeptwin';
const IMPORT_RE = /import\s*\{\s*mountMedicalImageCard\s*\}\s*from\s*['"]\.\/medical-image-card\.js['"]\s*;?/;

test('wiring: patient analytics declares the mount-point id', () => {
  assert.ok(
    PA_SRC.includes(`id="${PA_MOUNT_ID}"`),
    `expected pages-patient-analytics.js to contain id="${PA_MOUNT_ID}"`
  );
});

test('wiring: deeptwin declares the mount-point id', () => {
  assert.ok(
    DT_SRC.includes(`id="${DT_MOUNT_ID}"`),
    `expected pages-deeptwin.js to contain id="${DT_MOUNT_ID}"`
  );
});

test('wiring: each page imports mountMedicalImageCard from medical-image-card.js', () => {
  assert.ok(
    IMPORT_RE.test(PA_SRC),
    'expected pages-patient-analytics.js to import mountMedicalImageCard'
  );
  assert.ok(
    IMPORT_RE.test(DT_SRC),
    'expected pages-deeptwin.js to import mountMedicalImageCard'
  );
});

test('wiring: each page wraps the mount call in a try/catch block', () => {
  // Allow whitespace and the optional `var _miHost = ...;` line between
  // the `try {` and the actual mountMedicalImageCard(...) call.
  const tryWrapRe = /try\s*\{[\s\S]{0,400}?mountMedicalImageCard\s*\([\s\S]{0,400}?\}\s*catch/;
  assert.ok(
    tryWrapRe.test(PA_SRC),
    'expected pages-patient-analytics.js to wrap mountMedicalImageCard in try/catch'
  );
  assert.ok(
    tryWrapRe.test(DT_SRC),
    'expected pages-deeptwin.js to wrap mountMedicalImageCard in try/catch'
  );
});

test('wiring: each page contains exactly one new import for medical-image-card.js', () => {
  // Match imports that reference the medical-image-card module — guards
  // against a second/duplicate import sneaking in via a refactor.
  const cardImportRe = /import[^;]*from\s*['"]\.\/medical-image-card\.js['"]\s*;?/g;
  const paMatches = PA_SRC.match(cardImportRe) || [];
  const dtMatches = DT_SRC.match(cardImportRe) || [];
  assert.equal(
    paMatches.length, 1,
    `expected exactly 1 import from ./medical-image-card.js in pages-patient-analytics.js, found ${paMatches.length}`
  );
  assert.equal(
    dtMatches.length, 1,
    `expected exactly 1 import from ./medical-image-card.js in pages-deeptwin.js, found ${dtMatches.length}`
  );
});

test('wiring: mount call passes audience: clinician on both pages', () => {
  // The card is meant for clinicians on these surfaces. Patient-facing
  // wiring must use a different audience and would (correctly) fail this
  // test if it lands in either of these two pages.
  const clinicianRe = /mountMedicalImageCard\s*\([^)]*audience\s*:\s*['"]clinician['"]/;
  assert.ok(
    clinicianRe.test(PA_SRC),
    'expected pages-patient-analytics.js to mount with audience: clinician'
  );
  assert.ok(
    clinicianRe.test(DT_SRC),
    'expected pages-deeptwin.js to mount with audience: clinician'
  );
});
