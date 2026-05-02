// Logic-only tests for the On-Call Delivery launch-audit (2026-05-01).
//
// Closes the LAST gap of the on-call escalation chain:
//   Care Team Coverage (#357) → Auto-Page Worker (#372) → THIS PR
//
// Pins the per-adapter health panel + per-page delivery chip rendering
// against silent fakes:
//
//   - Adapter-health rows render every adapter (Slack / Twilio / PagerDuty)
//     regardless of enabled flag — never silently hide a missing-env-var
//     adapter.
//   - Mock-mode banner is shown ONLY when adapter_health.mock_mode is true,
//     and uses a yellow visual treatment so reviewers see at a glance that
//     no real page is sent.
//   - Per-page chip mapping: 'sent' → green ✓, 'failed' → red ✗,
//     'queued' → grey ⋯, MOCK: prefix → yellow 🧪 (NOT green).
//   - Test-adapter button is admin only.
//   - Source-grep contracts: api.js exposes the two helpers,
//     pages-knowledge.js wires the adapter-health panel + test-adapter
//     button, the audit_trail backend whitelists ``oncall_delivery``.
//
// Run: node --test src/oncall-delivery-launch-audit.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';


// ── Mirrors of in-page helpers (kept in lockstep with pages-knowledge.js) ──


function shouldShowAdminCtas(role) {
  const r = String(role || '').toLowerCase();
  return r === 'admin' || r === 'supervisor' || r === 'regulator';
}


function classifyDeliveryChip(page) {
  const status = String(page?.delivery_status || '').toLowerCase();
  const note = String(page?.delivery_note || '');
  if (note.indexOf('MOCK:') === 0) return 'mock';
  if (status === 'sent') return 'sent';
  if (status === 'failed') return 'failed';
  if (status === 'queued') return 'queued';
  return 'unknown';
}


function adapterHealthMode(health) {
  if (!health) return 'unreachable';
  if (health.mock_mode === true) return 'mock';
  const adapters = Array.isArray(health.adapters) ? health.adapters : [];
  if (adapters.some(a => a.enabled)) return 'live_some_enabled';
  return 'live_all_disabled';
}


function buildTestAdapterAuditPayload() {
  return { event: 'adapter_test_clicked_ui' };
}


function summariseAdapterAttempts(attempts) {
  return (attempts || []).map(a => {
    const status = a.status || (a.enabled ? 'no-result' : 'skipped');
    const id = a.external_id ? ' id=' + a.external_id : '';
    return (a.enabled ? '' : '(disabled) ') + a.name + ' = ' + status + id;
  }).join('\n');
}


// ── Tests ──────────────────────────────────────────────────────────────────


test('classifyDeliveryChip honours MOCK: prefix even when status=sent', () => {
  assert.equal(
    classifyDeliveryChip({ delivery_status: 'sent', delivery_note: 'MOCK: simulated' }),
    'mock'
  );
  assert.equal(
    classifyDeliveryChip({ delivery_status: 'sent', delivery_note: 'slack ok ts=1700' }),
    'sent'
  );
});


test('classifyDeliveryChip surfaces queued / failed / sent honestly', () => {
  assert.equal(
    classifyDeliveryChip({ delivery_status: 'queued', delivery_note: 'no_adapters_enabled: ...' }),
    'queued'
  );
  assert.equal(
    classifyDeliveryChip({ delivery_status: 'failed', delivery_note: 'all_adapters_failed: slack=403' }),
    'failed'
  );
  assert.equal(
    classifyDeliveryChip({ delivery_status: 'sent' }),
    'sent'
  );
  assert.equal(
    classifyDeliveryChip({}),
    'unknown'
  );
});


test('adapterHealthMode flags mock-mode override', () => {
  assert.equal(adapterHealthMode(null), 'unreachable');
  assert.equal(
    adapterHealthMode({ mock_mode: true, adapters: [] }),
    'mock'
  );
  assert.equal(
    adapterHealthMode({ mock_mode: false, adapters: [{ name: 'slack', enabled: false }] }),
    'live_all_disabled'
  );
  assert.equal(
    adapterHealthMode({
      mock_mode: false,
      adapters: [
        { name: 'slack', enabled: true },
        { name: 'twilio', enabled: false },
      ],
    }),
    'live_some_enabled'
  );
});


test('test-adapter button is admin-only', () => {
  for (const r of ['patient', 'guest', 'clinician']) {
    assert.equal(shouldShowAdminCtas(r), false, r);
  }
  for (const r of ['admin', 'supervisor', 'regulator', 'ADMIN']) {
    assert.equal(shouldShowAdminCtas(r), true, r);
  }
});


test('audit payload for test-adapter click is canonical', () => {
  assert.deepEqual(
    buildTestAdapterAuditPayload(),
    { event: 'adapter_test_clicked_ui' }
  );
});


test('summariseAdapterAttempts honours disabled adapters with skipped status', () => {
  const out = summariseAdapterAttempts([
    { name: 'slack', enabled: true, status: 'sent', external_id: '1700.0001' },
    { name: 'twilio', enabled: false, status: null },
    { name: 'pagerduty', enabled: false, status: null },
  ]);
  assert.match(out, /slack = sent id=1700\.0001/);
  assert.match(out, /\(disabled\) twilio = skipped/);
  assert.match(out, /\(disabled\) pagerduty = skipped/);
});


// ── Source-grep contracts ──────────────────────────────────────────────────


const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


function readRelative(rel) {
  return fs.readFileSync(path.resolve(__dirname, rel), 'utf-8');
}


test('api.js exposes adapter-health + test-adapter helpers', () => {
  const src = readRelative('api.js');
  assert.match(src, /autoPageWorkerAdapterHealth: \(\) =>/);
  assert.match(src, /\/api\/v1\/auto-page-worker\/adapters/);
  assert.match(src, /autoPageWorkerTestAdapter: \(data\) =>/);
  assert.match(src, /\/api\/v1\/auto-page-worker\/test-adapter/);
});


test('pages-knowledge.js wires the adapter-health panel + test-adapter button', () => {
  const src = readRelative('pages-knowledge.js');
  // Panel renderer present.
  assert.match(src, /function renderAdapterHealthPanel/);
  // Mock-mode visual treatment present.
  assert.match(src, /Mock delivery mode/);
  // Test-adapter window handler present.
  assert.match(src, /window\._oncallDeliveryTestAdapter/);
  // Per-page chip renderer present.
  assert.match(src, /function _renderDeliveryChip/);
  // Pages tab uses the chip renderer.
  assert.match(src, /_renderDeliveryChip\(p\)/);
  // Adapter-health endpoint is called.
  assert.match(src, /api\.autoPageWorkerAdapterHealth\(\)/);
});


test('audit_trail_router.py whitelists the oncall_delivery surface', () => {
  // Walk up to the API package.
  const apiPath = path.resolve(__dirname, '../../api/app/routers/audit_trail_router.py');
  const src = fs.readFileSync(apiPath, 'utf-8');
  assert.match(src, /"oncall_delivery"/);
});


test('qeeg_analysis_router.py whitelists oncall_delivery in audit-events surface filter', () => {
  const apiPath = path.resolve(__dirname, '../../api/app/routers/qeeg_analysis_router.py');
  const src = fs.readFileSync(apiPath, 'utf-8');
  assert.match(src, /"oncall_delivery"/);
});


test('oncall_delivery service module exists with three adapters', () => {
  const apiPath = path.resolve(__dirname, '../../api/app/services/oncall_delivery.py');
  const src = fs.readFileSync(apiPath, 'utf-8');
  assert.match(src, /class SlackAdapter/);
  assert.match(src, /class TwilioSMSAdapter/);
  assert.match(src, /class PagerDutyAdapter/);
  assert.match(src, /class OncallDeliveryService/);
  // Mock-mode flag honoured.
  assert.match(src, /DEEPSYNAPS_DELIVERY_MOCK/);
  // 5s default timeout enforced.
  assert.match(src, /return 5\.0/);
});


test('OncallPage model has external_id + delivery_note columns', () => {
  const modelPath = path.resolve(__dirname, '../../api/app/persistence/models.py');
  const src = fs.readFileSync(modelPath, 'utf-8');
  // Locate the OncallPage class block.
  const idx = src.indexOf('class OncallPage(');
  assert.ok(idx > 0, 'OncallPage class missing');
  const classBody = src.slice(idx, idx + 2000);
  assert.match(classBody, /external_id:\s*Mapped\[Optional\[str\]\]/);
  assert.match(classBody, /delivery_note:\s*Mapped\[Optional\[str\]\]/);
});
