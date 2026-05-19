/**
 * neuroimaging-provenance-card.js — Brain Map Planner Category-4 surface
 *
 * Pure render helpers (no React, no DOM) that produce HTML strings for the
 * Brain Map Planner right-rail / target-candidate panels. These helpers
 * surface neuroimaging provenance (NeuroVault, NeuroQuery, etc.) that
 * arrives on `full_artifact.target_candidates[*].neuroimaging_provenance`
 * after PR-1 (PR #1053) backend wiring.
 *
 * Design rules:
 *  - Read-only display. No autonomous "suggest coordinates" CTA.
 *  - Mark uncertainty inline: "source-derived reference — requires
 *    clinician review" on every candidate that has provenance.
 *  - Show the `decision_support_disclaimer` ONCE per planner (planner
 *    footer / sidebar — not per-candidate, to avoid noise).
 *  - When `lifecycle_state` is not `healthy`, render a small badge with a
 *    human-readable label ("application required", "deprecated", etc.).
 *  - All output is plain HTML; the planner template-literal flow already
 *    handles escaping via the existing `esc()` helper, so we re-implement
 *    a minimal `_esc()` here to keep this module dependency-free for
 *    direct unit testing under node:test.
 *
 * NOT a substitute for backend federation. Search results live in PR-3.
 */

// ── Escaping ──────────────────────────────────────────────────────────────
function _esc(value) {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

// ── Lifecycle badge ───────────────────────────────────────────────────────
// Mirrors backend lifecycle states from PR #1053:
//   healthy | degraded | disabled | unavailable | catalogued |
//   software_resource | requires_application | deprecated
// Anything not `healthy` gets a visible badge so clinicians don't trust a
// provenance row attached to a stale or restricted source.
const _LIFECYCLE_LABEL = {
  healthy: 'healthy',
  degraded: 'degraded',
  disabled: 'disabled',
  unavailable: 'unavailable',
  catalogued: 'catalog only',
  software_resource: 'software',
  requires_application: 'application required',
  deprecated: 'deprecated',
};

const _LIFECYCLE_TONE = {
  healthy: { bg: 'rgba(0,212,188,.12)', fg: '#00d4bc' },
  degraded: { bg: 'rgba(255,181,71,.14)', fg: '#ffb547' },
  disabled: { bg: 'rgba(255,255,255,.06)', fg: 'rgba(255,255,255,.55)' },
  unavailable: { bg: 'rgba(255,107,157,.12)', fg: '#ff6b9d' },
  catalogued: { bg: 'rgba(74,158,255,.12)', fg: '#4a9eff' },
  software_resource: { bg: 'rgba(74,158,255,.12)', fg: '#4a9eff' },
  requires_application: { bg: 'rgba(255,181,71,.14)', fg: '#ffb547' },
  deprecated: { bg: 'rgba(255,107,157,.12)', fg: '#ff6b9d' },
};

export function renderNeuroimagingLifecycleBadge(state) {
  const key = String(state || '').toLowerCase();
  if (!key || key === 'healthy') return '';
  const label = _LIFECYCLE_LABEL[key] || key.replace(/_/g, ' ');
  const tone = _LIFECYCLE_TONE[key] || _LIFECYCLE_TONE.disabled;
  return `<span class="dv2bm-neuro-badge" style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:999px;background:${tone.bg};color:${tone.fg};font-size:10px;font-weight:700;letter-spacing:.02em;text-transform:uppercase">${_esc(label)}</span>`;
}

// ── Provenance card ───────────────────────────────────────────────────────
// One card per `neuroimaging_provenance` entry. Fields we surface
// (matching backend `NeuroimagingSearchResultItem` + free-form metadata):
//   source / source_name, source_id, coordinate_space, atlas_labels[],
//   coordinates [x,y,z], access_notes, lifecycle_state, dataset_url.
export function renderNeuroimagingProvenanceCard(provenance, options = {}) {
  if (!provenance || typeof provenance !== 'object') return '';

  const sourceName = provenance.source_name || provenance.source || provenance.source_id || 'unknown source';
  const sourceId = provenance.source_id || '';
  const space = provenance.coordinate_space || provenance.space || '';
  const atlasLabels = Array.isArray(provenance.atlas_labels)
    ? provenance.atlas_labels.filter(Boolean)
    : [];
  const coords = Array.isArray(provenance.coordinates) ? provenance.coordinates : null;
  const accessNotes = provenance.access_notes || '';
  const lifecycle = provenance.lifecycle_state || provenance.status || '';
  const datasetUrl = provenance.dataset_url || provenance.source_url || '';

  const badge = renderNeuroimagingLifecycleBadge(lifecycle);
  const coordLine = coords && coords.length === 3
    ? `<div class="dv2bm-neuro-coord">MNI [${_esc(coords[0])}, ${_esc(coords[1])}, ${_esc(coords[2])}]</div>`
    : '';
  const atlasLine = atlasLabels.length
    ? `<div class="dv2bm-neuro-atlas">${atlasLabels.map((a) => `<span>${_esc(a)}</span>`).join('')}</div>`
    : '';
  const spaceLine = space
    ? `<div class="dv2bm-neuro-meta">Space: ${_esc(space)}</div>`
    : '';
  const sourceIdLine = sourceId
    ? `<div class="dv2bm-neuro-meta">Source ID: <span style="font-family:'JetBrains Mono',ui-monospace,monospace">${_esc(sourceId)}</span></div>`
    : '';
  const accessLine = accessNotes
    ? `<div class="dv2bm-neuro-access">${_esc(accessNotes)}</div>`
    : '';
  const linkLine = datasetUrl
    ? `<div class="dv2bm-neuro-link"><a href="${_esc(datasetUrl)}" target="_blank" rel="noopener noreferrer">View source ↗</a></div>`
    : '';

  // Per-candidate uncertainty caveat (small inline label). NOT the full
  // disclaimer — that goes once in the planner footer, not per card.
  const caveat = `<div class="dv2bm-neuro-caveat">source-derived reference — requires clinician review</div>`;

  return `
    <div class="dv2bm-neuro-card" style="padding:10px 12px;border:1px solid rgba(74,158,255,.30);border-radius:10px;background:rgba(74,158,255,.05);display:flex;flex-direction:column;gap:6px">
      <div class="dv2bm-neuro-head" style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <div class="dv2bm-neuro-source" style="font-size:12px;font-weight:700;color:#e2e8f0">${_esc(sourceName)}</div>
        ${badge}
      </div>
      ${sourceIdLine}
      ${spaceLine}
      ${coordLine}
      ${atlasLine}
      ${accessLine}
      ${linkLine}
      ${caveat}
    </div>
  `;
}

// ── Provenance list ───────────────────────────────────────────────────────
// Aggregates the provenance entries from `full_artifact.target_candidates`
// into a single right-rail panel. Returns '' when none are present so the
// planner stays clean for plans that pre-date PR-1 wiring.
export function renderNeuroimagingProvenancePanel(targetCandidates) {
  const list = Array.isArray(targetCandidates) ? targetCandidates : [];
  if (!list.length) return '';

  const cards = [];
  for (const candidate of list) {
    if (!candidate || typeof candidate !== 'object') continue;
    const prov = candidate.neuroimaging_provenance;
    if (!prov) continue;
    // A candidate may carry one provenance object or an array.
    if (Array.isArray(prov)) {
      for (const p of prov) {
        const card = renderNeuroimagingProvenanceCard(p);
        if (card) {
          cards.push(`<div class="dv2bm-neuro-row" data-target="${_esc(candidate.region || candidate.target || '')}">${card}</div>`);
        }
      }
    } else {
      const card = renderNeuroimagingProvenanceCard(prov);
      if (card) {
        cards.push(`<div class="dv2bm-neuro-row" data-target="${_esc(candidate.region || candidate.target || '')}">${card}</div>`);
      }
    }
  }

  if (!cards.length) return '';

  return `
    <div class="dv2bm-group dv2bm-neuro-group">
      <div class="dv2bm-group-title"><span class="num">07</span>Neuroimaging provenance</div>
      <div style="display:flex;flex-direction:column;gap:8px">
        ${cards.join('')}
      </div>
    </div>
  `;
}

// ── Footer disclaimer ─────────────────────────────────────────────────────
// One-shot rendering of the `decision_support_disclaimer` at the planner
// footer / sidebar. Falls back to a stable default string when the backend
// payload doesn't carry one (e.g., when PR-1 isn't deployed yet).
export const DEFAULT_NEUROIMAGING_DISCLAIMER =
  'Decision support only. Not diagnostic. Source-derived references must be reviewed by a qualified clinician before any clinical decision.';

export function renderNeuroimagingDisclaimerFooter(disclaimer) {
  const text = disclaimer || DEFAULT_NEUROIMAGING_DISCLAIMER;
  return `
    <div class="dv2bm-neuro-disclaimer" style="margin-top:12px;padding:10px 12px;border-radius:10px;border:1px solid rgba(255,181,71,.25);background:rgba(255,181,71,.06);font-size:11px;line-height:1.55;color:#94a3b8">
      ${_esc(text)}
    </div>
  `;
}

// ── Helpers re-exported for tests ─────────────────────────────────────────
export const _internals = { _esc, _LIFECYCLE_LABEL, _LIFECYCLE_TONE };
