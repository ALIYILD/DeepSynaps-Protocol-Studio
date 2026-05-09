// DeepTwin clinical disclaimer + evidence link helpers.
//
// Centralizes rendering of:
//   - Evidence-linked citations (PMID → PubMed, DOI → CrossRef/DOI.org)
//   - Honest "no evidence available" states
//   - Clinical approval disclaimers
//   - Decision-support-only notices
//
// All evidence calls go through the agent-brain service (via api.agentBrainQuery).
// If no citations are returned, we render "no local evidence found" + clinician judgment notice.

import { api } from '../api.js';

export const escHtml = (s) => String(s ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/\"/g, '&quot;');

/**
 * Build a clickable link for a citation.
 * If PMID: link to PubMed. If DOI: link to doi.org. Otherwise plain text.
 * @param {object} cit - Citation object with pmid, doi, title, authors, year
 * @returns {string} HTML link or plain text
 */
export function renderCitationLink(cit) {
  if (!cit) return '';
  const title = escHtml(cit.title || cit.pmid || cit.doi || 'Reference');
  if (cit.pmid) {
    const url = `https://pubmed.ncbi.nlm.nih.gov/${escHtml(cit.pmid)}`;
    return `<a href="${url}" target="_blank" rel="noopener" class="dt-cit-link">PMID:${escHtml(cit.pmid)}</a>`;
  } else if (cit.doi) {
    const url = `https://doi.org/${escHtml(cit.doi)}`;
    return `<a href="${url}" target="_blank" rel="noopener" class="dt-cit-link">DOI:${escHtml(cit.doi)}</a>`;
  }
  return `<span class="dt-cit-text">${title}</span>`;
}

/**
 * Render a list of evidence citations with links.
 * @param {array} citations - List of citation objects
 * @returns {string} HTML ul/li or empty string
 */
export function renderEvidenceList(citations) {
  if (!Array.isArray(citations) || !citations.length) return '';
  const items = citations.slice(0, 8).map(cit => `
    <li class="dt-cit-item">
      ${renderCitationLink(cit)}
      ${cit.year ? `<span class="dt-cit-year">(${escHtml(cit.year)})</span>` : ''}
      ${cit.authors ? `<span class="dt-cit-authors">${escHtml(cit.authors)}</span>` : ''}
    </li>
  `).join('');
  return `<ul class="dt-cit-list">${items}</ul>`;
}

/**
 * Honest "no evidence" notice. Appears when agent-brain evidence query returns empty citations.
 * @param {object} options - { condition, protocol_name, detail }
 * @returns {string} HTML notice block
 */
export function renderNoEvidenceNotice(options = {}) {
  const detail = escHtml(options.detail || '');
  const condition = escHtml(options.condition || '');
  const protocol = escHtml(options.protocol_name || 'this protocol');
  return `
    <div class="dt-notice dt-notice-no-evidence">
      <strong>No local evidence found</strong> for ${protocol}${condition ? ` in ${condition}` : ''}.
      ${detail ? `<div class="dt-notice-detail">${detail}</div>` : ''}
      <div class="dt-notice-cta">Clinician judgment required. Review external literature or consult specialist resources.</div>
    </div>
  `;
}

/**
 * Evidence-query disclaimer: shown when evidence data is stale, partial, or uncertain.
 * @returns {string} HTML notice
 */
export function renderEvidenceDisclaimerBanner() {
  return `
    <div class="dt-notice dt-notice-info" role="note" aria-label="Evidence disclaimer">
      <strong>Evidence is decision-support only.</strong> Linked citations are representative, not exhaustive.
      Clinician review of primary literature is required before treatment decisions.
    </div>
  `;
}

/**
 * Render a collapsible evidence section with citations + disclaimer.
 * If no citations: render honest "not available" state.
 * @param {string} heading - e.g., "Evidence for TMS in Depression"
 * @param {array} citations - Citation objects from agent-brain
 * @param {object} options - { detail, condition, expanded, noEvidenceDetail }
 * @returns {string} HTML details/summary block
 */
export function renderEvidenceSection(heading, citations, options = {}) {
  const hasCitations = Array.isArray(citations) && citations.length > 0;
  const open = options.expanded ? 'open' : '';
  const citHtml = hasCitations
    ? renderEvidenceList(citations) + renderEvidenceDisclaimerBanner()
    : renderNoEvidenceNotice({
        detail: options.noEvidenceDetail || '',
        condition: options.condition,
        protocol_name: heading,
      });
  return `
    <details class="dt-evidence-section" ${open}>
      <summary class="dt-evidence-summary">${escHtml(heading)}</summary>
      <div class="dt-evidence-content">
        ${citHtml}
      </div>
    </details>
  `;
}

/**
 * Query agent-brain for evidence, then render HTML.
 * If query fails or returns not_configured, render honest "unavailable" state.
 * @param {string} condition - Condition name (e.g., "MDD")
 * @param {string} protocol_name - Protocol or treatment name
 * @param {object} options - { heading, detail, noEvidenceDetail }
 * @returns {Promise<string>} HTML evidence section
 */
export async function queryAndRenderEvidence(condition, protocol_name, options = {}) {
  try {
    const heading = options.heading || `Evidence: ${escHtml(protocol_name || '')}`;
    const resp = await api.agentBrainQuery?.({
      provider: 'evidence',
      query: protocol_name,
      condition,
    });
    
    if (!resp || resp.status === 'not_configured') {
      return renderEvidenceSection(heading, [], {
        noEvidenceDetail: 'Evidence service not configured.',
        condition,
        expanded: false,
      });
    }
    
    if (resp.status === 'error' || resp.status === 'unavailable') {
      return renderEvidenceSection(heading, [], {
        noEvidenceDetail: `Evidence lookup failed: ${escHtml(resp.error?.message || resp.status || '')}`,
        condition,
        expanded: false,
      });
    }
    
    // Happy path: status === 'ok'
    const citations = Array.isArray(resp.citations) ? resp.citations : [];
    return renderEvidenceSection(heading, citations, {
      detail: options.detail,
      condition,
      expanded: false,
      noEvidenceDetail: options.noEvidenceDetail,
    });
  } catch (e) {
    const heading = options.heading || `Evidence: ${escHtml(protocol_name || '')}`;
    return renderEvidenceSection(heading, [], {
      noEvidenceDetail: `Evidence lookup error: ${escHtml(e?.message || 'unknown')}`,
      condition,
      expanded: false,
    });
  }
}

/**
 * Inline evidence disclaimer for use in prediction / simulation cards.
 * Small, compact footer notice.
 * @param {object} options - { requires_clinician_review, confidence_tier }
 * @returns {string} HTML span/div
 */
export function renderEvidenceDisclaimerInline(options = {}) {
  const review = options.requires_clinician_review ? 'Clinician review required. ' : '';
  const conf = options.confidence_tier ? `Confidence: ${escHtml(options.confidence_tier)}. ` : '';
  return `<div class="dt-disclaimer-inline">${review}${conf}Evidence decision-support only.</div>`;
}

/**
 * Helper to build a clinical-approval badge + link to evidence summary.
 * @param {string} approval_status - "pending" | "approved" | "escalated"
 * @param {object} options - { evidence_link_href, show_evidence_link }
 * @returns {string} HTML badge
 */
export function renderApprovalBadge(approval_status = 'pending', options = {}) {
  const status = (approval_status || 'pending').toLowerCase();
  const map = {
    pending: { fg: 'var(--amber)', bg: 'rgba(255,179,71,.12)', label: 'Awaiting approval' },
    approved: { fg: 'var(--teal)', bg: 'rgba(0,212,188,.12)', label: 'Approved' },
    escalated: { fg: 'var(--red)', bg: 'rgba(239,68,68,.12)', label: 'Escalated' },
  }[status] || { fg: 'var(--text-tertiary)', bg: 'rgba(255,255,255,.04)', label: status };
  
  const link = options.show_evidence_link && options.evidence_link_href
    ? ` <a href="${escHtml(options.evidence_link_href)}" class="dt-approval-link">view evidence</a>`
    : '';
  
  return `<span class="dt-approval-badge" style="background:${map.bg};color:${map.fg}">${escHtml(map.label)}${link}</span>`;
}
