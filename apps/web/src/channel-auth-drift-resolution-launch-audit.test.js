// Logic-only tests for the Channel Auth Drift Resolution Tracker
// launch audit (CSAHP2, 2026-05-02).
//
// Closes the proactive-credential-monitoring loop opened by CSAHP1
// (#417). This suite pins the page-level + helper-level surface
// against the source files:
//
//   - api.js exposes markAuthDriftRotated / fetchAuthDriftList /
//     fetchAuthDriftResolutionAuditEvents under
//     /api/v1/channel-auth-drift-resolution/.
//   - pgCoachingDigestDeliveryFailureDrilldown (DCRO5) renders the
//     CSAHP2 sub-tables (open / pending / resolved) with admin-gated
//     "Mark as rotated" CTA + a modal asking for rotation_method
//     (dropdown) + rotation_note (textarea, 10–500 chars).
//
// Run: node --test src/channel-auth-drift-resolution-launch-audit.test.js
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


test('api.js exposes markAuthDriftRotated helper', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(apiSrc, /markAuthDriftRotated\s*:/);
});


test('api.js exposes fetchAuthDriftList helper', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(apiSrc, /fetchAuthDriftList\s*:/);
});


test('api.js exposes fetchAuthDriftResolutionAuditEvents helper', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(apiSrc, /fetchAuthDriftResolutionAuditEvents\s*:/);
});


test('CSAHP2 helpers route under /api/v1/channel-auth-drift-resolution/', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  const idx = apiSrc.indexOf('CSAHP2 Auth Drift Resolution launch-audit');
  assert.ok(idx > 0, 'CSAHP2 launch-audit header missing in api.js');
  const after = apiSrc.slice(idx);
  // Walk to the slice-boundary sentinel to bound the section.
  const sentinelIdx = after.indexOf('━━ CSAHP2 SLICE BOUNDARY ━━');
  assert.ok(sentinelIdx > 0, 'CSAHP2 slice boundary sentinel missing');
  const block = after.slice(0, sentinelIdx);
  const urls = block.match(/['"]\/api\/v1\/[^'"]+/g) || [];
  assert.ok(urls.length >= 3, `expected >=3 URLs in the CSAHP2 block, got ${urls.length}`);
  for (const u of urls) {
    assert.match(u, /\/api\/v1\/channel-auth-drift-resolution/);
  }
});


test('markAuthDriftRotated uses HTTP POST method', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  const idx = apiSrc.indexOf('markAuthDriftRotated');
  assert.ok(idx > 0, 'markAuthDriftRotated not found');
  const slice = apiSrc.slice(idx, idx + 360);
  assert.match(slice, /method:\s*['"`]POST['"`]/);
});


test('CSAHP2 helpers are placed BEFORE CSAHP1 in api.js', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  const csahp2 = apiSrc.indexOf('CSAHP2 Auth Drift Resolution launch-audit');
  const csahp1 = apiSrc.indexOf('CSAHP1 Channel Auth Health Probe launch-audit');
  assert.ok(csahp2 > 0 && csahp1 > 0, 'both CSAHP1 + CSAHP2 sections must exist');
  assert.ok(csahp2 < csahp1, 'CSAHP2 section must precede CSAHP1 per slice-boundary plan');
});


// ── 2. Auth-drift sub-tables structure ────────────────────────────────────


test('DCRO5 renders renderAuthDriftSection function', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  assert.match(src, /function renderAuthDriftSection/);
  assert.match(src, /csahp2-auth-drift-section/);
});


test('DCRO5 renders per-channel open-drifts sub-table', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  assert.match(src, /function renderAuthDriftOpenTable/);
  assert.match(src, /csahp2-open-table|csahp2-open-empty/);
  assert.match(src, /csahp2-open-row/);
});


test('DCRO5 Mark as rotated button is admin-gated', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  // The open-table render uses _csahp1IsAdmin (re-used) to gate the
  // Mark as rotated button.
  const fn = src.split('function renderAuthDriftOpenTable')[1] || '';
  assert.match(fn, /_csahp1IsAdmin/);
  assert.match(fn, /csahp2-mark-rotated-btn/);
  assert.match(fn, /Mark as rotated/);
});


test('DCRO5 Mark modal has rotation_method dropdown + rotation_note textarea', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const fn = src.split('window._csahp2OpenMarkModal = ')[1] || '';
  assert.match(fn, /csahp2-modal-method/);
  assert.match(fn, /<select/);
  assert.match(fn, /<option value="manual">/);
  assert.match(fn, /<option value="automated_rotation">/);
  assert.match(fn, /<option value="key_revoked">/);
  assert.match(fn, /csahp2-modal-note/);
  assert.match(fn, /<textarea/);
});


test('DCRO5 Mark modal submit is disabled until note >= 10 chars', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  // Submit button starts disabled.
  const modalFn = src.split('window._csahp2OpenMarkModal = ')[1] || '';
  assert.match(modalFn, /id="csahp2-modal-submit"[^>]*disabled/);
  // _csahp2OnNoteInput enables when length >= 10.
  const onInput = src.split('window._csahp2OnNoteInput = ')[1] || '';
  assert.match(onInput, /len\s*>=\s*10/);
  assert.match(onInput, /len\s*<=\s*500/);
});


test('DCRO5 Mark submit handler POSTs the correct body shape', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const fn = src.split('window._csahp2SubmitMark = ')[1] || '';
  assert.match(fn, /api\.markAuthDriftRotated\s*\(/);
  assert.match(fn, /auth_drift_audit_id:/);
  assert.match(fn, /rotation_method:/);
  assert.match(fn, /rotation_note:/);
});


test('DCRO5 renders pending-confirmation sub-table', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  assert.match(src, /function renderAuthDriftPendingTable/);
  assert.match(src, /csahp2-pending-table|csahp2-pending-row/);
  assert.match(src, /Awaiting probe|Pending confirmation/);
});


test('DCRO5 renders confirmed-rotated sub-table', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  assert.match(src, /function renderAuthDriftResolvedTable/);
  assert.match(src, /csahp2-resolved-table|csahp2-resolved-row/);
  assert.match(src, /Confirmed rotated/);
});


// ── 3. Honest disclaimer ─────────────────────────────────────────────────


test('CSAHP2 honest disclaimer mentions next probe + manual run option', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const fn = src.split('function renderAuthDriftSection')[1] || '';
  assert.match(fn, /csahp2-honest-disclaimer/);
  assert.match(fn, /Confirmation requires the next health probe/);
  assert.match(fn, /Probe runs every 12h or you can run it manually/);
});


// ── 4. Page wiring ────────────────────────────────────────────────────────


test('DCRO5 loadAll requests fetchAuthDriftList three times (open/pending/resolved)', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const dcro5Idx = src.indexOf('pgCoachingDigestDeliveryFailureDrilldown');
  assert.ok(dcro5Idx > 0, 'pgCoachingDigestDeliveryFailureDrilldown not found');
  const after = src.slice(dcro5Idx);
  const loadAllIdx = after.indexOf('async function loadAll');
  assert.ok(loadAllIdx > 0, 'loadAll not found inside DCRO5 page');
  const fn = after.slice(loadAllIdx, loadAllIdx + 4500);
  assert.match(fn, /fetchAuthDriftList[\s\S]*status:\s*['"]open['"]/);
  assert.match(fn, /fetchAuthDriftList[\s\S]*status:\s*['"]pending_confirmation['"]/);
  assert.match(fn, /fetchAuthDriftList[\s\S]*status:\s*['"]resolved['"]/);
});


test('DCRO5 render injects auth-drift section under csahp2-section-auth-drift heading', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  assert.match(src, /csahp2-section-auth-drift/);
  assert.match(src, /renderAuthDriftSection\s*\(/);
});


test('DCRO5 modal close handler removes the modal node', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const fn = src.split('window._csahp2CloseModal = ')[1] || '';
  assert.match(fn, /getElementById\(['"]csahp2-modal['"]\)/);
  assert.match(fn, /removeChild|remove\(\)/);
});


// ── 5. Audit-events surface name ──────────────────────────────────────────


test('CSAHP2 audit-events helper carries surface=channel_auth_drift_resolution', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  const idx = apiSrc.indexOf('fetchAuthDriftResolutionAuditEvents');
  assert.ok(idx > 0, 'fetchAuthDriftResolutionAuditEvents not found');
  const slice = apiSrc.slice(idx, idx + 700);
  assert.match(slice, /\/api\/v1\/channel-auth-drift-resolution\/audit-events/);
});


// ── 6. Inline error state on submit failure ───────────────────────────────


test('CSAHP2 submit handler renders inline error on 409 (already rotated)', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const fn = src.split('window._csahp2SubmitMark = ')[1] || '';
  // Catches msg.indexOf('409') and writes window._csahp2InlineErr.
  assert.match(fn, /409/);
  assert.match(fn, /_csahp2InlineErr/);
  assert.match(fn, /Already rotated/);
});


test('CSAHP2 submit handler renders inline error on 500', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const fn = src.split('window._csahp2SubmitMark = ')[1] || '';
  assert.match(fn, /500/);
  assert.match(fn, /Server error/);
});
