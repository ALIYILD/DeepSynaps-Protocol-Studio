// ─────────────────────────────────────────────────────────────────────────────
// eeg-auto-scan-modal.test.js — Phase 4
//
// Verifies the Auto-Scan Modal:
//   * show(scanResult) renders one row per channel + segment
//   * un-checking a row + commit captures it under rejected_items
//   * apply button fires onCommit with structured payload
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
    if (/checked/.test(attrs)) node.checked = true;
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

const mod = await import('./eeg-auto-scan-modal.js');
const { EEGAutoScanModal } = mod;

const FIXTURE = {
  bad_channels: [
    { channel: 'T3', reason: 'flatline', metric: { flat_sec: 8.2 }, confidence: 0.91 },
    { channel: 'Fp1', reason: 'high_kurtosis', metric: { kurtosis: 12.1 }, confidence: 0.71 },
  ],
  bad_segments: [
    { start_sec: 12.4, end_sec: 13.1, reason: 'amp_threshold', metric: { peak_uv: 312.0 }, confidence: 0.88 },
  ],
  summary: {
    n_bad_channels: 2,
    n_bad_segments: 1,
    total_excluded_sec: 0.7,
  },
};

// ── Tests ────────────────────────────────────────────────────────────────────

test('show renders one row per channel and segment', () => {
  const container = new FakeElement('div');
  const modal = new EEGAutoScanModal(container, {});
  modal.show(FIXTURE, 'run-1');
  // Two channel rows + one segment row → three .eeg-asm__row entries.
  const rows = (container.innerHTML.match(/class="eeg-asm__row"/g) || []).length;
  assert.equal(rows, 3);
});

test('show captures runId and accepts everything by default', () => {
  const container = new FakeElement('div');
  const modal = new EEGAutoScanModal(container, {});
  modal.show(FIXTURE, 'run-42');
  assert.equal(modal.runId, 'run-42');
  assert.equal(modal.channelStates.length, 2);
  assert.equal(modal.segmentStates.length, 1);
  for (const s of modal.channelStates) assert.equal(s.accepted, true);
  for (const s of modal.segmentStates) assert.equal(s.accepted, true);
});

test('un-checking a row moves it to rejected_items', () => {
  const container = new FakeElement('div');
  let received = null;
  const modal = new EEGAutoScanModal(container, {
    onCommit: (decision) => { received = decision; },
  });
  modal.show(FIXTURE, 'run-7');
  // Reject the high_kurtosis Fp1 row programmatically (mirrors UI un-check).
  modal.channelStates[1].accepted = false;
  const out = modal.collectDecision();
  assert.equal(out.accepted_items.bad_channels.length, 1);
  assert.equal(out.accepted_items.bad_channels[0].channel, 'T3');
  assert.equal(out.rejected_items.bad_channels.length, 1);
  assert.equal(out.rejected_items.bad_channels[0].channel, 'Fp1');
  assert.equal(out.accepted_items.bad_segments.length, 1);
  assert.equal(out.rejected_items.bad_segments.length, 0);
});

test('apply button fires onCommit with full payload + run_id', () => {
  const container = new FakeElement('div');
  let received = null;
  const modal = new EEGAutoScanModal(container, {
    onCommit: (decision) => { received = decision; },
  });
  modal.show(FIXTURE, 'run-9');
  const apply = container.querySelector('#eeg-asm-apply');
  assert.ok(apply, 'apply button exists');
  apply.click();
  assert.ok(received, 'onCommit fired');
  assert.equal(received.run_id, 'run-9');
  assert.equal(received.accepted_items.bad_channels.length, 2);
  assert.equal(received.accepted_items.bad_segments.length, 1);
  assert.equal(received.rejected_items.bad_channels.length, 0);
});

test('cancel button fires onCancel and hides', () => {
  const container = new FakeElement('div');
  let cancelled = false;
  const modal = new EEGAutoScanModal(container, {
    onCancel: () => { cancelled = true; },
  });
  modal.show(FIXTURE, 'run-x');
  const btn = container.querySelector('#eeg-asm-cancel');
  assert.ok(btn);
  btn.click();
  assert.equal(cancelled, true);
  assert.equal(modal._visible, false);
});

test('checkbox change event flips channelStates entry', () => {
  const container = new FakeElement('div');
  const modal = new EEGAutoScanModal(container, {});
  modal.show(FIXTURE, 'run-z');
  const cbs = container.querySelectorAll('.eeg-asm__cb');
  assert.ok(cbs.length >= 3, 'three checkboxes rendered');
  // Find the checkbox for the second channel (data-i="1").
  const target = Array.from(cbs).find((c) => c.dataset && c.dataset.kind === 'channel' && c.dataset.i === '1');
  assert.ok(target, 'second channel checkbox located');
  target.fireChange(false);
  assert.equal(modal.channelStates[1].accepted, false);
});

test('empty fixture renders empty-state hints', () => {
  const container = new FakeElement('div');
  const modal = new EEGAutoScanModal(container, {});
  modal.show({ bad_channels: [], bad_segments: [], summary: {} }, 'run-empty');
  assert.match(container.innerHTML, /None detected/);
});

test('CSS export string is non-empty', () => {
  assert.equal(typeof mod.EEG_ASM_CSS, 'string');
  assert.ok(mod.EEG_ASM_CSS.length > 50);
});
