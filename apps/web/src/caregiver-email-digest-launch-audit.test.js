// Logic-only tests for the Caregiver Email Digest launch-audit (2026-05-01).
//
// Closes the bidirectional notification loop opened by Caregiver
// Notification Hub #379. Daily roll-up dispatch of unread caregiver
// notifications via the on-call delivery adapters in mock mode unless
// real env vars are set. This suite pins the page-level + helper-level
// surface against the source files:
//
//   - api.js exposes the helpers needed by pgPatientCaregiver
//     (caregiverEmailDigestPreview / SendNow / PreferencesGet /
//     PreferencesPut / postCaregiverEmailDigestAuditEvent) all routed
//     under /api/v1/caregiver-consent/email-digest*.
//   - pgPatientCaregiver renders the "Daily digest delivery" subsection
//     with consent chip, preview text, enabled toggle, frequency
//     dropdown, time-of-day picker, "Send now" CTA, and "Save
//     preferences" CTA — plus the mount-time
//     `caregiver_portal.email_digest_view` audit ping.
//
// Run: node --test src/caregiver-email-digest-launch-audit.test.js
//
// Note: apps/web tests use Node's built-in `node --test`, NOT vitest.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';


const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


const API_PATH = path.join(__dirname, 'api.js');
const PAGES_PATIENT_PATH = path.join(__dirname, 'pages-patient.js');


// ── 1. api.js helper coverage ──────────────────────────────────────────────


test('api.js exposes caregiverEmailDigestPreview helper', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(apiSrc, /caregiverEmailDigestPreview\s*:/);
});


test('api.js exposes caregiverEmailDigestSendNow helper', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(apiSrc, /caregiverEmailDigestSendNow\s*:/);
});


test('api.js exposes caregiverEmailDigestPreferencesGet helper', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(apiSrc, /caregiverEmailDigestPreferencesGet\s*:/);
});


test('api.js exposes caregiverEmailDigestPreferencesPut helper', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(apiSrc, /caregiverEmailDigestPreferencesPut\s*:/);
});


test('api.js exposes postCaregiverEmailDigestAuditEvent helper', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(apiSrc, /postCaregiverEmailDigestAuditEvent\s*:/);
});


test('email-digest helpers route under /api/v1/caregiver-consent/email-digest', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  const after = apiSrc.split('Caregiver Email Digest launch-audit')[1] || '';
  // Slice ends at the next major header divider in api.js.
  const sectionEnd = after.search(/\n\s*\/\/\s*──/);
  const block = sectionEnd > 0 ? after.slice(0, sectionEnd) : after;
  const urls = block.match(/['"`]\/api\/v1\/[^'"`]+/g) || [];
  assert.ok(urls.length >= 4, `expected at least 4 URLs in the block, got ${urls.length}`);
  for (const u of urls) {
    assert.match(u, /\/api\/v1\/caregiver-consent\/email-digest/);
  }
});


// ── 2. PUT preferences uses the PUT method ─────────────────────────────────


test('caregiverEmailDigestPreferencesPut uses HTTP PUT method', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  // Pull the slice between the function name and the next blank line / closing brace.
  const idx = apiSrc.indexOf('caregiverEmailDigestPreferencesPut');
  assert.ok(idx > 0, 'caregiverEmailDigestPreferencesPut not found');
  const slice = apiSrc.slice(idx, idx + 240);
  assert.match(slice, /method:\s*['"`]PUT['"`]/);
});


// ── 3. pgPatientCaregiver renders the email-digest subsection ──────────────


test('pgPatientCaregiver renders the Daily digest delivery panel', () => {
  const src = (fs.readFileSync(PAGES_PATIENT_PATH, 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'caregiver.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'digest.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'home-devices.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'adherence.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'intake.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'import-wizard.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'media.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'wearables.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'symptom-notifications.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'dashboard.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'sessions.js'), 'utf8'));
  assert.match(src, /pt-cg-email-digest-panel/);
  assert.match(src, /Daily digest delivery/);
});


test('pgPatientCaregiver renders consent chip + preview text', () => {
  const src = (fs.readFileSync(PAGES_PATIENT_PATH, 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'caregiver.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'digest.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'home-devices.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'adherence.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'intake.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'import-wizard.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'media.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'wearables.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'symptom-notifications.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'dashboard.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'sessions.js'), 'utf8'));
  assert.match(src, /pt-cg-digest-consent-chip/);
  assert.match(src, /pt-cg-digest-preview/);
  // Honest empty / non-empty preview labels.
  assert.match(src, /No unread notifications would be included/);
});


test('pgPatientCaregiver wires the Send now CTA to caregiverEmailDigestSendNow', () => {
  const src = (fs.readFileSync(PAGES_PATIENT_PATH, 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'caregiver.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'digest.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'home-devices.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'adherence.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'intake.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'import-wizard.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'media.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'wearables.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'symptom-notifications.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'dashboard.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'sessions.js'), 'utf8'));
  assert.match(src, /pt-cg-digest-send-now/);
  assert.match(src, /api\.caregiverEmailDigestSendNow\s*\(/);
});


test('pgPatientCaregiver wires the Save preferences CTA to caregiverEmailDigestPreferencesPut', () => {
  const src = (fs.readFileSync(PAGES_PATIENT_PATH, 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'caregiver.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'digest.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'home-devices.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'adherence.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'intake.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'import-wizard.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'media.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'wearables.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'symptom-notifications.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'dashboard.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'sessions.js'), 'utf8'));
  assert.match(src, /pt-cg-digest-save-prefs/);
  assert.match(src, /api\.caregiverEmailDigestPreferencesPut\s*\(/);
});


test('pgPatientCaregiver renders the enabled / frequency / time-of-day inputs', () => {
  const src = (fs.readFileSync(PAGES_PATIENT_PATH, 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'caregiver.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'digest.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'home-devices.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'adherence.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'intake.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'import-wizard.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'media.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'wearables.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'symptom-notifications.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'dashboard.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'sessions.js'), 'utf8'));
  assert.match(src, /id="pt-cg-digest-enabled"/);
  assert.match(src, /id="pt-cg-digest-frequency"/);
  assert.match(src, /id="pt-cg-digest-time-of-day"/);
  // Frequency dropdown carries the canonical values.
  assert.match(src, /value="daily"/);
  assert.match(src, /value="weekly"/);
});


test('pgPatientCaregiver emits caregiver_portal.email_digest_view on mount', () => {
  const src = (fs.readFileSync(PAGES_PATIENT_PATH, 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'caregiver.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'digest.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'home-devices.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'adherence.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'intake.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'import-wizard.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'media.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'wearables.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'symptom-notifications.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'dashboard.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'sessions.js'), 'utf8'));
  assert.match(src, /event:\s*['"`]email_digest_view['"`]/);
});


test('pgPatientCaregiver emits send_now_clicked / preferences_saved_ui audit pings', () => {
  const src = (fs.readFileSync(PAGES_PATIENT_PATH, 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'caregiver.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'digest.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'home-devices.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'adherence.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'intake.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'import-wizard.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'media.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'wearables.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'symptom-notifications.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'dashboard.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'sessions.js'), 'utf8'));
  assert.match(src, /postCaregiverEmailDigestAuditEvent\s*\(/);
  assert.match(src, /event:\s*['"`]send_now_clicked['"`]/);
  assert.match(src, /event:\s*['"`]preferences_saved_ui['"`]/);
});
