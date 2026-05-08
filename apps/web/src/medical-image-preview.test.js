// Frontend tests for the MIQ-inspired Medical Imaging Preview component.
// Run with `node --test src/medical-image-preview.test.js` (matches the
// existing apps/web/package.json `test:unit` harness).
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  renderMedicalImagePreview,
  buildMedicalImageContextSentence,
  PREVIEW_DISCLAIMER,
} from './medical-image-preview.js';

const READY_PAYLOAD = {
  id: 'img_abc',
  filename: 'brain.nii.gz',
  format: 'NIfTI',
  status: 'ready',
  metadata: {
    filename: 'brain.nii.gz',
    format: 'NIfTI',
    dimensions: [256, 256, 176],
    voxel_size_mm: [1.0, 1.0, 1.0],
    volumes: 1,
    datatype: 'float32',
    orientation_note: 'Raw orientation preview; not reoriented.',
    file_size_bytes: 1024 * 1024 * 12,
    compressed: true,
    qform_code: 1,
    sform_code: 1,
    warnings: [
      'Preview only; not diagnostic.',
      'Automated MRI interpretation not performed.',
    ],
  },
  preview: {
    axial_url: '/api/v1/medical-images/img_abc/slices/axial.png',
    coronal_url: '/api/v1/medical-images/img_abc/slices/coronal.png',
    sagittal_url: '/api/v1/medical-images/img_abc/slices/sagittal.png',
  },
  warnings: [
    'Preview only; not diagnostic.',
    'Automated MRI interpretation not performed.',
  ],
};

test('renderMedicalImagePreview renders the non-diagnostic banner', function () {
  const html = renderMedicalImagePreview(READY_PAYLOAD);
  assert.match(html, /medical-image-disclaimer/);
  assert.match(html, /Preview only/i);
  assert.match(html, /not diagnostic/i);
});

test('renderMedicalImagePreview renders all three slice planes', function () {
  const html = renderMedicalImagePreview(READY_PAYLOAD);
  assert.match(html, /medical-image-slice-axial/);
  assert.match(html, /medical-image-slice-coronal/);
  assert.match(html, /medical-image-slice-sagittal/);
  assert.match(html, /\/slices\/axial\.png/);
});

test('renderMedicalImagePreview renders the metadata panel with key fields', function () {
  const html = renderMedicalImagePreview(READY_PAYLOAD);
  assert.match(html, /medical-image-metadata/);
  assert.match(html, /256 × 256 × 176/);
  assert.match(html, /1\.00 × 1\.00 × 1\.00 mm/);
  assert.match(html, /float32/);
});

test('renderMedicalImagePreview shows the loading state when payload is missing', function () {
  const html = renderMedicalImagePreview({ state: 'loading' });
  assert.match(html, /medical-image-loading/);
  assert.match(html, /Generating preview/);
  // Even loading state must still carry the preview-only banner.
  assert.match(html, /Preview only/i);
});

test('renderMedicalImagePreview shows the unsupported state', function () {
  const html = renderMedicalImagePreview({ state: 'unsupported', filename: 'notes.txt' });
  assert.match(html, /medical-image-unsupported/);
  assert.match(html, /notes\.txt/);
});

test('renderMedicalImagePreview shows the error state', function () {
  const html = renderMedicalImagePreview({ status: 'error', error: 'parse failed' });
  assert.match(html, /medical-image-error/);
  assert.match(html, /parse failed/);
});

test('renderMedicalImagePreview escapes HTML in filename', function () {
  const evil = { ...READY_PAYLOAD, filename: '<script>alert(1)</script>.nii' };
  const html = renderMedicalImagePreview(evil);
  assert.ok(!html.includes('<script>alert(1)'));
  assert.match(html, /&lt;script&gt;/);
});

test('renderMedicalImagePreview uses patient-friendly wording when audience=patient', function () {
  const html = renderMedicalImagePreview(READY_PAYLOAD, { audience: 'patient' });
  assert.match(html, /does not diagnose/i);
});

test('renderMedicalImagePreview never includes diagnostic claims about the volume', function () {
  // Even if a clinician note is plumbed into the payload, the component
  // must NOT render diagnostic verbs (lesion, atrophy, tumour, etc) on its
  // own — those words may only appear when the report layer renders the
  // verbatim clinician note (separate component).
  const html = renderMedicalImagePreview(READY_PAYLOAD).toLowerCase();
  for (const term of ['lesion', 'atrophy', 'tumour', 'tumor', 'neuroinflammation']) {
    assert.ok(!html.includes(term), `unexpected diagnostic term in preview HTML: ${term}`);
  }
});

test('renderMedicalImagePreview surfaces warnings list', function () {
  const html = renderMedicalImagePreview(READY_PAYLOAD);
  assert.match(html, /medical-image-warnings/);
  assert.match(html, /Automated MRI interpretation not performed/);
});

test('renderMedicalImagePreview metadata-only status shows explicit notice', function () {
  const html = renderMedicalImagePreview({
    ...READY_PAYLOAD,
    status: 'metadata_only',
    preview: { axial_url: null, coronal_url: null, sagittal_url: null },
  });
  assert.match(html, /medical-image-metadata-only/);
  assert.match(html, /Metadata only/);
});

test('buildMedicalImageContextSentence returns the safe sentence when present', function () {
  const sentence = buildMedicalImageContextSentence({
    available: true,
    preview_status: 'ready',
    safe_report_sentence: 'A non-diagnostic preview was generated.',
  });
  assert.equal(sentence, 'A non-diagnostic preview was generated.');
});

test('buildMedicalImageContextSentence falls back to unavailable wording', function () {
  const sentence = buildMedicalImageContextSentence(null);
  assert.match(sentence, /No MRI/);
});

test('buildMedicalImageContextSentence never emits diagnostic words', function () {
  const cases = [
    null,
    {},
    { available: false },
    { available: true, preview_status: 'metadata_only' },
    { available: true, preview_status: 'ready' },
  ];
  for (const ctx of cases) {
    const sentence = buildMedicalImageContextSentence(ctx).toLowerCase();
    for (const term of ['lesion', 'atrophy', 'tumour', 'tumor', 'neuroinflammation']) {
      assert.ok(
        !sentence.includes(term),
        `safe sentence leaked diagnostic term ${term} for ctx=${JSON.stringify(ctx)}`,
      );
    }
  }
});

test('PREVIEW_DISCLAIMER mentions non-diagnostic + clinician/radiology review', function () {
  assert.match(PREVIEW_DISCLAIMER, /not diagnostic/i);
  assert.match(PREVIEW_DISCLAIMER, /radiology|clinical/i);
});
