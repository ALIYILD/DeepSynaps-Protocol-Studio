// ─────────────────────────────────────────────────────────────────────────────
// medical-image-preview.js — MIQ-inspired Quick Look component for the studio
//
// Inspired by https://github.com/marcoduering/MIQ — a macOS Quick Look
// extension that previews neuroimaging volumes (NIfTI / FreeSurfer / MRtrix)
// with an orthogonal slice view + metadata panel + non-diagnostic banner.
//
// This module renders the three slice planes returned by
// /api/v1/medical-images/preview alongside a metadata panel and the
// preview-only safety banner. It NEVER claims diagnosis, NEVER infers
// pathology, and never replaces clinician / radiology review.
//
// Exports:
//   renderMedicalImagePreview(payload, opts) → HTML string
//   mountMedicalImagePreview(container, payload, opts)
//   buildMedicalImageContextSentence(context) → string
//   PREVIEW_DISCLAIMER
// ─────────────────────────────────────────────────────────────────────────────

export const PREVIEW_DISCLAIMER =
  'Medical image preview only. Not diagnostic. Verify against the original ' +
  'imaging study and the formal radiology / clinical report.';

const PATIENT_FRIENDLY_DISCLAIMER =
  'Your clinician may use uploaded imaging files as part of your overall ' +
  'review. This software does not diagnose conditions from MRI images.';

function esc(v) {
  if (v == null) return '';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtBytes(n) {
  if (n == null || isNaN(n)) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let v = Number(n);
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return v.toFixed(v >= 10 || i === 0 ? 0 : 1) + ' ' + units[i];
}

function fmtDimensions(dim) {
  if (!Array.isArray(dim) || dim.length === 0) return '—';
  return dim.map((d) => esc(String(d))).join(' × ');
}

function fmtVoxel(v) {
  if (!Array.isArray(v) || v.length === 0) return '—';
  return v.map((x) => Number(x).toFixed(2)).join(' × ') + ' mm';
}

function bannerHtml(audience) {
  const text = audience === 'patient' ? PATIENT_FRIENDLY_DISCLAIMER : PREVIEW_DISCLAIMER;
  return (
    '<div data-testid="medical-image-disclaimer" role="note" ' +
    'style="margin:0 0 12px;padding:10px 12px;border-radius:8px;' +
    'background:rgba(255,166,0,0.12);border:1px solid rgba(255,166,0,0.4);' +
    'color:var(--text-primary,#222);font-size:12px;line-height:1.4">' +
    '<strong>Preview only — not diagnostic.</strong> ' +
    esc(text) +
    '</div>'
  );
}

function slicePanelHtml(label, url) {
  const inner = url
    ? '<img src="' +
      esc(url) +
      '" alt="' +
      esc(label) +
      ' slice (raw orientation preview)" loading="lazy" ' +
      'style="display:block;width:100%;background:#000;border-radius:6px"/>'
    : '<div style="aspect-ratio:1/1;display:flex;align-items:center;' +
      'justify-content:center;color:var(--text-secondary,#888);font-size:12px;' +
      'background:#0a0a0a;border-radius:6px">Slice unavailable</div>';
  return (
    '<figure data-testid="medical-image-slice-' +
    esc(label.toLowerCase()) +
    '" style="margin:0;flex:1;min-width:140px">' +
    '<figcaption style="font-size:11px;text-transform:uppercase;' +
    'letter-spacing:0.4px;color:var(--text-secondary,#888);margin-bottom:6px">' +
    esc(label) +
    ' (raw orientation)</figcaption>' +
    inner +
    '</figure>'
  );
}

function metadataPanelHtml(payload) {
  const md = payload.metadata || {};
  const rows = [
    ['Format', esc(md.format || payload.format || '—')],
    ['Dimensions', fmtDimensions(md.dimensions)],
    ['Voxel size', fmtVoxel(md.voxel_size_mm)],
    ['Volumes', esc(String(md.volumes || 1))],
    ['Datatype', esc(md.datatype || '—')],
    ['File size', fmtBytes(md.file_size_bytes)],
    ['Compressed', md.compressed ? 'yes' : 'no'],
    ['Status', esc(payload.status || '—')],
  ];
  if (md.qform_code != null) rows.push(['qform_code', esc(String(md.qform_code))]);
  if (md.sform_code != null) rows.push(['sform_code', esc(String(md.sform_code))]);
  const rowHtml = rows
    .map(
      (r) =>
        '<tr><th scope="row" style="text-align:left;padding:4px 12px 4px 0;' +
        'font-weight:500;color:var(--text-secondary,#888);font-size:12px">' +
        esc(r[0]) +
        '</th><td style="padding:4px 0;font-size:13px">' +
        r[1] +
        '</td></tr>',
    )
    .join('');
  return (
    '<div data-testid="medical-image-metadata" ' +
    'style="margin-top:12px;padding:12px;border-radius:8px;' +
    'background:var(--bg-elevated,#111);border:1px solid var(--border-subtle,#222)">' +
    '<h4 style="margin:0 0 8px;font-size:13px;text-transform:uppercase;' +
    'letter-spacing:0.4px;color:var(--text-secondary,#888)">Metadata</h4>' +
    '<table style="width:100%;border-collapse:collapse"><tbody>' +
    rowHtml +
    '</tbody></table>' +
    '<p style="margin:8px 0 0;font-size:11px;color:var(--text-secondary,#888);line-height:1.4">' +
    esc(md.orientation_note || 'Raw orientation preview; not reoriented.') +
    '</p>' +
    '</div>'
  );
}

function warningsHtml(warnings) {
  if (!Array.isArray(warnings) || warnings.length === 0) return '';
  const items = warnings
    .map((w) => '<li style="margin:0 0 4px">' + esc(String(w)) + '</li>')
    .join('');
  return (
    '<ul data-testid="medical-image-warnings" ' +
    'style="margin:8px 0 0;padding:0 0 0 18px;font-size:12px;line-height:1.5;' +
    'color:var(--text-secondary,#888)">' +
    items +
    '</ul>'
  );
}

function loadingHtml() {
  return (
    '<div data-testid="medical-image-loading" ' +
    'style="padding:24px;text-align:center;color:var(--text-secondary,#888);' +
    'font-size:13px">Generating preview…</div>'
  );
}

function errorHtml(message) {
  return (
    '<div data-testid="medical-image-error" role="alert" ' +
    'style="padding:12px;border-radius:8px;background:rgba(255,77,77,0.12);' +
    'border:1px solid rgba(255,77,77,0.4);color:var(--text-primary,#222);' +
    'font-size:13px">' +
    '<strong>Preview failed.</strong> ' +
    esc(message || 'Unable to generate preview for this file.') +
    '</div>'
  );
}

function unsupportedHtml(filename) {
  return (
    '<div data-testid="medical-image-unsupported" role="alert" ' +
    'style="padding:12px;border-radius:8px;background:rgba(255,166,0,0.12);' +
    'border:1px solid rgba(255,166,0,0.4);color:var(--text-primary,#222);' +
    'font-size:13px">' +
    '<strong>Unsupported file type.</strong> ' +
    (filename ? esc(filename) + ' ' : '') +
    'Supported preview formats: .nii, .nii.gz, .mgh, .mgz, .mgh.gz, .mif, ' +
    '.mif.gz.</div>'
  );
}

/**
 * Render the preview component HTML.
 *
 * @param {object} payload - response from /api/v1/medical-images/preview
 *   or /api/v1/medical-images/{id} (or { state: 'loading' | 'error' |
 *   'unsupported' } for transient UI states).
 * @param {object} [opts]
 * @param {'clinician'|'patient'} [opts.audience='clinician']
 * @returns {string} HTML string
 */
export function renderMedicalImagePreview(payload, opts) {
  const audience = (opts && opts.audience) || 'clinician';
  const wrapStart =
    '<section data-testid="medical-image-preview" ' +
    'aria-label="Medical image preview (non-diagnostic)" ' +
    'style="font-family:inherit;color:var(--text-primary,#eee)">';
  const wrapEnd = '</section>';

  if (!payload || payload.state === 'loading') {
    return wrapStart + bannerHtml(audience) + loadingHtml() + wrapEnd;
  }
  if (payload.state === 'unsupported') {
    return wrapStart + bannerHtml(audience) + unsupportedHtml(payload.filename) + wrapEnd;
  }
  if (payload.state === 'error') {
    return wrapStart + bannerHtml(audience) + errorHtml(payload.message) + wrapEnd;
  }

  const status = payload.status || 'ready';
  if (status === 'unsupported') {
    return wrapStart + bannerHtml(audience) + unsupportedHtml(payload.filename) + wrapEnd;
  }
  if (status === 'error') {
    return wrapStart + bannerHtml(audience) + errorHtml(payload.error) + wrapEnd;
  }

  const preview = payload.preview || {};
  const slices =
    '<div data-testid="medical-image-slices" ' +
    'style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-start">' +
    slicePanelHtml('Axial', preview.axial_url) +
    slicePanelHtml('Coronal', preview.coronal_url) +
    slicePanelHtml('Sagittal', preview.sagittal_url) +
    '</div>';

  const filenameHtml = payload.filename
    ? '<div data-testid="medical-image-filename" ' +
      'style="font-size:12px;color:var(--text-secondary,#888);margin-bottom:6px">' +
      esc(payload.filename) +
      '</div>'
    : '';

  const statusBlock =
    status === 'metadata_only'
      ? '<div data-testid="medical-image-metadata-only" ' +
        'style="padding:10px 12px;margin-top:8px;border-radius:8px;' +
        'background:rgba(80,140,255,0.10);border:1px solid rgba(80,140,255,0.4);' +
        'font-size:12px">Metadata only — slice preview not generated for this format ' +
        'in this deployment.</div>'
      : '';

  return (
    wrapStart +
    bannerHtml(audience) +
    filenameHtml +
    slices +
    statusBlock +
    metadataPanelHtml(payload) +
    warningsHtml(payload.warnings || (payload.metadata || {}).warnings) +
    wrapEnd
  );
}

/**
 * Mount the rendered preview into a container element.
 *
 * @param {HTMLElement|string} container - element or element id
 * @param {object} payload
 * @param {object} [opts]
 */
export function mountMedicalImagePreview(container, payload, opts) {
  const el =
    typeof container === 'string'
      ? (typeof document !== 'undefined' ? document.getElementById(container) : null)
      : container;
  if (!el) return;
  el.innerHTML = renderMedicalImagePreview(payload, opts);
}

/**
 * Build a one-line, safe report sentence from a medical_image_context block
 * returned by /api/v1/medical-images/{id}/report-context.
 *
 * The result is the deterministic safe_report_sentence — never the raw
 * clinician note. Callers that want to surface the clinician note must
 * render it separately and label it as clinician-entered.
 */
export function buildMedicalImageContextSentence(context) {
  if (!context || typeof context !== 'object') {
    return 'No MRI / medical imaging file was available in this workspace at the time of generation.';
  }
  if (context.safe_report_sentence) return String(context.safe_report_sentence);
  if (!context.available) {
    return 'No MRI / medical imaging file was available in this workspace at the time of generation.';
  }
  if (context.preview_status === 'ready') {
    return (
      'A non-diagnostic preview of the uploaded medical volume was generated for clinician navigation. ' +
      'Automated diagnostic interpretation was not performed.'
    );
  }
  return 'MRI / medical imaging metadata was available, but no automated image interpretation was performed.';
}

export default {
  renderMedicalImagePreview,
  mountMedicalImagePreview,
  buildMedicalImageContextSentence,
  PREVIEW_DISCLAIMER,
};
