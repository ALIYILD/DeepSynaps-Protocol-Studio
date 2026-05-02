// Logic-only tests for the Caregiver Delivery Concern Resolution
// launch audit (DCR1, 2026-05-02).
//
// Closes the loop opened by #390 (Caregiver Delivery Concern Aggregator).
// This suite pins the page-level + helper-level surface against the
// source files:
//
//   - api.js exposes caregiverDeliveryConcernResolutionList /
//     caregiverDeliveryConcernResolutionResolve /
//     caregiverDeliveryConcernResolutionAuditEvents /
//     postCaregiverDeliveryConcernResolutionAuditEvent under
//     /api/v1/caregiver-delivery-concern-resolution/.
//   - pgCareTeamCoverage's "Caregiver channels" tab gains a
//     "Resolution" sub-section with an "Open flags" list (admin/reviewer-
//     only "Mark as resolved" button), a modal asking for resolution
//     reason + note, and a "Recently resolved (last 7 days)" list.
//
// Run: node --test src/caregiver-delivery-concern-resolution-launch-audit.test.js
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


test('api.js exposes caregiverDeliveryConcernResolutionList helper', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(apiSrc, /caregiverDeliveryConcernResolutionList\s*:/);
});


test('api.js exposes caregiverDeliveryConcernResolutionResolve helper', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(apiSrc, /caregiverDeliveryConcernResolutionResolve\s*:/);
});


test('api.js exposes caregiverDeliveryConcernResolutionAuditEvents helper', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(apiSrc, /caregiverDeliveryConcernResolutionAuditEvents\s*:/);
});


test('api.js exposes postCaregiverDeliveryConcernResolutionAuditEvent helper', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(apiSrc, /postCaregiverDeliveryConcernResolutionAuditEvent\s*:/);
});


test('caregiver-delivery-concern-resolution helpers route under /api/v1/caregiver-delivery-concern-resolution/', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  const idx = apiSrc.indexOf(
    'Caregiver Delivery Concern Resolution launch-audit',
  );
  assert.ok(idx > 0, 'launch-audit header missing in api.js');
  const after = apiSrc.slice(idx);
  const sectionEnd = after.indexOf('};');
  const block = sectionEnd > 0 ? after.slice(0, sectionEnd) : after;
  const urls = block.match(/['"`]\/api\/v1\/[^'"`]+/g) || [];
  assert.ok(urls.length >= 3, `expected >=3 URLs in the block, got ${urls.length}`);
  for (const u of urls) {
    assert.match(u, /\/api\/v1\/caregiver-delivery-concern-resolution/);
  }
});


test('caregiverDeliveryConcernResolutionResolve uses HTTP POST method', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  const idx = apiSrc.indexOf('caregiverDeliveryConcernResolutionResolve');
  assert.ok(idx > 0, 'caregiverDeliveryConcernResolutionResolve not found');
  const slice = apiSrc.slice(idx, idx + 360);
  assert.match(slice, /method:\s*['"`]POST['"`]/);
});


// ── 2. pgCareTeamCoverage panel + modal wiring ────────────────────────────


test('pgCareTeamCoverage loadAll requests resolution open + resolved lists', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const fn = src.split('async function loadAll')[1] || '';
  assert.match(fn, /caregiverDeliveryConcernResolutionList\s*\(\s*\{\s*status:\s*['"]open['"]/);
  assert.match(fn, /caregiverDeliveryConcernResolutionList\s*\(\s*\{\s*status:\s*['"]resolved['"]/);
});


test('pgCareTeamCoverage renders renderDeliveryConcernResolutionPanel body', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  assert.match(src, /function renderDeliveryConcernResolutionPanel/);
  assert.match(src, /ctc-cgcr-panel/);
});


test('pgCareTeamCoverage Resolution panel renders open + resolved subsections', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const fn = src.split('function renderDeliveryConcernResolutionPanel')[1] || '';
  assert.match(fn, /ctc-cgcr-open-section/);
  assert.match(fn, /ctc-cgcr-resolved-section/);
  assert.match(fn, /Open flags/);
  assert.match(fn, /Recently resolved/);
});


test('pgCareTeamCoverage Mark as resolved button gated to admin/reviewer roles', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const fn = src.split('function renderDeliveryConcernResolutionPanel')[1] || '';
  // canResolve guard checks for admin/supervisor/regulator/reviewer/clinician
  // (clinician outranks reviewer in the canonical hierarchy so they
  // also clear the gate). Patient/technician/guest do NOT.
  assert.match(fn, /canResolve\s*=/);
  assert.match(fn, /['"]admin['"]/);
  assert.match(fn, /['"]reviewer['"]/);
  assert.match(fn, /Mark as resolved/);
  assert.match(fn, /ctc-cgcr-resolve-btn/);
  // Negative branch — non-resolvers see "Reviewer / admin only" hint.
  assert.match(fn, /Reviewer \/ admin only/);
});


test('pgCareTeamCoverage Resolution modal scaffolds reason dropdown + note textarea', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const fn = src.split('function renderDeliveryConcernResolutionPanel')[1] || '';
  assert.match(fn, /ctc-cgcr-modal-reason/);
  assert.match(fn, /ctc-cgcr-modal-note/);
  // All four canonical reason codes must be present.
  assert.match(fn, /value="concerns_addressed"/);
  assert.match(fn, /value="false_positive"/);
  assert.match(fn, /value="caregiver_replaced"/);
  assert.match(fn, /value="other"/);
  // Textarea must enforce maxlength 500 and require >=10 chars (the
  // submit button starts disabled, which is asserted in another test).
  assert.match(fn, /maxlength="500"/);
});


test('pgCareTeamCoverage modal submit starts disabled and validates note length', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const fn = src.split('function renderDeliveryConcernResolutionPanel')[1] || '';
  // Submit button must be disabled at render time (note < 10 chars
  // initially because the textarea is empty).
  assert.match(fn, /id="ctc-cgcr-modal-submit"[^>]*disabled/);
  // The validate-on-input handler enforces the 10..500 range.
  const validateBlock = src.split('window._caregiverDeliveryConcernResolutionValidateNote = ')[1] || '';
  assert.match(validateBlock, /len\s*>=\s*10/);
  assert.match(validateBlock, /len\s*<=\s*500/);
});


test('pgCareTeamCoverage modal submit calls /resolve with body shape', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const fn = src.split('window._caregiverDeliveryConcernResolutionSubmit = ')[1] || '';
  assert.match(fn, /api\.caregiverDeliveryConcernResolutionResolve\s*\(/);
  assert.match(fn, /caregiver_user_id:/);
  assert.match(fn, /resolution_reason:/);
  assert.match(fn, /resolution_note:/);
});


test('pgCareTeamCoverage emits resolution view audit ping on tab mount', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const fn = src.split('function renderCaregiverChannelsTab')[1] || '';
  assert.match(fn, /postCaregiverDeliveryConcernResolutionAuditEvent/);
});


test('pgCareTeamCoverage caregiver channels tab includes resolution panel', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const fn = src.split('function renderCaregiverChannelsTab')[1] || '';
  assert.match(fn, /var\s+concernResolutionPanel\s*=\s*renderDeliveryConcernResolutionPanel/);
  assert.match(fn, /concernResolutionPanel\s*\+/);
});


test('pgCareTeamCoverage resolved row renders resolver + reason + timestamp', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const fn = src.split('function renderDeliveryConcernResolutionPanel')[1] || '';
  // The resolved-list mapping pulls resolution_reason / resolver_user_id /
  // resolved_at out of the API response and renders them in the table.
  assert.match(fn, /resolution_reason/);
  assert.match(fn, /resolver_user_id/);
  assert.match(fn, /resolved_at/);
  assert.match(fn, /ctc-cgcr-resolved-row/);
});


test('pgCareTeamCoverage Resolution panel empty state renders when no flags', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const fn = src.split('function renderDeliveryConcernResolutionPanel')[1] || '';
  // The empty-state copy is exactly "No flagged caregivers." per spec.
  assert.match(fn, /ctc-cgcr-empty/);
  assert.match(fn, /No flagged caregivers\./);
});


test('pgCareTeamCoverage modal handles 409 already_resolved error inline', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  const fn = src.split('window._caregiverDeliveryConcernResolutionSubmit = ')[1] || '';
  // The submit handler must surface a 409 / already_resolved response
  // inline rather than crashing the modal.
  assert.match(fn, /already_resolved|already resolved/i);
  assert.match(fn, /409/);
});


test('pgCareTeamCoverage audit-events surface name is canonical', () => {
  // The page-level + worker-level surface name must match the backend
  // KNOWN_SURFACES + qeeg-analysis whitelist value exactly so the
  // audit transcript joins cleanly.
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  // The path string contains the canonical surface slug.
  assert.match(apiSrc, /caregiver-delivery-concern-resolution\/audit-events/);
});


test('pgCareTeamCoverage resolution modal opens via _caregiverDeliveryConcernResolutionOpenModal', () => {
  const src = fs.readFileSync(PAGES_KNOWLEDGE_PATH, 'utf8');
  // Open button onclick wires to the global handler.
  assert.match(src, /window\._caregiverDeliveryConcernResolutionOpenModal/);
  // Handler emits a resolve_modal_opened audit ping for the regulator.
  const fn = src.split('window._caregiverDeliveryConcernResolutionOpenModal = ')[1] || '';
  assert.match(fn, /resolve_modal_opened/);
});
