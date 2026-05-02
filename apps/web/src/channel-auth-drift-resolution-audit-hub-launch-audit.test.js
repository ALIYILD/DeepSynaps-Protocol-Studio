// Logic-only tests for the Channel Auth Drift Resolution Audit Hub
// launch audit (CSAHP3, 2026-05-02).
//
// Cohort dashboard built on the audit trail emitted by CSAHP1 (#417)
// and CSAHP2 (#422). Mirrors the DCR2 → DCRO1 pattern (#392 / #393):
// pure read-side analytics, no migration, no worker.
//
// Surface contract pinned by this suite:
//   - api.js exposes fetchAuthDriftResolutionAuditHubSummary,
//     fetchAuthDriftTopRotators,
//     fetchAuthDriftResolutionAuditHubAuditEvents,
//     postAuthDriftResolutionAuditHubAuditEvent under
//     /api/v1/channel-auth-drift-resolution-audit-hub/.
//   - pages-knowledge.js exports pgChannelAuthDriftResolutionAuditHub
//     which renders 5 sections: rotation funnel KPIs, rotation method
//     distribution, per-channel metrics table (color-coded re-flag
//     rate), top rotators table, weekly trend chart.
//   - app.js routes 'auth-drift-audit-hub' / 'csahp-audit-hub' /
//     'csahp3-audit-hub' to the page.
//   - pgCoachingDigestDeliveryFailureDrilldown's Auth health section
//     gains an admin-only "Audit hub →" link.
//
// Run: node --test src/channel-auth-drift-resolution-audit-hub-launch-audit.test.js
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


test('api.js exposes fetchAuthDriftResolutionAuditHubSummary helper', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(apiSrc, /fetchAuthDriftResolutionAuditHubSummary\s*:/);
});


test('api.js exposes fetchAuthDriftTopRotators helper', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(apiSrc, /fetchAuthDriftTopRotators\s*:/);
});


test('api.js exposes fetchAuthDriftResolutionAuditHubAuditEvents helper', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(apiSrc, /fetchAuthDriftResolutionAuditHubAuditEvents\s*:/);
});


test('CSAHP3 helpers route under /api/v1/channel-auth-drift-resolution-audit-hub/', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  // Use the unique CSAHP3 header anchor and the "// end CSAHP3 helpers"
  // sentinel to slice the section so we don't bleed into CSAHP2 / CSAHP1.
  const idx = apiSrc.indexOf('CSAHP3 Auth Drift Resolution Audit Hub launch-audit');
  assert.ok(idx > 0, 'CSAHP3 launch-audit header missing in api.js');
  const after = apiSrc.slice(idx);
  const sectionEnd = after.indexOf('// end CSAHP3 helpers');
  assert.ok(sectionEnd > 0, 'CSAHP3 sentinel "// end CSAHP3 helpers" missing');
  const block = after.slice(0, sectionEnd);
  const urls = block.match(/['"`]\/api\/v1\/[^'"`]+/g) || [];
  assert.ok(urls.length >= 3, `expected >=3 URLs in the CSAHP3 block, got ${urls.length}`);
  for (const u of urls) {
    assert.match(u, /\/api\/v1\/channel-auth-drift-resolution-audit-hub/);
  }
});


test('CSAHP3 slice boundary sentinel present', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(apiSrc, /━━ CSAHP3 SLICE BOUNDARY ━━/);
});


// ── 2. Page function exists and renders all 5 sections ────────────────────


test('pages-knowledge.js exports pgChannelAuthDriftResolutionAuditHub', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  assert.match(src, /export\s+async\s+function\s+pgChannelAuthDriftResolutionAuditHub/);
});


test('hub page renders all 5 sections (funnel / methods / by-channel / top-rotators / trend)', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const idx = src.indexOf('pgChannelAuthDriftResolutionAuditHub');
  assert.ok(idx > 0);
  const body = src.slice(idx, idx + 30000);
  assert.match(body, /csahp3-section-funnel/);
  assert.match(body, /csahp3-section-methods/);
  assert.match(body, /csahp3-section-by-channel/);
  assert.match(body, /csahp3-section-top-rotators/);
  assert.match(body, /csahp3-section-trend/);
});


// ── 3. Rotation funnel KPIs render numbers + percentages ───────────────────


test('rotation funnel renders detected/marked/confirmed/reflagged KPI tiles + percentages', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const idx = src.indexOf('pgChannelAuthDriftResolutionAuditHub');
  const body = src.slice(idx, idx + 30000);
  assert.match(body, /csahp3-kpi-detected/);
  assert.match(body, /csahp3-kpi-marked/);
  assert.match(body, /csahp3-kpi-confirmed/);
  assert.match(body, /csahp3-kpi-reflagged/);
  assert.match(body, /marked_pct/);
  assert.match(body, /confirmed_pct/);
  assert.match(body, /re_flag_pct/);
});


// ── 4. Empty state ────────────────────────────────────────────────────────


test('hub page renders empty state when total_drifts is zero', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const idx = src.indexOf('pgChannelAuthDriftResolutionAuditHub');
  const body = src.slice(idx, idx + 30000);
  assert.match(body, /csahp3-empty/);
  assert.match(body, /No auth drift detections in this window\./);
});


// ── 5. Rotation method donut renders all three methods ────────────────────


test('rotation method distribution renders manual / automated_rotation / key_revoked rows', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const idx = src.indexOf('pgChannelAuthDriftResolutionAuditHub');
  const body = src.slice(idx, idx + 30000);
  assert.match(body, /csahp3-method-row/);
  assert.match(body, /'manual'/);
  assert.match(body, /'automated_rotation'/);
  assert.match(body, /'key_revoked'/);
});


// ── 6. Per-channel table renders + color-codes re-flag rate ───────────────


test('per-channel table renders and color-codes re-flag rate (green/yellow/red)', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const idx = src.indexOf('pgChannelAuthDriftResolutionAuditHub');
  const body = src.slice(idx, idx + 30000);
  assert.match(body, /csahp3-channel-row/);
  assert.match(body, /median_time_to_rotate_hours/);
  assert.match(body, /median_time_to_confirm_hours/);
  assert.match(body, /re_flag_rate_pct/);
  // Color-coding helper covers all three buckets.
  assert.match(body, /csahp3-ch-green/);
  assert.match(body, /csahp3-ch-yellow/);
  assert.match(body, /csahp3-ch-red/);
});


// ── 7. Top rotators table renders names + counts ──────────────────────────


test('top rotators table renders names and rotation counts', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const idx = src.indexOf('pgChannelAuthDriftResolutionAuditHub');
  const body = src.slice(idx, idx + 30000);
  assert.match(body, /csahp3-top-rotators/);
  assert.match(body, /csahp3-rotator-row/);
  assert.match(body, /rotator_name/);
  assert.match(body, /rotator_user_id/);
  assert.match(body, /it\.rotations/);
});


// ── 8. Admin-only link from DCRO5 page ────────────────────────────────────


test('pgCoachingDigestDeliveryFailureDrilldown auth health section includes admin-only audit hub link', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  // Slice the DCRO5 page to avoid matching unrelated "Audit hub →" text.
  const dcro5Start = src.indexOf('pgCoachingDigestDeliveryFailureDrilldown');
  assert.ok(dcro5Start > 0);
  const dcro5End = src.indexOf('// ── end Coaching Digest Delivery Failure Drilldown', dcro5Start);
  assert.ok(dcro5End > dcro5Start);
  const dcro5Body = src.slice(dcro5Start, dcro5End);
  assert.match(dcro5Body, /csahp3-audit-hub-link/);
  assert.match(dcro5Body, /auth-drift-audit-hub/);
  // Gate uses _csahp1IsAdmin() (admin/supervisor/regulator).
  assert.match(dcro5Body, /_csahp1IsAdmin\(\)/);
});


// ── 9. Window selector triggers re-fetch ───────────────────────────────────


test('hub page window selector lists 30/90/180 and triggers re-render via _csahp3SetWindow', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const idx = src.indexOf('pgChannelAuthDriftResolutionAuditHub');
  const body = src.slice(idx, idx + 30000);
  assert.match(body, /\[30,\s*90,\s*180\]/);
  assert.match(body, /csahp3-window/);
  assert.match(body, /window\._csahp3SetWindow\s*=/);
  assert.match(body, /state\.windowDays\s*=\s*Number\(v\)/);
});


// ── 10. App.js route loader ────────────────────────────────────────────────


test('app.js route loader maps audit hub aliases to pgChannelAuthDriftResolutionAuditHub', () => {
  const src = fs.readFileSync(APP_PATH, 'utf8');
  assert.match(src, /case 'auth-drift-audit-hub'/);
  assert.match(src, /case 'csahp-audit-hub'/);
  assert.match(src, /case 'csahp3-audit-hub'/);
  assert.match(src, /pgChannelAuthDriftResolutionAuditHub/);
});


// ── 11. Audit-events surface name canonical ───────────────────────────────


test('hub page uses canonical surface slug in URLs', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(apiSrc, /channel-auth-drift-resolution-audit-hub\/audit-events/);
  assert.match(apiSrc, /channel-auth-drift-resolution-audit-hub\/summary/);
  assert.match(apiSrc, /channel-auth-drift-resolution-audit-hub\/top-rotators/);
});


// ── 12. Error / 500 state ─────────────────────────────────────────────────


test('hub page renders an error notice when API throws', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const idx = src.indexOf('pgChannelAuthDriftResolutionAuditHub');
  const body = src.slice(idx, idx + 30000);
  assert.match(body, /csahp3-err/);
  assert.match(body, /state\.err/);
});


// ── 13. Worker disabled disclaimer ────────────────────────────────────────


test('hub page renders honest CSAHP1 worker enabled/disabled disclaimer', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const idx = src.indexOf('pgChannelAuthDriftResolutionAuditHub');
  const body = src.slice(idx, idx + 30000);
  assert.match(body, /csahp3-worker-disclaimer/);
  assert.match(body, /worker_enabled/);
  // Both states must surface.
  assert.match(body, /enabled/);
  assert.match(body, /disabled/);
});
