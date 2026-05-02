// Logic-only tests for the Auth Drift Rotation Policy Advisor
// launch-audit (CSAHP4, 2026-05-02).
//
// Read-only advisor surface that consumes CSAHP3's per-channel
// re-flag-rate signals and emits heuristic recommendation cards
// (REFLAG_HIGH / MANUAL_REFLAG / AUTH_DOMINANT). Mirrors the DCRO5 /
// CSAHP3 read-only advisor pattern.
//
// Surface contract pinned by this suite:
//   - api.js exposes fetchRotationPolicyAdvice,
//     fetchRotationPolicyAdvisorAuditEvents, and
//     postRotationPolicyAdvisorAuditEvent under
//     /api/v1/auth-drift-rotation-policy-advisor/.
//   - pages-knowledge.js renders the advice section ABOVE the
//     rotation funnel inside pgChannelAuthDriftResolutionAuditHub.
//   - Cards render severity chip (red=high, yellow=medium), channel
//     chip, title, body, supporting_metrics as small badges.
//   - Empty state surfaces "No rotation policy advice for this
//     window — keep it up." copy.
//   - Disclaimer text "Advice is heuristic" renders below the section.
//
// Run: node --test src/auth-drift-rotation-policy-advisor-launch-audit.test.js
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


test('api.js exposes fetchRotationPolicyAdvice helper', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(apiSrc, /fetchRotationPolicyAdvice\s*:/);
});


test('api.js exposes fetchRotationPolicyAdvisorAuditEvents helper', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(apiSrc, /fetchRotationPolicyAdvisorAuditEvents\s*:/);
});


test('CSAHP4 helpers route under /api/v1/auth-drift-rotation-policy-advisor/', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  // Use the unique CSAHP4 header anchor + slice-boundary sentinel to
  // bound the section so we don't bleed into CSAHP3.
  const idx = apiSrc.indexOf('CSAHP4 Rotation Policy Advisor launch-audit');
  assert.ok(idx > 0, 'CSAHP4 launch-audit header missing in api.js');
  const after = apiSrc.slice(idx);
  const sectionEnd = after.indexOf('// end CSAHP4 helpers');
  assert.ok(sectionEnd > 0, 'CSAHP4 sentinel "// end CSAHP4 helpers" missing');
  const block = after.slice(0, sectionEnd);
  const urls = block.match(/['"`]\/api\/v1\/[^'"`]+/g) || [];
  assert.ok(urls.length >= 2, `expected >=2 URLs in the CSAHP4 block, got ${urls.length}`);
  for (const u of urls) {
    assert.match(u, /\/api\/v1\/auth-drift-rotation-policy-advisor/);
  }
});


test('CSAHP4 slice boundary sentinel present', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(apiSrc, /━━ CSAHP4 SLICE BOUNDARY ━━/);
});


test('CSAHP4 helpers placed BEFORE CSAHP3 helpers in api.js', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  const csahp4Idx = apiSrc.indexOf('CSAHP4 Rotation Policy Advisor');
  const csahp3Idx = apiSrc.indexOf(
    'CSAHP3 Auth Drift Resolution Audit Hub'
  );
  assert.ok(csahp4Idx > 0, 'CSAHP4 header missing');
  assert.ok(csahp3Idx > 0, 'CSAHP3 header missing');
  assert.ok(
    csahp4Idx < csahp3Idx,
    'CSAHP4 helpers should be placed BEFORE CSAHP3 helpers'
  );
});


// ── 2. Page renders advice section ────────────────────────────────────────


test('hub page renders the rotation policy advice section', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const idx = src.indexOf('pgChannelAuthDriftResolutionAuditHub');
  assert.ok(idx > 0);
  const body = src.slice(idx, idx + 50000);
  assert.match(body, /csahp4-section-advice/);
  assert.match(body, /Rotation policy advice/);
  assert.match(body, /renderRotationPolicyAdvice/);
});


// ── 3. Empty state copy ────────────────────────────────────────────────────


test('advice section renders empty state copy when total_advice_cards = 0', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const idx = src.indexOf('pgChannelAuthDriftResolutionAuditHub');
  const body = src.slice(idx, idx + 50000);
  assert.match(body, /csahp4-empty/);
  assert.match(
    body,
    /No rotation policy advice for this window — keep it up\./
  );
});


// ── 4. Severity chip color-coded ──────────────────────────────────────────


test('severity chip color-codes high (red) and medium (yellow)', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const idx = src.indexOf('pgChannelAuthDriftResolutionAuditHub');
  const body = src.slice(idx, idx + 50000);
  assert.match(body, /csahp4-severity-chip/);
  // Red and yellow swatches in the same helper.
  assert.match(body, /#fee2e2/);  // red bg
  assert.match(body, /#fef3c7/);  // yellow bg
  assert.match(body, /_csahp4SeverityChip/);
});


// ── 5. Supporting metrics render as badges ────────────────────────────────


test('supporting metrics render as small badges (re-flag rate, manual share, etc.)', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const idx = src.indexOf('pgChannelAuthDriftResolutionAuditHub');
  const body = src.slice(idx, idx + 50000);
  assert.match(body, /csahp4-metric-badge/);
  assert.match(body, /Re-flag rate/);
  assert.match(body, /Manual share/);
  assert.match(body, /Auth-class share/);
  assert.match(body, /_csahp4MetricBadges/);
});


// ── 6. Section appears ABOVE rotation funnel ──────────────────────────────


test('advice section appears ABOVE the rotation funnel section', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const idx = src.indexOf('pgChannelAuthDriftResolutionAuditHub');
  const body = src.slice(idx, idx + 50000);
  // In the main render() for the non-empty path, the advice section
  // must be invoked before the funnel section heading.
  const adviceIdx = body.indexOf('renderRotationPolicyAdvice(state.advice)');
  const funnelIdx = body.indexOf('csahp3-section-funnel');
  assert.ok(adviceIdx > 0, 'renderRotationPolicyAdvice call missing');
  assert.ok(funnelIdx > 0, 'csahp3-section-funnel anchor missing');
  // There may be multiple invocations; we only need one BEFORE the
  // funnel anchor in the main render path.
  assert.ok(
    adviceIdx < funnelIdx,
    'Rotation policy advice must render BEFORE rotation funnel'
  );
});


// ── 7. Cards render channel chip + title + body ───────────────────────────


test('advice cards render channel chip, title, and body', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const idx = src.indexOf('pgChannelAuthDriftResolutionAuditHub');
  const body = src.slice(idx, idx + 50000);
  assert.match(body, /csahp4-advice-card/);
  assert.match(body, /csahp4-channel-chip/);
  assert.match(body, /csahp4-advice-title/);
  assert.match(body, /csahp4-advice-body/);
});


// ── 8. Audit-events surface name correct ──────────────────────────────────


test('CSAHP4 helpers use canonical surface URL slug', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(
    apiSrc,
    /\/api\/v1\/auth-drift-rotation-policy-advisor\/advice/
  );
  assert.match(
    apiSrc,
    /\/api\/v1\/auth-drift-rotation-policy-advisor\/audit-events/
  );
});


// ── 9. Honest disclaimer below section ────────────────────────────────────


test('honest disclaimer renders below the section', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const idx = src.indexOf('pgChannelAuthDriftResolutionAuditHub');
  const body = src.slice(idx, idx + 50000);
  assert.match(body, /csahp4-disclaimer/);
  assert.match(body, /Advice is heuristic/);
  assert.match(body, /Investigate before acting\./);
});


// ── 10. Window selector triggers re-fetch (advice loads with summary) ─────


test('loadAll fetches rotation policy advice alongside summary', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const idx = src.indexOf('pgChannelAuthDriftResolutionAuditHub');
  const body = src.slice(idx, idx + 50000);
  assert.match(body, /api\.fetchRotationPolicyAdvice/);
  // Window selector calls render() which calls loadAll() which calls
  // fetchRotationPolicyAdvice, so a window change re-fetches the advice.
  assert.match(body, /window\._csahp3SetWindow\s*=/);
  assert.match(body, /state\.advice\s*=/);
});


// ── 11. Error state when API returns 500 ──────────────────────────────────


test('error state from API surfaces in the existing csahp3-err block', () => {
  // CSAHP4 advice fetch is wrapped in the same try/catch as the other
  // CSAHP3 fetches, so a 500 surfaces via the existing csahp3-err
  // notice. We assert that the err notice exists in the same
  // function and that fetchRotationPolicyAdvice is inside the try.
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const idx = src.indexOf('pgChannelAuthDriftResolutionAuditHub');
  const body = src.slice(idx, idx + 50000);
  assert.match(body, /csahp3-err/);
  // The advice fetch happens inside loadAll() which is wrapped in
  // try/catch.
  const loadAllIdx = body.indexOf('async function loadAll()');
  const tryIdx = body.indexOf('try {', loadAllIdx);
  const catchIdx = body.indexOf('} catch', tryIdx);
  const adviceIdx = body.indexOf('fetchRotationPolicyAdvice', tryIdx);
  assert.ok(loadAllIdx > 0);
  assert.ok(tryIdx > loadAllIdx);
  assert.ok(catchIdx > tryIdx);
  assert.ok(
    adviceIdx > tryIdx && adviceIdx < catchIdx,
    'fetchRotationPolicyAdvice must be inside loadAll try/catch'
  );
});


// ── 12. Cards sorted by severity in DOM ───────────────────────────────────


test('cards render in API-sorted order (no client-side re-sort that breaks server order)', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const idx = src.indexOf('pgChannelAuthDriftResolutionAuditHub');
  const body = src.slice(idx, idx + 50000);
  // The renderer maps cards.map(...) directly without sorting client
  // side — server already sorts severity-desc then channel-asc.
  assert.match(body, /cards\.map\(/);
  // Sanity: no .sort\( inside the renderRotationPolicyAdvice helper
  // (which would override the API ordering).
  const renderStart = body.indexOf('function renderRotationPolicyAdvice');
  const renderEnd = body.indexOf('function renderWorkerDisclaimer');
  assert.ok(renderStart > 0);
  assert.ok(renderEnd > renderStart);
  const renderBody = body.slice(renderStart, renderEnd);
  assert.ok(
    !/\.sort\(/.test(renderBody),
    'renderRotationPolicyAdvice should not re-sort cards client-side'
  );
});
