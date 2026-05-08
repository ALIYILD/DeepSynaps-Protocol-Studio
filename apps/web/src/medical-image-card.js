// medical-image-card.js — embeddable, non-diagnostic Medical Imaging summary card.
//
// Drop-in HTML card for patient dashboards. Always renders the preview-only
// safety banner. Never composes diagnostic strings client-side; surfaces only
// the safe metadata fields returned by /api/v1/medical-images/patients/{id}/index.
// See medical-image-preview.js for the slice viewer used on the MRI Analysis page.

import { api as defaultApi } from './api.js';

export const MEDICAL_IMAGE_CARD_DISCLAIMER =
  'Medical image preview only. Not diagnostic. Verify against the original ' +
  'imaging study and the formal radiology / clinical report.';

const PATIENT_DISCLAIMER =
  'Your clinician may use uploaded imaging files as part of your overall ' +
  'review. This software does not diagnose conditions from MRI images.';

const PATIENT_EMPTY_COPY =
  'Your imaging files appear here once uploaded by your clinician.';

const CLINICIAN_EMPTY_COPY =
  'No imaging available. Upload a NIfTI / FreeSurfer / MRtrix volume from the ' +
  'MRI Analysis page to generate a non-diagnostic preview.';

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

function bannerHtml(audience) {
  const text = audience === 'patient' ? PATIENT_DISCLAIMER : MEDICAL_IMAGE_CARD_DISCLAIMER;
  return (
    '<div data-testid="medical-image-card-disclaimer" role="note" ' +
    'style="margin:0 0 10px;padding:8px 10px;border-radius:8px;' +
    'background:rgba(255,166,0,0.12);border:1px solid rgba(255,166,0,0.4);' +
    'color:var(--text-primary,#222);font-size:12px;line-height:1.4">' +
    '<strong>Preview only — not diagnostic.</strong> ' +
    esc(text) +
    '</div>'
  );
}

function statusBadgeHtml(status) {
  const s = String(status || 'ready').toLowerCase();
  let color = '#3a7';
  if (s === 'metadata_only') color = '#5a8fd8';
  else if (s === 'error' || s === 'unsupported') color = '#c66';
  return (
    '<span data-testid="medical-image-card-status" ' +
    'style="display:inline-block;padding:2px 8px;border-radius:999px;' +
    'background:' + color + '22;border:1px solid ' + color + '66;' +
    'color:var(--text-primary,#eee);font-size:11px;letter-spacing:0.3px">' +
    esc(s) +
    '</span>'
  );
}

function ctaHtml(audience) {
  if (audience === 'patient') return '';
  return (
    '<div data-testid="medical-image-card-cta" ' +
    'style="margin-top:8px;font-size:12px;color:var(--text-secondary,#888);line-height:1.5">' +
    'Open the MRI Analysis page to upload a volume and generate a preview.' +
    '</div>'
  );
}

function emptyCardHtml(audience, opts) {
  const warning = opts && opts.warning;
  const copy = audience === 'patient' ? PATIENT_EMPTY_COPY : CLINICIAN_EMPTY_COPY;
  const warningHtml = warning
    ? '<div data-testid="medical-image-card-warning" role="alert" ' +
      'style="margin:8px 0 0;padding:8px 10px;border-radius:6px;' +
      'background:rgba(255,77,77,0.10);border:1px solid rgba(255,77,77,0.35);' +
      'font-size:12px;color:var(--text-primary,#eee)">' +
      esc(String(warning)) +
      '</div>'
    : '';
  return (
    '<section data-testid="medical-image-card" data-state="empty" ' +
    'aria-label="Medical imaging (non-diagnostic)" ' +
    'style="padding:14px;border-radius:10px;' +
    'background:var(--bg-elevated,#111);border:1px solid var(--border-subtle,#222);' +
    'color:var(--text-primary,#eee);font-family:inherit">' +
    '<h3 style="margin:0 0 8px;font-size:13px;text-transform:uppercase;' +
    'letter-spacing:0.5px;color:var(--text-secondary,#888)">Medical imaging</h3>' +
    bannerHtml(audience) +
    '<div data-testid="medical-image-card-empty" ' +
    'style="font-size:13px;line-height:1.5;color:var(--text-primary,#eee)">' +
    esc(copy) +
    '</div>' +
    ctaHtml(audience) +
    warningHtml +
    '</section>'
  );
}

function pickLatest(images) {
  if (!Array.isArray(images) || images.length === 0) return null;
  const sorted = images.slice().sort((a, b) => {
    const ta = (a && (a.uploaded_at || a.created_at)) || '';
    const tb = (b && (b.uploaded_at || b.created_at)) || '';
    if (ta && tb) return ta < tb ? 1 : ta > tb ? -1 : 0;
    return 0;
  });
  return sorted[0] || images[0];
}

function thumbnailHtml(image, audience) {
  const preview = (image && image.preview) || {};
  const url = preview.axial_url || preview.coronal_url || preview.sagittal_url || null;
  const filename = (image && image.filename) || 'medical volume';
  if (url) {
    return (
      '<img data-testid="medical-image-card-thumb" ' +
      'src="' + esc(url) + '" ' +
      'alt="Axial slice (raw orientation preview) of ' + esc(filename) + '" ' +
      'loading="lazy" ' +
      'style="display:block;width:100%;max-width:160px;background:#000;' +
      'border-radius:6px;border:1px solid var(--border-subtle,#222)"/>'
    );
  }
  return (
    '<div data-testid="medical-image-card-thumb" ' +
    'style="width:160px;aspect-ratio:1/1;display:flex;align-items:center;' +
    'justify-content:center;background:#0a0a0a;border-radius:6px;' +
    'border:1px solid var(--border-subtle,#222);' +
    'color:var(--text-secondary,#888);font-size:11px">' +
    (audience === 'patient' ? 'Preview pending' : 'Slice unavailable') +
    '</div>'
  );
}

function clinicianMetaRows(image) {
  const md = (image && image.metadata) || {};
  const rows = [];
  if (md.datatype) rows.push(['Datatype', esc(md.datatype)]);
  if (md.file_size_bytes != null) rows.push(['File size', fmtBytes(md.file_size_bytes)]);
  if (md.volumes != null) rows.push(['Volumes', esc(String(md.volumes))]);
  if (rows.length === 0) return '';
  return (
    '<dl data-testid="medical-image-card-tech" ' +
    'style="margin:8px 0 0;display:grid;grid-template-columns:auto 1fr;' +
    'column-gap:10px;row-gap:2px;font-size:11.5px;color:var(--text-secondary,#888)">' +
    rows
      .map(
        (r) =>
          '<dt style="font-weight:500">' + r[0] + '</dt>' +
          '<dd style="margin:0;color:var(--text-primary,#eee)">' + r[1] + '</dd>',
      )
      .join('') +
    '</dl>'
  );
}

function buildImageHref(image, patientId) {
  const id = image && (image.id || image.image_id);
  if (!id) return null;
  const params = ['image_id=' + encodeURIComponent(String(id))];
  if (patientId) params.push('patient_id=' + encodeURIComponent(String(patientId)));
  return '/mri-analysis?' + params.join('&');
}

/**
 * Render a single-card summary of a patient's most recent medical volume.
 *
 * @param {object} args
 * @param {Array<object>|null} args.images
 * @param {string|null} [args.patientId]
 * @param {'clinician'|'patient'} [args.audience='clinician']
 * @returns {string} HTML string
 */
export function renderMedicalImageCard(args) {
  const a = args || {};
  const audience = a.audience === 'patient' ? 'patient' : 'clinician';
  const images = Array.isArray(a.images) ? a.images : [];

  if (images.length === 0) {
    return emptyCardHtml(audience);
  }

  const image = pickLatest(images);
  if (!image) return emptyCardHtml(audience);

  const md = image.metadata || {};
  const filename = image.filename || md.filename || 'volume';
  const format = image.format || md.format || '—';
  const dims = fmtDimensions(md.dimensions);
  const status = image.status || 'ready';
  const href = buildImageHref(image, a.patientId);
  const linkOpen = href
    ? '<a data-testid="medical-image-card-link" href="' + esc(href) + '" ' +
      'style="color:var(--text-primary,#eee);text-decoration:none">'
    : '';
  const linkClose = href ? '</a>' : '';

  const sideHtml =
    '<div style="flex:1;min-width:0">' +
    '<div data-testid="medical-image-card-filename" ' +
    'style="font-size:13px;font-weight:600;color:var(--text-primary,#eee);' +
    'overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' +
    linkOpen +
    esc(filename) +
    linkClose +
    '</div>' +
    '<div data-testid="medical-image-card-format" ' +
    'style="margin-top:2px;font-size:11.5px;color:var(--text-secondary,#888)">' +
    esc(format) + ' &middot; ' +
    '<span data-testid="medical-image-card-dimensions">' + dims + '</span>' +
    '</div>' +
    '<div style="margin-top:6px">' + statusBadgeHtml(status) + '</div>' +
    (audience === 'clinician' ? clinicianMetaRows(image) : '') +
    '</div>';

  const body =
    '<div style="display:flex;gap:12px;align-items:flex-start">' +
    thumbnailHtml(image, audience) +
    sideHtml +
    '</div>';

  return (
    '<section data-testid="medical-image-card" data-state="populated" ' +
    'aria-label="Medical imaging (non-diagnostic)" ' +
    'style="padding:14px;border-radius:10px;' +
    'background:var(--bg-elevated,#111);border:1px solid var(--border-subtle,#222);' +
    'color:var(--text-primary,#eee);font-family:inherit">' +
    '<h3 style="margin:0 0 8px;font-size:13px;text-transform:uppercase;' +
    'letter-spacing:0.5px;color:var(--text-secondary,#888)">Medical imaging</h3>' +
    bannerHtml(audience) +
    body +
    '</section>'
  );
}

/**
 * Mount the card by fetching the patient's medical-image index and rendering.
 *
 * @param {HTMLElement|string} container - element or element id
 * @param {object} [opts]
 * @param {string} [opts.patientId]
 * @param {'clinician'|'patient'} [opts.audience]
 * @param {object} [opts.api] - injectable api (defaults to the imported api).
 * @returns {Promise<void>}
 */
export async function mountMedicalImageCard(container, opts) {
  const o = opts || {};
  const audience = o.audience === 'patient' ? 'patient' : 'clinician';
  const apiClient = o.api || defaultApi;
  const el =
    typeof container === 'string'
      ? (typeof document !== 'undefined' ? document.getElementById(container) : null)
      : container;
  if (!el) return;

  if (!o.patientId) {
    el.innerHTML = renderMedicalImageCard({ images: [], patientId: null, audience: audience });
    return;
  }

  try {
    const res = await apiClient.listPatientMedicalImages(o.patientId);
    const images = Array.isArray(res) ? res : ((res && res.images) || []);
    el.innerHTML = renderMedicalImageCard({
      images: images,
      patientId: o.patientId,
      audience: audience,
    });
  } catch (err) {
    const message = (err && err.message) ? err.message : 'Could not load imaging index.';
    el.innerHTML = emptyCardHtml(audience, { warning: message });
  }
}

export default {
  renderMedicalImageCard,
  mountMedicalImageCard,
  MEDICAL_IMAGE_CARD_DISCLAIMER,
};
