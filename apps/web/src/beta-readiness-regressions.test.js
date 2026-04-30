// ─────────────────────────────────────────────────────────────────────────────
// beta-readiness-regressions.test.js
//
// Source-level regression tests for the beta-readiness pass on
// cursor/beta-readiness-functional-completion-9a99.
//
// These tests do not exercise the runtime DOM. They scan the source files
// directly to catch reintroductions of:
//   1. Pretend MRI buttons that show "coming soon" toasts.
//   2. Pretend Virtual-Care call controls that lived outside the Jitsi iframe.
//   3. Documents Hub "PDF generation coming soon" fallback.
//
// Run: node --test src/beta-readiness-regressions.test.js
// ─────────────────────────────────────────────────────────────────────────────
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

test('MRI analyzer no longer renders pretend Share / Open in Neuronav buttons', () => {
  const src = read('./pages-mri-analysis.js');
  // The bottom strip used to render these as visible buttons. They are now
  // hidden because no real backend integration exists.
  assert.ok(!/btn btn-sm ds-mri-share/.test(src),
    '`ds-mri-share` button must not be rendered (pretend "Sharing coming soon")');
  assert.ok(!/btn btn-sm ds-mri-open-neuronav/.test(src),
    '`ds-mri-open-neuronav` button must not be rendered (pretend "Neuronav coming soon")');
});

test('MRI analyzer no longer toasts "Sent target to Neuronav (stub)"', () => {
  const src = read('./pages-mri-analysis.js');
  assert.ok(!/Sent target to Neuronav \(stub\)/.test(src),
    '"(stub)" toast text must not exist; the per-target action now exports JSON');
  assert.ok(!/Sharing coming soon/.test(src),
    '"Sharing coming soon" toast text must not exist');
  assert.ok(!/Neuronav integration coming soon/.test(src),
    '"Neuronav integration coming soon" toast text must not exist');
});

test('Virtual care no longer renders pretend mute / camera / record buttons outside Jitsi', () => {
  const src = read('./pages-virtualcare.js');
  // The previous markup had these as outer-iframe duplicates — they would
  // emit a toast but never reach the Jitsi <iframe> media tracks.
  assert.ok(!/_vcCallCtrl\('mute'\)/.test(src),
    'outer mute button must not be rendered');
  assert.ok(!/_vcCallCtrl\('video'\)/.test(src),
    'outer video toggle must not be rendered');
  assert.ok(!/_vcCallCtrl\('record'\)/.test(src),
    'outer record toggle must not be rendered');
  // The note button is allowed because it opens the in-app capture modal.
  assert.match(src, /_vcCallCtrl\('note'\)/);
});

test('Virtual care _vcCallCtrl no longer surfaces pretend "<ctrl> toggled" toast', () => {
  const src = read('./pages-virtualcare.js');
  assert.ok(!/`\$\{ctrl\} toggled\.`/.test(src),
    'the pretend `<ctrl> toggled.` toast text must not exist');
});

test('Documents Hub no longer falls back to "PDF generation coming soon"', () => {
  const src = read('./pages-clinical-tools.js');
  assert.ok(!/PDF generation coming soon/.test(src),
    'docs hub Download fallback must not show the "PDF generation coming soon" toast — it now uses api.documentDownloadUrl()');
});

test('Documents Hub _dhFill no longer says "In-platform form filling not yet wired"', () => {
  const src = read('./pages-clinical-tools.js');
  assert.ok(!/In-platform form filling not yet wired/.test(src),
    '_dhFill must not show the "not yet wired" toast — Consent forms route into consent-management; other categories are filled via the patient portal');
});
