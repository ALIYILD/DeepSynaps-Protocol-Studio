// Static-source wiring tests for the Medical Imaging Preview card —
// Phase 5 page wiring.
//
// Protects the surgical 3-line wiring of `mountMedicalImageCard` into:
//   - Protocol Generator (pages-protocols.js, pgProtocolBuilderV2)
//   - qEEG Analysis (pages-qeeg-analysis.js, pgQEEGAnalysis)
//
// Two pages from the original Phase 5 brief are intentionally deferred:
//   - Upload Review: already covered by the Quick Preview section in
//     pages-mri-analysis.js (mri-quick-preview-section.js). No separate
//     "Upload Review" page exists in the SPA.
//   - Handbook Generator (pages-handbooks.js): the generator is condition-
//     keyed and patient-agnostic — there is no per-patient render path,
//     so a card mount would have no patient_id to pass. Documented here
//     and left for a future Phase 6 if a per-patient handbook surface
//     ever lands.
//
// Run with `node --test src/medical-image-card-wiring-phase5.test.js`.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const PROTOCOLS_PATH = resolve(__dirname, 'pages-protocols.js');
const QEEG_PATH = resolve(__dirname, 'pages-qeeg-analysis.js');
const HANDBOOKS_PATH = resolve(__dirname, 'pages-handbooks.js');
const MRI_PATH = resolve(__dirname, 'pages-mri-analysis.js');

const PROTOCOLS_SRC = readFileSync(PROTOCOLS_PATH, 'utf8');
const QEEG_SRC = readFileSync(QEEG_PATH, 'utf8');

const PROTOCOLS_MOUNT_ID = 'ds-medical-image-card-protocols';
const QEEG_MOUNT_ID = 'ds-medical-image-card-qeeg-analysis';
const IMPORT_RE = /import\s*\{\s*mountMedicalImageCard\s*\}\s*from\s*['"]\.\/medical-image-card\.js['"]\s*;?/;

// ── Wired pages ──────────────────────────────────────────────────────────────

test('phase5 wiring: pages-protocols declares the mount-point id', () => {
  assert.ok(
    PROTOCOLS_SRC.includes(`id="${PROTOCOLS_MOUNT_ID}"`),
    `expected pages-protocols.js to contain id="${PROTOCOLS_MOUNT_ID}"`
  );
});

test('phase5 wiring: pages-qeeg-analysis declares the mount-point id', () => {
  assert.ok(
    QEEG_SRC.includes(`id="${QEEG_MOUNT_ID}"`),
    `expected pages-qeeg-analysis.js to contain id="${QEEG_MOUNT_ID}"`
  );
});

test('phase5 wiring: each wired page imports mountMedicalImageCard from medical-image-card.js', () => {
  assert.ok(
    IMPORT_RE.test(PROTOCOLS_SRC),
    'expected pages-protocols.js to import mountMedicalImageCard'
  );
  assert.ok(
    IMPORT_RE.test(QEEG_SRC),
    'expected pages-qeeg-analysis.js to import mountMedicalImageCard'
  );
});

test('phase5 wiring: each wired page wraps the mount call in a try/catch block', () => {
  // Allow whitespace and any helper lines (e.g. `var _miHost = ...;`)
  // between the `try {` and the actual mountMedicalImageCard(...) call.
  const tryWrapRe = /try\s*\{[\s\S]{0,400}?mountMedicalImageCard\s*\([\s\S]{0,400}?\}\s*catch/;
  assert.ok(
    tryWrapRe.test(PROTOCOLS_SRC),
    'expected pages-protocols.js to wrap mountMedicalImageCard in try/catch'
  );
  assert.ok(
    tryWrapRe.test(QEEG_SRC),
    'expected pages-qeeg-analysis.js to wrap mountMedicalImageCard in try/catch'
  );
});

test('phase5 wiring: mount call passes audience: clinician on both wired pages', () => {
  const clinicianRe = /mountMedicalImageCard\s*\([^)]*audience\s*:\s*['"]clinician['"]/;
  assert.ok(
    clinicianRe.test(PROTOCOLS_SRC),
    'expected pages-protocols.js to mount with audience: clinician'
  );
  assert.ok(
    clinicianRe.test(QEEG_SRC),
    'expected pages-qeeg-analysis.js to mount with audience: clinician'
  );
});

test('phase5 wiring: each wired page contains exactly one new import for medical-image-card.js', () => {
  // Guards against a second/duplicate import sneaking in via a refactor.
  const cardImportRe = /import[^;]*from\s*['"]\.\/medical-image-card\.js['"]\s*;?/g;
  const protocolsMatches = PROTOCOLS_SRC.match(cardImportRe) || [];
  const qeegMatches = QEEG_SRC.match(cardImportRe) || [];
  assert.equal(
    protocolsMatches.length, 1,
    `expected exactly 1 import from ./medical-image-card.js in pages-protocols.js, found ${protocolsMatches.length}`
  );
  assert.equal(
    qeegMatches.length, 1,
    `expected exactly 1 import from ./medical-image-card.js in pages-qeeg-analysis.js, found ${qeegMatches.length}`
  );
});

// ── Deferrals ────────────────────────────────────────────────────────────────
// These pages exist but were intentionally NOT wired. The tests verify the
// files are still present (so the deferral remains intentional and visible in
// review) and that no Phase 5 wiring leaked into them.

test('phase5 deferral: pages-handbooks.js exists but is patient-agnostic — no card wired', () => {
  assert.ok(
    existsSync(HANDBOOKS_PATH),
    'expected pages-handbooks.js to exist (handbook generator is condition-keyed; no per-patient render path)'
  );
  const src = readFileSync(HANDBOOKS_PATH, 'utf8');
  const cardImportRe = /import[^;]*from\s*['"]\.\/medical-image-card\.js['"]/g;
  const matches = src.match(cardImportRe) || [];
  assert.equal(
    matches.length, 0,
    'pages-handbooks.js must not import medical-image-card.js — handbook generator has no per-patient context to pass to the card'
  );
});

test('phase5 deferral: Upload Review surface is the MRI Quick Preview, not a separate page', () => {
  // Confirm the Quick Preview section is wired in pages-mri-analysis.js so
  // the "Upload Review" requirement from the Phase 5 brief is already
  // satisfied by an earlier phase of the work — no new wiring required.
  assert.ok(
    existsSync(MRI_PATH),
    'expected pages-mri-analysis.js to exist as the Upload Review surface'
  );
  const src = readFileSync(MRI_PATH, 'utf8');
  assert.ok(
    /mountQuickPreviewSection|ds-mri-quick-preview-mount/.test(src),
    'expected pages-mri-analysis.js to host the Quick Preview section that subsumes the Upload Review surface'
  );
});
