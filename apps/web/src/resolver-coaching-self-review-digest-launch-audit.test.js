// Logic-only tests for the Resolver Coaching Self-Review Digest launch
// audit (DCRO3, 2026-05-02).
//
// Weekly digest worker that bundles each resolver's un-self-reviewed
// wrong false_positive calls and dispatches via their preferred on-call
// channel (reusing EscalationPolicy + oncall_delivery adapters from
// #374). Per-resolver weekly cooldown. Honest opt-in default off.
//
// Closes the loop end-to-end: DCRO1 measures (#393) → DCRO2 self-corrects
// (#397) → DCRO3 nudges.
//
// This suite pins:
//   - api.js exposes fetchMyResolverDigestPreference /
//     updateMyResolverDigestPreference / fetchResolverDigestStatus /
//     tickResolverDigest / fetchResolverDigestAuditEvents under
//     /api/v1/resolver-coaching-self-review-digest/.
//   - The DCRO3 slice-boundary sentinel exists and bounds 5 helpers.
//   - pgResolverCoachingInbox renders the opt-in card with toggle,
//     channel dropdown, save button, last-sent line, and honest
//     disclaimer when worker disabled at the system level.
//
// Run: node --test src/resolver-coaching-self-review-digest-launch-audit.test.js
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


// ── 1. api.js DCRO3 helper coverage ─────────────────────────────────────


test('api.js exposes fetchMyResolverDigestPreference helper', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(apiSrc, /fetchMyResolverDigestPreference\s*:/);
});


test('api.js exposes updateMyResolverDigestPreference helper', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(apiSrc, /updateMyResolverDigestPreference\s*:/);
});


test('api.js exposes fetchResolverDigestStatus helper', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(apiSrc, /fetchResolverDigestStatus\s*:/);
});


test('api.js exposes tickResolverDigest helper', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(apiSrc, /tickResolverDigest\s*:/);
});


test('api.js exposes fetchResolverDigestAuditEvents helper', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(apiSrc, /fetchResolverDigestAuditEvents\s*:/);
});


test('DCRO3 helpers are bounded by a unique slice-boundary sentinel', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  const idx = apiSrc.indexOf('DCRO3 Resolver Coaching Digest launch-audit');
  assert.ok(idx > 0, 'DCRO3 launch-audit header missing in api.js');
  const after = apiSrc.slice(idx);
  const sectionEnd = after.indexOf('DCRO3 SLICE BOUNDARY');
  assert.ok(sectionEnd > 0, 'DCRO3 slice boundary sentinel missing');
  const block = after.slice(0, sectionEnd);
  const urls = block.match(/['"`]\/api\/v1\/[^'"`]+/g) || [];
  assert.ok(urls.length >= 4, `expected >=4 URLs in DCRO3 block, got ${urls.length}`);
  for (const u of urls) {
    assert.match(u, /\/api\/v1\/resolver-coaching-self-review-digest/);
  }
});


test('DCRO3 PUT helper sends body with opted_in + preferred_channel keys', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  const idx = apiSrc.indexOf('updateMyResolverDigestPreference');
  assert.ok(idx > 0);
  // The helper must reference a method PUT on the my-preference path.
  const block = apiSrc.slice(idx, idx + 600);
  assert.match(block, /method:\s*['"]PUT['"]/);
  assert.match(block, /\/api\/v1\/resolver-coaching-self-review-digest\/my-preference/);
});


test('DCRO3 helper section is placed BEFORE DCRO2 in api.js', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  const dcro3Idx = apiSrc.indexOf('DCRO3 Resolver Coaching Digest launch-audit');
  const dcro2Idx = apiSrc.indexOf('Resolver Coaching Inbox launch-audit (DCRO2');
  assert.ok(dcro3Idx > 0 && dcro2Idx > 0, 'both header anchors must exist');
  assert.ok(
    dcro3Idx < dcro2Idx,
    'DCRO3 section must precede DCRO2 (per spec slice-boundary ordering)'
  );
});


// ── 2. Opt-in card is rendered inside pgResolverCoachingInbox ───────────


test('pgResolverCoachingInbox renders the DCRO3 opt-in card', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const idx = src.indexOf('pgResolverCoachingInbox');
  assert.ok(idx > 0);
  // Slice the function body to a generous upper bound.
  const body = src.slice(idx, idx + 20000);
  assert.match(body, /rcsrd-digest-card/);
  assert.match(body, /Email\/Slack me a weekly digest/);
});


test('opt-in toggle reflects current preference', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const idx = src.indexOf('rcsrd-opt-in-toggle');
  assert.ok(idx > 0, 'opt-in toggle testid missing');
  // The toggle must conditionally render `checked` from `optedIn`.
  const surrounding = src.slice(Math.max(0, idx - 200), idx + 500);
  assert.match(surrounding, /optedIn\s*\?\s*['"] checked['"]/);
});


test('channel dropdown lists slack/twilio/sendgrid/pagerduty/email + auto', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const idx = src.indexOf('_digestChannelOptions');
  assert.ok(idx > 0, '_digestChannelOptions helper missing');
  const block = src.slice(idx, idx + 400);
  for (const c of ['auto', 'slack', 'twilio', 'sendgrid', 'pagerduty', 'email']) {
    assert.ok(
      block.indexOf(`'${c}'`) >= 0,
      `channel "${c}" missing from _digestChannelOptions`
    );
  }
});


test('save button calls updateMyResolverDigestPreference with body shape', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  // Match the handler assignment, not the inline onclick reference.
  const idx = src.indexOf('window._rcsrdSave = async function');
  assert.ok(idx > 0, '_rcsrdSave handler assignment missing');
  const block = src.slice(idx, idx + 1500);
  assert.match(block, /api\.updateMyResolverDigestPreference/);
  assert.match(block, /opted_in:\s*!!state\.digestPref\.opted_in/);
  assert.match(block, /preferred_channel:\s*state\.digestPref\.preferred_channel\s*\|\|\s*null/);
});


// ── 3. Last-sent line ───────────────────────────────────────────────────


test('"Last digest sent" line renders when last_dispatched_at is set', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const idx = src.indexOf('rcsrd-last-sent');
  assert.ok(idx > 0, 'rcsrd-last-sent testid missing');
  // Both the populated + empty branches must exist (the populated
  // branch has the bare `rcsrd-last-sent` and the empty branch the
  // `-empty` variant).
  assert.match(src, /rcsrd-last-sent-empty/);
});


test('"No digests sent yet." copy renders when last_dispatched_at is null', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  assert.match(src, /No digests sent yet\./);
});


// ── 4. Honest disclaimer (worker disabled at system level) ──────────────


test('honest disclaimer renders when worker disabled at system level', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const idx = src.indexOf('rcsrd-honest-disclaimer');
  assert.ok(idx > 0, 'rcsrd-honest-disclaimer testid missing');
  // The disclaimer text must reference RESOLVER_COACHING_DIGEST_ENABLED
  // so the resolver knows what env var the admin needs to flip.
  assert.match(src, /RESOLVER_COACHING_DIGEST_ENABLED/);
  // The disclaimer must only render when workerEnabled === false.
  const block = src.slice(idx - 600, idx + 600);
  assert.match(block, /!workerEnabled/);
});


// ── 5. Audit-events surface ─────────────────────────────────────────────


test('audit-events surface name is correct on the helper path', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  const idx = apiSrc.indexOf('fetchResolverDigestAuditEvents');
  assert.ok(idx > 0);
  const block = apiSrc.slice(idx, idx + 700);
  assert.match(
    block,
    /\/api\/v1\/resolver-coaching-self-review-digest\/audit-events/
  );
});


// ── 6. Error handling ───────────────────────────────────────────────────


test('save handler captures save errors into state.digestErr', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const idx = src.indexOf('window._rcsrdSave = async function');
  assert.ok(idx > 0);
  const block = src.slice(idx, idx + 1500);
  assert.match(block, /catch\s*\(e\)/);
  assert.match(block, /state\.digestErr\s*=/);
  // The error block testid must exist somewhere in the page so the
  // error is actually rendered, not silently swallowed.
  assert.match(src, /rcsrd-err/);
});


// ── 7. Admin tick button ────────────────────────────────────────────────


test('admin tick button is visible only to admins and calls tickResolverDigest', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const idx = src.indexOf('rcsrd-admin-tick-btn');
  assert.ok(idx > 0, 'admin tick button testid missing');
  // The button is gated behind isAdmin().
  const block = src.slice(Math.max(0, idx - 300), idx + 500);
  assert.match(block, /isAdmin\(\)/);
  // Handler calls api.tickResolverDigest.
  const handlerIdx = src.indexOf('window._rcsrdAdminTick = async function');
  assert.ok(handlerIdx > 0, '_rcsrdAdminTick handler assignment missing');
  const handlerBlock = src.slice(handlerIdx, handlerIdx + 800);
  assert.match(handlerBlock, /api\.tickResolverDigest/);
});


// ── 8. Channel dropdown wires onChange to state ─────────────────────────


test('channel dropdown writes back to state.digestPref.preferred_channel', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const idx = src.indexOf('window._rcsrdOnChannelChange = function');
  assert.ok(idx > 0, '_rcsrdOnChannelChange handler assignment missing');
  const block = src.slice(idx, idx + 600);
  assert.match(block, /state\.digestPref\.preferred_channel/);
  // 'auto' must serialize to null so the backend treats it as
  // "use clinic chain" rather than a literal channel choice.
  assert.match(block, /===\s*['"]auto['"]/);
  assert.match(block, /\?\s*null\s*:/);
});


// ── 9. Card placement inside the inbox render ───────────────────────────


test('digest card is composed into the inbox render after the wrong-call cards', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  // The inbox render builds innerHTML by concatenating
  // styleBlock + heading + ... + cards + renderDigestCard() + admin overview.
  const idx = src.indexOf('renderDigestCard()');
  assert.ok(idx > 0, 'renderDigestCard call site missing in inbox render');
  // The call site must precede renderAdminOverviewTable so admin
  // overview still sits at the bottom of the page.
  const after = src.slice(idx);
  const adminIdx = after.indexOf('renderAdminOverviewTable');
  assert.ok(adminIdx >= 0, 'admin overview must follow digest card');
});
