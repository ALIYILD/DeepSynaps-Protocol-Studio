/**
 * Slice D3 — UI helpers for the federated clinical-evidence search.
 *
 * Pure rendering + thin async loader for the
 * ``POST /api/v1/evidence/federated-search`` endpoint shipped in PR #1078.
 *
 * Kept as a standalone module so it can be unit-tested without DOM
 * fixtures and so it doesn't textually overlap with PR #1061
 * (``pages-research-evidence-source-panel``) — the wiring into
 * pages-research-evidence.js is a 1-line follow-up PR once both this
 * module and the federation endpoint are on main.
 *
 * Honest-degraded contract:
 *
 * - 200 → render internal_results + external_results separately, with
 *   per-source status badges and the decision-support disclaimer
 *   verbatim.
 * - 404 / 401 / 500 / network failure → render a neutral notice
 *   ("Federated search is not available on this build…"). No
 *   fabricated rows.
 * - A subscription source whose ``status`` is anything other than
 *   ``"ok"`` renders the subscription badge alongside its lifecycle
 *   badge so the clinician sees BOTH facts (defense in depth — same
 *   policy as the Cat3 source panel).
 */
import { api } from './api.js';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* Per-source lifecycle presentation. Keep keys aligned with
   FederatedSourceStatusOut.status values emitted by the federation
   service (apps/api/app/services/evidence_federation.py). */
export const FEDERATED_SOURCE_STATE_PRESENTATION = Object.freeze({
  ok:          { label: 'Live',         tone: '#22c55e' },
  catalogued:  { label: 'Catalogued',   tone: '#a78bfa' },
  disabled:    { label: 'Disabled',     tone: '#94a3b8' },
  error:       { label: 'Error',        tone: '#ef4444' },
  timeout:     { label: 'Timeout',      tone: '#f59e0b' },
  missing:     { label: 'Missing',      tone: '#94a3b8' },
  degraded:    { label: 'Degraded',     tone: '#f59e0b' },
  unavailable: { label: 'Unavailable',  tone: '#ef4444' },
  unknown:     { label: 'Unknown',      tone: '#94a3b8' },
});

/* Wording shown when the endpoint is not yet deployed in the active build.
   Exported so tests can lock the honest copy. */
export const FEDERATED_SEARCH_UNAVAILABLE_NOTICE =
  'Federated search is not available on this build. Per-source searches ' +
  'below remain functional; only the unified one-call envelope is missing.';

function _renderSourceStatusRow(status) {
  const presentation =
    FEDERATED_SOURCE_STATE_PRESENTATION[String(status.status || 'unknown').toLowerCase()] ||
    FEDERATED_SOURCE_STATE_PRESENTATION.unknown;
  const internalBadge = status.is_internal
    ? '<span style="font-size:9.5px;padding:2px 7px;border-radius:999px;background:rgba(45,212,191,0.16);color:var(--teal);border:1px solid rgba(45,212,191,0.3);letter-spacing:.04em;text-transform:uppercase">Internal</span>'
    : '';
  const subscriptionBadge = status.requires_subscription
    ? '<span style="font-size:9.5px;padding:2px 7px;border-radius:999px;background:rgba(148,163,184,0.18);color:var(--text-tertiary);border:1px solid var(--border);letter-spacing:.04em;text-transform:uppercase">Subscription</span>'
    : '';
  const latencyHtml = status.latency_ms != null
    ? `<span style="font-size:10.5px;color:var(--text-tertiary)">${esc(status.latency_ms)} ms</span>`
    : '';
  const countHtml = `<span style="font-size:10.5px;color:var(--text-tertiary)">${esc(status.result_count || 0)} results</span>`;
  const messageHtml = status.message
    ? `<div style="font-size:11px;color:var(--text-secondary);line-height:1.5;margin-top:4px">${esc(status.message)}</div>`
    : '';
  return (
    '<div style="padding:10px 12px;border:1px solid var(--border);border-radius:10px;background:rgba(255,255,255,0.02);display:flex;flex-direction:column;gap:4px">' +
    '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
    `<div style="font-size:12.5px;font-weight:700;color:var(--text-primary)">${esc(status.display_name)}</div>` +
    `<span style="font-size:10px;padding:2px 8px;border-radius:999px;background:${presentation.tone}22;color:${presentation.tone};font-weight:700;letter-spacing:.05em;text-transform:uppercase">${esc(presentation.label)}</span>` +
    internalBadge +
    subscriptionBadge +
    '<div style="flex:1"></div>' +
    countHtml +
    latencyHtml +
    '</div>' +
    messageHtml +
    '</div>'
  );
}

function _renderResultRow(row, options) {
  const sourceLabel = row.source || (row.provenance && row.provenance.source_database) || 'unknown';
  const doi = row.doi ? esc(row.doi) : '';
  const pmid = row.pmid ? esc(row.pmid) : '';
  const idsHtml = [
    doi ? `<span>DOI ${doi}</span>` : '',
    pmid ? `<span>PMID ${pmid}</span>` : '',
    row.year != null ? `<span>${esc(row.year)}</span>` : '',
    row.journal ? `<span>${esc(row.journal)}</span>` : '',
  ].filter(Boolean).join(' · ');
  const authorsHtml = Array.isArray(row.authors) && row.authors.length
    ? `<div style="font-size:11px;color:var(--text-secondary);margin-top:4px">${esc(row.authors.slice(0, 4).join(', '))}${row.authors.length > 4 ? ', …' : ''}</div>`
    : '';
  const urlHtml = row.url
    ? `<a href="${esc(row.url)}" target="_blank" rel="noopener noreferrer" style="font-size:11px;color:var(--teal)">Open ↗</a>`
    : '';
  return (
    '<article data-testid="federated-result" data-source="' + esc(sourceLabel) + '" style="padding:12px 14px;border:1px solid var(--border);border-radius:10px;background:rgba(255,255,255,0.02);margin-bottom:8px">' +
    '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px">' +
    `<div style="font-size:13px;font-weight:600;color:var(--text-primary);flex:1">${esc(row.title || '(untitled)')}</div>` +
    `<span style="font-size:9.5px;padding:2px 7px;border-radius:999px;background:rgba(148,163,184,0.16);color:var(--text-tertiary);letter-spacing:.04em;text-transform:uppercase">${esc(sourceLabel)}</span>` +
    '</div>' +
    (idsHtml ? `<div style="font-size:10.5px;color:var(--text-tertiary);margin-top:6px;display:flex;gap:8px;flex-wrap:wrap">${idsHtml}</div>` : '') +
    authorsHtml +
    (urlHtml ? `<div style="margin-top:6px">${urlHtml}</div>` : '') +
    '</article>'
  );
}

/* Pure renderer — takes the federation response (or null when the
   endpoint is unavailable) and returns an HTML string. Exported for
   unit testing without network or DOM. */
export function renderFederatedSearchPanel(response, options = {}) {
  const { endpointAvailable = true } = options;
  const headerOpen =
    '<section class="ch-card" data-testid="federated-search-panel" ' +
    'style="margin-bottom:16px;padding:16px 18px">' +
    '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px;flex-wrap:wrap">' +
    '<div>' +
    '<div style="font-size:14px;font-weight:700;color:var(--text-primary)">Federated clinical-evidence search</div>' +
    '<div style="font-size:11.5px;color:var(--text-tertiary);margin-top:4px">One call: internal corpus + every Category-3 external adapter the registry can reach.</div>' +
    '</div></div>';
  const headerClose = '</section>';

  if (!endpointAvailable || !response || !Array.isArray(response.source_status)) {
    return (
      headerOpen +
      '<div style="padding:14px;border:1px dashed var(--border);border-radius:10px;background:rgba(255,255,255,0.02);font-size:12px;color:var(--text-secondary);line-height:1.6" data-testid="federated-search-unavailable">' +
      esc(FEDERATED_SEARCH_UNAVAILABLE_NOTICE) +
      '</div>' +
      headerClose
    );
  }

  const sourceStatusHtml =
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:8px;margin-bottom:12px">' +
    response.source_status.map(_renderSourceStatusRow).join('') +
    '</div>';

  const internalRows = Array.isArray(response.internal_results) ? response.internal_results : [];
  const externalRows = Array.isArray(response.external_results) ? response.external_results : [];

  const internalSection = internalRows.length
    ? '<div style="margin-top:8px"><div style="font-size:11px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px">Internal corpus (' + internalRows.length + ')</div>' +
      internalRows.map(r => _renderResultRow(r, options)).join('') + '</div>'
    : '';
  const externalSection = externalRows.length
    ? '<div style="margin-top:12px"><div style="font-size:11px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px">External sources (' + externalRows.length + ')</div>' +
      externalRows.map(r => _renderResultRow(r, options)).join('') + '</div>'
    : '';

  const warningsHtml = Array.isArray(response.warnings) && response.warnings.length
    ? '<div style="margin-top:12px;padding:10px 12px;border-radius:10px;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.18)" data-testid="federated-search-warnings"><div style="font-size:10.5px;text-transform:uppercase;letter-spacing:.08em;color:var(--text-tertiary);margin-bottom:6px">Warnings</div>' +
      response.warnings.map(w => `<div style="font-size:11.5px;color:var(--text-secondary);line-height:1.5">• ${esc(w)}</div>`).join('') +
      '</div>'
    : '';

  const disclaimerHtml = response.decision_support_disclaimer
    ? `<div style="margin-top:14px;padding:10px 12px;border-radius:10px;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.18);font-size:11.5px;color:var(--text-secondary);line-height:1.6" data-testid="federated-search-disclaimer">${esc(response.decision_support_disclaimer)}</div>`
    : '';

  const emptyHtml = (internalRows.length === 0 && externalRows.length === 0)
    ? '<div style="padding:12px;border:1px dashed var(--border);border-radius:10px;background:rgba(255,255,255,0.02);font-size:12px;color:var(--text-secondary);line-height:1.6" data-testid="federated-search-empty">No matches across internal corpus or external sources. Do NOT interpret an empty envelope as a clinical finding.</div>'
    : '';

  return (
    headerOpen +
    sourceStatusHtml +
    internalSection +
    externalSection +
    emptyHtml +
    warningsHtml +
    disclaimerHtml +
    headerClose
  );
}

/* Async wrapper — runs one federated search and returns the HTML panel.
   Always resolves to a string so callers can concatenate without
   try/catch. */
export async function loadAndRenderFederatedSearch(body = {}, options = {}) {
  let response = null;
  let endpointAvailable = true;
  try {
    response = await api.evidenceFederatedSearch(body);
  } catch {
    endpointAvailable = false;
    response = null;
  }
  return renderFederatedSearchPanel(response, { endpointAvailable, ...options });
}

/* Window-scoped imperative shim. Lets pages-research-evidence.js call
   into this module via an inline onclick without an ESM cycle. The
   shim takes a body object + a target element id, fetches, and writes
   the rendered HTML into the target. Returns true if it ran end-to-end. */
if (typeof window !== 'undefined') {
  window._reLoadFederatedSearch = async function (body, targetElementId) {
    if (!body || typeof body !== 'object') return false;
    if (typeof document === 'undefined') return false;
    const html = await loadAndRenderFederatedSearch(body);
    const target = document.getElementById(targetElementId);
    if (target) target.innerHTML = html;
    return true;
  };
}
