// ─────────────────────────────────────────────────────────────────────────────
// eeg-auto-scan-modal.js  —  Phase 4
//
// EEGAutoScanModal: a vanilla-JS modal that surfaces the proposal returned
// by POST /auto-scan. Two-column layout (Bad Channels | Bad Segments) with
// an accept-by-default checkbox per row. Footer "Apply N changes" calls the
// onCommit({accepted_items, rejected_items}) callback so the page can post
// the decision and refresh state.
//
// API:
//   const modal = new EEGAutoScanModal(containerEl, {
//     onCommit: ({accepted_items, rejected_items}) => {},
//     onCancel: () => {},
//   });
//   modal.show(scanResult, runId);
//   modal.hide();
// ─────────────────────────────────────────────────────────────────────────────

function _esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function _fmtMetric(reason, metric) {
  if (!metric || typeof metric !== 'object') return '';
  if (reason === 'flatline')      return `${metric.flat_sec}s flat`;
  if (reason === 'high_kurtosis') return `kurt ${metric.kurtosis}`;
  if (reason === 'line_noise')    return `${metric.line_hz}Hz · ratio ${metric.ratio}`;
  if (reason === 'amp_threshold') return `peak ${metric.peak_uv}µV`;
  if (reason === 'gradient')      return `${metric.peak_uv_per_ms}µV/ms`;
  return Object.keys(metric).map((k) => `${k}=${metric[k]}`).join(' · ');
}

function _confBar(conf) {
  const c = Math.max(0, Math.min(1, Number(conf) || 0));
  const pct = (c * 100).toFixed(0);
  return ''
    + `<div class="eeg-asm__conf" title="Confidence ${pct}%" aria-label="Confidence ${pct}%">`
    + `  <div class="eeg-asm__conf-fill" style="width:${pct}%;"></div>`
    + '</div>';
}

export class EEGAutoScanModal {
  constructor(containerEl, cb) {
    this.container = containerEl;
    this.cb = cb || {};
    this.scanResult = null;
    this.runId = null;
    this.channelStates = []; // { item, accepted: bool }
    this.segmentStates = [];
    this._visible = false;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  show(scanResult, runId) {
    this.scanResult = scanResult || { bad_channels: [], bad_segments: [], summary: {} };
    this.runId = runId || null;
    const chs = Array.isArray(this.scanResult.bad_channels) ? this.scanResult.bad_channels : [];
    const segs = Array.isArray(this.scanResult.bad_segments) ? this.scanResult.bad_segments : [];
    this.channelStates = chs.map((c) => ({ item: c, accepted: true }));
    this.segmentStates = segs.map((s) => ({ item: s, accepted: true }));
    this._visible = true;
    this.render();
  }

  hide() {
    this._visible = false;
    if (this.container) this.container.innerHTML = '';
  }

  /** Snapshot the current accepted / rejected partition. Used by tests + onCommit. */
  collectDecision() {
    const accepted_items = {
      bad_channels: this.channelStates.filter((s) => s.accepted).map((s) => s.item),
      bad_segments: this.segmentStates.filter((s) => s.accepted).map((s) => s.item),
    };
    const rejected_items = {
      bad_channels: this.channelStates.filter((s) => !s.accepted).map((s) => s.item),
      bad_segments: this.segmentStates.filter((s) => !s.accepted).map((s) => s.item),
    };
    return { accepted_items, rejected_items };
  }

  // ── Render ────────────────────────────────────────────────────────────────

  render() {
    if (!this.container) return;
    if (!this._visible) { this.container.innerHTML = ''; return; }
    const total = this.channelStates.length + this.segmentStates.length;
    const accepted = this.channelStates.filter((s) => s.accepted).length
      + this.segmentStates.filter((s) => s.accepted).length;
    const summary = (this.scanResult && this.scanResult.summary) || {};
    const html = ''
      + '<div class="eeg-asm__overlay" id="eeg-asm-overlay">'
      + '  <div class="eeg-asm" role="dialog" aria-modal="true" aria-label="Auto-scan results">'
      + '    <div class="eeg-asm__head">'
      + '      <div>'
      + '        <div class="eeg-asm__title">Auto-Scan Results</div>'
      + `        <div class="eeg-asm__sub">${_esc(summary.n_bad_channels || 0)} bad channels · ${_esc(summary.n_bad_segments || 0)} bad segments · ${_esc((Number(summary.total_excluded_sec) || 0).toFixed(1))}s flagged</div>`
      + '      </div>'
      + '      <button type="button" class="eeg-asm__close" id="eeg-asm-close" aria-label="Close">×</button>'
      + '    </div>'
      + '    <div class="eeg-asm__body">'
      + '      <div class="eeg-asm__col">'
      + `        <div class="eeg-asm__col-head">Bad Channels (${this.channelStates.length})</div>`
      + `        <div class="eeg-asm__rows" id="eeg-asm-channels">${this._channelRows() || '<div class="eeg-asm__empty">None detected</div>'}</div>`
      + '      </div>'
      + '      <div class="eeg-asm__col">'
      + `        <div class="eeg-asm__col-head">Bad Segments (${this.segmentStates.length})</div>`
      + `        <div class="eeg-asm__rows" id="eeg-asm-segments">${this._segmentRows() || '<div class="eeg-asm__empty">None detected</div>'}</div>`
      + '      </div>'
      + '    </div>'
      + '    <div class="eeg-asm__foot">'
      + '      <span class="eeg-asm__safety">Decision-support only. Clinician review required before any cleaning is applied.</span>'
      + '      <div class="eeg-asm__foot-actions">'
      + '        <button type="button" class="eeg-asm__btn" id="eeg-asm-cancel">Cancel</button>'
      + `        <button type="button" class="eeg-asm__btn eeg-asm__btn--primary" id="eeg-asm-apply">Apply ${accepted} of ${total} changes</button>`
      + '      </div>'
      + '    </div>'
      + '  </div>'
      + '</div>';
    this.container.innerHTML = html;
    this._wire();
  }

  _channelRows() {
    return this.channelStates.map((s, i) => {
      const it = s.item || {};
      return ''
        + `<label class="eeg-asm__row" data-kind="channel" data-i="${i}">`
        + `  <input type="checkbox" class="eeg-asm__cb" data-kind="channel" data-i="${i}" ${s.accepted ? 'checked' : ''} />`
        + '  <div class="eeg-asm__row-body">'
        + `    <div class="eeg-asm__row-head"><span class="eeg-asm__chip eeg-asm__chip--${_esc(it.reason || 'other')}">${_esc(it.reason || 'other')}</span><span class="eeg-asm__name">${_esc(it.channel || '?')}</span></div>`
        + `    <div class="eeg-asm__row-meta">${_esc(_fmtMetric(it.reason, it.metric))}</div>`
        + `    ${_confBar(it.confidence)}`
        + '  </div>'
        + '</label>';
    }).join('');
  }

  _segmentRows() {
    return this.segmentStates.map((s, i) => {
      const it = s.item || {};
      return ''
        + `<label class="eeg-asm__row" data-kind="segment" data-i="${i}">`
        + `  <input type="checkbox" class="eeg-asm__cb" data-kind="segment" data-i="${i}" ${s.accepted ? 'checked' : ''} />`
        + '  <div class="eeg-asm__row-body">'
        + `    <div class="eeg-asm__row-head"><span class="eeg-asm__chip eeg-asm__chip--${_esc(it.reason || 'other')}">${_esc(it.reason || 'other')}</span><span class="eeg-asm__name">${_esc((Number(it.start_sec) || 0).toFixed(1))}s – ${_esc((Number(it.end_sec) || 0).toFixed(1))}s</span></div>`
        + `    <div class="eeg-asm__row-meta">${_esc(_fmtMetric(it.reason, it.metric))}</div>`
        + `    ${_confBar(it.confidence)}`
        + '  </div>'
        + '</label>';
    }).join('');
  }

  _wire() {
    const close = this.container.querySelector('#eeg-asm-close');
    const cancel = this.container.querySelector('#eeg-asm-cancel');
    const apply = this.container.querySelector('#eeg-asm-apply');
    const onCancel = () => {
      if (typeof this.cb.onCancel === 'function') this.cb.onCancel();
      this.hide();
    };
    if (close && close.addEventListener) close.addEventListener('click', onCancel);
    if (cancel && cancel.addEventListener) cancel.addEventListener('click', onCancel);
    if (apply && apply.addEventListener) apply.addEventListener('click', () => {
      const decision = this.collectDecision();
      if (typeof this.cb.onCommit === 'function') {
        this.cb.onCommit({ ...decision, run_id: this.runId });
      }
      this.hide();
    });
    const cbs = this.container.querySelectorAll && this.container.querySelectorAll('.eeg-asm__cb');
    if (cbs && cbs.length != null) {
      for (let i = 0; i < cbs.length; i += 1) {
        const el = cbs[i];
        if (!el || !el.addEventListener) continue;
        el.addEventListener('change', (ev) => {
          const target = ev && ev.target ? ev.target : el;
          const kind = target.dataset && target.dataset.kind;
          const idx = Number(target.dataset && target.dataset.i);
          const checked = !!target.checked;
          if (kind === 'channel' && this.channelStates[idx]) {
            this.channelStates[idx].accepted = checked;
          } else if (kind === 'segment' && this.segmentStates[idx]) {
            this.segmentStates[idx].accepted = checked;
          }
          // Re-render so the apply-button count updates.
          this.render();
        });
      }
    }
  }
}

export const EEG_ASM_CSS = `
.eeg-asm__overlay { position:fixed; inset:0; background:rgba(2,6,23,0.7); display:flex; align-items:center; justify-content:center; z-index:1000; }
.eeg-asm { background:#0d1b2a; color:#e6e6e6; border:1px solid #1e293b; border-radius:10px; width:min(900px, 92vw); max-height:88vh; display:flex; flex-direction:column; font-family:Inter,system-ui,sans-serif; }
.eeg-asm__head { display:flex; align-items:flex-start; justify-content:space-between; padding:16px 18px; border-bottom:1px solid #1e293b; }
.eeg-asm__title { font-weight:600; font-size:16px; color:#e2e8f0; }
.eeg-asm__sub { color:#94a3b8; font-size:12px; margin-top:2px; }
.eeg-asm__close { background:transparent; color:#94a3b8; border:none; font-size:22px; cursor:pointer; line-height:1; }
.eeg-asm__close:hover { color:#e2e8f0; }
.eeg-asm__body { display:grid; grid-template-columns:1fr 1fr; gap:1px; background:#1e293b; flex:1 1 auto; overflow:hidden; }
.eeg-asm__col { background:#0d1b2a; padding:12px 14px; overflow-y:auto; max-height:60vh; }
.eeg-asm__col-head { font-weight:600; color:#e2e8f0; font-size:13px; margin-bottom:8px; padding-bottom:6px; border-bottom:1px solid #1e293b; }
.eeg-asm__rows { display:flex; flex-direction:column; gap:6px; }
.eeg-asm__row { display:flex; gap:10px; padding:8px; background:#0f172a; border:1px solid #1e293b; border-radius:6px; cursor:pointer; align-items:flex-start; }
.eeg-asm__row:hover { border-color:#334155; }
.eeg-asm__cb { margin-top:2px; accent-color:#38bdf8; }
.eeg-asm__row-body { flex:1; min-width:0; }
.eeg-asm__row-head { display:flex; gap:6px; align-items:center; }
.eeg-asm__name { color:#e2e8f0; font-weight:500; font-size:13px; }
.eeg-asm__chip { display:inline-block; padding:2px 6px; font-size:10px; border-radius:3px; background:#1e293b; color:#94a3b8; text-transform:uppercase; letter-spacing:0.04em; }
.eeg-asm__chip--flatline { background:#7f1d1d; color:#fee2e2; }
.eeg-asm__chip--amp_threshold { background:#92400e; color:#fef3c7; }
.eeg-asm__chip--gradient { background:#9a3412; color:#ffedd5; }
.eeg-asm__chip--high_kurtosis { background:#581c87; color:#f3e8ff; }
.eeg-asm__chip--line_noise { background:#312e81; color:#e0e7ff; }
.eeg-asm__row-meta { color:#94a3b8; font-size:11px; margin-top:2px; }
.eeg-asm__conf { margin-top:6px; height:3px; background:#1e293b; border-radius:2px; overflow:hidden; }
.eeg-asm__conf-fill { height:100%; background:#38bdf8; }
.eeg-asm__empty { color:#64748b; padding:14px; text-align:center; }
.eeg-asm__foot { padding:14px 18px; border-top:1px solid #1e293b; display:flex; justify-content:space-between; align-items:center; }
.eeg-asm__safety { color:#94a3b8; font-size:11px; font-style:italic; max-width:55%; }
.eeg-asm__foot-actions { display:flex; gap:8px; }
.eeg-asm__btn { background:#1e293b; color:#e2e8f0; border:1px solid #334155; padding:8px 16px; border-radius:6px; font-size:13px; cursor:pointer; }
.eeg-asm__btn--primary { background:#2563eb; border-color:#2563eb; color:#fff; }
.eeg-asm__btn:hover { filter:brightness(1.15); }
`;
