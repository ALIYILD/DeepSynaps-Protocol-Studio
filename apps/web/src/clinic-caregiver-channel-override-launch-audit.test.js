// Logic-only tests for the Clinic Caregiver Channel Override launch
// audit (2026-05-01).
//
// Closes section I rec from the Per-Caregiver Channel Preference launch
// audit (#386). Adds a clinic-admin surface for caregiver channel
// preferences. This suite pins the page-level + helper-level surface
// against the source files:
//
//   - api.js exposes caregiverEmailDigestClinicPreferences /
//     AdminOverride / PreviewDispatch under
//     /api/v1/caregiver-consent/email-digest/.
//   - pgCareTeamCoverage adds an admin-only "Caregiver channels" tab
//     with the misconfigured-row count badge, an Override CTA, and a
//     mount-time caregiver_channels_view audit ping.
//   - pgPatientCaregiver renders a "Will dispatch via {channel}"
//     preview banner on the Daily digest delivery panel.
//   - Patient Digest's "Caregiver delivery confirmations" sub-section
//     gets a per-row "Will dispatch via" tag.
//
// Run: node --test src/clinic-caregiver-channel-override-launch-audit.test.js
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
const PAGES_KNOWLEDGE_PATH = path.join(__dirname, 'pages-knowledge.js');
const PAGES_PATIENT_PATH = path.join(__dirname, 'pages-patient.js');


// ── 1. api.js helper coverage ──────────────────────────────────────────────


test('api.js exposes caregiverEmailDigestClinicPreferences helper', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(apiSrc, /caregiverEmailDigestClinicPreferences\s*:/);
});


test('api.js exposes caregiverEmailDigestAdminOverride helper', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(apiSrc, /caregiverEmailDigestAdminOverride\s*:/);
});


test('api.js exposes caregiverEmailDigestPreviewDispatch helper', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(apiSrc, /caregiverEmailDigestPreviewDispatch\s*:/);
});


test('clinic-override helpers route under /api/v1/caregiver-consent/email-digest/', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  // Slice the section between the launch-audit header and the NEXT
  // launch-audit header (or the closing brace of the api object when
  // this is the last section). All clinic-override URL literals must
  // start with the canonical prefix. Sibling launch-audit additions
  // (e.g. Channel Misconfiguration Detector #389) sit BELOW this
  // section, so we cannot rely on the closing-brace anchor any more.
  const idx = apiSrc.indexOf('Clinic Caregiver Channel Override launch-audit');
  assert.ok(idx > 0, 'launch-audit header missing in api.js');
  const after = apiSrc.slice(idx);
  // Stop at the next ── launch-audit header — this is the canonical
  // section separator inside api.js. Fall back to the closing-brace
  // anchor when no further section exists.
  const nextHeaderIdx = after.indexOf('// ── ', 1);
  const sectionEnd = nextHeaderIdx > 0 ? nextHeaderIdx : after.indexOf('};');
  const block = sectionEnd > 0 ? after.slice(0, sectionEnd) : after;
  const urls = block.match(/['"]\/api\/v1\/[^'"]+/g) || [];
  assert.ok(urls.length >= 3, `expected >=3 URLs in the block, got ${urls.length}`);
  for (const u of urls) {
    assert.match(u, /\/api\/v1\/caregiver-consent\/email-digest/);
  }
});


test('caregiverEmailDigestAdminOverride uses HTTP POST method', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  const idx = apiSrc.indexOf('caregiverEmailDigestAdminOverride');
  assert.ok(idx > 0, 'caregiverEmailDigestAdminOverride not found');
  const slice = apiSrc.slice(idx, idx + 360);
  assert.match(slice, /method:\s*['"`]POST['"`]/);
  // Body must carry the note field.
  assert.match(slice, /note/);
});


// ── 2. pgCareTeamCoverage admin tab wiring ─────────────────────────────────


test('pgCareTeamCoverage registers a Caregiver channels tab', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  // Tab id + label must be present.
  assert.match(src, /id:\s*['"]caregiver-channels['"]/);
  assert.match(src, /Caregiver channels/);
});


test('pgCareTeamCoverage gates Caregiver channels tab to admin role', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  // The tab is pushed only when isAdminRole is true so clinicians
  // never see the admin-only surface.
  const fn = src.split('function pgCareTeamCoverage')[1] || '';
  assert.match(fn, /isAdminRole[\s\S]{0,200}caregiver-channels/);
});


test('pgCareTeamCoverage renders renderCaregiverChannelsTab body', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  assert.match(src, /function renderCaregiverChannelsTab/);
  assert.match(src, /ctc-caregiver-channels/);
  assert.match(src, /ctc-caregiver-channel-row/);
  assert.match(src, /ctc-cg-channel-override/);
});


test('pgCareTeamCoverage emits caregiver_channels_view audit on tab render', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const fn = src.split('function renderCaregiverChannelsTab')[1] || '';
  assert.match(fn, /event:\s*['"]caregiver_channels_view['"]/);
});


test('pgCareTeamCoverage override CTA wires to caregiverEmailDigestAdminOverride', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  assert.match(src, /window\._coverageCaregiverChannelOverride/);
  assert.match(src, /api\.caregiverEmailDigestAdminOverride\s*\(/);
});


test('pgCareTeamCoverage override handler requires a non-empty note', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  // Match the FUNCTION definition, not the inline button onclick. The
  // handler is set via ``window._coverageCaregiverChannelOverride =
  // async function(...) { ... }`` so we look for the assignment form.
  const handlerIdx = src.indexOf('window._coverageCaregiverChannelOverride =');
  assert.ok(handlerIdx > 0, 'override handler definition not found');
  const slice = src.slice(handlerIdx, handlerIdx + 1500);
  // Note required prompt + early return on empty string.
  assert.match(slice, /window\.prompt/);
  assert.match(slice, /String\(note\)\.trim\(\)/);
});


test('pgCareTeamCoverage marks misconfigured rows with a MISCONFIGURED chip', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  assert.match(src, /ctc-cg-channel-misconfigured/);
  assert.match(src, /MISCONFIGURED/);
});


// ── 3. pgPatientCaregiver dispatch preview banner ──────────────────────────


test('pgPatientCaregiver loads dispatch preview alongside digest preview', () => {
  const src = (fs.readFileSync(PAGES_PATIENT_PATH, 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'caregiver.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'digest.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'home-devices.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'adherence.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'intake.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'import-wizard.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'media.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'wearables.js'), 'utf8'));
  assert.match(src, /caregiverEmailDigestPreviewDispatch/);
  assert.match(src, /dispatchPreview/);
});


test('pgPatientCaregiver renders a "Will dispatch via" preview banner', () => {
  const src = (fs.readFileSync(PAGES_PATIENT_PATH, 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'caregiver.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'digest.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'home-devices.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'adherence.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'intake.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'import-wizard.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'media.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'wearables.js'), 'utf8'));
  assert.match(src, /pt-cg-digest-dispatch-banner/);
  assert.match(src, /pt-cg-digest-will-dispatch-via/);
  assert.match(src, /Will dispatch via/);
});


test('pgPatientCaregiver banner shows resolved chain compactly', () => {
  const src = (fs.readFileSync(PAGES_PATIENT_PATH, 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'caregiver.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'digest.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'home-devices.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'adherence.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'intake.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'import-wizard.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'media.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'wearables.js'), 'utf8'));
  // Resolved chain + clinic chain printed inline so the patient sees
  // both at a glance.
  assert.match(src, /Resolved chain:/);
  assert.match(src, /clinic chain:/);
});


// ── 4. Patient Digest per-row "Will dispatch via" tag ──────────────────────


test('pgPatientDigest caregiver delivery row has a Will-dispatch-via placeholder', () => {
  const src = (fs.readFileSync(PAGES_PATIENT_PATH, 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'caregiver.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'digest.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'home-devices.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'adherence.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'intake.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'import-wizard.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'media.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'wearables.js'), 'utf8'));
  assert.match(src, /pd-cg-will-dispatch-via/);
});


test('pgPatientDigest hydrates per-row "Will dispatch via" via caregiverEmailDigestPreviewDispatch', () => {
  const src = (fs.readFileSync(PAGES_PATIENT_PATH, 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'caregiver.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'digest.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'home-devices.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'adherence.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'intake.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'import-wizard.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'media.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'wearables.js'), 'utf8'));
  // Hydration calls the preview helper passing the caregiver_user_id.
  const fn = src.split('export async function pgPatientDigest')[1] || '';
  assert.match(fn, /caregiverEmailDigestPreviewDispatch/);
  assert.match(fn, /pd-cg-will-dispatch-via/);
});
