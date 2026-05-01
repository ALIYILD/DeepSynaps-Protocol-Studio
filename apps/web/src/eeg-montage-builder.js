// ─────────────────────────────────────────────────────────────────────────────
// eeg-montage-builder.js  —  Phase 3
//
// EEGCustomMontageBuilder: a vanilla-JS UI control that lets a clinician
// assemble a custom bipolar montage by pairing electrodes (anode → cathode).
// No framework, no build step — matches the rest of the codebase's style.
//
// API:
//   const b = new EEGCustomMontageBuilder(channelNames);
//   b.render(containerEl);
//   b.serialize();             // → { name, pairs: [{anode, cathode}, …] }
//   b.loadPreset(montageJson); // hydrate from a previously serialized blob
// ─────────────────────────────────────────────────────────────────────────────

const _MONTAGE_NAME_MAX = 60;

function _esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

export class EEGCustomMontageBuilder {
  /**
   * @param {string[]} channelNames  Available electrode names (e.g. ['Fp1', 'Fp2', ...]).
   */
  constructor(channelNames) {
    this.channels = Array.isArray(channelNames) ? channelNames.slice() : [];
    this.pairs = [];          // { anode, cathode }
    this.name = 'Custom montage';
    this._container = null;
    this._onChange = null;    // optional external listener
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Render the editor into a container. Replaces existing children. */
  render(containerEl) {
    if (!containerEl) return;
    this._container = containerEl;
    containerEl.innerHTML = this._html();
    this._wire();
  }

  /** Return a serializable description of the montage. */
  serialize() {
    return {
      name: String(this.name || 'Custom montage').slice(0, _MONTAGE_NAME_MAX),
      pairs: this.pairs
        .filter((p) => p && p.anode && p.cathode && p.anode !== p.cathode)
        .map((p) => ({ anode: String(p.anode), cathode: String(p.cathode) })),
    };
  }

  /** Hydrate from a previously serialized payload. */
  loadPreset(montageJson) {
    if (!montageJson || typeof montageJson !== 'object') return;
    this.name = String(montageJson.name || this.name).slice(0, _MONTAGE_NAME_MAX);
    const incoming = Array.isArray(montageJson.pairs) ? montageJson.pairs : [];
    this.pairs = incoming
      .filter((p) => p && p.anode && p.cathode && p.anode !== p.cathode)
      .map((p) => ({ anode: String(p.anode), cathode: String(p.cathode) }));
    if (this._container) this.render(this._container);
  }

  /** Add a pair programmatically. Rejects self-pairs. Returns true if added. */
  addPair(anode, cathode) {
    if (!anode || !cathode || String(anode) === String(cathode)) return false;
    this.pairs.push({ anode: String(anode), cathode: String(cathode) });
    if (this._container) this.render(this._container);
    if (typeof this._onChange === 'function') this._onChange(this.serialize());
    return true;
  }

  removePair(idx) {
    if (idx < 0 || idx >= this.pairs.length) return;
    this.pairs.splice(idx, 1);
    if (this._container) this.render(this._container);
    if (typeof this._onChange === 'function') this._onChange(this.serialize());
  }

  setName(name) {
    this.name = String(name || '').slice(0, _MONTAGE_NAME_MAX) || 'Custom montage';
    if (this._container) this.render(this._container);
  }

  /** Subscribe to change notifications. */
  onChange(fn) { this._onChange = typeof fn === 'function' ? fn : null; }

  // ── Internals ──────────────────────────────────────────────────────────────

  _html() {
    const ch = this.channels;
    const opts = (selected) => {
      let s = '<option value="">—</option>';
      for (let i = 0; i < ch.length; i++) {
        const v = ch[i];
        s += '<option value="' + _esc(v) + '"' + (selected === v ? ' selected' : '') + '>' + _esc(v) + '</option>';
      }
      return s;
    };

    let rowsHtml = '';
    for (let i = 0; i < this.pairs.length; i++) {
      const p = this.pairs[i];
      rowsHtml += '<div class="emb-row" data-idx="' + i + '" draggable="true">'
        + '<span class="emb-row__handle" title="Drag to reorder">&#x2630;</span>'
        + '<select class="emb-row__sel emb-row__anode" data-role="anode" data-idx="' + i + '" aria-label="Anode for pair ' + (i + 1) + '">' + opts(p.anode) + '</select>'
        + '<span class="emb-row__arrow">&minus;</span>'
        + '<select class="emb-row__sel emb-row__cathode" data-role="cathode" data-idx="' + i + '" aria-label="Cathode for pair ' + (i + 1) + '">' + opts(p.cathode) + '</select>'
        + '<button type="button" class="emb-row__rm" data-action="remove" data-idx="' + i + '" aria-label="Remove pair">&times;</button>'
        + '</div>';
    }
    if (!rowsHtml) {
      rowsHtml = '<div class="emb-empty">No pairs yet — click "Add pair" below.</div>';
    }

    return '<div class="emb-builder">'
      + '<div class="emb-header">'
      +   '<label class="emb-name-label" for="emb-name-input">Montage name</label>'
      +   '<input id="emb-name-input" type="text" class="emb-name-input" maxlength="' + _MONTAGE_NAME_MAX + '" value="' + _esc(this.name) + '" />'
      + '</div>'
      + '<div class="emb-rows" data-role="rows">' + rowsHtml + '</div>'
      + '<div class="emb-actions">'
      +   '<button type="button" class="emb-add" data-action="add">+ Add pair</button>'
      +   '<span class="emb-count">' + this.pairs.length + ' pair' + (this.pairs.length === 1 ? '' : 's') + '</span>'
      + '</div>'
      + '</div>';
  }

  _wire() {
    const root = this._container;
    if (!root) return;

    const nameInput = root.querySelector('#emb-name-input');
    if (nameInput) {
      nameInput.addEventListener('input', () => {
        this.name = String(nameInput.value || '').slice(0, _MONTAGE_NAME_MAX) || 'Custom montage';
        if (typeof this._onChange === 'function') this._onChange(this.serialize());
      });
    }

    // Per-row select changes — preserve focus & avoid re-render churn.
    root.addEventListener('change', (ev) => {
      const t = ev.target;
      if (!t || !t.dataset) return;
      const role = t.dataset.role;
      const idx = parseInt(t.dataset.idx, 10);
      if (!role || isNaN(idx) || idx < 0 || idx >= this.pairs.length) return;
      const newVal = String(t.value || '');
      const other = role === 'anode' ? this.pairs[idx].cathode : this.pairs[idx].anode;
      if (newVal && other && newVal === other) {
        // Self-pair — reject and visually warn.
        t.value = role === 'anode' ? this.pairs[idx].anode : this.pairs[idx].cathode;
        if (t.classList) t.classList.add('emb-row__sel--err');
        if (typeof window !== 'undefined' && typeof window._showToast === 'function') {
          window._showToast('Anode and cathode must differ.', 'warning');
        }
        setTimeout(() => { if (t.classList) t.classList.remove('emb-row__sel--err'); }, 800);
        return;
      }
      if (role === 'anode') this.pairs[idx].anode = newVal;
      else this.pairs[idx].cathode = newVal;
      if (typeof this._onChange === 'function') this._onChange(this.serialize());
    });

    root.addEventListener('click', (ev) => {
      const t = ev.target;
      if (!t || !t.dataset) return;
      const action = t.dataset.action;
      if (action === 'add') {
        this.pairs.push({ anode: '', cathode: '' });
        this.render(root);
        if (typeof this._onChange === 'function') this._onChange(this.serialize());
      } else if (action === 'remove') {
        const idx = parseInt(t.dataset.idx, 10);
        if (!isNaN(idx)) this.removePair(idx);
      }
    });

    // Lightweight drag-to-reorder.
    let dragIdx = -1;
    root.addEventListener('dragstart', (ev) => {
      const row = ev.target && ev.target.closest && ev.target.closest('.emb-row');
      if (!row) return;
      dragIdx = parseInt(row.dataset.idx, 10);
      if (ev.dataTransfer) ev.dataTransfer.effectAllowed = 'move';
    });
    root.addEventListener('dragover', (ev) => {
      ev.preventDefault && ev.preventDefault();
      if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move';
    });
    root.addEventListener('drop', (ev) => {
      ev.preventDefault && ev.preventDefault();
      const row = ev.target && ev.target.closest && ev.target.closest('.emb-row');
      if (!row || dragIdx < 0) { dragIdx = -1; return; }
      const targetIdx = parseInt(row.dataset.idx, 10);
      if (isNaN(targetIdx) || targetIdx === dragIdx) { dragIdx = -1; return; }
      const moved = this.pairs.splice(dragIdx, 1)[0];
      this.pairs.splice(targetIdx, 0, moved);
      dragIdx = -1;
      this.render(root);
      if (typeof this._onChange === 'function') this._onChange(this.serialize());
    });
  }
}

// ── CSS (injected on first render call from a host page) ────────────────────

export const EEG_MONTAGE_BUILDER_CSS = `
.emb-builder { display:flex; flex-direction:column; gap:10px; padding:12px; }
.emb-header { display:flex; flex-direction:column; gap:4px; }
.emb-name-label { font-size:11px; font-weight:600; color:#94a3b8; text-transform:uppercase; letter-spacing:.05em; }
.emb-name-input { padding:6px 8px; border-radius:6px; border:1px solid rgba(255,255,255,0.1); background:rgba(0,0,0,0.3); color:#e2e8f0; font-size:13px; }
.emb-rows { display:flex; flex-direction:column; gap:6px; max-height:280px; overflow-y:auto; }
.emb-row { display:flex; align-items:center; gap:6px; padding:4px; background:rgba(255,255,255,0.02); border-radius:6px; }
.emb-row__handle { color:#475569; cursor:grab; font-size:12px; padding:0 4px; }
.emb-row__sel { padding:4px 6px; border-radius:5px; background:rgba(0,0,0,0.3); color:#e2e8f0; border:1px solid rgba(255,255,255,0.08); flex:1; font-size:12px; }
.emb-row__sel--err { border-color:#ef4444; }
.emb-row__arrow { color:#64748b; font-weight:700; }
.emb-row__rm { background:transparent; border:1px solid rgba(239,68,68,0.3); color:#ef4444; border-radius:4px; cursor:pointer; padding:2px 8px; font-size:14px; line-height:1; }
.emb-row__rm:hover { background:rgba(239,68,68,0.1); }
.emb-actions { display:flex; align-items:center; justify-content:space-between; padding-top:6px; border-top:1px dashed rgba(255,255,255,0.06); }
.emb-add { padding:6px 12px; border-radius:6px; border:1px dashed rgba(0,212,188,0.4); background:rgba(0,212,188,0.08); color:#00d4bc; font-size:12px; cursor:pointer; }
.emb-add:hover { background:rgba(0,212,188,0.15); }
.emb-count { font-size:11px; color:#94a3b8; }
.emb-empty { padding:14px; text-align:center; color:#64748b; font-size:12px; font-style:italic; border:1px dashed rgba(255,255,255,0.06); border-radius:6px; }
`;

export default EEGCustomMontageBuilder;
