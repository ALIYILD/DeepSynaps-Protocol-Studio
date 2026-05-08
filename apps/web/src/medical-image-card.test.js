// Frontend tests for the embeddable Medical Imaging card.
// Run with `node --test src/medical-image-card.test.js`.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  renderMedicalImageCard,
  mountMedicalImageCard,
  MEDICAL_IMAGE_CARD_DISCLAIMER,
} from './medical-image-card.js';

const SAMPLE_IMAGE = {
  id: 'img_xyz',
  filename: 'patient_brain.nii.gz',
  format: 'NIfTI',
  status: 'ready',
  uploaded_at: '2026-04-01T10:00:00Z',
  metadata: {
    filename: 'patient_brain.nii.gz',
    format: 'NIfTI',
    dimensions: [256, 256, 176],
    voxel_size_mm: [1.0, 1.0, 1.0],
    volumes: 1,
    datatype: 'float32',
    file_size_bytes: 1024 * 1024 * 8,
    compressed: true,
  },
  preview: {
    axial_url: '/api/v1/medical-images/img_xyz/slices/axial.png',
    coronal_url: '/api/v1/medical-images/img_xyz/slices/coronal.png',
    sagittal_url: '/api/v1/medical-images/img_xyz/slices/sagittal.png',
  },
};

const DIAGNOSTIC_TERMS = [
  'lesion',
  'atrophy',
  'tumour',
  'tumor',
  'neuroinflammation',
  'infarct',
  'demyelination',
  'cortical thinning',
];

function fakeElement() {
  const el = {
    innerHTML: '',
  };
  return el;
}

function makeApi(images, opts) {
  const calls = [];
  const o = opts || {};
  return {
    calls: calls,
    listPatientMedicalImages: function (patientId) {
      calls.push(patientId);
      if (o.reject) return Promise.reject(new Error(o.reject));
      return Promise.resolve(o.shape === 'array' ? images : { images: images });
    },
  };
}

test('renderMedicalImageCard empty state renders the non-diagnostic banner', function () {
  const html = renderMedicalImageCard({ images: [] });
  assert.match(html, /medical-image-card-disclaimer/);
  assert.match(html, /Preview only/i);
  assert.match(html, /not diagnostic/i);
  assert.match(html, /No imaging available|Upload/i);
});

test('renderMedicalImageCard empty state for null images', function () {
  const html = renderMedicalImageCard({ images: null });
  assert.match(html, /medical-image-card-empty/);
});

test('renderMedicalImageCard populated state renders filename, format, dimensions', function () {
  const html = renderMedicalImageCard({ images: [SAMPLE_IMAGE], patientId: 'p1' });
  assert.match(html, /patient_brain\.nii\.gz/);
  assert.match(html, /NIfTI/);
  assert.match(html, /256 × 256 × 176/);
  assert.match(html, /medical-image-card-link/);
  assert.match(html, /\/mri-analysis\?image_id=img_xyz/);
});

test('renderMedicalImageCard patient audience uses softer wording', function () {
  const html = renderMedicalImageCard({ images: [], audience: 'patient' });
  assert.match(html, /uploaded by your clinician|appears here/i);
  assert.match(html, /does not diagnose/i);
});

test('renderMedicalImageCard clinician audience shows datatype and file size', function () {
  const html = renderMedicalImageCard({ images: [SAMPLE_IMAGE], audience: 'clinician' });
  assert.match(html, /Datatype/);
  assert.match(html, /float32/);
  assert.match(html, /File size/);
  assert.match(html, /8 MB|8\.0 MB/);
});

test('renderMedicalImageCard patient audience does NOT show technical fields', function () {
  const html = renderMedicalImageCard({ images: [SAMPLE_IMAGE], audience: 'patient' });
  assert.ok(!html.includes('Datatype'), 'patient view leaked datatype field');
  assert.ok(!html.includes('float32'), 'patient view leaked datatype value');
});

test('renderMedicalImageCard escapes HTML in filename', function () {
  const evil = Object.assign({}, SAMPLE_IMAGE, {
    filename: '<script>alert(1)</script>.nii.gz',
  });
  const html = renderMedicalImageCard({ images: [evil] });
  assert.ok(!html.includes('<script>alert(1)'), 'script tag leaked into card HTML');
  assert.match(html, /&lt;script&gt;/);
});

test('renderMedicalImageCard never emits diagnostic terms across audience/state combos', function () {
  const inputs = [
    { images: [], audience: 'clinician' },
    { images: [], audience: 'patient' },
    { images: [SAMPLE_IMAGE], audience: 'clinician' },
    { images: [SAMPLE_IMAGE], audience: 'patient' },
    { images: [Object.assign({}, SAMPLE_IMAGE, { status: 'metadata_only' })], audience: 'clinician' },
    { images: [Object.assign({}, SAMPLE_IMAGE, { status: 'error' })], audience: 'patient' },
  ];
  for (const args of inputs) {
    const html = renderMedicalImageCard(args).toLowerCase();
    for (const term of DIAGNOSTIC_TERMS) {
      assert.ok(
        !html.includes(term),
        'card leaked diagnostic term ' + term + ' for args=' + JSON.stringify({
          audience: args.audience,
          n: args.images && args.images.length,
          status: args.images && args.images[0] && args.images[0].status,
        }),
      );
    }
  }
});

test('renderMedicalImageCard picks the latest image when multiple are present', function () {
  const older = Object.assign({}, SAMPLE_IMAGE, {
    id: 'img_older',
    filename: 'older.nii.gz',
    uploaded_at: '2026-01-01T00:00:00Z',
  });
  const newer = Object.assign({}, SAMPLE_IMAGE, {
    id: 'img_newer',
    filename: 'newer.nii.gz',
    uploaded_at: '2026-04-01T00:00:00Z',
  });
  const html = renderMedicalImageCard({ images: [older, newer] });
  assert.match(html, /newer\.nii\.gz/);
  assert.ok(!html.includes('older.nii.gz'));
});

test('mountMedicalImageCard calls api.listPatientMedicalImages with the patient id', async function () {
  const fake = makeApi([SAMPLE_IMAGE]);
  const el = fakeElement();
  await mountMedicalImageCard(el, { patientId: 'p_42', api: fake });
  assert.deepEqual(fake.calls, ['p_42']);
  assert.match(el.innerHTML, /patient_brain\.nii\.gz/);
});

test('mountMedicalImageCard accepts a bare-array index response', async function () {
  const fake = makeApi([SAMPLE_IMAGE], { shape: 'array' });
  const el = fakeElement();
  await mountMedicalImageCard(el, { patientId: 'p_array', api: fake });
  assert.match(el.innerHTML, /patient_brain\.nii\.gz/);
});

test('mountMedicalImageCard renders error-card without throwing on api rejection', async function () {
  const fake = makeApi([], { reject: 'network down' });
  const el = fakeElement();
  await mountMedicalImageCard(el, { patientId: 'p_err', api: fake });
  assert.match(el.innerHTML, /medical-image-card-warning/);
  assert.match(el.innerHTML, /network down/);
  assert.match(el.innerHTML, /Preview only/i);
});

test('mountMedicalImageCard with no patientId renders the empty card', async function () {
  const fake = makeApi([SAMPLE_IMAGE]);
  const el = fakeElement();
  await mountMedicalImageCard(el, { audience: 'patient', api: fake });
  assert.deepEqual(fake.calls, []);
  assert.match(el.innerHTML, /medical-image-card-empty/);
});

test('MEDICAL_IMAGE_CARD_DISCLAIMER mentions non-diagnostic + radiology/clinical', function () {
  assert.match(MEDICAL_IMAGE_CARD_DISCLAIMER, /not diagnostic/i);
  assert.match(MEDICAL_IMAGE_CARD_DISCLAIMER, /radiology|clinical/i);
});
