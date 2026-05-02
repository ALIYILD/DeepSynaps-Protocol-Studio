// Logic-only tests for the IRB-AMD4 Reviewer SLA Calibration
// Threshold Tuning Advisor launch-audit (2026-05-02).
//
// Closes section I rec from the IRB-AMD3 Reviewer Workload Outcome
// Tracker (#451):
//   - IRB-AMD2 (#447) emits queue_breach_detected rows.
//   - IRB-AMD3 (#451) pairs each breach with the same reviewer's
//     next decision and computes per-reviewer calibration_score.
//   - IRB-AMD4 (this PR) recommends a calibration_score floor with
//     a confidence interval, supports what-if replay, and persists
//     adopted floors.
//
// Surface contract pinned by this suite:
//   - api.js exposes 5 helpers under
//     /api/v1/reviewer-sla-calibration-threshold-tuning/.
//   - pages-knowledge.js renders the IRB-AMD4 sub-section under
//     IRB-AMD3's "SLA breach outcomes" card inside the Amendments
//     Workflow tab of pgIRBManager.
//   - Recommendation card with [ci_low — ci_high] CI badge.
//   - Current threshold card + auto-reassign chip.
//   - "Run replay" form + replay results.
//   - Admin-only "Adopt" button, gated until helpful_rate_pct >= 50.
//   - Adoption history list (paginated).
//   - Insufficient-data state ("Need >=3 reviewers with >=2
//     breaches each.").
//
// Run: node --test src/reviewer-sla-calibration-threshold-tuning-launch-audit.test.js
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


test('api.js exposes fetchReviewerSlaCalibrationCurrentThreshold helper', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(apiSrc, /fetchReviewerSlaCalibrationCurrentThreshold\s*:/);
});


test('api.js exposes fetchReviewerSlaCalibrationRecommendation helper', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(apiSrc, /fetchReviewerSlaCalibrationRecommendation\s*:/);
});


test('api.js exposes runReviewerSlaCalibrationReplay helper', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(apiSrc, /runReviewerSlaCalibrationReplay\s*:/);
});


test('api.js exposes adoptReviewerSlaCalibrationThreshold helper', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(apiSrc, /adoptReviewerSlaCalibrationThreshold\s*:/);
});


test('api.js exposes fetchReviewerSlaCalibrationAdoptionHistory helper', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(apiSrc, /fetchReviewerSlaCalibrationAdoptionHistory\s*:/);
});


test('IRB-AMD4 helpers route under /api/v1/reviewer-sla-calibration-threshold-tuning/', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  const idx = apiSrc.indexOf('IRB-AMD4 SLA Threshold Tuning launch-audit');
  assert.ok(idx > 0, 'IRB-AMD4 launch-audit header missing in api.js');
  const after = apiSrc.slice(idx);
  const sectionEnd = after.indexOf('// end IRB-AMD4 helpers');
  assert.ok(sectionEnd > 0, 'IRB-AMD4 sentinel "// end IRB-AMD4 helpers" missing');
  const block = after.slice(0, sectionEnd);
  const urls = block.match(/['"`]\/api\/v1\/[^'"`]+/g) || [];
  assert.ok(
    urls.length >= 5,
    `expected >=5 URLs in the IRB-AMD4 block, got ${urls.length}`,
  );
  for (const u of urls) {
    assert.match(u, /\/api\/v1\/reviewer-sla-calibration-threshold-tuning/);
  }
});


test('IRB-AMD4 slice boundary sentinel present', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(apiSrc, /━━ IRB-AMD4 SLICE BOUNDARY ━━/);
});


test('IRB-AMD4 helpers placed BEFORE IRB-AMD3 helpers in api.js', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  const amd4Idx = apiSrc.indexOf('IRB-AMD4 SLA Threshold Tuning');
  const amd3Idx = apiSrc.indexOf('IRB-AMD3 SLA Outcome Tracker');
  assert.ok(amd4Idx > 0, 'IRB-AMD4 header missing');
  assert.ok(amd3Idx > 0, 'IRB-AMD3 header missing');
  assert.ok(
    amd4Idx < amd3Idx,
    'IRB-AMD4 helpers should be placed BEFORE IRB-AMD3 helpers',
  );
});


// ── 2. Section renders recommendation card ────────────────────────────────


test('section renders recommendation card with CI badge', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const idx = src.indexOf('renderSlaThresholdTuning');
  assert.ok(idx > 0, 'renderSlaThresholdTuning renderer missing');
  const body = src.slice(idx, idx + 16000);
  assert.match(body, /irb-amd4-recommendation-card/);
  assert.match(body, /irb-amd4-ci-badge/);
});


// ── 3. Insufficient-data state renders ────────────────────────────────────


test('insufficient-data state renders with honest disclaimer', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  assert.match(src, /irb-amd4-insufficient/);
  assert.match(src, /Need .{0,20}3 reviewers/);
  assert.match(src, /2 breaches/);
});


// ── 4. CI badge renders ──────────────────────────────────────────────────


test('CI badge renders [ci_low — ci_high] format', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const idx = src.indexOf('irb-amd4-ci-badge');
  assert.ok(idx > 0);
  // Snippet around the CI badge should reference both ci_low and
  // ci_high in the same block.
  const block = src.slice(idx, idx + 800);
  assert.match(block, /ci_low/);
  assert.match(block, /ci_high/);
});


// ── 5. "Run replay" button submits with override ─────────────────────────


test('"Run replay" button calls runReviewerSlaCalibrationReplay', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  assert.match(src, /irb-amd4-replay-btn/);
  assert.match(src, /_irbAmd4RunReplay/);
  assert.match(src, /api\.runReviewerSlaCalibrationReplay/);
});


// ── 6. Replay results render ──────────────────────────────────────────────


test('replay results render projected_reassign_count + helpful_rate_pct', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  assert.match(src, /irb-amd4-replay-results/);
  assert.match(src, /projected_reassign_count/);
  assert.match(src, /simulated_helpful_rate_pct/);
});


// ── 7. "Adopt" admin-only ─────────────────────────────────────────────────


test('"Adopt threshold" button is admin-only', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  assert.match(src, /irb-amd4-adopt-admin-only/);
  assert.match(src, /irb-amd4-adopt-btn/);
});


// ── 8. "Adopt" disabled until replay helpful_rate >= 50 ──────────────────


test('"Adopt" disabled until replay helpful_rate_pct >= 50', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  // The button's disabled attribute reflects a 50% gate.
  assert.match(src, /irb-amd4-adopt-gate-50/);
  assert.match(src, /helpful_rate_pct\s*>=?\s*50/);
});


// ── 9. Adoption history renders ───────────────────────────────────────────


test('adoption history list renders adopter / old → new / justification', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  assert.match(src, /irb-amd4-history/);
  assert.match(src, /Adoption history/);
});


// ── 10. Error state on 500 ────────────────────────────────────────────────


test('section renders error banner when load fails', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  assert.match(src, /irb-amd4-error/);
  assert.match(src, /_irbAmd4LoadError/);
});


// ── 11. Audit-events surface name correct ────────────────────────────────


test('audit-events surface name is reviewer_sla_calibration_threshold_tuning', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  const idx = apiSrc.indexOf('IRB-AMD4 SLA Threshold Tuning launch-audit');
  const sectionEnd = apiSrc.indexOf('// end IRB-AMD4 helpers', idx);
  const block = apiSrc.slice(idx, sectionEnd);
  // The audit-events helper references the surface; verify the URL
  // path is the threshold-tuning surface.
  assert.match(
    block,
    /reviewer-sla-calibration-threshold-tuning\/audit-events/,
  );
});
