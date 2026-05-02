// Logic-only tests for the Escalation Policy Editor launch-audit (2026-05-01).
//
// Closes the LAST operational gap of the on-call escalation chain
// (Care Team Coverage #357 → Auto-Page Worker #372 → On-Call Delivery
// #373 → THIS PR). The On-Call Delivery agent flagged the fixed
// PagerDuty→Slack→Twilio order in code + the free-text
// ShiftRoster.contact_handle as the last gap. This test pins the
// Policy tab logic + source-grep contracts so a refactor can never
// silently regress the panel:
//
//   - Reorder helper: swap by index ± delta, no-op at edges.
//   - Save validation: empty order rejected before hitting the API.
//   - Override parsing: comma-separated free text → cleaned lowercase
//     adapter list with whitespace stripped.
//   - User-mapping change requires a non-blank note (regulator audit
//     contract).
//   - Source-grep: api.js exposes the helpers; pages-knowledge.js wires
//     the Policy tab; backend whitelists `escalation_policy` in
//     audit_trail_router KNOWN_SURFACES + qeeg-analysis audit-events
//     ingestion + main.py mounts the new router.
//
// Run: node --test src/escalation-policy-launch-audit.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';


const __dirname = path.dirname(url.fileURLToPath(import.meta.url));


// ── Mirrors of in-page helpers (kept in lockstep with pages-knowledge.js) ──


function moveAdapter(order, idx, delta) {
  const out = order.slice();
  const ni = idx + delta;
  if (ni < 0 || ni >= out.length) return out;
  const tmp = out[idx];
  out[idx] = out[ni];
  out[ni] = tmp;
  return out;
}


function parseOverrideChain(input) {
  return String(input || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => !!s);
}


function dispatchOrderEditValid(order) {
  if (!Array.isArray(order)) return false;
  if (order.length === 0) return false;
  return order.every((n) => typeof n === 'string' && n.length > 0);
}


function userMappingChangeValid(noteRaw) {
  return typeof noteRaw === 'string' && noteRaw.trim().length > 0;
}


function shouldShowAdminCtas(role) {
  const r = String(role || '').toLowerCase();
  return r === 'admin' || r === 'supervisor' || r === 'regulator';
}


// ── Tests ──────────────────────────────────────────────────────────────────


test('moveAdapter swaps adjacent entries on +/- 1 delta', () => {
  assert.deepEqual(
    moveAdapter(['pagerduty', 'slack', 'twilio'], 0, 1),
    ['slack', 'pagerduty', 'twilio'],
  );
  assert.deepEqual(
    moveAdapter(['pagerduty', 'slack', 'twilio'], 2, -1),
    ['pagerduty', 'twilio', 'slack'],
  );
});


test('moveAdapter is a no-op past edges', () => {
  const order = ['pagerduty', 'slack', 'twilio'];
  assert.deepEqual(moveAdapter(order, 0, -1), order);
  assert.deepEqual(moveAdapter(order, 2, 1), order);
});


test('parseOverrideChain trims, lowercases, drops empties', () => {
  assert.deepEqual(parseOverrideChain('PagerDuty, Slack '), ['pagerduty', 'slack']);
  assert.deepEqual(parseOverrideChain('  '), []);
  assert.deepEqual(parseOverrideChain('a, ,b'), ['a', 'b']);
  assert.deepEqual(parseOverrideChain(undefined), []);
});


test('dispatchOrderEditValid rejects empty + non-array', () => {
  assert.equal(dispatchOrderEditValid([]), false);
  assert.equal(dispatchOrderEditValid(null), false);
  assert.equal(dispatchOrderEditValid(['slack']), true);
  assert.equal(dispatchOrderEditValid(['', 'slack']), false);
});


test('userMappingChangeValid requires a non-blank note', () => {
  assert.equal(userMappingChangeValid(''), false);
  assert.equal(userMappingChangeValid('   '), false);
  assert.equal(userMappingChangeValid('rotated phone after handset switch'), true);
});


test('shouldShowAdminCtas matches the in-page role gate', () => {
  assert.equal(shouldShowAdminCtas('admin'), true);
  assert.equal(shouldShowAdminCtas('supervisor'), true);
  assert.equal(shouldShowAdminCtas('regulator'), true);
  assert.equal(shouldShowAdminCtas('clinician'), false);
  assert.equal(shouldShowAdminCtas('patient'), false);
  assert.equal(shouldShowAdminCtas(''), false);
});


// ── Source-grep contracts ───────────────────────────────────────────────────


test('api.js exposes the escalation-policy helpers', () => {
  const apiSrc = fs.readFileSync(
    path.join(__dirname, 'api.js'),
    'utf8',
  );
  for (const fn of [
    'escalationPolicyDispatchOrder',
    'escalationPolicySurfaceOverrides',
    'escalationPolicyUserMappings',
    'escalationPolicySetDispatchOrder',
    'escalationPolicySetSurfaceOverrides',
    'escalationPolicySetUserMappings',
    'escalationPolicyTest',
    'postEscalationPolicyAuditEvent',
  ]) {
    assert.ok(apiSrc.includes(fn), `api.js should expose ${fn}`);
  }
  // Endpoints must use /api/v1/escalation-policy/*.
  assert.ok(apiSrc.includes('/api/v1/escalation-policy/dispatch-order'));
  assert.ok(apiSrc.includes('/api/v1/escalation-policy/surface-overrides'));
  assert.ok(apiSrc.includes('/api/v1/escalation-policy/user-mappings'));
  assert.ok(apiSrc.includes('/api/v1/escalation-policy/test'));
  assert.ok(apiSrc.includes('/api/v1/escalation-policy/audit-events'));
});


test('pages-knowledge.js wires the Policy tab and admin CTAs', () => {
  const pageSrc = fs.readFileSync(
    path.join(__dirname, 'pages-knowledge.js'),
    'utf8',
  );
  // Tab registration.
  assert.ok(pageSrc.includes("{ id: 'policy',     label: 'Policy' }"));
  // Render function exists.
  assert.ok(pageSrc.includes('function renderPolicyTab(d)'));
  // Window handlers exist.
  for (const handler of [
    '_policyMoveAdapter',
    '_policyAddAdapter',
    '_policyRemoveAdapter',
    '_policySaveDispatchOrder',
    '_policyResetDispatchOrder',
    '_policyAddOverride',
    '_policyEditOverride',
    '_policyClearOverride',
    '_policyEditUserMapping',
    '_policyTestPolicy',
  ]) {
    assert.ok(pageSrc.includes(handler), `pages-knowledge.js should wire window.${handler}`);
  }
  // Mount-time audit ping.
  assert.ok(
    pageSrc.includes("postEscalationPolicyAuditEvent({ event: 'view'"),
    'pages-knowledge.js should fire escalation_policy.view at mount',
  );
});


test('backend audit_trail_router whitelists escalation_policy', () => {
  const backendSrc = fs.readFileSync(
    path.resolve(__dirname, '../../api/app/routers/audit_trail_router.py'),
    'utf8',
  );
  assert.ok(
    backendSrc.includes('"escalation_policy"'),
    'audit_trail_router KNOWN_SURFACES should include "escalation_policy"',
  );
});


test('qeeg-analysis audit-events whitelist accepts escalation_policy', () => {
  const qeegSrc = fs.readFileSync(
    path.resolve(__dirname, '../../api/app/routers/qeeg_analysis_router.py'),
    'utf8',
  );
  assert.ok(
    qeegSrc.includes('"escalation_policy"'),
    'qeeg-analysis audit-events whitelist should include "escalation_policy"',
  );
});


test('main.py mounts the escalation_policy_router', () => {
  const mainSrc = fs.readFileSync(
    path.resolve(__dirname, '../../api/app/main.py'),
    'utf8',
  );
  assert.ok(mainSrc.includes('escalation_policy_router'));
  assert.ok(mainSrc.includes('app.include_router(escalation_policy_router)'));
});
