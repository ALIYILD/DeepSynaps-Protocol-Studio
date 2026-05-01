// ─────────────────────────────────────────────────────────────────────────────
// raw-help-drawer.test.js — Phase 7
//
// Verifies the help-drawer + help-content + keyboard-shortcuts modules:
//   * EEGHelpDrawer.open(key) renders the right title and body.
//   * RAW_HELP_TOPICS covers at least 12 topic keys.
//   * No vendor / product names appear in any topic body (regex assertion).
//   * RAW_KEYBOARD_SHORTCUTS / renderShortcutSheet behave sensibly.
// ─────────────────────────────────────────────────────────────────────────────

import test from 'node:test';
import assert from 'node:assert/strict';

// ── Minimal DOM stubs (mirrors the helper used in eeg-spike-list.test.js) ────

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
  removeEventListener(name, fn) {
    const list = this._listeners[name] || [];
    const idx = list.indexOf(fn);
    if (idx >= 0) list.splice(idx, 1);
  }
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
  const re = /<([a-zA-Z][a-zA-Z0-9]*)\s*([^>]*?)\/?>/g;
  let m;
  while ((m = re.exec(html))) {
    const tag = m[1];
    const attrs = m[2] || '';
    const node = new FakeElement(tag);
    const idMatch = /id\s*=\s*"([^"]+)"/.exec(attrs);
    if (idMatch) node.id = idMatch[1];
    const classMatch = /class\s*=\s*"([^"]+)"/.exec(attrs);
    const classes = classMatch ? classMatch[1].split(/\s+/) : [];
    for (const c of classes) node.classList.add(c);
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
    removeEventListener: () => {},
  };
  globalThis.window = Object.assign(globalThis.window || {}, {
    addEventListener: () => {},
    removeEventListener: () => {},
  });
  return root;
}

installDom();

const helpMod = await import('./raw-help-content.js');
const drawerMod = await import('./eeg-help-drawer.js');
const kbMod = await import('./raw-keyboard-shortcuts.js');

const { RAW_HELP_TOPICS, RAW_HELP_TOPIC_KEYS } = helpMod;
const { EEGHelpDrawer, EEG_HELP_DRAWER_CSS } = drawerMod;
const { RAW_KEYBOARD_SHORTCUTS, renderShortcutSheet } = kbMod;

// ── Tests ────────────────────────────────────────────────────────────────────

test('RAW_HELP_TOPICS has at least 12 keys', () => {
  assert.ok(
    RAW_HELP_TOPIC_KEYS.length >= 12,
    `expected >= 12 topics, found ${RAW_HELP_TOPIC_KEYS.length}`
  );
});

test('every topic has non-empty title and body', () => {
  for (const key of RAW_HELP_TOPIC_KEYS) {
    const t = RAW_HELP_TOPICS[key];
    assert.ok(t.title && t.title.length > 0, `topic '${key}' missing title`);
    assert.ok(t.body && t.body.length > 30, `topic '${key}' body too short`);
  }
});

test('no vendor or product names appear in any topic body', () => {
  // Same banned set as scripts/check-vendor-names.sh, assembled from parts so
  // the literal product names do not appear in this test file (otherwise the
  // vendor-name guard would flag this regression-test for the guard).
  const _v = ['mits' + 'ar', 'win' + 'eeg', 'pers' + 'yst', 'neuro' + 'works'];
  const banned = new RegExp('(' + _v.join('|') + ')', 'i');
  for (const key of RAW_HELP_TOPIC_KEYS) {
    const body = RAW_HELP_TOPICS[key].body;
    const title = RAW_HELP_TOPICS[key].title;
    assert.ok(!banned.test(body), `vendor name leaked into topic body '${key}'`);
    assert.ok(!banned.test(title), `vendor name leaked into topic title '${key}'`);
  }
});

test('drawer renders the right topic when opened by key', () => {
  const container = new FakeElement('div');
  const drawer = new EEGHelpDrawer(container, {});
  drawer.open('montage');

  const expected = RAW_HELP_TOPICS.montage;
  // Title is set via .textContent on the title span; body is set via innerHTML.
  const titleEl = container.querySelector('.eeg-hd__title');
  const bodyEl = container.querySelector('.eeg-hd__body');
  assert.ok(titleEl, 'title element rendered');
  assert.ok(bodyEl, 'body element rendered');
  assert.equal(titleEl.textContent, expected.title);
  // Body should contain the exact prose from the topic record.
  assert.equal(bodyEl.innerHTML, expected.body);
});

test('drawer marks itself open after open() and closed after close()', () => {
  const container = new FakeElement('div');
  const drawer = new EEGHelpDrawer(container, {});
  drawer.open('sensitivity');
  assert.equal(drawer.visible, true);
  const root = container.querySelector('.eeg-hd');
  assert.ok(root.classList.contains('eeg-hd--open'));
  drawer.close();
  assert.equal(drawer.visible, false);
  assert.equal(root.classList.contains('eeg-hd--open'), false);
});

test('opening an unknown key renders the missing-topic fallback', () => {
  const container = new FakeElement('div');
  const drawer = new EEGHelpDrawer(container, {});
  drawer.open('nonexistent_topic_xyz');
  const bodyEl = container.querySelector('.eeg-hd__body');
  assert.match(bodyEl.innerHTML, /not found/i);
});

test('CSS export is a non-empty string', () => {
  assert.equal(typeof EEG_HELP_DRAWER_CSS, 'string');
  assert.ok(EEG_HELP_DRAWER_CSS.length > 100);
});

test('topics include each major toolbar/sidebar group', () => {
  // Sanity that we covered the categories called out in the Phase 7 plan.
  const required = [
    'montage', 'sensitivity', 'bandpass', 'notch', 'ica_review',
    'bad_channel_marking', 'bad_segment_marking', 'auto_scan',
    'decomposition_studio', 'spike_list', 'export', 'cleaning_report',
    'ai_quality_score', 'ai_auto_clean',
  ];
  for (const k of required) {
    assert.ok(RAW_HELP_TOPICS[k], `missing required topic '${k}'`);
  }
});

// ── Keyboard-shortcuts module ────────────────────────────────────────────────

test('RAW_KEYBOARD_SHORTCUTS lists the 10 documented hotkeys', () => {
  assert.ok(
    RAW_KEYBOARD_SHORTCUTS.length >= 10,
    `expected >= 10 shortcut entries, found ${RAW_KEYBOARD_SHORTCUTS.length}`
  );
  // Core entries must exist.
  const keys = RAW_KEYBOARD_SHORTCUTS.map((s) => s.key);
  for (const expected of ['B', 'M', 'E', 'Space', '?']) {
    assert.ok(keys.includes(expected), `shortcut for '${expected}' missing`);
  }
});

test('renderShortcutSheet returns HTML with a row per shortcut', () => {
  const html = renderShortcutSheet();
  assert.equal(typeof html, 'string');
  const matches = html.match(/raw-kbd__row/g) || [];
  assert.equal(matches.length, RAW_KEYBOARD_SHORTCUTS.length);
});

test('shortcut sheet escapes lt/gt-style descriptions', () => {
  // Smoke-test: the sheet should not embed raw `<` from action strings if any
  // ever appear. Currently none do, but the renderer must escape defensively.
  const html = renderShortcutSheet();
  // No unescaped `<script` (regression guard).
  assert.equal(html.includes('<script'), false);
});
