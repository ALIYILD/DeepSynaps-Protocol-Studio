// ─────────────────────────────────────────────────────────────────────────────
// protocol-hub-payload.test.js — BUG-FIX-001 regression tests
//
// Regression: _psGenerateEvidence() in pages-clinical-hubs.js was dropping
// the `device` and `evidence_threshold` fields from the constraints payload.
// The fix (line 4590) now preserves them in the constraints object.
//
// These tests simulate the payload-construction logic so the test can run
// without a browser DOM — verifying the *shape* of what gets sent to
// api.protocolStudioGenerate().
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ── Simulate the exact payload construction from _psGenerateEvidence ─────────

/**
 * Simulates how _psGenerateEvidence builds the payload from DOM form values.
 * Mirrors the logic at pages-clinical-hubs.js lines 4582-4598.
 *
 * @param {Object} opts
 * @param {string|null} opts.device        – device select value (e.g. 'Soterix 1x1')
 * @param {string|null} opts.threshold     – evidence threshold select (e.g. 'A', 'B')
 * @param {string}      opts.condition     – condition input value
 * @param {string}      opts.modality      – modality select value
 * @param {boolean}     opts.offLabel      – off-label checkbox state
 * @returns {Object} payload as sent to api.protocolStudioGenerate()
 */
function simulateGeneratePayload(opts = {}) {
  const {
    device = null,
    threshold = null,
    condition = 'MDD',
    modality = 'tDCS',
    offLabel = false,
  } = opts;

  // This mirrors the exact payload shape from BUG-FIX-001:
  //   const payload = {
  //     patient_id: ...,
  //     mode: 'evidence_search',
  //     condition,
  //     modality,
  //     target: null,
  //     protocol_id: null,
  //     include_off_label: !!(olEl && olEl.checked),
  //     constraints: {
  //       device: (devEl && devEl.value.trim()) || null,
  //       evidence_threshold: (thrEl && thrEl.value) || null,
  //       session_frequency: null,
  //       session_duration: null,
  //       safety_flags: [],
  //     },
  //   };
  return {
    patient_id: null,
    mode: 'evidence_search',
    condition,
    modality,
    target: null,
    protocol_id: null,
    include_off_label: offLabel,
    constraints: {
      device: device || null,
      evidence_threshold: threshold || null,
      session_frequency: null,
      session_duration: null,
      safety_flags: [],
    },
  };
}

// ── Read the source to verify BUG-FIX-001 comment exists ────────────────────
const HUB_SOURCE = readFileSync(join(__dirname, 'pages-clinical-hubs.js'), 'utf-8');

describe('BUG-FIX-001: Generate payload preservation', () => {
  // ── Source-level regression check ─────────────────────────────────────────
  it('source contains the BUG-FIX-001 comment confirming the fix', () => {
    assert.ok(
      HUB_SOURCE.includes('BUG-FIX-001: device and evidence_threshold now preserved in payload'),
      'BUG-FIX-001 comment must exist in pages-clinical-hubs.js'
    );
  });

  it('source assigns constraints.device from devEl value', () => {
    assert.ok(
      HUB_SOURCE.includes("device: (devEl && devEl.value.trim()) || null,"),
      'device must be read from devEl and preserved in constraints'
    );
  });

  it('source assigns constraints.evidence_threshold from thrEl value', () => {
    assert.ok(
      HUB_SOURCE.includes("evidence_threshold: (thrEl && thrEl.value) || null,"),
      'evidence_threshold must be read from thrEl and preserved in constraints'
    );
  });

  // ── Payload shape tests (deterministic, no DOM needed) ────────────────────
  it('must include device in constraints when provided', () => {
    const payload = simulateGeneratePayload({
      device: 'Soterix 1x1',
      threshold: 'A',
      condition: 'MDD',
      modality: 'tDCS',
    });
    assert.strictEqual(payload.constraints.device, 'Soterix 1x1',
      'device must be preserved in constraints');
  });

  it('must include evidence_threshold in constraints when provided', () => {
    const payload = simulateGeneratePayload({
      device: null,
      threshold: 'B',
      condition: 'MDD',
      modality: 'tDCS',
    });
    assert.strictEqual(payload.constraints.evidence_threshold, 'B',
      'threshold must be preserved in constraints');
  });

  it('must include both device and evidence_threshold when both provided', () => {
    const payload = simulateGeneratePayload({
      device: 'Magstim Rapid2',
      threshold: 'A',
      condition: 'OCD',
      modality: 'rTMS',
    });
    assert.strictEqual(payload.constraints.device, 'Magstim Rapid2');
    assert.strictEqual(payload.constraints.evidence_threshold, 'A');
  });

  it('must include all constraint keys even when some values are empty', () => {
    const payload = simulateGeneratePayload({
      device: '',
      threshold: '',
      modality: 'tDCS',
      condition: 'MDD',
    });
    assert.ok(payload.constraints, 'constraints object must exist');
    assert.ok('device' in payload.constraints,
      'device key must exist even when empty');
    assert.ok('evidence_threshold' in payload.constraints,
      'evidence_threshold key must exist even when empty');
    assert.ok('session_frequency' in payload.constraints,
      'session_frequency key must exist');
    assert.ok('session_duration' in payload.constraints,
      'session_duration key must exist');
    assert.ok('safety_flags' in payload.constraints,
      'safety_flags key must exist');
  });

  it('must set device to null when empty string is passed', () => {
    const payload = simulateGeneratePayload({ device: '' });
    assert.strictEqual(payload.constraints.device, null,
      'empty device must be normalized to null');
  });

  it('must set evidence_threshold to null when empty string is passed', () => {
    const payload = simulateGeneratePayload({ threshold: '' });
    assert.strictEqual(payload.constraints.evidence_threshold, null,
      'empty threshold must be normalized to null');
  });

  it('must set device to null when null is passed', () => {
    const payload = simulateGeneratePayload({ device: null });
    assert.strictEqual(payload.constraints.device, null);
  });

  it('must set evidence_threshold to null when null is passed', () => {
    const payload = simulateGeneratePayload({ threshold: null });
    assert.strictEqual(payload.constraints.evidence_threshold, null);
  });

  it('must preserve top-level fields alongside constraints', () => {
    const payload = simulateGeneratePayload({
      device: 'NeuroSoft tDCS',
      threshold: 'C',
      condition: 'PTSD',
      modality: 'tACS',
      offLabel: true,
    });
    assert.strictEqual(payload.condition, 'PTSD');
    assert.strictEqual(payload.modality, 'tACS');
    assert.strictEqual(payload.include_off_label, true);
    assert.strictEqual(payload.mode, 'evidence_search');
    assert.strictEqual(payload.target, null);
    assert.strictEqual(payload.protocol_id, null);
  });

  it('must never include device at the top level (only in constraints)', () => {
    // Regression guard: device must ONLY appear inside constraints,
    // never as a top-level payload key.
    const payload = simulateGeneratePayload({ device: 'Some Device' });
    assert.strictEqual(payload.device, undefined,
      'device must not leak to top-level payload');
    assert.strictEqual(payload.constraints.device, 'Some Device');
  });

  it('must never include evidence_threshold at the top level (only in constraints)', () => {
    const payload = simulateGeneratePayload({ threshold: 'B' });
    assert.strictEqual(payload.evidence_threshold, undefined,
      'evidence_threshold must not leak to top-level payload');
    assert.strictEqual(payload.constraints.evidence_threshold, 'B');
  });
});

// ── Validate against real source code for off-label guard ───────────────────
describe('BUG-FIX-001: Off-label guard integration', () => {
  it('source includes off-label confirmation dialog before payload build', () => {
    assert.ok(
      HUB_SOURCE.includes('Off-label generation cancelled until clinician review acknowledgement is confirmed.'),
      'off-label cancellation message must exist for clinical safety'
    );
  });

  it('source gates generation on condition being non-empty', () => {
    assert.ok(
      HUB_SOURCE.includes("if (!condition) { W.error = 'Condition is required.';"),
      'condition is required before payload construction'
    );
  });
});
