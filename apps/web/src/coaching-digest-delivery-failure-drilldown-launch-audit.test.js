// Logic-only tests for the Coaching Digest Delivery Failure Drilldown
// launch audit (DCRO5, 2026-05-02).
//
// Operational drill-down over the DCRO3 dispatched audit row stream
// (#398) filtered to delivery_status=failed and grouped by (channel,
// error_class). DCRO4 (#402) surfaces the failure rate; DCRO5 makes
// it actionable with click-through to the Channel Misconfig Detector
// (#389) when a matching channel_misconfigured_detected row exists in
// the same ISO week + clinic + channel.
//
// Pins page-level + helper-level surface against the source files:
//
//   - api.js exposes fetchDigestDeliveryFailureSummary,
//     fetchDigestDeliveryFailureList,
//     fetchDigestDeliveryFailureAuditEvents,
//     postDigestDeliveryFailureAuditEvent under
//     /api/v1/coaching-digest-delivery-failure-drilldown/.
//   - pages-knowledge.js exports pgCoachingDigestDeliveryFailureDrilldown
//     which renders five sections (KPI / by-channel / top / trend / list).
//   - app.js routes 'coaching-digest-delivery-failure-drilldown' /
//     'digest-failure-drilldown' / 'dcro5-drilldown' to the page.
//   - pgResolverCoachingDigestAuditHub gains a "Failure drilldown →"
//     link next to the failure-rate KPI.
//
// Run: node --test src/coaching-digest-delivery-failure-drilldown-launch-audit.test.js
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
const APP_PATH = path.join(__dirname, 'app.js');


// ── 1. api.js helper coverage ─────────────────────────────────────────────


test('api.js exposes fetchDigestDeliveryFailureSummary helper', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(apiSrc, /fetchDigestDeliveryFailureSummary\s*:/);
});


test('api.js exposes fetchDigestDeliveryFailureList helper', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(apiSrc, /fetchDigestDeliveryFailureList\s*:/);
});


test('api.js exposes fetchDigestDeliveryFailureAuditEvents helper', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(apiSrc, /fetchDigestDeliveryFailureAuditEvents\s*:/);
});


test('DCRO5 helpers route under /api/v1/coaching-digest-delivery-failure-drilldown/', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  const idx = apiSrc.indexOf('DCRO5 Delivery Failure Drilldown launch-audit');
  assert.ok(idx > 0, 'DCRO5 launch-audit header missing in api.js');
  const after = apiSrc.slice(idx);
  const sentinelIdx = after.indexOf('━━ DCRO5 SLICE BOUNDARY ━━');
  assert.ok(sentinelIdx > 0, 'DCRO5 slice boundary sentinel missing');
  const block = after.slice(0, sentinelIdx);
  const urls = block.match(/['"`]\/api\/v1\/[^'"`]+/g) || [];
  assert.ok(urls.length >= 3, `expected >=3 URLs in the DCRO5 block, got ${urls.length}`);
  for (const u of urls) {
    assert.match(u, /\/api\/v1\/coaching-digest-delivery-failure-drilldown/);
  }
});


// ── 2. Page function exists and renders all 5 sections ────────────────────


test('pages-knowledge.js exports pgCoachingDigestDeliveryFailureDrilldown', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  assert.match(src, /export\s+async\s+function\s+pgCoachingDigestDeliveryFailureDrilldown/);
});


test('hub page renders KPI tiles', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const idx = src.indexOf('pgCoachingDigestDeliveryFailureDrilldown');
  assert.ok(idx > 0);
  const body = src.slice(idx, idx + 30000);
  assert.match(body, /dcro5-kpi-tiles/);
  assert.match(body, /dcro5-kpi-failure-rate/);
  assert.match(body, /dcro5-kpi-total-failed/);
  assert.match(body, /dcro5-kpi-total-dispatched/);
});


// ── 3. Empty state when total_failed=0 ────────────────────────────────────


test('hub renders empty state when total_failed=0', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const idx = src.indexOf('pgCoachingDigestDeliveryFailureDrilldown');
  const body = src.slice(idx, idx + 30000);
  assert.match(body, /dcro5-empty-state/);
  assert.match(body, /No delivery failures in this window\. Nice\./);
});


// ── 4. By-channel grid renders all 5 channels ─────────────────────────────


test('by-channel grid renders all 5 channels', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const idx = src.indexOf('pgCoachingDigestDeliveryFailureDrilldown');
  const body = src.slice(idx, idx + 30000);
  assert.match(body, /dcro5-by-channel-grid/);
  assert.match(body, /dcro5-channel-card/);
  // The keys array enumerates the canonical channel set in render order.
  assert.match(body, /'slack'/);
  assert.match(body, /'twilio'/);
  assert.match(body, /'sendgrid'/);
  assert.match(body, /'pagerduty'/);
  assert.match(body, /'email'/);
});


// ── 5. Top error classes list renders ─────────────────────────────────────


test('top error classes list renders', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const idx = src.indexOf('pgCoachingDigestDeliveryFailureDrilldown');
  const body = src.slice(idx, idx + 30000);
  assert.match(body, /dcro5-top-error-classes/);
  assert.match(body, /dcro5-top-row/);
});


// ── 6. Failed-list table paginates ────────────────────────────────────────


test('failed-list table renders pager controls', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const idx = src.indexOf('pgCoachingDigestDeliveryFailureDrilldown');
  const body = src.slice(idx, idx + 30000);
  assert.match(body, /dcro5-failed-list/);
  assert.match(body, /dcro5-pager/);
  assert.match(body, /_dcro5SetPage/);
});


// ── 7. Linked-misconfig badge renders Yes/No ──────────────────────────────


test('Linked misconfig badge renders Yes and No states', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const idx = src.indexOf('pgCoachingDigestDeliveryFailureDrilldown');
  const body = src.slice(idx, idx + 30000);
  assert.match(body, /dcro5-misconfig-badge/);
  // Both Yes and No paths are rendered in the ternary.
  assert.match(body, /data-match=\\?"yes\\?"/);
  assert.match(body, /data-match=\\?"no\\?"/);
});


// ── 8. Click-through navigates to channel-misconfig-detector ──────────────


test('click-through navigates to channel-misconfig-detector route', () => {
  const knowledgeSrc = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const idx = knowledgeSrc.indexOf('pgCoachingDigestDeliveryFailureDrilldown');
  // Slice bumped from 30000 → 50000 chars (2026-05-02) to accommodate
  // CSAHP1 (#417) + CSAHP2 frontend additions to the DCRO5 page.
  const body = knowledgeSrc.slice(idx, idx + 50000);
  // The window helper navigates to #/channel-misconfig-detector.
  assert.match(body, /_dcro5OpenMisconfig/);
  assert.match(body, /#\/channel-misconfig-detector/);

  // app.js routes the alias.
  const appSrc = fs.readFileSync(APP_PATH, 'utf8');
  assert.match(appSrc, /case 'channel-misconfig-detector':/);
});


// ── 9. Window selector triggers re-fetch ──────────────────────────────────


test('window selector triggers state update + render', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const idx = src.indexOf('pgCoachingDigestDeliveryFailureDrilldown');
  // Slice bumped from 30000 → 50000 chars (2026-05-02) to accommodate
  // CSAHP1 (#417) + CSAHP2 frontend additions to the DCRO5 page.
  const body = src.slice(idx, idx + 50000);
  assert.match(body, /_dcro5SetWindow/);
  assert.match(body, /window_days=' \+ state\.windowDays/);
  // Selector renders the three documented windows.
  assert.match(body, /dcro5-window/);
  assert.match(body, /\[30, 90, 180\]/);
});


// ── 10. Audit-events surface name correct ─────────────────────────────────


test('app.js routes coaching-digest-delivery-failure-drilldown alias', () => {
  const appSrc = fs.readFileSync(APP_PATH, 'utf8');
  assert.match(appSrc, /case 'coaching-digest-delivery-failure-drilldown':/);
  assert.match(appSrc, /case 'digest-failure-drilldown':/);
  assert.match(appSrc, /pgCoachingDigestDeliveryFailureDrilldown/);
});


// ── 11. Error state when API fails ────────────────────────────────────────


test('hub renders error state when API fails', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const idx = src.indexOf('pgCoachingDigestDeliveryFailureDrilldown');
  const body = src.slice(idx, idx + 30000);
  assert.match(body, /dcro5-err/);
  assert.match(body, /Failed to load delivery failure drilldown/);
});


// ── 12. Admin-only DCRO5 link from DCRO4 page ─────────────────────────────


test('DCRO4 page contains DCRO5 drill-through link', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  // The link is rendered inside pgResolverCoachingDigestAuditHub next to the
  // failure KPI tile.
  const dcro4Idx = src.indexOf('pgResolverCoachingDigestAuditHub');
  assert.ok(dcro4Idx > 0);
  // Bound the search to the DCRO4 page body.
  const body = src.slice(dcro4Idx, dcro4Idx + 30000);
  assert.match(body, /dcro4-dcro5-drilldown-link/);
  assert.match(body, /#\/coaching-digest-delivery-failure-drilldown/);
  assert.match(body, /Failure drilldown →/);
});


// ── 13. Honest disclaimer renders worker enabled/disabled status ──────────


test('honest disclaimer renders worker enabled/disabled status', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const idx = src.indexOf('pgCoachingDigestDeliveryFailureDrilldown');
  const body = src.slice(idx, idx + 30000);
  assert.match(body, /dcro5-disclaimer/);
  assert.match(body, /Failure data only available when the DCRO3 worker emits delivery_status/);
  assert.match(body, /Worker is currently/);
});
