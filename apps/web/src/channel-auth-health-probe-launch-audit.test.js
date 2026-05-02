// Logic-only tests for the Channel-Specific Auth Health Probe launch
// audit (CSAHP1, 2026-05-02).
//
// Closes section I rec from DCRO5 (#406). This suite pins the
// page-level + helper-level surface against the source files:
//
//   - api.js exposes fetchChannelAuthHealthStatus /
//     tickChannelAuthHealthProbe / fetchChannelAuthHealthAuditEvents
//     under /api/v1/channel-auth-health-probe/.
//   - pgCoachingDigestDeliveryFailureDrilldown (DCRO5) renders an
//     "Auth health" section with per-channel green/red/grey tiles +
//     admin-only Run probe now CTA + per-channel dropdown.
//
// Run: node --test src/channel-auth-health-probe-launch-audit.test.js
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


test('api.js exposes fetchChannelAuthHealthStatus helper', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(apiSrc, /fetchChannelAuthHealthStatus\s*:/);
});


test('api.js exposes tickChannelAuthHealthProbe helper', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(apiSrc, /tickChannelAuthHealthProbe\s*:/);
});


test('api.js exposes fetchChannelAuthHealthAuditEvents helper', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(apiSrc, /fetchChannelAuthHealthAuditEvents\s*:/);
});


test('CSAHP1 helpers route under /api/v1/channel-auth-health-probe/', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  const idx = apiSrc.indexOf(
    'CSAHP1 Channel Auth Health Probe launch-audit',
  );
  assert.ok(idx > 0, 'CSAHP1 launch-audit header missing in api.js');
  const after = apiSrc.slice(idx);
  // Walk to the slice-boundary sentinel to bound the section.
  const sentinelIdx = after.indexOf('━━ CSAHP1 SLICE BOUNDARY ━━');
  assert.ok(sentinelIdx > 0, 'CSAHP1 slice boundary sentinel missing');
  const block = after.slice(0, sentinelIdx);
  const urls = block.match(/['"]\/api\/v1\/[^'"]+/g) || [];
  assert.ok(urls.length >= 3, `expected >=3 URLs in the CSAHP1 block, got ${urls.length}`);
  for (const u of urls) {
    assert.match(u, /\/api\/v1\/channel-auth-health-probe/);
  }
});


test('tickChannelAuthHealthProbe uses HTTP POST method', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  const idx = apiSrc.indexOf('tickChannelAuthHealthProbe');
  assert.ok(idx > 0, 'tickChannelAuthHealthProbe not found');
  const slice = apiSrc.slice(idx, idx + 360);
  assert.match(slice, /method:\s*['"`]POST['"`]/);
});


// ── 2. Auth-health section structure ──────────────────────────────────────


test('DCRO5 renders renderAuthHealthSection function', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  assert.match(src, /function renderAuthHealthSection/);
  assert.match(src, /csahp1-auth-health-section/);
});


test('DCRO5 auth-health grid renders all 4 channels', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const fn = src.split('function renderAuthHealthSection')[1] || '';
  // The 4 known channels must appear in the keys array.
  assert.match(fn, /'slack'/);
  assert.match(fn, /'sendgrid'/);
  assert.match(fn, /'twilio'/);
  assert.match(fn, /'pagerduty'/);
});


test('DCRO5 auth-health tiles render colour-coded badges', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const fn = src.split('function renderAuthHealthSection')[1] || '';
  // Three colour states: green (#16a34a), red (#dc2626), grey (#9ca3af).
  assert.match(fn, /#16a34a/); // green
  assert.match(fn, /#dc2626/); // red
  assert.match(fn, /#9ca3af/); // grey
  assert.match(fn, /csahp1-tile-badge/);
});


test('DCRO5 auth-health renders Last verified relative timestamp', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  // Must compute and render a relative time helper for last_probed_at.
  assert.match(src, /_csahp1RelativeTime/);
  const fn = src.split('function renderAuthHealthSection')[1] || '';
  assert.match(fn, /Last verified/);
  assert.match(fn, /csahp1-tile-relative/);
});


test('DCRO5 auth-health Run probe now CTA is admin-gated', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const fn = src.split('function renderAuthHealthSection')[1] || '';
  // Admin-only render gate: the CTA block sits behind _csahp1IsAdmin().
  assert.match(fn, /_csahp1IsAdmin/);
  assert.match(fn, /csahp1-run-now-btn/);
  assert.match(fn, /Run probe now/);
});


test('DCRO5 auth-health single-channel dropdown wires to Run for one channel button', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const fn = src.split('function renderAuthHealthSection')[1] || '';
  assert.match(fn, /csahp1-channel-select/);
  assert.match(fn, /csahp1-run-channel-btn/);
  assert.match(fn, /Run for one channel/);
});


test('DCRO5 auth-health renders empty state when worker never probed', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const fn = src.split('function renderAuthHealthSection')[1] || '';
  assert.match(fn, /csahp1-never-probed|csahp1-empty-state/);
});


test('DCRO5 auth-health renders worker-disabled disclaimer with enabled flag', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const fn = src.split('function renderAuthHealthSection')[1] || '';
  assert.match(fn, /csahp1-disclaimer/);
  assert.match(fn, /Worker is currently/);
  assert.match(fn, /enabled/);
  assert.match(fn, /disabled/);
});


// ── 3. Page wiring ────────────────────────────────────────────────────────


test('DCRO5 loadAll requests fetchChannelAuthHealthStatus', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  // pgCoachingDigestDeliveryFailureDrilldown is the load-bearing page
  // for CSAHP1's auth-health section. There are 5+ loadAll declarations
  // in pages-knowledge.js so anchor on the function declaration that
  // immediately follows the DCRO5 page entry.
  const dcro5Idx = src.indexOf('pgCoachingDigestDeliveryFailureDrilldown');
  assert.ok(dcro5Idx > 0, 'pgCoachingDigestDeliveryFailureDrilldown not found');
  const after = src.slice(dcro5Idx);
  const loadAllIdx = after.indexOf('async function loadAll');
  assert.ok(loadAllIdx > 0, 'loadAll not found inside DCRO5 page');
  // Bound the slice to the function body — close-paren of `return resp;}`
  // is the last useful token. Walk forward 3KB which comfortably covers
  // the function body without bleeding into renderControls().
  const fn = after.slice(loadAllIdx, loadAllIdx + 3000);
  assert.match(fn, /fetchChannelAuthHealthStatus/);
});


test('DCRO5 render injects auth-health section under csahp1-section-auth-health heading', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  // The heading data-testid + the renderAuthHealthSection call must
  // both appear inside pgCoachingDigestDeliveryFailureDrilldown's
  // render() concat string.
  assert.match(src, /csahp1-section-auth-health/);
  assert.match(src, /renderAuthHealthSection\s*\(/);
});


test('DCRO5 _csahp1RunProbe handler wires to tickChannelAuthHealthProbe', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const fn = src.split('window._csahp1RunProbe = ')[1] || '';
  assert.match(fn, /api\.tickChannelAuthHealthProbe\s*\(/);
});


test('DCRO5 _csahp1RunChannelProbe handler reads dropdown + posts channel body', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const fn = src.split('window._csahp1RunChannelProbe = ')[1] || '';
  // Reads csahp1-channel-select, calls tickChannelAuthHealthProbe with
  // a {channel} body.
  assert.match(fn, /csahp1-channel-select/);
  assert.match(fn, /api\.tickChannelAuthHealthProbe/);
  assert.match(fn, /channel:/);
});


// ── 4. Audit-events surface name ──────────────────────────────────────────


test('CSAHP1 audit-events helper carries surface=channel_auth_health_probe', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  const idx = apiSrc.indexOf('fetchChannelAuthHealthAuditEvents');
  assert.ok(idx > 0, 'fetchChannelAuthHealthAuditEvents not found');
  const slice = apiSrc.slice(idx, idx + 600);
  assert.match(slice, /\/api\/v1\/channel-auth-health-probe\/audit-events/);
});
