// Frontend tests for the MIQ Quick Preview section that wraps the medical
// image preview component on the MRI Analysis page.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  renderQuickPreviewSection,
  mountQuickPreviewSection,
} from './mri-quick-preview-section.js';

function fakeContainer() {
  // Minimal DOM-like stub: a single shared registry of fake child elements
  // keyed by id, so any querySelector('#x') call on the container or on a
  // returned fake returns the same instance. Sufficient for the production
  // code which only does querySelector('#root-id') and then
  // rootEl.querySelector('#result-id').
  const subEls = {};
  function getOrCreate(id) {
    if (!subEls[id]) {
      const handlers = {};
      const el = {
        id: id,
        innerHTML: '',
        _handlers: handlers,
        addEventListener: function (type, fn) {
          handlers[type] = fn;
        },
        dispatch: function (type, ev) {
          const fn = handlers[type];
          if (fn) return fn(ev);
          return null;
        },
        querySelector: function (sel) {
          if (typeof sel !== 'string') return null;
          const inner = sel.startsWith('#') ? sel.slice(1) : sel;
          return getOrCreate(inner);
        },
      };
      subEls[id] = el;
    }
    return subEls[id];
  }
  const container = {
    innerHTML: '',
    querySelector: function (sel) {
      if (typeof sel !== 'string') return null;
      const id = sel.startsWith('#') ? sel.slice(1) : sel;
      return getOrCreate(id);
    },
  };
  return container;
}

test('renderQuickPreviewSection includes file input and result placeholder', function () {
  const html = renderQuickPreviewSection();
  assert.match(html, /mri-quick-preview-section/);
  assert.match(html, /mri-quick-preview-input/);
  assert.match(html, /accept="\.nii,\.nii\.gz"/);
  assert.match(html, /mri-quick-preview-result/);
  assert.match(html, /non-diagnostic/i);
});

test('mountQuickPreviewSection sets innerHTML and returns rootEl', function () {
  const c = fakeContainer();
  const out = mountQuickPreviewSection(c);
  assert.match(c.innerHTML, /mri-quick-preview-section/);
  assert.ok(out && out.rootEl, 'expected rootEl to be returned');
});

test('mountQuickPreviewSection wires file change to api.previewMedicalImage and renders result', async function () {
  const c = fakeContainer();
  const sampleResponse = {
    id: 'img_sample',
    filename: 'demo.nii.gz',
    format: 'NIfTI',
    status: 'ready',
    metadata: {
      filename: 'demo.nii.gz',
      format: 'NIfTI',
      dimensions: [128, 128, 96],
      voxel_size_mm: [1.0, 1.0, 1.0],
      datatype: 'int16',
    },
    preview: {
      axial_url: '/a.png',
      coronal_url: '/c.png',
      sagittal_url: '/s.png',
    },
  };
  const calls = [];
  const fakeApi = {
    previewMedicalImage: function (args) {
      calls.push(args);
      return Promise.resolve(sampleResponse);
    },
  };
  mountQuickPreviewSection(c, { api: fakeApi });
  const fileInput = c.querySelector('#ds-mri-quick-preview-file');
  const fakeFile = { name: 'demo.nii.gz', size: 1024 };
  await fileInput.dispatch('change', { target: { files: [fakeFile] } });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].file, fakeFile);
  const result = c.querySelector('#ds-mri-quick-preview-result');
  assert.match(result.innerHTML, /medical-image-slice-axial/);
  assert.match(result.innerHTML, /demo\.nii\.gz/);
});

test('mountQuickPreviewSection renders error state when api rejects', async function () {
  const c = fakeContainer();
  const fakeApi = {
    previewMedicalImage: function () {
      return Promise.reject(new Error('bad upload'));
    },
  };
  mountQuickPreviewSection(c, { api: fakeApi });
  const fileInput = c.querySelector('#ds-mri-quick-preview-file');
  const fakeFile = { name: 'evil.nii.gz', size: 10 };
  await fileInput.dispatch('change', { target: { files: [fakeFile] } });
  const result = c.querySelector('#ds-mri-quick-preview-result');
  assert.match(result.innerHTML, /medical-image-error/);
  assert.match(result.innerHTML, /bad upload/);
});

test('mountQuickPreviewSection no-ops on empty file selection', async function () {
  const c = fakeContainer();
  const calls = [];
  const fakeApi = {
    previewMedicalImage: function (args) {
      calls.push(args);
      return Promise.resolve({});
    },
  };
  mountQuickPreviewSection(c, { api: fakeApi });
  const fileInput = c.querySelector('#ds-mri-quick-preview-file');
  await fileInput.dispatch('change', { target: { files: [] } });
  assert.equal(calls.length, 0);
});

test('renderQuickPreviewSection never emits diagnostic claim verbs', function () {
  const html = renderQuickPreviewSection().toLowerCase();
  for (const term of ['lesion', 'atrophy', 'tumour', 'tumor', 'demyelination', 'infarct']) {
    assert.ok(!html.includes(term), 'quick-preview leaked diagnostic term ' + term);
  }
});
