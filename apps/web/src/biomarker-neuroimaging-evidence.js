// ─────────────────────────────────────────────────────────────────────────────
// biomarker-neuroimaging-evidence.js — Category 4 PR-5
//
// Cross-wires the Biomarkers surface to the Category 4 neuroimaging
// catalog federation. Renders a "Find related imaging" affordance per
// biomarker in the detail modal, pivots to either the anonymous catalog
// search or the patient-linked variant depending on whether a patient is
// in scope.
//
// Endpoint contracts (stable, from prior PRs in the same Category 4 series):
//   * POST /api/v1/neuroimaging/search             (PR-3, anonymous)
//   * POST /api/v1/neuroimaging/search-for-patient (PR-4, patient-linked,
//                                                   role + cross-clinic +
//                                                   ai_analysis consent gates
//                                                   enforced server-side)
//
// IMPORTANT SAFETY RULES
// ──────────────────────
//   * Hypothesis-generation only — display only. No auto-correlation,
//     no autonomous routing, no clinical recommendations.
//   * The patient_id is authorisation scope, never search payload data.
//   * The decision-support disclaimer is stamped onto every panel.
//   * No PHI is mapped into the catalog search query. Only catalog
//     metadata (condition / region / modality) derived from the marker
//     structure itself flows upstream.
// ─────────────────────────────────────────────────────────────────────────────

import { apiFetch } from './api.js';

export const DECISION_SUPPORT_DISCLAIMER =
  'decision support only — clinician must verify against patient anatomy';

const LIFECYCLE_BADGE_COLOURS = {
  healthy: { bg: 'rgba(16,185,129,0.12)', fg: '#10b981', label: 'healthy' },
  experimental: { bg: 'rgba(245,158,11,0.12)', fg: '#f59e0b', label: 'experimental' },
  deprecated: { bg: 'rgba(239,68,68,0.12)', fg: '#ef4444', label: 'deprecated' },
  unknown: { bg: 'rgba(148,163,184,0.12)', fg: '#94a3b8', label: 'unknown' },
};

function _esc(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Map a neuro-biomarker group id to a neuroimaging modality hint. Best-effort
// only; if the group is purely behavioural / labs we return null and let the
// search run without a modality filter.
const _GROUP_TO_MODALITY = {
  'spectral-asymmetry': 'EEG',
  'network-connectivity': 'EEG',
  erp: 'EEG',
  'tms-eeg': 'EEG',
  'autonomic-cardiac': null,
  'sleep-architecture': 'EEG',
  'inflammatory-endocrine': null,
  'cognitive-behavioral': null,
};

export function biomarkerToModality(group) {
  if (!group || typeof group.id !== 'string') return null;
  return _GROUP_TO_MODALITY[group.id] ?? null;
}

// Common 10-20 EEG site tokens. We try to project these to a neuroimaging
// region hint only when a marker's `site` field exposes a recognisable token.
const _SITE_TO_REGION = {
  F3: 'left dorsolateral prefrontal cortex',
  F4: 'right dorsolateral prefrontal cortex',
  Fz: 'medial prefrontal cortex',
  Cz: 'central midline',
  C3: 'left sensorimotor cortex',
  C4: 'right sensorimotor cortex',
  Pz: 'precuneus / posterior midline',
  O1: 'left occipital cortex',
  O2: 'right occipital cortex',
  T3: 'left temporal cortex',
  T4: 'right temporal cortex',
  P3: 'left parietal cortex',
  P4: 'right parietal cortex',
  FCz: 'anterior cingulate cortex',
  CPz: 'posterior parietal cortex',
};

export function biomarkerToRegion(marker) {
  if (!marker || typeof marker.site !== 'string') return null;
  const tokens = marker.site.match(/\b[A-Z][a-z0-9]{0,3}\b/g) || [];
  for (const t of tokens) {
    if (Object.prototype.hasOwnProperty.call(_SITE_TO_REGION, t)) {
      return _SITE_TO_REGION[t];
    }
  }
  return null;
}

// Pick the most search-friendly condition tag for a biomarker. Returns ""
// when the biomarker has no linked condition — the search call still goes,
// just unfiltered on `condition`.
export function biomarkerToCondition(marker) {
  if (!marker || !Array.isArray(marker.conditions) || !marker.conditions.length) return '';
  // Prefer first concrete condition tag, stripped of qualifiers in parens.
  const first = String(marker.conditions[0] || '').trim();
  return first.replace(/\s*\([^)]*\)\s*$/, '').trim();
}

// Build the upstream payload from a biomarker, deliberately scrubbed of
// any PHI (patient_id flows separately, as authorisation scope).
export function buildBiomarkerSearchPayload(marker, group, { limit = 10 } = {}) {
  const payload = { limit };
  const condition = biomarkerToCondition(marker);
  const modality = biomarkerToModality(group);
  const region = biomarkerToRegion(marker);
  if (condition) payload.condition = condition;
  if (modality) payload.modality = modality;
  if (region) payload.region = region;
  return payload;
}

// Run the catalog federation call. Defaults to /search; if patientId is
// provided we route to /search-for-patient (which enforces ai_analysis
// consent + cross-clinic ownership server-side).
//
// Caller may inject `fetchImpl` for tests; production path delegates to
// apiFetch so auth + refresh + JSON shaping all happen consistently.
export async function runBiomarkerNeuroimagingSearch({ marker, group, patientId, fetchImpl } = {}) {
  const payload = buildBiomarkerSearchPayload(marker, group);
  const fetcher = typeof fetchImpl === 'function' ? fetchImpl : apiFetch;
  if (patientId) {
    return fetcher('/api/v1/neuroimaging/search-for-patient', {
      method: 'POST',
      body: JSON.stringify({ ...payload, patient_id: patientId }),
    });
  }
  return fetcher('/api/v1/neuroimaging/search', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

function _renderResultRows(results) {
  if (!Array.isArray(results) || !results.length) {
    return '<div data-testid="bm-neuro-empty" style="font-size:11px;color:var(--text-tertiary,#94a3b8);padding:8px 0">No related neuroimaging found in the catalog for this biomarker.</div>';
  }
  return results
    .map((row, idx) => {
      const r = (row && row.record) || {};
      const lifecycle = (row && row.provenance && row.provenance.lifecycle_state) || 'unknown';
      const badge = LIFECYCLE_BADGE_COLOURS[lifecycle] || LIFECYCLE_BADGE_COLOURS.unknown;
      const sourceName = (row && (row.source_name || row.source_id)) || 'unknown';
      const title = r.title || sourceName;
      const modality = r.modality ? `<span style="font-size:10px;color:var(--text-tertiary,#94a3b8);margin-left:6px">${_esc(r.modality)}</span>` : '';
      const coords = Array.isArray(r.coordinates) && r.coordinates.length === 3
        ? `<span style="font-family:var(--font-mono,monospace);font-size:10px;color:var(--text-tertiary,#94a3b8);margin-left:6px">MNI [${r.coordinates.map((n) => Number(n).toFixed(1)).join(', ')}]</span>`
        : '';
      return `<div class="bm-neuro-result-row" data-testid="bm-neuro-result-${idx}" style="padding:6px 0;border-bottom:1px solid var(--border,#1e293b)">
                <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                  <span data-testid="bm-neuro-lifecycle-${idx}" class="bm-neuro-lifecycle-badge" style="display:inline-block;padding:1px 6px;border-radius:999px;background:${badge.bg};color:${badge.fg};font-size:9px;font-weight:600;text-transform:uppercase">${badge.label}</span>
                  <span style="font-size:11.5px;font-weight:500;color:var(--text-primary,#e2e8f0)">${_esc(title)}</span>
                  ${modality}
                  ${coords}
                </div>
                <div style="font-size:10px;color:var(--text-tertiary,#94a3b8);margin-top:3px">${_esc(sourceName)}${r.doi_or_pmid ? ' · ' + _esc(r.doi_or_pmid) : ''}</div>
              </div>`;
    })
    .join('');
}

// Render the inline drawer markup for a biomarker. Caller mounts the result
// anywhere it needs (typically inside the biomarker detail modal body).
// Pure-string so tests can assert on it without a DOM.
export function renderBiomarkerNeuroimagingPanel({
  marker,
  group,
  patientId = null,
  status = 'idle', // 'idle' | 'loading' | 'success' | 'error'
  results = [],
  errorMessage = '',
} = {}) {
  const payload = buildBiomarkerSearchPayload(marker || {}, group || {});
  const modeLabel = patientId ? 'Patient-linked (consent enforced)' : 'Anonymous catalog';
  const modeBadge = patientId
    ? '<span data-testid="bm-neuro-mode-badge" style="display:inline-block;padding:2px 8px;border-radius:999px;background:rgba(20,184,166,0.12);color:#14b8a6;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em">PATIENT-LINKED</span>'
    : '<span data-testid="bm-neuro-mode-badge" style="display:inline-block;padding:2px 8px;border-radius:999px;background:rgba(148,163,184,0.18);color:#94a3b8;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em">ANONYMOUS</span>';

  const queryChips = [
    payload.condition ? `<span style="font-size:10px;padding:2px 8px;border-radius:999px;background:rgba(59,130,246,0.12);color:#60a5fa">condition: ${_esc(payload.condition)}</span>` : '',
    payload.modality ? `<span style="font-size:10px;padding:2px 8px;border-radius:999px;background:rgba(168,85,247,0.12);color:#c084fc">modality: ${_esc(payload.modality)}</span>` : '',
    payload.region ? `<span style="font-size:10px;padding:2px 8px;border-radius:999px;background:rgba(20,184,166,0.12);color:#5eead4">region: ${_esc(payload.region)}</span>` : '',
  ].filter(Boolean).join(' ');

  let body = '';
  if (status === 'loading') {
    body = '<div data-testid="bm-neuro-loading" style="font-size:11px;color:var(--text-tertiary,#94a3b8);padding:8px 0">Searching neuroimaging catalogs…</div>';
  } else if (status === 'error') {
    body = `<div data-testid="bm-neuro-error" style="font-size:11px;color:#ef4444;padding:8px 0">${_esc(errorMessage) || 'Search failed.'}</div>`;
  } else if (status === 'success') {
    body = _renderResultRows(results);
  } else {
    body = '<div data-testid="bm-neuro-idle" style="font-size:11px;color:var(--text-tertiary,#94a3b8);padding:8px 0">Click "Find related imaging" to query population-level neuroimaging catalogs.</div>';
  }

  return `
    <div class="bm-neuro-evidence" data-testid="bm-neuro-evidence-panel" style="margin-top:16px;padding:14px 16px;border-radius:12px;background:rgba(20,184,166,0.04);border:1px solid rgba(20,184,166,0.18)">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span style="font-size:12px;font-weight:600;color:var(--text-secondary,#cbd5e1)">Related Neuroimaging</span>
          ${modeBadge}
        </div>
        <button type="button"
                class="bm-neuro-search-btn"
                data-testid="bm-neuro-search-btn"
                onclick="window._bmNeuroSearch && window._bmNeuroSearch()"
                style="font-size:11px;padding:4px 12px;border-radius:6px;border:1px solid #14b8a6;background:rgba(20,184,166,0.15);color:#14b8a6;cursor:pointer;font-weight:600">Find related imaging</button>
      </div>
      <div data-testid="bm-neuro-query-chips" style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">
        ${queryChips || '<span style="font-size:10px;color:var(--text-tertiary,#94a3b8)">No filterable tags on this biomarker — search will return broad catalog hits.</span>'}
      </div>
      <div data-testid="bm-neuro-mode-label" style="margin-top:6px;font-size:10px;color:var(--text-tertiary,#94a3b8)">Mode: ${_esc(modeLabel)}</div>
      <div class="bm-neuro-results" data-testid="bm-neuro-results" style="margin-top:8px;max-height:240px;overflow-y:auto">
        ${body}
      </div>
      <div data-testid="bm-neuro-disclaimer" style="margin-top:8px;font-size:10.5px;color:var(--text-tertiary,#94a3b8);font-style:italic">
        ${DECISION_SUPPORT_DISCLAIMER}
      </div>
    </div>`;
}

// Bind a controller to a host element. Maintains local state, wires the
// window-level search handler used by the rendered onclick, and re-renders
// on each transition. Returns { runSearch(), getState() } so callers can
// drive it from tests.
export function createBiomarkerNeuroimagingController({
  marker,
  group,
  patientId = null,
  fetchImpl = null,
} = {}) {
  const state = {
    marker,
    group,
    patientId: patientId || null,
    status: 'idle',
    results: [],
    errorMessage: '',
  };
  let _host = null;

  function _render() {
    if (!_host) return;
    _host.innerHTML = renderBiomarkerNeuroimagingPanel({
      marker: state.marker,
      group: state.group,
      patientId: state.patientId,
      status: state.status,
      results: state.results,
      errorMessage: state.errorMessage,
    });
  }

  async function runSearch() {
    state.status = 'loading';
    state.errorMessage = '';
    _render();
    try {
      const resp = await runBiomarkerNeuroimagingSearch({
        marker: state.marker,
        group: state.group,
        patientId: state.patientId,
        fetchImpl,
      });
      state.results = Array.isArray(resp && resp.results) ? resp.results : [];
      state.status = 'success';
    } catch (err) {
      state.status = 'error';
      state.errorMessage = (err && err.message) || 'Search failed';
      state.results = [];
    }
    _render();
  }

  function mount(host) {
    _host = host;
    if (typeof window !== 'undefined') {
      window._bmNeuroSearch = () => { runSearch(); };
    }
    _render();
  }

  return {
    mount,
    runSearch,
    getState: () => ({ ...state }),
  };
}

export default {
  DECISION_SUPPORT_DISCLAIMER,
  biomarkerToModality,
  biomarkerToRegion,
  biomarkerToCondition,
  buildBiomarkerSearchPayload,
  runBiomarkerNeuroimagingSearch,
  renderBiomarkerNeuroimagingPanel,
  createBiomarkerNeuroimagingController,
};
