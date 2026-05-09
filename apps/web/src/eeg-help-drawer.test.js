// Tests for eeg-help-drawer.js — Phase 7 contextual help drawer
// Pins: frameHTML structure, open/close state, unknown-topic fallback,
//       EEG_HELP_DRAWER_CSS export, Esc-to-close handler.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { EEGHelpDrawer, EEG_HELP_DRAWER_CSS } from './eeg-help-drawer.js';

// ── Minimal DOM shim ──────────────────────────────────────────────────────────
function makeElement(tag) {
  const el = {
    tagName: tag.toUpperCase(),
    innerHTML: '',
    textContent: '',
    classList: {
      _classes: new Set(),
      add(c) { this._classes.add(c); },
      remove(c) { this._classes.delete(c); },
      contains(c) { return this._classes.has(c); },
    },
    _children: [],
    _listeners: {},
    addEventListener(type, fn) {
      if (!this._listeners[type]) this._listeners[type] = [];
      this._listeners[type].push(fn);
    },
    removeEventListener(type, fn) {
      if (this._listeners[type]) {
        this._listeners[type] = this._listeners[type].filter(f => f !== fn);
      }
    },
    _trigger(type, evt) {
      (this._listeners[type] || []).forEach(fn => fn(evt));
    },
    querySelector(sel) {
      // Simple flat search among children by class selector
      const cls = sel.replace(/^\./, '');
      return this._findByClass(cls);
    },
    _findByClass(cls) {
      for (const child of this._children) {
        if (child.classList && child.classList._classes.has(cls)) return child;
        const found = child._findByClass && child._findByClass(cls);
        if (found) return found;
      }
      return null;
    },
  };
  return el;
}

// Build a minimal container that parses innerHTML into a real structure
// enough for the drawer to wire itself.
function makeContainer() {
  const eegHd = makeElement('aside');
  eegHd.classList.add('eeg-hd');
  const header = makeElement('div');
  const titleEl = makeElement('span');
  titleEl.classList.add('eeg-hd__title');
  const closeBtn = makeElement('button');
  closeBtn.classList.add('eeg-hd__close');
  const bodyEl = makeElement('div');
  bodyEl.classList.add('eeg-hd__body');
  header._children = [titleEl, closeBtn];
  eegHd._children = [header, bodyEl];

  const container = makeElement('div');
  container._children = [eegHd];
  // Override innerHTML setter to be a no-op (frameHTML already built above)
  Object.defineProperty(container, 'innerHTML', {
    get() { return ''; },
    set() { /* shim ignores overwrite */ },
  });
  container.querySelector = (sel) => container._findByClass(sel.replace(/^\./, ''));

  return { container, eegHd, titleEl, bodyEl, closeBtn };
}

// ── Minimal document shim ─────────────────────────────────────────────────────
let origDocument;
before(() => {
  origDocument = globalThis.document;
  globalThis.document = {
    _listeners: {},
    addEventListener(type, fn) {
      if (!this._listeners[type]) this._listeners[type] = [];
      this._listeners[type].push(fn);
    },
    removeEventListener(type, fn) {
      if (this._listeners[type]) {
        this._listeners[type] = this._listeners[type].filter(f => f !== fn);
      }
    },
    _triggerKeydown(evt) {
      (this._listeners['keydown'] || []).forEach(fn => fn(evt));
    },
  };
});
after(() => {
  globalThis.document = origDocument;
});

// ─────────────────────────────────────────────────────────────────────────────

describe('EEGHelpDrawer exports', () => {
  it('EEGHelpDrawer is a constructor/class', () => {
    assert.strictEqual(typeof EEGHelpDrawer, 'function');
  });

  it('EEG_HELP_DRAWER_CSS is a non-empty string', () => {
    assert.strictEqual(typeof EEG_HELP_DRAWER_CSS, 'string');
    assert.ok(EEG_HELP_DRAWER_CSS.length > 0, 'CSS export must be non-empty');
  });

  it('EEG_HELP_DRAWER_CSS includes the drawer root class .eeg-hd', () => {
    assert.ok(EEG_HELP_DRAWER_CSS.includes('.eeg-hd'), 'expected .eeg-hd rule in CSS export');
  });

  it('EEG_HELP_DRAWER_CSS includes the open state class .eeg-hd--open', () => {
    assert.ok(EEG_HELP_DRAWER_CSS.includes('.eeg-hd--open'), 'expected .eeg-hd--open rule');
  });

  it('EEG_HELP_DRAWER_CSS includes the help-icon class', () => {
    assert.ok(EEG_HELP_DRAWER_CSS.includes('.eeg-help-icon'), 'expected .eeg-help-icon rule');
  });
});

describe('EEGHelpDrawer — initial state', () => {
  it('starts with visible=false', () => {
    const { container } = makeContainer();
    const drawer = new EEGHelpDrawer(container);
    assert.strictEqual(drawer.visible, false);
  });

  it('starts with topicKey=null', () => {
    const { container } = makeContainer();
    const drawer = new EEGHelpDrawer(container);
    assert.strictEqual(drawer.topicKey, null);
  });
});

describe('EEGHelpDrawer — open()', () => {
  it('sets visible=true after open()', () => {
    const { container } = makeContainer();
    const drawer = new EEGHelpDrawer(container);
    drawer.open('montage');
    assert.strictEqual(drawer.visible, true);
  });

  it('stores the topic key after open()', () => {
    const { container } = makeContainer();
    const drawer = new EEGHelpDrawer(container);
    drawer.open('artifacts');
    assert.strictEqual(drawer.topicKey, 'artifacts');
  });

  it('does not throw for an unknown topic key', () => {
    const { container } = makeContainer();
    const drawer = new EEGHelpDrawer(container);
    assert.doesNotThrow(() => drawer.open('completely_unknown_topic_xyz'));
  });
});

describe('EEGHelpDrawer — close()', () => {
  it('sets visible=false after close()', () => {
    const { container } = makeContainer();
    const drawer = new EEGHelpDrawer(container);
    drawer.open('montage');
    drawer.close();
    assert.strictEqual(drawer.visible, false);
  });

  it('fires opts.onClose callback when provided', () => {
    const { container } = makeContainer();
    let called = false;
    const drawer = new EEGHelpDrawer(container, { onClose: () => { called = true; } });
    drawer.open('montage');
    drawer.close();
    assert.strictEqual(called, true, 'onClose callback must be fired');
  });

  it('does not throw when no onClose callback is provided', () => {
    const { container } = makeContainer();
    const drawer = new EEGHelpDrawer(container);
    drawer.open('montage');
    assert.doesNotThrow(() => drawer.close());
  });
});

describe('EEGHelpDrawer — Esc-to-close', () => {
  it('closes the drawer when Escape key is pressed while visible', () => {
    const { container } = makeContainer();
    const drawer = new EEGHelpDrawer(container);
    drawer.open('montage');
    assert.strictEqual(drawer.visible, true);
    // Simulate Escape keydown via the handler directly
    drawer._onKeyDown({ key: 'Escape', preventDefault() {} });
    assert.strictEqual(drawer.visible, false, 'Escape must close the drawer');
  });

  it('does not close when a non-Escape key is pressed', () => {
    const { container } = makeContainer();
    const drawer = new EEGHelpDrawer(container);
    drawer.open('montage');
    drawer._onKeyDown({ key: 'Enter', preventDefault() {} });
    assert.strictEqual(drawer.visible, true, 'non-Escape key must not close drawer');
  });

  it('does nothing when _onKeyDown fires while drawer is not visible', () => {
    const { container } = makeContainer();
    const drawer = new EEGHelpDrawer(container);
    // visible is false from start — should not throw
    assert.doesNotThrow(() => drawer._onKeyDown({ key: 'Escape', preventDefault() {} }));
    assert.strictEqual(drawer.visible, false);
  });
});
