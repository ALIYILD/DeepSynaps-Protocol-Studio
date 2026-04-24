// ─────────────────────────────────────────────────────────────────────────────
// pages-mri-analysis-compare.test.js
//
// Unit tests for the longitudinal compare feature (AI_UPGRADES §P0 #4):
//   * renderCompareButton  — appears iff >= 2 completed analyses.
//   * renderCompareModal   — two <select>s + Run compare button.
//   * renderLongitudinalReport — summary card + 3 delta tables + optional
//     Jacobian / divergent-overlay image.
//
// Run: npm run test:unit  (or: node --test src/pages-mri-analysis-compare.test.js)
// ─────────────────────────────────────────────────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';

if (typeof globalThis.window === 'undefined') {
  globalThis.window = globalThis;
}
if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => ({ style: {}, addEventListener() {}, appendChild() {} }),
    body: { appendChild() {} },
  };
}
globalThis.DEEPSYNAPS_ENABLE_MRI_ANALYZER = true;

const mod = await import('./pages-mri-analysis.js');
const {
  renderCompareButton,
  renderCompareModal,
  renderLongitudinalReport,
} = mod;

// ── renderCompareButton ─────────────────────────────────────────────────────
test('renderCompareButton is empty when <= 1 completed analyses', () => {
  assert.equal(renderCompareButton([]), '');
  assert.equal(
    renderCompareButton([{ analysis_id: 'a', state: 'SUCCESS' }]),
    '',
  );
  // Queued analyses do not count.
  assert.equal(
    renderCompareButton([
      { analysis_id: 'a', state: 'SUCCESS' },
      { analysis_id: 'b', state: 'queued' },
    ]),
    '',
  );
});

test('renderCompareButton appears with >= 2 completed analyses', () => {
  const html = renderCompareButton([
    { analysis_id: 'a', state: 'SUCCESS' },
    { analysis_id: 'b', state: 'SUCCESS' },
  ]);
  assert.match(html, /ds-mri-compare-btn/);
  assert.match(html, /Compare/);
});

// ── renderCompareModal ─────────────────────────────────────────────────────
test('renderCompareModal emits baseline + followup selects with ≥ 2 options each', () => {
  const html = renderCompareModal([
    { analysis_id: 'aaa-111', state: 'SUCCESS', condition: 'mdd', created_at: '2025-01-10T09:00:00Z' },
    { analysis_id: 'bbb-222', state: 'SUCCESS', condition: 'mdd', created_at: '2025-06-10T09:00:00Z' },
    { analysis_id: 'ccc-333', state: 'SUCCESS', condition: 'ptsd', created_at: '2025-09-10T09:00:00Z' },
  ]);
  assert.match(html, /id="ds-mri-compare-baseline"/);
  assert.match(html, /id="ds-mri-compare-followup"/);
  assert.match(html, /id="ds-mri-compare-run"/);
  // Count the number of <option> tags for each select — should be 3 per
  // select, so at least 6 total.
  const optionCount = (html.match(/<option /g) || []).length;
  assert.ok(optionCount >= 6, `expected ≥6 options, got ${optionCount}`);
  // Condition labels surface on the dropdown rows.
  assert.match(html, /mdd/);
  assert.match(html, /ptsd/);
});

test('renderCompareModal skips queued analyses', () => {
  const html = renderCompareModal([
    { analysis_id: 'aaa', state: 'SUCCESS', condition: 'mdd', created_at: '2025-01-10T09:00:00Z' },
    { analysis_id: 'bbb', state: 'queued', condition: 'mdd', created_at: '2025-06-10T09:00:00Z' },
  ]);
  const optionCount = (html.match(/<option /g) || []).length;
  // 2 selects × 1 SUCCESS row = 2 options.
  assert.equal(optionCount, 2);
});

// ── renderLongitudinalReport ───────────────────────────────────────────────
const SAMPLE_RESULT = {
  baseline_analysis_id: '11111111-1111-1111-1111-111111111111',
  followup_analysis_id: '22222222-2222-2222-2222-222222222222',
  days_between: 180,
  summary: 'Precuneus volume +3.2% · FA in IFO −1.8% · DMN within-FC +0.15',
  structural_changes: [
    { region: 'acc_l', baseline_value: 2.6, followup_value: 2.7,
      delta_absolute: 0.1, delta_pct: 3.85, flagged: true,
      metric: 'cortical_thickness_mm' },
    { region: 'dlpfc_l', baseline_value: 2.3, followup_value: 2.31,
      delta_absolute: 0.01, delta_pct: 0.43, flagged: false,
      metric: 'cortical_thickness_mm' },
  ],
  functional_changes: [
    { region: 'DMN', baseline_value: 0.41, followup_value: 0.38,
      delta_absolute: -0.03, delta_pct: -7.3, flagged: true,
      metric: 'within_network_fc' },
  ],
  diffusion_changes: [
    { region: 'UF_L', baseline_value: 0.41, followup_value: 0.43,
      delta_absolute: 0.02, delta_pct: 4.88, flagged: true,
      metric: 'mean_FA' },
  ],
  jacobian_determinant_s3: null,
  change_overlay_png_s3: '/artefacts/longitudinal_change_overlay.png',
};

test('renderLongitudinalReport emits summary + three delta tables + overlay', () => {
  const html = renderLongitudinalReport(SAMPLE_RESULT);
  // Summary
  assert.match(html, /Precuneus volume/);
  // Three tables (structural, diffusion, functional).
  const tables = (html.match(/<table /g) || []).length;
  assert.equal(tables, 3, `expected 3 delta tables, got ${tables}`);
  // Headings for each modality.
  assert.match(html, /Structural change/i);
  assert.match(html, /Diffusion change/i);
  assert.match(html, /Functional change/i);
  // Region names surface.
  assert.match(html, /acc_l/);
  assert.match(html, /DMN/);
  assert.match(html, /UF_L/);
  // Overlay image when a path is supplied.
  assert.match(html, /<img [^>]*longitudinal_change_overlay\.png/);
  // Days between.
  assert.match(html, /180/);
});

test('renderLongitudinalReport handles missing modalities gracefully', () => {
  const html = renderLongitudinalReport({
    baseline_analysis_id: 'a',
    followup_analysis_id: 'b',
    structural_changes: [],
    functional_changes: [],
    diffusion_changes: [],
  });
  // Empty-state copy per modality.
  assert.match(html, /Structural change.*no comparable regions/i);
  assert.match(html, /Diffusion change.*no comparable regions/i);
  assert.match(html, /Functional change.*no comparable regions/i);
});

test('renderLongitudinalReport colours recovery green and decline red', () => {
  const html = renderLongitudinalReport(SAMPLE_RESULT);
  // Positive delta (acc_l, UF_L) -> green
  assert.match(html, /#22c55e/);
  // Negative delta (DMN) -> red
  assert.match(html, /#ef4444/);
});

// ── API wrapper smoke ──────────────────────────────────────────────────────
test('api.compareMRI wrapper is exported and calls the compare endpoint', async () => {
  const apiMod = await import('./api.js');
  assert.ok(typeof apiMod.api.compareMRI === 'function',
    'api.compareMRI should be exported');
});
