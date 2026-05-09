/**
 * Evidence integration for qEEG Analyzer.
 *
 * Fetches evidence citations from agent-brain for flagged conditions detected in qEEG analyses.
 * Renders citations with honest empty states when no evidence is available.
 *
 * Usage:
 *   const cites = await fetchQEEGEvidenceForAnalysis(analysis);
 *   const html = renderQEEGEvidenceCitations(cites);
 */

import { api } from './api.js';

function esc(v) {
  return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/\"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Fetch evidence from agent-brain for flagged conditions in a qEEG analysis.
 * Returns Promise<{status, items, error_message}>.
 *
 * @param {Object} analysis - qEEG analysis object with flagged_conditions array
 * @param {Object} opts - { limit: 5, include_counter_evidence: true }
 * @returns {Promise<Object>} Evidence response or {status: 'unavailable', items: []}
 */
export async function fetchQEEGEvidenceForAnalysis(analysis = {}, opts = {}) {
  if (!analysis) {
    return { status: 'unavailable', items: [], error_message: 'No analysis provided' };
  }

  const flagged = Array.isArray(analysis.flagged_conditions) ? analysis.flagged_conditions : [];
  if (!flagged.length) {
    return { status: 'ok', items: [], error_message: null };
  }

  const limit = opts.limit ?? 8;
  const query = {
    provider: 'evidence',
    query: flagged.join(' OR '),
    condition: flagged[0] || '',
    limit,
    include_counter_evidence: opts.include_counter_evidence ?? true,
  };

  try {
    // Call agent-brain evidence provider
    const resp = await api.queryAgentBrain(query);
    return resp || { status: 'unavailable', items: [], error_message: 'Empty response' };
  } catch (err) {
    return {
      status: 'error',
      items: [],
      error_message: String(err?.message || err || 'Unknown error').slice(0, 200),
    };
  }
}

/**
 * Render HTML for evidence citations. Includes honest empty state.
 *
 * @param {Object} evidence - Response from fetchQEEGEvidenceForAnalysis
 * @returns {string} HTML
 */
export function renderQEEGEvidenceCitations(evidence = {}) {
  const status = evidence?.status || 'unavailable';
  const items = Array.isArray(evidence?.items) ? evidence.items : [];

  if (status === 'unavailable' || status === 'not_configured') {
    return `<div class="qeeg-evidence-unavailable" role="status">
      <div style="font-size:12px;color:var(--text-secondary);line-height:1.6">
        <strong>Evidence database unavailable.</strong> Clinician judgment required to contextualize findings.
      </div>
    </div>`;
  }

  if (status === 'error') {
    return `<div class="qeeg-evidence-error" role="alert">
      <div style="font-size:12px;color:var(--amber);line-height:1.6">
        Could not retrieve evidence at this time. Please review findings manually.
      </div>
    </div>`;
  }

  if (!items.length) {
    return `<div class="qeeg-evidence-empty" role="status">
      <div style="font-size:12px;color:var(--text-tertiary);line-height:1.6">
        No ranked evidence found for this analysis. Clinician review essential.
      </div>
    </div>`;
  }

  // Render citations
  let html = '<div class="qeeg-evidence-list" style="margin-top:12px">';
  items.forEach((item, idx) => {
    const pmid = item?.pmid || item?.id;
    const doi = item?.doi;
    const title = item?.title || 'Untitled';
    const year = item?.year || '—';
    const journal = item?.journal || 'Journal';
    const url = pmid ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` : doi ? `https://doi.org/${doi}` : null;

    html += `<div class="qeeg-evidence-item" style="margin-bottom:12px;padding:8px 12px;border-radius:6px;background:rgba(0,212,188,0.05);border-left:3px solid rgba(0,212,188,0.2)">
      <div style="font-size:12px;font-weight:600;margin-bottom:2px">
        ${url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(title)}</a>` : esc(title)}
      </div>
      <div style="font-size:11px;color:var(--text-secondary)">
        ${esc(journal)} · ${esc(year)}
        ${pmid ? ` · PMID: <a href="https://pubmed.ncbi.nlm.nih.gov/${pmid}/" target="_blank" rel="noopener">${esc(pmid)}</a>` : ''}
        ${doi && !pmid ? ` · DOI: <a href="https://doi.org/${esc(doi)}" target="_blank" rel="noopener">${esc(doi)}</a>` : ''}
      </div>
    </div>`;
  });
  html += '</div>';

  return html;
}

/**
 * Check if evidence integration is available (agent-brain status).
 * @returns {Promise<boolean>}
 */
export async function isEvidenceAvailable() {
  try {
    const status = await api.getAgentBrainStatus();
    return status?.status === 'ok';
  } catch {
    return false;
  }
}

/**
 * Helper: extract top N flagged conditions from analysis and return as readable string.
 * @param {Object} analysis
 * @param {number} n - max conditions to include
 * @returns {string}
 */
export function summarizeQEEGFlaggedConditions(analysis = {}, n = 3) {
  const flagged = Array.isArray(analysis.flagged_conditions) ? analysis.flagged_conditions : [];
  if (!flagged.length) return 'No flagged conditions';
  return flagged.slice(0, n).map(c => esc(c)).join(', ') + (flagged.length > n ? ` +${flagged.length - n} more` : '');
}
