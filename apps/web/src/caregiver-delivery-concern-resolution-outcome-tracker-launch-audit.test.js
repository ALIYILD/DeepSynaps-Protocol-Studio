// Logic-only tests for the Caregiver Delivery Concern Resolution Outcome
// Tracker launch audit (DCRO1, 2026-05-02).
//
// Pairs each caregiver_portal.delivery_concern_resolved row with the NEXT
// caregiver_portal.delivery_concern_threshold_reached row for the same
// caregiver to record stayed_resolved vs re_flagged_within_30d, then
// renders per-resolver calibration accuracy.
//
// This suite pins:
//   - api.js exposes fetchOutcomeTrackerSummary / fetchResolverCalibration /
//     fetchOutcomeTrackerAuditEvents under
//     /api/v1/caregiver-delivery-concern-resolution-outcome-tracker/.
//   - pages-knowledge.js extends pgCaregiverDeliveryConcernResolutionAuditHub
//     with the "Resolution Outcome Tracker" section: KPI tiles,
//     by-reason table, resolver calibration table with color-coding,
//     empty state, pending disclaimer, window selector.
//
// Run: node --test src/caregiver-delivery-concern-resolution-outcome-tracker-launch-audit.test.js
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


// ── 1. api.js DCRO1 helper coverage ─────────────────────────────────────


test('api.js exposes fetchOutcomeTrackerSummary helper', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(apiSrc, /fetchOutcomeTrackerSummary\s*:/);
});


test('api.js exposes fetchResolverCalibration helper', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(apiSrc, /fetchResolverCalibration\s*:/);
});


test('api.js exposes fetchOutcomeTrackerAuditEvents helper', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(apiSrc, /fetchOutcomeTrackerAuditEvents\s*:/);
});


test('DCRO1 helpers route under /api/v1/caregiver-delivery-concern-resolution-outcome-tracker/ via slice anchor', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  // Slice from the unique DCRO1 header to the next `};` substring.
  const idx = apiSrc.indexOf('DCRO1 Outcome Tracker launch-audit');
  assert.ok(idx > 0, 'DCRO1 launch-audit header missing in api.js');
  const after = apiSrc.slice(idx);
  const sectionEnd = after.indexOf('};');
  assert.ok(sectionEnd > 0, 'DCRO1 slice boundary `};` missing');
  const block = after.slice(0, sectionEnd);
  const urls = block.match(/['"`]\/api\/v1\/[^'"`]+/g) || [];
  assert.ok(urls.length >= 3, `expected >=3 URLs in the DCRO1 block, got ${urls.length}`);
  for (const u of urls) {
    assert.match(u, /\/api\/v1\/caregiver-delivery-concern-resolution-outcome-tracker/);
  }
});


// ── 2. KPI tiles rendered ────────────────────────────────────────────────


test('outcome tracker section renders all three KPI tiles', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const idx = src.indexOf('renderOutcomeTrackerSection');
  assert.ok(idx > 0, 'renderOutcomeTrackerSection missing');
  const body = src.slice(idx, idx + 8000);
  assert.match(body, /cgcr-outcome-kpi-stayed/);
  assert.match(body, /cgcr-outcome-kpi-reflagged/);
  assert.match(body, /cgcr-outcome-kpi-median/);
});


// ── 3. Empty state ───────────────────────────────────────────────────────


test('outcome tracker renders empty state when total_resolutions=0', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const idx = src.indexOf('renderOutcomeTrackerSection');
  assert.ok(idx > 0);
  const body = src.slice(idx, idx + 8000);
  assert.match(body, /cgcr-outcome-empty/);
  assert.match(body, /Not enough resolution history to compute calibration yet\./);
});


// ── 4. Resolver calibration table ────────────────────────────────────────


test('outcome tracker resolver calibration table renders names and percentages', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const idx = src.indexOf('renderOutcomeTrackerSection');
  const body = src.slice(idx, idx + 8000);
  assert.match(body, /cgcr-outcome-calibration/);
  assert.match(body, /resolver_name/);
  assert.match(body, /resolver_user_id/);
  assert.match(body, /calibration_accuracy_pct/);
});


// ── 5. Color-coding (green/yellow/red CSS classes) ───────────────────────


test('outcome tracker calibration rows get a green/yellow/red CSS class', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const idx = src.indexOf('renderOutcomeTrackerSection');
  const body = src.slice(idx, idx + 8000);
  assert.match(body, /_calibrationColorClass/);
  assert.match(body, /cgcr-cal-green/);
  assert.match(body, /cgcr-cal-yellow/);
  assert.match(body, /cgcr-cal-red/);
  // Threshold values 80 / 50 are pinned in the helper.
  const helperIdx = src.indexOf('_calibrationColorClass');
  const helperBody = src.slice(helperIdx, helperIdx + 600);
  assert.match(helperBody, />=\s*80/);
  assert.match(helperBody, />=\s*50/);
});


// ── 6. Pending disclaimer ────────────────────────────────────────────────


test('outcome tracker pending disclaimer renders when pending count > 0', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const idx = src.indexOf('renderOutcomeTrackerSection');
  const body = src.slice(idx, idx + 8000);
  assert.match(body, /cgcr-outcome-pending/);
  assert.match(body, /still within the 30-day re-flag window/);
});


// ── 7. Window selector triggers refetch ──────────────────────────────────


test('outcome tracker window selector triggers refetch via _cgcrOutcomeSetWindow', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  // Selector testid in render block.
  assert.match(src, /cgcr-outcome-window/);
  // Setter wired on window and re-renders the page.
  assert.match(src, /window\._cgcrOutcomeSetWindow\s*=/);
  assert.match(src, /state\.outcomeTrackerWindowDays\s*=\s*Number\(v\)/);
});


// ── 8. Audit-events surface name correct ─────────────────────────────────


test('outcome tracker uses canonical surface slug in URLs', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(apiSrc, /caregiver-delivery-concern-resolution-outcome-tracker\/summary/);
  assert.match(apiSrc, /caregiver-delivery-concern-resolution-outcome-tracker\/resolver-calibration/);
  assert.match(apiSrc, /caregiver-delivery-concern-resolution-outcome-tracker\/audit-events/);
});


// ── 9. Error state when API throws ───────────────────────────────────────


test('outcome tracker section reuses cgcr-hub-err notice when loadAll throws', () => {
  // The DCRO1 fetches happen inside the same loadAll() that the existing
  // page already wraps in try/catch. The error path renders the existing
  // cgcr-hub-err notice (we do not introduce a parallel error notice for
  // the DCRO1 sub-section because that would split the user-visible
  // failure surface and confuse the audit transcript).
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const idx = src.indexOf('pgCaregiverDeliveryConcernResolutionAuditHub');
  assert.ok(idx > 0);
  const body = src.slice(idx, idx + 30000);
  // loadAll catches errors and surfaces a cgcr-hub-err notice.
  assert.match(body, /cgcr-hub-err/);
  assert.match(body, /state\.err/);
  // The DCRO1 fetch helpers are wired into loadAll.
  assert.match(body, /fetchOutcomeTrackerSummary/);
  assert.match(body, /fetchResolverCalibration/);
});


// ── 10. By-reason table renders all 4 reason rows ────────────────────────


test('outcome tracker by-reason table renders all four reason rows', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const idx = src.indexOf('renderOutcomeTrackerSection');
  const body = src.slice(idx, idx + 8000);
  assert.match(body, /cgcr-outcome-by-reason/);
  assert.match(body, /'concerns_addressed'/);
  assert.match(body, /'false_positive'/);
  assert.match(body, /'caregiver_replaced'/);
  assert.match(body, /'other'/);
});


// ── 11. Median renders "—" when null ─────────────────────────────────────


test('outcome tracker median KPI renders "—" when median_days_to_re_flag is null', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const idx = src.indexOf('renderOutcomeTrackerSection');
  const body = src.slice(idx, idx + 8000);
  // Median text uses an em-dash placeholder when null.
  assert.match(body, /median_days_to_re_flag/);
  assert.match(body, /medianText\s*=\s*medianD\s*==\s*null\s*\?\s*'—'/);
});
