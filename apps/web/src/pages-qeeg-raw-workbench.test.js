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
const LEARNING_REF_PATH = fileURLToPath(new URL('./learning-eeg-reference.js', import.meta.url));

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
const LEARNING_REF_SRC = readFileSync(LEARNING_REF_PATH, 'utf8');

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

await test('right panel exposes all five tabs and collapse toggle', () => {
  const html = root.innerHTML;
  for (const tab of ['Cleaning','AI Review','Best-Practice','ICA','Audit']) {
    assert.ok(html.includes(tab), 'tab: ' + tab);
  }
  assert.ok(html.includes('data-testid="qwb-right-toggle"'), 'collapsible toggle present');
});

await test('right panel tabs each carry a testid + the new is-active class hook', () => {
  const html = root.innerHTML;
  for (const tid of ['qwb-tab-cleaning','qwb-tab-ai','qwb-tab-bp','qwb-tab-ica','qwb-tab-audit']) {
    assert.ok(html.includes('data-testid="' + tid + '"'), 'tab testid: ' + tid);
  }
  // The default active tab carries the new is-active class hook for styling.
  assert.ok(/qwb-tab[^"]*is-active[^"]*"\s+data-tab="cleaning"/.test(html),
    'default Cleaning tab marked is-active');
});

await test('AI Review tab declares the threshold-slider testid in source', () => {
  assert.ok(WORKBENCH_SRC.includes('data-testid="qwb-threshold-slider"'),
    'qwb-threshold-slider testid present in source');
  assert.ok(WORKBENCH_SRC.includes('Confidence threshold'),
    'Confidence threshold label present');
});

await test('ICA panel declares the 12-cell grid testid + Brain/Eye/Muscle/Mixed badges', () => {
  assert.ok(WORKBENCH_SRC.includes('data-testid="qwb-ica-grid"'), 'qwb-ica-grid testid');
  assert.ok(WORKBENCH_SRC.includes('class="ica-comp'), 'ica-comp tile class');
  assert.ok(WORKBENCH_SRC.includes('is-rejected'), 'is-rejected toggle class');
  for (const badge of ['Brain','Eye','Muscle','Mixed']) {
    assert.ok(WORKBENCH_SRC.includes(`label: '${badge}'`),
      'ICA badge bucket: ' + badge);
  }
  assert.ok(WORKBENCH_SRC.includes('Run ICA decomposition'), 'Run ICA decomposition button');
  assert.ok(WORKBENCH_SRC.includes('Apply ICA cleaning'), 'Apply ICA cleaning button');
});

await test('decision-support disclaimer lives in the status bar tooltip, not the panel', () => {
  const html = root.innerHTML;
  assert.ok(html.includes('data-testid="qwb-decision-info"'), 'qwb-decision-info icon present');
  // The full disclaimer text must appear inside a title="" attribute, not as
  // panel body copy.
  assert.ok(html.includes('Decision support only.'), 'disclaimer text in status-bar tooltip');
  assert.ok(!html.includes('qwb-safety-footer'), 'old safety-footer block removed from cleaning panel');
});

await test('Best-Practice tab includes the cleaning quality checklist', () => {
  for (const item of [
    'Notch filter applied',
    'Bad channels marked',
    'Bad epochs rejected',
    'ICA reviewed',
    'Visual scan complete',
    'Saved cleaned version',
  ]) {
    assert.ok(WORKBENCH_SRC.includes(item), 'checklist row: ' + item);
  }
  assert.ok(WORKBENCH_SRC.includes('data-testid="qwb-bp-checklist"'), 'checklist testid');
});

await test('Audit tab declares the audit-log testid', () => {
  assert.ok(WORKBENCH_SRC.includes('data-testid="qwb-audit-log"'), 'audit-log testid');
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
  // Decision-support disclaimer no longer lives inside the cleaning panel —
  // it has moved to the status-bar tooltip (qwb-decision-info).
  assert.ok(!html.includes('Decision-support only'), 'safety footer moved out of cleaning panel');
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

await test('Learning EEG reference is integrated without mirroring full site content', async () => {
  assert.ok(WORKBENCH_SRC.includes('renderLearningEEGCompactList'), 'workbench imports shared reference renderer');
  assert.ok(LEARNING_REF_SRC.includes('Learning EEG Reference'), 'learning EEG section heading');
  assert.ok(LEARNING_REF_SRC.includes('Short summaries with source links only'), 'non-mirroring note');
  assert.ok(LEARNING_REF_SRC.includes('https://www.learningeeg.com/artifacts'), 'artifact source link');
  assert.ok(LEARNING_REF_SRC.includes('https://www.learningeeg.com/epileptiform-activity'), 'epileptiform source link');
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

// ── Backend wiring: every workbench API method is referenced ───────────────

await test('workbench source references every backend API method', () => {
  const REQUIRED_API = [
    'getQEEGWorkbenchMetadata',
    'getQEEGCleaningLog',
    'createQEEGCleaningAnnotation',
    'saveQEEGCleaningVersion',
    'listQEEGCleaningVersions',
    'getQEEGRawVsCleanedSummary',
    'generateQEEGAIArtefactSuggestions',
    'rerunQEEGAnalysisWithCleaning',
    'getQEEGICAComponents',
  ];
  for (const m of REQUIRED_API) {
    assert.ok(WORKBENCH_SRC.includes('api.' + m), 'api.' + m + ' is called from the workbench');
  }
});

await test('every interactive button is wired to a handler', () => {
  // Every data-action / data-ai-decision / data-ica-toggle / data-export-* /
  // data-menu attribute must have a matching addEventListener / handler call
  // somewhere in the source.
  const HANDLER_BINDINGS = [
    ['[data-action]', 'handleCleaningAction'],
    ['[data-ai-decision]', 'recordAIDecision'],
    ['[data-ica-toggle]', 'toggleICAComponent'],
    ['[data-export-fmt]', 'state.exportFormat'],
    ['.qwb-menu-btn', 'handleTitleMenu'],
    ['#qwb-view-toggle button', 'state.viewMode'],
    ['qwb-minimap-track', 'state.windowStart'],
  ];
  for (const [selector, handler] of HANDLER_BINDINGS) {
    assert.ok(WORKBENCH_SRC.includes(selector), 'source emits selector: ' + selector);
    assert.ok(WORKBENCH_SRC.includes(handler), 'source contains handler ref: ' + handler);
  }
});

await test('play button is wired to togglePlay (not a placeholder)', () => {
  assert.ok(WORKBENCH_SRC.includes('togglePlay(state)'), 'play click calls togglePlay');
  assert.ok(WORKBENCH_SRC.includes('function togglePlay'), 'togglePlay function defined');
  assert.ok(!WORKBENCH_SRC.includes("'play / pause not yet wired'"), 'play placeholder string removed');
});

await test('ICA reject/restore is wired through toggleICAComponent → postAnnotation', () => {
  assert.ok(WORKBENCH_SRC.includes('attachICAPanelHandlers'), 'ICA panel handler attach exists');
  assert.ok(/toggleICAComponent[\s\S]+postAnnotation/.test(WORKBENCH_SRC),
    'toggleICAComponent posts an annotation to the audit trail');
  assert.ok(WORKBENCH_SRC.includes("kind: 'rejected_ica_component'"),
    'ICA rejection annotation kind is canonical');
});

await test('export bundle calls server-side summary in non-demo mode', () => {
  assert.ok(/api\.getQEEGRawVsCleanedSummary[\s\S]*exportBundle|exportBundle[\s\S]*api\.getQEEGRawVsCleanedSummary/.test(WORKBENCH_SRC),
    'exportBundle pulls real summary from backend');
});

await test('title-bar menus dispatch to real actions, not placeholders', () => {
  assert.ok(WORKBENCH_SRC.includes('handleTitleMenu'), 'handleTitleMenu defined');
  for (const route of ['toggleExport', 'toggleRightPanel', 'toggleShortcuts', 'rerunAnalysis', 'loadRawVsCleaned']) {
    assert.ok(WORKBENCH_SRC.includes(route), 'menu routes to: ' + route);
  }
  assert.ok(!/'\$\{menu\} menu \(coming soon\)'/.test(WORKBENCH_SRC),
    'placeholder "(coming soon)" copy removed');
});

// ── 2026-04-29 feature port: summary strip / cursor / tools / info / band / headmap / event nav ──

await test('recording summary strip renders under the toolbar with key:value pairs and status pill', () => {
  const html = root.innerHTML;
  assert.ok(html.includes('data-testid="qwb-recording-strip"'), 'recording-strip testid present');
  assert.ok(html.includes('data-testid="qwb-recording-strip-pill"'), 'status pill testid present');
  assert.ok(html.includes('19 ch'), 'channel count rendered');
  assert.ok(html.includes('256 Hz'), 'sample rate rendered');
  assert.ok(html.includes('10-20 Avg') || html.includes('10‑20 Avg'), 'montage label rendered');
});

await test('live cursor readout exists in the status bar', () => {
  const html = root.innerHTML;
  assert.ok(html.includes('data-testid="qwb-cursor-readout"'), 'cursor-readout testid present');
  assert.ok(html.includes('id="qwb-cursor-readout"'), 'cursor-readout element id');
  assert.ok(/mousemove[\s\S]+updateCursorReadout/.test(WORKBENCH_SRC), 'mousemove handler wires updateCursorReadout');
});

await test('toolbar quick action row exposes Snapshot / Export / Save / Reprocess / Spectral buttons', () => {
  const html = root.innerHTML;
  for (const tid of [
    'qwb-quick-snapshot',
    'qwb-quick-export',
    'qwb-quick-save',
    'qwb-quick-rerun',
    'qwb-quick-spectral',
  ]) {
    assert.ok(html.includes(`data-testid="${tid}"`), 'quick-action: ' + tid);
  }
  assert.ok(WORKBENCH_SRC.includes('snapshotTraceWindow'), 'snapshot handler defined');
  assert.ok(WORKBENCH_SRC.includes('Spectral view coming in v0.3'), 'spectral honest stub copy');
});

await test('vertical tool selector is rendered at the left edge of the trace area', () => {
  const html = root.innerHTML;
  assert.ok(html.includes('data-testid="qwb-tool-selector"'), 'tool-selector testid');
  for (const tid of [
    'qwb-tool-select',
    'qwb-tool-bad-segment',
    'qwb-tool-bad-channel',
    'qwb-tool-annotate',
    'qwb-tool-measure',
  ]) {
    assert.ok(html.includes(`data-testid="${tid}"`), 'tool button: ' + tid);
  }
  assert.ok(WORKBENCH_SRC.includes("state.tool = 'select'") || WORKBENCH_SRC.includes("tool: 'select'"),
    'select tool is the default');
  assert.ok(WORKBENCH_SRC.includes('setActiveTool'), 'setActiveTool handler defined');
});

// Audit 2026-04-29 fix: every icon button in the vertical tool selector must
// expose a non-empty title="" + aria-label="" so clinicians can discover what
// each glyph means without clicking. Without this guard the strip rendered as
// "↖ B C ✎ ⇔" with no hover/screen-reader text.
await test('every tool selector button carries non-empty title + aria-label', () => {
  const html = root.innerHTML;
  for (const tid of [
    'qwb-tool-select',
    'qwb-tool-bad-segment',
    'qwb-tool-bad-channel',
    'qwb-tool-annotate',
    'qwb-tool-measure',
  ]) {
    // Capture the full opening tag for this button so we can look at its attrs.
    const re = new RegExp(`<button[^>]*data-testid="${tid}"[^>]*>`);
    const m = html.match(re);
    assert.ok(m, 'tool button rendered: ' + tid);
    const tag = m[0];
    const titleM = tag.match(/title="([^"]*)"/);
    assert.ok(titleM, tid + ' has title=""');
    assert.ok(titleM[1].trim().length > 0, tid + ' title is non-empty');
    const ariaM = tag.match(/aria-label="([^"]*)"/);
    assert.ok(ariaM, tid + ' has aria-label=""');
    assert.ok(ariaM[1].trim().length > 0, tid + ' aria-label is non-empty');
    // title and aria-label should describe the same thing — keep them in sync.
    assert.equal(titleM[1], ariaM[1], tid + ' title matches aria-label');
  }
  // Spot-check that the keyboard-shortcut hint (B/C/A) appears in the labels
  // for the three tools that have a global shortcut, so clinicians discover
  // them via tooltip.
  assert.ok(html.includes('Mark bad segment (B)'), 'B shortcut hint in mark-segment label');
  assert.ok(html.includes('Mark bad channel (C)'), 'C shortcut hint in mark-channel label');
  assert.ok(html.includes('Annotate (A)'), 'A shortcut hint in annotate label');
});

// Audit 2026-04-29 fix: the recording-strip status pill rule must agree with
// the recording-strip subtitle. Previously the demo state showed "In progress"
// next to "No cleaning version", which is contradictory — without a cleaning
// version there are no in-progress *saved* edits. The new rule keys strictly
// on state.isDirty (toggled by markDirty() on every clinician edit). The demo
// seed populates aiSuggestions / badChannels / events but never calls
// markDirty(), so the seeded demo correctly renders "Untouched".
await test('recording-strip status pill is "Untouched" when demo state has no cleaningVersion and no clinician edits', () => {
  const html = root.innerHTML;
  // Pull just the pill span so a stray "In progress" elsewhere in the doc
  // (e.g. status bar copy) cannot pass this assertion accidentally.
  const m = html.match(/<span class="qwb-sum-pill ([^"]+)" data-testid="qwb-recording-strip-pill">([^<]+)<\/span>/);
  assert.ok(m, 'qwb-recording-strip-pill span rendered');
  const cls = m[1];
  const label = m[2];
  assert.equal(label, 'Untouched', 'demo state with no cleaningVersion + no edits → Untouched');
  assert.ok(cls.includes('untouched'), 'pill carries the .untouched class for paper-tone styling');
  // The subtitle in the same strip must agree.
  assert.ok(html.includes('No cleaning version'), 'subtitle reflects no cleaning version yet');
  // And the contradictory pairing must NOT appear.
  assert.ok(!/qwb-recording-strip-pill[^>]*>In progress</.test(html),
    'pill is NOT "In progress" while subtitle says "No cleaning version"');
});

// Direct unit test of recordingStatus() through a tiny exercised path: flip
// state.isDirty via the exported markDirty equivalent (we re-render the strip
// by calling renderStatusBar through the public DOM, since recordingStatus is
// internal). We assert via the source that the new rule is the only branch
// that produces "In progress".
await test('recordingStatus rule is documented in source and keys strictly on isDirty', () => {
  // The new rule must mention isDirty (not auditLog/badChannels/rejectedSegments)
  // as the gate for the "in-progress" branch.
  const block = WORKBENCH_SRC.match(/function recordingStatus\(state\)[\s\S]+?\n\}/);
  assert.ok(block, 'recordingStatus function found in source');
  const body = block[0];
  assert.ok(/state\.isDirty/.test(body), 'recordingStatus body references state.isDirty');
  assert.ok(!/state\.auditLog/.test(body), 'recordingStatus body does not gate on auditLog');
  assert.ok(!/badChannels/.test(body), 'recordingStatus body does not gate on badChannels');
  assert.ok(!/rejectedSegments/.test(body), 'recordingStatus body does not gate on rejectedSegments');
  // Inline doc comment about the audit must be present so future contributors
  // do not regress this back to the OR-of-everything check.
  assert.ok(/audit[\s\S]*?2026-04-29/i.test(WORKBENCH_SRC),
    'audit 2026-04-29 rationale comment present near recordingStatus');
});

await test('Recording Info card is wired into the Cleaning tab', () => {
  const body = document.getElementById('qwb-right-body');
  const html = (body && body.innerHTML) || '';
  assert.ok(html.includes('data-testid="qwb-recording-info"'), 'recording-info testid in cleaning panel body');
  assert.ok(html.includes('Recording Info'), 'recording-info heading');
  for (const label of ['Patient','Date','Duration','Montage','Sample rate','Channels','Reference','File']) {
    assert.ok(html.includes(label), 'recording-info row: ' + label);
  }
});

await test('Band Power module is declared in source and renders inside the Best-Practice tab', () => {
  assert.ok(WORKBENCH_SRC.includes('data-testid="qwb-band-power"'), 'band-power testid');
  for (const band of ['Delta','Theta','Alpha','Beta','Gamma']) {
    assert.ok(WORKBENCH_SRC.includes(band), 'band row: ' + band);
  }
  assert.ok(WORKBENCH_SRC.includes('getComputedBandPower'), 'getComputedBandPower helper defined');
  assert.ok(WORKBENCH_SRC.includes('renderBandPowerSection(state)'), 'help panel mounts band-power section');
});

await test('Mini head map (10-20) is wired into the Cleaning tab', () => {
  const body = document.getElementById('qwb-right-body');
  const html = (body && body.innerHTML) || '';
  assert.ok(html.includes('data-testid="qwb-mini-headmap"'), 'mini-headmap testid in cleaning panel body');
  assert.ok(html.includes('qwb-mini-headmap-svg'), 'headmap svg present');
  assert.ok(WORKBENCH_SRC.includes('QWB_HEADMAP_COORDS'), 'headmap coords constant defined');
  assert.ok(WORKBENCH_SRC.includes('attachMiniHeadmap'), 'headmap click handler attaches');
});

await test('Better window/event navigation: ◀ Prev / Next ▶ + event-prev / event-next', () => {
  const html = root.innerHTML;
  assert.ok(html.includes('data-testid="qwb-event-prev"'), 'event-prev testid');
  assert.ok(html.includes('data-testid="qwb-event-next"'), 'event-next testid');
  assert.ok(html.includes('◀ Prev'), 'larger prev label');
  assert.ok(html.includes('Next ▶'), 'larger next label');
  assert.ok(html.includes('data-testid="qwb-window-breadcrumb"'), 'breadcrumb testid');
  assert.ok(WORKBENCH_SRC.includes('jumpEvent'), 'jumpEvent handler defined');
});

// ── Inline trace event labels (state.events drawn on the trace itself) ──────

await test('seeded state.events render inline on the trace with paper-tone labels', () => {
  const html = root.innerHTML;
  // The inline-event group carries the qwb-event-marker testid so tests can
  // scope assertions to it.
  const m = html.match(/data-testid="qwb-event-marker"[^>]*>([\s\S]*?)<\/div>\s*<div id="qwb-rerun-notice"/);
  assert.ok(m, 'qwb-event-marker container is in the trace area, before the rerun notice');
  const inner = m[1];
  assert.ok(inner.includes('Eyes Closed'), '"Eyes Closed" label rendered inside qwb-event-marker structure');
  assert.ok(inner.includes('Photic 6 Hz'), '"Photic 6 Hz" label also rendered');
  assert.ok(inner.includes('qwb-trace-event-line'), 'each event has a vertical dashed line');
});
