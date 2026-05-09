// Tests for apps/web/src/pages-qeeg-raw.js
//
// Strategy: pages-qeeg-raw.js is a rich EEG viewer that cannot be executed
// in Node without a full DOM + Canvas shim. We test load-bearing source-text
// invariants:
//   - Public export: renderRawDataTab
//   - Demo constants (_DEMO_CHANNELS, _DEMO_SFREQ, _DEMO_DURATION)
//   - Clinical standard: 10-20 channel set coverage
//   - Sensitivity values (standard clinical μV/mm values)
//   - _PHASE4_REASONS artifact annotation keys
//   - Montage options (Referential, Bipolar Longitudinal/Transverse)
//   - State slices (display / processing / ai / ui)
//   - Demo mode banner copy
//   - esc() XSS helper

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dir = dirname(__filename);
const SRC = readFileSync(join(__dir, 'pages-qeeg-raw.js'), 'utf8');

// ── 1. Public exports ────────────────────────────────────────────────────────
describe('pages-qeeg-raw.js — public exports', () => {
  it('exports renderRawDataTab as an async function', () => {
    assert.ok(
      SRC.includes('export async function renderRawDataTab('),
      'renderRawDataTab not exported',
    );
  });
});

// ── 2. Demo constants ────────────────────────────────────────────────────────
describe('pages-qeeg-raw.js — demo constants', () => {
  it('_DEMO_SFREQ is 256 Hz (standard clinical EEG sample rate)', () => {
    assert.ok(SRC.includes('_DEMO_SFREQ = 256'), '_DEMO_SFREQ must be 256 Hz');
  });

  it('_DEMO_DURATION is 120 seconds', () => {
    assert.ok(SRC.includes('_DEMO_DURATION = 120'), '_DEMO_DURATION must be 120 s');
  });

  it('_DEMO_CHANNELS has 19 channels (full 10-20 set)', () => {
    // Count the channels in the array literal
    const match = SRC.match(/_DEMO_CHANNELS\s*=\s*\[([^\]]+)\]/);
    assert.ok(match, '_DEMO_CHANNELS literal not found');
    const channels = match[1].split(',').map(s => s.trim().replace(/'/g, ''));
    assert.strictEqual(channels.length, 19, '_DEMO_CHANNELS should have 19 electrodes');
  });

  it('_DEMO_CHANNELS includes standard 10-20 electrodes Fp1, Fz, Cz, Pz, O1', () => {
    const mustHave = ['Fp1', 'Fp2', 'Fz', 'Cz', 'Pz', 'O1', 'O2'];
    for (const ch of mustHave) {
      assert.ok(SRC.includes(`'${ch}'`), `_DEMO_CHANNELS missing electrode ${ch}`);
    }
  });

  it('_getDemoChannelInfo function is defined', () => {
    assert.ok(SRC.includes('function _getDemoChannelInfo('), '_getDemoChannelInfo missing');
  });

  it('_getDemoSignalWindow function is defined', () => {
    assert.ok(SRC.includes('function _getDemoSignalWindow('), '_getDemoSignalWindow missing');
  });

  it('_generateDemoSignal generates alpha + theta + beta waves', () => {
    assert.ok(SRC.includes('alphaAmp'), 'alpha wave generation missing');
    assert.ok(SRC.includes('thetaAmp'), 'theta wave generation missing');
    assert.ok(SRC.includes('betaAmp'), 'beta wave generation missing');
  });
});

// ── 3. Clinical sensitivity values ───────────────────────────────────────────
describe('pages-qeeg-raw.js — SENSITIVITY_VALUES', () => {
  it('SENSITIVITY_VALUES array is defined', () => {
    assert.ok(SRC.includes('SENSITIVITY_VALUES = ['), 'SENSITIVITY_VALUES missing');
  });

  it('SENSITIVITY_VALUES includes standard clinical μV values: 7, 10, 20, 70, 100', () => {
    const match = SRC.match(/SENSITIVITY_VALUES\s*=\s*\[([^\]]+)\]/);
    assert.ok(match, 'SENSITIVITY_VALUES array literal not found');
    const vals = match[1].split(',').map(s => parseInt(s.trim(), 10));
    const required = [7, 10, 20, 70, 100];
    for (const v of required) {
      assert.ok(vals.includes(v), `SENSITIVITY_VALUES missing standard value ${v}`);
    }
  });

  it('SENSITIVITY_VALUES first value is 3 (minimum)', () => {
    assert.ok(SRC.includes('SENSITIVITY_VALUES = [3,'), 'SENSITIVITY_VALUES must start at 3');
  });
});

// ── 4. _PHASE4_REASONS artifact annotation table ──────────────────────────────
describe('pages-qeeg-raw.js — _PHASE4_REASONS', () => {
  it('_PHASE4_REASONS is defined', () => {
    assert.ok(SRC.includes('_PHASE4_REASONS = ['), '_PHASE4_REASONS missing');
  });

  const requiredReasons = [
    { key: 'blink',         label: 'Eye blink' },
    { key: 'emg',           label: 'Muscle (EMG)' },
    { key: 'ecg',           label: 'Heart (ECG)' },
    { key: 'electrode_pop', label: 'Electrode pop' },
    { key: 'line_noise',    label: 'Line noise' },
    { key: 'flatline',      label: 'Flatline' },
    { key: 'other',         label: 'Other' },
  ];

  for (const r of requiredReasons) {
    it(`_PHASE4_REASONS includes key '${r.key}' with label '${r.label}'`, () => {
      assert.ok(SRC.includes(`key: '${r.key}'`), `_PHASE4_REASONS missing key '${r.key}'`);
      assert.ok(SRC.includes(`label: '${r.label}'`), `_PHASE4_REASONS missing label '${r.label}'`);
    });
  }

  it('_PHASE4_REASONS has 10 entries (all standard artifact types)', () => {
    // Count occurrences of "key:" inside the array literal
    const arrayMatch = SRC.match(/_PHASE4_REASONS\s*=\s*\[([\s\S]*?)\];/);
    assert.ok(arrayMatch, '_PHASE4_REASONS array block not found');
    const keyCount = (arrayMatch[1].match(/key:/g) || []).length;
    assert.strictEqual(keyCount, 10, '_PHASE4_REASONS should have exactly 10 artifact reasons');
  });
});

// ── 5. Montage options ───────────────────────────────────────────────────────
describe('pages-qeeg-raw.js — montage options', () => {
  it('Referential montage option is present', () => {
    assert.ok(SRC.includes('>Referential</option>'), 'Referential montage option missing');
  });

  it('Bipolar (Longitudinal) montage option is present', () => {
    assert.ok(SRC.includes('>Bipolar (Longitudinal)</option>'), 'Bipolar Longitudinal montage missing');
  });

  it('Bipolar (Transverse) montage option is present', () => {
    assert.ok(SRC.includes('>Bipolar (Transverse)</option>'), 'Bipolar Transverse montage missing');
  });
});

// ── 6. State slices ──────────────────────────────────────────────────────────
describe('pages-qeeg-raw.js — state slices', () => {
  it('display slice has montage key', () => {
    assert.ok(
      SRC.includes("montage:               ['display', 'montage']"),
      'montage not in display slice',
    );
  });

  it('processing slice has badChannels key', () => {
    assert.ok(
      SRC.includes("badChannels:        ['processing', 'badChannels']"),
      'badChannels not in processing slice',
    );
  });

  it('processing slice has filterParams key', () => {
    assert.ok(
      SRC.includes("filterParams:       ['processing', 'filterParams']"),
      'filterParams not in processing slice',
    );
  });

  it('ui slice has interactionMode key', () => {
    assert.ok(
      SRC.includes("interactionMode:    ['ui', 'interactionMode']"),
      'interactionMode not in ui slice',
    );
  });
});

// ── 7. Demo banner copy ──────────────────────────────────────────────────────
describe('pages-qeeg-raw.js — demo banner', () => {
  it('demo banner renders synthetic EEG data notice', () => {
    assert.ok(
      SRC.includes('Demo mode') && SRC.includes('synthetic EEG data'),
      'demo banner copy changed or removed',
    );
  });
});

// ── 8. XSS escape helper ─────────────────────────────────────────────────────
describe('pages-qeeg-raw.js — esc() helper', () => {
  it('esc() escapes & < > " characters', () => {
    assert.ok(SRC.includes("replace(/&/g, '&amp;')"), "esc() & escape missing");
    assert.ok(SRC.includes("replace(/</g, '&lt;')"),  "esc() < escape missing");
    assert.ok(SRC.includes("replace(/>/g, '&gt;')"),  "esc() > escape missing");
  });
});
