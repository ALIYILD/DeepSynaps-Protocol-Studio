// mri-quick-preview-section.js — MIQ Quick Preview surface for the MRI Analysis page.
//
// Wraps medical-image-preview.js + api.previewMedicalImage() into a self-
// contained section so the existing 3.7k-line pages-mri-analysis.js stays
// untouched aside from a single import + mount call. Non-diagnostic.

import { api as defaultApi } from './api.js';
import { renderMedicalImagePreview } from './medical-image-preview.js';

const ROOT_ID = 'ds-mri-quick-preview-root';
const FILE_INPUT_ID = 'ds-mri-quick-preview-file';
const RESULT_ID = 'ds-mri-quick-preview-result';

function esc(v) {
  if (v == null) return '';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Render the Quick Preview section as an HTML string.
 *
 * The result is a self-contained `<section>` carrying its own preview-only
 * banner; the embedded preview component carries its own banner too.
 */
export function renderQuickPreviewSection() {
  return (
    '<section data-testid="mri-quick-preview-section" ' +
    'aria-label="MIQ Quick Preview (non-diagnostic)" ' +
    'id="' + ROOT_ID + '" ' +
    'style="margin:16px 0;padding:14px;border-radius:10px;' +
    'background:var(--bg-elevated,#111);border:1px solid var(--border-subtle,#222);' +
    'color:var(--text-primary,#eee);font-family:inherit">' +
    '<h3 style="margin:0 0 4px;font-size:14px;font-weight:600">' +
    'MIQ Quick Preview' +
    '</h3>' +
    '<p style="margin:0 0 10px;font-size:12px;color:var(--text-secondary,#888);line-height:1.5">' +
    'Drop a NIfTI file (.nii or .nii.gz) for a fast non-diagnostic look at slices and ' +
    'metadata. Does not run analysis. Verify against the original imaging study and the ' +
    'formal radiology report.' +
    '</p>' +
    '<input type="file" id="' + FILE_INPUT_ID + '" accept=".nii,.nii.gz" ' +
    'data-testid="mri-quick-preview-input" ' +
    'style="display:block;margin-bottom:10px;font-size:12px"/>' +
    '<div id="' + RESULT_ID + '" data-testid="mri-quick-preview-result"></div>' +
    '</section>'
  );
}

function setResult(rootEl, html) {
  if (!rootEl) return;
  const target = rootEl.querySelector
    ? rootEl.querySelector('#' + RESULT_ID)
    : null;
  if (target) target.innerHTML = html;
}

/**
 * Mount the quick-preview section into a container. The container is replaced
 * with the section markup; the file input is wired so that selecting a NIfTI
 * file fires `api.previewMedicalImage({file})` and renders the response into
 * the embedded preview pane via renderMedicalImagePreview().
 *
 * @param {HTMLElement|string} container - element or element id
 * @param {object} [opts]
 * @param {object} [opts.api] - injectable api (defaults to imported api).
 * @returns {{ rootEl: HTMLElement|null }}
 */
export function mountQuickPreviewSection(container, opts) {
  const o = opts || {};
  const apiClient = o.api || defaultApi;
  const containerEl =
    typeof container === 'string'
      ? (typeof document !== 'undefined' ? document.getElementById(container) : null)
      : container;
  if (!containerEl) return { rootEl: null };

  containerEl.innerHTML = renderQuickPreviewSection();
  const rootEl = containerEl.querySelector
    ? containerEl.querySelector('#' + ROOT_ID)
    : null;
  const fileInput = containerEl.querySelector
    ? containerEl.querySelector('#' + FILE_INPUT_ID)
    : null;

  if (fileInput && typeof fileInput.addEventListener === 'function') {
    fileInput.addEventListener('change', async function (ev) {
      const file =
        (ev && ev.target && ev.target.files && ev.target.files[0]) || null;
      if (!file) return;
      setResult(rootEl, renderMedicalImagePreview({ state: 'loading' }));
      try {
        const payload = await apiClient.previewMedicalImage({ file: file });
        setResult(rootEl, renderMedicalImagePreview(payload));
      } catch (err) {
        const message =
          (err && err.message) ? err.message : 'Preview request failed.';
        setResult(
          rootEl,
          renderMedicalImagePreview({ state: 'error', message: esc(message) }),
        );
      }
    });
  }

  return { rootEl: rootEl };
}

export default {
  renderQuickPreviewSection,
  mountQuickPreviewSection,
};
