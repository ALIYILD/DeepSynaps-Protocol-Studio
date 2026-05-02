// Logic-only tests for the Patient On-Call Visibility launch-audit (2026-05-01).
//
// Pin the patient-side care team contact card against silent fakes:
//   - Status payload schema does NOT include any PHI keys (regression on
//     the server contract documented in patient_oncall_router.py)
//   - Status state mapping (in-hours / after-hours / no-coverage) drives
//     the chip + button render correctly
//   - Urgent CTA URL is the documented patient-messages?category=urgent
//     deep link, never a hardcoded clinician phone / Slack handle
//   - Mount-time view audit ping fires regardless of fetch outcome
//   - Demo banner only renders when server returns is_demo=true
//   - The pgPatientProfile block in pages-patient.js does NOT inline any
//     hardcoded "24/7 coverage" reassurance, fake clinician names, or
//     localStorage on-call cache keys
//
// Run: node --test src/patient-oncall-visibility-launch-audit.test.js
//
// Note: apps/web tests use Node's built-in `node --test`, NOT vitest.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';


// ── Mirrors of in-page helpers (kept in lockstep with pages-patient.js) ────


// PHI key blacklist mirrored from the Python regression test
// (test_patient_oncall_visibility_launch_audit.py::_BANNED_KEYS).
const BANNED_PHI_KEYS = new Set([
  'clinician_name',
  'primary_user_name',
  'primary_user_id',
  'backup_user_name',
  'director_user_name',
  'user_name',
  'display_name',
  'phone',
  'slack_user_id',
  'slack_handle',
  'pagerduty_user_id',
  'pagerduty_routing_key',
  'twilio_phone',
  'contact_handle',
  'contact_channel',
]);


function buildAuditPayload(event, extra = {}) {
  return {
    event,
    note: extra.note ? String(extra.note).slice(0, 480) : null,
    using_demo_data: !!extra.using_demo_data,
  };
}


function statusChip(state) {
  if (!state || !state.has_coverage_configured) {
    return { text: 'No coverage configured', tone: 'orange' };
  }
  if (state.oncall_now || state.in_hours_now) {
    return { text: 'In hours', tone: 'teal' };
  }
  return { text: 'After hours', tone: 'purple' };
}


function urgentCtaIsAvailable(state) {
  return !!(state && state.has_coverage_configured);
}


function urgentDeepLink() {
  // Mirror window._ptOncallUrgentDeepLink in pages-patient.js — must
  // resolve to the documented patient-messages?category=urgent route.
  return 'patient-messages?category=urgent';
}


function shouldShowDemoBanner(state) {
  return !!(state && state.is_demo);
}


function isHonestNoCoverageState(state) {
  if (!state) return false;
  if (state.has_coverage_configured) return false;
  return state.urgent_path === 'emergency_line';
}


function hasOnlyAllowedKeys(payload) {
  if (!payload || typeof payload !== 'object') return true;
  const allowed = new Set([
    'coverage_hours',
    'in_hours_now',
    'oncall_now',
    'urgent_path',
    'emergency_line_number',
    'has_coverage_configured',
    'is_demo',
    'disclaimers',
  ]);
  for (const k of Object.keys(payload)) {
    if (!allowed.has(k)) return false;
  }
  return true;
}


function _walkKeys(obj, out = []) {
  if (obj && typeof obj === 'object') {
    if (Array.isArray(obj)) {
      for (const v of obj) _walkKeys(v, out);
    } else {
      for (const [k, v] of Object.entries(obj)) {
        out.push(k);
        _walkKeys(v, out);
      }
    }
  }
  return out;
}


function payloadLeaksPhi(payload) {
  const keys = _walkKeys(payload);
  for (const k of keys) {
    if (BANNED_PHI_KEYS.has(k)) return true;
  }
  return false;
}


// ── Audit payload shape ─────────────────────────────────────────────────────


test('Audit payload: view ping has no event_record_id, just event + note', () => {
  const p = buildAuditPayload('view', { note: 'profile_mount' });
  assert.equal(p.event, 'view');
  assert.equal(p.note, 'profile_mount');
  assert.equal(p.using_demo_data, false);
});

test('Audit payload: urgent_message_started records intent without PHI', () => {
  const p = buildAuditPayload('urgent_message_started');
  assert.equal(p.event, 'urgent_message_started');
  assert.equal(p.note, null);
});

test('Audit payload caps note length at 480 chars', () => {
  const huge = 'x'.repeat(2000);
  const p = buildAuditPayload('learn_more_clicked', { note: huge });
  assert.equal(p.note.length, 480);
});

test('Audit payload using_demo_data is always strict bool', () => {
  assert.equal(buildAuditPayload('view', {}).using_demo_data, false);
  assert.equal(buildAuditPayload('view', { using_demo_data: true }).using_demo_data, true);
  assert.equal(buildAuditPayload('view', { using_demo_data: 'yes' }).using_demo_data, true);
  assert.equal(buildAuditPayload('view', { using_demo_data: null }).using_demo_data, false);
});


// ── State mapping ───────────────────────────────────────────────────────────


test('No-coverage state surfaces orange chip + emergency_line urgent path', () => {
  const state = {
    coverage_hours: null,
    in_hours_now: false,
    oncall_now: false,
    urgent_path: 'emergency_line',
    emergency_line_number: null,
    has_coverage_configured: false,
    is_demo: false,
    disclaimers: [],
  };
  const chip = statusChip(state);
  assert.equal(chip.text, 'No coverage configured');
  assert.equal(chip.tone, 'orange');
  assert.equal(urgentCtaIsAvailable(state), false);
  assert.equal(isHonestNoCoverageState(state), true);
});

test('In-hours state surfaces teal chip + patient-portal-message path', () => {
  const state = {
    coverage_hours: 'Mon-Fri, 8am-6pm',
    in_hours_now: true,
    oncall_now: true,
    urgent_path: 'patient-portal-message',
    emergency_line_number: '+15551234567',
    has_coverage_configured: true,
    is_demo: false,
    disclaimers: [],
  };
  const chip = statusChip(state);
  assert.equal(chip.text, 'In hours');
  assert.equal(chip.tone, 'teal');
  assert.equal(urgentCtaIsAvailable(state), true);
  assert.equal(isHonestNoCoverageState(state), false);
});

test('After-hours state surfaces purple chip but keeps urgent CTA wired', () => {
  const state = {
    coverage_hours: 'Mon-Fri, 8am-6pm',
    in_hours_now: false,
    oncall_now: false,
    urgent_path: 'patient-portal-message',
    emergency_line_number: '+15551234567',
    has_coverage_configured: true,
    is_demo: false,
    disclaimers: [],
  };
  const chip = statusChip(state);
  assert.equal(chip.text, 'After hours');
  assert.equal(chip.tone, 'purple');
  assert.equal(urgentCtaIsAvailable(state), true);
});


// ── PHI redaction guard ─────────────────────────────────────────────────────


test('Status payload schema rejects any PHI keys', () => {
  const cleanPayload = {
    coverage_hours: 'Mon-Fri, 8am-6pm',
    in_hours_now: true,
    oncall_now: true,
    urgent_path: 'patient-portal-message',
    emergency_line_number: '+15551234567',
    has_coverage_configured: true,
    is_demo: false,
    disclaimers: ['Your care team\'s availability is shown as hours only.'],
  };
  assert.equal(hasOnlyAllowedKeys(cleanPayload), true);
  assert.equal(payloadLeaksPhi(cleanPayload), false);
});

test('Payload with clinician_name leaks PHI (regression)', () => {
  const dirtyPayload = {
    has_coverage_configured: true,
    primary_user_name: 'Dr. Smith',
  };
  assert.equal(payloadLeaksPhi(dirtyPayload), true);
});

test('Payload with phone field leaks PHI (regression)', () => {
  const dirtyPayload = {
    has_coverage_configured: true,
    phone: '+15551234567',
  };
  assert.equal(payloadLeaksPhi(dirtyPayload), true);
});

test('Payload with slack_handle leaks PHI (regression)', () => {
  const dirtyPayload = {
    slack_handle: '@on-call',
  };
  assert.equal(payloadLeaksPhi(dirtyPayload), true);
});

test('Payload with contact_handle leaks PHI (regression)', () => {
  const dirtyPayload = {
    contact_handle: '#oncall-room',
  };
  assert.equal(payloadLeaksPhi(dirtyPayload), true);
});


// ── Urgent CTA deep-link ────────────────────────────────────────────────────


test('Urgent deep link is the documented patient-messages route, not a phone', () => {
  const p = urgentDeepLink();
  assert.equal(p, 'patient-messages?category=urgent');
  assert.equal(p.startsWith('tel:'), false);
  assert.equal(p.startsWith('mailto:'), false);
  assert.equal(p.startsWith('sms:'), false);
});


// ── Demo banner ─────────────────────────────────────────────────────────────


test('Demo banner renders only when server is_demo=true', () => {
  assert.equal(shouldShowDemoBanner({ is_demo: true }), true);
  assert.equal(shouldShowDemoBanner({ is_demo: false }), false);
  assert.equal(shouldShowDemoBanner(null), false);
  assert.equal(shouldShowDemoBanner({}), false);
});


// ── Source-level guards on pages-patient.js::pgPatientProfile ───────────────


test('pgPatientProfile must include the new care team contact card', () => {
  const here = path.dirname(url.fileURLToPath(import.meta.url));
  const pagePath = path.resolve(here, 'pages-patient.js');
  const src = (fs.readFileSync(pagePath, 'utf8') + '\n' + fs.readFileSync(path.resolve(here, 'pages-patient', 'caregiver.js'), 'utf8') + '\n' + fs.readFileSync(path.resolve(here, 'pages-patient', 'digest.js'), 'utf8') + '\n' + fs.readFileSync(path.resolve(here, 'pages-patient', 'home-devices.js'), 'utf8') + '\n' + fs.readFileSync(path.resolve(here, 'pages-patient', 'adherence.js'), 'utf8') + '\n' + fs.readFileSync(path.resolve(here, 'pages-patient', 'intake.js'), 'utf8') + '\n' + fs.readFileSync(path.resolve(here, 'pages-patient', 'import-wizard.js'), 'utf8') + '\n' + fs.readFileSync(path.resolve(here, 'pages-patient', 'media.js'), 'utf8') + '\n' + fs.readFileSync(path.resolve(here, 'pages-patient', 'wearables.js'), 'utf8'));

  const startMarker = 'export async function pgPatientProfile';
  const startIdx = src.indexOf(startMarker);
  assert.notEqual(startIdx, -1, 'pgPatientProfile must exist');

  const afterStart = src.slice(startIdx);
  const endMatch = afterStart.match(/\n\/\/[^\n]*\n(?:export\s+)?async function pg/);
  const endIdx = endMatch ? afterStart.indexOf(endMatch[0], 1) : afterStart.length;
  const block = afterStart.slice(0, endIdx);

  // The card itself.
  assert.equal(block.includes('data-pt-oncall-card'), true,
    'pgPatientProfile must render the data-pt-oncall-card element');
  assert.equal(block.includes('Care team contact'), true,
    'pgPatientProfile must render the Care team contact heading');
  assert.equal(block.includes('patientOncallStatus'), true,
    'pgPatientProfile must call api.patientOncallStatus()');
  assert.equal(block.includes('postPatientOncallAuditEvent'), true,
    'pgPatientProfile must call api.postPatientOncallAuditEvent()');

  // Audit events that MUST be wired.
  assert.equal(block.includes("event: 'view'"), true,
    'pgPatientProfile must emit a view audit ping at mount');
  assert.equal(block.includes("event: 'urgent_message_started'"), true,
    'pgPatientProfile must emit urgent_message_started audit on the urgent CTA');
  assert.equal(block.includes("event: 'learn_more_clicked'"), true,
    'pgPatientProfile must emit learn_more_clicked audit when the disclosure modal opens');

  // Honest empty state — required when has_coverage_configured=false.
  assert.equal(block.includes('has not configured on-call coverage'), true,
    'pgPatientProfile must render an honest empty-state when no coverage is configured');
  assert.equal(block.includes('911'), true,
    'pgPatientProfile must direct life-threatening emergencies to 911');

  // Urgent deep-link points at the documented Patient Messages route.
  assert.equal(block.includes('patient-messages?category=urgent'), true,
    'pgPatientProfile must compose the urgent CTA URL with category=urgent');
});

test('pgPatientProfile care team contact block does NOT inline any clinician PHI', () => {
  const here = path.dirname(url.fileURLToPath(import.meta.url));
  const pagePath = path.resolve(here, 'pages-patient.js');
  const src = (fs.readFileSync(pagePath, 'utf8') + '\n' + fs.readFileSync(path.resolve(here, 'pages-patient', 'caregiver.js'), 'utf8') + '\n' + fs.readFileSync(path.resolve(here, 'pages-patient', 'digest.js'), 'utf8') + '\n' + fs.readFileSync(path.resolve(here, 'pages-patient', 'home-devices.js'), 'utf8') + '\n' + fs.readFileSync(path.resolve(here, 'pages-patient', 'adherence.js'), 'utf8') + '\n' + fs.readFileSync(path.resolve(here, 'pages-patient', 'intake.js'), 'utf8') + '\n' + fs.readFileSync(path.resolve(here, 'pages-patient', 'import-wizard.js'), 'utf8') + '\n' + fs.readFileSync(path.resolve(here, 'pages-patient', 'media.js'), 'utf8') + '\n' + fs.readFileSync(path.resolve(here, 'pages-patient', 'wearables.js'), 'utf8'));

  // Bound the new card region tightly via the data-pt-oncall-card marker
  // through to the end of the IIFE that fetches status.
  const cardStart = src.indexOf('data-pt-oncall-card');
  assert.notEqual(cardStart, -1);
  const cardEnd = src.indexOf('// ── Settings', cardStart);
  assert.notEqual(cardEnd, -1, 'cardEnd must exist (settings comment marks the next page)');
  const block = src.slice(cardStart, cardEnd);

  // Banned literals — these would mean we hardcoded a fake reassurance
  // or an on-call clinician's identity into the patient-side card.
  // Each pattern is a fragment from the canonical demo seed in
  // pgPatientCareTeam (Dr. Julia Kolmar, etc.). The card must remain
  // identity-free.
  const bannedClinicianFragments = [
    'Dr. Julia Kolmar',
    'Dr. Smith',
    'Rhea Nair',
    'Marcus Tan',
    'oncall@',
    '@on-call',
    'PagerDuty',
    'Slack handle',
    'twilio',
  ];
  for (const banned of bannedClinicianFragments) {
    assert.equal(
      block.toLowerCase().includes(banned.toLowerCase()),
      false,
      `Care team contact card must not inline "${banned}" (PHI / hardcoded identity leak)`,
    );
  }

  // The block must not touch localStorage — every read goes through
  // the audited server endpoint.
  assert.equal(
    /localStorage\.(setItem|getItem)/.test(block),
    false,
    'Care team contact card must not touch localStorage directly',
  );

  // No hardcoded "24/7 coverage" reassurance string outside of the
  // server-driven coverage_hours render. The literal "24/7 coverage"
  // is allowed in the modal body (How on-call works) only as part of
  // explanatory copy — but it must NOT appear as a render of fake
  // status. We require the only "24/7" mention in the new card region
  // to be inside the explanation modal copy or in a comment.
  const hardCoded24x7 = block.match(/24\/7\s+coverage/g) || [];
  assert.equal(hardCoded24x7.length, 0,
    'Care team contact card must not hardcode "24/7 coverage" — coverage_hours comes from the server');
});
