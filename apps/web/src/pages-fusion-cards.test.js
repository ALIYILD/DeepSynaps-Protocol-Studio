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

const qeeg = await import('./pages-qeeg-analysis.js');
const mri = await import('./pages-mri-analysis.js');

test('qEEG fusion card renders partial-state guidance when MRI is missing', () => {
  const html = qeeg.renderFusionSummaryCard({
    patient_id: 'pat-1',
    qeeg_analysis_id: 'qeeg-1',
    mri_analysis_id: null,
    recommendations: ['Add MRI targeting to upgrade this into a dual-modality recommendation.'],
    summary: 'Partial fusion available from one modality only. Add MRI data to strengthen target confidence.',
    confidence: 0.4,
    confidence_disclaimer: 'Confidence score is algorithmic heuristic and not evidence-graded clinical validation. Always review recommendations against patient-specific context.',
    confidence_grade: 'heuristic',
  }, 'pat-1');

  assert.match(html, /Fusion summary/);
  assert.match(html, /Partial fusion available/);
  assert.match(html, /Add MRI targeting/);
  assert.match(html, /heuristic/);
});

test('MRI fusion card renders dual-modality summary and confidence badge', () => {
  const html = mri.renderFusionSummaryCard({
    patient_id: 'pat-2',
    qeeg_analysis_id: 'qeeg-2',
    mri_analysis_id: 'mri-2',
    recommendations: ['Combine the qEEG-informed protocol with MRI-guided targeting at Left DLPFC.'],
    summary: 'Dual-modality fusion available. qEEG and MRI signals were combined into a single planning summary.',
    confidence: 0.72,
    confidence_disclaimer: 'Confidence score is algorithmic heuristic and not evidence-graded clinical validation. Always review recommendations against patient-specific context.',
    confidence_grade: 'heuristic',
  }, 'pat-2');

  assert.match(html, /Dual-modality fusion available/);
  assert.match(html, /qEEG ready/);
  assert.match(html, /MRI ready/);
  assert.match(html, /confidence 72%/);
  assert.match(html, /heuristic/);
});
