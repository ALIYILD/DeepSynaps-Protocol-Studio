// ─────────────────────────────────────────────────────────────────────────────
// pages-qeeg-raw-state.test.js
//
// Phase 2 unit tests for the Raw EEG cleaning workstation:
//   - State is sliced into display / processing / ai / ui buckets.
//   - The flat compatibility shim still works (state.montage === slice.montage).
//   - The toolbar HTML carries the four named clusters with data-group attrs.
//   - The Quality Scorecard shell exists in the rendered DOM.
//   - _computeDeterministicQuality returns the expected shape.
//
// Boots a hand-rolled DOM polyfill (mirroring pages-qeeg-raw-workbench.test.js)
// and rewrites the api import to a side-effect-free stub before importing the
// module under test.
// ─────────────────────────────────────────────────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ── DOM polyfill ─────────────────────────────────────────────────────────────
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
  set innerHTML(v) { this._innerHTML = String(v); }
  get innerHTML() { return this._innerHTML; }
  set textContent(v) { this._textContent = String(v); }
  get textContent() { return this._textContent; }
  setAttribute(k, v) { this.attributes[k] = v; }
  getAttribute(k) { return this.attributes[k]; }
  appendChild(c) { this.children.push(c); c.parentElement = this; return c; }
  insertBefore(c, _ref) { this.children.unshift(c); if (c) c.parentElement = this; return c; }
  removeChild(c) { return c; }
  replaceChild(neu, _old) { if (neu) neu.parentElement = this; return neu; }
  remove() {}
  addEventListener(name, fn) { (this._listeners[name] ||= []).push(fn); }
  removeEventListener() {}
  dispatchEvent() { return true; }
  click() {}
  querySelector() { return null; }
  querySelectorAll() { return []; }
  closest() { return null; }
  get firstElementChild() { return this.children[0] || null; }
  get clientWidth() { return 1280; }
  get clientHeight() { return 720; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 1280, height: 64 }; }
  getContext() {
    return {
      setTransform() {}, fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {},
      stroke() {}, fill() {}, fillText() {}, setLineDash() {},
      set fillStyle(_v) {}, get fillStyle() { return ''; },
      set strokeStyle(_v) {}, get strokeStyle() { return ''; },
      set lineWidth(_v) {}, get lineWidth() { return 1; },
      set font(_v) {}, get font() { return ''; },
    };
  }
  toDataURL() { return 'data:image/png;base64,AAAA'; }
  focus() {}
}

function installDom() {
  const root = new FakeElement('div'); root.id = 'app';
  const byId = { app: root };
  globalThis.document = {
    getElementById: (id) => {
      if (!byId[id]) { const el = new FakeElement('div'); el.id = id; byId[id] = el; }
      return byId[id];
    },
    _byId: byId,
    body: root,
    head: new FakeElement('head'),
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: (tag) => new FakeElement(tag),
    addEventListener: () => {},
  };
  globalThis.window = Object.assign(globalThis.window || {}, {
    location: { hash: '#/qeeg/demo', href: 'http://test/' },
    addEventListener: () => {}, removeEventListener: () => {},
    devicePixelRatio: 1,
    _isDemoMode: () => true,
    _qeegSelectedId: 'demo',
    _nav: () => {},
    prompt: () => null,
    alert: () => {},
  });
  globalThis.devicePixelRatio = 1;
  globalThis.URL = class { constructor(href) { this.href = href; this.searchParams = { get: () => null }; } static createObjectURL() { return 'blob://x'; } static revokeObjectURL() {} };
  globalThis.Blob = function() { return { size: 0 }; };
  globalThis.setInterval = () => 0;
  globalThis.clearInterval = () => {};
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  globalThis.requestAnimationFrame = (cb) => { try { cb(0); } catch (_) {} return 0; };
  globalThis.cancelAnimationFrame = () => {};
  return { root, byId };
}

// ── Patch the page-module's api + helpers imports to side-effect-free stubs ──
function preparePatchedModule() {
  const HERE_URL = new URL('./pages-qeeg-raw.js', import.meta.url);
  const HERE = fileURLToPath(HERE_URL);
  const SRC = readFileSync(HERE, 'utf8');
  const TMP = join(tmpdir(), `qraw-state-${process.pid}`);
  mkdirSync(TMP, { recursive: true });
  // Side-effect-free api stub. The page only calls these in renderRawDataTab;
  // for state-shape tests we never trigger them.
  writeFileSync(join(TMP, 'api.js'),
    `export const api = new Proxy({}, { get: () => async () => ({}) });`);
  // The helpers module attaches window._showToast at module top-level and uses
  // document.getElementById. Stub it.
  writeFileSync(join(TMP, 'helpers.js'),
    `export function emptyState(_i, t, _b) { return '<div>' + t + '</div>'; }
     export function showToast() {}
     if (typeof window !== 'undefined') window._showToast = showToast;`);
  // Re-export the renderer + tools verbatim — they're pure JS. Point those
  // imports at the real files using file:// URLs so the ESM loader accepts
  // them on Windows (absolute c:/... paths fail with ERR_UNSUPPORTED_ESM_URL_SCHEME).
  const realDir = fileURLToPath(new URL('./', import.meta.url));
  const fileUrl = (absPath) => pathToFileURL(absPath).href;
  const PATCHED = SRC
    .replace(/from\s+['"]\.\/api\.js['"];?/, `from '${fileUrl(join(TMP, 'api.js'))}';`)
    .replace(/from\s+['"]\.\/helpers\.js['"];?/, `from '${fileUrl(join(TMP, 'helpers.js'))}';`)
    .replace(/from\s+['"]\.\/eeg-signal-renderer\.js['"];?/, `from '${fileUrl(join(realDir, 'eeg-signal-renderer.js'))}';`)
    .replace(/from\s+['"]\.\/brain-map-svg\.js['"];?/, `from '${fileUrl(join(realDir, 'brain-map-svg.js'))}';`)
    .replace(/from\s+['"]\.\/eeg-spectral-panel\.js['"];?/, `from '${fileUrl(join(realDir, 'eeg-spectral-panel.js'))}';`)
    .replace(/from\s+['"]\.\/eeg-tools\.js['"];?/, `from '${fileUrl(join(realDir, 'eeg-tools.js'))}';`)
    .replace(/from\s+['"]\.\/eeg-montage-editor\.js['"];?/, `from '${fileUrl(join(realDir, 'eeg-montage-editor.js'))}';`)
    .replace(/from\s+['"]\.\/eeg-montage-builder\.js['"];?/, `from '${fileUrl(join(realDir, 'eeg-montage-builder.js'))}';`)
    .replace(/from\s+['"]\.\/eeg-filter-preview\.js['"];?/, `from '${fileUrl(join(realDir, 'eeg-filter-preview.js'))}';`)
    .replace(/from\s+['"]\.\/eeg-decomposition-studio\.js['"];?/, `from '${fileUrl(join(realDir, 'eeg-decomposition-studio.js'))}';`)
    .replace(/from\s+['"]\.\/eeg-auto-scan-modal\.js['"];?/, `from '${fileUrl(join(realDir, 'eeg-auto-scan-modal.js'))}';`)
    .replace(/from\s+['"]\.\/eeg-spike-list\.js['"];?/, `from '${fileUrl(join(realDir, 'eeg-spike-list.js'))}';`)
    .replace(/from\s+['"]\.\/eeg-export-modal\.js['"];?/, `from '${fileUrl(join(realDir, 'eeg-export-modal.js'))}';`)
    // Phase 7 imports — drawer, help content, keyboard-shortcuts.
    .replace(/from\s+['"]\.\/eeg-help-drawer\.js['"];?/, `from '${fileUrl(join(realDir, 'eeg-help-drawer.js'))}';`)
    .replace(/from\s+['"]\.\/raw-help-content\.js['"];?/, `from '${fileUrl(join(realDir, 'raw-help-content.js'))}';`)
    .replace(/from\s+['"]\.\/raw-keyboard-shortcuts\.js['"];?/, `from '${fileUrl(join(realDir, 'raw-keyboard-shortcuts.js'))}';`);
  const MODPATH = join(TMP, 'pages-qeeg-raw.js');
  writeFileSync(MODPATH, PATCHED);
  return MODPATH;
}

// Patch BEFORE we install the DOM polyfill, because installDom replaces the
// global URL constructor with a stub that fileURLToPath cannot consume.
const MODPATH = preparePatchedModule();
const SRC = readFileSync(fileURLToPath(new URL('./pages-qeeg-raw.js', import.meta.url)), 'utf8');
const { root, byId } = installDom();
const mod = await import(pathToFileURL(MODPATH).href);

// ── Tests ────────────────────────────────────────────────────────────────────

test('_initState exposes the four named slices', () => {
  // Reset to start from a known shape.
  if (typeof mod._resetStateForTest === 'function') mod._resetStateForTest();
  else { delete globalThis.window._qeegRawState; }
  const s = mod._initState();
  assert.ok(s.display && typeof s.display === 'object', 'display slice present');
  assert.ok(s.processing && typeof s.processing === 'object', 'processing slice present');
  assert.ok(s.ai && typeof s.ai === 'object', 'ai slice present');
  assert.ok(s.ui && typeof s.ui === 'object', 'ui slice present');
});

test('display slice has the expected fields', () => {
  const s = mod._initState();
  assert.equal(s.display.montage, 'referential');
  assert.equal(typeof s.display.tStart, 'number');
  assert.equal(typeof s.display.windowSec, 'number');
  assert.equal(typeof s.display.sensitivity, 'number');
  assert.equal(s.display.view, 'raw');
  assert.equal(s.display.channelOrdering, '10-20');
  assert.ok(s.display.regionTogglesByRegion && typeof s.display.regionTogglesByRegion === 'object');
});

test('processing slice has the expected fields and Phase-2 ICA defaults', () => {
  const s = mod._initState();
  assert.ok(Array.isArray(s.processing.badChannels));
  assert.ok(Array.isArray(s.processing.badSegments));
  assert.ok(Array.isArray(s.processing.excludedICA));
  assert.ok(Array.isArray(s.processing.includedICA));
  assert.ok(s.processing.filterParams && typeof s.processing.filterParams === 'object');
  assert.equal(s.processing.icaMethod, 'picard');
  assert.equal(s.processing.icaSeed, 42);
});

test('ai slice reserves Phase-5 fields without populating them', () => {
  const s = mod._initState();
  assert.equal(s.ai.qualityScore, null);
  assert.equal(s.ai.qualityNarrative, null);
  assert.deepEqual(s.ai.suggestions, []);
  assert.equal(s.ai.lastAutoCleanRunId, null);
  assert.equal(s.ai.suggestionsLoading, false);
});

test('ui slice has interaction + tool-instances populated', () => {
  const s = mod._initState();
  assert.equal(s.ui.interactionMode, 'select');
  assert.equal(s.ui.spectralVisible, false);
  assert.ok(s.ui.eventEditor, 'eventEditor present');
  assert.ok(s.ui.measurementTool, 'measurementTool present');
  assert.ok(s.ui.undoManager, 'undoManager present');
});

test('legacy flat shim: setting state.montage updates state.display.montage', () => {
  if (typeof mod._resetStateForTest === 'function') mod._resetStateForTest();
  else { delete globalThis.window._qeegRawState; }
  const s = mod._initState();
  s.montage = 'average';
  assert.equal(s.display.montage, 'average', 'flat write reflects in slice');
  assert.equal(s.montage, 'average', 'flat read reflects in slice');
  // The other direction: write through the slice, read via flat.
  s.display.montage = 'laplacian';
  assert.equal(s.montage, 'laplacian');
});

test('legacy flat shim: processing + ui slice forwarding', () => {
  if (typeof mod._resetStateForTest === 'function') mod._resetStateForTest();
  else { delete globalThis.window._qeegRawState; }
  const s = mod._initState();
  s.badChannels.push('Cz');
  assert.deepEqual(s.processing.badChannels, ['Cz']);
  s.spectralVisible = true;
  assert.equal(s.ui.spectralVisible, true);
  s.filterParams = { lff: 0.5, hff: 30, notch: 60 };
  assert.equal(s.processing.filterParams.notch, 60);
});

test('flat legacy map covers every flat key', () => {
  const map = mod._flatLegacyMap();
  // Spot-check the contract: every entry maps to a 2-tuple [slice, key].
  Object.keys(map).forEach((flat) => {
    const path = map[flat];
    assert.ok(Array.isArray(path) && path.length === 2, `path for ${flat}`);
    assert.ok(['display', 'processing', 'ai', 'ui'].includes(path[0]),
      `${flat} maps to a known slice`);
  });
});

test('source toolbar carries the four named clusters via data-group', () => {
  assert.match(SRC, /data-group="display"/);
  assert.match(SRC, /data-group="filters"/);
  assert.match(SRC, /data-group="artifacts"/);
  assert.match(SRC, /data-group="tools"/);
  // Every group has its uppercase label. Phase 7 appends a `?` help-icon
  // template after each label, so allow optional trailing whitespace + concat.
  assert.match(SRC, /toolbar-group-label">Display(?:'|\s|<|\+)/);
  assert.match(SRC, /toolbar-group-label">Filters(?:'|\s|<|\+)/);
  assert.match(SRC, /toolbar-group-label">Artifacts(?:'|\s|<|\+)/);
  assert.match(SRC, /toolbar-group-label">Tools(?:'|\s|<|\+)/);
  // Visible vertical dividers between groups.
  assert.ok((SRC.match(/toolbar-group-divider/g) || []).length >= 3,
    'at least three dividers between four groups');
});

test('source artifacts group exposes the four required buttons', () => {
  assert.match(SRC, /id="eeg-artifacts-autoscan-btn"/);
  assert.match(SRC, /id="eeg-artifacts-templates-btn"/);
  assert.match(SRC, /id="eeg-artifacts-decomp-btn"/);
  assert.match(SRC, /id="eeg-artifacts-spikes-btn"/);
});

test('source channel ordering dropdown carries the five required options', () => {
  // Display group dropdown.
  assert.match(SRC, /id="eeg-chord-sel"/);
  ['10-20', '10-10', 'alphabetical', 'anatomical', 'custom'].forEach((opt) => {
    assert.ok(SRC.includes(`value="${opt}"`),
      `channel ordering dropdown contains option ${opt}`);
  });
});

test('source filters group exposes the band preset dropdown', () => {
  assert.match(SRC, /id="eeg-band-preset-sel"/);
  // Phase 3: built-in bands live in the _BUILTIN_BANDS table referenced by
  // _renderBandPresetOptions; the literal option markup is now dynamic.
  ['broadband', 'delta', 'theta', 'alpha', 'beta', 'gamma'].forEach((opt) => {
    const inValue = SRC.includes(`value="${opt}"`);
    const inBuiltin = SRC.includes(`id: '${opt}'`);
    assert.ok(inValue || inBuiltin, `band preset registry contains ${opt}`);
  });
});

test('quality scorecard shell renders into the page DOM', async () => {
  // Render the tab into a fake host element and inspect its innerHTML.
  const host = new FakeElement('div'); host.id = 'host';
  byId['host'] = host;
  await mod.renderRawDataTab(host, 'demo', 'patient-1');
  assert.match(host.innerHTML, /id="quality-scorecard"/);
  assert.match(host.innerHTML, /id="quality-score-big"/);
  assert.match(host.innerHTML, /id="quality-narrative"/);
  // All five subscore rows.
  ['impedance', 'line_noise', 'blink_density', 'motion', 'channel_agreement'].forEach((m) => {
    assert.ok(host.innerHTML.includes(`data-metric="${m}"`),
      `scorecard exposes metric row ${m}`);
  });
});

test('_computeDeterministicQuality returns the expected shape', () => {
  if (typeof mod._resetStateForTest === 'function') mod._resetStateForTest();
  else { delete globalThis.window._qeegRawState; }
  const s = mod._initState();
  const q = mod._computeDeterministicQuality(s);
  assert.ok(q && typeof q === 'object');
  assert.ok('score' in q, 'has score');
  assert.ok('subscores' in q, 'has subscores');
  assert.ok('narrative' in q, 'has narrative');
  ['line_noise', 'blink_density', 'channel_agreement', 'motion', 'impedance'].forEach((k) => {
    assert.ok(k in q.subscores, `subscores has ${k}`);
  });
  assert.equal(typeof q.narrative, 'string');
});

test('_computeDeterministicQuality scores a synthetic signal window', () => {
  if (typeof mod._resetStateForTest === 'function') mod._resetStateForTest();
  else { delete globalThis.window._qeegRawState; }
  const s = mod._initState();
  // Build a mini snapshot: 4 channels, 256 samples @ 256 Hz = 1s window.
  const sfreq = 256;
  const N = 256;
  const data = [];
  for (let ch = 0; ch < 4; ch++) {
    const row = new Array(N);
    for (let i = 0; i < N; i++) {
      row[i] = Math.sin(2 * Math.PI * 10 * i / sfreq) + 0.05 * Math.random();
    }
    data.push(row);
  }
  s.processing._lastSignal = { channels: ['Fp1','Fp2','Cz','Oz'], data, sfreq, tStart: 0 };
  const q = mod._computeDeterministicQuality(s);
  assert.notEqual(q.subscores.line_noise, '--', 'line noise computed');
  assert.notEqual(q.subscores.channel_agreement, '--', 'channel agreement computed');
  assert.equal(q.subscores.motion, '--', 'motion still placeholder until Phase 5');
  assert.equal(q.subscores.impedance, '--', 'impedance still placeholder until Phase 5');
  assert.equal(typeof q.score, 'number');
  assert.ok(q.score >= 0 && q.score <= 100, 'composite score in [0,100]');
});

test('renderRawDataTab keeps the Decomposition button + Spectral toggle wired', async () => {
  const host = new FakeElement('div'); host.id = 'host2';
  byId['host2'] = host;
  await mod.renderRawDataTab(host, 'demo', 'patient-1');
  assert.match(host.innerHTML, /id="eeg-artifacts-decomp-btn"/);
  assert.match(host.innerHTML, /id="eeg-spectral-toggle"/);
  // Save / Reprocess / Undo / Redo retained.
  assert.match(host.innerHTML, /id="eeg-save-btn"/);
  assert.match(host.innerHTML, /id="eeg-reprocess-btn"/);
  assert.match(host.innerHTML, /id="eeg-undo-btn"/);
  assert.match(host.innerHTML, /id="eeg-redo-btn"/);
});
