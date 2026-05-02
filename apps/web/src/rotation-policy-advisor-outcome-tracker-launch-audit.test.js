// Logic-only tests for the Rotation Policy Advisor Outcome Tracker
// launch-audit (CSAHP5, 2026-05-02).
//
// Pairs each ``advice_snapshot`` audit row at time T (emitted by the
// CSAHP5 background snapshot worker) with the same-key snapshot at
// T+14d (±2d tolerance) and reports per-advice-code predictive
// accuracy. Mirrors the DCRO1 / CSAHP4 read-only calibration pattern.
//
// Surface contract pinned by this suite:
//   - api.js exposes fetchAdvisorOutcomeTrackerSummary,
//     fetchAdvisorOutcomeTrackerList, runAdvisorSnapshotNow, and
//     fetchAdvisorOutcomeTrackerAuditEvents under
//     /api/v1/rotation-policy-advisor-outcome-tracker/.
//   - pages-knowledge.js renders the predictive-accuracy section
//     under the CSAHP4 "Rotation policy advice" section inside
//     pgChannelAuthDriftResolutionAuditHub.
//   - Per-advice-code KPI tiles: REFLAG_HIGH / MANUAL_REFLAG /
//     AUTH_DOMINANT — each shows total_cards, predictive_accuracy_pct
//     (color-coded), mean_re_flag_rate_delta.
//   - "Run snapshot now" admin button.
//   - Honest worker enabled/disabled disclaimer.
//   - Trend chart of weekly cards emitted vs resolved.
//
// Run: node --test src/rotation-policy-advisor-outcome-tracker-launch-audit.test.js
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


test('api.js exposes fetchAdvisorOutcomeTrackerSummary helper', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(apiSrc, /fetchAdvisorOutcomeTrackerSummary\s*:/);
});


test('api.js exposes fetchAdvisorOutcomeTrackerList helper', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(apiSrc, /fetchAdvisorOutcomeTrackerList\s*:/);
});


test('api.js exposes runAdvisorSnapshotNow helper', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(apiSrc, /runAdvisorSnapshotNow\s*:/);
});


test('api.js exposes fetchAdvisorOutcomeTrackerAuditEvents helper', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(apiSrc, /fetchAdvisorOutcomeTrackerAuditEvents\s*:/);
});


test('CSAHP5 helpers route under /api/v1/rotation-policy-advisor-outcome-tracker/', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  const idx = apiSrc.indexOf('CSAHP5 Advisor Outcome Tracker launch-audit');
  assert.ok(idx > 0, 'CSAHP5 launch-audit header missing in api.js');
  const after = apiSrc.slice(idx);
  const sectionEnd = after.indexOf('// end CSAHP5 helpers');
  assert.ok(sectionEnd > 0, 'CSAHP5 sentinel "// end CSAHP5 helpers" missing');
  const block = after.slice(0, sectionEnd);
  const urls = block.match(/['"`]\/api\/v1\/[^'"`]+/g) || [];
  assert.ok(
    urls.length >= 4,
    `expected >=4 URLs in the CSAHP5 block, got ${urls.length}`
  );
  for (const u of urls) {
    assert.match(u, /\/api\/v1\/rotation-policy-advisor-outcome-tracker/);
  }
});


test('CSAHP5 slice boundary sentinel present', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(apiSrc, /━━ CSAHP5 SLICE BOUNDARY ━━/);
});


test('CSAHP5 helpers placed BEFORE CSAHP4 helpers in api.js', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  const csahp5Idx = apiSrc.indexOf('CSAHP5 Advisor Outcome Tracker');
  const csahp4Idx = apiSrc.indexOf('CSAHP4 Rotation Policy Advisor');
  assert.ok(csahp5Idx > 0, 'CSAHP5 header missing');
  assert.ok(csahp4Idx > 0, 'CSAHP4 header missing');
  assert.ok(
    csahp5Idx < csahp4Idx,
    'CSAHP5 helpers should be placed BEFORE CSAHP4 helpers'
  );
});


// ── 2. Section renders KPI tiles for all 3 advice codes ──────────────────


test('section renders KPI tiles for REFLAG_HIGH / MANUAL_REFLAG / AUTH_DOMINANT', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const idx = src.indexOf('pgChannelAuthDriftResolutionAuditHub');
  assert.ok(idx > 0);
  const body = src.slice(idx, idx + 60000);
  assert.match(body, /csahp5-section-accuracy/);
  assert.match(body, /Advice predictive accuracy/);
  assert.match(body, /renderCsahp5Section/);
  assert.match(body, /REFLAG_HIGH/);
  assert.match(body, /MANUAL_REFLAG/);
  assert.match(body, /AUTH_DOMINANT/);
  assert.match(body, /csahp5-kpi-tile/);
});


// ── 3. Empty state ────────────────────────────────────────────────────────


test('empty state when total_paired_cards=0 AND total_pending_cards=0', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const idx = src.indexOf('pgChannelAuthDriftResolutionAuditHub');
  const body = src.slice(idx, idx + 60000);
  assert.match(body, /csahp5-empty/);
  assert.match(body, /No advice snapshots yet/);
  // Empty state still renders the worker disclaimer.
  assert.match(body, /csahp5-worker-disclaimer/);
});


// ── 4. Color-coded predictive_accuracy_pct ───────────────────────────────


test('predictive_accuracy_pct is color-coded (green/yellow/red)', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const idx = src.indexOf('pgChannelAuthDriftResolutionAuditHub');
  const body = src.slice(idx, idx + 60000);
  assert.match(body, /_csahp5AccuracyColor/);
  assert.match(body, /csahp5-acc-green/);
  assert.match(body, /csahp5-acc-yellow/);
  assert.match(body, /csahp5-acc-red/);
  // Threshold sanity — green ≥60%, yellow 30-59%, red <30%.
  assert.match(body, />=\s*60/);
  assert.match(body, />=\s*30/);
});


// ── 5. Admin-only "Run snapshot now" button ──────────────────────────────


test('admin Run snapshot now button is wired', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const idx = src.indexOf('pgChannelAuthDriftResolutionAuditHub');
  const body = src.slice(idx, idx + 60000);
  assert.match(body, /csahp5-run-snapshot-btn/);
  assert.match(body, /Run snapshot now/);
  assert.match(body, /window\._csahp5RunSnapshotNow/);
  assert.match(body, /api\.runAdvisorSnapshotNow/);
});


// ── 6. Pending count renders ─────────────────────────────────────────────


test('pending count renders inside the section', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const idx = src.indexOf('pgChannelAuthDriftResolutionAuditHub');
  const body = src.slice(idx, idx + 60000);
  assert.match(body, /csahp5-pending/);
  assert.match(body, /cards still within 14-day evaluation window/);
});


// ── 7. Trend chart renders weekly cards ──────────────────────────────────


test('trend chart renders weekly cards emitted vs resolved', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const idx = src.indexOf('pgChannelAuthDriftResolutionAuditHub');
  const body = src.slice(idx, idx + 60000);
  assert.match(body, /csahp5-trend/);
  assert.match(body, /Weekly cards emitted vs resolved/);
  assert.match(body, /renderCsahp5TrendChart/);
});


// ── 8. Worker disabled disclaimer renders when worker disabled ───────────


test('"worker disabled" disclaimer renders when worker disabled', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const idx = src.indexOf('pgChannelAuthDriftResolutionAuditHub');
  const body = src.slice(idx, idx + 60000);
  assert.match(body, /csahp5-worker-disclaimer/);
  assert.match(body, /Snapshot worker is currently/);
  assert.match(body, /Need at least 14 days of snapshot history/);
});


// ── 9. Audit-events surface name correct ─────────────────────────────────


test('CSAHP5 helpers use canonical surface URL slug', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(
    apiSrc,
    /\/api\/v1\/rotation-policy-advisor-outcome-tracker\/summary/
  );
  assert.match(
    apiSrc,
    /\/api\/v1\/rotation-policy-advisor-outcome-tracker\/list/
  );
  assert.match(
    apiSrc,
    /\/api\/v1\/rotation-policy-advisor-outcome-tracker\/run-snapshot-now/
  );
  assert.match(
    apiSrc,
    /\/api\/v1\/rotation-policy-advisor-outcome-tracker\/audit-events/
  );
});


// ── 10. Error state on 500 ────────────────────────────────────────────────


test('error state from API surfaces in the existing csahp3-err block', () => {
  // CSAHP5 advisor outcome fetch is wrapped in the same try/catch as
  // the other CSAHP3 fetches, so a 500 surfaces via the existing
  // csahp3-err notice. We assert that the err notice exists in the
  // same function and that fetchAdvisorOutcomeTrackerSummary is inside
  // the try.
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const idx = src.indexOf('pgChannelAuthDriftResolutionAuditHub');
  const body = src.slice(idx, idx + 60000);
  assert.match(body, /csahp3-err/);
  const loadAllIdx = body.indexOf('async function loadAll()');
  const tryIdx = body.indexOf('try {', loadAllIdx);
  const catchIdx = body.indexOf('} catch', tryIdx);
  const fetchIdx = body.indexOf(
    'fetchAdvisorOutcomeTrackerSummary',
    tryIdx
  );
  assert.ok(loadAllIdx > 0);
  assert.ok(tryIdx > loadAllIdx);
  assert.ok(catchIdx > tryIdx);
  assert.ok(
    fetchIdx > tryIdx && fetchIdx < catchIdx,
    'fetchAdvisorOutcomeTrackerSummary must be inside loadAll try/catch'
  );
});


// ── 11. Sample-size disclaimer when only pending data ────────────────────


test('"<14 days history" disclaimer renders when total_paired_cards=0 and total_pending_cards>0', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const idx = src.indexOf('pgChannelAuthDriftResolutionAuditHub');
  const body = src.slice(idx, idx + 60000);
  assert.match(body, /csahp5-sample-size-disclaimer/);
  assert.match(body, /14 days history/);
  // The condition must check both totalPaired===0 AND totalPending>0.
  const renderIdx = body.indexOf('function renderCsahp5Section');
  const renderEnd = body.indexOf('}\n', renderIdx + 200);
  assert.ok(renderIdx > 0, 'renderCsahp5Section missing');
  const renderBody = body.slice(renderIdx, renderIdx + 6000);
  assert.match(renderBody, /totalPaired === 0 && totalPending > 0/);
});


// ── 12. Section appears INSIDE pgChannelAuthDriftResolutionAuditHub ──────


test('predictive accuracy section is rendered inside CSAHP3 hub page', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const idx = src.indexOf('pgChannelAuthDriftResolutionAuditHub');
  const endIdx = src.indexOf('// ── end Channel Auth Drift', idx);
  assert.ok(idx > 0);
  assert.ok(endIdx > idx);
  const body = src.slice(idx, endIdx);
  // Section heading must appear in the function body.
  assert.match(body, /Advice predictive accuracy/);
  assert.match(body, /renderCsahp5Section\(state\.advisorOutcome\)/);
});
