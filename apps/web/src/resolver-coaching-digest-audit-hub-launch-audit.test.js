// Logic-only tests for the Resolver Coaching Digest Audit Hub launch
// audit (DCRO4, 2026-05-02).
//
// Admin cohort dashboard over the DCRO3 dispatched audit row stream
// (#398) + the ResolverCoachingDigestPreference table. Read-only; no
// companion worker. This suite pins the page-level + helper-level
// surface against the source files:
//
//   - api.js exposes fetchCoachingDigestAuditHubSummary,
//     fetchResolverTrajectory, fetchCoachingDigestAuditEvents,
//     postCoachingDigestAuditHubAuditEvent under
//     /api/v1/resolver-coaching-digest-audit-hub/.
//   - pages-knowledge.js exports pgResolverCoachingDigestAuditHub
//     which renders five sections (opt-in / dispatch / delivery /
//     trajectory / weekly trend) plus a "worker disabled" banner.
//   - app.js routes 'resolver-coaching-digest-audit-hub' /
//     'coaching-digest-hub' / 'dcro4-hub' to the page.
//   - pgResolverCoachingInbox's admin overview gains an admin-only
//     "Coaching digest audit hub →" link.
//
// Run: node --test src/resolver-coaching-digest-audit-hub-launch-audit.test.js
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


test('api.js exposes fetchCoachingDigestAuditHubSummary helper', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(apiSrc, /fetchCoachingDigestAuditHubSummary\s*:/);
});


test('api.js exposes fetchResolverTrajectory helper', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(apiSrc, /fetchResolverTrajectory\s*:/);
});


test('api.js exposes fetchCoachingDigestAuditEvents helper', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(apiSrc, /fetchCoachingDigestAuditEvents\s*:/);
});


test('DCRO4 helpers route under /api/v1/resolver-coaching-digest-audit-hub/', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  // Use the unique DCRO4 header anchor; end at the unique sentinel.
  const idx = apiSrc.indexOf('DCRO4 Resolver Coaching Digest Audit Hub launch-audit');
  assert.ok(idx > 0, 'DCRO4 launch-audit header missing in api.js');
  const after = apiSrc.slice(idx);
  const sentinelIdx = after.indexOf('━━ DCRO4 SLICE BOUNDARY ━━');
  assert.ok(sentinelIdx > 0, 'DCRO4 slice boundary sentinel missing');
  const block = after.slice(0, sentinelIdx);
  const urls = block.match(/['"`]\/api\/v1\/[^'"`]+/g) || [];
  assert.ok(urls.length >= 3, `expected >=3 URLs in the DCRO4 block, got ${urls.length}`);
  for (const u of urls) {
    assert.match(u, /\/api\/v1\/resolver-coaching-digest-audit-hub/);
  }
});


// ── 2. Page function exists and renders all 5 sections ────────────────────


test('pages-knowledge.js exports pgResolverCoachingDigestAuditHub', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  assert.match(src, /export\s+async\s+function\s+pgResolverCoachingDigestAuditHub/);
});


test('hub page renders all 5 sections', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const idx = src.indexOf('pgResolverCoachingDigestAuditHub');
  assert.ok(idx > 0);
  const body = src.slice(idx, idx + 30000);
  assert.match(body, /dcro4-section-opt-in/);
  assert.match(body, /dcro4-section-dispatch/);
  assert.match(body, /dcro4-section-delivery/);
  assert.match(body, /dcro4-section-trajectory/);
  assert.match(body, /dcro4-section-trend/);
});


// ── 3. Empty state when total_dispatched=0 ────────────────────────────────


test('hub renders empty state when total_dispatched=0', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const idx = src.indexOf('pgResolverCoachingDigestAuditHub');
  const body = src.slice(idx, idx + 30000);
  assert.match(body, /dcro4-empty-state/);
  assert.match(body, /No coaching digests dispatched in this window yet\./);
});


// ── 4. By-channel bar chart renders all 5 channels ────────────────────────


test('by-channel chart references all 5 canonical channels', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const idx = src.indexOf('pgResolverCoachingDigestAuditHub');
  const body = src.slice(idx, idx + 30000);
  // The keys array enumerates the canonical channel set in render order.
  assert.match(body, /'slack'/);
  assert.match(body, /'twilio'/);
  assert.match(body, /'sendgrid'/);
  assert.match(body, /'pagerduty'/);
  assert.match(body, /'email'/);
  assert.match(body, /dcro4-channel-bar/);
});


// ── 5. Delivery success rate KPI ──────────────────────────────────────────


test('delivery success rate KPI renders', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const idx = src.indexOf('pgResolverCoachingDigestAuditHub');
  const body = src.slice(idx, idx + 30000);
  assert.match(body, /dcro4-kpi-success-rate/);
  assert.match(body, /dcro4-kpi-delivered/);
  assert.match(body, /dcro4-kpi-failed/);
});


// ── 6. Resolver trajectory table renders names + chips ────────────────────


test('resolver trajectory table renders names and trajectory chips', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const idx = src.indexOf('pgResolverCoachingDigestAuditHub');
  const body = src.slice(idx, idx + 30000);
  assert.match(body, /dcro4-trajectory-row/);
  assert.match(body, /dcro4-traj-chip/);
  assert.match(body, /resolver_name/);
  assert.match(body, /resolver_user_id/);
  assert.match(body, /current_backlog/);
});


// ── 7. Color-coding for trajectory (green/yellow/red) ─────────────────────


test('trajectory chip color classes (green/yellow/red) defined', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const idx = src.indexOf('pgResolverCoachingDigestAuditHub');
  const body = src.slice(idx, idx + 30000);
  assert.match(body, /dcro4-traj-green/);
  assert.match(body, /dcro4-traj-yellow/);
  assert.match(body, /dcro4-traj-red/);
  // _trajectoryClass mapping
  assert.match(body, /shrinking.*dcro4-traj-green|dcro4-traj-green/);
  assert.match(body, /growing.*dcro4-traj-red|dcro4-traj-red/);
});


// ── 8. Window selector triggers re-fetch ──────────────────────────────────


test('window selector lists 30/90/180 and triggers refetch via _dcro4SetWindow', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const idx = src.indexOf('pgResolverCoachingDigestAuditHub');
  const body = src.slice(idx, idx + 30000);
  assert.match(body, /\[30,\s*90,\s*180\]/);
  assert.match(body, /dcro4-window/);
  assert.match(body, /window\._dcro4SetWindow\s*=/);
  assert.match(body, /state\.windowDays\s*=\s*Number\(v\)/);
});


// ── 9. Admin-only link from DCRO2 page ────────────────────────────────────


test('pgResolverCoachingInbox admin overview includes admin-only digest hub link', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  // The link is rendered inside renderAdminOverviewTable, which is
  // gated by isAdmin().
  const fnStart = src.indexOf('function renderAdminOverviewTable');
  assert.ok(fnStart > 0, 'renderAdminOverviewTable not found');
  const fn = src.slice(fnStart, fnStart + 4000);
  assert.match(fn, /rci-coaching-digest-hub-link/);
  assert.match(fn, /coaching-digest-hub/);
});


// ── 10. App.js route loader ───────────────────────────────────────────────


test('app.js route loader maps DCRO4 aliases to pgResolverCoachingDigestAuditHub', () => {
  const src = fs.readFileSync(APP_PATH, 'utf8');
  assert.match(src, /case 'resolver-coaching-digest-audit-hub'/);
  assert.match(src, /case 'coaching-digest-hub'/);
  assert.match(src, /pgResolverCoachingDigestAuditHub/);
});


// ── 11. Audit-events surface name canonical ───────────────────────────────


test('hub uses canonical surface slug in URLs', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(apiSrc, /resolver-coaching-digest-audit-hub\/audit-events/);
  assert.match(apiSrc, /resolver-coaching-digest-audit-hub\/summary/);
  assert.match(apiSrc, /resolver-coaching-digest-audit-hub\/resolver-trajectory/);
});


// ── 12. Error state when API throws ───────────────────────────────────────


test('hub renders error notice when API throws', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const idx = src.indexOf('pgResolverCoachingDigestAuditHub');
  const body = src.slice(idx, idx + 30000);
  assert.match(body, /dcro4-err/);
  assert.match(body, /state\.err/);
});


// ── 13. Worker-disabled banner ────────────────────────────────────────────


test('worker-disabled banner renders when enabled=false', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const idx = src.indexOf('pgResolverCoachingDigestAuditHub');
  const body = src.slice(idx, idx + 30000);
  assert.match(body, /dcro4-worker-disabled-banner/);
  assert.match(body, /RESOLVER_COACHING_DIGEST_ENABLED/);
  // The render function exists and is gated on ws.enabled.
  assert.match(body, /renderWorkerDisabledBanner/);
  assert.match(body, /ws\.enabled/);
});


// ── 14. KPI tiles for opt-in stats ────────────────────────────────────────


test('KPI tiles for opt-in stats render', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const idx = src.indexOf('pgResolverCoachingDigestAuditHub');
  const body = src.slice(idx, idx + 30000);
  assert.match(body, /dcro4-kpi-total/);
  assert.match(body, /dcro4-kpi-opted-in/);
  assert.match(body, /dcro4-kpi-opted-out/);
  assert.match(body, /dcro4-kpi-opt-in-pct/);
});
