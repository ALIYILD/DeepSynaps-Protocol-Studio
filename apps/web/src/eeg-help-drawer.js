// ─────────────────────────────────────────────────────────────────────────────
// eeg-help-drawer.js — Phase 7
//
// Right-side slide-in help drawer for the Raw Data workstation. The drawer
// renders a single topic from `raw-help-content.js` at a time, exposes
// open(topicKey) / close(), and supports Esc-to-close.
//
// Usage:
//
//   import { EEGHelpDrawer, EEG_HELP_DRAWER_CSS } from './eeg-help-drawer.js';
//   const drawer = new EEGHelpDrawer(rootEl);
//   drawer.open('montage');
//
// All copy lives in `raw-help-content.js`. This file owns layout + behaviour
// only — no clinical prose.
// ─────────────────────────────────────────────────────────────────────────────

import { RAW_HELP_TOPICS } from './raw-help-content.js';

export class EEGHelpDrawer {
  /**
   * @param {HTMLElement} containerEl - element to mount the drawer into.
   * @param {object} [opts]
   * @param {() => void} [opts.onClose] - fired after the drawer hides.
   */
  constructor(containerEl, opts) {
    this.container = containerEl;
    this.opts = opts || {};
    this.visible = false;
    this.topicKey = null;
    this._onKeyDown = this._onKeyDown.bind(this);
    if (this.container) {
      this.container.innerHTML = this._frameHTML();
      this._wire();
    }
  }

  /**
   * Open the drawer to a specific topic key. Unknown keys render an empty
   * "Topic not found" body but never throw — keeps the toolbar wiring forgiving.
   */
  open(topicKey) {
    this.topicKey = topicKey;
    var topic = RAW_HELP_TOPICS[topicKey] || null;
    var titleEl = this._q('.eeg-hd__title');
    var bodyEl = this._q('.eeg-hd__body');
    if (titleEl) titleEl.textContent = topic ? topic.title : 'Help';
    if (bodyEl) {
      bodyEl.innerHTML = topic
        ? topic.body
        : '<p class="eeg-hd__missing">Help topic not found.</p>';
    }
    var root = this._q('.eeg-hd');
    if (root && root.classList) root.classList.add('eeg-hd--open');
    if (typeof document !== 'undefined' && document.addEventListener) {
      document.addEventListener('keydown', this._onKeyDown);
    }
    this.visible = true;
  }

  close() {
    var root = this._q('.eeg-hd');
    if (root && root.classList) root.classList.remove('eeg-hd--open');
    if (typeof document !== 'undefined' && document.removeEventListener) {
      document.removeEventListener('keydown', this._onKeyDown);
    }
    this.visible = false;
    if (typeof this.opts.onClose === 'function') this.opts.onClose();
  }

  _frameHTML() {
    return (
      '<aside class="eeg-hd" role="complementary" aria-label="Contextual help">' +
        '<div class="eeg-hd__header">' +
          '<span class="eeg-hd__title">Help</span>' +
          '<button class="eeg-hd__close" type="button" aria-label="Close help">×</button>' +
        '</div>' +
        '<div class="eeg-hd__body"></div>' +
      '</aside>'
    );
  }

  _wire() {
    var btn = this._q('.eeg-hd__close');
    if (btn && btn.addEventListener) {
      btn.addEventListener('click', () => this.close());
    }
  }

  _onKeyDown(e) {
    if (!this.visible) return;
    if (e && (e.key === 'Escape' || e.key === 'Esc')) {
      if (typeof e.preventDefault === 'function') e.preventDefault();
      this.close();
    }
  }

  _q(sel) {
    if (!this.container || typeof this.container.querySelector !== 'function') return null;
    return this.container.querySelector(sel);
  }
}

export const EEG_HELP_DRAWER_CSS = [
  '.eeg-hd { position:fixed; top:0; right:0; height:100%; width:380px; max-width:90vw; background:#0c1222; border-left:1px solid rgba(255,255,255,0.1); box-shadow:-12px 0 36px rgba(0,0,0,0.45); transform:translateX(100%); transition:transform .22s ease; z-index:1000; display:flex; flex-direction:column; }',
  '.eeg-hd--open { transform:translateX(0); }',
  '.eeg-hd__header { display:flex; align-items:center; justify-content:space-between; padding:14px 18px; border-bottom:1px solid rgba(255,255,255,0.08); }',
  '.eeg-hd__title { font-size:14px; font-weight:700; color:#f1f5f9; }',
  '.eeg-hd__close { background:none; border:none; color:#94a3b8; font-size:22px; line-height:1; cursor:pointer; padding:2px 8px; border-radius:4px; }',
  '.eeg-hd__close:hover { color:#ef5350; background:rgba(255,255,255,0.05); }',
  '.eeg-hd__body { padding:14px 18px 22px; overflow-y:auto; flex:1; font-size:13px; line-height:1.55; color:#cbd5e1; }',
  '.eeg-hd__body p { margin:0 0 12px; }',
  '.eeg-hd__body strong { color:#f1f5f9; }',
  '.eeg-hd__missing { color:#94a3b8; font-style:italic; }',
  // Small `?` icon button used next to toolbar/sidebar headers.
  '.eeg-help-icon { display:inline-flex; align-items:center; justify-content:center; width:16px; height:16px; margin-left:6px; padding:0; border:1px solid rgba(255,255,255,0.18); border-radius:50%; background:transparent; color:#94a3b8; font-size:10px; line-height:1; font-weight:700; cursor:pointer; vertical-align:middle; }',
  '.eeg-help-icon:hover { color:#22d3ee; border-color:#22d3ee; }',
].join('\n');
