// Static-source wiring tests for the Medical Imaging Preview card.
//
// Protects the 2-line surgical-edit pattern that wires
// `mountMedicalImageCard` into the DeepTwin page. If a future refactor
// silently drops the import, the placeholder div, or the
// try/catch-wrapped mount call on that page, these tests fail.
//
// Historical note: this test previously also pinned the same wiring on
// pages-patient-analytics.js. PR #840 (Clinical data infrastructure
// foundation, 2026-05-10) intentionally rewrote that page into a
// read-only clinical analytics dashboard (summary cards, timeline,
// audit log, risk dashboard) that no longer displays medical images.
// The patient-analytics assertions were removed to match that new
// design surface. If medical-image preview is ever re-added to the
// patient-analytics page, re-introduce the corresponding assertions
// (mount-point id, import, try/catch, audience: clinician).
//
// Run with `node --test src/medical-image-card-wiring.test.js`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DEEPTWIN_PATH = resolve(__dirname, 'pages-deeptwin.js');

const DT_SRC = readFileSync(DEEPTWIN_PATH, 'utf8');

const DT_MOUNT_ID = 'ds-medical-image-card-deeptwin';
const IMPORT_RE = /import\s*\{\s*mountMedicalImageCard\s*\}\s*from\s*['"]\.\/medical-image-card\.js['"]\s*;?/;

test('wiring: deeptwin declares the mount-point id', () => {
  assert.ok(
    DT_SRC.includes(`id="${DT_MOUNT_ID}"`),
    `expected pages-deeptwin.js to contain id="${DT_MOUNT_ID}"`
  );
});

test('wiring: deeptwin imports mountMedicalImageCard from medical-image-card.js', () => {
  assert.ok(
    IMPORT_RE.test(DT_SRC),
    'expected pages-deeptwin.js to import mountMedicalImageCard'
  );
});

test('wiring: deeptwin wraps the mount call in a try/catch block', () => {
  // Allow whitespace and the optional `var _miHost = ...;` line between
  // the `try {` and the actual mountMedicalImageCard(...) call.
  const tryWrapRe = /try\s*\{[\s\S]{0,400}?mountMedicalImageCard\s*\([\s\S]{0,400}?\}\s*catch/;
  assert.ok(
    tryWrapRe.test(DT_SRC),
    'expected pages-deeptwin.js to wrap mountMedicalImageCard in try/catch'
  );
});

test('wiring: deeptwin contains exactly one new import for medical-image-card.js', () => {
  // Match imports that reference the medical-image-card module — guards
  // against a second/duplicate import sneaking in via a refactor.
  const cardImportRe = /import[^;]*from\s*['"]\.\/medical-image-card\.js['"]\s*;?/g;
  const dtMatches = DT_SRC.match(cardImportRe) || [];
  assert.equal(
    dtMatches.length, 1,
    `expected exactly 1 import from ./medical-image-card.js in pages-deeptwin.js, found ${dtMatches.length}`
  );
});

test('wiring: deeptwin mount call passes audience: clinician', () => {
  // The card is meant for clinicians on this surface. Patient-facing
  // wiring must use a different audience and would (correctly) fail this
  // test if it lands in pages-deeptwin.js.
  const clinicianRe = /mountMedicalImageCard\s*\([^)]*audience\s*:\s*['"]clinician['"]/;
  assert.ok(
    clinicianRe.test(DT_SRC),
    'expected pages-deeptwin.js to mount with audience: clinician'
  );
});
