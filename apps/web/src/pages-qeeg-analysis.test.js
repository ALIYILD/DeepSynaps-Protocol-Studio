// pages-qeeg-analysis.test.js — Wave-7 pinning tests (PR 99/N)
//
// Pins public exports, clinical-safety helpers, and key rendering logic
// from pages-qeeg-analysis.js without a real DOM.

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

// ── Browser stubs ─────────────────────────────────────────────────────────────
if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;

const _lsStore = {};
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true, writable: true,
  value: {
    getItem(k) { return Object.prototype.hasOwnProperty.call(_lsStore, k) ? _lsStore[k] : null; },
    setItem(k, v) { _lsStore[k] = String(v); },
    removeItem(k) { delete _lsStore[k]; },
  },
});
Object.defineProperty(globalThis, 'sessionStorage', {
  configurable: true, writable: true,
  value: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
});
if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => ({ style: {}, addEventListener() {}, appendChild() {} }),
    body: { appendChild() {} },
    addEventListener: () => {},
  };
}
if (typeof globalThis.URL === 'undefined') {
  globalThis.URL = {
    createObjectURL: () => 'blob:mock',
    revokeObjectURL: () => {},
  };
}
if (typeof globalThis.fetch === 'undefined') {
  globalThis.fetch = async () => { throw new Error('fetch not stubbed'); };
}
if (typeof globalThis.import === 'undefined') {
  globalThis.import = { meta: { env: { DEV: false } } };
}

const mod = await import('./pages-qeeg-analysis.js');

// ── 1. Export presence ────────────────────────────────────────────────────────
describe('pages-qeeg-analysis public exports', () => {
  it('exports _aiUpgradesFeatureFlagEnabled as a function', () => {
    assert.strictEqual(typeof mod._aiUpgradesFeatureFlagEnabled, 'function');
  });

  it('exports _canRenderQEEGPrintableReport as a function', () => {
    assert.strictEqual(typeof mod._canRenderQEEGPrintableReport, 'function');
  });

  it('exports _qeegAnalysisIsSyntheticDemo as a function', () => {
    assert.strictEqual(typeof mod._qeegAnalysisIsSyntheticDemo, 'function');
  });

  it('exports _qeegReportIsSyntheticDemo as a function', () => {
    assert.strictEqual(typeof mod._qeegReportIsSyntheticDemo, 'function');
  });

  it('exports _getQEEGReportPdfUrl as a function', () => {
    assert.strictEqual(typeof mod._getQEEGReportPdfUrl, 'function');
  });

  it('exports renderCompareSelectionSummary as a function', () => {
    assert.strictEqual(typeof mod.renderCompareSelectionSummary, 'function');
  });

  it('exports renderFusionSummaryCard as a function', () => {
    assert.strictEqual(typeof mod.renderFusionSummaryCard, 'function');
  });

  it('exports _mneFeatureFlagEnabled as a function', () => {
    assert.strictEqual(typeof mod._mneFeatureFlagEnabled, 'function');
  });

  it('exports renderPipelineQualityStrip as a function', () => {
    assert.strictEqual(typeof mod.renderPipelineQualityStrip, 'function');
  });

  it('exports linkifyCitations as a function', () => {
    assert.strictEqual(typeof mod.linkifyCitations, 'function');
  });

  it('exports renderLiteratureRefs as a function', () => {
    assert.strictEqual(typeof mod.renderLiteratureRefs, 'function');
  });

  it('exports renderAINarrativeWithCitations as a function', () => {
    assert.strictEqual(typeof mod.renderAINarrativeWithCitations, 'function');
  });

  it('exports renderQEEGDecisionSupport as a function', () => {
    assert.strictEqual(typeof mod.renderQEEGDecisionSupport, 'function');
  });

  it('exports renderQEEGRawFlightDeck as a function', () => {
    assert.strictEqual(typeof mod.renderQEEGRawFlightDeck, 'function');
  });

  it('exports TAB_META as an object', () => {
    assert.strictEqual(typeof mod.TAB_META, 'object');
    assert.ok(mod.TAB_META !== null);
  });

  it('exports pgQEEGAnalysis as an async function', () => {
    assert.strictEqual(typeof mod.pgQEEGAnalysis, 'function');
  });

  it('TAB_META has expected tab keys', () => {
    const keys = Object.keys(mod.TAB_META);
    assert.ok(keys.includes('patient'), 'patient tab present');
    assert.ok(keys.includes('analysis'), 'analysis tab present');
    assert.ok(keys.includes('report'), 'report tab present');
    assert.ok(keys.includes('compare'), 'compare tab present');
  });
});

describe('renderQEEGRawFlightDeck', () => {
  it('renders a live raw-EEG command deck with real import formats', () => {
    const html = mod.renderQEEGRawFlightDeck(null, null);
    assert.match(html, /Raw EEG Flight Deck/);
    assert.match(html, /Upload Raw EEG/);
    assert.match(html, /Open Raw Workbench/);
    assert.match(html, /Teach \/ Learn EEG/);
    assert.match(html, /BrainVision/);
    assert.match(html, /EDF\/BDF/);
  });

  it('shows recording-linked actions when a recording is selected', () => {
    const html = mod.renderQEEGRawFlightDeck('patient-1', 'analysis-1');
    assert.match(html, /Open AI Report/);
    assert.match(html, /Recording loaded/);
  });
});

// ── 2. Feature flag helpers ───────────────────────────────────────────────────
describe('_aiUpgradesFeatureFlagEnabled', () => {
  it('returns true when flag not set', () => {
    delete globalThis.DEEPSYNAPS_ENABLE_AI_UPGRADES;
    assert.strictEqual(mod._aiUpgradesFeatureFlagEnabled(), true);
  });

  it('returns false when flag is boolean false', () => {
    globalThis.DEEPSYNAPS_ENABLE_AI_UPGRADES = false;
    assert.strictEqual(mod._aiUpgradesFeatureFlagEnabled(), false);
    delete globalThis.DEEPSYNAPS_ENABLE_AI_UPGRADES;
  });

  it('returns false when flag is string "false"', () => {
    globalThis.DEEPSYNAPS_ENABLE_AI_UPGRADES = 'false';
    assert.strictEqual(mod._aiUpgradesFeatureFlagEnabled(), false);
    delete globalThis.DEEPSYNAPS_ENABLE_AI_UPGRADES;
  });
});

describe('_mneFeatureFlagEnabled', () => {
  it('returns true when flag not set', () => {
    delete globalThis.DEEPSYNAPS_ENABLE_MNE;
    assert.strictEqual(mod._mneFeatureFlagEnabled(), true);
  });

  it('returns false when flag is string "0"', () => {
    globalThis.DEEPSYNAPS_ENABLE_MNE = '0';
    assert.strictEqual(mod._mneFeatureFlagEnabled(), false);
    delete globalThis.DEEPSYNAPS_ENABLE_MNE;
  });
});

// ── 3. Synthetic-demo detection ───────────────────────────────────────────────
describe('_qeegAnalysisIsSyntheticDemo', () => {
  it('returns false for null input', () => {
    assert.strictEqual(mod._qeegAnalysisIsSyntheticDemo(null), false);
  });

  it('returns true when is_synthetic_demo === true', () => {
    assert.strictEqual(mod._qeegAnalysisIsSyntheticDemo({ is_synthetic_demo: true }), true);
  });

  it('returns true when norm_db_version is toy-0.1', () => {
    assert.strictEqual(mod._qeegAnalysisIsSyntheticDemo({ norm_db_version: 'toy-0.1' }), true);
  });

  it('returns true when id === "demo"', () => {
    assert.strictEqual(mod._qeegAnalysisIsSyntheticDemo({ id: 'demo' }), true);
  });

  it('returns false for real analysis object', () => {
    assert.strictEqual(mod._qeegAnalysisIsSyntheticDemo({ id: 'real-abc123', norm_db_version: 'v2.3' }), false);
  });
});

describe('_qeegReportIsSyntheticDemo', () => {
  it('returns true when report id starts with "demo"', () => {
    assert.strictEqual(mod._qeegReportIsSyntheticDemo({ id: 'demo-report-1' }, null), true);
  });

  it('delegates to analysis check when report has non-demo id', () => {
    assert.strictEqual(
      mod._qeegReportIsSyntheticDemo({ id: 'r-123' }, { is_synthetic_demo: true }),
      true
    );
  });
});

// ── 4. _canRenderQEEGPrintableReport ─────────────────────────────────────────
describe('_canRenderQEEGPrintableReport', () => {
  it('returns false when both are null', () => {
    assert.strictEqual(mod._canRenderQEEGPrintableReport(null, null), false);
  });

  it('returns false when analysis lacks id', () => {
    assert.strictEqual(mod._canRenderQEEGPrintableReport({ id: 'r1' }, {}), false);
  });

  it('returns true when both report and analysis have ids', () => {
    assert.strictEqual(mod._canRenderQEEGPrintableReport({ id: 'r1' }, { id: 'a1' }), true);
  });
});

// ── 5. _getQEEGReportPdfUrl ───────────────────────────────────────────────────
describe('_getQEEGReportPdfUrl', () => {
  it('returns null for null report', () => {
    assert.strictEqual(mod._getQEEGReportPdfUrl(null, {}), null);
  });

  it('prefers report_pdf_url when present', () => {
    const url = 'https://cdn.example.com/report.pdf';
    assert.strictEqual(mod._getQEEGReportPdfUrl({ report_pdf_url: url }, {}), url);
  });

  it('falls back to pdf_url', () => {
    const url = 'https://cdn.example.com/pdf.pdf';
    assert.strictEqual(mod._getQEEGReportPdfUrl({ pdf_url: url }, {}), url);
  });
});

// ── 6. renderCompareSelectionSummary ─────────────────────────────────────────
describe('renderCompareSelectionSummary', () => {
  it('returns empty string when either arg is null', () => {
    assert.strictEqual(mod.renderCompareSelectionSummary(null, {}), '');
    assert.strictEqual(mod.renderCompareSelectionSummary({}, null), '');
  });

  it('renders baseline and follow-up labels', () => {
    const baseline = { id: 'b1', original_filename: 'baseline.edf', analyzed_at: '2026-01-01T10:00:00Z' };
    const followup = { id: 'f1', original_filename: 'followup.edf', analyzed_at: '2026-02-01T10:00:00Z' };
    const html = mod.renderCompareSelectionSummary(baseline, followup);
    assert.match(html, /Baseline/);
    assert.match(html, /Follow-up/);
    assert.match(html, /baseline\.edf/);
    assert.match(html, /followup\.edf/);
  });

  it('reports same-day comparison when timestamps match', () => {
    const ts = '2026-03-15T08:00:00Z';
    const html = mod.renderCompareSelectionSummary({ id: 'x', analyzed_at: ts }, { id: 'y', analyzed_at: ts });
    assert.match(html, /Same-day comparison/);
  });
});

// ── 7. renderPipelineQualityStrip ─────────────────────────────────────────────
describe('renderPipelineQualityStrip', () => {
  it('returns empty string when analysis has no quality_metrics', () => {
    assert.strictEqual(mod.renderPipelineQualityStrip({}), '');
    assert.strictEqual(mod.renderPipelineQualityStrip(null), '');
  });

  it('renders bad-channel count pill', () => {
    const html = mod.renderPipelineQualityStrip({
      quality_metrics: { bad_channels: ['Fp1', 'T3'], ica_components_dropped: 2 },
    });
    assert.match(html, /Bad channels/);
    assert.match(html, /2/);
  });

  it('renders pipeline version badge when present', () => {
    const html = mod.renderPipelineQualityStrip({
      quality_metrics: {},
      pipeline_version: 'v2.1.0',
    });
    assert.match(html, /v2\.1\.0/);
  });
});

// ── 8. linkifyCitations ───────────────────────────────────────────────────────
describe('linkifyCitations', () => {
  it('returns empty string for falsy input', () => {
    assert.strictEqual(mod.linkifyCitations('', {}), '');
    assert.strictEqual(mod.linkifyCitations(null, {}), '');
  });

  it('returns unmodified text when refIndex is null', () => {
    const text = 'Some text [1] and [2].';
    assert.strictEqual(mod.linkifyCitations(text, null), text);
  });

  it('linkifies known citations with URLs', () => {
    const refIdx = { '1': { url: 'https://pubmed.ncbi.nlm.nih.gov/12345/' } };
    const html = mod.linkifyCitations('Finding [1] noted.', refIdx);
    assert.match(html, /href="https:\/\/pubmed\.ncbi\.nlm\.nih\.gov\/12345\/"/);
    assert.match(html, /class="qeeg-mne-cite"/);
  });

  it('leaves unknown citation numbers as plain text', () => {
    const html = mod.linkifyCitations('See [99].', { '1': { url: 'https://x.com' } });
    assert.doesNotMatch(html, /href/);
    assert.match(html, /\[99\]/);
  });
});

// ── 9. renderLiteratureRefs ───────────────────────────────────────────────────
describe('renderLiteratureRefs', () => {
  it('returns empty string for empty array', () => {
    assert.strictEqual(mod.renderLiteratureRefs([]), '');
    assert.strictEqual(mod.renderLiteratureRefs(null), '');
  });

  it('renders a reference list with title and link', () => {
    const refs = [{ n: 1, title: 'A key paper', url: 'https://doi.org/10.1000/xyz', year: 2024 }];
    const html = mod.renderLiteratureRefs(refs);
    assert.match(html, /A key paper/);
    assert.match(html, /https:\/\/doi\.org\/10\.1000\/xyz/);
    assert.match(html, /2024/);
    assert.match(html, /Literature/);
  });

  it('sorts refs by n ascending', () => {
    const refs = [
      { n: 3, title: 'Third', url: 'https://a.com' },
      { n: 1, title: 'First', url: 'https://b.com' },
    ];
    const html = mod.renderLiteratureRefs(refs);
    const firstPos = html.indexOf('First');
    const thirdPos = html.indexOf('Third');
    assert.ok(firstPos < thirdPos, 'first ref appears before third');
  });
});
