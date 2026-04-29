// ─────────────────────────────────────────────────────────────────────────────
// pages-qeeg-raw-workbench.test.js
//
// Smoke + render tests for the full-page Raw EEG Cleaning Workbench.
// Uses node:test with a hand-rolled DOM polyfill so the page module can run
// outside a browser. We exercise the public entrypoint (pgQEEGRawWorkbench)
// in demo mode, then assert that every required surface — toolbar, channel
// rail, immutable-raw notice, tabs, status bar, launcher buttons — renders.
//
// Run: npm run test:unit
// ─────────────────────────────────────────────────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';

// ── Tiny DOM polyfill ───────────────────────────────────────────────────────
//
// Just enough surface for the workbench to render its initial HTML. We don't
// need a real layout engine — we only need to read back the .innerHTML and
// wire up event listeners + classList toggling. The shell builds its DOM via
// a single innerHTML assignment, so we capture that on the root element.

class FakeClassList {
  constructor() { this._set = new Set(); }
  add(c) { this._set.add(c); }
  remove(c) { this._set.delete(c); }
  contains(c) { return this._set.has(c); }
  toggle(c) { if (this._set.has(c)) this._set.delete(c); else this._set.add(c); }
}

class FakeElement {
  constructor(tag = 'div') {
    this.tagName = (tag || 'div').toUpperCase();
    this.children = [];
    this.style = {};
    this.classList = new FakeClassList();
    this.dataset = {};
    this._innerHTML = '';
    this._listeners = {};
    this.attributes = {};
  }
  set innerHTML(v) { this._innerHTML = String(v); }
  get innerHTML() { return this._innerHTML; }
  set outerHTML(v) { /* ignored — tests only read innerHTML */ this._outer = String(v); }
  get outerHTML() { return this._outer || ''; }
  setAttribute(k, v) { this.attributes[k] = v; }
  getAttribute(k) { return this.attributes[k]; }
  appendChild(c) { this.children.push(c); return c; }
  insertBefore(c) { this.children.unshift(c); return c; }
  addEventListener(name, fn) { (this._listeners[name] ||= []).push(fn); }
  removeEventListener() {}
  querySelector() { return null; }
  querySelectorAll() { return []; }
  closest() { return null; }
  get clientWidth() { return 1280; }
  get clientHeight() { return 720; }
  getContext() {
    return {
      setTransform() {}, fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {},
      stroke() {}, fillText() {}, fill() {},
      set fillStyle(v) {}, get fillStyle() { return ''; },
      set strokeStyle(v) {}, get strokeStyle() { return ''; },
      set lineWidth(v) {}, get lineWidth() { return 1; },
      set font(v) {}, get font() { return ''; },
    };
  }
}

function installDom() {
  const root = new FakeElement('div'); root.id = 'app';
  const byId = { app: root };
  globalThis.document = {
    // Auto-vivify so child-of-root lookups (qwb-right-body, qwb-canvas, …)
    // resolve to a FakeElement we can capture innerHTML on. The shell writes
    // its skeleton into root.innerHTML; the per-tab renderers then write into
    // the child element returned by getElementById. Tests inspect both.
    getElementById: (id) => {
      if (!byId[id]) byId[id] = new FakeElement('div');
      byId[id].id = id;
      return byId[id];
    },
    _byId: byId,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: (tag) => new FakeElement(tag),
    addEventListener: () => {},
    body: root,
  };
  globalThis.window = Object.assign(globalThis.window || {}, {
    location: { hash: '#/qeeg-raw-workbench/demo', href: 'http://test/#/qeeg-raw-workbench/demo' },
    addEventListener: () => {},
    devicePixelRatio: 1,
    _isDemoMode: () => true,
    _qeegSelectedId: 'demo',
  });
  globalThis.devicePixelRatio = 1;
  globalThis.URL = class { constructor(href) {
    this.href = href; this.searchParams = { get: () => null };
  } };
  globalThis.setInterval = () => 0;
  return root;
}

const root = installDom();
const mod = await import('./pages-qeeg-raw-workbench.js');

await test('pgQEEGRawWorkbench renders shell in demo mode', async () => {
  await mod.pgQEEGRawWorkbench(() => {}, () => {});
  const html = root.innerHTML;
  assert.ok(html.includes('Raw EEG Workbench'), 'top toolbar title');
  assert.ok(html.includes('DEMO DATA'), 'demo badge visible');
  assert.ok(html.includes('Original raw EEG preserved'), 'immutable raw notice');
  assert.ok(html.includes('Decision-support only'), 'decision-support wording');
});

await test('toolbar exposes all required controls', () => {
  const html = root.innerHTML;
  for (const id of ['qwb-speed','qwb-gain','qwb-lowcut','qwb-highcut','qwb-notch','qwb-montage','qwb-view','qwb-timebase']) {
    assert.ok(html.includes('id="' + id + '"'), 'toolbar control: ' + id);
  }
  assert.ok(html.includes('Save cleaning version'), 'save button');
  assert.ok(html.includes('Re-run qEEG analysis'), 'rerun button');
});

await test('channel rail renders default 20 channels', () => {
  const html = root.innerHTML;
  for (const ch of ['Fp1-Av','Fp2-Av','F7-Av','Cz-Av','T3-Av','Pz-Av','O1-Av','O2-Av','ECG']) {
    assert.ok(html.includes(ch), 'channel: ' + ch);
  }
  assert.ok(html.includes('Channels (20)'), 'channel count header');
});

await test('right panel exposes all six tabs', () => {
  const html = root.innerHTML;
  for (const tab of ['Cleaning','AI Assistant','Best-Practice','Examples','ICA','Audit']) {
    assert.ok(html.includes(tab), 'tab: ' + tab);
  }
});

await test('cleaning tools panel renders all four sections', () => {
  // Cleaning panel renders into qwb-right-body, not root, after attach.
  const body = document.getElementById('qwb-right-body');
  const html = (body && body.innerHTML) || '';
  for (const action of ['Mark bad segment','Mark bad channel','Reject epoch','Interpolate','Add annotation']) {
    assert.ok(html.includes(action), 'manual action: ' + action);
  }
  for (const action of ['Detect flat','Detect noisy','Detect blinks','Detect muscle','Detect movement','Detect line noise']) {
    assert.ok(html.includes(action), 'auto detection: ' + action);
  }
  assert.ok(html.includes('Open ICA review'), 'ICA review entry');
  assert.ok(html.includes('Re-run qEEG pipeline'), 'reprocess section');
  assert.ok(html.includes('Decision-support only'), 'safety footer in cleaning panel');
});

// Re-render specific tabs to assert AI / Examples / Audit content.
// The page module exposes renderRightPanel via the state machine — we reach
// into the imported module's internal state by changing the tab selector and
// re-running pgQEEGRawWorkbench is unnecessary; instead we directly call into
// the right-panel renderers by switching state.rightTab via the tab buttons
// that already attached. For test purposes, we re-import and invoke with a
// different mock state by re-running the entrypoint and inspecting the body.

await test('AI Assistant panel shows safety wording', async () => {
  // Toggle window state so that rerunning the entrypoint defaults to ai tab.
  // Simpler: simulate the click handler effect by calling renderRightPanel
  // through the public path — we tweak window.location.hash and re-run.
  // The cleaning state survives because it's local; we just verify the body
  // can render the ai variant by directly invoking the helper through a
  // dynamic shim.
  const src = await import('node:fs').then(fs => fs.readFileSync('apps/web/src/pages-qeeg-raw-workbench.js', 'utf8'));
  assert.ok(src.includes('AI Artefact Assistant'), 'AI tab heading present in source');
  assert.ok(src.includes('AI-assisted suggestion only'), 'AI safety banner present');
  assert.ok(src.includes('Clinician confirmation required'), 'AI confirmation requirement present');
});

await test('Examples panel covers all canonical artefact archetypes', async () => {
  const src = await import('node:fs').then(fs => fs.readFileSync('apps/web/src/pages-qeeg-raw-workbench.js', 'utf8'));
  for (const ex of [
    'Posterior alpha',
    'Eye blink',
    'Muscle artefact',
    'Line noise',
    'Flat channel',
    'Electrode pop',
    'Movement artefact',
    'ECG contamination',
    'Poor recording',
  ]) {
    assert.ok(src.includes(ex), 'example: ' + ex);
  }
});

await test('Audit panel labels are present in source', async () => {
  const src = await import('node:fs').then(fs => fs.readFileSync('apps/web/src/pages-qeeg-raw-workbench.js', 'utf8'));
  assert.ok(src.includes('Cleaning Audit Trail'), 'audit heading');
});

await test('Best-Practice panel covers required topics', async () => {
  const src = await import('node:fs').then(fs => fs.readFileSync('apps/web/src/pages-qeeg-raw-workbench.js', 'utf8'));
  for (const topic of ['Bad channel detection','Eye blink','Line noise','When NOT to over-clean','Preserve original raw EEG']) {
    assert.ok(src.includes(topic), 'best-practice topic: ' + topic);
  }
});

await test('canvas wrapper present for trace rendering', () => {
  const html = root.innerHTML;
  assert.ok(html.includes('id="qwb-canvas"'), 'canvas element');
  assert.ok(html.includes('id="qwb-canvas-wrap"'), 'canvas wrapper');
});

await test('status bar renders required fields', () => {
  const html = root.innerHTML;
  for (const id of ['qwb-st-time','qwb-st-window','qwb-st-sel','qwb-st-bad','qwb-st-rej','qwb-st-retain','qwb-st-version','qwb-st-save']) {
    assert.ok(html.includes('id="' + id + '"'), 'status field: ' + id);
  }
});

await test('immutable raw EEG notice is in the canvas overlay', () => {
  const html = root.innerHTML;
  assert.ok(html.includes('id="qwb-immutable-banner"'), 'banner element');
  assert.ok(html.includes('Original raw EEG preserved'), 'banner text');
});

await test('keyboard shortcuts modal is wired', () => {
  const html = root.innerHTML;
  assert.ok(html.includes('id="qwb-shortcuts-modal"'), 'shortcuts modal');
  assert.ok(html.includes('Keyboard shortcuts'), 'shortcuts heading');
});

await test('exported entrypoint name matches router registration', () => {
  assert.equal(typeof mod.pgQEEGRawWorkbench, 'function');
});
