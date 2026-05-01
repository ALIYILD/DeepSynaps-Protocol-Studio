// Logic-only tests for the Caregiver Delivery Concern Aggregator
// launch audit (2026-05-01).
//
// Closes section I rec from the Channel Misconfiguration Detector
// launch audit (#389). This suite pins the page-level + helper-level
// surface against the source files:
//
//   - api.js exposes caregiverDeliveryConcernAggregatorStatus / Tick /
//     AuditEvents / postCaregiverDeliveryConcernAggregatorAuditEvent
//     under /api/v1/caregiver-delivery-concern-aggregator/.
//   - pgCareTeamCoverage's "Caregiver channels" tab gains a "Delivery
//     concerns" sub-section with worker status panel + admin-only
//     "Run aggregator now" CTA + flagged-caregiver list with concern
//     count + window + "Review preference" link to the override tab,
//     plus a mount-time view audit ping on the worker surface.
//
// Run: node --test src/caregiver-delivery-concern-aggregator-launch-audit.test.js
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


test('api.js exposes caregiverDeliveryConcernAggregatorStatus helper', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(apiSrc, /caregiverDeliveryConcernAggregatorStatus\s*:/);
});


test('api.js exposes caregiverDeliveryConcernAggregatorTick helper', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(apiSrc, /caregiverDeliveryConcernAggregatorTick\s*:/);
});


test('api.js exposes caregiverDeliveryConcernAggregatorAuditEvents helper', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(apiSrc, /caregiverDeliveryConcernAggregatorAuditEvents\s*:/);
});


test('api.js exposes postCaregiverDeliveryConcernAggregatorAuditEvent helper', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(apiSrc, /postCaregiverDeliveryConcernAggregatorAuditEvent\s*:/);
});


test('caregiver-delivery-concern-aggregator helpers route under /api/v1/caregiver-delivery-concern-aggregator/', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  const idx = apiSrc.indexOf(
    'Caregiver Delivery Concern Aggregator launch-audit',
  );
  assert.ok(idx > 0, 'launch-audit header missing in api.js');
  const after = apiSrc.slice(idx);
  const sectionEnd = after.indexOf('};');
  const block = sectionEnd > 0 ? after.slice(0, sectionEnd) : after;
  const urls = block.match(/['"`]\/api\/v1\/[^'"`]+/g) || [];
  assert.ok(urls.length >= 3, `expected >=3 URLs in the block, got ${urls.length}`);
  for (const u of urls) {
    assert.match(u, /\/api\/v1\/caregiver-delivery-concern-aggregator/);
  }
});


test('caregiverDeliveryConcernAggregatorTick uses HTTP POST method', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  const idx = apiSrc.indexOf('caregiverDeliveryConcernAggregatorTick');
  assert.ok(idx > 0, 'caregiverDeliveryConcernAggregatorTick not found');
  const slice = apiSrc.slice(idx, idx + 360);
  assert.match(slice, /method:\s*['"`]POST['"`]/);
});


test('caregiverDeliveryConcernAggregatorAuditEvents builds query string', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  const idx = apiSrc.indexOf('caregiverDeliveryConcernAggregatorAuditEvents');
  assert.ok(idx > 0, 'helper not found');
  const slice = apiSrc.slice(idx, idx + 600);
  // Must support surface query param so the panel can fetch the portal
  // surface (flagged caregivers) rather than the worker surface.
  assert.match(slice, /surface/);
});


// ── 2. pgCareTeamCoverage panel + badge wiring ────────────────────────────


test('pgCareTeamCoverage loadAll requests aggregator status + events', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const fn = src.split('async function loadAll')[1] || '';
  assert.match(fn, /caregiverDeliveryConcernAggregatorStatus/);
  assert.match(fn, /caregiverDeliveryConcernAggregatorAuditEvents/);
});


test('pgCareTeamCoverage renders renderDeliveryConcernAggregatorPanel body', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  assert.match(src, /function renderDeliveryConcernAggregatorPanel/);
  assert.match(src, /ctc-cgca-panel/);
  assert.match(src, /ctc-cgca-badge/);
});


test('pgCareTeamCoverage renders red Flagged badge with count', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  // The badge wraps the unresolvedCount; the visual treatment is red
  // (#fb7185) when the count is > 0.
  const fn = src.split('function renderDeliveryConcernAggregatorPanel')[1] || '';
  assert.match(fn, /Flagged:/);
  assert.match(fn, /#fb7185/);
});


test('pgCareTeamCoverage aggregator panel renders threshold/window/cooldown chips', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const fn = src.split('function renderDeliveryConcernAggregatorPanel')[1] || '';
  // The panel must surface the worker's threshold + window + cooldown
  // values from the status endpoint so the admin can verify the rolling-
  // window math without opening an env var.
  assert.match(fn, /threshold/);
  assert.match(fn, /window/);
  assert.match(fn, /cooldown/);
});


test('pgCareTeamCoverage exposes admin-only Run aggregator now CTA', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  // CTA button id + admin-gated rendering.
  assert.match(src, /ctc-cgca-run-now/);
  assert.match(src, /Run aggregator now/);
  assert.match(src, /window\._deliveryConcernAggregatorRunNow/);
});


test('pgCareTeamCoverage Run aggregator now wires to caregiverDeliveryConcernAggregatorTick', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  // The handler body starts at the assignment line.
  const fn = src.split('window._deliveryConcernAggregatorRunNow = ')[1] || '';
  assert.match(fn, /api\.caregiverDeliveryConcernAggregatorTick\s*\(/);
});


test('pgCareTeamCoverage emits view audit ping on tab mount', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const fn = src.split('function renderCaregiverChannelsTab')[1] || '';
  // The mount-time ping should fire on the aggregator surface so the
  // regulator transcript records the admin's read access on every tab
  // mount.
  assert.match(fn, /postCaregiverDeliveryConcernAggregatorAuditEvent/);
});


test('pgCareTeamCoverage caregiver channels tab includes aggregator panel', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const fn = src.split('function renderCaregiverChannelsTab')[1] || '';
  assert.match(fn, /var\s+concernAggregatorPanel\s*=\s*renderDeliveryConcernAggregatorPanel/);
  assert.match(fn, /concernAggregatorPanel\s*\+/);
});


test('pgCareTeamCoverage Run aggregator now CTA fires audit pings on both surfaces', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const fn = src.split('window._deliveryConcernAggregatorRunNow = ')[1] || '';
  // Both the care_team_coverage page surface AND the
  // caregiver_delivery_concern_aggregator worker surface must see the click.
  assert.match(fn, /postCareTeamCoverageAuditEvent/);
  assert.match(fn, /postCaregiverDeliveryConcernAggregatorAuditEvent/);
});


test('pgCareTeamCoverage flagged-caregiver list renders concern_count + Review link', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const fn = src.split('function renderDeliveryConcernAggregatorPanel')[1] || '';
  // The list must extract concern_count from the audit-event note + render
  // a "Review preference" link that targets the caregiver-channels tab.
  // The source contains a regex literal /concern_count=(\d+)/.
  assert.match(fn, /concern_count=/);
  assert.match(fn, /Review preference/);
  assert.match(fn, /ctc-cgca-review-link/);
});


test('pgCareTeamCoverage relative-time helper renders X minutes/hours/days ago', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  // The relative-time helper is used to render the last_tick_at + each
  // flag's created_at as "X ago" so the admin sees recency at a glance.
  assert.match(src, /function _relativeTime/);
  // Should produce phrasing for minute / hour / day. The pluralization
  // is applied with a ternary so the literal substring is the singular
  // form followed by the suffix builder.
  const fn = src.split('function _relativeTime')[1] || '';
  assert.match(fn, /minute/);
  assert.match(fn, /hour/);
  assert.match(fn, /day/);
  assert.match(fn, /' ago'/);
});


test('pgCareTeamCoverage empty state renders when no flagged caregivers', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const fn = src.split('function renderDeliveryConcernAggregatorPanel')[1] || '';
  // When unresolvedCount === 0 the panel should render an honest empty
  // state rather than an empty table — the testid lets the QA suite
  // assert this branch.
  assert.match(fn, /ctc-cgca-empty/);
});


test('pgCareTeamCoverage audit-events fetch uses caregiver_portal surface', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const fn = src.split('async function loadAll')[1] || '';
  // The status panel + flagged-caregiver list need rows from the portal
  // surface, not the worker tick rows. We pass the surface explicitly.
  assert.match(fn, /surface:\s*['"`]caregiver_portal['"`]/);
});


test('pgCareTeamCoverage aggregator panel error state renders unreachable banner', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const fn = src.split('function renderDeliveryConcernAggregatorPanel')[1] || '';
  // The "status === null" path should render an honest unreachable
  // banner with the same panel testid so QA can assert this branch.
  assert.match(fn, /aggregator status unreachable|status unreachable/i);
});


test('pgCareTeamCoverage caregiver-channels tab header counts unresolved aggregator flags', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  // The tab header label combines misconfigured-channels with
  // unresolved aggregator flags so the admin sees the total at a glance.
  assert.match(src, /caregiverChannelsHeaderCount/);
  assert.match(src, /deliveryConcernAggregatorUnresolvedCount/);
});


test('pgCareTeamCoverage Review preference link emits audit ping on click', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  // Review-link onclick should call _deliveryConcernAggregatorReviewClicked
  // which posts a review_preference_clicked audit event.
  assert.match(src, /window\._deliveryConcernAggregatorReviewClicked/);
  const fn = src.split('window._deliveryConcernAggregatorReviewClicked = ')[1] || '';
  assert.match(fn, /review_preference_clicked/);
});
