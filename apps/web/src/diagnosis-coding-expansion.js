// Category 8 — Terminology expansion panel.
//
// Drop-in renderer for pages that want to surface
// /api/v1/diagnosis/query-expansion results next to a condition input.
// Pages call `renderTerminologyExpansionPanel(api, container, { condition, targetWorkflow })`
// and the panel takes over from there — fetch, render, error-state,
// disclaimer, source attribution.
//
// SAFETY CONTRACT:
//  - The panel MUST render the `decision_support_disclaimer` from the
//    response. Tests pin this.
//  - The panel MUST NOT add language like "covered", "eligible", or
//    "approved indication" beyond what the API returns.
//  - The panel degrades gracefully when sources are unavailable; the
//    `source_status` block surfaces UMLS/SNOMED-CT degraded reasons.

const STATUS_LABEL = Object.freeze({
  ok: 'Available',
  registered: 'Available',
  degraded: 'License required',
  down: 'Unavailable',
  missing: 'Not registered',
});

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])
  );
}

function renderEmpty(container, condition, message) {
  container.dataset.state = 'empty';
  container.innerHTML = `
    <div class="ds-terminology-expansion ds-terminology-expansion--empty" data-state="empty">
      <p class="ds-terminology-expansion__title">Terminology expansion</p>
      <p class="ds-terminology-expansion__message">${escapeHtml(message)}</p>
      <p class="ds-terminology-expansion__condition">Query: <code>${escapeHtml(condition)}</code></p>
    </div>`;
}

function renderError(container, condition, err) {
  const message = err?.message || 'Unknown error';
  container.dataset.state = 'error';
  container.innerHTML = `
    <div class="ds-terminology-expansion ds-terminology-expansion--error" data-state="error" role="alert">
      <p class="ds-terminology-expansion__title">Terminology expansion failed</p>
      <p class="ds-terminology-expansion__message">${escapeHtml(message)}</p>
      <p class="ds-terminology-expansion__condition">Query: <code>${escapeHtml(condition)}</code></p>
    </div>`;
}

function renderMapping(source, items) {
  if (!items || items.length === 0) {
    return `
      <li class="ds-terminology-expansion__source ds-terminology-expansion__source--empty" data-source="${escapeHtml(source)}">
        <span class="ds-terminology-expansion__source-name">${escapeHtml(source.toUpperCase())}</span>
        <span class="ds-terminology-expansion__source-empty">no mappings</span>
      </li>`;
  }
  const rows = items
    .map(
      (m) => `
        <li class="ds-terminology-expansion__match" data-code="${escapeHtml(m.code)}">
          <code class="ds-terminology-expansion__code">${escapeHtml(m.code)}</code>
          <span class="ds-terminology-expansion__display">${escapeHtml(m.display)}</span>
        </li>`
    )
    .join('');
  return `
    <li class="ds-terminology-expansion__source" data-source="${escapeHtml(source)}">
      <span class="ds-terminology-expansion__source-name">${escapeHtml(source.toUpperCase())}</span>
      <ul class="ds-terminology-expansion__matches">${rows}</ul>
    </li>`;
}

function renderStatusRow(key, status) {
  const label = STATUS_LABEL[status?.status] || status?.status || 'unknown';
  const reason = status?.message || status?.reason || '';
  const reasonHtml = reason
    ? ` <span class="ds-terminology-expansion__status-reason">${escapeHtml(reason)}</span>`
    : '';
  return `
    <li class="ds-terminology-expansion__status" data-source="${escapeHtml(key)}" data-status="${escapeHtml(status?.status || 'unknown')}">
      <span class="ds-terminology-expansion__status-source">${escapeHtml(key.toUpperCase())}</span>
      <span class="ds-terminology-expansion__status-label">${escapeHtml(label)}</span>${reasonHtml}
    </li>`;
}

export async function renderTerminologyExpansionPanel(
  api,
  container,
  { condition, targetWorkflow = 'evidence', limit = 5 } = {}
) {
  if (!container) return;
  const conditionStr = String(condition || '').trim();
  if (!conditionStr) {
    renderEmpty(container, '', 'Enter a condition to expand terminology.');
    return;
  }

  container.dataset.state = 'loading';
  container.innerHTML = `
    <div class="ds-terminology-expansion ds-terminology-expansion--loading" data-state="loading">
      <p class="ds-terminology-expansion__title">Expanding terminology…</p>
      <p class="ds-terminology-expansion__condition">Query: <code>${escapeHtml(conditionStr)}</code></p>
    </div>`;

  let payload;
  try {
    payload = await api.diagnosisQueryExpansion({
      condition: conditionStr,
      target_workflow: targetWorkflow,
      limit,
    });
  } catch (err) {
    renderError(container, conditionStr, err);
    return;
  }

  const mappings = payload?.mappings || {};
  const sourceStatus = payload?.source_status || {};
  const disclaimer = payload?.decision_support_disclaimer || '';
  const warnings = Array.isArray(payload?.warnings) ? payload.warnings : [];
  const evidenceSearchTerms = Array.isArray(payload?.evidence_search_terms)
    ? payload.evidence_search_terms
    : [];

  const sourceOrder = ['icd10', 'snomedct', 'mesh', 'umls', 'ols'];
  const mappingHtml = sourceOrder.map((src) => renderMapping(src, mappings[src])).join('');
  const statusHtml = sourceOrder
    .map((src) => renderStatusRow(src, sourceStatus[src]))
    .join('');
  const warningsHtml = warnings
    .map((w) => `<li class="ds-terminology-expansion__warning">${escapeHtml(w)}</li>`)
    .join('');
  const evidenceTermsHtml = evidenceSearchTerms
    .map((t) => `<li class="ds-terminology-expansion__term">${escapeHtml(t)}</li>`)
    .join('');

  container.dataset.state = 'ready';
  container.innerHTML = `
    <section class="ds-terminology-expansion ds-terminology-expansion--ready" data-state="ready" aria-label="Terminology expansion">
      <header class="ds-terminology-expansion__header">
        <h3 class="ds-terminology-expansion__title">Terminology expansion</h3>
        <p class="ds-terminology-expansion__condition">Query: <code>${escapeHtml(conditionStr)}</code></p>
      </header>
      <ul class="ds-terminology-expansion__source-list" aria-label="Per-source code mappings">
        ${mappingHtml}
      </ul>
      <details class="ds-terminology-expansion__statuses">
        <summary>Source status</summary>
        <ul class="ds-terminology-expansion__status-list">${statusHtml}</ul>
      </details>
      ${
        evidenceSearchTerms.length
          ? `<div class="ds-terminology-expansion__evidence-terms">
              <p>Evidence search terms:</p>
              <ul>${evidenceTermsHtml}</ul>
            </div>`
          : ''
      }
      ${
        warnings.length
          ? `<ul class="ds-terminology-expansion__warnings" role="status">${warningsHtml}</ul>`
          : ''
      }
      <p class="ds-terminology-expansion__disclaimer" data-testid="ds-terminology-disclaimer">
        ${escapeHtml(disclaimer)}
      </p>
    </section>`;
}

// Public helpers exposed for testability + downstream consumers that
// want to render a subset of the panel.
export const _internal = {
  STATUS_LABEL,
  escapeHtml,
  renderMapping,
  renderStatusRow,
};
