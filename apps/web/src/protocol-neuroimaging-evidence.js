// ─────────────────────────────────────────────────────────────────────────────
// protocol-neuroimaging-evidence.js — Category 4 PR-4
//
// Neuroimaging evidence search affordance for the Protocol Builder /
// Personalized Protocol surfaces.
//
// Two modes:
//   * 'anonymous'      → POST /api/v1/neuroimaging/search        (no PHI)
//   * 'patient-linked' → POST /api/v1/neuroimaging/search-for-patient
//                        (requires role gate + cross-clinic + ai-analysis consent)
//
// In Protocol Builder, the panel defaults to 'anonymous' and offers a
// "Search for this patient" toggle when window._builderPatientId is set.
// In the Personalized Protocol routing (window._psWizard?.mode === 'personalized')
// the panel defaults to 'patient-linked' but keeps the anonymous fallback.
//
// IMPORTANT WIRING RULE
// ─────────────────────
// The search payload is catalog metadata ONLY (condition, modality, region,
// atlas, population). PHI never enters the upstream call; the patient_id is
// authorisation-scope, not query data.
//
// SAFETY
// ──────
// Every panel render embeds the decision-support disclaimer next to the
// "Search" button: "decision support only — clinician must verify against
// patient anatomy". Selected references are stamped with the same disclaimer
// when attached to the protocol so downstream consumers cannot accidentally
// surface them as autonomous recommendations.
// ─────────────────────────────────────────────────────────────────────────────

import { api } from './api.js';

export const DECISION_SUPPORT_DISCLAIMER =
  'decision support only — clinician must verify against patient anatomy';

// Lifecycle badge styling matches PR-2's neuroimaging adapter styling.
const LIFECYCLE_BADGE_COLOURS = {
  healthy: { bg: 'rgba(16,185,129,0.12)', fg: '#10b981', label: 'healthy' },
  experimental: { bg: 'rgba(245,158,11,0.12)', fg: '#f59e0b', label: 'experimental' },
  deprecated: { bg: 'rgba(239,68,68,0.12)', fg: '#ef4444', label: 'deprecated' },
  unknown: { bg: 'rgba(148,163,184,0.12)', fg: '#94a3b8', label: 'unknown' },
};

// HTML escape, kept local so this helper has no DOM dependency beyond api.js.
function _esc(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Decide the default search mode for a given builder context.
//
//   * patient-linked is the default when the caller is in the personalized
//     protocol routing (mode === 'personalized') AND a patientId is present.
//   * patient-linked is also offered (but NOT default) whenever a patientId
//     is present in plain builder mode.
//   * anonymous is the only choice otherwise.
//
// The toggle UI shows both modes whenever a patientId is present so the
// clinician can always fall back to the anonymous catalog if consent is
// missing or out-of-scope for this query.
export function resolveDefaultMode({ patientId, wizardMode } = {}) {
  if (!patientId) return 'anonymous';
  if (wizardMode === 'personalized') return 'patient-linked';
  return 'anonymous';
}

// Build a normalized payload for either search endpoint. Strips empty
// strings + nulls so the backend doesn't get noisy keys.
export function buildSearchPayload({
  condition,
  modality,
  region,
  atlas,
  population,
  coordinate,
  sources,
  limit = 10,
} = {}) {
  const payload = { limit };
  if (condition) payload.condition = condition;
  if (modality) payload.modality = modality;
  if (region) payload.region = region;
  if (atlas) payload.atlas = atlas;
  if (population) payload.population = population;
  if (Array.isArray(coordinate) && coordinate.length === 3) {
    payload.coordinate = coordinate;
  }
  if (Array.isArray(sources) && sources.length) payload.sources = sources;
  return payload;
}

// Run the search against either endpoint. Returns the raw API response.
//
// In patient-linked mode the patient_id is passed as a separate argument
// (per api.neuroimagingSearchForPatient signature) so callers cannot
// accidentally embed PHI in the body.
export async function runNeuroimagingSearch({ mode, patientId, query, apiClient } = {}) {
  const client = apiClient || api;
  const payload = buildSearchPayload(query || {});
  if (mode === 'patient-linked') {
    if (!patientId) {
      throw new Error('patient-linked mode requires patientId');
    }
    return client.neuroimagingSearchForPatient(patientId, payload);
  }
  return client.neuroimagingSearch(payload);
}

// Convert a single federation result row into the protocol's evidence_refs
// shape. The disclaimer is stamped onto every reference so it cannot be lost
// through any downstream cloning.
//
// Schema deliberately matches the `evidence_refs` slot the existing
// _pushCustomToBackend payload already understands (apps/web/src/pages-protocols.js
// line 1684) — augmented with a `kind: 'neuroimaging'` discriminator so the
// backend can later distinguish neuroimaging catalogue refs from generic
// references without parsing URLs.
export function toEvidenceRef(row) {
  if (!row || typeof row !== 'object') return null;
  const record = row.record || {};
  return {
    kind: 'neuroimaging',
    source: row.source_id || record.source || 'unknown',
    source_name: row.source_name || record.source || 'unknown',
    source_id: record.source_id || row.source_id || '',
    title: record.title || row.source_name || 'untitled neuroimaging record',
    modality: record.modality || null,
    coordinate_space: record.coordinate_space || null,
    coordinates: Array.isArray(record.coordinates) ? record.coordinates : null,
    atlas_labels: Array.isArray(record.atlas_labels) ? record.atlas_labels : null,
    source_url: record.dataset_url || row.provenance?.source_url || '',
    doi_or_pmid: record.doi_or_pmid || null,
    access_notes: record.access_notes || '',
    lifecycle_state: row.provenance?.lifecycle_state || 'unknown',
    decision_support_disclaimer: DECISION_SUPPORT_DISCLAIMER,
  };
}

// Convenience: attach a reference to a protocol-builder state object's
// neuroimagingRefs array (creating it if absent). Returns the new state.
// Pure function — does not mutate the input.
export function attachReferenceToProtocol(builderState, reference) {
  if (!reference) return builderState;
  const existing = Array.isArray(builderState?.neuroimagingRefs)
    ? builderState.neuroimagingRefs
    : [];
  // Dedup by (source, source_id) — same upstream record cannot be attached twice.
  const key = `${reference.source}::${reference.source_id}`;
  const seen = new Set(existing.map((r) => `${r.source}::${r.source_id}`));
  if (seen.has(key)) return builderState;
  return {
    ...(builderState || {}),
    neuroimagingRefs: [...existing, reference],
  };
}

// Render the inline drawer/panel HTML. Caller mounts this anywhere it needs;
// the function is pure-string so it works in tests with no DOM.
export function renderNeuroimagingEvidencePanel({
  mode = 'anonymous',
  patientId = null,
  status = 'idle', // 'idle' | 'loading' | 'success' | 'error'
  results = [],
  errorMessage = '',
  attachedCount = 0,
  query = {},
} = {}) {
  const hasPatient = Boolean(patientId);
  const modeLabel = mode === 'patient-linked'
    ? 'Patient-linked (consent enforced)'
    : 'Anonymous catalog';
  const modeBadge = mode === 'patient-linked'
    ? '<span data-testid="neuro-mode-badge" class="neuro-mode-badge neuro-mode-patient" style="display:inline-block;padding:2px 8px;border-radius:999px;background:rgba(20,184,166,0.12);color:#14b8a6;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em">PATIENT-LINKED</span>'
    : '<span data-testid="neuro-mode-badge" class="neuro-mode-badge neuro-mode-anon" style="display:inline-block;padding:2px 8px;border-radius:999px;background:rgba(148,163,184,0.18);color:#94a3b8;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em">ANONYMOUS</span>';

  const toggleHtml = hasPatient
    ? `<div class="neuro-mode-toggle" data-testid="neuro-mode-toggle" style="display:flex;gap:6px;margin:6px 0">
         <button type="button" class="neuro-mode-btn${mode === 'patient-linked' ? ' neuro-mode-btn-active' : ''}"
                 data-testid="neuro-mode-patient-btn"
                 onclick="window._neuroEvSetMode && window._neuroEvSetMode('patient-linked')"
                 style="font-size:11px;padding:4px 10px;border-radius:6px;border:1px solid ${mode === 'patient-linked' ? '#14b8a6' : 'var(--border,#334155)'};background:${mode === 'patient-linked' ? 'rgba(20,184,166,0.15)' : 'transparent'};color:var(--text-primary,#e2e8f0);cursor:pointer">Search for this patient</button>
         <button type="button" class="neuro-mode-btn${mode === 'anonymous' ? ' neuro-mode-btn-active' : ''}"
                 data-testid="neuro-mode-anon-btn"
                 onclick="window._neuroEvSetMode && window._neuroEvSetMode('anonymous')"
                 style="font-size:11px;padding:4px 10px;border-radius:6px;border:1px solid ${mode === 'anonymous' ? '#14b8a6' : 'var(--border,#334155)'};background:${mode === 'anonymous' ? 'rgba(20,184,166,0.15)' : 'transparent'};color:var(--text-primary,#e2e8f0);cursor:pointer">Search catalog instead</button>
       </div>`
    : '';

  const resultsHtml = (() => {
    if (status === 'loading') {
      return '<div data-testid="neuro-status-loading" style="font-size:11px;color:var(--text-tertiary,#94a3b8);padding:8px 0">Searching neuroimaging catalogs…</div>';
    }
    if (status === 'error') {
      return `<div data-testid="neuro-status-error" style="font-size:11px;color:#ef4444;padding:8px 0">${_esc(errorMessage) || 'Search failed.'}</div>`;
    }
    if (status === 'success' && !results.length) {
      return '<div data-testid="neuro-status-empty" style="font-size:11px;color:var(--text-tertiary,#94a3b8);padding:8px 0">No matching neuroimaging evidence. Try a different region or modality.</div>';
    }
    if (status === 'success') {
      return results.map((row, idx) => {
        const r = row.record || {};
        const lifecycle = row.provenance?.lifecycle_state || 'unknown';
        const badge = LIFECYCLE_BADGE_COLOURS[lifecycle] || LIFECYCLE_BADGE_COLOURS.unknown;
        const lifecycleBadge = `<span class="neuro-lifecycle-badge" data-testid="neuro-lifecycle-${idx}" style="display:inline-block;padding:1px 6px;border-radius:999px;background:${badge.bg};color:${badge.fg};font-size:9px;font-weight:600;text-transform:uppercase">${badge.label}</span>`;
        const modalityChip = r.modality ? `<span style="font-size:10px;color:var(--text-tertiary,#94a3b8);margin-left:6px">${_esc(r.modality)}</span>` : '';
        const coords = Array.isArray(r.coordinates) && r.coordinates.length === 3
          ? `<span style="font-family:var(--font-mono,monospace);font-size:10px;color:var(--text-tertiary,#94a3b8);margin-left:6px">MNI [${r.coordinates.map((n) => Number(n).toFixed(1)).join(', ')}]</span>`
          : '';
        return `<div class="neuro-result-row" data-testid="neuro-result-${idx}" style="padding:6px 0;border-bottom:1px solid var(--border,#1e293b)">
                  <div style="display:flex;align-items:center;gap:6px">
                    ${lifecycleBadge}
                    <span style="font-size:11.5px;font-weight:500;color:var(--text-primary,#e2e8f0)">${_esc(r.title || 'untitled')}</span>
                    ${modalityChip}
                    ${coords}
                  </div>
                  <div style="display:flex;align-items:center;justify-content:space-between;margin-top:4px">
                    <span style="font-size:10px;color:var(--text-tertiary,#94a3b8)">${_esc(row.source_name || row.source_id || 'unknown')}${r.doi_or_pmid ? ' · ' + _esc(r.doi_or_pmid) : ''}</span>
                    <button type="button" class="neuro-attach-btn" data-testid="neuro-attach-${idx}"
                            onclick="window._neuroEvAttach && window._neuroEvAttach(${idx})"
                            style="font-size:10px;padding:2px 8px;border-radius:4px;border:1px solid #14b8a6;background:transparent;color:#14b8a6;cursor:pointer">Attach to protocol</button>
                  </div>
                </div>`;
      }).join('');
    }
    return '<div data-testid="neuro-status-idle" style="font-size:11px;color:var(--text-tertiary,#94a3b8);padding:8px 0">Enter condition / modality / region above, then run a search.</div>';
  })();

  const attachedNote = attachedCount > 0
    ? `<div data-testid="neuro-attached-count" style="font-size:10px;color:#14b8a6;margin-top:6px">${attachedCount} reference${attachedCount === 1 ? '' : 's'} attached to draft</div>`
    : '';

  return `
    <div class="prot-b-neuro-evidence" data-testid="neuro-evidence-panel" style="margin-top:8px">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:6px">
        <span style="font-size:12px;font-weight:600;color:var(--text-secondary,#cbd5e1)">Neuroimaging Evidence</span>
        ${modeBadge}
      </div>
      <div data-testid="neuro-disclaimer" style="font-size:10.5px;color:var(--text-tertiary,#94a3b8);margin:4px 0 4px 0;font-style:italic">
        ${DECISION_SUPPORT_DISCLAIMER}
      </div>
      ${toggleHtml}
      <div style="display:flex;align-items:center;gap:6px;margin-top:4px">
        <button type="button"
                class="neuro-search-btn"
                data-testid="neuro-search-btn"
                onclick="window._neuroEvSearch && window._neuroEvSearch()"
                style="font-size:11px;padding:4px 12px;border-radius:6px;border:1px solid #14b8a6;background:rgba(20,184,166,0.15);color:#14b8a6;cursor:pointer;font-weight:600">Search neuroimaging evidence</button>
        <span style="font-size:10px;color:var(--text-tertiary,#94a3b8)" data-testid="neuro-current-mode">Mode: ${_esc(modeLabel)}</span>
      </div>
      <div class="neuro-results" data-testid="neuro-results" style="margin-top:6px;max-height:280px;overflow-y:auto">
        ${resultsHtml}
      </div>
      ${attachedNote}
    </div>`;
}

// All-in-one helper that callers (pages-protocols.js) can mount as a panel.
// Manages local state, wires window-level handlers, and re-renders on change.
//
// Returns { mount(host), runSearch(), attach(idx) } so the caller can drive
// it programmatically too — handy for tests + for protocol auto-attach flows.
export function createNeuroimagingEvidenceController({
  patientId = null,
  wizardMode = null,
  getQuery,          // () => { condition, modality, region, atlas, population }
  onAttach,          // (reference) => void — caller persists to protocol state
  apiClient = null,
} = {}) {
  const state = {
    mode: resolveDefaultMode({ patientId, wizardMode }),
    status: 'idle',
    results: [],
    errorMessage: '',
    attachedCount: 0,
    patientId,
  };

  let _host = null;

  function _render() {
    if (!_host) return;
    _host.innerHTML = renderNeuroimagingEvidencePanel({
      mode: state.mode,
      patientId: state.patientId,
      status: state.status,
      results: state.results,
      errorMessage: state.errorMessage,
      attachedCount: state.attachedCount,
    });
  }

  function setMode(mode) {
    if (mode === 'patient-linked' && !state.patientId) return;
    state.mode = mode === 'patient-linked' ? 'patient-linked' : 'anonymous';
    _render();
  }

  async function runSearch() {
    const query = typeof getQuery === 'function' ? (getQuery() || {}) : {};
    state.status = 'loading';
    state.errorMessage = '';
    _render();
    try {
      const resp = await runNeuroimagingSearch({
        mode: state.mode,
        patientId: state.patientId,
        query,
        apiClient,
      });
      state.results = Array.isArray(resp?.results) ? resp.results : [];
      state.status = 'success';
    } catch (err) {
      state.status = 'error';
      state.errorMessage = err?.message || 'Search failed';
      state.results = [];
    }
    _render();
  }

  function attach(idx) {
    const row = state.results[idx];
    if (!row) return;
    const ref = toEvidenceRef(row);
    if (!ref) return;
    if (typeof onAttach === 'function') onAttach(ref);
    state.attachedCount += 1;
    _render();
  }

  function mount(host) {
    _host = host;
    // Wire window-level handlers used by the rendered onclick attributes.
    if (typeof window !== 'undefined') {
      window._neuroEvSearch = () => { runSearch(); };
      window._neuroEvSetMode = (m) => setMode(m);
      window._neuroEvAttach = (idx) => attach(idx);
    }
    _render();
  }

  return { mount, runSearch, setMode, attach, getState: () => ({ ...state }) };
}

export default {
  DECISION_SUPPORT_DISCLAIMER,
  resolveDefaultMode,
  buildSearchPayload,
  runNeuroimagingSearch,
  toEvidenceRef,
  attachReferenceToProtocol,
  renderNeuroimagingEvidencePanel,
  createNeuroimagingEvidenceController,
};
