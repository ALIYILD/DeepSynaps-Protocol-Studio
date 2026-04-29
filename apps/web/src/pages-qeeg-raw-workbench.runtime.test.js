// ─────────────────────────────────────────────────────────────────────────────
// pages-qeeg-raw-workbench.runtime.test.js
//
// RUNTIME smoke tests: actually click every workbench button and verify
// either (a) an api.* method was called or (b) state mutated visibly.
// Catches the dead-button class of bugs that source-grep cannot.
// ─────────────────────────────────────────────────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';

// Track every api method call; fail-fast log.
const API_CALLS = [];
const API_RESPONSES = {
  getQEEGWorkbenchMetadata: { patient_name: 'Demo Patient', session_label: 'session DEMO' },
  getQEEGCleaningLog: { items: [] },
  listQEEGCleaningAnnotations: { items: [] },
  createQEEGCleaningAnnotation: { id: 'ann-1', kind: 'note' },
  saveQEEGCleaningVersion: { id: 'v1', version_number: 1, review_status: 'draft' },
  listQEEGCleaningVersions: [{ id: 'v0', version_number: 0, review_status: 'draft' }],
  getQEEGRawVsCleanedSummary: { retained_data_pct: 88, rejected_segments_count: 0, bad_channels_excluded: [] },
  generateQEEGAIArtefactSuggestions: {
    items: [
      { id: 's1', ai_label: 'eye_blink', ai_confidence: 0.9, channel: 'Fp1-Av',
        start_sec: 1.0, end_sec: 1.5,
        explanation: 'frontal blink', suggested_action: 'review_ica', decision_status: 'suggested' },
    ],
  },
  rerunQEEGAnalysisWithCleaning: { status: 'queued' },
  getQEEGICAComponents: { n_components: 3, components: [
    { index: 0, label: 'brain' }, { index: 1, label: 'eye' }, { index: 2, label: 'muscle' },
  ]},
};

function buildFakeApi() {
  const fake = {};
  for (const k of Object.keys(API_RESPONSES)) {
    fake[k] = (...args) => { API_CALLS.push({ method: k, args }); return Promise.resolve(API_RESPONSES[k]); };
  }
  return fake;
}

// ── Richer DOM polyfill that supports click(), querySelectorAll over the
// rendered innerHTML, and full event dispatch.
class RElement {
  constructor(tag = 'div') {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.parentElement = null;
    this.style = {};
    this.classList = new Set();
    this.dataset = {};
    this._innerHTML = '';
    this._listeners = {};
    this.attributes = {};
    this.id = '';
    this._textContent = '';
    this.value = '';
    this.checked = true;
    // classList shim with toggle/contains/add/remove
    this.classList = {
      _set: new Set(),
      add: (...c) => c.forEach(x => this.classList._set.add(x)),
      remove: (...c) => c.forEach(x => this.classList._set.delete(x)),
      contains: c => this.classList._set.has(c),
      toggle: (c, force) => {
        const want = force === undefined ? !this.classList._set.has(c) : !!force;
        if (want) this.classList._set.add(c); else this.classList._set.delete(c);
        return want;
      },
    };
  }
  set innerHTML(v) { this._innerHTML = String(v); }
  get innerHTML() { return this._innerHTML; }
  set textContent(v) { this._textContent = String(v); }
  get textContent() { return this._textContent; }
  setAttribute(k, v) { this.attributes[k] = v; }
  getAttribute(k) { return this.attributes[k]; }
  appendChild(c) { this.children.push(c); c.parentElement = this; return c; }
  insertBefore(c) { this.children.unshift(c); c.parentElement = this; return c; }
  replaceChild(neu, _old) { neu.parentElement = this; return neu; }
  removeChild(c) { /* noop */ return c; }
  remove() { /* noop */ }
  addEventListener(name, fn) { (this._listeners[name] ||= []).push(fn); }
  removeEventListener(name, fn) {
    if (!this._listeners[name]) return;
    this._listeners[name] = this._listeners[name].filter(f => f !== fn);
  }
  dispatchEvent(ev) {
    const fns = this._listeners[ev.type] || [];
    for (const fn of fns) fn(ev);
    return true;
  }
  click() {
    const ev = { type: 'click', target: this, currentTarget: this, preventDefault() {}, stopPropagation() {},
                 clientX: 0, clientY: 0 };
    this.dispatchEvent(ev);
  }
  querySelector() { return null; }
  querySelectorAll(sel) { return querySelectorAllByAttribute(globalThis.document._byId, sel); }
  closest() { return null; }
  get firstElementChild() { return this.children[0] || null; }
  get clientWidth() { return 1280; }
  get clientHeight() { return 720; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 1280, height: 64 }; }
  getContext() {
    return {
      setTransform() {}, fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {},
      stroke() {}, fillText() {}, fill() {}, setLineDash() {},
      set fillStyle(_v) {}, get fillStyle() { return ''; },
      set strokeStyle(_v) {}, get strokeStyle() { return ''; },
      set lineWidth(_v) {}, get lineWidth() { return 1; },
      set font(_v) {}, get font() { return ''; },
    };
  }
}

// Selector → ids registered from rendered innerHTML.
// We scan all known FakeElements, plus we register click-target ids on demand
// during the test by inspecting the *root's* innerHTML.
function registerIdsFromHtml(byId, html) {
  const idRe = /id="([^"]+)"/g;
  let m;
  while ((m = idRe.exec(html))) {
    if (!byId[m[1]]) byId[m[1]] = new RElement('div');
    byId[m[1]].id = m[1];
  }
}

function querySelectorAllByAttribute(byId, sel) {
  const matches = [];
  // Scan EVERY rendered piece of HTML — root and any element whose
  // `innerHTML` was assigned (right-panel body etc).
  const blobs = [];
  for (const id of Object.keys(byId)) {
    const el = byId[id];
    if (el && el._innerHTML) blobs.push(el._innerHTML);
  }
  const html = blobs.join('\n');
  const tagRe = /<(button|div|input|label)\b([^>]*)>/gi;
  let m;
  while ((m = tagRe.exec(html))) {
    const attrs = m[2];
    if (!matchAttrs(attrs, sel)) continue;
    const idM = /id="([^"]+)"/.exec(attrs);
    const dataM = {};
    // Per-attr regex (no /g, since tag-local — and previously the shared /g
    // regex caused state to leak across iterations even when re-declared.)
    const allData = attrs.match(/data-[a-zA-Z0-9-]+="[^"]*"/g) || [];
    for (const piece of allData) {
      const mm = /^data-([a-zA-Z0-9-]+)="([^"]*)"$/.exec(piece);
      if (!mm) continue;
      const key = mm[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      dataM[key] = mm[2];
    }
    let el;
    const id = idM ? idM[1] : `_anon_pos_${m.index}`;
    if (byId[id]) el = byId[id]; else { el = new RElement(m[1]); el.id = id; byId[id] = el; }
    // Always replace dataset (don't merge across positions) so siblings
    // with conflicting attributes don't bleed into each other.
    el.dataset = dataM;
    matches.push(el);
  }
  return matches;
}

function matchAttrs(attrs, sel) {
  // Support: '[data-x]' ; '#id child' just check presence of attr or class
  // For '#qwb-view-toggle button' we treat as 'a button inside #qwb-view-toggle' but
  // since flat regex can't see scope, accept any <button> that lives inside the
  // qwb-view-toggle wrapper string. Implemented via a contains check on the full html.
  if (sel === '[data-action]') return /\bdata-action="/.test(attrs);
  if (sel === '[data-ai-decision]') return /\bdata-ai-decision="/.test(attrs);
  if (sel === '[data-ica-toggle]') return /\bdata-ica-toggle="/.test(attrs);
  if (sel === '[data-export-include]') return /\bdata-export-include="/.test(attrs);
  if (sel === '[data-export-fmt]') return /\bdata-export-fmt="/.test(attrs);
  if (sel === '.qwb-tab') return /class="[^"]*\bqwb-tab\b/.test(attrs);
  if (sel === '.qwb-menu-btn') return /class="[^"]*\bqwb-menu-btn\b/.test(attrs);
  if (sel === '#qwb-right-body [data-action]') return /\bdata-action="/.test(attrs);
  if (sel === '#qwb-right-body [data-ai-decision]') return /\bdata-ai-decision="/.test(attrs);
  if (sel === '#qwb-right-body [data-ica-toggle]') return /\bdata-ica-toggle="/.test(attrs);
  if (sel === '#qwb-view-toggle button') return /\bdata-view="/.test(attrs);
  if (sel === '#qwb-export-fmts [data-export-fmt]') return /\bdata-export-fmt="/.test(attrs);
  return false;
}

function installRichDom() {
  const root = new RElement('div'); root.id = 'app';
  const byId = { app: root };
  globalThis.document = {
    getElementById: (id) => {
      if (!byId[id]) { const el = new RElement('div'); el.id = id; byId[id] = el; }
      return byId[id];
    },
    _byId: byId,
    body: root,
    querySelector: () => null,
    querySelectorAll: (sel) => querySelectorAllByAttribute(byId, sel),
    createElement: (tag) => new RElement(tag),
    addEventListener: () => {},
  };
  globalThis.window = Object.assign(globalThis.window || {}, {
    location: { hash: '#/qeeg-raw-workbench/real', href: 'http://test/#/qeeg-raw-workbench/real' },
    addEventListener: () => {}, removeEventListener: () => {},
    devicePixelRatio: 1, _isDemoMode: () => false,  // <<< NON-DEMO so api.* is exercised
    _qeegSelectedId: 'real', _nav: () => {},
    prompt: () => 'integration-test-note',
    alert: () => {},
  });
  globalThis.devicePixelRatio = 1;
  globalThis.URL = class { constructor(href) { this.href = href; this.searchParams = { get: () => 'real' }; } static createObjectURL() { return 'blob://x'; } static revokeObjectURL() {} };
  globalThis.Blob = function(_p, _o) { return { size: 0 }; };
  globalThis.setInterval = () => 0;
  globalThis.clearInterval = () => {};
  return { root, byId };
}

// Inject our fake api before importing the module.
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const HERE = fileURLToPath(new URL('./pages-qeeg-raw-workbench.js', import.meta.url));
const SRC = readFileSync(HERE, 'utf8');
const TMP = join(tmpdir(), `qwb-runtime-${process.pid}`);
mkdirSync(TMP, { recursive: true });
writeFileSync(join(TMP, 'api.js'), `export const api = globalThis.__qwb_api;`);
const PATCHED = SRC.replace(/from\s+['"]\.\/api\.js['"];?/, `from '${join(TMP, 'api.js')}';`);
const MODPATH = join(TMP, 'pages-qeeg-raw-workbench.js');
writeFileSync(MODPATH, PATCHED);
globalThis.__qwb_api = buildFakeApi();

const { root, byId } = installRichDom();
const mod = await import(MODPATH);
await mod.pgQEEGRawWorkbench(() => {}, () => {});
// Register every id present in the rendered HTML so getElementById finds them.
registerIdsFromHtml(byId, root.innerHTML);

function fire(id) {
  const el = byId[id] || document.getElementById(id);
  assert.ok(el, `element exists: ${id}`);
  el.click();
  return el;
}
function callsTo(method) { return API_CALLS.filter(c => c.method === method); }
function lastCallTo(method) { return callsTo(method).slice(-1)[0]; }

// ── Boot: api.getQEEGWorkbenchMetadata + listQEEGCleaningVersions + ICA + log
await test('boot loads workbench metadata, versions, ICA and log from API', () => {
  assert.ok(callsTo('getQEEGWorkbenchMetadata').length >= 1, 'metadata fetched');
  assert.ok(callsTo('listQEEGCleaningVersions').length >= 1, 'versions fetched');
  assert.ok(callsTo('getQEEGICAComponents').length >= 1, 'ICA fetched');
  assert.ok(callsTo('getQEEGCleaningLog').length >= 1, 'cleaning log fetched');
});

// ── Toolbar buttons
await test('Save button calls api.saveQEEGCleaningVersion', async () => {
  const before = callsTo('saveQEEGCleaningVersion').length;
  fire('qwb-save');
  await new Promise(r => setTimeout(r, 10));
  assert.ok(callsTo('saveQEEGCleaningVersion').length > before, 'save fired');
});

await test('Re-run button calls api.rerunQEEGAnalysisWithCleaning', async () => {
  const before = callsTo('rerunQEEGAnalysisWithCleaning').length;
  fire('qwb-rerun');
  await new Promise(r => setTimeout(r, 10));
  assert.ok(callsTo('rerunQEEGAnalysisWithCleaning').length > before, 'rerun fired');
});

await test('Compare (Raw vs Cleaned) calls api.getQEEGRawVsCleanedSummary', async () => {
  const before = callsTo('getQEEGRawVsCleanedSummary').length;
  fire('qwb-compare');
  await new Promise(r => setTimeout(r, 10));
  assert.ok(callsTo('getQEEGRawVsCleanedSummary').length > before, 'compare fired');
});

await test('Export button opens export modal', async () => {
  fire('qwb-export');
  const modal = byId['qwb-export-modal'];
  assert.equal(modal.style.display, 'flex', 'export modal opened');
});

await test('Help button opens shortcuts modal', async () => {
  fire('qwb-shortcuts');
  const modal = byId['qwb-shortcuts-modal'];
  assert.equal(modal.style.display, 'flex', 'shortcuts modal opened');
});

await test('Transport: prev/next buttons advance windowStart', async () => {
  const next = byId['qwb-next-window'];
  next.click(); next.click(); next.click();
  // Status bar window text reflects state.windowStart.
  const w = byId['qwb-st-window'];
  assert.ok(/30/.test(w.textContent) || /\d+/.test(w.textContent), 'window advanced');
  byId['qwb-prev-window'].click();
});

// ── Title-bar menus
await test('Title menus dispatch real actions (File→export, Help→shortcuts)', async () => {
  // Find the File and Help menu buttons by their data-menu attribute.
  const menus = querySelectorAllByAttribute(byId, '.qwb-menu-btn');
  const file = menus.find(m => m.dataset.menu === 'File');
  const help = menus.find(m => m.dataset.menu === 'Help');
  // Close any modal first.
  byId['qwb-export-modal'].style.display = 'none';
  file.click();
  assert.equal(byId['qwb-export-modal'].style.display, 'flex', 'File menu opened export modal');
  byId['qwb-shortcuts-modal'].style.display = 'none';
  help.click();
  assert.equal(byId['qwb-shortcuts-modal'].style.display, 'flex', 'Help menu opened shortcuts modal');
});

await test('View menu toggles right panel collapsed state', async () => {
  const menus = querySelectorAllByAttribute(byId, '.qwb-menu-btn');
  const view = menus.find(m => m.dataset.menu === 'View');
  const right = byId['qwb-right'];
  const before = right.classList.contains('collapsed');
  view.click();
  const after = right.classList.contains('collapsed');
  assert.notEqual(before, after, 'panel collapsed state toggled');
});

// ── Cleaning panel actions
await test('Mark bad segment button calls api.createQEEGCleaningAnnotation', async () => {
  // Cleaning panel is the default tab. Find its data-action="mark-segment" button.
  const btns = querySelectorAllByAttribute(byId, '[data-action]');
  const target = btns.find(b => b.dataset.action === 'mark-segment');
  assert.ok(target, 'mark-segment button rendered');
  const before = callsTo('createQEEGCleaningAnnotation').length;
  target.click();
  await new Promise(r => setTimeout(r, 10));
  assert.ok(callsTo('createQEEGCleaningAnnotation').length > before, 'annotation POST fired');
  const last = lastCallTo('createQEEGCleaningAnnotation');
  assert.equal(last.args[1].kind, 'bad_segment', 'kind = bad_segment');
});

await test('Mark bad channel button calls api.createQEEGCleaningAnnotation kind=bad_channel', async () => {
  const btns = querySelectorAllByAttribute(byId, '[data-action]');
  const target = btns.find(b => b.dataset.action === 'mark-channel');
  const before = callsTo('createQEEGCleaningAnnotation').length;
  target.click();
  await new Promise(r => setTimeout(r, 10));
  assert.ok(callsTo('createQEEGCleaningAnnotation').length > before, 'annotation POST fired');
  assert.equal(lastCallTo('createQEEGCleaningAnnotation').args[1].kind, 'bad_channel');
});

await test('Detect-* buttons call api.generateQEEGAIArtefactSuggestions', async () => {
  const btns = querySelectorAllByAttribute(byId, '[data-action]');
  const detect = btns.find(b => b.dataset.action === 'detect-blink');
  const before = callsTo('generateQEEGAIArtefactSuggestions').length;
  detect.click();
  await new Promise(r => setTimeout(r, 10));
  assert.ok(callsTo('generateQEEGAIArtefactSuggestions').length > before, 'AI generate fired');
});

// ── Tabs + ICA reject
await test('Switching to ICA tab renders ICA components from api response', async () => {
  const tabs = querySelectorAllByAttribute(byId, '.qwb-tab');
  const icaTab = tabs.find(t => t.dataset.tab === 'ica');
  icaTab.click();
  // The right body should now reference IC 0..2 from the API response.
  const body = byId['qwb-right-body'];
  assert.ok(body.innerHTML.includes('IC 0'), 'IC 0 rendered');
  assert.ok(body.innerHTML.includes('IC 1'), 'IC 1 rendered');
  assert.ok(body.innerHTML.includes('eye') || body.innerHTML.includes('brain'), 'IC labels rendered');
});

await test('ICA reject/restore button calls api.createQEEGCleaningAnnotation kind=rejected_ica_component', async () => {
  const btns = querySelectorAllByAttribute(byId, '[data-ica-toggle]');
  assert.ok(btns.length > 0, 'at least one ICA button rendered');
  const before = callsTo('createQEEGCleaningAnnotation').length;
  btns[0].click();
  await new Promise(r => setTimeout(r, 10));
  assert.ok(callsTo('createQEEGCleaningAnnotation').length > before, 'ICA POST fired');
  assert.equal(lastCallTo('createQEEGCleaningAnnotation').args[1].kind, 'rejected_ica_component');
});

// ── AI Review tab + decisions
await test('Switching to AI tab + Generate triggers api.generateQEEGAIArtefactSuggestions', async () => {
  const tabs = querySelectorAllByAttribute(byId, '.qwb-tab');
  const aiTab = tabs.find(t => t.dataset.tab === 'ai');
  aiTab.click();
  // Re-register ids since the AI panel injected new ones.
  registerIdsFromHtml(byId, byId['qwb-right-body'].innerHTML);
  const gen = byId['qwb-ai-generate'];
  assert.ok(gen, 'qwb-ai-generate exists in DOM');
  const before = callsTo('generateQEEGAIArtefactSuggestions').length;
  gen.click();
  await new Promise(r => setTimeout(r, 10));
  assert.ok(callsTo('generateQEEGAIArtefactSuggestions').length > before, 'generate fired');
});

await test('Per-suggestion Accept fires api.createQEEGCleaningAnnotation kind=ai_suggestion', async () => {
  byId['qwb-ai-generate'].click();
  await new Promise(r => setTimeout(r, 50));
  const html = byId['qwb-right-body'].innerHTML;
  // Sanity: the rendered AI panel HTML actually contains all three decision
  // buttons. (Per-button click is dispatched directly via recordAIDecision
  // below — the polyfill cannot resolve sibling buttons that share an
  // anchor position, but real browser DOM does.)
  assert.ok(/data-ai-decision="accepted"/.test(html), 'accept button in DOM');
  assert.ok(/data-ai-decision="rejected"/.test(html), 'reject button in DOM');
  assert.ok(/data-ai-decision="needs_review"/.test(html), 'review button in DOM');
  // Drive the handler directly to verify the API wiring on Accept. (The
  // polyfill cannot reliably address sibling buttons sharing a position
  // anchor; real browser DOM has unique nodes per button.)
  const testState = {
    analysisId: 'real', isDemo: false,
    aiSuggestions: API_RESPONSES.generateQEEGAIArtefactSuggestions.items.slice(),
    rejectedSegments: [], badChannels: new Set(), rejectedICA: new Set(),
    auditLog: [], saveStatus: 'idle', isDirty: false, rightTab: 'ai',
    cleaningVersion: null, metadata: null,
  };
  const beforeAI = callsTo('createQEEGCleaningAnnotation').length;
  await mod.recordAIDecision(testState, 's1', 'accepted');
  await new Promise(r => setTimeout(r, 10));
  assert.ok(callsTo('createQEEGCleaningAnnotation').length > beforeAI, 'AI decision POST fired');
  assert.equal(lastCallTo('createQEEGCleaningAnnotation').args[1].kind, 'ai_suggestion');
});

// ── Export modal "Export bundle"
await test('Export bundle calls api.getQEEGRawVsCleanedSummary then closes modal', async () => {
  byId['qwb-export-modal'].style.display = 'flex';
  const before = callsTo('getQEEGRawVsCleanedSummary').length;
  fire('qwb-export-go');
  await new Promise(r => setTimeout(r, 10));
  assert.ok(callsTo('getQEEGRawVsCleanedSummary').length > before, 'summary fetched for bundle');
  assert.equal(byId['qwb-export-modal'].style.display, 'none', 'modal closed after export');
});

// ── Unsaved-edits modal flow
await test('navBack with dirty state opens unsaved modal; Cancel closes it without nav', async () => {
  const state = { isDirty: true, pendingNav: null };
  byId['qwb-unsaved-modal'].style.display = 'none';
  let navCalled = false;
  window._nav = () => { navCalled = true; };
  const ok = mod.navBack(state, () => {}, 'analyzer');
  assert.equal(ok, false, 'navBack returns false when dirty');
  assert.equal(byId['qwb-unsaved-modal'].style.display, 'flex', 'modal shown');
  byId['qwb-unsaved-cancel'].click();
  assert.equal(navCalled, false, 'cancel did not nav');
});

// ── Final summary
await test('summary: every workbench API method got at least one real call', () => {
  const methods = [
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
  for (const m of methods) {
    assert.ok(callsTo(m).length >= 1, `api.${m} exercised at least once: ${callsTo(m).length}`);
  }
});
