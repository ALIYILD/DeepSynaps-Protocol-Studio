/**
 * brain-map-planner-evidence.js — Evidence linking for brain map planner
 *
 * Wraps evidence query endpoints:
 * - GET /api/v1/evidence/search?q=<query>&category=<category>
 *
 * Returns PMID/DOI hyperlinks for clinical claims, or honest "no evidence" fallback.
 * Prevents fabrication of citations — only surfaces what's in the DB.
 */

import { API_BASE, isDemoSession } from './api.js';

function getAuthToken() {
  try {
    return globalThis.localStorage?.getItem?.('ds_access_token') ?? null;
  } catch {
    return null;
  }
}

function buildHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  const token = getAuthToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

/**
 * Query evidence database for brain targets / conditions
 * @param {string} query - Target (e.g., "DLPFC") or condition (e.g., "depression")
 * @param {string} category - 'target' | 'condition' | 'protocol'
 * @returns {Promise<{items: Array, citations: Array} | null>}
 */
export async function queryBrainMapEvidence(query, category = 'target') {
  if (isDemoSession()) {
    // Return honest empty demo response
    return {
      items: [],
      citations: [],
      status: 'demo',
      note: 'Evidence database not available in demo mode; clinician judgment required.',
    };
  }

  try {
    const url = new URL(`${API_BASE}/api/v1/evidence/search`);
    url.searchParams.append('q', query);
    url.searchParams.append('category', category);

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: buildHeaders(),
    });

    if (!response.ok) {
      console.warn(`Evidence query failed: ${response.status}`);
      return {
        items: [],
        citations: [],
        status: 'unavailable',
        note: 'Evidence database unavailable; clinician judgment required.',
      };
    }

    const data = await response.json();
    return data || { items: [], citations: [], status: 'ok' };
  } catch (error) {
    console.error('Evidence query exception:', error);
    return {
      items: [],
      citations: [],
      status: 'error',
      note: 'Could not query evidence database; clinician judgment required.',
    };
  }
}

/**
 * Build evidence citation HTML link
 * @param {Object} citation - { type: 'pmid' | 'doi', value: string, title: string }
 * @returns {string} - HTML anchor tag or plain text
 */
export function buildCitationLink(citation) {
  if (!citation || !citation.type || !citation.value) {
    return '';
  }

  const { type, value, title } = citation;
  const displayText = title || value;

  if (type === 'pmid') {
    return `<a href="https://pubmed.ncbi.nlm.nih.gov/${value}/" target="_blank" rel="noopener noreferrer">${displayText}</a>`;
  }

  if (type === 'doi') {
    return `<a href="https://doi.org/${value}" target="_blank" rel="noopener noreferrer">${displayText}</a>`;
  }

  return displayText;
}

/**
 * Render evidence banner for target/condition
 * Honest "no evidence" if citations array is empty
 * @param {Array} citations - Array of citation objects
 * @param {string} claimText - What clinical claim is being made
 * @returns {string} - HTML banner
 */
export function renderEvidenceBanner(citations, claimText = 'This approach') {
  if (!Array.isArray(citations)) {
    citations = [];
  }

  if (citations.length === 0) {
    return `
      <div style="
        padding: 12px 16px;
        margin: 12px 0;
        background: rgba(255, 179, 71, 0.1);
        border-left: 3px solid #FFB347;
        border-radius: 4px;
        font-size: 13px;
        color: rgba(255, 255, 255, 0.7);
      ">
        <strong>No clinical evidence found in database.</strong> ${claimText} requires clinician judgment and institutional review.
      </div>
    `;
  }

  const citationLinks = citations
    .map(c => buildCitationLink(c))
    .filter(Boolean)
    .join(', ');

  return `
    <div style="
      padding: 12px 16px;
      margin: 12px 0;
      background: rgba(74, 158, 255, 0.1);
      border-left: 3px solid #4A9EFF;
      border-radius: 4px;
      font-size: 13px;
      color: rgba(255, 255, 255, 0.8);
    ">
      <strong>Evidence:</strong> ${citationLinks}
      <div style="margin-top: 8px; font-size: 12px; color: rgba(255, 255, 255, 0.6);">
        Decision-support only. Clinician review required.
      </div>
    </div>
  `;
}

/**
 * Check if evidence provider is configured (returns 'ok' or 'unavailable')
 * @returns {Promise<string>} - 'ok' | 'unavailable' | 'demo'
 */
export async function checkEvidenceProvider() {
  if (isDemoSession()) {
    return 'demo';
  }

  try {
    const response = await fetch(`${API_BASE}/api/v1/agent-brain/providers`, {
      method: 'GET',
      headers: buildHeaders(),
    });

    if (!response.ok) {
      return 'unavailable';
    }

    const data = await response.json();
    const evidenceProvider = data?.providers?.find(p => p.name === 'evidence');

    if (evidenceProvider && evidenceProvider.status === 'ok') {
      return 'ok';
    }

    return 'unavailable';
  } catch (error) {
    console.error('Evidence provider check failed:', error);
    return 'unavailable';
  }
}
