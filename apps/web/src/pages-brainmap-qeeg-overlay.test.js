// ─────────────────────────────────────────────────────────────────────────────
// pages-brainmap-qeeg-overlay.test.js
//
// Phase 5a — tests for the Brain Map Planner qEEG Overlay helpers exported
// from pages-brainmap.js. Verifies:
//   - z-score banding thresholds (severe_excess / excess / typical / deficit /
//     severe_deficit) match the regulatory color scale
//   - color mapping returns deterministic hex codes
//   - DK atlas rows are grouped by lobe with hemispheres merged so each ROI
//     appears once with both percentiles
// ─────────────────────────────────────────────────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';

if (typeof globalThis.window === 'undefined') {
  globalThis.window = globalThis;
}
if (typeof globalThis.document === 'undefined') {
  globalThis.document = { getElementById: function () { return null; } };
}

const mod = await import('./pages-brainmap.js');

test('_bmZBand thresholds match regulatory bands', function () {
  assert.equal(mod._bmZBand(null), null);
  assert.equal(mod._bmZBand(NaN), null);
  assert.equal(mod._bmZBand(0), 'typical');
  assert.equal(mod._bmZBand(1.0), 'typical');
  assert.equal(mod._bmZBand(1.96), 'excess');
  assert.equal(mod._bmZBand(2.5), 'excess');
  assert.equal(mod._bmZBand(2.58), 'severe_excess');
  assert.equal(mod._bmZBand(-1.96), 'deficit');
  assert.equal(mod._bmZBand(-2.58), 'severe_deficit');
});

test('_bmZColor returns canonical hex per band', function () {
  assert.equal(mod._bmZColor(0.5), '#10b981');     // typical → green
  assert.equal(mod._bmZColor(2.0), '#ef4444');     // excess → red
  assert.equal(mod._bmZColor(3.0), '#b91c1c');     // severe excess → dark red
  assert.equal(mod._bmZColor(-2.0), '#3b82f6');    // deficit → blue
  assert.equal(mod._bmZColor(-3.0), '#1d4ed8');    // severe deficit → dark blue
  assert.equal(mod._bmZColor(null), '#6b7280');    // null → gray
});

test('_bmGroupDKByLobe merges lh + rh for each ROI', function () {
  const dk = [
    { code: 'F5', roi: 'rostralmiddlefrontal', name: 'Rostral Middle Frontal', lobe: 'frontal', hemisphere: 'lh', lt_percentile: 30, rt_percentile: null, z_score: -2.1 },
    { code: 'F5', roi: 'rostralmiddlefrontal', name: 'Rostral Middle Frontal', lobe: 'frontal', hemisphere: 'rh', lt_percentile: null, rt_percentile: 35, z_score: 0.4 },
    { code: 'O1', roi: 'lateraloccipital',     name: 'Lateral Occipital',      lobe: 'occipital', hemisphere: 'lh', lt_percentile: 40, rt_percentile: null, z_score: -0.5 },
    { code: 'O1', roi: 'lateraloccipital',     name: 'Lateral Occipital',      lobe: 'occipital', hemisphere: 'rh', lt_percentile: null, rt_percentile: 42, z_score: -0.6 },
  ];
  const grouped = mod._bmGroupDKByLobe(dk);
  assert.ok(grouped.frontal && grouped.frontal.length === 1);
  const f5 = grouped.frontal[0];
  assert.equal(f5.code, 'F5');
  assert.equal(f5.lt_pct, 30);
  assert.equal(f5.rt_pct, 35);
  // Highest |z| wins, so the lh -2.1 should have been picked
  assert.equal(f5.z_score, -2.1);
  assert.equal(grouped.occipital.length, 1);
});

test('_bmGroupDKByLobe handles empty / missing input', function () {
  assert.deepEqual(mod._bmGroupDKByLobe([]), {});
  assert.deepEqual(mod._bmGroupDKByLobe(null), {});
  assert.deepEqual(mod._bmGroupDKByLobe([{ /* missing roi */ name: 'x' }]), {});
});
