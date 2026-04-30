// ─────────────────────────────────────────────────────────────────────────────
// pages-qeeg-launcher.test.js
//
// Phase 3: tests for the unified QEEG intake landing page. Verifies that
// both action buttons render and route to the correct existing flows
// (auto-pipeline = qeeg-analysis; manual cleaning = qeeg-raw-workbench).
//
// Run: npm run test:unit
// ─────────────────────────────────────────────────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';

if (typeof globalThis.window === 'undefined') {
  globalThis.window = globalThis;
}
if (typeof globalThis.document === 'undefined') {
  globalThis.document = { getElementById: function () { return null; } };
}

const launcher = await import('./pages-qeeg-launcher.js');

test('renderQEEGLauncher includes both action cards', function () {
  const html = launcher.renderQEEGLauncher();
  assert.match(html, /Auto-analyze with AI/);
  assert.match(html, /Clean it myself first/);
  assert.match(html, /data-launcher-card="auto"/);
  assert.match(html, /data-launcher-card="manual"/);
});

test('renderQEEGLauncher advertises supported file formats', function () {
  const html = launcher.renderQEEGLauncher();
  ['.edf', '.bdf', '.vhdr', '.set', '.fif'].forEach(function (ext) {
    assert.match(html, new RegExp(ext.replace('.', '\\.'), 'i'));
  });
});

test('renderQEEGLauncher carries the regulatory disclaimer', function () {
  const html = launcher.renderQEEGLauncher();
  assert.match(html, /research and wellness/i);
  assert.match(html, /not a medical diagnosis/i);
});

test('launcher contains no banned regulatory terms outside the disclaimer', function () {
  const html = launcher.renderQEEGLauncher();
  const stripped = html.replace(/not a medical diagnosis or\s+treatment recommendation/gi, '');
  assert.equal(/\bdiagnosis\b/i.test(stripped), false, 'leak: "diagnosis" outside disclaimer');
  assert.equal(/\bdiagnostic\b/i.test(stripped), false, 'leak: "diagnostic" outside disclaimer');
  assert.equal(/\btreatment recommendation\b/i.test(stripped), false, 'leak: "treatment recommendation" outside disclaimer');
});

test('launcher hero footer offers a demo data path', function () {
  const html = launcher.renderQEEGLauncher();
  assert.match(html, /Try with demo data/);
  assert.match(html, /data-launcher-action="demo"/);
});

test('launcher action wiring routes to the correct destinations', async function () {
  // Build a minimal DOM-ish container that supports
  // querySelectorAll + addEventListener on returned elements.
  function makeEl(attrs) {
    const handlers = {};
    return {
      __attrs: attrs || {},
      getAttribute: function (k) { return this.__attrs[k] || null; },
      addEventListener: function (ev, fn) { handlers[ev] = fn; },
      __dispatch: function (ev, payload) { if (handlers[ev]) handlers[ev](payload || { stopPropagation: function () {}, preventDefault: function () {} }); },
    };
  }
  const buttons = [
    makeEl({ 'data-launcher-action': 'auto' }),
    makeEl({ 'data-launcher-action': 'manual' }),
    makeEl({ 'data-launcher-action': 'demo' }),
    makeEl({ 'data-launcher-action': 'docs' }),
  ];
  const cards = [
    makeEl({ 'data-launcher-card': 'auto' }),
    makeEl({ 'data-launcher-card': 'manual' }),
  ];
  const container = {
    querySelectorAll: function (sel) {
      if (sel.indexOf('data-launcher-action') !== -1) return buttons;
      if (sel.indexOf('data-launcher-card') !== -1) return cards;
      return [];
    },
  };

  const visited = [];
  function navigate(route) { visited.push(route); }

  // _wireActions is not exported, but we can exercise it indirectly through
  // pgQEEGLauncher by mocking document.getElementById. Easier: re-import
  // with a tiny shim that captures navigation calls.
  // We ship _wireActions implicitly via pgQEEGLauncher; for this test we
  // hand-invoke the action handlers by calling the click listeners that
  // pgQEEGLauncher registered.
  // Simulate the wiring by re-implementing the handler dispatch the same
  // way the module does (one of the two acceptable patterns: button click
  // or whole-card activation). We invoke the module's exports directly via
  // a fake document so the registered handlers exist on our shim elements.

  globalThis.document = {
    getElementById: function (id) {
      if (id !== 'content') return null;
      // Return a node whose querySelectorAll proxies to our container.
      return {
        innerHTML: '',
        querySelectorAll: container.querySelectorAll,
      };
    },
  };

  await launcher.pgQEEGLauncher(function () {}, navigate);

  // Click button "auto" → should navigate to qeeg-analysis
  buttons[0].__dispatch('click');
  // Click button "manual" → qeeg-raw-workbench
  buttons[1].__dispatch('click');
  // Click button "demo" → qeeg-raw-workbench/demo
  buttons[2].__dispatch('click');
  // Click button "docs" → handbooks-v2
  buttons[3].__dispatch('click');

  assert.deepEqual(visited, [
    'qeeg-analysis',
    'qeeg-raw-workbench',
    'qeeg-raw-workbench/demo',
    'handbooks-v2',
  ]);
});

test('launcher card keyboard activation routes the same as click', async function () {
  function makeEl(attrs) {
    const handlers = {};
    return {
      __attrs: attrs || {},
      getAttribute: function (k) { return this.__attrs[k] || null; },
      addEventListener: function (ev, fn) { handlers[ev] = fn; },
      __dispatch: function (ev, payload) { if (handlers[ev]) handlers[ev](payload || { preventDefault: function () {}, stopPropagation: function () {} }); },
    };
  }
  const cards = [
    makeEl({ 'data-launcher-card': 'auto' }),
    makeEl({ 'data-launcher-card': 'manual' }),
  ];
  const buttons = [];

  globalThis.document = {
    getElementById: function (id) {
      if (id !== 'content') return null;
      return {
        innerHTML: '',
        querySelectorAll: function (sel) {
          if (sel.indexOf('data-launcher-action') !== -1) return buttons;
          if (sel.indexOf('data-launcher-card') !== -1) return cards;
          return [];
        },
      };
    },
  };

  const visited = [];
  await launcher.pgQEEGLauncher(function () {}, function (r) { visited.push(r); });
  cards[0].__dispatch('keydown', { key: 'Enter', preventDefault: function () {}, stopPropagation: function () {} });
  cards[1].__dispatch('keydown', { key: ' ', preventDefault: function () {}, stopPropagation: function () {} });
  assert.deepEqual(visited, ['qeeg-analysis', 'qeeg-raw-workbench']);
});
