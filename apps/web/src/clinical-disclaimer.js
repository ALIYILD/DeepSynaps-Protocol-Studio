// Shared clinical disclaimer and evidence-link helpers.
//
// Every AI/analyzer page must render:
// 1. A full disclaimer banner at the top (via renderClinicalDisclaimer)
// 2. Evidence links when available (via renderEvidenceLink)
//
// This centralizes the required clinical disclaimers so they stay
// consistent and auditable across all 12 analyzer pages.

/**
 * Render the required full clinical disclaimer banner.
 * Must appear on every AI/analyzer page.
 * 
 * @returns {string} HTML for the banner
 */
export function renderClinicalDisclaimer() {
  return `<div class="clinical-disclaimer-banner" role="note" style="
    background: rgba(245, 158, 11, 0.08);
    border: 1px solid rgba(245, 158, 11, 0.35);
    border-radius: var(--radius-md, 8px);
    padding: 12px 16px;
    margin-bottom: 16px;
    display: flex;
    gap: 12px;
    align-items: flex-start;
    font-size: 13px;
    line-height: 1.5;
  ">
    <div style="flex-shrink: 0; padding-top: 2px;">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style="color: var(--amber, #f59e0b);">
        <path d="M8 1C4.14 1 1 4.14 1 8s3.14 7 7 7 7-3.14 7-7-3.14-7-7-7zm0 12.5c-3.03 0-5.5-2.47-5.5-5.5S4.97 2.5 8 2.5s5.5 2.47 5.5 5.5-2.47 5.5-5.5 5.5zM7.5 8h1v3h-1zm0-2h1v1h-1z"/>
      </svg>
    </div>
    <div>
      <strong>Clinical Decision Support Disclaimer:</strong>
      This page supports clinical review and decision-making only. It does not diagnose,
      prescribe treatment, triage emergencies, approve treatments, or act independently.
      All outputs require clinician review and professional judgment before clinical use.
      This is a controlled preview using synthetic or clinician-provided data where applicable.
    </div>
  </div>`;
}

/**
 * Render an evidence link for a publication or resource.
 * 
 * @param {{ pubmed?: string, doi?: string, label?: string }} opts
 * @returns {string} HTML link or text
 */
export function renderEvidenceLink(opts) {
  const { pubmed, doi, label } = opts || {};
  if (!pubmed && !doi) return '';
  
  const href = pubmed
    ? `https://pubmed.ncbi.nlm.nih.gov/${pubmed}/`
    : doi
    ? `https://doi.org/${doi}`
    : '';
  
  if (!href) return '';
  
  const text = label || (pubmed ? `PMID: ${pubmed}` : `DOI: ${doi}`);
  
  return `<a href="${href}" target="_blank" rel="noopener noreferrer" style="color: var(--link-color, #3b82f6); text-decoration: underline;">
    ${escHtml(text)}
  </a>`;
}

function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export default {
  renderClinicalDisclaimer,
  renderEvidenceLink,
};
