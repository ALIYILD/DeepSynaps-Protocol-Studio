// ─────────────────────────────────────────────────────────────────────────────
// eeg-spike-list.js  —  Phase 4
//
// EEGSpikeList: a vanilla-JS side popover listing detected spike events.
// Empty list is a valid clinical signal ("no spikes detected") — render an
// honest empty state, not an error.
//
// API:
//   const list = new EEGSpikeList(containerEl, { onJump: (t_sec, channel) => {} });
//   list.setEvents([
//     { t_sec: 12.4, channel: 'T3', peak_uv: 84, classification: 'spike',
//       confidence: 0.78 },
//     ...
//   ]);
//   list.show(); list.hide();
// ─────────────────────────────────────────────────────────────────────────────

function _esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

export class EEGSpikeList {
  constructor(containerEl, cb) {
    this.container = containerEl;
    this.cb = cb || {};
    this.events = [];
    this.visible = true;
    this.detectorAvailable = false;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  setEvents(events, opts) {
    this.events = Array.isArray(events) ? events.slice() : [];
    if (opts && Object.prototype.hasOwnProperty.call(opts, 'detectorAvailable')) {
      this.detectorAvailable = !!opts.detectorAvailable;
    }
    this.render();
  }

  show() { this.visible = true; this.render(); }
  hide() {
    this.visible = false;
    if (this.container) this.container.innerHTML = '';
  }

  // ── Render ────────────────────────────────────────────────────────────────

  render() {
    if (!this.container) return;
    if (!this.visible) { this.container.innerHTML = ''; return; }
    const rows = this.events.map((ev, i) => this._row(ev, i)).join('');
    const empty = (!rows && this.detectorAvailable)
      ? '<div class="eeg-sl__empty eeg-sl__empty--clinical">No spikes detected.<br/><span class="eeg-sl__empty-sub">This is a valid clinical signal.</span></div>'
      : (!rows
        ? '<div class="eeg-sl__empty">Spike detector not available — no events to show.<br/><span class="eeg-sl__empty-sub">Decision-support only.</span></div>'
        : '');
    const html = ''
      + '<div class="eeg-sl" role="region" aria-label="Detected spike events">'
      + '  <div class="eeg-sl__head">'
      + `    <div class="eeg-sl__title">Spike Events <span class="eeg-sl__count">${this.events.length}</span></div>`
      + '    <button type="button" class="eeg-sl__close" id="eeg-sl-close" aria-label="Close">×</button>'
      + '  </div>'
      + `  <div class="eeg-sl__rows" id="eeg-sl-rows">${rows || empty}</div>`
      + '  <div class="eeg-sl__foot">Click a row to jump.</div>'
      + '</div>';
    this.container.innerHTML = html;
    this._wire();
  }

  _row(ev, i) {
    const t = (Number(ev.t_sec) || 0).toFixed(2);
    const ch = ev.channel || '?';
    const peak = (ev.peak_uv != null) ? `${Number(ev.peak_uv).toFixed(0)} µV` : '';
    const cls = ev.classification ? `<span class="eeg-sl__cls">${_esc(ev.classification)}</span>` : '';
    const conf = (ev.confidence != null) ? Math.max(0, Math.min(1, Number(ev.confidence) || 0)) : null;
    const confBar = (conf != null)
      ? `<div class="eeg-sl__conf"><div class="eeg-sl__conf-fill" style="width:${(conf*100).toFixed(0)}%;"></div></div>`
      : '';
    return ''
      + `<button class="eeg-sl__row" type="button" data-i="${i}" aria-label="Jump to spike at ${t} seconds on ${_esc(ch)}">`
      + `  <span class="eeg-sl__t">${_esc(t)}s</span>`
      + `  <span class="eeg-sl__ch">${_esc(ch)}</span>`
      + `  ${cls}`
      + `  <span class="eeg-sl__peak">${_esc(peak)}</span>`
      + `  ${confBar}`
      + '</button>';
  }

  _wire() {
    const close = this.container.querySelector('#eeg-sl-close');
    if (close && close.addEventListener) {
      close.addEventListener('click', () => this.hide());
    }
    const rows = this.container.querySelectorAll && this.container.querySelectorAll('.eeg-sl__row');
    if (rows && rows.length != null) {
      for (let i = 0; i < rows.length; i += 1) {
        const r = rows[i];
        if (!r || !r.addEventListener) continue;
        r.addEventListener('click', () => {
          const idx = Number(r.dataset && r.dataset.i);
          const ev = this.events[idx];
          if (!ev) return;
          if (typeof this.cb.onJump === 'function') {
            this.cb.onJump(Number(ev.t_sec) || 0, ev.channel || null);
          }
        });
      }
    }
  }
}

export const EEG_SL_CSS = `
.eeg-sl { background:#0d1b2a; color:#e6e6e6; border:1px solid #1e293b; border-radius:8px; padding:12px; width:min(360px, 92vw); font-family:Inter,system-ui,sans-serif; max-height:70vh; display:flex; flex-direction:column; }
.eeg-sl__head { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; }
.eeg-sl__title { font-weight:600; color:#e2e8f0; font-size:14px; }
.eeg-sl__count { background:#1e293b; color:#94a3b8; padding:2px 6px; border-radius:99px; font-size:11px; margin-left:6px; }
.eeg-sl__close { background:transparent; color:#94a3b8; border:none; font-size:18px; line-height:1; cursor:pointer; }
.eeg-sl__close:hover { color:#e2e8f0; }
.eeg-sl__rows { flex:1 1 auto; overflow-y:auto; display:flex; flex-direction:column; gap:4px; }
.eeg-sl__row { display:grid; grid-template-columns:60px 60px 1fr 60px; gap:6px; align-items:center; background:#0f172a; border:1px solid #1e293b; border-radius:6px; padding:6px 8px; cursor:pointer; color:#e2e8f0; font-size:12px; text-align:left; }
.eeg-sl__row:hover { border-color:#38bdf8; }
.eeg-sl__row:focus { outline:2px solid #38bdf8; }
.eeg-sl__t { color:#38bdf8; font-weight:600; }
.eeg-sl__ch { color:#e2e8f0; }
.eeg-sl__cls { color:#94a3b8; font-size:11px; }
.eeg-sl__peak { color:#94a3b8; text-align:right; }
.eeg-sl__conf { grid-column:1/-1; margin-top:4px; height:3px; background:#1e293b; border-radius:2px; overflow:hidden; }
.eeg-sl__conf-fill { height:100%; background:#38bdf8; }
.eeg-sl__empty { color:#64748b; padding:24px 14px; text-align:center; font-size:12px; }
.eeg-sl__empty--clinical { color:#94a3b8; }
.eeg-sl__empty-sub { color:#475569; font-style:italic; }
.eeg-sl__foot { color:#475569; font-size:11px; padding-top:6px; border-top:1px solid #1e293b; margin-top:6px; }
`;
