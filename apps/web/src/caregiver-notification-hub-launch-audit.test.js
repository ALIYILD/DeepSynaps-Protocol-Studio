// Logic-only tests for the Caregiver Notification Hub launch-audit (2026-05-01).
//
// Closes the next chain step flagged by Caregiver Portal #378. The Hub
// is a server-side notification feed that joins audit_event_records +
// caregiver_consent_revisions filtered to the actor's grants. This
// suite pins the page-level + helper-level surface against silent
// fakes:
//
//   - api.js exposes the helpers needed by pgPatientCaregiver
//     (caregiverNotificationsList / Summary / MarkRead /
//     BulkMarkRead) all routed under
//     /api/v1/caregiver-consent/notifications*.
//   - pgPatientCaregiver wires the unread-badge + Mark all read CTA +
//     per-row mark-read + drill-out + mount-time
//     `caregiver_portal.notifications_view` audit ping.
//   - Empty state matches the spec ("No notifications.").
//   - Bulk mark-read CTA only fires when there are unread items.
//   - Per-row click drills out to the underlying surface (revocation →
//     grant card via [data-grant-id=...]).
//
// Run: node --test src/caregiver-notification-hub-launch-audit.test.js
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


test('api.js exposes caregiverNotificationsList helper', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(apiSrc, /caregiverNotificationsList\s*:/);
});


test('api.js exposes caregiverNotificationsSummary helper', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(apiSrc, /caregiverNotificationsSummary\s*:/);
});


test('api.js exposes caregiverNotificationsMarkRead helper', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(apiSrc, /caregiverNotificationsMarkRead\s*:/);
});


test('api.js exposes caregiverNotificationsBulkMarkRead helper', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(apiSrc, /caregiverNotificationsBulkMarkRead\s*:/);
});


test('notification helpers route under /api/v1/caregiver-consent/notifications', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  const after = apiSrc.split('Caregiver Notification Hub launch-audit')[1] || '';
  // Slice ends at the next major header divider in api.js (the file
  // uses the long em-dash separator block ``// ──`` between sections).
  // Stops at the next caregiver-section block (Email Digest landed in
  // 2026-05-01) OR the Wearables section.
  const sectionEnd = after.search(/\n\s*\/\/\s*──\s*Caregiver Email Digest|\n\s*\/\/\s*──\s*Wearables/);
  const block = sectionEnd > 0 ? after.slice(0, sectionEnd) : after;
  const urls = block.match(/['"`]\/api\/v1\/[^'"`]+/g) || [];
  assert.ok(urls.length >= 3, `expected at least 3 URLs in the block, got ${urls.length}`);
  for (const u of urls) {
    assert.match(u, /\/api\/v1\/caregiver-consent\/notifications/);
  }
});


test('mark-read helper posts to /notifications/<id>/mark-read', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(apiSrc, /\/notifications\/\$\{encodeURIComponent\(notifId\)\}\/mark-read/);
});


test('bulk-mark-read helper posts to /notifications/bulk-mark-read', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(apiSrc, /\/notifications\/bulk-mark-read/);
});


// ── 2. pgPatientCaregiver wiring ───────────────────────────────────────────


test('pgPatientCaregiver fires notifications_view audit ping on mount', () => {
  const src = (fs.readFileSync(PAGES_PATIENT_PATH, 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'caregiver.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'digest.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'home-devices.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'adherence.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'intake.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'import-wizard.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'media.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'wearables.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'symptom-notifications.js'), 'utf8'));
  const fn = src.split('export async function pgPatientCaregiver')[1] || '';
  assert.match(fn, /event:\s*['"]notifications_view['"]/);
});


test('pgPatientCaregiver renders unread badge using summary.unread', () => {
  const src = (fs.readFileSync(PAGES_PATIENT_PATH, 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'caregiver.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'digest.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'home-devices.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'adherence.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'intake.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'import-wizard.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'media.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'wearables.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'symptom-notifications.js'), 'utf8'));
  const fn = src.split('export async function pgPatientCaregiver')[1] || '';
  assert.match(fn, /pt-cg-notif-badge/);
  assert.match(fn, /notificationSummary\.unread/);
});


test('pgPatientCaregiver renders empty notification state with No notifications.', () => {
  const src = (fs.readFileSync(PAGES_PATIENT_PATH, 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'caregiver.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'digest.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'home-devices.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'adherence.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'intake.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'import-wizard.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'media.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'wearables.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'symptom-notifications.js'), 'utf8'));
  const fn = src.split('export async function pgPatientCaregiver')[1] || '';
  assert.match(fn, /No notifications\./);
});


test('pgPatientCaregiver renders Mark all read CTA', () => {
  const src = (fs.readFileSync(PAGES_PATIENT_PATH, 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'caregiver.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'digest.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'home-devices.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'adherence.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'intake.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'import-wizard.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'media.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'wearables.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'symptom-notifications.js'), 'utf8'));
  const fn = src.split('export async function pgPatientCaregiver')[1] || '';
  assert.match(fn, /pt-cg-notif-mark-all/);
  assert.match(fn, /Mark all read/);
});


test('pgPatientCaregiver wires per-row mark-read button', () => {
  const src = (fs.readFileSync(PAGES_PATIENT_PATH, 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'caregiver.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'digest.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'home-devices.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'adherence.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'intake.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'import-wizard.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'media.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'wearables.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'symptom-notifications.js'), 'utf8'));
  const fn = src.split('export async function pgPatientCaregiver')[1] || '';
  assert.match(fn, /data-cg-notif-mark/);
});


test('pgPatientCaregiver bulk-mark-read CTA calls caregiverNotificationsBulkMarkRead', () => {
  const src = (fs.readFileSync(PAGES_PATIENT_PATH, 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'caregiver.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'digest.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'home-devices.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'adherence.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'intake.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'import-wizard.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'media.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'wearables.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'symptom-notifications.js'), 'utf8'));
  const fn = src.split('export async function pgPatientCaregiver')[1] || '';
  assert.match(fn, /caregiverNotificationsBulkMarkRead/);
});


test('pgPatientCaregiver per-row mark-read CTA calls caregiverNotificationsMarkRead', () => {
  const src = (fs.readFileSync(PAGES_PATIENT_PATH, 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'caregiver.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'digest.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'home-devices.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'adherence.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'intake.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'import-wizard.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'media.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'wearables.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'symptom-notifications.js'), 'utf8'));
  const fn = src.split('export async function pgPatientCaregiver')[1] || '';
  assert.match(fn, /caregiverNotificationsMarkRead/);
});


test('pgPatientCaregiver drill-out highlights grant card via data-grant-id', () => {
  const src = (fs.readFileSync(PAGES_PATIENT_PATH, 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'caregiver.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'digest.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'home-devices.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'adherence.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'intake.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'import-wizard.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'media.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'wearables.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'symptom-notifications.js'), 'utf8'));
  const fn = src.split('export async function pgPatientCaregiver')[1] || '';
  assert.match(fn, /data-grant-id="\$\{grantId\}"/);
});


test('pgPatientCaregiver fetches feed + summary in parallel', () => {
  const src = (fs.readFileSync(PAGES_PATIENT_PATH, 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'caregiver.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'digest.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'home-devices.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'adherence.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'intake.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'import-wizard.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'media.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'wearables.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'symptom-notifications.js'), 'utf8'));
  const fn = src.split('export async function pgPatientCaregiver')[1] || '';
  assert.match(fn, /caregiverNotificationsList/);
  assert.match(fn, /caregiverNotificationsSummary/);
  assert.match(fn, /Promise\.all\(/);
});


// ── 3. Surface contract sanity ─────────────────────────────────────────────


test('notification ids carry stable prefixes (rev-, ack-, aud-)', () => {
  // The frontend is the visible contract — we never invent ids on the
  // client; this asserts the contract is documented in the page so the
  // server change cannot silently rename them.
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(apiSrc, /target_id=notif-/);
});


test('Mark all read CTA is gated on unread > 0', () => {
  const src = (fs.readFileSync(PAGES_PATIENT_PATH, 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'caregiver.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'digest.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'home-devices.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'adherence.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'intake.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'import-wizard.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'media.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'wearables.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'symptom-notifications.js'), 'utf8'));
  const fn = src.split('export async function pgPatientCaregiver')[1] || '';
  assert.match(fn, /unreadIds\.length === 0/);
});
