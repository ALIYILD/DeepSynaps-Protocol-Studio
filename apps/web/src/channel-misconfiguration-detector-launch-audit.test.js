// Logic-only tests for the Channel Misconfiguration Detector launch
// audit (2026-05-01).
//
// Closes section I rec from the Clinic Caregiver Channel Override
// launch audit (#387). This suite pins the page-level + helper-level
// surface against the source files:
//
//   - api.js exposes channelMisconfigDetectorStatus / TickOnce /
//     postChannelMisconfigDetectorAuditEvent under
//     /api/v1/channel-misconfiguration-detector/.
//   - pgCareTeamCoverage's "Caregiver channels" tab gains a red
//     Misconfigured: {n} summary badge + worker status panel + admin-
//     only Run-detector-now CTA, plus a mount-time
//     channel_misconfig_view audit ping.
//
// Run: node --test src/channel-misconfiguration-detector-launch-audit.test.js
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


test('api.js exposes channelMisconfigDetectorStatus helper', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(apiSrc, /channelMisconfigDetectorStatus\s*:/);
});


test('api.js exposes channelMisconfigDetectorTickOnce helper', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(apiSrc, /channelMisconfigDetectorTickOnce\s*:/);
});


test('api.js exposes postChannelMisconfigDetectorAuditEvent helper', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(apiSrc, /postChannelMisconfigDetectorAuditEvent\s*:/);
});


test('channel-misconfig helpers route under /api/v1/channel-misconfiguration-detector/', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  const idx = apiSrc.indexOf(
    'Channel Misconfiguration Detector launch-audit',
  );
  assert.ok(idx > 0, 'launch-audit header missing in api.js');
  const after = apiSrc.slice(idx);
  const sectionEnd = after.indexOf('};');
  const block = sectionEnd > 0 ? after.slice(0, sectionEnd) : after;
  const urls = block.match(/['"]\/api\/v1\/[^'"]+/g) || [];
  assert.ok(urls.length >= 3, `expected >=3 URLs in the block, got ${urls.length}`);
  for (const u of urls) {
    assert.match(u, /\/api\/v1\/channel-misconfiguration-detector/);
  }
});


test('channelMisconfigDetectorTickOnce uses HTTP POST method', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  const idx = apiSrc.indexOf('channelMisconfigDetectorTickOnce');
  assert.ok(idx > 0, 'channelMisconfigDetectorTickOnce not found');
  const slice = apiSrc.slice(idx, idx + 360);
  assert.match(slice, /method:\s*['"`]POST['"`]/);
});


// ── 2. pgCareTeamCoverage panel + badge wiring ────────────────────────────


test('pgCareTeamCoverage loadAll requests channelMisconfigDetectorStatus', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  // The detector status helper must be added to the parallel Promise.all
  // inside loadAll() and surfaced on the returned object.
  const fn = src.split('async function loadAll')[1] || '';
  assert.match(fn, /channelMisconfigDetectorStatus/);
});


test('pgCareTeamCoverage renders renderChannelMisconfigDetectorPanel body', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  assert.match(src, /function renderChannelMisconfigDetectorPanel/);
  assert.match(src, /ctc-channel-misconfig-panel/);
  assert.match(src, /ctc-channel-misconfig-badge/);
});


test('pgCareTeamCoverage renders red Misconfigured badge with count', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  // The badge wraps the misconfigCount; the visual treatment is red
  // (#fb7185) so the admin's eye lands on the count.
  const fn = src.split('function renderChannelMisconfigDetectorPanel')[1] || '';
  assert.match(fn, /Misconfigured:/);
  assert.match(fn, /#fb7185/);
});


test('pgCareTeamCoverage detector panel renders running indicator dot', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const fn = src.split('function renderChannelMisconfigDetectorPanel')[1] || '';
  // Running indicator (●) and last-tick rendering must appear inside the
  // panel function.
  assert.match(fn, /running/);
  assert.match(fn, /last_tick_at|last tick/);
  assert.match(fn, /misconfigs_flagged_last_24h|flagged 24h/);
});


test('pgCareTeamCoverage exposes admin-only Run detector now CTA', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  // CTA button id + admin-gated rendering.
  assert.match(src, /ctc-channel-misconfig-run-now/);
  assert.match(src, /Run detector now/);
  assert.match(src, /window\._channelMisconfigDetectorRunNow/);
});


test('pgCareTeamCoverage Run detector now wires to channelMisconfigDetectorTickOnce', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  // The handler body starts at the assignment line — the FIRST hit is
  // the onclick attribute, so split on the assignment marker instead.
  const fn = src.split('window._channelMisconfigDetectorRunNow = ')[1] || '';
  assert.match(fn, /api\.channelMisconfigDetectorTickOnce\s*\(/);
});


test('pgCareTeamCoverage emits channel_misconfig_view audit ping', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  // The ping must fire from inside the renderCaregiverChannelsTab body
  // so the regulator transcript records the admin's read access on
  // every tab mount.
  const fn = src.split('function renderCaregiverChannelsTab')[1] || '';
  assert.match(fn, /event:\s*['"]channel_misconfig_view['"]/);
});


test('pgCareTeamCoverage caregiver channels tab prepends detector panel', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const fn = src.split('function renderCaregiverChannelsTab')[1] || '';
  // The detector panel must be computed once (const detectorPanel) and
  // included in the rendered HTML so the badge sits at the top of the
  // tab, not buried below the caregiver table.
  assert.match(fn, /var\s+detectorPanel\s*=\s*renderChannelMisconfigDetectorPanel/);
  assert.match(fn, /detectorPanel\s*\+/);
});


test('pgCareTeamCoverage detector run-now CTA fires audit pings on both surfaces', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const fn = src.split('window._channelMisconfigDetectorRunNow = ')[1] || '';
  // Both the care_team_coverage page surface AND the
  // channel_misconfiguration_detector worker surface must see the click.
  assert.match(fn, /postCareTeamCoverageAuditEvent/);
  assert.match(fn, /postChannelMisconfigDetectorAuditEvent/);
});
