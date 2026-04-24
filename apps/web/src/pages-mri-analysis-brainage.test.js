// ─────────────────────────────────────────────────────────────────────────────
// pages-mri-analysis-brainage.test.js
//
// Unit tests for the brain-age card renderer in pages-mri-analysis.js.
// The card must:
//   - only render when `structural.brain_age.status === 'ok'`
//   - remain hidden when brain_age is null / undefined / status != 'ok'
//   - surface "Research / wellness use only" clinician-safe framing
//   - colour the gap green (< 0), amber (0-3), red (> 3)
//
// Run: node --test src/pages-mri-analysis-brainage.test.js
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
const { renderBrainAgeCard, renderFullView, DEMO_MRI_REPORT } = mod;

// ── Fixtures ────────────────────────────────────────────────────────────────
function makeReport(overrides) {
  return Object.assign(
    {},
    DEMO_MRI_REPORT,
    {
      structural: Object.assign({}, DEMO_MRI_REPORT.structural, overrides || {}),
    },
  );
}

// ── Hidden when structural missing / brain_age absent / wrong status ────────
test('renderBrainAgeCard: returns empty string when report is null', () => {
  assert.equal(renderBrainAgeCard(null), '');
  assert.equal(renderBrainAgeCard(undefined), '');
});

test('renderBrainAgeCard: empty string when structural block missing', () => {
  assert.equal(renderBrainAgeCard({ patient: {}, stim_targets: [] }), '');
});

test('renderBrainAgeCard: empty string when brain_age is null', () => {
  var r = makeReport({ brain_age: null });
  assert.equal(renderBrainAgeCard(r), '');
});

test('renderBrainAgeCard: empty string when status=failed', () => {
  var r = makeReport({
    brain_age: {
      status: 'failed',
      predicted_age_years: null,
      error_message: 'boom',
    },
  });
  assert.equal(renderBrainAgeCard(r), '');
});

test('renderBrainAgeCard: empty string when status=dependency_missing', () => {
  var r = makeReport({
    brain_age: {
      status: 'dependency_missing',
      predicted_age_years: null,
    },
  });
  assert.equal(renderBrainAgeCard(r), '');
});

// ── Rendered only when status=ok ───────────────────────────────────────────
test('renderBrainAgeCard: renders the predicted age + MAE line', () => {
  var r = makeReport({
    brain_age: {
      status: 'ok',
      predicted_age_years: 58.7,
      chronological_age_years: 54.0,
      brain_age_gap_years: 4.7,
      gap_zscore: 1.42,
      cognition_cdr_estimate: 0.18,
      model_id: 'brainage_cnn_v1',
      mae_years_reference: 3.30,
    },
  });
  var html = renderBrainAgeCard(r);
  assert.ok(html, 'card must render when status=ok');
  assert.ok(html.includes('58.7 y'), 'predicted age present');
  assert.ok(html.includes('3.30'), 'MAE present');
  assert.ok(html.includes('+4.7 y'), 'gap is signed');
  assert.ok(html.includes('CDR proxy 0.18'), 'CDR proxy present');
  assert.ok(html.includes('Research'), 'clinician-safe framing present');
  // Regulatory: must NOT use diagnostic/diagnosis/treatment-recommendation language
  assert.ok(!/\bdiagnose\b/i.test(html));
  assert.ok(!/\bdiagnostic\b/i.test(html),
    'the banned regex rejects "diagnostic" anywhere in the fragment');
  assert.ok(!/treatment recommendation/i.test(html));
});

test('renderBrainAgeCard: gap colour is green for negative gap', () => {
  var r = makeReport({
    brain_age: {
      status: 'ok',
      predicted_age_years: 50.0,
      chronological_age_years: 55.0,
      brain_age_gap_years: -5.0,
    },
  });
  var html = renderBrainAgeCard(r);
  assert.ok(html.includes('var(--green)'), 'negative gap should be green');
});

test('renderBrainAgeCard: gap colour is amber for 0-3 gap', () => {
  var r = makeReport({
    brain_age: {
      status: 'ok',
      predicted_age_years: 57.0,
      chronological_age_years: 55.0,
      brain_age_gap_years: 2.0,
    },
  });
  var html = renderBrainAgeCard(r);
  assert.ok(html.includes('var(--amber)'), 'small positive gap should be amber');
});

test('renderBrainAgeCard: gap colour is red for > 3 gap', () => {
  var r = makeReport({
    brain_age: {
      status: 'ok',
      predicted_age_years: 62.0,
      chronological_age_years: 55.0,
      brain_age_gap_years: 7.0,
    },
  });
  var html = renderBrainAgeCard(r);
  assert.ok(html.includes('var(--red)'), 'large positive gap should be red');
});

// ── Integration: renderFullView must include the card when status=ok ───────
test('renderFullView: includes the brain-age card for demo payload', () => {
  var html = renderFullView({ report: DEMO_MRI_REPORT });
  assert.ok(/Brain age/i.test(html), 'Brain age card title must appear in the full view');
});

test('renderFullView: omits the brain-age card when brain_age is null', () => {
  var r = makeReport({ brain_age: null });
  var html = renderFullView({ report: r });
  assert.ok(!/Brain age/.test(html) || /Brain age/.test(html) === false,
    'Brain age card must not appear when brain_age is null');
});
