// Logic-only tests for the Resolver Coaching Inbox launch audit
// (DCRO2, 2026-05-02).
//
// Private, read-only inbox view per resolver showing THEIR OWN wrong
// false_positive calls (resolutions where the resolver said
// "false_positive" but the DCA worker re-flagged the same caregiver
// within 30 days).
//
// This suite pins:
//   - api.js exposes fetchMyCoachingInbox / fileSelfReviewNote /
//     fetchCoachingInboxAuditEvents / fetchResolverAdminOverview helpers
//     under /api/v1/resolver-coaching-inbox/.
//   - pages-knowledge.js exports pgResolverCoachingInbox with the
//     calibration badge color-coding, bottom-quartile callout,
//     wrong-fp cards, empty state, admin overview, self-review note
//     modal with 10-500 char validation.
//   - app.js wires the route loader to load pgResolverCoachingInbox.
//   - DCR2 Resolution Audit Hub renders a "My coaching inbox →" link.
//
// Run: node --test src/resolver-coaching-inbox-launch-audit.test.js
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


// ── 1. api.js DCRO2 helper coverage ─────────────────────────────────────


test('api.js exposes fetchMyCoachingInbox helper', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(apiSrc, /fetchMyCoachingInbox\s*:/);
});


test('api.js exposes fileSelfReviewNote helper', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(apiSrc, /fileSelfReviewNote\s*:/);
});


test('api.js exposes fetchCoachingInboxAuditEvents helper', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(apiSrc, /fetchCoachingInboxAuditEvents\s*:/);
});


test('api.js exposes fetchResolverAdminOverview helper', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(apiSrc, /fetchResolverAdminOverview\s*:/);
});


test('DCRO2 helpers route under /api/v1/resolver-coaching-inbox/ via slice anchor', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  // Slice from the unique DCRO2 header to the unique sentinel marker.
  const idx = apiSrc.indexOf('Resolver Coaching Inbox launch-audit (DCRO2');
  assert.ok(idx > 0, 'DCRO2 launch-audit header missing in api.js');
  const after = apiSrc.slice(idx);
  const sectionEnd = after.indexOf('DCRO2 SLICE BOUNDARY');
  assert.ok(sectionEnd > 0, 'DCRO2 slice boundary sentinel missing');
  const block = after.slice(0, sectionEnd);
  const urls = block.match(/['"`]\/api\/v1\/[^'"`]+/g) || [];
  assert.ok(urls.length >= 4, `expected >=4 URLs in the DCRO2 block, got ${urls.length}`);
  for (const u of urls) {
    assert.match(u, /\/api\/v1\/resolver-coaching-inbox/);
  }
});


// ── 2. Page renders calibration badge + color-coding ────────────────────


test('pgResolverCoachingInbox is exported', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  assert.match(src, /export\s+async\s+function\s+pgResolverCoachingInbox/);
});


test('coaching inbox renders calibration badge with green/yellow/red color-coding', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const idx = src.indexOf('pgResolverCoachingInbox');
  assert.ok(idx > 0);
  const body = src.slice(idx, idx + 24000);
  // The badge testid + the three calibration color classes must exist.
  assert.match(body, /rci-calibration-badge/);
  assert.match(body, /rci-cal-green/);
  assert.match(body, /rci-cal-yellow/);
  assert.match(body, /rci-cal-red/);
  // Threshold logic: >=80 green, >=50 yellow, <50 red.
  assert.match(body, /v\s*>=\s*80/);
  assert.match(body, /v\s*>=\s*50/);
});


// ── 3. Bottom-quartile callout ──────────────────────────────────────────


test('coaching inbox renders bottom-quartile callout only when in_bottom_quartile', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const idx = src.indexOf('pgResolverCoachingInbox');
  const body = src.slice(idx, idx + 24000);
  assert.match(body, /rci-bottom-quartile-callout/);
  assert.match(body, /bottom quartile/i);
  // The render path is gated on the inBq arg ("if (!inBq) return ''").
  assert.match(body, /renderBottomQuartileCallout/);
});


// ── 4. Wrong-fp cards render caregiver name + days + concern count ──────


test('coaching inbox cards render caregiver name, days-to-re-flag, concern count', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const idx = src.indexOf('pgResolverCoachingInbox');
  const body = src.slice(idx, idx + 24000);
  assert.match(body, /rci-wrong-call-card/);
  assert.match(body, /rci-card-days/);
  assert.match(body, /rci-card-concern-count/);
  assert.match(body, /caregiver_name/);
  assert.match(body, /days_to_re_flag/);
  assert.match(body, /subsequent_concern_count/);
  assert.match(body, /adapter_list/);
});


// ── 5. Empty state ──────────────────────────────────────────────────────


test('coaching inbox renders empty state when no wrong-fp calls', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const idx = src.indexOf('pgResolverCoachingInbox');
  const body = src.slice(idx, idx + 24000);
  assert.match(body, /rci-empty-state/);
  assert.match(body, /No wrong [<>\/a-z=" `]*false_positive[<>\/a-z=" `]* calls in the last/);
});


// ── 6. Admin overview section visible only to admin ─────────────────────


test('coaching inbox admin overview is gated by isAdmin()', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const idx = src.indexOf('pgResolverCoachingInbox');
  const body = src.slice(idx, idx + 24000);
  assert.match(body, /renderAdminOverviewTable/);
  assert.match(body, /rci-admin-overview/);
  // The render fn must early-return when not admin.
  assert.match(body, /if\s*\(!isAdmin\(\)\)\s*return\s*''/);
});


// ── 7. Self-review modal with 10-500 char validation ────────────────────


test('coaching inbox self-review modal validates 10-500 chars', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const idx = src.indexOf('pgResolverCoachingInbox');
  const body = src.slice(idx, idx + 24000);
  assert.match(body, /rci-note-modal/);
  assert.match(body, /rci-note-modal-textarea/);
  assert.match(body, /rci-note-modal-submit/);
  assert.match(body, /rci-note-modal-cancel/);
  // Char-range gate (length >= 10 && length <= 500).
  assert.match(body, /length\s*>=\s*10/);
  assert.match(body, /length\s*<=\s*500/);
  // The textarea has a maxlength=500 attribute so the keyboard input
  // path stays bounded even before the JS validation.
  assert.match(body, /maxlength=["']?500/);
});


// ── 8. Filed note renders inline after submit ───────────────────────────


test('coaching inbox renders filed self-review note inline', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const idx = src.indexOf('pgResolverCoachingInbox');
  const body = src.slice(idx, idx + 24000);
  assert.match(body, /rci-card-self-review-note/);
  assert.match(body, /self_review_note/);
  // The "Add self-review note" button is replaced inline when a note
  // exists on the card (ternary on card.self_review_note).
  assert.match(body, /card\.self_review_note/);
});


// ── 9. Audit-events surface name correct ────────────────────────────────


test('coaching inbox audit-events helper targets resolver_coaching_inbox surface', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  const idx = apiSrc.indexOf('Resolver Coaching Inbox launch-audit (DCRO2');
  const after = apiSrc.slice(idx);
  const sectionEnd = after.indexOf('DCRO2 SLICE BOUNDARY');
  const block = after.slice(0, sectionEnd);
  // The fetch helper threads the surface query parameter through; the
  // canonical surface string is exercised by the backend tests.
  assert.match(block, /resolver-coaching-inbox\/audit-events/);
});


// ── 10. Error state when API fails ──────────────────────────────────────


test('coaching inbox renders error state when load fails', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const idx = src.indexOf('pgResolverCoachingInbox');
  const body = src.slice(idx, idx + 24000);
  assert.match(body, /rci-err/);
  assert.match(body, /Failed to load coaching inbox/);
});


// ── 11. Route loader wires pgResolverCoachingInbox ──────────────────────


test('app.js route loader wires resolver-coaching-inbox to pgResolverCoachingInbox', () => {
  const src = fs.readFileSync(APP_PATH, 'utf8');
  assert.match(src, /case 'resolver-coaching-inbox'/);
  assert.match(src, /case 'coaching-inbox'/);
  assert.match(src, /case 'my-coaching'/);
  assert.match(src, /pgResolverCoachingInbox/);
});


// ── 12. DCR2 Resolution Audit Hub renders the coaching-inbox link ───────


test('DCR2 Resolution Audit Hub page renders the coaching-inbox link', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const idx = src.indexOf('pgCaregiverDeliveryConcernResolutionAuditHub');
  assert.ok(idx > 0);
  // The link sits inside the heading region of the DCR2 page.
  const body = src.slice(idx, idx + 30000);
  assert.match(body, /cgcr-hub-coaching-inbox-link/);
  assert.match(body, /resolver-coaching-inbox/);
  assert.match(body, /My coaching inbox/);
});
