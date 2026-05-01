// ─────────────────────────────────────────────────────────────────────────────
// eeg-montage-builder.test.js — Phase 3
//
// Verifies the Custom Montage Builder:
//  * serialize / loadPreset round-trip
//  * self-pair guard (anode != cathode)
//  * render() into a fake DOM produces the editor markup without throwing
// ─────────────────────────────────────────────────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';

// ── DOM polyfill (mirror of pages-qeeg-raw-state.test.js, trimmed) ──────────
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
  }
  set innerHTML(v) { this._innerHTML = String(v); this.children = []; }
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
  dispatchEvent() { return true; }
  click() {}
  querySelector(sel) {
    // Very minimal — only used for `#emb-name-input` and `.emb-row`.
    if (sel === '#emb-name-input') {
      // Manufacture a stub input that the builder wires to.
      const inp = new FakeElement('input');
      inp.value = this._lastName || '';
      return inp;
    }
    return null;
  }
  querySelectorAll() { return []; }
  closest() { return null; }
}

function installDom() {
  const root = new FakeElement('div'); root.id = 'app';
  globalThis.document = {
    getElementById: (id) => null,
    body: root,
    head: new FakeElement('head'),
    createElement: (tag) => new FakeElement(tag),
    addEventListener: () => {},
  };
  globalThis.window = Object.assign(globalThis.window || {}, {
    addEventListener: () => {},
    _showToast: () => {},
  });
  return root;
}

installDom();

const mod = await import('./eeg-montage-builder.js');
const { EEGCustomMontageBuilder } = mod;

// ── Tests ────────────────────────────────────────────────────────────────────

const CHANNELS = ['Fp1', 'Fp2', 'F7', 'F3', 'Fz', 'F4', 'F8', 'Cz', 'Pz', 'O1', 'O2'];

test('constructor stores channel list and starts with no pairs', () => {
  const b = new EEGCustomMontageBuilder(CHANNELS);
  assert.deepEqual(b.channels, CHANNELS);
  assert.deepEqual(b.pairs, []);
  assert.equal(b.name, 'Custom montage');
});

test('constructor handles non-array channels safely', () => {
  const b = new EEGCustomMontageBuilder(null);
  assert.deepEqual(b.channels, []);
});

test('addPair appends valid pairs', () => {
  const b = new EEGCustomMontageBuilder(CHANNELS);
  const ok = b.addPair('Fp1', 'F7');
  assert.equal(ok, true);
  assert.deepEqual(b.pairs, [{ anode: 'Fp1', cathode: 'F7' }]);
});

test('addPair rejects self-pairs (anode === cathode)', () => {
  const b = new EEGCustomMontageBuilder(CHANNELS);
  const ok = b.addPair('Cz', 'Cz');
  assert.equal(ok, false);
  assert.deepEqual(b.pairs, []);
});

test('addPair rejects empty anode or cathode', () => {
  const b = new EEGCustomMontageBuilder(CHANNELS);
  assert.equal(b.addPair('', 'F7'), false);
  assert.equal(b.addPair('Cz', ''), false);
  assert.deepEqual(b.pairs, []);
});

test('serialize returns canonical name + pairs', () => {
  const b = new EEGCustomMontageBuilder(CHANNELS);
  b.setName('My Bipolar');
  b.addPair('Fp1', 'F7');
  b.addPair('Fp2', 'F8');
  const out = b.serialize();
  assert.equal(out.name, 'My Bipolar');
  assert.deepEqual(out.pairs, [
    { anode: 'Fp1', cathode: 'F7' },
    { anode: 'Fp2', cathode: 'F8' },
  ]);
});

test('serialize drops invalid (self / empty) pairs', () => {
  const b = new EEGCustomMontageBuilder(CHANNELS);
  // Force pairs in directly (bypassing addPair) to simulate state corruption.
  b.pairs = [
    { anode: 'Fp1', cathode: 'F7' },
    { anode: 'Cz', cathode: 'Cz' },
    { anode: '', cathode: 'F8' },
  ];
  const out = b.serialize();
  assert.deepEqual(out.pairs, [{ anode: 'Fp1', cathode: 'F7' }]);
});

test('loadPreset round-trips through serialize', () => {
  const b1 = new EEGCustomMontageBuilder(CHANNELS);
  b1.setName('Round trip');
  b1.addPair('Fp1', 'F7');
  b1.addPair('Cz', 'Pz');
  const blob = b1.serialize();

  const b2 = new EEGCustomMontageBuilder(CHANNELS);
  b2.loadPreset(blob);
  assert.equal(b2.name, blob.name);
  assert.deepEqual(b2.serialize(), blob);
});

test('loadPreset filters out invalid pairs', () => {
  const b = new EEGCustomMontageBuilder(CHANNELS);
  b.loadPreset({
    name: 'Mixed',
    pairs: [
      { anode: 'Fp1', cathode: 'F7' },
      { anode: 'Cz', cathode: 'Cz' },     // self → drop
      { anode: '', cathode: 'F8' },       // empty → drop
      { anode: 'Pz', cathode: 'O1' },
    ],
  });
  assert.deepEqual(b.serialize().pairs, [
    { anode: 'Fp1', cathode: 'F7' },
    { anode: 'Pz', cathode: 'O1' },
  ]);
});

test('loadPreset on bogus payload is a no-op', () => {
  const b = new EEGCustomMontageBuilder(CHANNELS);
  b.addPair('Fp1', 'F7');
  b.loadPreset(null);
  b.loadPreset(undefined);
  b.loadPreset('not an object');
  assert.deepEqual(b.serialize().pairs, [{ anode: 'Fp1', cathode: 'F7' }]);
});

test('render() into a container does not throw on empty pairs', () => {
  const container = new FakeElement('div');
  const b = new EEGCustomMontageBuilder(CHANNELS);
  assert.doesNotThrow(() => b.render(container));
  // Empty-state hint should be in the rendered HTML.
  assert.match(container.innerHTML, /No pairs yet/);
});

test('render() emits one row per pair with select boxes and remove btn', () => {
  const container = new FakeElement('div');
  const b = new EEGCustomMontageBuilder(CHANNELS);
  b.addPair('Fp1', 'F7');
  b.addPair('Fp2', 'F8');
  b.render(container);
  assert.match(container.innerHTML, /class="emb-row"/);
  // Two rows.
  assert.equal((container.innerHTML.match(/class="emb-row"/g) || []).length, 2);
  assert.match(container.innerHTML, /data-role="anode"/);
  assert.match(container.innerHTML, /data-role="cathode"/);
  assert.match(container.innerHTML, /data-action="remove"/);
});

test('removePair drops the right entry and re-renders', () => {
  const container = new FakeElement('div');
  const b = new EEGCustomMontageBuilder(CHANNELS);
  b.addPair('Fp1', 'F7');
  b.addPair('Fp2', 'F8');
  b.render(container);
  b.removePair(0);
  assert.deepEqual(b.serialize().pairs, [{ anode: 'Fp2', cathode: 'F8' }]);
});

test('setName clamps to 60 characters', () => {
  const b = new EEGCustomMontageBuilder(CHANNELS);
  const longName = 'x'.repeat(120);
  b.setName(longName);
  assert.equal(b.name.length, 60);
});

test('serialize never returns more pairs than addPair was called', () => {
  const b = new EEGCustomMontageBuilder(CHANNELS);
  for (let i = 0; i < 5; i++) b.addPair('Fp1', 'F7');
  assert.equal(b.serialize().pairs.length, 5);
});

test('CSS export string is non-empty', () => {
  assert.equal(typeof mod.EEG_MONTAGE_BUILDER_CSS, 'string');
  assert.ok(mod.EEG_MONTAGE_BUILDER_CSS.length > 50);
});
