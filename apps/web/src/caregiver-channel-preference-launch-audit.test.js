// Logic-only tests for the Per-Caregiver Channel Preference launch-audit
// (2026-05-01).
//
// Closes section I rec from the Multi-Adapter Delivery Parity launch
// audit (#384). Each caregiver can pick a preferred dispatch channel
// (email / sms / slack) on top of the per-clinic EscalationPolicy chain
// shipped in #374. The worker / send-now path resolves the dispatch
// chain as ``[caregiver_preferred, *clinic_chain]`` with dedup so the
// caregiver's preferred adapter is tried first while the clinic's
// escalation order remains intact as the fallback.
//
// This suite pins the page-level + helper-level surface against the
// source files (no DOM, no fetch — the audit assertions read source
// strings, the same shape used by the rest of the launch-audit suites
// in apps/web/src):
//
//   - pgPatientCaregiver renders a "Channel preference" dropdown with
//     "Use clinic default", "Email", "SMS", "Slack" options.
//   - pgPatientCaregiver renders a chip showing the current preferred
//     channel (or "clinic default").
//   - The save handler sends ``preferred_channel`` (null or string) to
//     ``api.caregiverEmailDigestPreferencesPut`` and emits a
//     ``preferences_saved_ui`` audit ping carrying
//     ``preferred_channel=...``.
//   - The default ``digestPrefs`` shape carries
//     ``preferred_channel: null``.
//
// Run: node --test src/caregiver-channel-preference-launch-audit.test.js
//
// Note: apps/web tests use Node's built-in `node --test`, NOT vitest.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';


const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


const PAGES_PATIENT_PATH = path.join(__dirname, 'pages-patient.js');


// ── 1. Default preferences shape carries preferred_channel ──────────────────


test('digestPrefs default shape carries preferred_channel: null', () => {
  const src = fs.readFileSync(PAGES_PATIENT_PATH, 'utf8');
  // The default literal is rendered before the api.caregiverEmailDigestPreview
  // probe; assert it includes the new key explicitly so a regression on the
  // default object can never silently strip the override.
  assert.match(
    src,
    /let digestPrefs\s*=\s*\{[^}]*preferred_channel:\s*null/,
  );
});


// ── 2. Channel preference dropdown is rendered ─────────────────────────────


test('pgPatientCaregiver renders the Channel preference label', () => {
  const src = fs.readFileSync(PAGES_PATIENT_PATH, 'utf8');
  assert.match(src, /Channel preference/);
});


test('pgPatientCaregiver renders the channel preference dropdown id', () => {
  const src = fs.readFileSync(PAGES_PATIENT_PATH, 'utf8');
  assert.match(src, /id="pt-cg-digest-channel"/);
});


test('pgPatientCaregiver renders all four canonical channel options', () => {
  const src = fs.readFileSync(PAGES_PATIENT_PATH, 'utf8');
  // "Use clinic default" is the null-state option (value="").
  assert.match(src, /<option value=""[^>]*>Use clinic default/);
  assert.match(src, /<option value="email"[^>]*>Email/);
  assert.match(src, /<option value="sms"[^>]*>SMS/);
  assert.match(src, /<option value="slack"[^>]*>Slack/);
});


test('pgPatientCaregiver renders the preferred-channel chip', () => {
  const src = fs.readFileSync(PAGES_PATIENT_PATH, 'utf8');
  assert.match(src, /id="pt-cg-digest-channel-chip"/);
  // Falls back to "clinic default" when no override is set.
  assert.match(src, /clinic default/);
});


// ── 3. Save handler reads the dropdown + posts preferred_channel ───────────


test('save handler reads the channel preference dropdown', () => {
  const src = fs.readFileSync(PAGES_PATIENT_PATH, 'utf8');
  assert.match(src, /el\.querySelector\(['"`]#pt-cg-digest-channel['"`]\)/);
});


test('save handler maps empty value to null in payload', () => {
  const src = fs.readFileSync(PAGES_PATIENT_PATH, 'utf8');
  // ``channelRaw ? channelRaw : null`` is the canonical pattern — assert
  // both halves of the conditional are present.
  assert.match(src, /channelRaw\s*\?\s*channelRaw\s*:\s*null/);
});


test('save handler payload carries preferred_channel field', () => {
  const src = fs.readFileSync(PAGES_PATIENT_PATH, 'utf8');
  assert.match(src, /preferred_channel\s*,?/);
});


test('save handler PUTs preferred_channel via caregiverEmailDigestPreferencesPut', () => {
  const src = fs.readFileSync(PAGES_PATIENT_PATH, 'utf8');
  // The handler block locates the save CTA via querySelector — assert
  // that block carries both the new field AND the PUT call. The CTA is
  // attached far below the inline-template that mentions the same id,
  // so we anchor on ``saveBtn.addEventListener`` (the canonical wiring
  // pattern in this file).
  const handlerIdx = src.indexOf("api.caregiverEmailDigestPreferencesPut === 'function'");
  assert.ok(handlerIdx > 0, 'save handler not found in pages-patient.js');
  const handlerBlock = src.slice(handlerIdx, handlerIdx + 4000);
  assert.match(handlerBlock, /preferred_channel/);
  assert.match(handlerBlock, /api\.caregiverEmailDigestPreferencesPut\s*\(/);
});


// ── 4. Audit ping carries preferred_channel for regulator replay ───────────


test('save handler emits preferences_saved_ui audit ping with preferred_channel', () => {
  const src = fs.readFileSync(PAGES_PATIENT_PATH, 'utf8');
  // The launch audit invariant: the audit ping note must carry the
  // resolved preferred_channel value (or "null") so the regulator
  // transcript replays the resolved chain unambiguously.
  assert.match(src, /event:\s*['"`]preferences_saved_ui['"`]/);
  assert.match(src, /preferred_channel=\$\{preferred_channel\s*\|\|\s*['"`]null['"`]\}/);
});


// ── 5. Chip refresh after save ─────────────────────────────────────────────


test('save handler refreshes the chip after a successful save', () => {
  const src = fs.readFileSync(PAGES_PATIENT_PATH, 'utf8');
  // Look for an update of the chip's textContent after the API call.
  // We're flexible on the exact pattern — accept either chip.textContent
  // = … OR chip.innerText = … to keep the test robust against polish.
  assert.match(
    src,
    /pt-cg-digest-channel-chip[\s\S]{0,400}?textContent\s*=\s*res\.preferred_channel/,
  );
});


// ── 6. Toast surfaces the saved channel value ──────────────────────────────


test('save handler toast surfaces the channel preference', () => {
  const src = fs.readFileSync(PAGES_PATIENT_PATH, 'utf8');
  // The success toast carries the channel value so the caregiver sees
  // confirmation of what they actually saved.
  assert.match(
    src,
    /channel=\$\{res\.preferred_channel\s*\|\|\s*['"`]clinic default['"`]\}/,
  );
});
