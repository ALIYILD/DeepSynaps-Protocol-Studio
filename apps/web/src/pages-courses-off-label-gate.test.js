// Pins the off-label acknowledgement capture wiring in pages-courses.js.
//
// The backend off-label gate (PR #1093) returns 403 with
// code='off_label_consent_missing' when an off-label course is activated
// without a signed ConsentRecord(consent_type='off_label_acknowledgement').
// The frontend in `_activateCourseDetail` MUST detect this code, prompt the
// clinician, POST the acknowledgement, and retry the original activate call.
//
// These assertions are source-level rather than DOM-level so the contract is
// pinned without requiring a full jsdom + api mock harness.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(__dirname, './pages-courses.js'), 'utf8');

test('off-label gate handler exists', () => {
  assert.match(src, /_cdHandleOffLabelGate/, 'expected _cdHandleOffLabelGate helper');
});

test('handler reads patient + modality from the course', () => {
  assert.match(src, /api\.getCourse\(courseId\)/);
  assert.match(src, /course\?\.patient_id/);
  assert.match(src, /course\?\.modality_slug/);
});

test('handler POSTs the off-label acknowledgement consent', () => {
  assert.match(src, /api\.createConsent\(/);
  assert.match(src, /consent_type: 'off_label_acknowledgement'/);
  assert.match(src, /signed: true/);
});

test('clear-path activation routes 403 off_label_consent_missing through the gate', () => {
  // Capture the block following the clear-path activate try.
  const match = src.match(
    /\/\/ Step 2 — clear path[\s\S]*?_cdHandleOffLabelGate\(courseId, async \(\)/,
  );
  assert.ok(match, 'expected clear-path activate handler to invoke _cdHandleOffLabelGate on the off_label code');
  assert.match(match[0], /e\?\.code === 'off_label_consent_missing'/);
});

test('safety-override activation routes 403 off_label_consent_missing through the gate', () => {
  const match = src.match(
    /_cdConfirmSafetyOverride[\s\S]*?_cdHandleOffLabelGate\(courseId, async \(\)/,
  );
  assert.ok(match, 'expected safety-override handler to invoke _cdHandleOffLabelGate on the off_label code');
  assert.match(match[0], /e\?\.code === 'off_label_consent_missing'/);
});

test('cancellation surfaces a clinician-visible message (does not silently swallow)', () => {
  assert.match(src, /Activation cancelled — off-label acknowledgement not recorded/);
});
