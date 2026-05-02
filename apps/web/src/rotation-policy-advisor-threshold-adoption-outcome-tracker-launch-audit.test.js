// Logic-only tests for the Rotation Policy Advisor Threshold
// Adoption Outcome Tracker launch-audit (CSAHP7, 2026-05-02).
//
// Closes the meta-loop on the meta-loop opened by CSAHP6 (#438):
//   - CSAHP4 (#428) emits heuristic advice cards from hardcoded
//     thresholds.
//   - CSAHP5 (#434) measures predictive accuracy per advice code.
//   - CSAHP6 (#438) lets admins adopt new thresholds.
//   - CSAHP7 (this PR) measures whether adopted thresholds actually
//     delivered the promised improvement in production.
//
// Surface contract pinned by this suite:
//   - api.js exposes fetchThresholdAdoptionOutcomeSummary,
//     fetchAdopterCalibration, fetchThresholdAdoptionOutcomeList,
//     fetchThresholdAdoptionOutcomeAuditEvents,
//     postThresholdAdoptionOutcomeAuditEvent under
//     /api/v1/rotation-policy-advisor-threshold-adoption-outcome-tracker/.
//   - pages-knowledge.js renders the adoption-outcomes section
//     under the CSAHP6 "Threshold tuning" section inside
//     pgChannelAuthDriftResolutionAuditHub.
//   - KPI tiles, per-advice-code mini cards, outcome distribution
//     bar (improved=green, regressed=red, flat=yellow, pending=grey),
//     adopter calibration table with color-coded score (≥0.3 green,
//     0–0.29 yellow, <0 red), pending count line, empty state,
//     honest disclaimer.
//
// Run: node --test src/rotation-policy-advisor-threshold-adoption-outcome-tracker-launch-audit.test.js
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


test('api.js exposes fetchThresholdAdoptionOutcomeSummary helper', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(apiSrc, /fetchThresholdAdoptionOutcomeSummary\s*:/);
});


test('api.js exposes fetchAdopterCalibration helper', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(apiSrc, /fetchAdopterCalibration\s*:/);
});


test('api.js exposes fetchThresholdAdoptionOutcomeList helper', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(apiSrc, /fetchThresholdAdoptionOutcomeList\s*:/);
});


test('api.js exposes fetchThresholdAdoptionOutcomeAuditEvents helper', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(apiSrc, /fetchThresholdAdoptionOutcomeAuditEvents\s*:/);
});


test('CSAHP7 helpers route under /api/v1/rotation-policy-advisor-threshold-adoption-outcome-tracker/', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  const idx = apiSrc.indexOf('CSAHP7 Threshold Adoption Outcome launch-audit');
  assert.ok(idx > 0, 'CSAHP7 launch-audit header missing in api.js');
  const after = apiSrc.slice(idx);
  const sectionEnd = after.indexOf('// end CSAHP7 helpers');
  assert.ok(sectionEnd > 0, 'CSAHP7 sentinel "// end CSAHP7 helpers" missing');
  const block = after.slice(0, sectionEnd);
  const urls = block.match(/['"`]\/api\/v1\/[^'"`]+/g) || [];
  assert.ok(
    urls.length >= 4,
    `expected >=4 URLs in the CSAHP7 block, got ${urls.length}`
  );
  for (const u of urls) {
    assert.match(u, /\/api\/v1\/rotation-policy-advisor-threshold-adoption-outcome-tracker/);
  }
});


test('CSAHP7 slice boundary sentinel present', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(apiSrc, /━━ CSAHP7 SLICE BOUNDARY ━━/);
});


test('CSAHP7 helpers placed BEFORE CSAHP6 helpers in api.js', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  const csahp7Idx = apiSrc.indexOf('CSAHP7 Threshold Adoption Outcome');
  const csahp6Idx = apiSrc.indexOf('CSAHP6 Threshold Tuning');
  assert.ok(csahp7Idx > 0, 'CSAHP7 header missing');
  assert.ok(csahp6Idx > 0, 'CSAHP6 header missing');
  assert.ok(
    csahp7Idx < csahp6Idx,
    'CSAHP7 helpers should be placed BEFORE CSAHP6 helpers'
  );
});


// ── 2. Section renders KPI tiles + per-code cards ─────────────────────────


test('section renders KPI tiles for total / improved / regressed / median delta', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const idx = src.indexOf('pgChannelAuthDriftResolutionAuditHub');
  assert.ok(idx > 0);
  assert.match(src, /csahp7-section-outcomes/);
  assert.match(src, /Adoption outcomes/);
  assert.match(src, /renderCsahp7Section/);
  assert.match(src, /csahp7-kpi-total/);
  assert.match(src, /csahp7-kpi-improved/);
  assert.match(src, /csahp7-kpi-regressed/);
  assert.match(src, /csahp7-kpi-median/);
});


test('section renders per-advice-code mini cards for the 3 advice codes', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  assert.match(src, /csahp7-code-cards/);
  assert.match(src, /csahp7-code-card/);
  // The render iterates over the 3 advice codes.
  assert.match(src, /'REFLAG_HIGH',\s*'MANUAL_REFLAG',\s*'AUTH_DOMINANT'/);
});


// ── 3. Outcome distribution bar with all 4 colors ─────────────────────────


test('outcome distribution bar contains improved/regressed/flat/pending segments', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  assert.match(src, /csahp7-distribution/);
  assert.match(src, /csahp7-bar-improved/);
  assert.match(src, /csahp7-bar-regressed/);
  assert.match(src, /csahp7-bar-flat/);
  assert.match(src, /csahp7-bar-pending/);
  assert.match(src, /csahp7-bar-insufficient/);
  // Improved=green, regressed=red, flat=yellow, pending=grey.
  assert.match(src, /#16a34a/); // green
  assert.match(src, /#dc2626/); // red
  assert.match(src, /#facc15/); // yellow
  assert.match(src, /#9ca3af/); // grey (pending)
});


// ── 4. Adopter calibration table ──────────────────────────────────────────


test('adopter calibration table renders with color-coded score', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  assert.match(src, /csahp7-calibration/);
  assert.match(src, /csahp7-calibration-row/);
  assert.match(src, /Adopter calibration/);
  assert.match(src, /Calibration score/);
  // Color classes for ≥0.3 (green), 0–0.29 (yellow), <0 (red).
  assert.match(src, /csahp7-calibration-green/);
  assert.match(src, /csahp7-calibration-yellow/);
  assert.match(src, /csahp7-calibration-red/);
});


test('adopter calibration table shows adoptions / improved / regressed columns', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  // Column headers.
  assert.match(src, />Adopter</);
  assert.match(src, />Adoptions</);
  assert.match(src, />Improved</);
  assert.match(src, />Regressed</);
});


test('calibration color thresholds: ≥0.3 green / 0–0.29 yellow / <0 red', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  // The classifier function _csahp7CalibrationColor pins the
  // boundaries 0.3 and 0.
  assert.match(src, /_csahp7CalibrationColor/);
  assert.match(src, /n\s*>=\s*0\.3/);
  assert.match(src, /n\s*<\s*0/);
});


// ── 5. Pending count line ────────────────────────────────────────────────


test('section renders pending count message when pending > 0', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  assert.match(src, /csahp7-pending-note/);
  assert.match(src, /still within 30-day evaluation window/);
});


// ── 6. Empty state when no adoptions ─────────────────────────────────────


test('section renders empty state when no adoptions yet', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  assert.match(src, /csahp7-empty/);
  assert.match(src, /No threshold adoptions to evaluate yet/);
});


// ── 7. Honest disclaimer ─────────────────────────────────────────────────


test('section renders honest disclaimer about 30-day evaluation + sample size', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  assert.match(src, /csahp7-disclaimer/);
  assert.match(src, /T\+30d vs the baseline at T/);
  // Sample-size disclaimer.
  assert.match(src, /≥3 paired cards/);
});


// ── 8. Endpoint URL wiring ───────────────────────────────────────────────


test('summary endpoint URL hits GET /summary', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  const idx = apiSrc.indexOf('fetchThresholdAdoptionOutcomeSummary');
  assert.ok(idx > 0);
  const after = apiSrc.slice(idx, idx + 800);
  assert.match(after, /\/api\/v1\/rotation-policy-advisor-threshold-adoption-outcome-tracker\/summary/);
});


test('adopter-calibration endpoint URL is wired', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  const idx = apiSrc.indexOf('fetchAdopterCalibration');
  assert.ok(idx > 0);
  const after = apiSrc.slice(idx, idx + 800);
  assert.match(after, /\/api\/v1\/rotation-policy-advisor-threshold-adoption-outcome-tracker\/adopter-calibration/);
});


test('list endpoint URL is wired', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  const idx = apiSrc.indexOf('fetchThresholdAdoptionOutcomeList');
  assert.ok(idx > 0);
  const after = apiSrc.slice(idx, idx + 800);
  assert.match(after, /\/api\/v1\/rotation-policy-advisor-threshold-adoption-outcome-tracker\/list/);
});


// ── 9. CSAHP7 section is rendered AFTER CSAHP6 section in the page ────────


test('CSAHP7 section render call comes after CSAHP6 section render call', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  // Find the main render path; both calls are in source order.
  const c6Idx = src.indexOf('renderCsahp6Section() +');
  const c7Idx = src.indexOf('renderCsahp7Section() +');
  assert.ok(c6Idx > 0, 'renderCsahp6Section() call missing');
  assert.ok(c7Idx > 0, 'renderCsahp7Section() call missing');
  assert.ok(
    c7Idx > c6Idx,
    'renderCsahp7Section() must be called AFTER renderCsahp6Section()'
  );
});


// ── 10. Audit-events post helper points at csahp7 surface ─────────────────


test('postThresholdAdoptionOutcomeAuditEvent posts to csahp7 audit-events', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  const idx = apiSrc.indexOf('postThresholdAdoptionOutcomeAuditEvent');
  assert.ok(idx > 0);
  const after = apiSrc.slice(idx, idx + 600);
  assert.match(after, /\/api\/v1\/rotation-policy-advisor-threshold-adoption-outcome-tracker\/audit-events/);
  assert.match(after, /method:\s*'POST'/);
});


// ── 11. State holds adoptionOutcomeSummary + adopterCalibration ──────────


test('state object includes adoptionOutcomeSummary + adopterCalibration', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  assert.match(src, /adoptionOutcomeSummary:\s*null/);
  assert.match(src, /adopterCalibration:\s*null/);
});
