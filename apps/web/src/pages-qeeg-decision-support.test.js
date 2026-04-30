// Tests for the night-shift renderQEEGDecisionSupport block — verifies that
// qc_flags, observed-vs-inferred separation, and evidence-pending chips are
// rendered into the HTML string returned by the renderer.

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
    addEventListener() {},
    body: { appendChild() {} },
  };
}
function installStorageStub(name) {
  const desc = Object.getOwnPropertyDescriptor(globalThis, name);
  if (desc && desc.value && typeof desc.value.getItem === 'function') return;
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value: { getItem() { return null; }, setItem() {}, removeItem() {} },
  });
}
installStorageStub('localStorage');
installStorageStub('sessionStorage');

const { renderQEEGDecisionSupport } = await import('./pages-qeeg-analysis.js');

test('renderQEEGDecisionSupport returns empty string when nothing to show', () => {
  assert.equal(renderQEEGDecisionSupport(null), '');
  assert.equal(renderQEEGDecisionSupport({}), '');
});

test('renderQEEGDecisionSupport renders qc_flags + confidence when present', () => {
  const html = renderQEEGDecisionSupport({
    confidence: { level: 'moderate', score: 0.62, rationale: 'auto' },
    qc_flags: [
      { code: 'low_clean_epoch_count', severity: 'high', message: 'Only 12 epochs.' },
      { code: 'iclabel_used_false', severity: 'medium', message: 'ICLabel was skipped.' },
    ],
  });
  assert.match(html, /Decision Support/);
  assert.match(html, /data-testid="qeeg-ds-confidence"/);
  assert.match(html, /data-testid="qeeg-ds-flags"/);
  assert.match(html, /low_clean_epoch_count/);
  assert.match(html, /Only 12 epochs/);
  assert.match(html, /ICLabel was skipped/);
});

test('renderQEEGDecisionSupport surfaces observed findings with evidence-pending chip', () => {
  const html = renderQEEGDecisionSupport({
    clinical_summary: {
      observed_findings: [
        {
          type: 'asymmetry',
          label: 'frontal_alpha_F3_F4',
          value: 0.21,
          unit: 'log-ratio',
          statement: 'FAA F3/F4 = 0.210',
          evidence: { status: 'evidence_pending', reason: 'no_evidence_lookup_provided' },
        },
      ],
      derived_interpretations: [
        { label: 'clinician_review_required', confidence: 'moderate',
          statement: 'Hedged interpretation.' },
      ],
    },
  });
  assert.match(html, /data-testid="qeeg-ds-observed"/);
  assert.match(html, /data-testid="qeeg-ds-derived"/);
  assert.match(html, /data-testid="evidence-pending-chip"/);
  assert.match(html, /frontal_alpha_F3_F4/);
  assert.match(html, /Hedged interpretation/);
});

test('renderQEEGDecisionSupport renders attached citations when evidence found', () => {
  const html = renderQEEGDecisionSupport({
    clinical_summary: {
      observed_findings: [
        {
          label: 'mean_peak_alpha_frequency',
          value: 9.8,
          unit: 'Hz',
          statement: 'Mean PAF = 9.8 Hz.',
          evidence: {
            status: 'found',
            citations: [
              { title: 'PAF and cognition', url: 'https://pubmed.example/1', pmid: '1' },
              { title: 'Alpha oscillations', url: 'https://pubmed.example/2', pmid: '2' },
            ],
          },
        },
      ],
    },
  });
  assert.match(html, /PAF and cognition/);
  assert.match(html, /https:\/\/pubmed\.example\/1/);
  assert.match(html, /Alpha oscillations/);
  // No "evidence pending" chip when citations are real.
  assert.doesNotMatch(html, /data-testid="evidence-pending-chip"/);
});

test('renderQEEGDecisionSupport renders structured limitations array', () => {
  const html = renderQEEGDecisionSupport({
    limitations: [
      { code: 'decision_support_only', severity: 'info', message: 'Not a diagnosis.' },
      { code: 'low_clean_epoch_count', severity: 'high', message: 'Only 8 epochs.' },
    ],
  });
  assert.match(html, /data-testid="qeeg-ds-limitations"/);
  assert.match(html, /Not a diagnosis/);
  assert.match(html, /Only 8 epochs/);
});

test('renderQEEGDecisionSupport tolerates analysis with only top-level fields', () => {
  // Some callers may forward only the night-shift top-level keys without
  // nesting clinical_summary — the renderer should still work.
  const html = renderQEEGDecisionSupport({
    qc_flags: [{ code: 'x', severity: 'low', message: 'tiny' }],
  });
  assert.match(html, /tiny/);
});
