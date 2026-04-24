// ─────────────────────────────────────────────────────────────────────────────
// pages-mri-analysis-qc.test.js
//
// Unit tests for the radiology screening layer (AI_UPGRADES §P0 #5):
//   * renderQCWarningsBanner — amber banner appears iff qc.incidental is
//     flagged OR report.qc_warnings is non-empty.
//   * renderMRIQCChips      — CNR / SNR / FD chip strip, shown only when
//     qc.mriqc.status === 'ok'.
//
// Run: npm run test:unit  (or: node --test src/pages-mri-analysis-qc.test.js)
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
const { renderQCWarningsBanner, renderMRIQCChips } = mod;

// ── renderQCWarningsBanner ─────────────────────────────────────────────────
test('renderQCWarningsBanner is empty when QC is clean', () => {
  const report = {
    qc_warnings: [],
    qc: {
      passed: true,
      mriqc: { status: 'ok', passes_threshold: true, cnr: 3, snr: 15 },
      incidental: { status: 'ok', findings: [], any_flagged: false },
    },
  };
  assert.equal(renderQCWarningsBanner(report), '');
});

test('renderQCWarningsBanner surfaces findings when incidental.any_flagged', () => {
  const report = {
    qc_warnings: [],
    qc: {
      incidental: {
        status: 'ok',
        any_flagged: true,
        findings: [
          {
            finding_type: 'wmh',
            location_region: 'left periventricular',
            severity: 'moderate',
            confidence: 0.81,
            requires_radiologist_review: true,
          },
        ],
      },
    },
  };
  const html = renderQCWarningsBanner(report);
  assert.match(html, /ds-mri-qc-banner/);
  assert.match(html, /Radiology review advised/);
  assert.match(html, /WMH/);
  assert.match(html, /periventricular/);
  // Non-diagnostic copy.
  assert.match(html, /Clinical reference only/);
  assert.doesNotMatch(html, /diagnosis/i);
  assert.doesNotMatch(html, /treatment recommendation/i);
});

test('renderQCWarningsBanner respects pre-built qc_warnings list', () => {
  const report = {
    qc_warnings: ['Scan quality below MRIQC thresholds — radiology review advised.'],
    qc: {},
  };
  const html = renderQCWarningsBanner(report);
  assert.match(html, /Scan quality below MRIQC thresholds/);
});

test('renderQCWarningsBanner does NOT show a banner when only qc.passed=false', () => {
  // Legacy `qc.passed` alone should not trigger the new radiology banner —
  // that is the existing small "QC failed" pill, not the amber warnings.
  const report = {
    qc_warnings: [],
    qc: { passed: false },
  };
  assert.equal(renderQCWarningsBanner(report), '');
});

// ── renderMRIQCChips ───────────────────────────────────────────────────────
test('renderMRIQCChips is empty when status is not ok', () => {
  const report = {
    qc: { mriqc: { status: 'dependency_missing' } },
  };
  assert.equal(renderMRIQCChips(report), '');
});

test('renderMRIQCChips renders CNR / SNR / FD chips when status=ok', () => {
  const report = {
    qc: {
      mriqc: {
        status: 'ok',
        cnr: 3.12,
        snr: 15.6,
        motion_mean_fd_mm: 0.21,
        fwhm_mm: 3.9,
        passes_threshold: true,
      },
    },
  };
  const html = renderMRIQCChips(report);
  assert.match(html, /ds-mri-qc-chipstrip/);
  assert.match(html, /CNR/);
  assert.match(html, /SNR/);
  assert.match(html, /FD/);
  assert.match(html, /thresholds passed/);
});

test('renderMRIQCChips surfaces below-threshold chip in amber', () => {
  const report = {
    qc: {
      mriqc: {
        status: 'ok',
        snr: 5.0,
        cnr: 2.0,
        passes_threshold: false,
      },
    },
  };
  const html = renderMRIQCChips(report);
  assert.match(html, /below threshold/);
});
