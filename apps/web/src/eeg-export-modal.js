// ─────────────────────────────────────────────────────────────────────────────
// eeg-export-modal.js  —  Phase 6
//
// EEGExportModal: a small vanilla-JS modal that surfaces the Phase 6
// clinician deliverables — cleaned-signal export (EDF / EDF+ / BDF / FIF)
// and the Cleaning Report PDF.
//
// API:
//   const modal = new EEGExportModal(containerEl, {
//     onDownloadCleaned: ({ format, interpolate_bad_channels }) => {},
//     onDownloadReport:  () => {},
//     onCancel:          () => {},
//   });
//   modal.show();
//   modal.hide();
//
// The page is responsible for the network call and the file save; this
// module only collects the user's choices and emits structured callbacks.
// ─────────────────────────────────────────────────────────────────────────────

function _esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

const _FORMATS = [
  { key: 'edf',      label: 'EDF',  desc: 'European Data Format (16-bit)' },
  { key: 'edf_plus', label: 'EDF+', desc: 'EDF with annotations' },
  { key: 'bdf',      label: 'BDF',  desc: 'BioSemi 24-bit' },
  { key: 'fif',      label: 'FIF',  desc: 'MNE-Python native' },
];

export class EEGExportModal {
  constructor(containerEl, cb) {
    this.container = containerEl;
    this.cb = cb || {};
    this.format = 'edf';
    this.interpolateBadChannels = true;
    this._visible = false;
  }

  show() {
    this._visible = true;
    this.render();
  }

  hide() {
    this._visible = false;
    if (this.container) this.container.innerHTML = '';
  }

  /** Snapshot the current selection — exposed for unit tests. */
  collect() {
    return {
      format: this.format,
      interpolate_bad_channels: !!this.interpolateBadChannels,
    };
  }

  render() {
    if (!this.container) return;
    if (!this._visible) { this.container.innerHTML = ''; return; }

    const fmtRows = _FORMATS.map((f) => ''
      + `<label class="eeg-exp__opt" data-fmt="${_esc(f.key)}">`
      + `  <input type="radio" name="eeg-exp-format" class="eeg-exp__radio" data-kind="format" data-key="${_esc(f.key)}" ${this.format === f.key ? 'checked' : ''} />`
      + `  <span class="eeg-exp__opt-body">`
      + `    <span class="eeg-exp__opt-label">${_esc(f.label)}</span>`
      + `    <span class="eeg-exp__opt-desc">${_esc(f.desc)}</span>`
      + `  </span>`
      + '</label>'
    ).join('');

    const badChannelsRows = ''
      + '<label class="eeg-exp__opt" data-bad="interpolate">'
      + `  <input type="radio" name="eeg-exp-bad" class="eeg-exp__radio" data-kind="bad" data-key="interpolate" ${this.interpolateBadChannels ? 'checked' : ''} />`
      + '  <span class="eeg-exp__opt-body">'
      + '    <span class="eeg-exp__opt-label">Interpolate</span>'
      + '    <span class="eeg-exp__opt-desc">Reconstruct flagged channels from neighbours (requires sensor positions).</span>'
      + '  </span>'
      + '</label>'
      + '<label class="eeg-exp__opt" data-bad="exclude">'
      + `  <input type="radio" name="eeg-exp-bad" class="eeg-exp__radio" data-kind="bad" data-key="exclude" ${!this.interpolateBadChannels ? 'checked' : ''} />`
      + '  <span class="eeg-exp__opt-body">'
      + '    <span class="eeg-exp__opt-label">Exclude</span>'
      + '    <span class="eeg-exp__opt-desc">Drop flagged channels from the exported file.</span>'
      + '  </span>'
      + '</label>';

    const html = ''
      + '<div class="eeg-exp__overlay" id="eeg-exp-overlay">'
      + '  <div class="eeg-exp" role="dialog" aria-modal="true" aria-label="Export cleaned signal">'
      + '    <div class="eeg-exp__head">'
      + '      <div>'
      + '        <div class="eeg-exp__title">Export &amp; Reports</div>'
      + '        <div class="eeg-exp__sub">Cleaned signal in standard formats, or the signed Cleaning Report PDF.</div>'
      + '      </div>'
      + '      <button type="button" class="eeg-exp__close" id="eeg-exp-close" aria-label="Close">×</button>'
      + '    </div>'
      + '    <div class="eeg-exp__body">'
      + '      <div class="eeg-exp__group">'
      + '        <div class="eeg-exp__group-head">Format</div>'
      + `        <div class="eeg-exp__opts" id="eeg-exp-formats">${fmtRows}</div>`
      + '      </div>'
      + '      <div class="eeg-exp__group">'
      + '        <div class="eeg-exp__group-head">Bad channels</div>'
      + `        <div class="eeg-exp__opts" id="eeg-exp-bads">${badChannelsRows}</div>`
      + '      </div>'
      + '    </div>'
      + '    <div class="eeg-exp__foot">'
      + '      <span class="eeg-exp__safety">Decision-support only. Cleaned exports inherit your saved cleaning configuration.</span>'
      + '      <div class="eeg-exp__foot-actions">'
      + '        <button type="button" class="eeg-exp__btn" id="eeg-exp-cancel">Cancel</button>'
      + '        <button type="button" class="eeg-exp__btn" id="eeg-exp-report">Generate Cleaning Report PDF</button>'
      + '        <button type="button" class="eeg-exp__btn eeg-exp__btn--primary" id="eeg-exp-download">Download Cleaned Signal</button>'
      + '      </div>'
      + '    </div>'
      + '  </div>'
      + '</div>';
    this.container.innerHTML = html;
    this._wire();
  }

  _wire() {
    const close = this.container.querySelector('#eeg-exp-close');
    const cancel = this.container.querySelector('#eeg-exp-cancel');
    const dl = this.container.querySelector('#eeg-exp-download');
    const rep = this.container.querySelector('#eeg-exp-report');

    const onCancel = () => {
      if (typeof this.cb.onCancel === 'function') this.cb.onCancel();
      this.hide();
    };
    if (close && close.addEventListener) close.addEventListener('click', onCancel);
    if (cancel && cancel.addEventListener) cancel.addEventListener('click', onCancel);

    if (dl && dl.addEventListener) dl.addEventListener('click', () => {
      if (typeof this.cb.onDownloadCleaned === 'function') {
        this.cb.onDownloadCleaned(this.collect());
      }
      // We do not auto-hide; the page closes the modal once the download succeeds.
    });
    if (rep && rep.addEventListener) rep.addEventListener('click', () => {
      if (typeof this.cb.onDownloadReport === 'function') {
        this.cb.onDownloadReport();
      }
    });

    const radios = this.container.querySelectorAll && this.container.querySelectorAll('.eeg-exp__radio');
    if (radios && radios.length != null) {
      for (let i = 0; i < radios.length; i += 1) {
        const el = radios[i];
        if (!el || !el.addEventListener) continue;
        el.addEventListener('change', (ev) => {
          const target = ev && ev.target ? ev.target : el;
          const kind = target.dataset && target.dataset.kind;
          const key = target.dataset && target.dataset.key;
          if (!target.checked) return;
          if (kind === 'format' && key) {
            this.format = key;
          } else if (kind === 'bad') {
            this.interpolateBadChannels = (key === 'interpolate');
          }
        });
      }
    }
  }
}

export const EEG_EXPORT_MODAL_CSS = `
.eeg-exp__overlay { position:fixed; inset:0; background:rgba(2,6,23,0.7); display:flex; align-items:center; justify-content:center; z-index:1000; }
.eeg-exp { background:#0d1b2a; color:#e6e6e6; border:1px solid #1e293b; border-radius:10px; width:min(560px, 92vw); max-height:88vh; display:flex; flex-direction:column; font-family:Inter,system-ui,sans-serif; }
.eeg-exp__head { display:flex; align-items:flex-start; justify-content:space-between; padding:16px 18px; border-bottom:1px solid #1e293b; }
.eeg-exp__title { font-weight:600; font-size:16px; color:#e2e8f0; }
.eeg-exp__sub { color:#94a3b8; font-size:12px; margin-top:2px; }
.eeg-exp__close { background:transparent; color:#94a3b8; border:none; font-size:22px; cursor:pointer; line-height:1; }
.eeg-exp__close:hover { color:#e2e8f0; }
.eeg-exp__body { display:flex; flex-direction:column; gap:14px; padding:14px 18px; overflow-y:auto; max-height:65vh; }
.eeg-exp__group-head { font-weight:600; color:#e2e8f0; font-size:13px; margin-bottom:6px; }
.eeg-exp__opts { display:flex; flex-direction:column; gap:6px; }
.eeg-exp__opt { display:flex; gap:10px; align-items:flex-start; padding:8px 10px; background:#0f172a; border:1px solid #1e293b; border-radius:6px; cursor:pointer; }
.eeg-exp__opt:hover { border-color:#334155; }
.eeg-exp__radio { margin-top:3px; accent-color:#38bdf8; }
.eeg-exp__opt-body { display:flex; flex-direction:column; gap:2px; min-width:0; }
.eeg-exp__opt-label { color:#e2e8f0; font-weight:500; font-size:13px; }
.eeg-exp__opt-desc { color:#94a3b8; font-size:11px; }
.eeg-exp__foot { padding:14px 18px; border-top:1px solid #1e293b; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; }
.eeg-exp__safety { color:#94a3b8; font-size:11px; font-style:italic; max-width:50%; }
.eeg-exp__foot-actions { display:flex; gap:8px; flex-wrap:wrap; }
.eeg-exp__btn { background:#1e293b; color:#e2e8f0; border:1px solid #334155; padding:8px 14px; border-radius:6px; font-size:13px; cursor:pointer; }
.eeg-exp__btn--primary { background:#2563eb; border-color:#2563eb; color:#fff; }
.eeg-exp__btn:hover { filter:brightness(1.15); }
`;

export default EEGExportModal;
