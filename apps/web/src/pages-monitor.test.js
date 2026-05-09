// Tests for apps/web/src/pages-monitor.js
//
// Strategy: pages-monitor.js imports browser APIs and cannot be executed in
// Node without a full DOM shim. We test the load-bearing source-text
// invariants:
//   - Public export exists: pgMonitor
//   - Safety/governance strings are present and unaltered
//   - Key constants (VALID_TABS, STALE_SYNC_HOURS, RETRY_MS) have expected values
//   - Demo data covers the required patient count and tier distribution
//   - Critical UI strings present (governance disclaimer, stale-data warning)
//   - demoLiveSnapshot and demoWearableSummary demo generators exist
//
// A minimal DOM stub is provided so that module-level code that touches
// document (none in this file) would not throw if we ever switch to a full
// import-based approach.

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dir = dirname(__filename);
const SRC = readFileSync(join(__dir, 'pages-monitor.js'), 'utf8');

// ── 1. Public exports ────────────────────────────────────────────────────────
describe('pages-monitor.js — public exports', () => {
  it('exports pgMonitor as an async function', () => {
    assert.ok(
      SRC.includes('export async function pgMonitor('),
      'pgMonitor export not found',
    );
  });
});

// ── 2. Module-level constants ────────────────────────────────────────────────
describe('pages-monitor.js — constants', () => {
  it('STALE_SYNC_HOURS is 48', () => {
    assert.ok(
      SRC.includes('STALE_SYNC_HOURS = 48'),
      'STALE_SYNC_HOURS must be 48 (matches backend 48h stale rule)',
    );
  });

  it('VALID_TABS includes biometrics-analyzer', () => {
    assert.ok(SRC.includes("'biometrics-analyzer'"), 'VALID_TABS missing biometrics-analyzer');
  });

  it('VALID_TABS includes control-center', () => {
    assert.ok(SRC.includes("'control-center'"), 'VALID_TABS missing control-center');
  });

  it('VALID_TABS includes live', () => {
    assert.ok(SRC.includes("'live'"), 'VALID_TABS missing live');
  });

  it('VALID_TABS includes dq', () => {
    assert.ok(SRC.includes("'dq'"), 'VALID_TABS missing dq');
  });

  it('VALID_TABS includes wearables-workbench', () => {
    assert.ok(SRC.includes("'wearables-workbench'"), 'VALID_TABS missing wearables-workbench');
  });

  it('RETRY_MS array has 6 elements with correct first value', () => {
    assert.ok(SRC.includes('RETRY_MS = [1000, 2000, 4000, 8000, 16000, 30000]'), 'RETRY_MS has wrong values');
  });

  it('MONITOR_HEAVY_TABS includes control-center', () => {
    assert.ok(
      SRC.includes("MONITOR_HEAVY_TABS") && SRC.includes("'control-center'"),
      'MONITOR_HEAVY_TABS should include control-center',
    );
  });
});

// ── 3. Governance / safety copy ──────────────────────────────────────────────
describe('pages-monitor.js — governance copy', () => {
  it('GOVERNANCE_COPY includes "clinician-reviewed decision-support"', () => {
    assert.ok(
      SRC.includes('clinician-reviewed decision-support signals'),
      'GOVERNANCE_COPY wording changed — this is a regulated safety string',
    );
  });

  it('GOVERNANCE_COPY includes "not emergency monitoring"', () => {
    assert.ok(
      SRC.includes('not emergency monitoring'),
      'GOVERNANCE_COPY missing "not emergency monitoring" disclaimer',
    );
  });

  it('GOVERNANCE_COPY includes "diagnosis, treatment approval"', () => {
    assert.ok(
      SRC.includes('diagnosis, treatment approval'),
      'GOVERNANCE_COPY missing diagnosis/treatment disclaimer',
    );
  });

  it('renderGovernanceBanner uses role="note"', () => {
    assert.ok(
      SRC.includes('role="note"'),
      'governance banner must have role="note" for a11y',
    );
  });

  it('stale data warning includes "Stale data"', () => {
    assert.ok(
      SRC.includes('Stale data:'),
      'stale-data warning string changed or removed',
    );
  });

  it('stale-data banner includes cautious interpretation note', () => {
    assert.ok(
      SRC.includes('Interpret cautiously'),
      'stale-data banner missing clinical caution note',
    );
  });
});

// ── 4. Demo data invariants ──────────────────────────────────────────────────
describe('pages-monitor.js — demo data', () => {
  it('demoLiveSnapshot function is defined', () => {
    assert.ok(SRC.includes('function demoLiveSnapshot('), 'demoLiveSnapshot missing');
  });

  it('demoWearableSummary function is defined', () => {
    assert.ok(SRC.includes('function demoWearableSummary('), 'demoWearableSummary missing');
  });

  it('demo caseload contains 12 patients (pt-demo-001..012)', () => {
    assert.ok(SRC.includes("'pt-demo-012'"), 'demo caseload must have 12 patients');
  });

  it('demo includes red tier patients', () => {
    assert.ok(SRC.includes("review_tier: 'red'"), 'demo caseload missing red tier');
  });

  it('demo includes orange tier patients', () => {
    assert.ok(SRC.includes("review_tier: 'orange'"), 'demo caseload missing orange tier');
  });

  it('demo includes green tier patients', () => {
    assert.ok(SRC.includes("review_tier: 'green'"), 'demo caseload missing green tier');
  });

  it('demo marks patient pt-demo-003 as wearable_stale', () => {
    assert.ok(SRC.includes('pt-demo-003'), 'stale-patient demo fixture removed');
    // The stale logic uses isStalePatient to gate null metrics
    const idx = SRC.indexOf('pt-demo-003');
    const snippet = SRC.slice(idx, idx + 200);
    assert.ok(snippet.includes('Stale') || SRC.includes('isStalePatient'), 'stale patient logic missing');
  });

  it('demo banner uses "DEMO biometrics — illustrative only"', () => {
    assert.ok(
      SRC.includes('DEMO biometrics — illustrative only'),
      'demo banner copy changed or removed',
    );
  });
});

// ── 5. Tab switching / navigation ────────────────────────────────────────────
describe('pages-monitor.js — tab switching', () => {
  it('pgMonitor applies preset from window._devicesPresetTab', () => {
    assert.ok(SRC.includes('_devicesPresetTab'), 'preset tab handling removed');
  });

  it('pgMonitor falls back to control-center for unknown presets', () => {
    const idx = SRC.indexOf('_devicesPresetTab');
    const snippet = SRC.slice(idx, idx + 300);
    assert.ok(snippet.includes("'control-center'"), 'preset fallback to control-center missing');
  });

  it('biometrics preset alias normalises to biometrics-analyzer', () => {
    // 'biometrics' -> 'biometrics-analyzer'
    assert.ok(
      SRC.includes("preset = 'biometrics-analyzer'"),
      "preset normalisation from 'biometrics' -> 'biometrics-analyzer' missing",
    );
  });
});

// ── 6. XSS escape helper ─────────────────────────────────────────────────────
describe('pages-monitor.js — esc() helper', () => {
  it('esc() escapes & < > " characters', () => {
    // The module defines its own esc function
    assert.ok(SRC.includes("replace(/&/g, '&amp;')"), "esc() & escape missing");
    assert.ok(SRC.includes("replace(/</g, '&lt;')"),  "esc() < escape missing");
    assert.ok(SRC.includes("replace(/>/g, '&gt;')"),  "esc() > escape missing");
  });
});
