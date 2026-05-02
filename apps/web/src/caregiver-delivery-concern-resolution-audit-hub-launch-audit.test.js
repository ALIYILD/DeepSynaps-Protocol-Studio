// Logic-only tests for the Caregiver Delivery Concern Resolution Audit
// Hub launch audit (DCR2, 2026-05-02).
//
// Cohort dashboard built on the DCR1 audit trail. This suite pins the
// page-level + helper-level surface against the source files:
//
//   - api.js exposes caregiverDeliveryConcernResolutionAuditHubSummary /
//     caregiverDeliveryConcernResolutionAuditHubList /
//     caregiverDeliveryConcernResolutionAuditHubAuditEvents /
//     postCaregiverDeliveryConcernResolutionAuditHubAuditEvent under
//     /api/v1/caregiver-delivery-concern-resolution-audit-hub/.
//   - pages-knowledge.js exports pgCaregiverDeliveryConcernResolutionAuditHub
//     which renders KPI tiles, reason bars, trend chart, top resolvers
//     leaderboard, filter chips, paginated list, and an empty state.
//   - app.js routes 'caregiver-delivery-concern-resolution-audit-hub' /
//     'resolution-audit-hub' / 'dcr-audit-hub' to the page.
//   - pgCareTeamCoverage's "Caregiver channels" tab gains an admin-only
//     "Resolution audit hub →" link.
//
// Run: node --test src/caregiver-delivery-concern-resolution-audit-hub-launch-audit.test.js
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


test('api.js exposes caregiverDeliveryConcernResolutionAuditHubSummary helper', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(apiSrc, /caregiverDeliveryConcernResolutionAuditHubSummary\s*:/);
});


test('api.js exposes caregiverDeliveryConcernResolutionAuditHubList helper', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(apiSrc, /caregiverDeliveryConcernResolutionAuditHubList\s*:/);
});


test('api.js exposes caregiverDeliveryConcernResolutionAuditHubAuditEvents helper', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(apiSrc, /caregiverDeliveryConcernResolutionAuditHubAuditEvents\s*:/);
});


test('api.js exposes postCaregiverDeliveryConcernResolutionAuditHubAuditEvent helper', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(apiSrc, /postCaregiverDeliveryConcernResolutionAuditHubAuditEvent\s*:/);
});


test('DCR2 helpers route under /api/v1/caregiver-delivery-concern-resolution-audit-hub/', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  // Use the unique DCR2 header as the slice anchor; end at "// end DCR2 helpers"
  // sentinel so the slice does not bleed into DCR1 / DCA blocks.
  const idx = apiSrc.indexOf('DCR2 Resolution Audit Hub launch-audit');
  assert.ok(idx > 0, 'DCR2 launch-audit header missing in api.js');
  const after = apiSrc.slice(idx);
  const sectionEnd = after.indexOf('// end DCR2 helpers');
  assert.ok(sectionEnd > 0, 'DCR2 sentinel "// end DCR2 helpers" missing');
  const block = after.slice(0, sectionEnd);
  const urls = block.match(/['"`]\/api\/v1\/[^'"`]+/g) || [];
  assert.ok(urls.length >= 3, `expected >=3 URLs in the block, got ${urls.length}`);
  for (const u of urls) {
    assert.match(u, /\/api\/v1\/caregiver-delivery-concern-resolution-audit-hub/);
  }
});


// ── 2. Page function exists and renders KPI tiles ─────────────────────────


test('pages-knowledge.js exports pgCaregiverDeliveryConcernResolutionAuditHub', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  assert.match(src, /export\s+async\s+function\s+pgCaregiverDeliveryConcernResolutionAuditHub/);
});


test('audit hub renders all four KPI tiles', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  // Slice to the page function body so we don't accidentally match other
  // pages that mention KPI tile testids.
  const idx = src.indexOf('pgCaregiverDeliveryConcernResolutionAuditHub');
  assert.ok(idx > 0);
  const body = src.slice(idx, idx + 30000);
  assert.match(body, /cgcr-hub-kpi-total/);
  assert.match(body, /cgcr-hub-kpi-fp/);
  assert.match(body, /cgcr-hub-kpi-cr/);
  assert.match(body, /cgcr-hub-kpi-median/);
});


// ── 3. Empty state ────────────────────────────────────────────────────────


test('audit hub renders empty state when no resolutions in window', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const idx = src.indexOf('pgCaregiverDeliveryConcernResolutionAuditHub');
  const body = src.slice(idx, idx + 30000);
  assert.match(body, /cgcr-hub-empty/);
  assert.match(body, /No resolved delivery concerns yet\./);
});


// ── 4. Reason filter chips ────────────────────────────────────────────────


test('audit hub renders a filter chip per reason and re-fetches via _cgcrHubSetReason', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const idx = src.indexOf('pgCaregiverDeliveryConcernResolutionAuditHub');
  const body = src.slice(idx, idx + 30000);
  // Chips testid + each reason value present.
  assert.match(body, /cgcr-hub-chip/);
  assert.match(body, /'concerns_addressed'/);
  assert.match(body, /'false_positive'/);
  assert.match(body, /'caregiver_replaced'/);
  assert.match(body, /'other'/);
  // Setter handler exists and sets state.reason then re-renders.
  assert.match(body, /window\._cgcrHubSetReason\s*=/);
  assert.match(body, /state\.reason\s*=\s*r/);
});


// ── 5. Window selector ────────────────────────────────────────────────────


test('audit hub window selector lists 7/30/90/180 and triggers refetch', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const idx = src.indexOf('pgCaregiverDeliveryConcernResolutionAuditHub');
  const body = src.slice(idx, idx + 30000);
  assert.match(body, /\[7,\s*30,\s*90,\s*180\]/);
  assert.match(body, /cgcr-hub-window/);
  assert.match(body, /window\._cgcrHubSetWindow\s*=/);
  assert.match(body, /state\.windowDays\s*=\s*Number\(v\)/);
});


// ── 6. Pagination ──────────────────────────────────────────────────────────


test('audit hub pagination prev/next buttons wired to _cgcrHubPrev/_cgcrHubNext', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const idx = src.indexOf('pgCaregiverDeliveryConcernResolutionAuditHub');
  const body = src.slice(idx, idx + 30000);
  assert.match(body, /cgcr-hub-prev/);
  assert.match(body, /cgcr-hub-next/);
  assert.match(body, /window\._cgcrHubPrev\s*=/);
  assert.match(body, /window\._cgcrHubNext\s*=/);
  // Prev guards page <= 1; Next increments.
  assert.match(body, /state\.page\s*-=\s*1/);
  assert.match(body, /state\.page\s*\+=\s*1/);
});


// ── 7. Top resolvers leaderboard ──────────────────────────────────────────


test('audit hub top resolvers leaderboard renders names and counts', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const idx = src.indexOf('pgCaregiverDeliveryConcernResolutionAuditHub');
  const body = src.slice(idx, idx + 30000);
  assert.match(body, /cgcr-hub-top-resolvers/);
  assert.match(body, /resolver_name/);
  assert.match(body, /resolver_user_id/);
  assert.match(body, /tr\.count/);
});


// ── 8. Care Team Coverage admin-only link ─────────────────────────────────


test('pgCareTeamCoverage caregiver channels resolution panel includes admin-only audit hub link', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  // The link is rendered inside renderDeliveryConcernResolutionPanel, gated
  // by an admin/supervisor/regulator role check.
  const fn = src.split('function renderDeliveryConcernResolutionPanel')[1] || '';
  assert.match(fn, /ctc-cgcr-hub-link/);
  assert.match(fn, /caregiver-delivery-concern-resolution-audit-hub/);
  // Gate uses isAdminish and admin-tier roles.
  assert.match(fn, /isAdminish\s*=/);
  assert.match(fn, /['"]admin['"]/);
});


// ── 9. App.js route loader ────────────────────────────────────────────────


test('app.js route loader maps audit hub aliases to pgCaregiverDeliveryConcernResolutionAuditHub', () => {
  const src = fs.readFileSync(APP_PATH, 'utf8');
  assert.match(src, /case 'caregiver-delivery-concern-resolution-audit-hub'/);
  assert.match(src, /case 'resolution-audit-hub'/);
  assert.match(src, /case 'dcr-audit-hub'/);
  assert.match(src, /pgCaregiverDeliveryConcernResolutionAuditHub/);
});


// ── 10. Audit-events surface name canonical ───────────────────────────────


test('audit hub uses canonical surface slug in URLs', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(apiSrc, /caregiver-delivery-concern-resolution-audit-hub\/audit-events/);
  assert.match(apiSrc, /caregiver-delivery-concern-resolution-audit-hub\/summary/);
  assert.match(apiSrc, /caregiver-delivery-concern-resolution-audit-hub\/list/);
});


// ── 11. DEMO banner ───────────────────────────────────────────────────────


test('audit hub DEMO banner appears when every visible row is demo', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const idx = src.indexOf('pgCaregiverDeliveryConcernResolutionAuditHub');
  const body = src.slice(idx, idx + 30000);
  assert.match(body, /isAllDemo/);
  assert.match(body, /cgcr-hub-demo-banner/);
  // The banner copy is the canonical DeepSynaps DEMO disclaimer used
  // across every patient + clinician audit-hub launch-audit page.
  assert.match(body, /DEMO/);
  assert.match(body, /not regulator-submittable/);
});


// ── 12. Error / 500 state ─────────────────────────────────────────────────


test('audit hub renders an error notice when API throws', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const idx = src.indexOf('pgCaregiverDeliveryConcernResolutionAuditHub');
  const body = src.slice(idx, idx + 30000);
  // The render path catches errors out of loadAll() and shows an error
  // notice with testid cgcr-hub-err, not a stack trace.
  assert.match(body, /cgcr-hub-err/);
  assert.match(body, /state\.err/);
});
