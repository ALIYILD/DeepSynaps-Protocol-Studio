// Logic-only tests for the Rotation Policy Advisor Threshold Tuning
// Console launch-audit (CSAHP6, 2026-05-02).
//
// Closes the recursion loop opened by CSAHP5 (#434):
//   - CSAHP4 (#428) emits heuristic advice cards from hardcoded
//     thresholds.
//   - CSAHP5 (#434) measures predictive accuracy per advice code.
//   - CSAHP6 (this PR) lets admins propose new thresholds, replay
//     them against the last 90 days of frozen ``advice_snapshot``
//     rows, and adopt the new threshold when the replay shows
//     higher predictive accuracy. Adopted values take effect
//     immediately on the next CSAHP4 ``/advice`` call.
//
// Surface contract pinned by this suite:
//   - api.js exposes fetchCurrentThresholds, runThresholdReplay,
//     adoptThreshold, fetchThresholdAdoptionHistory,
//     fetchThresholdTuningAuditEvents under
//     /api/v1/rotation-policy-advisor-threshold-tuning/.
//   - pages-knowledge.js renders the threshold-tuning section
//     under the CSAHP5 "Advice predictive accuracy" section inside
//     pgChannelAuthDriftResolutionAuditHub.
//   - Per-advice-code threshold cards: REFLAG_HIGH / MANUAL_REFLAG /
//     AUTH_DOMINANT — each shows current value, proposed input,
//     "Run what-if replay" + "Adopt" buttons, and a delta tile.
//   - Adoption history list with old → new value, justification,
//     adopter, timestamp.
//   - Honest disclaimer: "Adoption takes effect immediately. Replay
//     uses last 90 days of frozen snapshot data."
//
// Run: node --test src/rotation-policy-advisor-threshold-tuning-launch-audit.test.js
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


// ── 1. api.js helper coverage ─────────────────────────────────────────────


test('api.js exposes fetchCurrentThresholds helper', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(apiSrc, /fetchCurrentThresholds\s*:/);
});


test('api.js exposes runThresholdReplay helper', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(apiSrc, /runThresholdReplay\s*:/);
});


test('api.js exposes adoptThreshold helper', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(apiSrc, /adoptThreshold\s*:/);
});


test('api.js exposes fetchThresholdAdoptionHistory helper', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(apiSrc, /fetchThresholdAdoptionHistory\s*:/);
});


test('api.js exposes fetchThresholdTuningAuditEvents helper', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(apiSrc, /fetchThresholdTuningAuditEvents\s*:/);
});


test('CSAHP6 helpers route under /api/v1/rotation-policy-advisor-threshold-tuning/', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  const idx = apiSrc.indexOf('CSAHP6 Threshold Tuning launch-audit');
  assert.ok(idx > 0, 'CSAHP6 launch-audit header missing in api.js');
  const after = apiSrc.slice(idx);
  const sectionEnd = after.indexOf('// end CSAHP6 helpers');
  assert.ok(sectionEnd > 0, 'CSAHP6 sentinel "// end CSAHP6 helpers" missing');
  const block = after.slice(0, sectionEnd);
  const urls = block.match(/['"`]\/api\/v1\/[^'"`]+/g) || [];
  assert.ok(
    urls.length >= 5,
    `expected >=5 URLs in the CSAHP6 block, got ${urls.length}`
  );
  for (const u of urls) {
    assert.match(u, /\/api\/v1\/rotation-policy-advisor-threshold-tuning/);
  }
});


test('CSAHP6 slice boundary sentinel present', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(apiSrc, /━━ CSAHP6 SLICE BOUNDARY ━━/);
});


test('CSAHP6 helpers placed BEFORE CSAHP5 helpers in api.js', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  const csahp6Idx = apiSrc.indexOf('CSAHP6 Threshold Tuning');
  const csahp5Idx = apiSrc.indexOf('CSAHP5 Advisor Outcome Tracker');
  assert.ok(csahp6Idx > 0, 'CSAHP6 header missing');
  assert.ok(csahp5Idx > 0, 'CSAHP5 header missing');
  assert.ok(
    csahp6Idx < csahp5Idx,
    'CSAHP6 helpers should be placed BEFORE CSAHP5 helpers'
  );
});


// ── 2. Section renders threshold cards for all 3 advice codes ────────────


test('section renders threshold cards for REFLAG_HIGH / MANUAL_REFLAG / AUTH_DOMINANT', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const idx = src.indexOf('pgChannelAuthDriftResolutionAuditHub');
  assert.ok(idx > 0);
  const body = src.slice(idx, idx + 90000);
  assert.match(body, /csahp6-section-tuning/);
  assert.match(body, /Threshold tuning/);
  assert.match(body, /renderCsahp6Section/);
  assert.match(body, /REFLAG_HIGH/);
  assert.match(body, /MANUAL_REFLAG/);
  assert.match(body, /AUTH_DOMINANT/);
  assert.match(body, /csahp6-threshold-card/);
});


// ── 3. Inputs reflect current thresholds + delta tile color-codes ────────


test('section renders threshold inputs with current value display', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  assert.match(src, /csahp6-threshold-input/);
  assert.match(src, /csahp6-current-value/);
});


test('delta tile is color-coded green/red/yellow', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  assert.match(src, /csahp6-delta-tile/);
  assert.match(src, /csahp6-delta-green/);
  assert.match(src, /csahp6-delta-red/);
  assert.match(src, /csahp6-delta-yellow/);
});


// ── 4. Replay button + endpoint wiring ────────────────────────────────────


test('"Run what-if replay" button calls runThresholdReplay endpoint', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  assert.match(src, /csahp6-replay-btn/);
  assert.match(src, /_csahp6RunReplay/);
  assert.match(src, /api\.runThresholdReplay/);
});


// ── 5. Adopt button visibility + disabled gating ──────────────────────────


test('"Adopt" button is admin-only (admin gate present)', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  assert.match(src, /_csahp6IsAdmin/);
  assert.match(src, /csahp6-adopt-admin-only/);
});


test('"Adopt" button is disabled until replay shows positive delta', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  // The button uses a `disabled` attribute path when delta is null
  // or <= 0.5. Confirm the gating logic exists in the source.
  assert.match(src, /csahp6-adopt-btn/);
  assert.match(src, /enabled\s*=\s*d\s*!=\s*null\s*&&\s*isFinite\(d\)\s*&&\s*d\s*>\s*0\.5/);
});


// ── 6. Adoption confirmation modal + adopt POST wiring ────────────────────


test('Adopt opens a justification prompt and POSTs to adoptThreshold', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  assert.match(src, /_csahp6OpenAdoptModal/);
  assert.match(src, /window\.prompt/);
  assert.match(src, /api\.adoptThreshold/);
  assert.match(src, /justification/);
});


test('adoption submit body shape includes advice_code / threshold_key / threshold_value / justification', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  // Capture the adoptThreshold body and verify all four required
  // fields are sent.
  const m = src.match(/api\.adoptThreshold\(\s*\{([\s\S]*?)\}\s*\)/);
  assert.ok(m, 'api.adoptThreshold call site missing');
  const body = m[1];
  assert.match(body, /advice_code/);
  assert.match(body, /threshold_key/);
  assert.match(body, /threshold_value/);
  assert.match(body, /justification/);
});


// ── 7. Adoption history list ─────────────────────────────────────────────


test('adoption history list renders adopter / old → new / justification', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  assert.match(src, /csahp6-history/);
  assert.match(src, /Adoption history/);
  assert.match(src, /Adopter/);
  assert.match(src, /Justification/);
});


test('adoption history empty state renders when no rows', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  assert.match(src, /csahp6-history-empty/);
  assert.match(src, /No threshold adoptions yet/);
});


// ── 8. Audit-events surface name correct ─────────────────────────────────


test('audit-events surface name is rotation_policy_advisor_threshold_tuning', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  const idx = apiSrc.indexOf('CSAHP6 Threshold Tuning launch-audit');
  const sectionEnd = apiSrc.indexOf('// end CSAHP6 helpers', idx);
  const block = apiSrc.slice(idx, sectionEnd);
  // The audit-events helper references the surface; verify the URL
  // path is the threshold-tuning surface.
  assert.match(block, /rotation-policy-advisor-threshold-tuning\/audit-events/);
});


// ── 9. Empty / disclaimer states ─────────────────────────────────────────


test('section shows empty state when thresholds map missing (snapshot history < 7d)', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  assert.match(src, /csahp6-empty/);
  assert.match(src, /Not enough snapshot history yet/);
});


test('section renders honest disclaimer about replay + immediate effect', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  assert.match(src, /csahp6-disclaimer/);
  assert.match(src, /Adoption takes effect immediately/);
  assert.match(src, /frozen snapshot data/);
});


// ── 10. Replay endpoint URL ──────────────────────────────────────────────


test('replay endpoint URL hits POST /replay', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  const idx = apiSrc.indexOf('runThresholdReplay');
  assert.ok(idx > 0);
  const after = apiSrc.slice(idx, idx + 400);
  assert.match(after, /\/api\/v1\/rotation-policy-advisor-threshold-tuning\/replay/);
  assert.match(after, /method:\s*'POST'/);
});


test('adopt endpoint URL hits POST /adopt', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  const idx = apiSrc.indexOf('adoptThreshold');
  assert.ok(idx > 0);
  const after = apiSrc.slice(idx, idx + 400);
  assert.match(after, /\/api\/v1\/rotation-policy-advisor-threshold-tuning\/adopt/);
  assert.match(after, /method:\s*'POST'/);
});
