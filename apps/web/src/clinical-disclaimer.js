/**
 * Shared clinical disclaimer banner for all AI/analyzer pages.
 *
 * This is a controlled preview using synthetic or clinician-provided data where applicable.
 * This page supports clinical review and decision support only. It does not diagnose,
 * prescribe, triage emergencies, approve treatment, or act autonomously. All outputs
 * require clinician review.
 *
 * Required by overnight sprint 2026-05-08 for all 12 AI/analyzer pages.
 */

const CLINICAL_DISCLAIMER_TEXT = (
  'This is a controlled preview using synthetic or clinician-provided data where applicable. '
  + 'This page supports clinical review and decision support only. It does not diagnose, '
  + 'prescribe, triage emergencies, approve treatment, or act autonomously. All outputs '
  + 'require clinician review.'
);

/**
 * Render clinical disclaimer banner HTML.
 * @returns {string} HTML banner div.
 */
export function renderClinicalDisclaimer() {
  return `<div role="region" aria-label="Clinical disclaimer" `
    + `style="margin-bottom:16px;padding:14px 16px;border-radius:12px;`
    + `border:1px solid rgba(59,130,246,.3);background:rgba(59,130,246,.05);`
    + `font-size:13px;line-height:1.5;color:var(--text-secondary)">`
    + `<strong style="color:var(--text-primary)">Clinical disclaimer:</strong> ${CLINICAL_DISCLAIMER_TEXT}`
    + `</div>`;
}

/**
 * Render PHI warning badge for de-identification status.
 * @param {'active'|'heuristic'|'unavailable'} status - De-ID backend status.
 * @returns {string} HTML badge.
 */
export function renderPHIWarningBadge(status = 'heuristic') {
  const badgeStyle = {
    active: 'background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.3);color:var(--text-primary)',
    heuristic: 'background:rgba(246,178,60,.1);border:1px solid rgba(246,178,60,.35);color:var(--text-primary)',
    unavailable: 'background:rgba(248,113,113,.08);border:1px solid rgba(248,113,113,.35);color:#f87171',
  }[status] || 'background:rgba(107,114,128,.1);border:1px solid rgba(107,114,128,.3);color:var(--text-secondary)';

  const label = {
    active: 'PHI protection: Presidio active',
    heuristic: 'PHI protection: heuristic only',
    unavailable: 'PHI protection: unavailable',
  }[status] || 'PHI protection: unknown';

  const hint = {
    active: 'Presidio de-identification is active. All sensitive data will be redacted.',
    heuristic: 'Using heuristic regex-based de-ID. Manual review recommended for real patient text.',
    unavailable: 'De-identification service unavailable. Do not process real patient text.',
  }[status] || '';

  return `<div style="display:inline-flex;align-items:center;gap:8px;${badgeStyle};`
    + `padding:8px 12px;border-radius:6px;font-size:12px;font-weight:500" `
    + `title="${hint}">`
    + `${label}`
    + `</div>`;
}

/**
 * Render NLP provider status badge.
 * @param {'active'|'demo'|'unavailable'} status - NLP backend status.
 * @returns {string} HTML badge.
 */
export function renderNLPStatusBadge(status = 'demo') {
  const badgeStyle = {
    active: 'background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.3);color:var(--text-primary)',
    demo: 'background:rgba(168,85,247,.1);border:1px solid rgba(168,85,247,.35);color:var(--text-primary)',
    unavailable: 'background:rgba(107,114,128,.1);border:1px solid rgba(107,114,128,.3);color:var(--text-secondary)',
  }[status] || 'background:rgba(107,114,128,.1);border:1px solid rgba(107,114,128,.3);color:var(--text-secondary)';

  const label = {
    active: 'NLP: Active',
    demo: 'NLP: Demo / heuristic',
    unavailable: 'NLP: Unavailable',
  }[status] || 'NLP: Unknown';

  const hint = {
    active: 'NLP backend is active and processing real data.',
    demo: 'Using demo fixtures or heuristic-only processing.',
    unavailable: 'NLP backend unavailable; demo mode only.',
  }[status] || '';

  return `<span style="display:inline-flex;align-items:center;${badgeStyle};`
    + `padding:6px 10px;border-radius:4px;font-size:11px;font-weight:500" `
    + `title="${hint}">`
    + `${label}</span>`;
}

export const clinicalDisclaimer = {
  text: CLINICAL_DISCLAIMER_TEXT,
  renderBanner: renderClinicalDisclaimer,
  renderPHIWarning: renderPHIWarningBadge,
  renderNLPStatus: renderNLPStatusBadge,
};

export default clinicalDisclaimer;
