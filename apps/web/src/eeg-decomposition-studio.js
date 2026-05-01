// ─────────────────────────────────────────────────────────────────────────────
// eeg-decomposition-studio.js  —  Phase 4
//
// EEGDecompositionStudio: a vanilla-JS modal-style ICA component review grid.
// Shows topomap thumbnails, ICLabel labels, and per-band-power bars per IC.
// Click a cell to toggle exclusion. Apply-template menu drives the new
// /apply-template endpoint. No framework, no build step — matches the rest
// of the codebase.
//
// API:
//   const studio = new EEGDecompositionStudio(containerEl, {
//     onExclude: (idx, label) => {},
//     onInclude: (idx) => {},
//     onApplyTemplate: (template) => {},
//     onClose: () => {},
//   });
//   studio.setComponents(icaData);
//   studio.destroy();
// ─────────────────────────────────────────────────────────────────────────────

function _esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

const _TEMPLATES = [
  { key: 'eye_blink',     label: 'Eye blink' },
  { key: 'lateral_eye',   label: 'Lateral eye' },
  { key: 'emg',           label: 'Muscle (EMG)' },
  { key: 'ecg',           label: 'Heart (ECG)' },
  { key: 'electrode_pop', label: 'Electrode pop' },
];

const _LABEL_BADGE = {
  brain: 'brain', eye: 'eye', muscle: 'muscle', heart: 'heart',
  line_noise: 'line', 'line-noise': 'line', 'line': 'line',
  channel_noise: 'other', 'channel-noise': 'other', other: 'other',
  blink: 'eye',
};

function _bestLabel(comp) {
  const lbl = (comp && comp.label) ? String(comp.label).toLowerCase() : '';
  if (_LABEL_BADGE[lbl]) return { key: _LABEL_BADGE[lbl], conf: _bestConf(comp) };
  // Fall back to highest probability.
  const probs = (comp && comp.label_probabilities) || {};
  let bestK = 'other'; let bestP = 0;
  for (const k of Object.keys(probs)) {
    const p = Number(probs[k]) || 0;
    if (p > bestP) { bestP = p; bestK = k.toLowerCase(); }
  }
  return { key: _LABEL_BADGE[bestK] || 'other', conf: bestP };
}

function _bestConf(comp) {
  const probs = (comp && comp.label_probabilities) || {};
  const lbl = (comp && comp.label) ? String(comp.label).toLowerCase() : '';
  let p = Number(probs[lbl]) || 0;
  if (!p) {
    for (const k of Object.keys(probs)) {
      p = Math.max(p, Number(probs[k]) || 0);
    }
  }
  return p;
}

export class EEGDecompositionStudio {
  /**
   * @param {HTMLElement} containerEl
   * @param {{onExclude?:Function,onInclude?:Function,onApplyTemplate?:Function,onClose?:Function}} cb
   */
  constructor(containerEl, cb) {
    this.container = containerEl;
    this.cb = cb || {};
    this.components = [];
    this.excludedSet = new Set();
    this.iclabelAvailable = false;
    this.menuOpen = false;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  setComponents(icaData) {
    if (!icaData) icaData = {};
    this.components = Array.isArray(icaData.components) ? icaData.components : [];
    this.iclabelAvailable = !!icaData.iclabel_available;
    const auto = Array.isArray(icaData.auto_excluded_indices) ? icaData.auto_excluded_indices : [];
    this.excludedSet = new Set(auto.map((n) => Number(n)));
    // Components themselves may carry is_excluded too.
    this.components.forEach((c) => {
      if (c && c.is_excluded) this.excludedSet.add(Number(c.index));
    });
    this.render();
  }

  /** Returns the current set of excluded indices. */
  getExcludedIndices() { return Array.from(this.excludedSet.values()); }

  toggleExclude(idx) {
    const i = Number(idx);
    if (this.excludedSet.has(i)) {
      this.excludedSet.delete(i);
      if (typeof this.cb.onInclude === 'function') this.cb.onInclude(i);
    } else {
      this.excludedSet.add(i);
      const comp = this.components.find((c) => Number(c.index) === i);
      const lbl = comp ? _bestLabel(comp) : { key: 'other', conf: 0 };
      if (typeof this.cb.onExclude === 'function') this.cb.onExclude(i, lbl.key);
    }
    this.render();
  }

  destroy() { if (this.container) this.container.innerHTML = ''; }

  // ── Render ────────────────────────────────────────────────────────────────

  render() {
    if (!this.container) return;
    const cells = this.components.map((c) => this._cellHtml(c)).join('');
    const tplOptions = _TEMPLATES.map((t) =>
      `<button class="eeg-ds__tpl-item" data-tpl="${_esc(t.key)}" type="button">${_esc(t.label)}</button>`
    ).join('');
    const menuClass = this.menuOpen ? 'eeg-ds__tpl-menu eeg-ds__tpl-menu--open' : 'eeg-ds__tpl-menu';
    const html = ''
      + '<div class="eeg-ds" role="dialog" aria-label="ICA Decomposition Studio">'
      + '  <div class="eeg-ds__head">'
      + '    <div class="eeg-ds__title">ICA Decomposition Studio'
      + (this.iclabelAvailable ? ' <span class="eeg-ds__pill">ICLabel</span>' : '')
      + '    </div>'
      + '    <div class="eeg-ds__head-actions">'
      + '      <div class="eeg-ds__tpl-wrap">'
      + '        <button type="button" class="eeg-ds__btn" id="eeg-ds-tpl-btn">Apply Template <span class="eeg-ds__caret">&#9662;</span></button>'
      + `        <div class="${menuClass}" id="eeg-ds-tpl-menu">${tplOptions}</div>`
      + '      </div>'
      + '      <button type="button" class="eeg-ds__btn eeg-ds__btn--primary" id="eeg-ds-done-btn">Done</button>'
      + '    </div>'
      + '  </div>'
      + '  <div class="eeg-ds__legend">'
      + '    <span class="eeg-ds__legend-item"><span class="eeg-ds__lblc eeg-ds__lblc--brain"></span>brain</span>'
      + '    <span class="eeg-ds__legend-item"><span class="eeg-ds__lblc eeg-ds__lblc--eye"></span>eye</span>'
      + '    <span class="eeg-ds__legend-item"><span class="eeg-ds__lblc eeg-ds__lblc--muscle"></span>muscle</span>'
      + '    <span class="eeg-ds__legend-item"><span class="eeg-ds__lblc eeg-ds__lblc--heart"></span>heart</span>'
      + '    <span class="eeg-ds__legend-item"><span class="eeg-ds__lblc eeg-ds__lblc--line"></span>line</span>'
      + '    <span class="eeg-ds__legend-item"><span class="eeg-ds__lblc eeg-ds__lblc--other"></span>other</span>'
      + '  </div>'
      + `  <div class="eeg-ds__grid" id="eeg-ds-grid">${cells || '<div class="eeg-ds__empty">No components</div>'}</div>`
      + '  <div class="eeg-ds__footer">'
      + `    <span class="eeg-ds__count">${this.excludedSet.size} excluded / ${this.components.length} total</span>`
      + '    <span class="eeg-ds__safety">Decision-support only. Clinician review required.</span>'
      + '  </div>'
      + '</div>';
    this.container.innerHTML = html;
    this._wire();
  }

  _cellHtml(comp) {
    const idx = Number(comp.index);
    const lblObj = _bestLabel(comp);
    const lblKey = lblObj.key;
    const conf = Math.max(0, Math.min(1, lblObj.conf || 0));
    const confPct = (conf * 100).toFixed(0) + '%';
    const excluded = this.excludedSet.has(idx);
    const cls = 'eeg-ds__cell' + (excluded ? ' eeg-ds__cell--excluded' : '');
    const topo = comp.topomap_b64
      ? `<img class="eeg-ds__topo" src="${_esc(comp.topomap_b64)}" alt="IC${idx} topomap" />`
      : '<div class="eeg-ds__topo-fallback">no topomap</div>';
    const variance = (comp.variance_explained_pct != null)
      ? `<span class="eeg-ds__var">${Number(comp.variance_explained_pct).toFixed(1)}% var</span>`
      : '';
    return ''
      + `<div class="${cls}" data-idx="${idx}" tabindex="0" role="button" aria-pressed="${excluded ? 'true' : 'false'}">`
      + `  <div class="eeg-ds__cell-head"><span class="eeg-ds__cell-idx">IC${idx}</span>`
      + `    <span class="eeg-ds__lblc eeg-ds__lblc--${_esc(lblKey)}" title="${_esc(lblKey)}"></span>`
      + `    <span class="eeg-ds__cell-label">${_esc(lblKey)} ${confPct}</span>${variance}</div>`
      + `  ${topo}`
      + `  <div class="eeg-ds__cell-bar"><div class="eeg-ds__cell-bar-fill" style="width:${(conf * 100).toFixed(0)}%;"></div></div>`
      + `  ${excluded ? '<div class="eeg-ds__cell-flag">Excluded ✕</div>' : ''}`
      + '</div>';
  }

  _wire() {
    const cells = this.container.querySelectorAll
      ? this.container.querySelectorAll('.eeg-ds__cell')
      : [];
    for (let i = 0; i < (cells.length || 0); i += 1) {
      const cell = cells[i];
      if (!cell || !cell.addEventListener) continue;
      const idx = Number(cell.dataset && cell.dataset.idx);
      cell.addEventListener('click', () => this.toggleExclude(idx));
      cell.addEventListener('keydown', (ev) => {
        if (ev && (ev.key === 'Enter' || ev.key === ' ')) {
          if (typeof ev.preventDefault === 'function') ev.preventDefault();
          this.toggleExclude(idx);
        }
      });
    }
    const tplBtn = this.container.querySelector('#eeg-ds-tpl-btn');
    if (tplBtn && tplBtn.addEventListener) {
      tplBtn.addEventListener('click', (ev) => {
        if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation();
        this.menuOpen = !this.menuOpen;
        this.render();
      });
    }
    const items = this.container.querySelectorAll
      ? this.container.querySelectorAll('.eeg-ds__tpl-item')
      : [];
    for (let i = 0; i < (items.length || 0); i += 1) {
      const it = items[i];
      if (!it || !it.addEventListener) continue;
      it.addEventListener('click', () => {
        const tpl = it.dataset && it.dataset.tpl;
        this.menuOpen = false;
        if (typeof this.cb.onApplyTemplate === 'function' && tpl) {
          this.cb.onApplyTemplate(tpl);
        }
        this.render();
      });
    }
    const doneBtn = this.container.querySelector('#eeg-ds-done-btn');
    if (doneBtn && doneBtn.addEventListener) {
      doneBtn.addEventListener('click', () => {
        if (typeof this.cb.onClose === 'function') this.cb.onClose();
      });
    }
  }
}

// CSS — injected once per page by callers (or you can paste this into the
// pages-qeeg-raw.js stylesheet block). Kept inline with the module so the
// component is self-contained for tests.
export const EEG_DS_CSS = `
.eeg-ds { background:#0d1b2a; color:#e6e6e6; font-family:Inter,system-ui,sans-serif; padding:18px; border-radius:10px; max-height:90vh; overflow-y:auto; }
.eeg-ds__head { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:10px; }
.eeg-ds__title { font-size:16px; font-weight:600; color:#e2e8f0; }
.eeg-ds__pill { background:#1e293b; color:#94a3b8; font-size:11px; padding:2px 8px; border-radius:99px; margin-left:6px; }
.eeg-ds__head-actions { display:flex; align-items:center; gap:8px; }
.eeg-ds__btn { background:#1e293b; color:#e2e8f0; border:1px solid #334155; border-radius:6px; padding:6px 12px; font-size:13px; cursor:pointer; }
.eeg-ds__btn--primary { background:#2563eb; border-color:#2563eb; color:#fff; }
.eeg-ds__btn:hover { filter:brightness(1.15); }
.eeg-ds__tpl-wrap { position:relative; }
.eeg-ds__tpl-menu { position:absolute; top:calc(100% + 4px); right:0; background:#0f172a; border:1px solid #334155; border-radius:6px; min-width:180px; padding:4px 0; display:none; z-index:5; }
.eeg-ds__tpl-menu--open { display:block; }
.eeg-ds__tpl-item { display:block; width:100%; text-align:left; background:transparent; color:#e2e8f0; border:none; padding:6px 12px; cursor:pointer; font-size:13px; }
.eeg-ds__tpl-item:hover { background:#1e293b; }
.eeg-ds__legend { display:flex; gap:14px; flex-wrap:wrap; padding:6px 0 12px; color:#94a3b8; font-size:12px; }
.eeg-ds__legend-item { display:inline-flex; align-items:center; gap:4px; }
.eeg-ds__lblc { display:inline-block; width:10px; height:10px; border-radius:2px; background:#475569; }
.eeg-ds__lblc--brain  { background:#22c55e; }
.eeg-ds__lblc--eye    { background:#f59e0b; }
.eeg-ds__lblc--muscle { background:#ef4444; }
.eeg-ds__lblc--heart  { background:#ec4899; }
.eeg-ds__lblc--line   { background:#a78bfa; }
.eeg-ds__lblc--other  { background:#64748b; }
.eeg-ds__grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(160px, 1fr)); gap:10px; }
.eeg-ds__cell { background:#0f172a; border:1px solid #1e293b; border-radius:8px; padding:8px; cursor:pointer; position:relative; }
.eeg-ds__cell:focus { outline:2px solid #38bdf8; }
.eeg-ds__cell--excluded { border-color:#ef4444; box-shadow:0 0 0 1px #ef4444 inset; }
.eeg-ds__cell-head { display:flex; align-items:center; gap:6px; font-size:11px; color:#94a3b8; margin-bottom:4px; }
.eeg-ds__cell-idx { font-weight:600; color:#e2e8f0; }
.eeg-ds__cell-label { flex:1; }
.eeg-ds__var { font-size:10px; color:#64748b; }
.eeg-ds__topo { display:block; width:100%; height:auto; border-radius:4px; background:#020617; }
.eeg-ds__topo-fallback { width:100%; height:80px; display:flex; align-items:center; justify-content:center; background:#020617; border-radius:4px; color:#475569; font-size:11px; }
.eeg-ds__cell-bar { margin-top:6px; background:#1e293b; height:4px; border-radius:2px; overflow:hidden; }
.eeg-ds__cell-bar-fill { height:100%; background:#38bdf8; }
.eeg-ds__cell-flag { position:absolute; top:6px; right:6px; background:#ef4444; color:#fff; font-size:10px; padding:2px 6px; border-radius:3px; }
.eeg-ds__footer { display:flex; justify-content:space-between; padding-top:12px; color:#94a3b8; font-size:12px; }
.eeg-ds__safety { font-style:italic; }
.eeg-ds__count { font-weight:600; color:#e2e8f0; }
.eeg-ds__empty { color:#64748b; padding:20px; text-align:center; }
.eeg-ds__caret { font-size:9px; }
`;
