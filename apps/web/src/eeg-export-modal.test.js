// ─────────────────────────────────────────────────────────────────────────────
// eeg-export-modal.test.js — Phase 6
//
// Verifies the EEGExportModal:
//   * renders format radio (4 options) + bad-channel radio (2 options) +
//     two action buttons (Download Cleaned, Generate Report).
//   * Clicking Download Cleaned fires onDownloadCleaned with the selected
//     format and interpolate_bad_channels boolean.
//   * Clicking Generate Report fires onDownloadReport with no payload.
//   * Changing the format radio updates the selection passed to onDownloadCleaned.
//   * Choosing Exclude bad channels flips the interpolate_bad_channels flag.
//
// The fake DOM is a minimal stub; no jsdom dependency.
// ─────────────────────────────────────────────────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';

class FakeClassList {
  constructor() { this._set = new Set(); }
  add(...c) { for (const x of c) this._set.add(x); }
  remove(...c) { for (const x of c) this._set.delete(x); }
  contains(c) { return this._set.has(c); }
  toggle(c, force) {
    const want = force === undefined ? !this._set.has(c) : !!force;
    if (want) this._set.add(c); else this._set.delete(c);
    return want;
  }
}

class FakeElement {
  constructor(tag = 'div') {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.parentElement = null;
    this.style = {};
    this.classList = new FakeClassList();
    this.dataset = {};
    this._innerHTML = '';
    this._listeners = {};
    this.attributes = {};
    this.id = '';
    this._textContent = '';
    this.value = '';
    this.checked = false;
  }
  set innerHTML(v) {
    this._innerHTML = String(v);
    this.children = [];
    this._parsedNodes = _parseStubNodes(this._innerHTML);
  }
  get innerHTML() { return this._innerHTML; }
  set textContent(v) { this._textContent = String(v); }
  get textContent() { return this._textContent; }
  setAttribute(k, v) { this.attributes[k] = v; }
  getAttribute(k) { return this.attributes[k]; }
  appendChild(c) { this.children.push(c); c.parentElement = this; return c; }
  removeChild() {}
  remove() {}
  addEventListener(name, fn) { (this._listeners[name] ||= []).push(fn); }
  removeEventListener() {}
  dispatchEvent(ev) {
    const list = this._listeners[ev && ev.type] || [];
    for (const fn of list) fn(ev);
    return true;
  }
  click() { this.dispatchEvent({ type: 'click', target: this, preventDefault: () => {}, stopPropagation: () => {} }); }
  fireChange(checked) {
    this.checked = !!checked;
    this.dispatchEvent({ type: 'change', target: this });
  }
  querySelector(sel) {
    if (!this._parsedNodes) return null;
    return this._parsedNodes.find((n) => n.matches(sel)) || null;
  }
  querySelectorAll(sel) {
    if (!this._parsedNodes) return [];
    return this._parsedNodes.filter((n) => n.matches(sel));
  }
  closest() { return null; }
}

function _parseStubNodes(html) {
  const out = [];
  // Match self-closing or open tags (we only inspect attributes).
  const re = /<([a-zA-Z][a-zA-Z0-9]*)\s+([^>]*?)\/?>/g;
  let m;
  while ((m = re.exec(html))) {
    const tag = m[1];
    const attrs = m[2];
    const node = new FakeElement(tag);
    const idMatch = /id\s*=\s*"([^"]+)"/.exec(attrs);
    if (idMatch) node.id = idMatch[1];
    const classMatch = /class\s*=\s*"([^"]+)"/.exec(attrs);
    const classes = classMatch ? classMatch[1].split(/\s+/) : [];
    for (const c of classes) node.classList.add(c);
    const dataRe = /data-([a-zA-Z0-9_-]+)\s*=\s*"([^"]*)"/g;
    let dm;
    while ((dm = dataRe.exec(attrs))) {
      const key = dm[1].replace(/-([a-z])/g, (_, l) => l.toUpperCase());
      node.dataset[key] = dm[2];
    }
    if (/\schecked(?=\s|\/|>|$)/.test(attrs) || /\schecked=/.test(attrs)) node.checked = true;
    out.push(node);
  }
  for (const n of out) {
    n.matches = (sel) => {
      if (!sel) return false;
      if (sel.startsWith('#')) return n.id === sel.slice(1);
      if (sel.startsWith('.')) {
        const parts = sel.split('.').filter(Boolean);
        return parts.every((p) => n.classList.contains(p));
      }
      return String(n.tagName).toLowerCase() === sel.toLowerCase();
    };
  }
  return out;
}

function installDom() {
  const root = new FakeElement('div'); root.id = 'app';
  globalThis.document = {
    getElementById: () => null,
    body: root,
    head: new FakeElement('head'),
    createElement: (tag) => new FakeElement(tag),
    addEventListener: () => {},
  };
  globalThis.window = Object.assign(globalThis.window || {}, {
    addEventListener: () => {},
  });
  return root;
}

installDom();

const mod = await import('./eeg-export-modal.js');
const { EEGExportModal } = mod;

// ── Tests ────────────────────────────────────────────────────────────────────

test('show renders 4 format radios + 2 bad-channel radios + 2 action buttons', () => {
  const container = new FakeElement('div');
  const modal = new EEGExportModal(container, {});
  modal.show();
  const html = container.innerHTML;
  // Four format radios.
  const formatRadios = (html.match(/data-kind="format"/g) || []).length;
  assert.equal(formatRadios, 4);
  // Two bad-channel radios.
  const badRadios = (html.match(/data-kind="bad"/g) || []).length;
  assert.equal(badRadios, 2);
  // Both action buttons exist.
  assert.ok(container.querySelector('#eeg-exp-download'), 'Download button exists');
  assert.ok(container.querySelector('#eeg-exp-report'), 'Report button exists');
});

test('default selection is EDF + interpolate', () => {
  const container = new FakeElement('div');
  const modal = new EEGExportModal(container, {});
  modal.show();
  const out = modal.collect();
  assert.equal(out.format, 'edf');
  assert.equal(out.interpolate_bad_channels, true);
});

test('clicking Download Cleaned fires onDownloadCleaned with body', () => {
  const container = new FakeElement('div');
  let received = null;
  const modal = new EEGExportModal(container, {
    onDownloadCleaned: (body) => { received = body; },
  });
  modal.show();
  const dl = container.querySelector('#eeg-exp-download');
  assert.ok(dl, 'download button exists');
  dl.click();
  assert.ok(received, 'callback fired');
  assert.equal(received.format, 'edf');
  assert.equal(received.interpolate_bad_channels, true);
});

test('clicking Generate Report fires onDownloadReport (no payload)', () => {
  const container = new FakeElement('div');
  let fired = false;
  const modal = new EEGExportModal(container, {
    onDownloadReport: () => { fired = true; },
  });
  modal.show();
  const rep = container.querySelector('#eeg-exp-report');
  assert.ok(rep, 'report button exists');
  rep.click();
  assert.equal(fired, true);
});

test('changing format radio updates the dispatched payload', () => {
  const container = new FakeElement('div');
  let received = null;
  const modal = new EEGExportModal(container, {
    onDownloadCleaned: (b) => { received = b; },
  });
  modal.show();
  // Find the BDF radio (data-kind="format" data-key="bdf") and flip it.
  const radios = container.querySelectorAll('.eeg-exp__radio');
  const bdf = Array.from(radios).find((r) => r.dataset && r.dataset.kind === 'format' && r.dataset.key === 'bdf');
  assert.ok(bdf, 'bdf radio exists');
  bdf.fireChange(true);
  container.querySelector('#eeg-exp-download').click();
  assert.equal(received.format, 'bdf');
});

test('selecting Exclude bad channels flips interpolate_bad_channels to false', () => {
  const container = new FakeElement('div');
  let received = null;
  const modal = new EEGExportModal(container, {
    onDownloadCleaned: (b) => { received = b; },
  });
  modal.show();
  const radios = container.querySelectorAll('.eeg-exp__radio');
  const excl = Array.from(radios).find((r) => r.dataset && r.dataset.kind === 'bad' && r.dataset.key === 'exclude');
  assert.ok(excl, 'exclude radio exists');
  excl.fireChange(true);
  container.querySelector('#eeg-exp-download').click();
  assert.equal(received.interpolate_bad_channels, false);
});

test('cancel button fires onCancel and hides the modal', () => {
  const container = new FakeElement('div');
  let cancelled = false;
  const modal = new EEGExportModal(container, {
    onCancel: () => { cancelled = true; },
  });
  modal.show();
  const btn = container.querySelector('#eeg-exp-cancel');
  assert.ok(btn);
  btn.click();
  assert.equal(cancelled, true);
  assert.equal(modal._visible, false);
});

test('CSS export string is non-empty', () => {
  assert.equal(typeof mod.EEG_EXPORT_MODAL_CSS, 'string');
  assert.ok(mod.EEG_EXPORT_MODAL_CSS.length > 50);
});
