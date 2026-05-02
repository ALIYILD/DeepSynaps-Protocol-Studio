// ─────────────────────────────────────────────────────────────────────────────
// eeg-decomposition-studio.test.js — Phase 4
//
// Verifies the ICA Decomposition Studio:
//   * setComponents renders one cell per IC
//   * click toggles excluded state and fires onExclude / onInclude
//   * apply-template menu toggle + menu-item click fires onApplyTemplate
// ─────────────────────────────────────────────────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';

// ── DOM polyfill ────────────────────────────────────────────────────────────
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
    // Crudely parse data-idx / data-tpl / id attributes so querySelector* below
    // can return useful stub elements with dataset population.
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
    const out = this._parsedNodes.filter((n) => n.matches(sel));
    out.length = out.length;  // ensure length is enumerable
    return out;
  }
  closest() { return null; }
}

// Tiny stub-node parser: extracts elements with id="..." or class="..." plus
// data-* attributes from the rendered innerHTML, enough for our wire-up tests
// to dispatch click events. Each parsed node is a FakeElement with the right
// dataset / attributes / class set.
function _parseStubNodes(html) {
  const out = [];
  // Match opening tags like <button class="x" id="y" data-z="q">
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
  // Patch matches() so selectors like '#id', '.class', 'tag', '.cls.cls2' resolve.
  for (const n of out) {
    n.matches = (sel) => {
      if (!sel) return false;
      if (sel.startsWith('#')) return n.id === sel.slice(1);
      if (sel.startsWith('.')) {
        // Support compound class selectors like ".a.b"
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

const mod = await import('./eeg-decomposition-studio.js');
const { EEGDecompositionStudio } = mod;

const FIXTURE = {
  n_components: 3,
  iclabel_available: true,
  auto_excluded_indices: [0],
  components: [
    { index: 0, label: 'eye', label_probabilities: { eye: 0.92, brain: 0.08 }, is_excluded: true, topomap_b64: 'data:image/png;base64,abc', variance_explained_pct: 5.5 },
    { index: 1, label: 'brain', label_probabilities: { brain: 0.98, eye: 0.02 }, is_excluded: false, topomap_b64: '' },
    { index: 2, label: 'muscle', label_probabilities: { muscle: 0.78, brain: 0.22 }, is_excluded: false, topomap_b64: '' },
  ],
};

// ── Tests ───────────────────────────────────────────────────────────────────

test('setComponents renders N cells', () => {
  const container = new FakeElement('div');
  const studio = new EEGDecompositionStudio(container, {});
  studio.setComponents(FIXTURE);
  const cells = (container.innerHTML.match(/eeg-ds__cell"/g) || []).length
    + (container.innerHTML.match(/eeg-ds__cell eeg-ds__cell--excluded"/g) || []).length;
  assert.equal(cells, 3);
});

test('auto-excluded indices initialise the excluded set', () => {
  const container = new FakeElement('div');
  const studio = new EEGDecompositionStudio(container, {});
  studio.setComponents(FIXTURE);
  assert.deepEqual(studio.getExcludedIndices().sort(), [0]);
});

test('toggleExclude flips state and fires the right callback', () => {
  const container = new FakeElement('div');
  const events = [];
  const studio = new EEGDecompositionStudio(container, {
    onExclude: (i, lbl) => events.push(['exclude', i, lbl]),
    onInclude: (i) => events.push(['include', i]),
  });
  studio.setComponents(FIXTURE);

  // 0 starts excluded → toggle should remove → onInclude
  studio.toggleExclude(0);
  assert.deepEqual(events, [['include', 0]]);
  assert.deepEqual(studio.getExcludedIndices().sort(), []);

  // 1 starts included → toggle should add → onExclude with label
  studio.toggleExclude(1);
  assert.equal(events.length, 2);
  assert.equal(events[1][0], 'exclude');
  assert.equal(events[1][1], 1);
  assert.equal(events[1][2], 'brain');
  assert.deepEqual(studio.getExcludedIndices().sort(), [1]);
});

test('rendered HTML contains topomap img tag for components with topomap_b64', () => {
  const container = new FakeElement('div');
  const studio = new EEGDecompositionStudio(container, {});
  studio.setComponents(FIXTURE);
  assert.match(container.innerHTML, /<img class="eeg-ds__topo"/);
  assert.match(container.innerHTML, /eeg-ds__topo-fallback/); // fallback for empty topomap
});

test('rendered HTML contains label badge per component', () => {
  const container = new FakeElement('div');
  const studio = new EEGDecompositionStudio(container, {});
  studio.setComponents(FIXTURE);
  assert.match(container.innerHTML, /eeg-ds__lblc--eye/);
  assert.match(container.innerHTML, /eeg-ds__lblc--brain/);
  assert.match(container.innerHTML, /eeg-ds__lblc--muscle/);
});

test('apply-template menu starts closed and opens on click', () => {
  const container = new FakeElement('div');
  const studio = new EEGDecompositionStudio(container, {});
  studio.setComponents(FIXTURE);
  assert.equal(studio.menuOpen, false);
  // simulate click on the template button
  const btn = container.querySelector('#eeg-ds-tpl-btn');
  assert.ok(btn, 'template button exists');
  btn.click();
  assert.equal(studio.menuOpen, true);
});

test('clicking a template menu item fires onApplyTemplate with the key', () => {
  const container = new FakeElement('div');
  let applied = null;
  const studio = new EEGDecompositionStudio(container, {
    onApplyTemplate: (k) => { applied = k; },
  });
  studio.setComponents(FIXTURE);
  // Open the menu first.
  studio.menuOpen = true;
  studio.render();
  const items = container.querySelectorAll('.eeg-ds__tpl-item');
  assert.ok(items.length >= 1, 'at least one template item rendered');
  // Find the eye_blink item and click it.
  const eyeBlink = Array.from(items).find((it) => (it.dataset && it.dataset.tpl) === 'eye_blink');
  assert.ok(eyeBlink, 'eye_blink template item exists');
  eyeBlink.click();
  assert.equal(applied, 'eye_blink');
});

test('Done button fires onClose', () => {
  const container = new FakeElement('div');
  let closed = false;
  const studio = new EEGDecompositionStudio(container, {
    onClose: () => { closed = true; },
  });
  studio.setComponents(FIXTURE);
  const done = container.querySelector('#eeg-ds-done-btn');
  assert.ok(done);
  done.click();
  assert.equal(closed, true);
});

test('CSS export string is non-empty', () => {
  assert.equal(typeof mod.EEG_DS_CSS, 'string');
  assert.ok(mod.EEG_DS_CSS.length > 50);
});
