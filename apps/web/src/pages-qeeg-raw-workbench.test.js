// ─────────────────────────────────────────────────────────────────────────────
// pages-qeeg-raw-workbench.test.js
//
// Smoke + render tests for the full-page Raw EEG Cleaning Workbench in
// clinical (WinEEG / EDFbrowser) visual mode: white background, black
// traces, light grid. Uses node:test with a hand-rolled DOM polyfill so the
// page module can run outside a browser.
//
// Run: npm run test:unit
// ─────────────────────────────────────────────────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const WORKBENCH_PATH = fileURLToPath(new URL('./pages-qeeg-raw-workbench.js', import.meta.url));

class FakeClassList {
  constructor(host) { this._set = new Set(); this._host = host; }
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
    this.tagName = (tag || 'div').toUpperCase();
    this.children = [];
    this.parentElement = null;
    this.style = {};
    this.classList = new FakeClassList(this);
    this.dataset = {};
    this._innerHTML = '';
    this._listeners = {};
    this.attributes = {};
    this.id = '';
    this._textContent = '';
  }
  set innerHTML(v) { this._innerHTML = String(v); }
  get innerHTML() { return this._innerHTML; }
  set outerHTML(v) { this._outer = String(v); }
  get outerHTML() { return this._outer || ''; }
  set textContent(v) { this._textContent = String(v); }
  get textContent() { return this._textContent; }
  setAttribute(k, v) { this.attributes[k] = v; }
  getAttribute(k) { return this.attributes[k]; }
  appendChild(c) { this.children.push(c); c.parentElement = this; return c; }
  insertBefore(c) { this.children.unshift(c); c.parentElement = this; return c; }
  replaceChild(neu, _old) { neu.parentElement = this; return neu; }
  addEventListener(name, fn) { (this._listeners[name] ||= []).push(fn); }
  removeEventListener() {}
  dispatchEvent() {}
  querySelector() { return null; }
  querySelectorAll() { return []; }
  closest() { return null; }
  get firstElementChild() { return this.children[0] || null; }
  get clientWidth() { return 1280; }
  get clientHeight() { return 720; }
  getContext() {
    return {
      setTransform() {}, fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {},
      stroke() {}, fillText() {}, fill() {},
      set fillStyle(_v) {}, get fillStyle() { return ''; },
      set strokeStyle(_v) {}, get strokeStyle() { return ''; },
      set lineWidth(_v) {}, get lineWidth() { return 1; },
      set font(_v) {}, get font() { return ''; },
    };
  }
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
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: (tag) => new FakeElement(tag),
    addEventListener: () => {},
    body: root,
  };
  globalThis.window = Object.assign(globalThis.window || {}, {
    location: { hash: '#/qeeg-raw-workbench/demo', href: 'http://test/#/qeeg-raw-workbench/demo' },
    addEventListener: () => {},
    removeEventListener: () => {},
    devicePixelRatio: 1,
    _isDemoMode: () => true,
    _qeegSelectedId: 'demo',
    _nav: () => {},
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
await mod.pgQEEGRawWorkbench(() => {}, () => {});
const WORKBENCH_SRC = readFileSync(WORKBENCH_PATH, 'utf8');

// ── Shell + clinical visual contract ─────────────────────────────────────────

await test('workbench shell renders root container with clinical class', () => {
  const html = root.innerHTML;
  assert.ok(html.includes('class="qwb-root qwb-clinical"'), 'qwb-clinical class present');
  assert.ok(html.includes('data-testid="qwb-root"'), 'root testid present');
});

await test('clinical CSS uses paper-tone background and indigo selected row', () => {
  const html = root.innerHTML;
  assert.ok(html.includes('background:#FAF7F2'), 'paper-tone background CSS');
  assert.ok(html.includes('#d8e1f3'), 'pale indigo selected row');
  assert.ok(!html.includes('#0f1115'), 'no dark background colour leaks through');
  assert.ok(html.includes('.qwb-canvas-el'), 'clinical canvas class block');
});

await test('paper-tone redesign exposes patient chip, clock, and AI-watching pulse', () => {
  const html = root.innerHTML;
  assert.ok(html.includes('data-testid="qwb-pat-chip"'), 'patient chip in title bar');
  assert.ok(html.includes('data-testid="qwb-titlebar-time"'), 'live clock in title bar');
  assert.ok(html.includes('data-testid="qwb-ai-watching"'), 'AI-watching pulse in status bar');
  assert.ok(html.includes('AI watching'), 'AI watching label rendered');
  assert.ok(html.includes('DeepSynaps'), 'brand label in title cluster');
  assert.ok(html.includes('data-testid="qwb-view-toggle"'), '4-button view-mode toggle');
  assert.ok(html.includes('data-testid="qwb-minimap"'), 'mini-map row');
  assert.ok(html.includes('data-testid="qwb-topo-strip"'), 'topomap strip');
});

// ── Top toolbar + back navigation ────────────────────────────────────────────

await test('top toolbar exposes all required controls', () => {
  const html = root.innerHTML;
  // numeric inputs + selects (view is a 4-button toggle, not a select)
  for (const id of ['qwb-speed','qwb-gain','qwb-baseline','qwb-lowcut','qwb-highcut','qwb-notch','qwb-montage','qwb-timebase']) {
    assert.ok(html.includes('id="' + id + '"'), 'toolbar control: ' + id);
  }
  // Transport controls
  for (const tid of ['qwb-prev-window','qwb-play','qwb-next-window']) {
    assert.ok(html.includes('data-testid="' + tid + '"'), 'transport: ' + tid);
  }
});

await test('top toolbar exposes both back-navigation buttons', () => {
  const html = root.innerHTML;
  assert.ok(html.includes('data-testid="qwb-back-analyzer"'), 'back-to-analyzer button');
  assert.ok(html.includes('← Back to qEEG Analyzer'), 'back-to-analyzer label');
  assert.ok(html.includes('data-testid="qwb-back-patient"'), 'back-to-patient button');
});

await test('top toolbar exposes next-step buttons', () => {
  const html = root.innerHTML;
  for (const tid of ['qwb-save','qwb-rerun','qwb-return-report','qwb-export']) {
    assert.ok(html.includes('data-testid="' + tid + '"'), 'next-step: ' + tid);
  }
  assert.ok(html.includes('Save Cleaning Version'), 'save label');
  assert.ok(html.includes('Re-run qEEG'), 'rerun label');
  assert.ok(html.includes('Return to Report'), 'return-report label');
  assert.ok(html.includes('id="qwb-compare"'), 'raw-vs-cleaned button');
  assert.ok(html.includes('data-testid="qwb-export-modal"'), 'export modal present');
});

// ── Channel rail (clinical look) ─────────────────────────────────────────────

await test('channel rail renders the 19-channel 10-20 montage (no ECG)', () => {
  const html = root.innerHTML;
  assert.ok(html.includes('data-testid="qwb-rail"'), 'rail testid');
  for (const ch of ['Fp1-Av','Fp2-Av','F7-Av','Cz-Av','T3-Av','Pz-Av','O1-Av','O2-Av']) {
    assert.ok(html.includes(ch), 'channel: ' + ch);
  }
  assert.ok(!html.includes('>ECG<') && !html.includes('"ECG"'), 'ECG not in rail (matches design source data.jsx)');
  assert.ok(html.includes('CH (19)'), '19-channel header');
});

// ── Right panel: tabs + collapsible ─────────────────────────────────────────

await test('right panel exposes all six tabs and collapse toggle', () => {
  const html = root.innerHTML;
  for (const tab of ['Cleaning','AI Review','Best-Practice','Examples','ICA','Audit']) {
    assert.ok(html.includes(tab), 'tab: ' + tab);
  }
  assert.ok(html.includes('data-testid="qwb-right-toggle"'), 'collapsible toggle present');
});

await test('cleaning tools panel renders all four sections', () => {
  const body = document.getElementById('qwb-right-body');
  const html = (body && body.innerHTML) || '';
  for (const action of ['Mark bad segment','Mark bad channel','Reject epoch','Interpolate','Add annotation']) {
    assert.ok(html.includes(action), 'manual action: ' + action);
  }
  for (const action of ['Detect flat','Detect noisy','Detect blinks','Detect muscle','Detect movement','Detect line noise']) {
    assert.ok(html.includes(action), 'auto detection: ' + action);
  }
  assert.ok(html.includes('Open ICA review'), 'ICA review entry');
  assert.ok(html.includes('Save Cleaning Version'), 'save reprocess button');
  assert.ok(html.includes('Re-run qEEG analysis'), 'rerun reprocess button');
  assert.ok(html.includes('Return to Report'), 'return-to-report button in panel');
  assert.ok(html.includes('Decision-support only'), 'safety footer');
});

// ── Source-level checks for tabs that only render after a click ─────────────

await test('AI Assistant panel shows safety wording in source', async () => {
  assert.ok(WORKBENCH_SRC.includes('AI Review Queue'), 'AI tab heading present in source');
  assert.ok(WORKBENCH_SRC.includes('AI-assisted suggestion only'), 'AI safety banner present');
  assert.ok(WORKBENCH_SRC.includes('Clinician confirmation required'), 'AI confirmation requirement present');
});

await test('Examples panel covers all canonical artefact archetypes', async () => {
  for (const ex of [
    'Posterior alpha','Eye blink','Muscle artefact','Line noise','Flat channel',
    'Electrode pop','Movement artefact','ECG contamination','Poor recording',
  ]) {
    assert.ok(WORKBENCH_SRC.includes(ex), 'example: ' + ex);
  }
});

await test('Audit panel labels are present in source', async () => {
  assert.ok(WORKBENCH_SRC.includes('Cleaning Audit Trail'), 'audit heading');
});

await test('Best-Practice panel covers required topics', async () => {
  for (const topic of ['Bad channel detection','Eye blink','Line noise','When NOT to over-clean','Preserve original raw EEG']) {
    assert.ok(WORKBENCH_SRC.includes(topic), 'best-practice topic: ' + topic);
  }
});

// ── Canvas, status bar, immutable notice ─────────────────────────────────────

await test('canvas wrapper present for trace rendering', () => {
  const html = root.innerHTML;
  assert.ok(html.includes('id="qwb-canvas"'), 'canvas element');
  assert.ok(html.includes('id="qwb-canvas-wrap"'), 'canvas wrapper');
});

await test('bottom status bar renders all required fields including amp + dirty marker', () => {
  const html = root.innerHTML;
  for (const id of ['qwb-st-time','qwb-st-window','qwb-st-sel','qwb-st-amp','qwb-st-bad','qwb-st-rej','qwb-st-retain','qwb-st-version','qwb-st-save']) {
    assert.ok(html.includes('id="' + id + '"'), 'status field: ' + id);
  }
  assert.ok(html.includes('data-testid="qwb-status"'), 'status bar testid');
});

await test('immutable raw EEG notice is in the canvas overlay', () => {
  const html = root.innerHTML;
  assert.ok(html.includes('id="qwb-immutable-banner"'), 'banner element');
  assert.ok(html.includes('Original raw EEG preserved'), 'banner text');
});

await test('keyboard shortcuts modal is wired with new shortcuts', async () => {
  const html = root.innerHTML;
  assert.ok(html.includes('data-testid="qwb-shortcuts-modal"'), 'shortcuts modal');
  assert.ok(html.includes('Keyboard shortcuts'), 'shortcuts heading');
  assert.ok(WORKBENCH_SRC.includes("'Cmd/Ctrl+S'"), 'Cmd/Ctrl+S shortcut listed');
  assert.ok(WORKBENCH_SRC.includes("'Esc'"), 'Esc shortcut listed');
});

// ── Unsaved-edit modal contract ─────────────────────────────────────────────

await test('unsaved-edits modal is in the DOM with clinical wording', () => {
  const html = root.innerHTML;
  assert.ok(html.includes('data-testid="qwb-unsaved-modal"'), 'unsaved modal');
  assert.ok(html.includes('You have unsaved EEG cleaning edits'), 'unsaved warning text');
  for (const tid of ['qwb-unsaved-cancel','qwb-unsaved-leave','qwb-unsaved-save']) {
    assert.ok(html.includes('data-testid="' + tid + '"'), 'unsaved button: ' + tid);
  }
  assert.ok(html.includes('Save and leave'), 'save-and-leave label');
  assert.ok(html.includes('Leave without saving'), 'leave-without-saving label');
});

// ── Module exports ───────────────────────────────────────────────────────────

await test('exported entrypoint and helpers match router registration', () => {
  assert.equal(typeof mod.pgQEEGRawWorkbench, 'function');
  assert.ok(Array.isArray(mod.DEFAULT_CHANNELS) && mod.DEFAULT_CHANNELS.length === 19);
  assert.equal(typeof mod.navBack, 'function');
});

// ── Source-level safety guarantees ──────────────────────────────────────────

await test('source registers beforeunload guard for unsaved edits', async () => {
  assert.ok(WORKBENCH_SRC.includes("addEventListener('beforeunload'"), 'beforeunload guard registered');
  assert.ok(WORKBENCH_SRC.includes('isDirty'), 'isDirty flag tracked');
  assert.ok(WORKBENCH_SRC.includes('markDirty'), 'markDirty helper');
});

await test('source wires Cmd/Ctrl+S to saveCleaningVersion', async () => {
  assert.ok(/(metaKey|ctrlKey)[\s\S]+saveCleaningVersion/.test(WORKBENCH_SRC), 'Cmd/Ctrl+S handler binds to save');
});

await test('source wires Esc key to navBack', async () => {
  assert.ok(/'Escape'[\s\S]+navBack/.test(WORKBENCH_SRC), 'Esc handler routes to navBack');
});

await test('source has post-rerun confirmation copy mentioning preserved raw EEG', async () => {
  assert.ok(/qEEG analysis (re-run )?(updated|queued) using Cleaning Version/.test(WORKBENCH_SRC), 'post-rerun toast copy');
  assert.ok(WORKBENCH_SRC.includes('Original raw EEG preserved'), 'raw preserved phrase in rerun toast');
});

// ── Runtime behaviour: navBack opens unsaved modal when dirty ───────────────

await test('navBack opens unsaved modal when state.isDirty is true', () => {
  const state = { isDirty: true, pendingNav: null };
  const modal = document.getElementById('qwb-unsaved-modal');
  modal.style.display = 'none';
  const ok = mod.navBack(state, () => {}, 'analyzer');
  assert.equal(ok, false, 'navBack returns false when dirty');
  assert.equal(modal.style.display, 'flex', 'unsaved modal shown');
  assert.equal(typeof state.pendingNav, 'function', 'pendingNav captured for resume');
});

await test('navBack is a no-op-on-dirty path that does not call window._nav', () => {
  let navCalled = false;
  window._nav = () => { navCalled = true; };
  const state = { isDirty: true, pendingNav: null };
  mod.navBack(state, () => {}, 'analyzer');
  assert.equal(navCalled, false, 'window._nav not called while dirty');
});
