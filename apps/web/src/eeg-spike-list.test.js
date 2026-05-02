// ─────────────────────────────────────────────────────────────────────────────
// eeg-spike-list.test.js — Phase 4
//
// Verifies the Spike List side popover:
//   * setEvents renders one row per event
//   * empty list with detector_available=true shows the clinical-empty hint
//   * row click fires onJump(t_sec, channel) with the right args
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

const mod = await import('./eeg-spike-list.js');
const { EEGSpikeList } = mod;

const EVENTS = [
  { t_sec: 12.42, channel: 'T3', peak_uv: 84, classification: 'spike', confidence: 0.78 },
  { t_sec: 27.10, channel: 'Cz', peak_uv: 65, classification: 'sharp', confidence: 0.62 },
  { t_sec: 41.05, channel: 'O1', peak_uv: 108, classification: 'spike-wave', confidence: 0.85 },
];

// ── Tests ────────────────────────────────────────────────────────────────────

test('setEvents renders one row per event', () => {
  const container = new FakeElement('div');
  const list = new EEGSpikeList(container, {});
  list.setEvents(EVENTS, { detectorAvailable: true });
  const rowCount = (container.innerHTML.match(/class="eeg-sl__row"/g) || []).length;
  assert.equal(rowCount, 3);
});

test('rendered HTML contains time stamp and channel name per row', () => {
  const container = new FakeElement('div');
  const list = new EEGSpikeList(container, {});
  list.setEvents(EVENTS, { detectorAvailable: true });
  assert.match(container.innerHTML, /12\.42s/);
  assert.match(container.innerHTML, /T3/);
  assert.match(container.innerHTML, /27\.10s/);
  assert.match(container.innerHTML, /Cz/);
});

test('row click fires onJump with t_sec + channel', () => {
  const container = new FakeElement('div');
  let lastJump = null;
  const list = new EEGSpikeList(container, {
    onJump: (t, ch) => { lastJump = [t, ch]; },
  });
  list.setEvents(EVENTS, { detectorAvailable: true });
  const rows = container.querySelectorAll('.eeg-sl__row');
  assert.equal(rows.length, 3);
  // Click the second row (data-i="1").
  const target = Array.from(rows).find((r) => r.dataset && r.dataset.i === '1');
  assert.ok(target, 'second row located');
  target.click();
  assert.deepEqual(lastJump, [27.10, 'Cz']);
});

test('empty list with detector_available shows clinical empty hint', () => {
  const container = new FakeElement('div');
  const list = new EEGSpikeList(container, {});
  list.setEvents([], { detectorAvailable: true });
  assert.match(container.innerHTML, /No spikes detected/);
  assert.match(container.innerHTML, /valid clinical signal/);
});

test('empty list without detector shows neutral empty hint', () => {
  const container = new FakeElement('div');
  const list = new EEGSpikeList(container, {});
  list.setEvents([], { detectorAvailable: false });
  assert.match(container.innerHTML, /detector not available/);
});

test('hide clears the container', () => {
  const container = new FakeElement('div');
  const list = new EEGSpikeList(container, {});
  list.setEvents(EVENTS, { detectorAvailable: true });
  list.hide();
  assert.equal(container.innerHTML, '');
});

test('close button fires hide()', () => {
  const container = new FakeElement('div');
  const list = new EEGSpikeList(container, {});
  list.setEvents(EVENTS, { detectorAvailable: true });
  const closeBtn = container.querySelector('#eeg-sl-close');
  assert.ok(closeBtn);
  closeBtn.click();
  assert.equal(list.visible, false);
});

test('CSS export string is non-empty', () => {
  assert.equal(typeof mod.EEG_SL_CSS, 'string');
  assert.ok(mod.EEG_SL_CSS.length > 50);
});
